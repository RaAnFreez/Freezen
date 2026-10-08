import { describe, expect, it } from 'vitest';
import { compileFrezenVm, FREZEN_VM_PROFILE, isFrezenVm } from './frezen-vm-v1.js';
import { OBFUSCATION_WATERMARK } from './script-obfuscation-contract.js';

describe('Frezen VM v1', () => {
  it('exposes the expected VM profile', () => {
    expect(FREZEN_VM_PROFILE.version).toBe('1.0');
    expect(FREZEN_VM_PROFILE.bytecode).toBe(true);
    expect(FREZEN_VM_PROFILE.runtimeVm).toBe(true);
    expect(FREZEN_VM_PROFILE.sourceCompatible).toBe(true);
    expect(FREZEN_VM_PROFILE.transform).toBe('double-affine-bytecode-chunks');
  });

  it('keeps the Frezen watermark as the only watermark header', () => {
    const result = compileFrezenVm('local url = "https://example.com/test"\nprint(url)');
    expect(result.code.startsWith(OBFUSCATION_WATERMARK + '\n')).toBe(true);
    expect(result.code.split(OBFUSCATION_WATERMARK).length - 1).toBe(1);
    expect(result.code).not.toContain('https://example.com/test');
    expect(result.code).toContain('while true do');
    expect(result.code).toContain('string.char');
    expect(result.code).not.toContain('string.byte');
    expect(result.code).toContain('loadstring or load');
    expect(result.code).toContain('FREZEN_VM_PAYLOAD_CORRUPTED_LEN');
    expect(result.code).toContain('%65521');
    expect(result.code).toContain('local __frezen_rsum');
    expect(result.code).toContain('local __frezen_rlen=0');
    expect(result.code).toContain('FREZEN_VM_PAYLOAD_CORRUPTED_SUM');
    expect(result.code).not.toContain(']=["');
    expect(result.code).toMatch(/\]\=\{\d+,\d+,\d+/);
    expect(isFrezenVm(result.code)).toBe(true);
  });

  it('uses encoded chunks and randomized instruction identifiers', () => {
    const result = compileFrezenVm('local secret = "FrezenSecret"\nreturn secret', { chunkSize: 24 });
    expect(result.chunkCount).toBeGreaterThan(1);
    expect(result.code).not.toContain('FrezenSecret');
    expect(result.code).toMatch(/\]\=\{\d+(?:,\d+){5,}\}/);
    expect(result.code).toMatch(/local __frezen_v[pi]/);
  });

  it('rejects empty and oversized input', () => {
    expect(() => compileFrezenVm('   ')).toThrow('EMPTY_LUA_SOURCE');
    expect(() => compileFrezenVm('x'.repeat(3 * 1024 * 1024 + 1))).toThrow('LUA_SOURCE_TOO_LARGE');
  });
});
