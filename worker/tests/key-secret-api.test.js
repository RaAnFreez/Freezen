import { describe, expect, it } from 'vitest';

const readModule = async () => import('../src/key-secret.js');

describe('key secret API helpers', () => {
  it('exports the encrypted secret helpers used by the owner-only key endpoint', async () => {
    const module = await readModule();
    expect(typeof module.encryptKeySecret).toBe('function');
    expect(typeof module.decryptKeySecret).toBe('function');
    expect(typeof module.persistKeySecret).toBe('function');
    expect(typeof module.revealKeySecret).toBe('function');
  });
});
