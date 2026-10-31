from __future__ import annotations

import json
from typing import Any


def sse_event(payload: dict[str, Any]) -> str:
    """Serialize a tutor event using the frontend's SSE wire format."""
    return f"data: {json.dumps(payload, separators=(',', ':'))}\n\n"
