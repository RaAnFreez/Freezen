import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('Get-Key custom slug expiry UI', () => {
  it('does not start a countdown while checkpoints are pending', () => {
    const source = read('src/getkey-slug-ui.js');
    expect(source).toContain('function renderCheckpointTimer()');
    expect(source).toContain("renderCheckpointTimer()")
    expect(source).toContain("$('timeLeft').textContent='—'");
    expect(source).toContain("function startExpiryTimer(generatedAt)");
    expect(source).toContain("startExpiryTimer(d.generated_at)");
  });

  it('uses a 24-hour window beginning at key generation and resets after expiry', () => {
    const source = read('src/getkey-slug-ui.js');
    expect(source).toContain("start+86400000-Date.now()");
    expect(source).toContain("return'Expired'");
    expect(source).toContain("localStorage.removeItem(storageKey)");
    expect(source).toContain("u.searchParams.delete('flow')");
  });

  it('keeps the server-side completed-key expiry behavior', () => {
    const source = read('src/entry-ui-getkey.js');
    expect(source).toContain("const KEY_VALIDITY_MS = 24 * 60 * 60 * 1000");
    expect(source).toContain("expiryLabel.textContent = 'Expired Key'");
    expect(source).toContain("location.replace(next.toString())");
  });
});
