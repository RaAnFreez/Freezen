import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('Provider Get-Key checkpoint selector', () => {
  it('binds the Getkey integration plus button to the real SafeLinkU checkpoint API', () => {
    const source = read('public/dashboard/provider-getkey-checkpoint.js');
    expect(source).toContain(".provider-plus");
    expect(source).toContain("/api/v1/safelinku/status");
    expect(source).toContain("/api/v1/safelinku/checkpoints/create");
    expect(source).toContain("/api/v1/safelinku/checkpoints");
    expect(source).toContain("CHECKPOINTS_KEY");
  });

  it('does not send a SafeLinkU credential or Bearer token from browser code', () => {
    const source = read('public/dashboard/provider-getkey-checkpoint.js');
    expect(source).not.toMatch(/authorization\s*:/i);
    expect(source).not.toMatch(/Bearer\s+[A-Za-z0-9._-]+/i);
    expect(source).not.toMatch(/['\"](?:sk|api)[_-]?[A-Za-z0-9]{16,}['\"]/i);
  });
});
