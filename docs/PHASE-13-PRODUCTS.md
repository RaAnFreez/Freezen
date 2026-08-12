# Phase 13 — Products

## Scope

Phase 13 implements the Master Build Roadmap product-management requirements without introducing Phase 14 license-management features.

### API

Authenticated endpoints:

- `GET /api/v1/products` — list products; `products:read`.
- `GET /api/v1/products/:id` — read one product; `products:read`.
- `POST /api/v1/products` — create a product; `products:write`.
- `PATCH /api/v1/products/:id` — edit name/description/version/status; `products:write`.
- `DELETE /api/v1/products/:id` — delete an unused product; `products:write`.

Product status is `ACTIVE` or `DISABLED`.

## Authorization

The existing server-side role matrix remains authoritative:

- OWNER: full access.
- ADMIN: product read/write.
- SUPPORT: no product-management permission.

Frontend-supplied roles are not trusted.

## Validation and safety

- Product names are required and limited to 120 characters.
- Description is limited to 2,000 characters.
- Version is limited to 64 characters.
- Product names are checked case-insensitively for duplicates.
- Secrets, passwords and license plaintext are not stored or returned.
- Product mutations create audit-log entries using the existing audit table.
- A product with dependent licenses or scripts cannot be deleted; it should be disabled instead.
- Database failures return a controlled 503 response.

## Database

Phase 4 already provides the `products` table. Phase 13 does not add a redundant migration.

## Testing

`worker/tests/phase-13-products.test.js` covers:

- unauthenticated access
- product listing
- creation
- duplicate-name protection
- update/disable
- SUPPORT write denial
- deletion protection for dependent resources
- deletion of an unused product

Run:

```bash
cd worker
npm test
```

## Scope boundary

Phase 14 license-system generation/lifecycle enhancements, Phase 15 license UI, and later phases remain separate roadmap work.

**PHASE 13 COMPLETE only after implementation, tests, GitHub Checks and merge verification pass.**
