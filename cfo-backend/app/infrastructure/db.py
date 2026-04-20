"""Supabase client factory. Single place that constructs the client."""

from __future__ import annotations

from supabase import Client, create_client

from app.core.config import get_settings, require_supabase_config


def get_supabase_client() -> Client:
    """Return a fresh Supabase client using configured URL + key."""
    require_supabase_config()
    s = get_settings()
    return create_client(s.supabase_url, s.supabase_key)
