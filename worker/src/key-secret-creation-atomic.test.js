import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, 'key-control.js'), 'utf8');

describe('dashboard key secure recovery contract', () => {
  it('requires encrypted key recovery before createKey returns success', () => {
    expect(source).toContain("import { persistKeySecret } from './key-secret.js';");
    expect(source).toContain('const secretResult = await persistKeySecret(env, recordId, licenseKey);');
    expect(source).toContain("throw new Error(`KEY_SECRET_PERSISTENCE_FAILED:");
    expect(source).toContain("KEY_SECRET_PERSISTENCE_REQUIRED");
    expect(source).toContain("DELETE FROM frezen_key_records WHERE id = ?1");
    expect(source).toContain("DELETE FROM licenses WHERE id = ?1 AND user_id IS NULL");
  });
});
