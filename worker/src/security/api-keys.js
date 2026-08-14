const API_KEY_BYTES = 32;
const API_KEY_PREFIX_LENGTH = 12;

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeScopes(scopes) {
  if (!Array.isArray(scopes)) return [];
  return [...new Set(scopes.filter((scope) => typeof scope === "string" && /^[a-z0-9:_*-]+$/.test(scope)))].slice(0, 50);
}

export function normalizeApiKeyScopes(scopes) {
  return normalizeScopes(scopes);
}

export function createApiKeySecret() {
  const bytes = new Uint8Array(API_KEY_BYTES);
  crypto.getRandomValues(bytes);
  return `frz_${bytesToHex(bytes)}`;
}

export async function hashApiKey(secret) {
  if (typeof secret !== "string" || secret.length < 20) throw new Error("INVALID_API_KEY");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return bytesToHex(new Uint8Array(digest));
}

export function apiKeyPrefix(secret) {
  if (typeof secret !== "string" || secret.length < API_KEY_PREFIX_LENGTH) throw new Error("INVALID_API_KEY");
  return secret.slice(0, API_KEY_PREFIX_LENGTH);
}

export function publicApiKey(row) {
  return {
    id: row.id,
    name: row.name,
    key_prefix: row.key_prefix,
    owner_user_id: row.owner_user_id,
    scopes: JSON.parse(row.scopes_json || "[]"),
    expires_at: row.expires_at,
    revoked_at: row.revoked_at,
    last_used_at: row.last_used_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function isApiKeyUsable(row, now = Date.now()) {
  if (!row || row.revoked_at) return false;
  if (row.expires_at && Date.parse(row.expires_at) <= now) return false;
  return true;
}

export { API_KEY_BYTES };
