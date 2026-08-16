# Production D1 migrations

The production Worker deployment workflow intentionally does not run remote D1 migrations automatically. The GitHub Actions token is currently authorized for Worker deployment but is not authorized for the D1 API (Cloudflare code 7403).

Apply pending migrations from an authorized Cloudflare environment before using a newly introduced D1 schema:

```sh
cd worker
npx wrangler d1 migrations apply frezen-production --remote --env production
```

Do not delete migrations, reset the database, create a replacement D1 database, or change the production database binding.
