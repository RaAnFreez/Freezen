const SECURITY_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
};

const json = (data, status = 200, requestId = crypto.randomUUID()) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...SECURITY_HEADERS,
      "x-request-id": requestId,
    },
  });

const notFound = (requestId) =>
  json({ error: "NOT_FOUND", request_id: requestId }, 404, requestId);

export default {
  async fetch(request, env) {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...SECURITY_HEADERS,
          "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
          "access-control-allow-headers": "content-type,authorization,x-csrf-token",
          "access-control-max-age": "600",
        },
      });
    }

    if (request.method === "GET" && url.pathname === "/api/v1/status") {
      return json(
        {
          name: "Frezen Control System V3",
          status: "ok",
          environment: env.FREZEN_ENV ?? "unknown",
          request_id: requestId,
        },
        200,
        requestId,
      );
    }

    if (request.method === "GET" && url.pathname === "/access-denied") {
      return json(
        {
          error: "UNAUTHENTICATED",
          message: "You can't access this link",
          request_id: requestId,
        },
        401,
        requestId,
      );
    }

    return notFound(requestId);
  },
};
