import { describe, expect, it } from 'vitest';
import { ADVANCED_V11_PROFILE } from './script-obfuscator-v11.js';

describe('script obfuscation contract', () => {
  it('pins the required production profile', () => {
    expect({
      version: ADVANCED_V11_PROFILE.version,
      mode: ADVANCED_V11_PROFILE.mode,
      strength: ADVANCED_V11_PROFILE.strength,
      protectionLevel: ADVANCED_V11_PROFILE.protectionLevel,
      algorithm: ADVANCED_V11_PROFILE.encryptionAlgorithm,
    }).toEqual({
      version: '1.1',
      mode: 'Advanced Techniques',
      strength: 'VERY_HIGH',
      protectionLevel: 100,
      algorithm: 'xor',
    });
  });
});
