import { getSession, requireSession } from "./session-auth.js";

const encoder = new TextEncoder();

const json = (data, status, requestId) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "x-request-id": requestId,
    },
  });

const sha256 = async (value) =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));

const safeEqual = (left, right) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
};

export async function requireAuth(request, env, requestId) {
  if (env.DB) {
    const session = await requireSession(request, env, requestId, json);
    if (session && session.user_id) return session;
    if (env.FREZEN_ENV === "production") return session;
  }

  // Development/test compatibility only. Production protected routes use D1 sessions.
  const configuredToken = env.AUTH_TOKEN ?? env.FREZEN_API_TOKEN;
  if (!configuredToken || env.FREZEN_ENV === "production") {
    return json({ error: "AUTH_NOT_CONFIGURED", request_id: requestId }, 503, requestId);
  }

  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer ([^\s]+)$/i);
  if (!match) {
    return json({ error: "UNAUTHENTICATED", request_id: requestId }, 401, requestId);
  }

  const supplied = await sha256(match[1]);
  const expected = await sha256(configuredToken);
  const verified = safeEqual(supplied, expected);
  if (!verified) {
    return json({ error: "UNAUTHORIZED", request_id: requestId }, 403, requestId);
  }

  return { user_id: null, legacy: true };
}

export { getSession };
