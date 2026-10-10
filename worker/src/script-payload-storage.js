export const SCRIPT_PAYLOAD_POINTER_PREFIX = 'frezen-d1://';

// D1 has a 2,000,000-byte maximum string/BLOB/table-row size. Keep normal rows
// compact; larger source/payload pairs are split across additive D1 chunk rows.
export const MAX_INLINE_SCRIPT_ROW_CONTENT_BYTES = 1_200_000;
export const MAX_VM_OUTPUT_BYTES = 5 * 1024 * 1024;
export const SCRIPT_PAYLOAD_CHUNK_BYTES = 384 * 1024;

const encoder = new TextEncoder();
const POINTER_RE = /^frezen-d1:\/\/(scripts|delivery)\/([A-Za-z0-9_-]+)\/([0-9a-f-]+)\/(payload|source)$/i;

export function isD1ScriptPayload(value) {
  return typeof value === 'string' && value.startsWith(SCRIPT_PAYLOAD_POINTER_PREFIX);
}

function parsePointer(value) {
  if (!isD1ScriptPayload(value)) return null;
  const match = String(value).match(POINTER_RE);
  if (!match) throw new Error('INVALID_SCRIPT_PAYLOAD_POINTER');
  return { scope: match[1].toLowerCase(), fileId: match[2], storageId: match[3], kind: match[4].toLowerCase() };
}

function pointerFor({ scope, fileId, storageId, kind }) {
  return `${SCRIPT_PAYLOAD_POINTER_PREFIX}${scope}/${fileId}/${storageId}/${kind}`;
}

async function ensurePayloadSchema(env) {
  if (!env?.DB || typeof env.DB.prepare !== 'function') throw new Error('DATABASE_UNAVAILABLE');
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS script_payload_chunks (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL CHECK(scope IN ('scripts','delivery')),
    file_id TEXT NOT NULL,
    storage_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('payload','source')),
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(scope,file_id,storage_id,kind,chunk_index)
  )`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_script_payload_chunks_lookup ON script_payload_chunks(scope,file_id,storage_id,kind,chunk_index)').run();
}

// Split at Unicode code-point boundaries so the size of every stored string
// remains well under D1's per-value and per-row limit.
function splitUtf8(text, maxBytes = SCRIPT_PAYLOAD_CHUNK_BYTES) {
  const chunks = [];
  let start = 0;
  let byteCount = 0;
  for (let i = 0; i < text.length;) {
    const cp = text.codePointAt(i);
    const units = cp > 0xffff ? 2 : 1;
    const bytes = cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4;
    if (byteCount > 0 && byteCount + bytes > maxBytes) {
      chunks.push(text.slice(start, i));
      start = i;
      byteCount = 0;
    }
    byteCount += bytes;
    i += units;
  }
  if (start < text.length || chunks.length === 0) chunks.push(text.slice(start));
  return chunks;
}

async function batchStatements(env, statements, size = 40) {
  for (let i = 0; i < statements.length; i += size) {
    await env.DB.batch(statements.slice(i, i + size));
  }
}

async function deleteStorageId(env, scope, fileId, storageId) {
  await env.DB.prepare('DELETE FROM script_payload_chunks WHERE scope=?1 AND file_id=?2 AND storage_id=?3')
    .bind(scope, fileId, storageId).run();
}

/**
 * Keep small pairs inline. For larger combined values, store UTF-8 chunks in
 * D1 and leave short pointers in the original row. This avoids R2 and does not
 * require a D1 reset or migration; the chunk table is additive and lazy-created.
 */
export async function storeScriptPayloadPair(env, { scope, fileId, source, payload }) {
  const sourceText = String(source ?? '');
  const payloadText = String(payload ?? '');
  const sourceBytes = encoder.encode(sourceText).byteLength;
  const payloadBytes = encoder.encode(payloadText).byteLength;

  if (sourceBytes + payloadBytes <= MAX_INLINE_SCRIPT_ROW_CONTENT_BYTES) {
    return { content: payloadText, sourceContent: sourceText, storage: 'd1-inline', sourceBytes, payloadBytes };
  }

  if (!['scripts', 'delivery'].includes(scope)) throw new Error('INVALID_SCRIPT_PAYLOAD_SCOPE');
  if (!/^[A-Za-z0-9_-]+$/.test(String(fileId ?? ''))) throw new Error('INVALID_SCRIPT_PAYLOAD_ID');
  await ensurePayloadSchema(env);

  const storageId = crypto.randomUUID();
  const records = [];
  for (const [kind, value] of [['payload', payloadText], ['source', sourceText]]) {
    const chunks = splitUtf8(value);
    for (let index = 0; index < chunks.length; index += 1) {
      const content = chunks[index];
      records.push({
        id: crypto.randomUUID(),
        scope,
        fileId,
        storageId,
        kind,
        index,
        content,
        sizeBytes: encoder.encode(content).byteLength,
      });
    }
  }

  const statements = records.map((item) => env.DB.prepare(
    'INSERT INTO script_payload_chunks (id,scope,file_id,storage_id,kind,chunk_index,content,size_bytes) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)'
  ).bind(item.id, item.scope, item.fileId, item.storageId, item.kind, item.index, item.content, item.sizeBytes));

  try {
    await batchStatements(env, statements);
  } catch (error) {
    try { await deleteStorageId(env, scope, fileId, storageId); } catch {}
    throw error;
  }

  return {
    content: pointerFor({ scope, fileId, storageId, kind: 'payload' }),
    sourceContent: pointerFor({ scope, fileId, storageId, kind: 'source' }),
    storage: 'd1-chunks',
    sourceBytes,
    payloadBytes,
  };
}

export async function resolveScriptPayload(env, value) {
  const pointer = parsePointer(value);
  if (!pointer) return value ?? '';
  await ensurePayloadSchema(env);
  const result = await env.DB.prepare(
    'SELECT chunk_index,content FROM script_payload_chunks WHERE scope=?1 AND file_id=?2 AND storage_id=?3 AND kind=?4 ORDER BY chunk_index ASC'
  ).bind(pointer.scope, pointer.fileId, pointer.storageId, pointer.kind).all();
  const rows = result?.results ?? [];
  if (!rows.length) throw new Error('SCRIPT_PAYLOAD_MISSING');
  for (let i = 0; i < rows.length; i += 1) {
    if (Number(rows[i].chunk_index) !== i) throw new Error('SCRIPT_PAYLOAD_INCOMPLETE');
  }
  return rows.map((row) => row.content).join('');
}

export async function deleteStoredScriptPayloads(env, ...values) {
  const pointers = values.map(parsePointer).filter(Boolean);
  if (!pointers.length || !env?.DB) return;
  const unique = new Map(pointers.map((p) => [`${p.scope}/${p.fileId}/${p.storageId}`, p]));
  for (const p of unique.values()) {
    try { await deleteStorageId(env, p.scope, p.fileId, p.storageId); } catch {}
  }
}
