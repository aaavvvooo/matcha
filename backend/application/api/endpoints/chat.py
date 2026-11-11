import asyncio
import hashlib
import json
import logging
import time
from collections.abc import Mapping
from typing import Any

from fastapi import APIRouter, Depends, Path, Query, Request, WebSocket, WebSocketDisconnect

from application.database import Database, database, get_db
from application.limiter import limiter
from application.repository.token_repo import TokenRepository
from application.repository.user_repo import UserRepository
from application.schema.chat_schemas import (
    ConversationResponse,
    IceServersResponse,
    MarkReadResponse,
    MessageResponse,
)
from application.service.call_service import CallError, CallService, build_ice_servers, is_signal_frame
from application.service.chat_service import MAX_USER_ID, ChatError, ChatService
from application.utils import decode_token, get_current_user
from application.websocket.manager import presence_manager
from application.websocket.rate_limit import SlidingWindowLimiter

logger = logging.getLogger(__name__)

router = APIRouter()

_PING_INTERVAL_SECONDS = 25
_AUTH_TIMEOUT_SECONDS = 10
_POLICY_VIOLATION = 1008

# Inbound frame limits, per connection. A message body is capped at 2000 characters
# (chat_service.MAX_BODY_LENGTH); the frame cap leaves room for JSON escaping (a body of
# 2000 quotes escapes to 4000 characters) plus the envelope.
_MAX_FRAME_CHARS = 8192
# Call signalling (SDP offer / answer, ICE candidates) is the one frame type allowed to be bigger:
# a measured Chrome audio+video offer is about 5.6 KB as a frame, so 16384 leaves ~3x headroom
# (service/call_service.py caps the SDP itself at 12000 characters).
_MAX_SIGNAL_FRAME_CHARS = 16384
_FRAME_LIMIT = (60, 10.0)    # any other frame: 60 per 10 s, per connection
# Signal frames have their own per-connection budget so an ICE burst (20-30 candidates in a
# second or two) cannot starve chat; call_manager also bounds them per call and side.
_SIGNAL_FRAME_LIMIT = (120, 10.0)
# Chat messages are limited per user (all their sockets together): see PresenceManager.allow_message.
_MAX_REF_LENGTH = 64         # client-chosen correlation id echoed back in message / error frames

# Close reasons the client acts on.
_REASON_AUTH_FAILED = "auth_failed"
_REASON_TOKEN_EXPIRED = "token_expired"
_REASON_TOO_MANY = "too_many_connections"


class _Session:
    """What the receive loop shares with the frame handler for one socket."""

    def __init__(self, user_id: int, username: str, expires_at: float):
        self.user_id = user_id
        self.username = username
        self.expires_at = expires_at   # extended by an in-band re-auth frame
        self.close_reason: str | None = None   # set by a handler that wants the socket closed


async def _authenticate(token: str) -> tuple[int, float, str] | None:
    """Returns (user_id, token expiry as epoch seconds, username) for a live access token, else None."""
    payload = decode_token(token)
    # Only access tokens authenticate; a refresh JWT must not.
    if not payload or payload.get("type") != "access":
        return None
    exp = payload.get("exp")
    if not isinstance(exp, (int, float)):
        return None

    token_repo = TokenRepository(database)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    if await token_repo.is_token_blacklisted(token_hash):
        return None

    username = payload.get("sub")
    if not username:
        return None

    user_repo = UserRepository(database)
    user = await user_repo.get_user_by_username(username)
    return (user["id"], float(exp), str(username)) if user else None


async def _await_token(websocket: WebSocket) -> str | None:
    """Waits for the client's first message, expected to be {"type": "auth", "token": "..."}.

    Returns None if the message is missing/invalid, doesn't arrive in time, or the
    client disconnected before authenticating.
    """
    try:
        raw = await asyncio.wait_for(websocket.receive_text(), timeout=_AUTH_TIMEOUT_SECONDS)
    except (asyncio.TimeoutError, WebSocketDisconnect):
        return None

    try:
        data = json.loads(raw)
    except (TypeError, ValueError):
        return None

    if not isinstance(data, dict) or data.get("type") != "auth":
        return None
    token = data.get("token")
    return token if isinstance(token, str) and token else None


async def _safe_close(websocket: WebSocket, reason: str = _REASON_AUTH_FAILED) -> None:
    """Closes the socket, tolerating a client that already disconnected.

    The underlying `websockets` library can raise AttributeError (not just
    RuntimeError) when closing a connection whose reader task already exited.
    """
    try:
        await websocket.close(code=_POLICY_VIOLATION, reason=reason)
    except (RuntimeError, AttributeError):
        pass


