import { describe, expect, it } from "vitest";
import worker from "../src/index.js";

describe("Frezen Worker", () => {
  it("returns a healthy status response", async () => {
    const response = await worker.fetch(
      new Request("https://frezen.test/api/v1/status"),
      { FREZEN_ENV: "test" },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");

    const body = await response.json();
    expect(body.name).toBe("Frezen Control System V3");
    expect(body.status).toBe("ok");
    expect(body.environment).toBe("test");
    expect(body.database).toBe("not_configured");
    expect(body.request_id).toEqual(expect.any(String));
  });

  it("reports D1 as not configured when the binding is absent", async () => {
    const response = await worker.fetch(
      new Request("https://frezen.test/api/v1/health/db"),
      { FREZEN_ENV: "test" },
    );

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.status).toBe("not_configured");
    expect(body.request_id).toEqual(expect.any(String));
  });

  it("does not expose protected content without authentication", async () => {
    const response = await worker.fetch(
      new Request("https://frezen.test/dashboard"),
      { FREZEN_ENV: "test" },
    );

    expect(response.status).toBe(404);
  });
});
