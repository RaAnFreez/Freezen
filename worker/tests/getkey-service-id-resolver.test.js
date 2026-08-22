import { describe, expect, it } from 'vitest';
import { __test, withGetKeyServiceResolver } from '../src/getkey-service-id-resolver.js';

describe('Public Get-Key service resolver compatibility', () => {
  it('accepts the runtime service lookup and expands it to slug, id, or alias resolution', () => {
    const calls = [];
    const db = {
      prepare(sql) {
        calls.push(sql);
        return { bind() { return this; } };
      },
    };

    const env = withGetKeyServiceResolver({ DB: db });
    env.DB.prepare(__test.SERVICE_LOOKUP_SQL).bind('service-id');

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('slug = ?1');
    expect(calls[0]).toContain('id = ?1');
    expect(calls[0]).toContain('frezen_key_service_aliases');
  });

  it('leaves unrelated D1 queries untouched', () => {
    const calls = [];
    const db = {
      prepare(sql) {
        calls.push(sql);
        return { bind() { return this; } };
      },
    };

    const env = withGetKeyServiceResolver({ DB: db });
    env.DB.prepare('SELECT 1 AS ok');

    expect(calls).toEqual(['SELECT 1 AS ok']);
  });
});
