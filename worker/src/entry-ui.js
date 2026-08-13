import entry from "./entry.js";

const NO_STORE = { "cache-control": "no-store" };

async function asset(request, env, pathname) {
  if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
    return new Response("UI assets are not configured", { status: 503, headers: { ...NO_STORE, "content-type": "text/plain; charset=utf-8" } });
  }
  const url = new URL(request.url);
  url.pathname = pathname;
  return env.ASSETS.fetch(new Request(url, request));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET") {
      // These are real browser pages. They are deliberately handled before
      // entry.js, whose API router returns JSON for /dashboard/*.
      if (url.pathname === "/setup/owner" || url.pathname === "/setup/owner/") {
        return asset(request, env, "/setup-owner.html");
      }
      if (url.pathname === "/login" || url.pathname === "/login/") {
        return asset(request, env, "/login.html");
      }
      if (url.pathname === "/dashboard" || url.pathname === "/dashboard/") {
        return asset(request, env, "/dashboard/index.html");
      }

      // Browser-friendly aliases for API URLs that users may accidentally open.
      if (url.pathname === "/api/v1/setup/owner") return new Response(null, { status: 302, headers: { location: "/setup/owner", ...NO_STORE } });
      if (url.pathname === "/api/v1/auth/login") return new Response(null, { status: 302, headers: { location: "/login", ...NO_STORE } });
      if (url.pathname === "/api/v1/dashboard") return new Response(null, { status: 302, headers: { location: "/dashboard/", ...NO_STORE } });
    }

    return entry.fetch(request, env, ctx);
  },
};
