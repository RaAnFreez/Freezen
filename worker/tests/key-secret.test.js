import { describe, expect, it } from 'vitest';
import { decryptKeySecret, encryptKeySecret } from '../src/key-secret.js';

describe('encrypted key secrets', () => {
  it('encrypts and decrypts without storing plaintext', async () => {
    const secret = 'test-master-secret-that-is-long-enough';
    const plaintext = 'FREZEN-ABCD-1234-EF56-7890';
    const ciphertext = await encryptKeySecret(secret, plaintext);

    expect(ciphertext).toMatch(/^v1\.[A-Za-z0-9+/]+=*\.[A-Za-z0-9+/]+=*$/);
    expect(ciphertext).not.toContain(plaintext);
    await expect(decryptKeySecret(secret, ciphertext)).resolves.toBe(plaintext);
  });

  it('does not decrypt with a different master secret', async () => {
    const ciphertext = await encryptKeySecret('master-one', 'FREZEN-TEST-KEY');
    await expect(decryptKeySecret('master-two', ciphertext)).rejects.toBeTruthy();
  });
});
