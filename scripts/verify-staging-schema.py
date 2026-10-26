#!/usr/bin/env python3
"""Validate staging D1 isolation and its baseline using SQLite's schema engine."""

from pathlib import Path
import sqlite3
import tomllib

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "worker" / "wrangler.toml"
MIGRATION = ROOT / "worker" / "migrations-staging" / "0001_client_license_baseline.sql"

EXPECTED_STAGING_DB_ID = "99e921da-2c62-4179-a8c5-f6a2918c0deb"
EXPECTED_PRODUCTION_DB_ID = "ff6e12e2-c59b-4891-812c-9ce0bbae64fc"

REQUIRED_COLUMNS = {
    "users": {"id"},
    "products": {"id", "status"},
    "licenses": {
        "id", "license_key_hash", "product_id", "user_id", "status",
        "expires_at", "max_devices", "updated_at",
    },
    "frezen_key_records": {"id", "license_id", "owner_id"},
    "frezen_key_limits": {"key_id", "max_devices"},
    "hwid_bindings_v2": {
        "id", "owner_id", "license_id", "hwid_hash", "game_username",
        "game_user_id", "status", "first_seen", "last_seen", "blocked_at",
        "blocked_reason",
    },
}


def validate_config() -> None:
    config = tomllib.loads(CONFIG.read_text(encoding="utf-8"))
    envs = config.get("env", {})
    staging = envs.get("staging", {})
    production = envs.get("production", {})

    staging_dbs = staging.get("d1_databases", [])
    production_dbs = production.get("d1_databases", [])
    if len(staging_dbs) != 1:
        raise SystemExit("Staging must configure exactly one D1 database binding.")
    if len(production_dbs) != 1:
        raise SystemExit("Production D1 binding configuration changed unexpectedly.")

    staging_db = staging_dbs[0]
    production_db = production_dbs[0]
    if staging_db.get("database_name") != "frezen-staging":
        raise SystemExit("Staging database name is not frezen-staging.")
    if staging_db.get("database_id") != EXPECTED_STAGING_DB_ID:
        raise SystemExit("Staging database ID does not match the saved staging database.")
    if staging_db.get("binding") != "DB":
        raise SystemExit("Staging D1 binding must be named DB.")
    if staging_db.get("migrations_dir") != "migrations-staging":
        raise SystemExit("Staging must use the isolated migrations-staging directory.")
    if production_db.get("database_name") != "frezen-production":
        raise SystemExit("Production database name changed unexpectedly.")
    if production_db.get("database_id") != EXPECTED_PRODUCTION_DB_ID:
        raise SystemExit("Production database ID changed unexpectedly.")
    for name, environment in (("staging", staging), ("production", production)):
        enabled = environment.get("vars", {}).get("FREZEN_CLIENT_LICENSE_API_ENABLED")
        if enabled != "false":
            raise SystemExit(f"FREZEN_CLIENT_LICENSE_API_ENABLED must remain false in {name}.")

    staging_assets = staging.get("assets", {})
    if staging_assets.get("directory") != "./public" or staging_assets.get("binding") != "ASSETS":
        raise SystemExit("Staging must define its own ASSETS binding.")


def main() -> None:
    validate_config()
    if not MIGRATION.is_file():
        raise SystemExit(f"Missing staging migration: {MIGRATION}")

    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys = ON")
    db.executescript(MIGRATION.read_text(encoding="utf-8"))

    for table, expected in REQUIRED_COLUMNS.items():
        columns = {
            row[1] for row in db.execute(f'PRAGMA table_info("{table}")').fetchall()
        }
        missing = expected - columns
        if missing:
            raise SystemExit(f"{table} is missing columns: {sorted(missing)}")

    # Compile the same joins used by client-license validation and HWID v2.
    db.execute(
        """
        SELECT l.id, l.license_key_hash, l.product_id, l.status,
               l.expires_at, l.max_devices
        FROM licenses l
        JOIN products p ON p.id = l.product_id
        LEFT JOIN frezen_key_records kr ON kr.license_id = l.id
        LEFT JOIN frezen_key_limits kl ON kl.key_id = kr.id
        LIMIT 0
        """
    )
    db.execute(
        """
        SELECT l.id, l.user_id, l.status, l.expires_at,
               kr.owner_id AS key_owner_id
        FROM licenses l
        LEFT JOIN frezen_key_records kr ON kr.license_id = l.id
        WHERE l.id = ?1 LIMIT 1
        """,
        ("schema-smoke-test",),
    )
    db.execute(
        """
        SELECT id, owner_id, license_id, hwid_hash, game_username, game_user_id,
               status, first_seen, last_seen, blocked_at, blocked_reason
        FROM hwid_bindings_v2 LIMIT 0
        """
    )

    db.execute(
        "INSERT INTO products (id, name, status) VALUES (?, ?, ?)",
        ("schema-test-product", "Schema Test Product", "ACTIVE"),
    )
    db.execute(
        """
        INSERT INTO licenses
          (id, license_key_hash, product_id, status, expires_at, max_devices)
        VALUES (?, ?, ?, ?, NULL, ?)
        """,
        ("schema-test-license", "a" * 64, "schema-test-product", "active", 2),
    )
    row = db.execute(
        """
        SELECT l.status, l.expires_at, l.max_devices, p.status
        FROM licenses l JOIN products p ON p.id = l.product_id
        WHERE l.id = ?
        """,
        ("schema-test-license",),
    ).fetchone()
    if row != ("active", None, 2, "ACTIVE"):
        raise SystemExit(f"Unexpected staging license schema round-trip: {row!r}")

    violations = db.execute("PRAGMA foreign_key_check").fetchall()
    if violations:
        raise SystemExit(f"Foreign-key violations in staging baseline: {violations!r}")

    print("Staging config and D1 baseline validated: isolated IDs, required schema, joins, and foreign keys are valid.")


if __name__ == "__main__":
    main()
