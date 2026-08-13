import entry from "./entry.js";

const redirect = (location) => new Response(null, {
  status: 302,
  headers: { location, "cache-control": "no-store" },
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Browser-friendly aliases: never expose the JSON API when a user opens
    // these GET endpoints directly. POST API calls continue to the backend.
    if (request.method === "GET") {
      if (url.pathname === "/api/v1/setup/owner") return redirect("/setup/owner");
      if (url.pathname === "/api/v1/auth/login") return redirect("/login");
      if (url.pathname === "/api/v1/dashboard") return redirect("/dashboard/");
    }

    return entry.fetch(request, env, ctx);
  },
};
