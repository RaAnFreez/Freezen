import { describe, expect, it } from 'vitest';
import {
  MAX_INLINE_SCRIPT_ROW_CONTENT_BYTES,
  MAX_VM_OUTPUT_BYTES,
  SCRIPT_PAYLOAD_CHUNK_BYTES,
  deleteStoredScriptPayloads,
  resolveScriptPayload,
  storeScriptPayloadPair,
} from './script-payload-storage.js';

function createD1() {
  const rows = new Map();

  function execute(sql, values = []) {
    const normalized = sql.trim().replace(/\s+/g, ' ').toUpperCase();
    if (normalized.startsWith('CREATE TABLE') || normalized.startsWith('CREATE INDEX')) {
      return { success: true };
    }
    if (normalized.startsWith('INSERT INTO SCRIPT_PAYLOAD_CHUNKS')) {
      const [id, scope, fileId, storageId, kind, chunkIndex, content, sizeBytes] = values;
      rows.set(id, { id, scope, file_id: fileId, storage_id: storageId, kind, chunk_index: chunkIndex, content, size_bytes: sizeBytes });
      return { success: true };
    }
    if (normalized.startsWith('DELETE FROM SCRIPT_PAYLOAD_CHUNKS')) {
      const [scope, fileId, storageId] = values;
      for (const [id, row] of rows) {
        if (row.scope === scope && row.file_id === fileId && row.storage_id === storageId) rows.delete(id);
      }
      return { success: true };
    }
    return { success: true };
  }

  const DB = {
    prepare(sql) {
      return {
        sql,
        values: [],
        bind(...values) { this.values = values; return this; },
        async run() { return execute(this.sql, this.values); },
        async all() {
          const normalized = this.sql.trim().replace(/\s+/g, ' ').toUpperCase();
          if (!normalized.startsWith('SELECT CHUNK_INDEX,CONTENT FROM SCRIPT_PAYLOAD_CHUNKS')) return { results: [] };
          const [scope, fileId, storageId, kind] = this.values;
          const results = [...rows.values()]
            .filter((row) => row.scope === scope && row.file_id === fileId && row.storage_id === storageId && row.kind === kind)
            .sort((a, b) => a.chunk_index - b.chunk_index)
            .map(({ chunk_index, content }) => ({ chunk_index, content }));
          return { results };
        },
      };
    },
    async batch(statements) {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
  };
  return { DB, rows };
}

describe('Large Lua payload storage without R2', () => {
  it('uses a 5 MiB VM output cap and conservative D1 inline threshold', () => {
    expect(MAX_VM_OUTPUT_BYTES).toBe(5 * 1024 * 1024);
    expect(MAX_INLINE_SCRIPT_ROW_CONTENT_BYTES).toBeLessThan(2_000_000);
    expect(SCRIPT_PAYLOAD_CHUNK_BYTES).toBeLessThan(500 * 1024);
  });

  it('keeps small source/payload pairs inline in D1', async () => {
    const pair = await storeScriptPayloadPair(createD1(), {
      scope: 'scripts',
      fileId: 'small-file',
      source: 'print("ok")',
      payload: '-- protected payload',
    });
    expect(pair.storage).toBe('d1-inline');
    expect(pair.content).toBe('-- protected payload');
    expect(pair.sourceContent).toBe('print("ok")');
  });

  it('splits large combined source and payload into D1 chunks and resolves them', async () => {
    const database = createD1();
    const source = 's'.repeat(700_000);
    const payload = 'p'.repeat(900_000);
    const pair = await storeScriptPayloadPair(database, {
      scope: 'scripts',
      fileId: 'test-file',
      source,
      payload,
    });

    expect(pair.storage).toBe('d1-chunks');
    expect(pair.content).toMatch(/^frezen-d1:\/\/scripts\/test-file\/[0-9a-f-]+\/payload$/i);
    expect(pair.sourceContent).toMatch(/^frezen-d1:\/\/scripts\/test-file\/[0-9a-f-]+\/source$/i);
    expect(database.rows.size).toBeGreaterThan(0);
    for (const row of database.rows.values()) expect(row.size_bytes).toBeLessThanOrEqual(SCRIPT_PAYLOAD_CHUNK_BYTES);
    expect(await resolveScriptPayload(database, pair.content)).toBe(payload);
    expect(await resolveScriptPayload(database, pair.sourceContent)).toBe(source);

    await deleteStoredScriptPayloads(database, pair.content, pair.sourceContent);
    expect(database.rows.size).toBe(0);
  });

  it('preserves Unicode code points across chunk boundaries', async () => {
    const database = createD1();
    const source = '😀café'.repeat(120_000);
    const payload = 'π'.repeat(150_000);
    const pair = await storeScriptPayloadPair(database, {
      scope: 'delivery',
      fileId: 'unicode-file',
      source,
      payload,
    });
    expect(await resolveScriptPayload(database, pair.sourceContent)).toBe(source);
    expect(await resolveScriptPayload(database, pair.content)).toBe(payload);
  });

  it('requires D1 when large payload chunking is necessary', async () => {
    await expect(storeScriptPayloadPair({}, {
      scope: 'scripts',
      fileId: 'test-file',
      source: 's'.repeat(700_000),
      payload: 'p'.repeat(700_000),
    })).rejects.toThrow('DATABASE_UNAVAILABLE');
  });

  it('rejects missing D1 chunk records rather than sending a storage pointer as Lua', async () => {
    const database = createD1();
    const pointer = 'frezen-d1://scripts/test-file/9d5ba4f9-2a45-49b0-a08e-151c998a392d/payload';
    await expect(resolveScriptPayload(database, pointer)).rejects.toThrow('SCRIPT_PAYLOAD_MISSING');
  });
});
