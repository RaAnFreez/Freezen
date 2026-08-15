import { describe, expect, it } from 'vitest';
import { checkpointFlowStatus, createCheckpointFlow, completeCheckpoint, getCheckpointFlow } from '../src/getkey-checkpoint-flow.js';

describe('sequential GetKey checkpoint flow', () => {
  it('keeps checkpoints ordered and exposes only the next checkpoint', () => {
    const flow = { id: 'flow-1', status: 'PENDING', completed_json: '[]', expires_at: new Date(Date.now() + 60_000).toISOString() };
    const items = [
      { checkpoint_id: 'c1', sequence: 0, status: 'PENDING' },
      { checkpoint_id: 'c2', sequence: 1, status: 'PENDING' },
      { checkpoint_id: 'c3', sequence: 2, status: 'PENDING' },
    ];
    expect(checkpointFlowStatus(flow, items)).toMatchObject({ total: 3, current_index: 0, next_checkpoint_id: 'c1', completed: [] });
  });

  it('does not allow skipping a checkpoint', async () => {
    const store = new Map();
    const db = {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async first() { return sql.includes('SELECT * FROM getkey_checkpoint_flows') ? store.get(args[0]) : null; },
              async all() { return { results: [...(store.get(args[0])?.items || [])] }; },
              async run() { return {}; },
            };
          },
        };
      },
    };
    store.set('flow-1', {
      id: 'flow-1', status: 'PENDING', completed_json: '[]', expires_at: new Date(Date.now() + 60_000).toISOString(),
      items: [
        { id: 'i1', checkpoint_id: 'c1', sequence: 0, status: 'PENDING' },
        { id: 'i2', checkpoint_id: 'c2', sequence: 1, status: 'PENDING' },
      ],
    });
    const result = await completeCheckpoint({ DB: db }, 'flow-1', 'c2');
    expect(result).toMatchObject({ ok: false, status: 409, error: 'CHECKPOINT_OUT_OF_ORDER', expected_checkpoint_id: 'c1' });
  });

  it('rejects creating a flow without checkpoints', async () => {
    const result = await createCheckpointFlow({ DB: {} }, { providerId: 'p1', productId: 'prod1', checkpointIds: [] });
    expect(result).toMatchObject({ ok: false, status: 400, error: 'CHECKPOINTS_REQUIRED' });
  });

  it('rejects missing flows', async () => {
    const db = { prepare: () => ({ bind: () => ({ first: async () => null }) }) };
    await expect(getCheckpointFlow({ DB: db }, 'missing')).resolves.toMatchObject({ ok: false, status: 404, error: 'FLOW_NOT_FOUND' });
  });
});
