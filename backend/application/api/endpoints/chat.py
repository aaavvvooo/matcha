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
from application.schema.chat_schemas import ConversationResponse, MarkReadResponse, MessageResponse
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
_FRAME_LIMIT = (60, 10.0)    # any frame: 60 per 10 s, per connection
# Chat messages are limited per user (all their sockets together): see PresenceManager.allow_message.
_MAX_REF_LENGTH = 64         # client-chosen correlation id echoed back in message / error frames

# Close reasons the client acts on.
_REASON_AUTH_FAILED = "auth_failed"
_REASON_TOKEN_EXPIRED = "token_expired"
_REASON_TOO_MANY = "too_many_connections"


async def _authenticate(token: str) -> tuple[int, float] | None:
    """Returns (user_id, token expiry as epoch seconds) for a live access token, else None."""
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
    return (user["id"], float(exp)) if user else None


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
    user_id, expires_at = auth

    if not await presence_manager.connect(user_id, websocket):
        await _safe_close(websocket, _REASON_TOO_MANY)
        return

    chat = ChatService(database)
    frame_limiter = SlidingWindowLimiter(*_FRAME_LIMIT)
    try:
        await websocket.send_json({"type": "auth_ok"})
        while True:
            # The token was only checked at connect time: end the socket when it expires so a
            # revoked or stale credential can't keep a connection (and its pushes) alive.
            remaining = expires_at - time.time()
            if remaining <= 0:
                await _safe_close(websocket, _REASON_TOKEN_EXPIRED)
                break
            try:
                message = await asyncio.wait_for(
                    websocket.receive(), timeout=min(_PING_INTERVAL_SECONDS, remaining)
                )
            except asyncio.TimeoutError:
                if time.time() < expires_at:
                    await websocket.send_json({"type": "ping"})
                continue
            if message.get("type") == "websocket.disconnect":
                break
            if time.time() >= expires_at:
                await _safe_close(websocket, _REASON_TOKEN_EXPIRED)
                break
            await _handle_frame(websocket, user_id, message, chat, frame_limiter)
    except (WebSocketDisconnect, RuntimeError):
        # RuntimeError: send/receive on a socket the client already closed.
        pass
    finally:
        await presence_manager.disconnect(user_id, websocket)


async def _send_error(
    websocket: WebSocket, code: str, detail: str, to: int | None = None, ref: str | None = None
) -> None:
    frame: dict[str, Any] = {"type": "error", "code": code, "detail": detail}
    if to is not None:
        frame["to"] = to
    if ref is not None:
        frame["ref"] = ref
    try:
        await websocket.send_json(frame)
    except Exception:  # client already gone; its receive loop will clean up
        logger.debug("Could not deliver error frame", exc_info=True)


async def _handle_frame(
    websocket: WebSocket,
    user_id: int,
    message: Mapping[str, Any],
    chat: ChatService,
    frame_limiter: SlidingWindowLimiter,
) -> None:
    """Handles one inbound frame. Never raises: a bad frame gets an error frame, not a closed socket."""
    try:
        if not frame_limiter.allow():
            await _send_error(websocket, "rate_limited", "Too many requests, slow down")
            return

        raw = message.get("text")
        if not isinstance(raw, str):
            await _send_error(websocket, "invalid_frame", "Only text frames are supported")
            return
        if len(raw) > _MAX_FRAME_CHARS:
            await _send_error(websocket, "frame_too_large", "Message is too large")
            return

        try:
            data = json.loads(raw)
        except ValueError:
            await _send_error(websocket, "invalid_frame", "Malformed message")
            return
        if not isinstance(data, dict):
            await _send_error(websocket, "invalid_frame", "Malformed message")
            return

        frame_type = data.get("type")
        if frame_type == "pong":
            return  # keep-alive reply
        if frame_type != "message":
            await _send_error(websocket, "unknown_type", "Unsupported message type")
            return

        to = data.get("to")
        to_id = to if isinstance(to, int) and not isinstance(to, bool) and 1 <= to <= MAX_USER_ID else None
        ref = data.get("ref")
        ref = ref if isinstance(ref, str) and 0 < len(ref) <= _MAX_REF_LENGTH else None
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


# ── REST ───────────────────────────────────────────────────────────────────
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
