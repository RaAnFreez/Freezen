import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('Get-Key service-id checkpoint launch regression', () => {
  it('resolves the session service by id instead of treating it as a slug', () => {
    const helper = read('src/getkey-service-id-launch.js');
    const claim = read('src/getkey-single-claim.js');

    expect(helper).toContain('FROM frezen_key_services WHERE id = ?1 LIMIT 1');
    expect(helper).toContain('loadServiceById(env, session.service_id)');
    expect(claim).toContain("launchGetKeyCheckpointByServiceId(sessionRequest, env, flowId, jsonMode)");
  });

  it('reuses an unexpired checkpoint URL for the same flow', () => {
    const helper = read('src/getkey-service-id-launch.js');
    expect(helper).toContain('next.short_url && next.token_expires_at');
    expect(helper).toContain('reused: true');
    expect(helper).toContain("status != 'passed'");
  });
});
