import { describe, expect, it } from 'vitest';
import { bindHwidV2, validateHwidV2, setHwidStatusV2, resetHwidV2 } from '../src/security/hwid-v2.js';

describe('HWID state controls', () => {
  it('exports all HWID state operations', () => {
    expect(typeof bindHwidV2).toBe('function');
    expect(typeof validateHwidV2).toBe('function');
    expect(typeof setHwidStatusV2).toBe('function');
    expect(typeof resetHwidV2).toBe('function');
  });
});
