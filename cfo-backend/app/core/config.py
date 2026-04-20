"""Application configuration from environment."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _find_env_file(start: Path) -> Path | None:
    for directory in [start, *start.parents]:
        candidate = directory / ".env"
        if candidate.is_file():
            return candidate
    return None


_backend_root = Path(__file__).resolve().parent.parent
_env_path = _find_env_file(_backend_root)
if _env_path:
    load_dotenv(dotenv_path=_env_path)
else:
    load_dotenv()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_env_path) if _env_path else ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    supabase_url: str = ""
    supabase_key: str = ""
    database_url: str | None = None

    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = Field(default=60 * 24)

    admin_username: str = "admin"
    admin_password: str = "admin"

    openai_api_key: str | None = None
    embedding_model: str = "text-embedding-3-small"
    embedding_dimension: int = 1536
    openai_chat_model: str = "gpt-4o-mini"

    storage_bucket: str = "company-docs"


@lru_cache
def get_settings() -> Settings:
    return Settings()


def require_supabase_config() -> None:
    s = get_settings()
    if not s.supabase_url or not s.supabase_key:
        raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in the environment or .env file.")
