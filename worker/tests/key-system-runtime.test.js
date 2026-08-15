import { describe, expect, it } from 'vitest';
import { publicGetKeyPage, getPublicServiceConfig, startPublicFlow } from '../src/key-system-runtime.js';

describe('server-side GetKey service runtime', () => {
  it('renders the public custom-slug page only for a configured service', async () => {
    const db = {
      prepare(sql) {
        return {
          bind(value) {
            return {
              async first() {
                if (sql.includes('FROM frezen_key_services WHERE slug')) return value === 'frezen' ? { id: 's1', name: 'Frezen', slug: 'frezen', active: 1 } : null;
                if (sql.includes('FROM frezen_key_service_aliases')) return null;
                return null;
              },
            };
          },
        };
      },
    };
    const response = await publicGetKeyPage({ DB: db }, new Request('https://frezen.example/get-key/frezen'), 'frezen');
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain('Service: frezen');
    expect(body).toContain('Start Get-Key Flow');
  });

  it('returns not found when the slug is not configured', async () => {
    const db = {
      prepare(sql) {
        return { bind() { return { async first() { return null; } }; } };
      },
    };
    const response = await getPublicServiceConfig({ DB: db }, 'missing-slug');
    expect(response.status).toBe(404);
  });

  it('does not start a flow without a provider/checkpoints', async () => {
    const db = {
      prepare(sql) {
        return {
          bind(value) {
            return {
              async first() {
                if (sql.includes('FROM frezen_key_services WHERE slug')) return { id: 's1', name: 'Frezen', slug: 'frezen', active: 1 };
                if (sql.includes('FROM frezen_key_service_aliases')) return null;
                if (sql.includes('FROM frezen_key_providers')) return null;
                return null;
              },
            };
          },
        };
      },
    };
    const request = new Request('https://frezen.example/api/v1/get-key/flow/start', {
      method: 'POST',
      body: JSON.stringify({ product_id: 'p1' }),
      headers: { 'content-type': 'application/json' },
    });
    const response = await startPublicFlow(request, { DB: db }, 'frezen');
    const data = await response.json();
    expect(response.status).toBe(409);
    expect(data.error).toBe('PROVIDER_NOT_CONFIGURED');
  });
});
