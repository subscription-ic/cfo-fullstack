"""FastAPI dependencies: Supabase client and auth."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client

from app.infrastructure.db import get_supabase_client
from app.modules.auth.service import decode_token

_bearer = HTTPBearer(auto_error=False)


def get_supabase() -> Client:
    return get_supabase_client()


async def get_current_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> str:
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    sub = decode_token(creds.credentials)
    if sub is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return sub


SupabaseDep = Annotated[Client, Depends(get_supabase)]
CurrentUserDep = Annotated[str, Depends(get_current_user)]
