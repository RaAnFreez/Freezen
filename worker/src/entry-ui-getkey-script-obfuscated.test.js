import { describe, expect, it } from 'vitest';
import { normalizeLuaRuntimeCompatibility } from './entry-ui-getkey-script-obfuscated.js';

describe('Lua runtime compatibility normalization', () => {
  it('replaces the binary xor expression emitted by Advanced v1.1', () => {
    const source = 'local s="";for i=1,#t do s=s..string.char(t[i]~(((k+i-1)%255)+1))end;return s';
    const normalized = normalizeLuaRuntimeCompatibility(source);
    expect(normalized).not.toContain('t[i]~(((k+i-1)%255)+1)');
    expect(normalized).toContain('bit32 and bit32.bxor');
    expect(normalized).toContain('while a>0 or b>0 do');
    expect(normalized).toContain('string.char((function(a,b)');
  });

  it('leaves unrelated Lua code untouched', () => {
    const source = 'local value = 1; return value';
    expect(normalizeLuaRuntimeCompatibility(source)).toBe(source);
  });
});
