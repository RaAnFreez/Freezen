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

  it('never sends the SafeLinkU API key from browser code', () => {
    const source = read('public/dashboard/provider-getkey-checkpoint.js');
    expect(source).not.toContain('SAFELINKU_API_KEY');
    expect(source).not.toContain('Authorization: Bearer');
  });
});
