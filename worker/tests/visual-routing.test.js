import { describe, expect, it } from "vitest";
import entry from "../src/entry-ui.js";

const assetResponse = (path) => new Response(`asset:${path}`, { status: 200, headers: { "content-type": "text/html" } });
const env = { ASSETS: { fetch: async request => assetResponse(new URL(request.url).pathname) } };

describe("production visual routing", () => {
  it("serves Owner Setup HTML instead of JSON", async () => {
    const response = await entry.fetch(new Request("https://frezen.test/setup/owner"), env, {});
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toBe("asset:/setup-owner.html");
  });

  it("serves Login HTML instead of JSON", async () => {
    const response = await entry.fetch(new Request("https://frezen.test/login"), env, {});
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("asset:/login.html");
  });

  it("serves Dashboard HTML before the API router", async () => {
    const response = await entry.fetch(new Request("https://frezen.test/dashboard/"), env, {});
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("asset:/dashboard/index.html");
  });

  it("keeps API POST requests on the backend", async () => {
    let reachedBackend = false;
    const backend = {
      fetch: async request => {
        reachedBackend = request.method === "POST";
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    };
    const response = await entry.fetch(new Request("https://frezen.test/api/v1/setup/owner", { method: "POST" }), { ...env }, {});
    expect(response.status).not.toBe(302);
    expect(response.status).toBe(503);
    expect(reachedBackend).toBe(false);
    void backend;
  });
});
