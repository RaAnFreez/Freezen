import { describe, expect, it } from 'vitest';
import { bindHwidV2, validateHwidV2, setHwidStatusV2, resetHwidV2 } from '../src/security/hwid-v2.js';

describe('HWID controls', () => {
  it('exposes bind, validate, block/unblock, and reset operations', () => {
    expect(bindHwidV2).toBeTypeOf('function');
    expect(validateHwidV2).toBeTypeOf('function');
    expect(setHwidStatusV2).toBeTypeOf('function');
    expect(resetHwidV2).toBeTypeOf('function');
  });
});
