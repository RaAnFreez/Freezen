import { describe, expect, it } from 'vitest';
import { ADVANCED_V11_PROFILE, obfuscateLuaV11, isAdvancedV11Obfuscated } from './script-obfuscator-v11.js';
import { isFrezenObfuscated } from './script-obfuscation-contract.js';

describe('Maximum multi-layer compatibility-first obfuscation', () => {
  it('keeps the configured maximum protection profile', () => {
    expect(ADVANCED_V11_PROFILE.version).toBe('1.3');
    expect(ADVANCED_V11_PROFILE.mode).toBe('Maximum Multi-Layer String Pool');
    expect(ADVANCED_V11_PROFILE.strength).toBe('VERY_HIGH');
    expect(ADVANCED_V11_PROFILE.protectionLevel).toBe(100);
    expect(ADVANCED_V11_PROFILE.encryptionAlgorithm).toBe('multi-layer-pool-permutation');
    expect(ADVANCED_V11_PROFILE.stringPool).toBe(true);
    expect(ADVANCED_V11_PROFILE.numericVariations).toBe(true);
    expect(ADVANCED_V11_PROFILE.stringLayers).toBe(5);
  });

  it('encodes strings and removes comments without binary XOR syntax', () => {
    const source = '-- source comment\nlocal secret = "FrezenProtected"\nprint(secret)';
    const result = obfuscateLuaV11(source);
    expect(result.code).not.toContain('FrezenProtected');
    expect(result.code).not.toContain('-- source comment');
    expect(result.code).toContain('string.char');
    expect(result.code).not.toContain('t[i]~');
    expect(result.code).toContain('string.byte');
    expect(result.code).toContain('local __frezen_sp');
    expect(result.code).toContain('local __frezen_sd');
    expect(result.code).toContain('-- This file obfuscation with Frezen Obfuscation');
    expect((result.code.match(/-- This file obfuscation with Frezen Obfuscation/g) || []).length).toBe(1);
    expect(result.code).not.toContain('-- FREZEN_OBFUSCATION: ADVANCED_V11|VERY_HIGH|100|XOR');
    expect(result.code.startsWith('-- This file obfuscation with Frezen Obfuscation\n')).toBe(true);
    expect(result.code).not.toContain('MAXIMUM_MULTI_LAYER|1.2|3');
    expect(result.code).toMatch(/\\\d{3}/);
    expect(isAdvancedV11Obfuscated(result.code)).toBe(true);
  });

  it('does not rewrite control flow for ordinary conditions', () => {
    const result = obfuscateLuaV11('local x = 8\nif x > 3 then\n print("ok")\nend');
    expect(result.code).toContain('if');
    expect(result.code).toContain('then');
    expect(result.code).not.toContain('and true or false');
  });

  it('uses compatibility mode for runtime-sensitive Lua features', () => {
    const source = 'local marker = "compatibility"\nlocal function make(value)\n local t=setmetatable({}, { __index=value })\n return t\nend\nreturn make(3)';
    const result = obfuscateLuaV11(source);
    expect(result.compatibilityMode).toBe(true);
    expect(result.code).toContain('setmetatable');
    expect(result.code).toContain('__index');
    expect(result.code).toContain('string.char');
    expect(result.code).not.toContain('compatibility');
  });

  it('preserves loops and break statements', () => {
    const result = obfuscateLuaV11('for i=1,3 do\n if i == 2 then break end\nend');
    expect(result.code).toContain('for');
    expect(result.code).toContain('break');
  });

  it('handles long bracket strings with nested delimiter text', () => {
    const result = obfuscateLuaV11('local s=[==[hello ]=] world]==]');
    expect(result.code).toContain('string.char');
  });

  it('supports the existing 3 MiB source limit', () => {
    const source = `local s = "x"\n${'--padding\n'.repeat(70000)}print(s)`;
    const result = obfuscateLuaV11(source);
    expect(result.sourceBytes).toBeGreaterThan(512 * 1024);
    expect(result.sourceBytes).toBeLessThanOrEqual(3 * 1024 * 1024);
    expect(result.outputBytes).toBeLessThanOrEqual(3 * 1024 * 1024);
  });
});


describe('Frezen obfuscation marker detection', () => {
  it('only treats an actual payload header as obfuscated', () => {
    const plain = "local text = '-- This file obfuscation with Frezen Obfuscation'\nprint(text)";
    expect(isFrezenObfuscated(plain)).toBe(false);
    expect(isFrezenObfuscated("  \n-- This file obfuscation with Frezen Obfuscation\nlocal x=1")).toBe(true);
    expect(isFrezenObfuscated("\uFEFF-- FREZEN_OBFUSCATION: ADVANCED_V11|VERY_HIGH|100|XOR\nlocal x=1")).toBe(true);
  });
});


describe('Lua 5.1 generated-output compatibility', () => {
  it('uses only Lua 5.1-compatible constructs for its generated protection layers', () => {
    const result = obfuscateLuaV11('local message = "Hello"\nlocal amount = 42\nprint(message, amount)');
    expect(result.code).toContain('string.char');
    expect(result.code).toContain('%');
    expect(result.code).not.toContain('t[i]~');
    expect(result.code).not.toContain('<<');
    expect(result.code).not.toContain('>>');
  });
});


describe('renderer lexical boundaries', () => {
  it('separates Lua keywords from generated pooled string calls', () => {
    const source = 'local ready = true\nif ready and "Frezen" then print("Frezen") end';
    const result = obfuscateLuaV11(source);
    expect(result.code).not.toContain('and__frezen_sd');
    expect(result.code).toContain('and(__frezen_sd');
  });
});

describe('renderer keyword-to-number boundaries', () => {
  it('keeps compatibility-mode keyword + number expressions separated', () => {
    const source = 'local fn = loadstring("return 1")\nlocal value = fn and 6 or 0\nif value then return 5 end';
    const result = obfuscateLuaV11(source);
    expect(result.compatibilityMode).toBe(true);
    expect(result.code).not.toContain('and6');
    expect(result.code).not.toContain('or0');
    expect(result.code).not.toContain('return5');
    expect(result.code).toContain('and 6 or 0');
    expect(result.code).toContain('return 5');
  });
});

describe('pooled string expressions in shorthand calls', () => {
  it('keeps function-call shorthand syntax valid', () => {
    const source = 'local a = require "ModuleName"\nprint "Hello"\nlocal b = game:GetService "Players"';
    const result = obfuscateLuaV11(source);
    expect(result.code).not.toContain('require __frezen_sd');
    expect(result.code).not.toContain('print __frezen_sd');
    expect(result.code).not.toContain(':GetService __frezen_sd');
    expect(result.code).toContain('require(__frezen_sd');
    expect(result.code).toContain('print(__frezen_sd');
    expect(result.code).toContain(':GetService(__frezen_sd');
  });
});

describe('randomized string pool', () => {
  it('deduplicates repeated strings while hiding plaintext and varying the pool', () => {
    const source = 'local first = "https://example.com"\nlocal second = "https://example.com"\nprint(first, second)';
    const result = obfuscateLuaV11(source);
    expect(result.code).not.toContain('https://example.com');
    expect(result.code).toContain('local __frezen_sp');
    expect(result.code).toContain('local __frezen_sd');
    expect(result.code).toContain('string.byte');
    expect(result.code).toMatch(/\\\d{3}/);
    expect(result.code).toMatch(/\[[0-9()\-+ ]+\]=\{/);
  });
});
