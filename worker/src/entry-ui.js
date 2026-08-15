import entry from "./entry.js";
import { requirePrivateAccess } from "./security/private-access.js";
import { createSafeLinkUCheckpoint } from "./safelinku.js";
import { syncKeySystemConfig, getPublicServiceConfig, startPublicFlow, getPublicFlow, launchPublicFlow, publicGetKeyPage } from "./key-system-runtime.js";

const NO_STORE = { "cache-control": "no-store" };
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", ...NO_STORE };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

async function asset(request, env, pathname) {
  if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
    return new Response("UI assets are not configured", { status: 503, headers: { ...NO_STORE, "content-type": "text/plain; charset=utf-8" } });
  }
  const url = new URL(request.url);
  url.pathname = pathname;
  const response = await env.ASSETS.fetch(new Request(url, request));
  if (pathname.endsWith(".html")) {
    const headers = new Headers(response.headers);
    headers.set("cache-control", "no-store, max-age=0");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
  return response;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/api/v1/safelinku/checkpoints/create") {
      const requestId = crypto.randomUUID();
      const access = await requirePrivateAccess(request, env, requestId);
      if (access instanceof Response) return access;
      let body = {};
      try { body = await request.json(); } catch { return json({ error: "INVALID_JSON", request_id: requestId }, 400); }
      const result = await createSafeLinkUCheckpoint(env, request, body?.checkpoint_id, requestId);
      return json({ provider: "safelinku", ...result, request_id: requestId }, result.http_status || (result.status === "ok" ? 200 : 503));
    }

    if (request.method === "POST" && url.pathname === "/api/v1/key-system/sync") {
      const requestId = crypto.randomUUID();
      const access = await requirePrivateAccess(request, env, requestId);
      if (access instanceof Response) return access;
      const result = await syncKeySystemConfig(request, env, access);
      return new Response(await result.text(), { status: result.status, headers: { ...Object.fromEntries(result.headers.entries()), "x-request-id": requestId } });
    }

    if (request.method === "GET" && url.pathname === "/api/v1/get-key/checkpoint/callback") {
      return json({ status: "callback_received", checkpoint_id: url.searchParams.get("checkpoint_id"), flow_id: url.searchParams.get("flow_id") || null, verified: false, message: "Returned from SafeLinkU. Completion remains pending until a trusted SafeLinkU completion signal is available." }, 202);
    }

    const publicServiceConfig = url.pathname.match(/^\/api\/v1\/get-key\/service\/([^/]+)$/);
    if (request.method === "GET" && publicServiceConfig) return getPublicServiceConfig(env, decodeURIComponent(publicServiceConfig[1]));

    if (request.method === "POST" && url.pathname === "/api/v1/get-key/flow/start") {
      const slug = url.searchParams.get("slug") || "";
      return startPublicFlow(request, env, slug);
    }

    const publicFlowMatch = url.pathname.match(/^\/api\/v1\/get-key\/flow\/([^/]+)$/);
    if (request.method === "GET" && publicFlowMatch) return getPublicFlow(env, decodeURIComponent(publicFlowMatch[1]));

    const publicFlowLaunchMatch = url.pathname.match(/^\/api\/v1\/get-key\/flow\/([^/]+)\/launch$/);
    if (request.method === "GET" && publicFlowLaunchMatch) return launchPublicFlow(env, decodeURIComponent(publicFlowLaunchMatch[1]));

    const publicGetKeyMatch = url.pathname.match(/^\/get-key\/([^/]+)\/?$/);
    if (request.method === "GET" && publicGetKeyMatch) return publicGetKeyPage(env, request, decodeURIComponent(publicGetKeyMatch[1]));

    if (request.method === "GET") {
      if (url.pathname === "/setup/owner" || url.pathname === "/setup/owner/") return asset(request, env, "/setup-owner.html");
      if (url.pathname === "/login" || url.pathname === "/login/") return asset(request, env, "/login.html");
      if (url.pathname === "/dashboard" || url.pathname === "/dashboard/") return asset(request, env, "/dashboard/index.html");
      if (url.pathname === "/api/v1/setup/owner") return new Response(null, { status: 302, headers: { location: "/setup/owner", ...NO_STORE } });
      if (url.pathname === "/api/v1/auth/login") return new Response(null, { status: 302, headers: { location: "/login", ...NO_STORE } });
      if (url.pathname === "/api/v1/dashboard") return new Response(null, { status: 302, headers: { location: "/dashboard/", ...NO_STORE } });
    }

    return entry.fetch(request, env, ctx);
  },
};
