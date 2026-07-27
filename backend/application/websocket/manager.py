from fastapi import WebSocket

from application.database import Database, database


class PresenceManager:
    """Tracks live WebSocket connections per user and mirrors presence into users.is_online.

    A user can have more than one open connection (multiple tabs/devices); is_online only
    flips to false once the last connection for that user closes.
    """

    def __init__(self, db: Database):
        self.db = db
        self._connections: dict[int, set[WebSocket]] = {}

    async def connect(self, user_id: int, websocket: WebSocket) -> None:
        """Registers an already-accepted websocket. Callers must accept() before calling this."""
        is_first_connection = user_id not in self._connections
        self._connections.setdefault(user_id, set()).add(websocket)
        if is_first_connection:
            await self.db.execute(
                "UPDATE users SET is_online = true WHERE id = $1", user_id
            )

    async def disconnect(self, user_id: int, websocket: WebSocket) -> None:
        sockets = self._connections.get(user_id)
        if not sockets:
            return
        sockets.discard(websocket)
        if not sockets:
            del self._connections[user_id]
            await self.db.execute(
                "UPDATE users SET is_online = false, last_seen = NOW() WHERE id = $1",
                user_id,
            )

    def is_online(self, user_id: int) -> bool:
        return user_id in self._connections


presence_manager = PresenceManager(database)
