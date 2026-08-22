import { describe, expect, it, vi } from 'vitest';
import { resolveGetKeyService } from './getkey-slug-resolver.js';

function makeDb({ direct = null, alias = null }) {
  return {
    prepare: vi.fn((sql) => ({
      bind: vi.fn(() => ({
        first: vi.fn(async () => sql.includes('frezen_key_service_aliases') ? alias : direct),
      })),
    })),
  };
}

describe('custom Get-Key slug resolver', () => {
  it('resolves a current service slug directly', async () => {
    const service = { id: 'svc-1', name: 'Cihuy', slug: 'cihuy', description: '', active: 1 };
    const result = await resolveGetKeyService({ DB: makeDb({ direct: service }) }, 'CIHUY');
    expect(result.service.id).toBe('svc-1');
    expect(result.canonical_slug).toBe('cihuy');
    expect(result.alias).toBe(false);
  });

  it('resolves an old/custom slug through the service alias table', async () => {
    const service = { id: 'svc-1', name: 'Cihuy', slug: 'new-cihuy', description: '', active: 1 };
    const result = await resolveGetKeyService({ DB: makeDb({ alias: service }) }, 'cihuy');
    expect(result.service.id).toBe('svc-1');
    expect(result.canonical_slug).toBe('new-cihuy');
    expect(result.requested_slug).toBe('cihuy');
    expect(result.alias).toBe(true);
  });

  it('returns SERVICE_NOT_FOUND when neither direct nor alias lookup exists', async () => {
    const result = await resolveGetKeyService({ DB: makeDb({ direct: null, alias: null }) }, 'missing');
    expect(result.error).toBe('SERVICE_NOT_FOUND');
    expect(result.status).toBe(404);
  });
});
