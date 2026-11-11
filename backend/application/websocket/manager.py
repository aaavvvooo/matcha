import asyncio
import json
import logging
from collections.abc import Awaitable, Callable

from fastapi import WebSocket

from application.database import Database, database
from application.repository.user_repo import UserRepository
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
        self.user_repo = UserRepository(db)
        self._connections: dict[int, set[WebSocket]] = {}
        # Per-user chat limiter; lives only while the user has a socket open.
        self._message_limiters: dict[int, SlidingWindowLimiter] = {}
        # Called after a socket is unregistered (CallManager ends the socket's call from here).
        self._disconnect_hooks: list[Callable[[int, WebSocket], Awaitable[None]]] = []

    def add_disconnect_hook(self, hook: Callable[[int, WebSocket], Awaitable[None]]) -> None:
        self._disconnect_hooks.append(hook)

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
            await self.user_repo.set_online(user_id)
        return True

    async def disconnect(self, user_id: int, websocket: WebSocket) -> None:
        """Unregisters a socket (idempotent); flips the user offline with their last one.

        Never raises (a failed presence update is logged): it runs from cleanup paths, including
        the push path that drops a dead socket. The disconnect hooks run first, so the other side
        of a call hears about it before the database is touched.
        """
        sockets = self._connections.get(user_id)
        if not sockets or websocket not in sockets:
            return
        sockets.discard(websocket)
        last = not sockets
        if last:
            del self._connections[user_id]
            self._message_limiters.pop(user_id, None)
        for hook in self._disconnect_hooks:
            try:
                await hook(user_id, websocket)
            except Exception:  # a hook must never stop the socket from being cleaned up
                logger.exception("Disconnect hook failed")
        # Not if they reconnected while the hooks ran.
        if last and user_id not in self._connections:
            try:
                await self.user_repo.set_offline(user_id)
            except Exception:
                logger.exception("Could not mark a user offline")

    def is_online(self, user_id: int) -> bool:
        return user_id in self._connections

    def has_socket(self, user_id: int, websocket: WebSocket) -> bool:
        """True while `websocket` is registered for user_id (not unregistered since it was handed out)."""
        return websocket in self._connections.get(user_id, ())

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
        """Closes every open socket of user_id (e.g. on logout) and unregisters them right away,
        without waiting for the client's close handshake, so a call on one of them ends now."""
        sockets = list(self._connections.get(user_id, ()))
        await asyncio.gather(*(self._close(ws, code, reason) for ws in sockets))
        for ws in sockets:
            await self.disconnect(user_id, ws)

    def sockets_of(self, user_id: int) -> list[WebSocket]:
        return list(self._connections.get(user_id, ()))

    async def _push(self, user_id: int, sockets: list[WebSocket], payload: dict) -> int:
        """Sends payload to the given sockets of user_id; a failed one is closed and dropped.

        Never raises. The payload is serialised once, up front: one that cannot be encoded (a lone
        surrogate in a relayed string, say) is logged and dropped, and does not cost the
        recipient their connection.
        """
        if not sockets:
            return 0
        try:
            text = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
            text.encode("utf-8")
        except (TypeError, ValueError):
            logger.error("Dropping a push that cannot be serialised")
            return 0
        results = await asyncio.gather(
            *(asyncio.wait_for(ws.send_text(text), timeout=_SEND_TIMEOUT_SECONDS) for ws in sockets),
            return_exceptions=True,
        )
        delivered = 0
        for ws, result in zip(sockets, results):
            if isinstance(result, BaseException):
                logger.info("Push failed (%s); dropping that socket", type(result).__name__)
                try:
                    await self.disconnect(user_id, ws)
                    await self._close(ws, _GOING_AWAY_ERROR)
                except Exception:
                    logger.exception("Could not drop a socket after a failed push")
            else:
                delivered += 1
        return delivered

    async def send_to_user(self, user_id: int, payload: dict, exclude: WebSocket | None = None) -> int:
        """Pushes payload to every open socket of user_id (except `exclude`); returns how many got it.

        Best effort and never raises. A socket that is slow or dead is closed and
        dropped, so later pushes don't wait on it again.
        """
        sockets = [ws for ws in self._connections.get(user_id, ()) if ws is not exclude]
        return await self._push(user_id, sockets, payload)

    async def send_to_socket(self, user_id: int, websocket: WebSocket, payload: dict) -> bool:
        """Pushes payload to one specific socket of user_id (only if it is still registered)."""
        if websocket not in self._connections.get(user_id, ()):
            return False
        return await self._push(user_id, [websocket], payload) == 1


presence_manager = PresenceManager(database)
