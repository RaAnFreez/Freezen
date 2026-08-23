export const MAX_LUA_BYTES = 3 * 1024 * 1024;

export const OBFUSCATION_MARKER = '-- FREZEN_OBFUSCATION: ADVANCED_V11|VERY_HIGH|100|XOR';

export const OBFUSCATION_PROFILE = Object.freeze({
  version: '1.1',
  mode: 'Advanced Techniques',
  strength: 'VERY_HIGH',
  protectionLevel: 100,
  algorithm: 'xor',
});

export function isFrezenObfuscated(value) {
  return String(value ?? '').includes(OBFUSCATION_MARKER);
}
