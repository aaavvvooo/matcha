import asyncio
import logging

from fastapi import WebSocket

from application.database import Database, database
from application.websocket.rate_limit import SlidingWindowLimiter

logger = logging.getLogger(__name__)

_SEND_TIMEOUT_SECONDS = 2.0
_CLOSE_TIMEOUT_SECONDS = 1.0
_GOING_AWAY_ERROR = 1011

# Open sockets per user (browser tabs / devices); extra connections are refused.
MAX_SOCKETS_PER_USER = 5
# Chat messages per user, shared by all of that user's sockets: 10 per 10 s.
MESSAGE_LIMIT = (10, 10.0)


class PresenceManager:
    """Tracks live WebSocket connections per user and mirrors presence into users.is_online.

    A user can have more than one open connection (multiple tabs/devices); is_online only
    flips to false once the last connection for that user closes.
    """

    def __init__(self, db: Database):
        self.db = db
        self._connections: dict[int, set[WebSocket]] = {}
        # Per-user chat limiter; lives only while the user has a socket open.
        self._message_limiters: dict[int, SlidingWindowLimiter] = {}

    async def connect(self, user_id: int, websocket: WebSocket) -> bool:
        """Registers an already-accepted websocket. Callers must accept() before calling this.

        Returns False (and registers nothing) when the user already has
        MAX_SOCKETS_PER_USER sockets open.
        """
        sockets = self._connections.get(user_id)
        if sockets is not None and len(sockets) >= MAX_SOCKETS_PER_USER:
            return False
        is_first_connection = sockets is None
        # No await between the cap check and the registration: the check can't race.
        self._connections.setdefault(user_id, set()).add(websocket)
        self._message_limiters.setdefault(user_id, SlidingWindowLimiter(*MESSAGE_LIMIT))
        if is_first_connection:
            await self.db.execute(
                "UPDATE users SET is_online = true WHERE id = $1", user_id
            )
        return True

    async def disconnect(self, user_id: int, websocket: WebSocket) -> None:
        """Unregisters a socket (idempotent); flips the user offline with their last one."""
        sockets = self._connections.get(user_id)
        if not sockets or websocket not in sockets:
            return
        sockets.discard(websocket)
        if not sockets:
            del self._connections[user_id]
            self._message_limiters.pop(user_id, None)
            await self.db.execute(
                "UPDATE users SET is_online = false, last_seen = NOW() WHERE id = $1",
                user_id,
            )

    def is_online(self, user_id: int) -> bool:
        return user_id in self._connections

    def allow_message(self, user_id: int) -> bool:
        """Per-user message rate limit, shared across all of the user's sockets."""
        limiter = self._message_limiters.get(user_id)
        return limiter.allow() if limiter is not None else False

    async def _close(self, websocket: WebSocket, code: int, reason: str = "") -> None:
        try:
            await asyncio.wait_for(websocket.close(code=code, reason=reason), timeout=_CLOSE_TIMEOUT_SECONDS)
        except Exception:  # already closed / unresponsive: nothing more to do
            logger.debug("Socket close failed", exc_info=True)

    async def close_user(self, user_id: int, code: int = 1008, reason: str = "logged_out") -> None:
        """Closes every open socket of user_id (e.g. on logout)."""
        sockets = list(self._connections.get(user_id, ()))
        await asyncio.gather(*(self._close(ws, code, reason) for ws in sockets))

    async def send_to_user(self, user_id: int, payload: dict) -> int:
        """Pushes payload to every open socket of user_id; returns how many got it.

        Best effort and never raises. A socket that is slow or dead is closed and
        dropped, so later pushes don't wait on it again.
        """
        sockets = list(self._connections.get(user_id, ()))
        if not sockets:
            return 0
        results = await asyncio.gather(
            *(asyncio.wait_for(ws.send_json(payload), timeout=_SEND_TIMEOUT_SECONDS) for ws in sockets),
            return_exceptions=True,
        )
        delivered = 0
        for ws, result in zip(sockets, results):
            if isinstance(result, BaseException):
                logger.info("Push failed (%s); dropping that socket", type(result).__name__)
                await self.disconnect(user_id, ws)
                await self._close(ws, _GOING_AWAY_ERROR)
            else:
                delivered += 1
        return delivered


presence_manager = PresenceManager(database)
