import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const main = readFileSync(join(root, "main.js"), "utf8");
const css = readFileSync(join(root, "styles.css"), "utf8");
const html = readFileSync(join(root, "../index.html"), "utf8");

describe("Phase 11 — Dashboard UI", () => {
  it("contains all roadmap navigation areas", () => {
    for (const label of ["Overview", "Licenses", "Keys", "Products", "Scripts", "Users", "HWID", "SafeLinkU", "Discord", "Analytics", "Audit Logs", "Invites", "Security", "Settings"]) expect(main).toContain(label);
  });

  it("has mobile navigation behavior", () => {
    expect(main).toContain("sidebar.classList.add(\"open\")");
    expect(css).toContain("@media(max-width:900px)");
    expect(css).toContain("transform:translateX(-102%)");
  });

  it("uses a responsive viewport and dark theme", () => {
    expect(html).toContain('name="viewport"');
    expect(css).toContain("background:#080b10");
  });

  it("does not invent live dashboard data", () => {
    expect(main).toContain("Awaiting API data");
    expect(main).not.toContain("Total Licenses`, \"100\"");
  });
});
