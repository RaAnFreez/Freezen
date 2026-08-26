import { describe, expect, it } from 'vitest';
import { ADVANCED_V11_PROFILE, obfuscateLuaV11, isAdvancedV11Obfuscated } from './script-obfuscator-v11.js';

describe('Advanced Techniques v1.1 compatibility-first obfuscation', () => {
  it('keeps the configured maximum protection profile', () => {
    expect(ADVANCED_V11_PROFILE.version).toBe('1.1');
    expect(ADVANCED_V11_PROFILE.mode).toBe('Advanced Techniques');
    expect(ADVANCED_V11_PROFILE.strength).toBe('VERY_HIGH');
    expect(ADVANCED_V11_PROFILE.protectionLevel).toBe(100);
  });

  it('encodes strings and removes comments without binary XOR syntax', () => {
    const source = '-- source comment\nlocal secret = "FrezenProtected"\nprint(secret)';
    const result = obfuscateLuaV11(source);
    expect(result.code).not.toContain('FrezenProtected');
    expect(result.code).not.toContain('-- source comment');
    expect(result.code).toContain('string.char');
    expect(result.code).not.toContain('t[i]~');
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

  it('handles long bracket strings', () => {
    const result = obfuscateLuaV11('local s=[=[hello ]=] world]=]');
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
