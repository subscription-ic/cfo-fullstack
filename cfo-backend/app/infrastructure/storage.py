"""Thin wrappers around Supabase Storage operations."""

from __future__ import annotations

from supabase import Client


def ensure_bucket(supabase: Client, bucket: str) -> None:
    """Create the storage bucket if it doesn't exist (best-effort)."""
    try:
        supabase.storage.create_bucket(bucket, options={"public": False})
    except Exception:
        pass


def upload_object(
    supabase: Client,
    bucket: str,
    path: str,
    data: bytes,
    content_type: str | None,
) -> None:
    supabase.storage.from_(bucket).upload(
        path,
        data,
        file_options={"content-type": content_type or "application/octet-stream"},
    )


def remove_object(supabase: Client, bucket: str, path: str) -> None:
    """Best-effort delete; swallows errors so cascades keep running."""
    try:
        supabase.storage.from_(bucket).remove([path])
    except Exception:
        pass
