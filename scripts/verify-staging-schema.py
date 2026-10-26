#!/usr/bin/env python3
"""Validate the isolated staging D1 baseline with SQLite's schema engine."""

from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "worker" / "migrations-staging" / "0001_client_license_baseline.sql"

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


def main() -> None:
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

    print("Staging D1 baseline validated: required tables, columns, joins, and foreign keys are valid.")


if __name__ == "__main__":
    main()
