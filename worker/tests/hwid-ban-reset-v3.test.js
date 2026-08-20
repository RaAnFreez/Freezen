import { describe, expect, it } from 'vitest';
import * as hwid from '../src/security/hwid-v2.js';

describe('HWID ban/reset contract', () => {
  it('exposes the required server-side state controls', () => {
    expect(typeof hwid.bindHwidV2).toBe('function');
    expect(typeof hwid.validateHwidV2).toBe('function');
    expect(typeof hwid.setHwidStatusV2).toBe('function');
    expect(typeof hwid.resetHwidV2).toBe('function');
  });
});
