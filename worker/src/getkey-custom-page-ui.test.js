import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('Custom Get-Key slug UI routing', () => {
  it('routes custom slug requests through the rebuilt slug page', () => {
    const entry = read('src/entry-ui-getkey.js');
    const page = read('src/getkey-slug-ui.js');

    expect(entry).toContain("import { renderSlugGetKeyPage } from './getkey-slug-ui.js';");
    expect(entry).toContain('const slug = getSlugFromPath(url.pathname);');
    expect(entry).toContain('return renderSlugGetKeyPage(slug);');

    expect(page).toContain('id="primary"');
    expect(page).toContain("els.primaryText.textContent = 'CONTINUE'");
    expect(page).toContain("status === 'current' ? 'OPEN' : '—'");
    expect(page).toContain('launchCurrentCheckpoint');
    expect(page).toContain('/api/v1/get-key/flow/start?slug=');
    expect(page).toContain('/launch?json=1');
  });

  it('keeps the legacy helper JSON launch path available for compatibility', () => {
    const helper = read('src/getkey-custom-page-ui.js');
    expect(helper).toContain("?json=1");
    expect(helper).toContain('SafeLinkU checkpoint ready');
    expect(helper).toContain('safelinku-open-button');
  });
});
