import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);

function readJson(path) {
  return JSON.parse(readFileSync(new URL(path, root), "utf8"));
}

describe("Phase 2 project initialization", () => {
  it("contains the required project workspaces", () => {
    const pkg = readJson("package.json");
    expect(pkg.private).toBe(true);
    expect(pkg.workspaces).toEqual(
      expect.arrayContaining(["worker", "dashboard", "discord-bot", "get-key"]),
    );
  });

  it("contains required project directories and configuration", () => {
    for (const path of [
      "dashboard/",
      "worker/",
      "discord-bot/",
      "get-key/",
      "migrations/",
      "tests/",
      "docs/",
      "scripts/",
      ".env.example",
      ".gitignore",
      "README.md",
    ]) {
      expect(existsSync(new URL(path, root))).toBe(true);
    }
  });

  it("requires Node 20 or newer", () => {
    const pkg = readJson("package.json");
    expect(pkg.engines?.node).toBe(">=20");
  });
});