@router.websocket("/ws")
async def presence_socket(websocket: WebSocket):
    await websocket.accept()

    token = await _await_token(websocket)
    if token is None:
        await _safe_close(websocket)
        return

    auth = await _authenticate(token)
    if auth is None:
        await _safe_close(websocket)
        return
    user_id, expires_at, username = auth
    session = _Session(user_id, username, expires_at)

    if not await presence_manager.connect(user_id, websocket):
        await _safe_close(websocket, _REASON_TOO_MANY)
        return

    chat = ChatService(database)
    calls = CallService(database)
    frame_limiter = SlidingWindowLimiter(*_FRAME_LIMIT)
    signal_limiter = SlidingWindowLimiter(*_SIGNAL_FRAME_LIMIT)
    try:
        await websocket.send_json({"type": "auth_ok"})
        while True:
            # The token is checked at connect time and on every re-auth frame: end the socket when
            # it expires so a revoked or stale credential can't keep a connection (and its pushes)
            # alive. A client with a live session sends a fresh token before that (docs §7).
            remaining = session.expires_at - time.time()
            if remaining <= 0:
                await _safe_close(websocket, _REASON_TOKEN_EXPIRED)
                break
            try:
                message = await asyncio.wait_for(
                    websocket.receive(), timeout=min(_PING_INTERVAL_SECONDS, remaining)
                )
            except asyncio.TimeoutError:
                if time.time() < session.expires_at:
                    await websocket.send_json({"type": "ping"})
                continue
            if message.get("type") == "websocket.disconnect":
                break
            if time.time() >= session.expires_at:
                await _safe_close(websocket, _REASON_TOKEN_EXPIRED)
                break
            await _handle_frame(
                websocket, session, message, chat, calls, frame_limiter, signal_limiter
            )
            if session.close_reason is not None:
                await _safe_close(websocket, session.close_reason)
                break
    except (WebSocketDisconnect, RuntimeError):
        # RuntimeError: send/receive on a socket the client already closed.
        pass
    finally:
        # Shielded: if this task is cancelled mid-cleanup (server shutdown), the socket is still
        # unregistered, the user flipped offline and the other side of a call told.
        await _shielded_disconnect(user_id, websocket)


async def _shielded_disconnect(user_id: int, websocket: WebSocket) -> None:
    task = asyncio.ensure_future(presence_manager.disconnect(user_id, websocket))
    task.add_done_callback(_log_task_failure)
    await asyncio.shield(task)


def _log_task_failure(task: "asyncio.Future[None]") -> None:
    if not task.cancelled() and task.exception() is not None:
        logger.error("Socket cleanup failed", exc_info=task.exception())


async def _send_error(
    websocket: WebSocket, code: str, detail: str, to: int | None = None, ref: str | None = None,
    call_id: str | None = None,
) -> None:
    frame: dict[str, Any] = {"type": "error", "code": code, "detail": detail}
    if to is not None:
        frame["to"] = to
    if ref is not None:
        frame["ref"] = ref
    if call_id is not None:
        frame["call_id"] = call_id
    try:
        await websocket.send_json(frame)
    except Exception:  # client already gone; its receive loop will clean up
        logger.debug("Could not deliver error frame", exc_info=True)


def _parse_frame(raw: str) -> dict[str, Any] | None:
    """The frame as a JSON object, or None when it isn't one. Callers charge a rate limiter first."""
    try:
        data = json.loads(raw)
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


def _clean_ref(value: Any) -> str | None:
    # Echoed back to the client: printable ASCII only (the client's own refs are), so a lone
    # surrogate can never reach the socket encoder.
    if isinstance(value, str) and 0 < len(value) <= _MAX_REF_LENGTH and value.isascii() and value.isprintable():
        return value
    return None


