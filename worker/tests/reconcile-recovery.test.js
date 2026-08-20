import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('Dashboard reconcile stale identity recovery', () => {
  it('contains slug identity recovery and bounded D1 diagnostics', () => {
    const source = read('src/dashboard-state.js');
    expect(source).toContain('SELECT id,active FROM frezen_key_services WHERE owner_id=?1 AND slug=?2');
    expect(source).toContain('canonicalId = bySlug.id');
    expect(source).toContain('Database reconciliation failed');
  });
});
