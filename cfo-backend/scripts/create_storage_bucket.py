"""Create the Supabase Storage bucket via API (uses SUPABASE_* and STORAGE_BUCKET from .env).

Run from the cfo-backend directory:

    python scripts/create_storage_bucket.py

Requires a service role or a key with permission to create buckets.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Make sibling scripts importable regardless of how this is invoked.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from run_init import ensure_storage_bucket  # noqa: E402


def main() -> None:
    ensure_storage_bucket()


if __name__ == "__main__":
    main()
    sys.exit(0)
