export const ROLES = Object.freeze({ OWNER: "OWNER", ADMIN: "ADMIN", SUPPORT: "SUPPORT" });

export const ROLE_PERMISSIONS = Object.freeze({
  OWNER: Object.freeze(["*"]),
  ADMIN: Object.freeze([
    "licenses:read", "licenses:write",
    "keys:read", "keys:write",
    "products:read", "products:write",
    "scripts:read", "scripts:write",
    "users:read", "users:write",
    "hwid:read", "hwid:write",
    "analytics:read",
  ]),
  SUPPORT: Object.freeze([
    "users:read",
    "licenses:read",
    "hwid:read", "hwid:write",
  ]),
});

export function normalizeRole(role) {
  return typeof role === "string" ? role.trim().toUpperCase() : "";
}

export function hasPermission(role, permission) {
  const normalizedRole = normalizeRole(role);
  if (!Object.hasOwn(ROLE_PERMISSIONS, normalizedRole)) return false;
  const permissions = ROLE_PERMISSIONS[normalizedRole];
  return permissions.includes("*") || permissions.includes(permission);
}

export function requirePermission(auth, permission, json, requestId) {
  if (!auth?.user_id) return json({ error: "UNAUTHENTICATED", request_id: requestId }, 401, requestId);
  if (!hasPermission(auth.role, permission)) {
    return json({ error: "FORBIDDEN", message: "Access Denied", request_id: requestId }, 403, requestId);
  }
  return null;
}

export function roleMatrix() {
  return Object.fromEntries(Object.entries(ROLE_PERMISSIONS).map(([role, permissions]) => [role, [...permissions]]));
}
