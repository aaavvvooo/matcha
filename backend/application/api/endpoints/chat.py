import asyncio
import hashlib

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from application.database import database
from application.repository.token_repo import TokenRepository
from application.repository.user_repo import UserRepository
from application.utils import decode_token
from application.websocket.manager import presence_manager

router = APIRouter()

_PING_INTERVAL_SECONDS = 25


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


@router.websocket("/ws/{token}")
async def presence_socket(websocket: WebSocket, token: str):
    user_id = await _authenticate(token)
    if user_id is None:
        await websocket.close(code=4401)
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
