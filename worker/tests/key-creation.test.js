import { describe, expect, it } from 'vitest';
import { generateLicense } from '../src/security/license-lifecycle.js';

describe('Key Control license creation', () => {
  it('creates a license without requiring the products table', async () => {
    const calls = [];
    const DB = {
      prepare(sql) {
        calls.push(sql);
        return {
          bind(...values) {
            calls.push(values);
            return {
              async first() { throw new Error('no such table: products'); },
              async all() {
                return {
                  results: [
                    { name: 'id' },
                    { name: 'license_key_hash' },
                    { name: 'product_id' },
                    { name: 'user_id' },
                    { name: 'status' },
                    { name: 'expires_at' },
                    { name: 'max_devices' },
                  ],
                };
              },
              async run() { return { meta: { changes: 1 } }; },
            };
          },
        };
      },
    };
    const response = await generateLicense(new Request('https://example.test/api/v1/licenses', { method: 'POST', body: '{}' }), { DB }, 'req-test', (body, status = 200) => new Response(JSON.stringify(body), { status }), { user_id: 'owner-1' });
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.created).toBe(true);
    expect(data.license.product_id).toBeNull();
    expect(data.license_key).toMatch(/^FREZEN-/);
    expect(calls.some((sql) => String(sql).includes('FROM products'))).toBe(false);
  });
});
