import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('Get-Key custom slug start regression', () => {
  it('resolves direct and alias slugs before invoking the service-id runtime', () => {
    const adapter = read('src/getkey-single-claim-service-id.js');

    expect(adapter).toContain('function resolveServiceForStart');
    expect(adapter).toContain('FROM frezen_key_services WHERE slug = ?1 LIMIT 1');
    expect(adapter).toContain('FROM frezen_key_service_aliases');
    expect(adapter).toContain('FROM frezen_key_services WHERE id = ?1 LIMIT 1');
    expect(adapter).toContain('startRuntime(request, env, service.slug)');
    expect(adapter).not.toContain('startRuntime(request, env, slug);');
  });

  it('always aligns state and launch requests to the flow id from the URL', () => {
    const adapter = read('src/getkey-single-claim-service-id.js');

    expect(adapter).toContain('const CLAIM_MAX_AGE = 24 * 60 * 60;');
    expect(adapter).toContain('getPublicGetKeyStateByServiceId(requestWithSession(request, flowId), env, flowId)');
    expect(adapter).toContain('const sessionRequest = requestWithSession(request, flowId);');
    expect(adapter).not.toContain('readCookie(request, SESSION_COOKIE) || flowId');
  });

  it('synchronizes issued dashboard records as 24-hour keys', () => {
    const adapter = read('src/getkey-single-claim-service-id.js');

    expect(adapter).toContain('const expiresAt = new Date(Date.now() + CLAIM_MAX_AGE * 1000).toISOString();');
    expect(adapter).toContain('expires_at = ?2');
    expect(adapter).toContain('VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6, 0, 0)');
    expect(adapter).not.toContain('expires_at = NULL');
    expect(adapter).not.toContain('NULL, ?6, 0, 1)');
  });
});
