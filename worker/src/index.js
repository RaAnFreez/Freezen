const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/v1/status") {
      return json({
        name: "Frezen Control System V3",
        status: "ok",
        environment: env.FREZEN_ENV ?? "unknown",
      });
    }

    return json({ error: "Not Found" }, 404);
  },
};
