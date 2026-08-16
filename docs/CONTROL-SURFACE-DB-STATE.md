# Control Surface Database State

The dashboard's Key Control can operate against the existing `licenses` table without requiring the optional `products` table for read-only license inventory. Script Control remains connected to the existing server-side script APIs, but those APIs require `scripts`, `script_versions`, and related tables. When those tables are unavailable in production, the Script Manager must fail closed with a clear schema-unavailable state rather than pretending data was saved locally.

The repository must keep the existing Worker, production D1 binding, migrations, and architecture unchanged. Do not create a replacement database or delete/reset production data to resolve this condition.
