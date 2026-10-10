import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const scripts = readFileSync(join(root, "scripts.js"), "utf8");
const main = readFileSync(join(root, "main.js"), "utf8");

describe("Layered VM v4/v5 — production dashboard", () => {
  it("offers v4 alongside the compatibility profile and retires old VM selectors", () => {
    expect(scripts).toContain('<option value="source-v11">Source V11 — compatibility</option>');
    expect(scripts).toContain('<option value="vm-v4">Frezen Layered VM v4 — two-stage runtime</option>');
    expect(scripts).toContain('<option value="vm-v5">Frezen Layered VM v5 — manifest-sealed</option>');
    expect(scripts).not.toContain('value="vm-v1"');
    expect(scripts).not.toContain('value="vm-v2"');
    expect(scripts).not.toContain('value="vm-v3"');
  });

  it("routes both Scripts and Script Delivery through the shared upload UI", () => {
    expect(main).toContain('section === "scripts" || section === "script-delivery"');
    expect(main).toContain("return renderScripts(content)");
  });
});
