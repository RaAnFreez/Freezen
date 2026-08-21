const cache = new Map();

export async function resolveRobloxUsername(userId) {
  const id = String(userId ?? "").trim();
  if (!/^\d+$/.test(id)) return "";
  if (cache.has(id)) return cache.get(id) || "";

  try {
    const response = await fetch(`https://users.roblox.com/v1/users/${encodeURIComponent(id)}`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) return "";
    const data = await response.json();
    const username = typeof data?.name === "string" ? data.name.trim() : "";
    cache.set(id, username);
    return username;
  } catch {
    return "";
  }
}

export async function hydrateRobloxUsernames(devices) {
  await Promise.all((devices ?? []).map(async (device) => {
    if (String(device?.game_username ?? "").trim()) return;
    const username = await resolveRobloxUsername(device?.game_user_id);
    if (username) device.game_username = username;
  }));
  return devices ?? [];
}
