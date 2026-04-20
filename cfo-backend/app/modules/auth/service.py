"""Development JWT auth (admin / admin). Replace with Supabase Auth later."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import get_settings


def verify_dev_credentials(username: str, password: str) -> bool:
    s = get_settings()
    return username == s.admin_username and password == s.admin_password


def create_access_token(subject: str) -> str:
    s = get_settings()
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=s.jwt_expire_minutes)
    payload = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, s.jwt_secret, algorithm=s.jwt_algorithm)


def decode_token(token: str) -> str | None:
    s = get_settings()
    try:
        data = jwt.decode(token, s.jwt_secret, algorithms=[s.jwt_algorithm])
        sub = data.get("sub")
        return str(sub) if sub else None
    except jwt.PyJWTError:
        return None
