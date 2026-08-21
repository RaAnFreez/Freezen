import { describe, expect, it } from 'vitest';
import { bindHwidV2, validateHwidV2, resetHwidV2, setHwidStatusV2 } from '../src/security/hwid-v2.js';

function makeDb() {
  const state = { licenses: [{ id: 'lic-1', user_id: null, key_owner_id: 'owner-1', status: 'active', expires_at: null }], bindings: [] };
  const prepare = (sql) => ({ bind: (...args) => ({ first: async () => { if (sql.includes('FROM licenses')) return state.licenses.find((x) => x.id === args[0]) ?? null; if (sql.includes('FROM hwid_bindings_v2') && sql.includes("status = 'blocked'") && sql.includes('owner_id = ?1')) return state.bindings.find((x) => x.owner_id === args[0] && x.hwid_hash === args[1] && x.status === 'blocked') ?? null; if (sql.includes('FROM hwid_bindings_v2') && sql.includes('license_id = ?1') && sql.includes('hwid_hash = ?2')) return state.bindings.find((x) => x.license_id === args[0] && x.hwid_hash === args[1]) ?? null; if (sql.includes('COUNT(*)')) return { total: state.bindings.filter((x) => x.license_id === args[0] && x.status === 'active').length }; if (sql.includes('SELECT id FROM hwid_bindings_v2')) return state.bindings.find((x) => x.id === args[0] && x.owner_id === args[1]) ?? null; return null; }, all: async () => ({ results: state.bindings }), run: async () => { if (sql.startsWith('INSERT INTO hwid_bindings_v2')) state.bindings.push({ id: args[0], owner_id: args[1], license_id: args[2], hwid_hash: args[3], status: 'active' }); if (sql.startsWith('UPDATE hwid_bindings_v2 SET status')) { const row = state.bindings.find((x) => x.id === args[3] && x.owner_id === args[4]); if (row) row.status = args[0]; } if (sql.startsWith('UPDATE hwid_bindings_v2 SET owner_id')) { const row = state.bindings.find((x) => x.license_id === args[1] && !x.owner_id); if (row) row.owner_id = args[0]; } if (sql.startsWith('DELETE FROM hwid_bindings_v2')) state.bindings = state.bindings.filter((x) => !(x.owner_id === args[0] && x.license_id === args[1] && x.status === 'active')); return { meta: { changes: 1 } }; } }) });
  return { state, prepare };
}

describe('HWID ban/reset contract', () => {
  it('blocks rebinding after an admin block and allows rebinding after reset', async () => {
    const db = makeDb(); const env = { DB: db };
    const first = await bindHwidV2(env, { licenseId: 'lic-1', ownerId: 'owner-1', rawHwid: 'client-a' });
    expect(first.ok).toBe(true);
    await setHwidStatusV2(env, { ownerId: 'owner-1', deviceId: first.deviceId, status: 'blocked' });
    const blockedBind = await bindHwidV2(env, { licenseId: 'lic-1', ownerId: 'owner-1', rawHwid: 'client-a' });
    expect(blockedBind).toMatchObject({ ok: false, reason: 'HWID_BLOCKED' });
    const blockedValidate = await validateHwidV2(env, { licenseId: 'lic-1', ownerId: 'owner-1', rawHwid: 'client-a' });
    expect(blockedValidate).toMatchObject({ ok: false, reason: 'HWID_BLOCKED' });
    const reset = await resetHwidV2(env, { ownerId: 'owner-1', licenseId: 'lic-1' });
    expect(reset.ok).toBe(true);
    const rebound = await bindHwidV2(env, { licenseId: 'lic-1', ownerId: 'owner-1', rawHwid: 'client-b' });
    expect(rebound.ok).toBe(true);
  });
});
