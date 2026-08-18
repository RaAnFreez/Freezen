import { describe, expect, it } from 'vitest';
import { generateLicense } from '../src/security/license-lifecycle.js';

describe('Key Control license creation', () => {
  it('creates a license without requiring the products table or audit success', async () => {
    const calls = [];
    const columns = ['id', 'license_key_hash', 'product_id', 'user_id', 'status', 'expires_at', 'max_devices'];
    const DB = {
      prepare(sql) {
        calls.push(sql);
        return {
          async all() {
            if (sql.includes('PRAGMA table_info(licenses)')) return { results: columns.map((name, cid) => ({ cid, name })) };
            return { results: [] };
          },
          bind(...values) {
            calls.push(values);
            return {
              async first() {
                if (sql.includes('FROM products')) throw new Error('no such table: products');
                return null;
              },
              async run() {
                if (sql.includes('license_audit_log')) throw new Error('legacy audit schema');
                return { meta: { changes: 1 } };
              },
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
    expect(calls.some((sql) => String(sql).includes('PRAGMA table_info(licenses)'))).toBe(true);
  });
});
