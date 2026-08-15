const FLOW_TTL_SECONDS = 30 * 60;

const safeJson = (value, fallback) => {
  try { return JSON.parse(value); } catch { return fallback; }
};

const expiresAt = () => new Date(Date.now() + FLOW_TTL_SECONDS * 1000).toISOString();

function normalizeCheckpointIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => String(id || '').trim()).filter(Boolean))];
}

export function checkpointFlowStatus(flow, items = []) {
  const completed = new Set(safeJson(flow?.completed_json || '[]', []));
  const ordered = [...items].sort((a, b) => Number(a.sequence) - Number(b.sequence));
  const current = ordered.findIndex((item) => item.status !== 'COMPLETED');
  return {
    flow_id: flow?.id ?? null,
    status: flow?.status ?? 'PENDING',
    current_index: current < 0 ? ordered.length : current,
    total: ordered.length,
    completed: ordered.filter((item) => completed.has(item.checkpoint_id) || item.status === 'COMPLETED').map((item) => item.checkpoint_id),
    next_checkpoint_id: current >= 0 ? ordered[current]?.checkpoint_id ?? null : null,
    expires_at: flow?.expires_at ?? null,
  };
}

export async function createCheckpointFlow(env, { providerId, serviceId = null, productId, checkpointIds }) {
  if (!env?.DB) return { ok: false, status: 503, error: 'DATABASE_UNAVAILABLE' };
  const ids = normalizeCheckpointIds(checkpointIds);
  if (!providerId || !productId || !ids.length) return { ok: false, status: 400, error: 'CHECKPOINTS_REQUIRED' };

  const flowId = crypto.randomUUID();
  const expiry = expiresAt();
  try {
    await env.DB.prepare(`INSERT INTO getkey_checkpoint_flows (id, provider_id, service_id, product_id, current_index, status, completed_json, expires_at) VALUES (?1, ?2, ?3, ?4, 0, 'PENDING', '[]', ?5)`)
      .bind(flowId, providerId, serviceId, productId, expiry).run();
    for (let i = 0; i < ids.length; i += 1) {
      await env.DB.prepare(`INSERT INTO getkey_checkpoint_flow_items (id, flow_id, checkpoint_id, sequence, status) VALUES (?1, ?2, ?3, ?4, 'PENDING')`)
        .bind(crypto.randomUUID(), flowId, ids[i], i).run();
    }
    return { ok: true, flow_id: flowId, current_index: 0, total: ids.length, next_checkpoint_id: ids[0], expires_at: expiry };
  } catch {
    return { ok: false, status: 503, error: 'DATABASE_ERROR' };
  }
}

export async function getCheckpointFlow(env, flowId) {
  if (!env?.DB) return { ok: false, status: 503, error: 'DATABASE_UNAVAILABLE' };
  try {
    const flow = await env.DB.prepare(`SELECT * FROM getkey_checkpoint_flows WHERE id = ?1 LIMIT 1`).bind(flowId).first();
    if (!flow) return { ok: false, status: 404, error: 'FLOW_NOT_FOUND' };
    if (new Date(flow.expires_at).getTime() <= Date.now() && flow.status === 'PENDING') {
      await env.DB.prepare(`UPDATE getkey_checkpoint_flows SET status = 'EXPIRED' WHERE id = ?1`).bind(flowId).run();
      return { ok: false, status: 410, error: 'FLOW_EXPIRED' };
    }
    const items = await env.DB.prepare(`SELECT id, checkpoint_id, sequence, status, started_at, completed_at FROM getkey_checkpoint_flow_items WHERE flow_id = ?1 ORDER BY sequence ASC`).bind(flowId).all();
    return { ok: true, flow, items: items?.results ?? [], state: checkpointFlowStatus(flow, items?.results ?? []) };
  } catch {
    return { ok: false, status: 503, error: 'DATABASE_ERROR' };
  }
}

export async function startNextCheckpoint(env, flowId) {
  const result = await getCheckpointFlow(env, flowId);
  if (!result.ok) return result;
  if (result.flow.status !== 'PENDING') return { ok: false, status: 409, error: `FLOW_${result.flow.status}` };
  const next = result.items.find((item) => item.status !== 'COMPLETED');
  if (!next) return { ok: true, complete: true, state: checkpointFlowStatus(result.flow, result.items) };
  await env.DB.prepare(`UPDATE getkey_checkpoint_flow_items SET status = 'STARTED', started_at = COALESCE(started_at, datetime('now')) WHERE id = ?1`).bind(next.id).run();
  return { ok: true, complete: false, checkpoint_id: next.checkpoint_id, sequence: next.sequence, state: checkpointFlowStatus(result.flow, result.items) };
}

export async function completeCheckpoint(env, flowId, checkpointId) {
  const result = await getCheckpointFlow(env, flowId);
  if (!result.ok) return result;
  const next = result.items.find((item) => item.status !== 'COMPLETED');
  if (!next) return { ok: true, complete: true, state: result.state };
  if (next.checkpoint_id !== checkpointId) return { ok: false, status: 409, error: 'CHECKPOINT_OUT_OF_ORDER', expected_checkpoint_id: next.checkpoint_id };

  await env.DB.prepare(`UPDATE getkey_checkpoint_flow_items SET status = 'COMPLETED', completed_at = datetime('now') WHERE id = ?1`).bind(next.id).run();
  const completed = result.items.filter((item) => item.status === 'COMPLETED').map((item) => item.checkpoint_id);
  completed.push(checkpointId);
  const done = result.items.length === completed.length;
  await env.DB.prepare(`UPDATE getkey_checkpoint_flows SET current_index = ?1, status = ?2, completed_json = ?3, completed_at = CASE WHEN ?2 = 'COMPLETED' THEN datetime('now') ELSE completed_at END WHERE id = ?4`)
    .bind(done ? result.items.length : next.sequence + 1, done ? 'COMPLETED' : 'PENDING', JSON.stringify([...new Set(completed)]), flowId).run();

  const fresh = await getCheckpointFlow(env, flowId);
  return { ok: true, complete: done, state: fresh.ok ? fresh.state : null, next_checkpoint_id: done ? null : fresh.state.next_checkpoint_id };
}
