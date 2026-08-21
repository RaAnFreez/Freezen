const cache = new Map();
const pending = new Map();

function normalizeUserId(userId) {
  const id = String(userId ?? "").trim();
  return /^\d+$/.test(id) ? id : "";
}

async function fetchRobloxUser(id) {
  const response = await fetch(`https://users.roblox.com/v1/users/${encodeURIComponent(id)}`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) return "";

  const data = await response.json();
  const name = typeof data?.name === "string" ? data.name.trim() : "";
  const displayName = typeof data?.displayName === "string" ? data.displayName.trim() : "";
  return name || displayName || "";
}

export async function resolveRobloxUsername(userId) {
  const id = normalizeUserId(userId);
  if (!id) return "";
  if (cache.has(id)) return cache.get(id) || "";
  if (pending.has(id)) return pending.get(id);

  const task = (async () => {
    try {
      const username = await fetchRobloxUser(id);
      cache.set(id, username);
      return username;
    } catch {
      return "";
    } finally {
      pending.delete(id);
    }
  })();

  pending.set(id, task);
  return task;
}

export async function hydrateRobloxUsernames(env, devices) {
  const rows = devices ?? [];
  await Promise.all(rows.map(async (device) => {
    const current = String(device?.game_username ?? "").trim();
    if (current) return;

    const username = await resolveRobloxUsername(device?.game_user_id);
    if (!username) return;

    device.game_username = username;

    if (env?.DB && device?.id) {
      try {
        await env.DB.prepare(
          "UPDATE hwid_bindings_v2 SET game_username = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2 AND (game_username IS NULL OR trim(game_username) = '')",
        ).bind(username, device.id).run();
      } catch {}
    }
  }));

  return rows;
}
