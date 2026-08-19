import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('key secret dashboard controls', () => {
  it('loads the owner-only key secret UI bridge', () => {
    const html = read('public/dashboard/index.html');
    const bridge = read('public/dashboard/key-secret-ui.js');
    expect(html).toContain('/dashboard/key-secret-ui.js?v=key-secret-v1');
    expect(bridge).toContain('/secret`');
    expect(bridge).toContain('View Key');
    expect(bridge).toContain('Copy Key');
    expect(bridge).toContain('Delete');
    expect(bridge).not.toContain('Copy ID');
  });
});
