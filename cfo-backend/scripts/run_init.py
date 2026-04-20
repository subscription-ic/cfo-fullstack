"""Apply SQL migrations when DATABASE_URL is set; ensure storage bucket via Supabase API."""

from __future__ import annotations

import sys
from pathlib import Path

from app.core.config import get_settings, require_supabase_config
from supabase import create_client


def _migrations_dir() -> Path:
    return Path(__file__).resolve().parent.parent.parent / "migrations"


def apply_sql_migrations() -> bool:
    """Run all migrations/*.sql in lexicographic order. Returns True if any file was applied."""
    s = get_settings()
    if not s.database_url:
        print(
            "DATABASE_URL not set — skipping automatic SQL migrations.\n"
            "  Option A: Set DATABASE_URL (Supabase: Project Settings → Database → URI) and re-run.\n"
            "  Option B: Run cfo-backend/migrations/001_initial.sql in the Supabase SQL editor."
        )
        return False

    try:
        import psycopg2
    except ImportError:
        print("psycopg2-binary is not installed; cannot apply SQL migrations via DATABASE_URL.")
        return False

    files = sorted(_migrations_dir().glob("*.sql"))
    if not files:
        print("No .sql files found in migrations/.")
        return False

    conn = psycopg2.connect(s.database_url)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            for path in files:
                print(f"Applying migration: {path.name}")
                sql = path.read_text(encoding="utf-8")
                cur.execute(sql)
        print("Migrations finished.")
        return True
    finally:
        conn.close()


def ensure_storage_bucket() -> None:
    require_supabase_config()
    s = get_settings()
    client = create_client(s.supabase_url, s.supabase_key)
    bucket = s.storage_bucket
    try:
        client.storage.create_bucket(bucket, options={"public": False})
        print(f"Created storage bucket '{bucket}'.")
    except Exception as exc:
        msg = str(exc).lower()
        if "already exists" in msg or "duplicate" in msg or "resource already exists" in msg:
            print(f"Storage bucket '{bucket}' already exists.")
        else:
            print(f"Storage bucket '{bucket}': {exc}\n  Create it manually in Supabase Storage if uploads fail.")


def log_schema_hints() -> None:
    """Lightweight check at startup: log if documents table is missing (PostgREST error)."""
    try:
        require_supabase_config()
        client = create_client(get_settings().supabase_url, get_settings().supabase_key)
        client.table("documents").select("id").limit(1).execute()
    except Exception as exc:
        print(
            f"[cfo-backend] Warning: could not query 'documents' table ({exc}). "
            "Run migrations (see README) before using POST /upload."
        )


def main() -> None:
    apply_sql_migrations()
    ensure_storage_bucket()


if __name__ == "__main__":
    main()
    sys.exit(0)
