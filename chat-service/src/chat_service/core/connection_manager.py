"""
WebSocket connection manager.

Tracks active connections per channel. When a message is sent to a channel,
it's broadcast to all currently connected WebSocket clients in that channel.
Redis pub/sub handles fan-out across multiple server instances.
"""

import json
import logging
from collections import defaultdict

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        # channel_id → set of (user_id, WebSocket)
        self._connections: dict[str, set[tuple[str, WebSocket]]] = defaultdict(set)

    async def connect(self, channel_id: str, user_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self._connections[channel_id].add((user_id, ws))
        logger.info("WS connected channel=%s user=%s", channel_id, user_id)

    def disconnect(self, channel_id: str, user_id: str, ws: WebSocket) -> None:
        self._connections[channel_id].discard((user_id, ws))
        logger.info("WS disconnected channel=%s user=%s", channel_id, user_id)

    async def broadcast(self, channel_id: str, payload: dict) -> None:
        dead: list[tuple[str, WebSocket]] = []
        for uid, ws in list(self._connections.get(channel_id, set())):
            try:
                await ws.send_text(json.dumps(payload))
            except Exception:
                dead.append((uid, ws))
        for item in dead:
            self._connections[channel_id].discard(item)

    def active_count(self, channel_id: str) -> int:
        return len(self._connections.get(channel_id, set()))


manager = ConnectionManager()
