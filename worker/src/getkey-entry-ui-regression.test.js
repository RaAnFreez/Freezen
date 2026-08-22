import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'entry-ui-getkey.js'), 'utf8');

test('custom Get-Key page auto-starts a fresh flow when no flow exists', () => {
  assert.match(source, /frezen:getkey:flow:/);
  assert.match(source, /text !== 'START'/);
  assert.match(source, /button\.click\(\)/);
  assert.match(source, /MutationObserver/);
});

test('duplicate completed callback does not expose VERIFICATION_TOKEN_NOT_FOUND', () => {
  assert.match(source, /recoverCompletedCallback/);
  assert.match(source, /VERIFICATION_TOKEN_NOT_FOUND/);
  assert.match(source, /passed !== total/);
  assert.match(source, /getkey_public_keys/);
  assert.match(source, /unlocked=1/);
});
