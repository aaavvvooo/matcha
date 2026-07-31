import asyncio
import hashlib
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from application.database import database
from application.repository.token_repo import TokenRepository
from application.repository.user_repo import UserRepository
from application.utils import decode_token
from application.websocket.manager import presence_manager

router = APIRouter()

_PING_INTERVAL_SECONDS = 25
_AUTH_TIMEOUT_SECONDS = 10
_POLICY_VIOLATION = 1008


async def _authenticate(token: str) -> int | None:
    payload = decode_token(token)
    if not payload:
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
    return user["id"] if user else None


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


@router.websocket("/ws")
async def presence_socket(websocket: WebSocket):
    await websocket.accept()

    token = await _await_token(websocket)
    if token is None:
        try:
            await websocket.close(code=_POLICY_VIOLATION)
        except RuntimeError:
            pass  # client already disconnected
        return

    user_id = await _authenticate(token)
    if user_id is None:
        await websocket.close(code=_POLICY_VIOLATION)
        return

    await presence_manager.connect(user_id, websocket)
    try:
        while True:
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=_PING_INTERVAL_SECONDS)
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "ping"})
    except WebSocketDisconnect:
        pass
    finally:
        await presence_manager.disconnect(user_id, websocket)
