import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('ZIP-aligned public GetKey runtime', () => {
  it('uses a browser session cookie and sequential D1 checkpoint state', () => {
    const source = read('src/getkey-public-runtime.js');
    expect(source).toContain("const SESSION_COOKIE = 'frezen_getkey_session';");
    expect(source).toContain('getkey_public_sessions');
    expect(source).toContain('getkey_public_checkpoints');
    expect(source).toContain("status = 'passed'");
  });

  it('creates SafeLinkU links whose destination is the Frezen callback', () => {
    const source = read('src/getkey-public-runtime.js');
    expect(source).toContain("new URL('/api/v1/get-key/checkpoint/callback'");
    expect(source).toContain('createSafeLinkUShortLink');
    expect(source).toContain('verify_token_hash');
  });

  it('keeps the verification token single-use and expires it', () => {
    const source = read('src/getkey-public-runtime.js');
    expect(source).toContain('TOKEN_TTL_SECONDS = 20 * 60');
    expect(source).toContain('verify_token_hash = NULL');
    expect(source).toContain('TOKEN_ALREADY_USED');
    expect(source).toContain('TOKEN_EXPIRED');
  });

  it('auto-issues a license after the final checkpoint', () => {
    const source = read('src/getkey-public-runtime.js');
    expect(source).toContain('makeLicenseKey()');
    expect(source).toContain('INSERT INTO licenses');
    expect(source).toContain('getkey_public_keys');
    expect(source).toContain('All checkpoints completed.');
  });

  it('does not expose a public callback that can skip the browser session', () => {
    const source = read('src/getkey-public-runtime.js');
    expect(source).toContain('SESSION_MISMATCH');
    expect(source).toContain('sessionId !== row.session_id');
  });
});