async def _handle_frame(
    websocket: WebSocket,
    session: _Session,
    message: Mapping[str, Any],
    chat: ChatService,
    calls: CallService,
    frame_limiter: SlidingWindowLimiter,
    signal_limiter: SlidingWindowLimiter,
) -> None:
    """Handles one inbound frame. Never raises: a bad frame gets an error frame, not a closed socket."""
    user_id = session.user_id
    try:
        raw = message.get("text")
        if not isinstance(raw, str):
            if not frame_limiter.allow():
                await _send_error(websocket, "rate_limited", "Too many requests, slow down")
                return
            await _send_error(websocket, "invalid_frame", "Only text frames are supported")
            return

        # Rate limit before parsing anything. A frame that may be a call signal (a cheap substring
        # test, no parsing) is charged to the signal budget, any other to the general one.
        maybe_signal = '"signal"' in raw
        if not (signal_limiter if maybe_signal else frame_limiter).allow():
            await _send_error(websocket, "rate_limited", "Too many requests, slow down")
            return
        if len(raw) > _MAX_SIGNAL_FRAME_CHARS or (len(raw) > _MAX_FRAME_CHARS and not maybe_signal):
            await _send_error(websocket, "frame_too_large", "Message is too large")
            return

        data = _parse_frame(raw)
        if data is None:
            await _send_error(websocket, "invalid_frame", "Malformed message")
            return
        is_signal = is_signal_frame(data)
        if maybe_signal and not is_signal and not frame_limiter.allow():
            # Only looked like a signal: it counts against the general budget too.
            await _send_error(websocket, "rate_limited", "Too many requests, slow down")
            return
        if len(raw) > _MAX_FRAME_CHARS and not is_signal:
            await _send_error(websocket, "frame_too_large", "Message is too large")
            return

        frame_type = data.get("type")
        if frame_type == "pong":
            return  # keep-alive reply
        if frame_type == "auth":
            await _reauthenticate(websocket, session, data)
            return
        if frame_type == "call":
            try:
                await calls.handle(user_id, session.username, websocket, data)
            except CallError as e:
                await _send_error(websocket, e.code, e.detail, call_id=e.call_id)
            return
        if frame_type != "message":
            await _send_error(websocket, "unknown_type", "Unsupported message type")
            return

        to = data.get("to")
        to_id = to if isinstance(to, int) and not isinstance(to, bool) and 1 <= to <= MAX_USER_ID else None
        ref = _clean_ref(data.get("ref"))
        if not presence_manager.allow_message(user_id):
            await _send_error(websocket, "rate_limited", "You are sending messages too fast", to_id, ref)
            return
        try:
            await chat.send_message(user_id, data, ref)
        except ChatError as e:
            await _send_error(websocket, e.code, e.detail, to_id, ref)
    except Exception:
        # Anything unexpected (DB down, ...): log server-side, tell the client nothing specific.
        logger.exception("Unhandled error while handling a WebSocket frame")
        await _send_error(websocket, "server_error", "Something went wrong, please try again")


async def _reauthenticate(websocket: WebSocket, session: _Session, data: Mapping[str, Any]) -> None:
    """In-band token renewal: `{"type":"auth","token":"<access>"}` on an open socket.

    Validated exactly like the first frame (signature, access type, not blacklisted); it must be
    the same user, otherwise the socket is closed. On success the socket's expiry moves to the new
    token's, so a call or chat outlives the 15-minute access token, and `auth_ok` answers.
    """
    token = data.get("token")
    auth = await _authenticate(token) if isinstance(token, str) and token else None
    if auth is None:
        await _send_error(websocket, "auth_failed", "Could not renew the session")
        return
    new_id, new_exp, _username = auth
    if new_id != session.user_id:
        session.close_reason = _REASON_AUTH_FAILED
        return
    session.expires_at = max(session.expires_at, new_exp)
    await websocket.send_json({"type": "auth_ok"})


# ── REST ───────────────────────────────────────────────────────────────────
@router.get("/ice-servers", response_model=IceServersResponse)
@limiter.limit("30/minute")
async def get_ice_servers(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    return build_ice_servers()


@router.get("/conversations", response_model=list[ConversationResponse])
@limiter.limit("60/minute")
async def list_conversations(
    request: Request,
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return await ChatService(db).list_conversations(current_user["user"]["id"])


@router.get("/messages/{user_id}", response_model=list[MessageResponse])
@limiter.limit("120/minute")
async def get_messages(
    request: Request,
    user_id: int = Path(..., ge=1, le=MAX_USER_ID),
    limit: int = Query(50, ge=1, le=100),
    before_id: int | None = Query(None, ge=1, le=MAX_USER_ID),
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return await ChatService(db).get_messages(current_user["user"]["id"], user_id, limit, before_id)


@router.post("/messages/{user_id}/read", response_model=MarkReadResponse)
@limiter.limit("120/minute")
async def mark_messages_read(
    request: Request,
    user_id: int = Path(..., ge=1, le=MAX_USER_ID),
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    updated = await ChatService(db).mark_read(current_user["user"]["id"], user_id)
    return MarkReadResponse(updated=updated)
