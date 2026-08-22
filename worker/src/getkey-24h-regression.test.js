import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, name), 'utf8');

describe('Get-Key 24h and checkpoint regressions', () => {
  it('issues Get-Key licenses with a 24 hour expiry and non-forever dashboard records', () => {
    const source = read('getkey-callback-runtime.js');
    expect(source).toContain('KEY_TTL_SECONDS = 24 * 60 * 60');
    expect(source).toContain("expires_at)\n    VALUES (?1, ?2, NULL, 'active'");
    expect(source).toContain('VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6, 0, 0)');
    expect(source).not.toContain("expires_at = NULL");
  });

  it('keeps the public Get-Key timeline window at 24 hours', () => {
    const state = read('getkey-service-id-state.js');
    expect(state).toContain('SESSION_TTL_SECONDS = 24 * 60 * 60');
    expect(state).toContain('normalizeSessionLifetime');
    expect(state).toContain('expires_at: session.expires_at');
  });

  it('merges active SafeLinkU checkpoints into the public service configuration', () => {
    const state = read('getkey-service-id-state.js');
    const meta = read('getkey-service-meta.js');
    expect(state).toContain("FROM frezen_key_checkpoints");
    expect(state).toContain("type = 'safelinku'");
    expect(meta).toContain("FROM frezen_key_checkpoints");
    expect(meta).toContain("type = 'safelinku'");
  });

  it('attaches newly created checkpoints to active providers', () => {
    const source = read('safelinku-dashboard-admin.js');
    expect(source).toContain('attachCheckpointToProviders');
    expect(source).toContain('checkpoints_json');
    expect(source).toContain('attached_providers');
  });
});
