import { describe, expect, it } from 'vitest';
import { ADVANCED_V11_PROFILE, obfuscateLuaV11, isAdvancedV11Obfuscated } from './script-obfuscator-v11.js';

describe('Advanced Techniques v1.1 Very High obfuscation', () => {
  it('uses the fixed maximum protection profile', () => {
    expect(ADVANCED_V11_PROFILE.version).toBe('1.1');
    expect(ADVANCED_V11_PROFILE.mode).toBe('Advanced Techniques');
    expect(ADVANCED_V11_PROFILE.strength).toBe('VERY_HIGH');
    expect(ADVANCED_V11_PROFILE.protectionLevel).toBe(100);
    expect(ADVANCED_V11_PROFILE.mangleNames).toBe(true);
    expect(ADVANCED_V11_PROFILE.encodeStrings).toBe(true);
    expect(ADVANCED_V11_PROFILE.encodeNumbers).toBe(true);
    expect(ADVANCED_V11_PROFILE.controlFlow).toBe(true);
    expect(ADVANCED_V11_PROFILE.controlFlowFlattening).toBe(true);
    expect(ADVANCED_V11_PROFILE.deadCodeInjection).toBe(true);
    expect(ADVANCED_V11_PROFILE.antiDebugging).toBe(true);
    expect(ADVANCED_V11_PROFILE.minify).toBe(true);
  });

  it('replaces strings and numbers and removes comments', () => {
    const source = `-- source comment\nlocal secret = "FrezenProtected"\nlocal count = 1234\nprint(secret, count)`;
    const result = obfuscateLuaV11(source);
    expect(result.code).not.toContain('FrezenProtected');
    expect(result.code).not.toContain('-- source comment');
    expect(result.code).toContain('string.char');
    expect(result.code).toContain('Debug library detected');
    expect(result.code).not.toEqual(source);
    expect(result.outputBytes).toBeGreaterThan(0);
    expect(isAdvancedV11Obfuscated(result.code)).toBe(true);
  });

  it('applies control-flow protection without leaving the plain condition form', () => {
    const result = obfuscateLuaV11(`local x = 8\nif x > 3 then\n  print("ok")\nend`);
    expect(result.code).toContain('and true or false');
  });

  it('preserves unsafe flow constructs instead of wrapping them in a state machine', () => {
    const result = obfuscateLuaV11(`for i=1,3 do\n  if i == 2 then break end\nend`);
    expect(result.code).toContain('for');
    expect(result.code).toContain('break');
  });

  it('accepts a source payload larger than the former 512 KiB ceiling', () => {
    const source = `local s = "x"\n${'--padding\n'.repeat(70_000)}print(s)`;
    const result = obfuscateLuaV11(source);
    expect(result.sourceBytes).toBeGreaterThan(512 * 1024);
    expect(result.sourceBytes).toBeLessThanOrEqual(3 * 1024 * 1024);
    expect(result.outputBytes).toBeLessThanOrEqual(3 * 1024 * 1024);
    expect(isAdvancedV11Obfuscated(result.code)).toBe(true);
  });
});
