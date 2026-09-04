import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('Get-Key copy runtime', () => {
  it('prefers Clipboard API before the selection fallback', () => {
    const source = read('src/getkey-slug-ui.js');
    const clipboard = source.indexOf("await navigator.clipboard.writeText(value)");
    const fallback = source.indexOf("document.execCommand('copy')");
    expect(clipboard).toBeGreaterThan(-1);
    expect(fallback).toBeGreaterThan(-1);
    expect(clipboard).toBeLessThan(fallback);
    expect(source).toContain("if(copied){button.textContent='Key Copied'");
  });
});
