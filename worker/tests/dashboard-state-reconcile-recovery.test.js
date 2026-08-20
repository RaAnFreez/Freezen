import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('Dashboard state reconcile recovery', () => {
  it('reuses an existing service identity when a stale local id collides with an existing slug', () => {
    const source = read('src/dashboard-state.js');
    expect(source).toContain('SELECT id,active FROM frezen_key_services WHERE owner_id=?1 AND slug=?2');
    expect(source).toContain('const bySlug = await env.DB.prepare');
    expect(source).toContain('canonicalId = bySlug.id');
  });

  it('returns a bounded database diagnostic instead of hiding the D1 error', () => {
    const source = read('src/dashboard-state.js');
    expect(source).toContain("message:String(error?.message || 'Database reconciliation failed').slice(0,300)");
  });
});
