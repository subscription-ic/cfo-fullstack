"""Thin ingestion-API helpers: metadata parsing + validation."""

from __future__ import annotations

import json
from typing import Any


def parse_metadata_json(metadata: str) -> list[dict[str, Any]]:
    data = json.loads(metadata)
    if not isinstance(data, list):
        raise ValueError("metadata must be a JSON array")
    return data
