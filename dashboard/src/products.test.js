import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const products = readFileSync(join(root, "products.js"), "utf8");
const main = readFileSync(join(root, "main.js"), "utf8");
const css = readFileSync(join(root, "styles.css"), "utf8");

describe("Phase 13 — Products UI", () => {
  it("connects Products navigation to the product renderer", () => {
    expect(main).toContain('import { renderProducts } from "./products.js"');
    expect(main).toContain('section === "products"');
    expect(main).toContain("renderProducts(content)");
  });

  it("uses the authenticated API and product CRUD endpoints", () => {
    expect(products).toContain('credentials: "include"');
    expect(products).toContain('api("/products")');
    expect(products).toContain('method: "POST"');
    expect(products).toContain('method: "PATCH"');
    expect(products).toContain('method: "DELETE"');
  });

  it("provides product fields and safe status controls", () => {
    expect(products).toContain('maxlength="120"');
    expect(products).toContain('maxlength="2000"');
    expect(products).toContain('maxlength="64"');
    expect(products).toContain('value="ACTIVE"');
    expect(products).toContain('value="DISABLED"');
  });

  it("supports responsive product layout", () => {
    expect(css).toContain(".product-form");
    expect(css).toContain(".product-row");
    expect(css).toContain("@media(max-width:520px)");
  });
});
