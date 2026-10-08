import { describe, expect, it } from 'vitest';
import { compileFrezenVmV2, FREZEN_VM_V2_PROFILE, isFrezenVmV2 } from './frezen-vm-v2.js';
import { OBFUSCATION_WATERMARK } from './script-obfuscation-contract.js';

describe('Frezen VM v2', () => {
  it('exposes the printable layered VM profile', () => {
    expect(FREZEN_VM_V2_PROFILE.version).toBe('2.0');
    expect(FREZEN_VM_V2_PROFILE.bytecode).toBe(true);
    expect(FREZEN_VM_V2_PROFILE.runtimeVm).toBe(true);
    expect(FREZEN_VM_V2_PROFILE.sourceCompatible).toBe(true);
    expect(FREZEN_VM_V2_PROFILE.transform).toBe('layered-base64-alphabet-chunks');
  });

  it('generates printable payloads without checksum or string.byte runtime validation', () => {
    const result = compileFrezenVmV2('local url = "https://example.com/test"\nprint(url)');
    expect(result.code.startsWith(OBFUSCATION_WATERMARK + '\n')).toBe(true);
    expect(result.code).not.toContain('https://example.com/test');
    expect(result.code).toContain('string.find');
    expect(result.code).toContain('string.char');
    expect(result.code).toContain('loadstring or load');
    expect(result.code).not.toContain('string.byte');
    expect(result.code).not.toContain('FREZEN_VM_PAYLOAD_CORRUPTED_SUM');
    expect(result.code).not.toContain('FREZEN_VM_PAYLOAD_CORRUPTED_LEN');
    expect(result.code).not.toContain('#{');
    expect(result.code).toContain("out[#out+1]");
    expect(result.code).toMatch(/\]\={"[^"]+",\d+,\d+,\d+,\d+,\d+,"[^"]+"}/);
    expect(isFrezenVmV2(result.code)).toBe(true);
  });

  it('hides source literals and creates multiple chunks', () => {
    const result = compileFrezenVmV2('local secret = "FrezenSecret"\nreturn secret', { chunkSize: 24 });
    expect(result.chunkCount).toBeGreaterThan(1);
    expect(result.code).not.toContain('FrezenSecret');
  });

  it('rejects empty and oversized input', () => {
    expect(() => compileFrezenVmV2('   ')).toThrow('EMPTY_LUA_SOURCE');
    expect(() => compileFrezenVmV2('x'.repeat(3 * 1024 * 1024 + 1))).toThrow('LUA_SOURCE_TOO_LARGE');
  });
});
