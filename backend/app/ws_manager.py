"""
WebSocket Connection Manager
============================
Singleton that tracks all connected frontend clients and broadcasts
delivery events to them in real time.

Usage:
    from app.ws_manager import manager
    await manager.broadcast({"type": "delivery_event", ...})
"""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import WebSocket

log = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.append(ws)
        log.info("WS client connected (%d total)", len(self._connections))

    def disconnect(self, ws: WebSocket) -> None:
        if ws in self._connections:
            self._connections.remove(ws)
        log.info("WS client disconnected (%d total)", len(self._connections))

    async def broadcast(self, event: dict[str, Any]) -> None:
        """Send a JSON event to every connected browser client."""
        payload = json.dumps(event, default=str)
        dead: list[WebSocket] = []
        for ws in list(self._connections):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    @property
    def connection_count(self) -> int:
        return len(self._connections)


# Module-level singleton — imported by copilot router + receipts router
manager = ConnectionManager()
