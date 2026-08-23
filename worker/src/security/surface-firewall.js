const PUBLIC_GET_KEY_PREFIXES = [
  "/get-key",
  "/api/v1/get-key/",
  "/files/",
  "/loader/",
  "/compact-loader/",
];

const PUBLIC_EXACT = new Set([
  "/",
  "/login",
  "/login/",
  "/api/v1/auth/login",
  "/api/v1/auth/verify",
  "/api/v1/auth/forgot-password",
  "/api/v1/auth/reset-password",
  "/forgot-password",
  "/forgot-password/",
]);

export function isPublicSurface(pathname) {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_GET_KEY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

export function isOwnerSetupSurface(pathname) {
  return pathname === "/setup/owner" || pathname === "/setup/owner/" || pathname === "/api/v1/setup/owner";
}

export function isMutationMethod(method) {
  return !["GET", "HEAD", "OPTIONS"].includes(String(method || "").toUpperCase());
}

export function sameOriginMutation(request) {
  if (!isMutationMethod(request.method)) return true;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function applySecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("referrer-policy", "no-referrer");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  headers.set("cross-origin-opener-policy", "same-origin");
  headers.set("cross-origin-resource-policy", "same-origin");
  headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  if ((headers.get("content-type") || "").includes("text/html")) {
    headers.set(
      "content-security-policy",
      "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https:; font-src 'self' data:;",
    );
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function surfaceDenied(requestId) {
  return applySecurityHeaders(new Response(JSON.stringify({ error: "NOT_FOUND", request_id: requestId }), {
    status: 404,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  }));
}
