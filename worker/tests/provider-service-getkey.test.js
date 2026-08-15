import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

describe("Provider / Service / SafeLinkU GetKey integration UI", () => {
  it("keeps the configured link owned by Services", () => {
    const service = read("public/dashboard/service-panel.js");
    expect(service).toContain("configured_link: keyUrl(slug)");
    expect(service).toContain("Configured Link stays in Services");
    expect(service).not.toContain("service-provider-name");
  });

  it("keeps provider configuration in its own tabbed editor", () => {
    const provider = read("public/dashboard/provider-panel.js");
    expect(provider).toContain("General");
    expect(provider).toContain("Checkpoints");
    expect(provider).toContain("Keys");
    expect(provider).toContain("Protection");
    expect(provider).toContain("Requirements");
    expect(provider).toContain("frezen.safelinku.checkpoints.v1");
    expect(provider).toContain("The Configured Link belongs to the Service");
  });

  it("feeds SafeLinkU checkpoint definitions into Providers", () => {
    const safe = read("public/dashboard/safelinku-panel.js");
    const provider = read("public/dashboard/provider-panel.js");
    expect(safe).toContain("frezen.safelinku.checkpoints.v1");
    expect(safe).toContain("New checkpoint");
    expect(provider).toContain("Checkpoints created in the SafeLinkU tab appear here.");
    expect(provider).toContain("provider-checkpoint");
  });

  it("keeps the three dashboard panels separately routable", () => {
    const main = read("public/dashboard/main.js");
    expect(main).toContain("['safelinku','SafeLinkU'");
    expect(main).toContain("['services','Services'");
    expect(main).toContain("['provider','Provider'");
  });
});
