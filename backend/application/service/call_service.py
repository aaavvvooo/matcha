"""Voice / video call signalling over the chat WebSocket (DESIGN.md §7, EPICS B4).

This layer validates and authorises `{"type":"call"}` frames; CallManager holds the state and
does the relaying. Errors are `CallError`s (a machine-readable code plus a safe detail).
"""

import re
from typing import Any

from fastapi import WebSocket

from application.config import STUN_URL, TURN_CREDENTIAL, TURN_URL, TURN_USERNAME
from application.database import Database
from application.repository.chat_repo import ChatRepository
from application.schema.chat_schemas import IceServer, IceServersResponse
from application.service.chat_service import MAX_USER_ID, NOT_CONNECTED_DETAIL
from application.websocket.call_manager import Call, call_manager

# Longest accepted session description / candidate line, in characters. A measured Chrome
# audio+video offer is about 5 KB (DESIGN.md §7); this leaves room for more codecs and extensions.
MAX_SDP_CHARS = 12_000
MAX_CANDIDATE_CHARS = 1024
_MAX_SHORT_FIELD = 256

_CALL_ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
_MEDIA = ("audio", "video")
_ACTIONS = ("invite", "accept", "decline", "busy", "cancel", "hangup", "signal")

_NO_SUCH_CALL = "This call is no longer available"


class CallError(Exception):
    """A rejected call frame. `code` is machine-readable, `detail` is safe to show the user."""

    def __init__(self, code: str, detail: str, call_id: str | None = None):
        super().__init__(code)
        self.code = code
        self.detail = detail
        self.call_id = call_id


def is_signal_frame(data: dict[str, Any]) -> bool:
    """True for an SDP / ICE relay frame, the only frame type allowed to exceed the 8192-character cap."""
    return data.get("type") == "call" and data.get("action") == "signal"


def _int_id(value: Any) -> int | None:
    # bool is an int subclass; reject it explicitly.
    if isinstance(value, int) and not isinstance(value, bool) and 1 <= value <= MAX_USER_ID:
        return value
    return None


_CONTROL_RE = re.compile(r"[\x00-\x1f\x7f]")
_CONTROL_EXCEPT_CRLF_RE = re.compile(r"[\x00-\x09\x0b\x0c\x0e-\x1f\x7f]")


def _plain(value: Any, limit: int, *, multiline: bool = False) -> bool:
    """A string of at most `limit` ASCII characters without control characters (an SDP may keep
    CR / LF). ASCII only: real SDP and ICE strings are, and anything else (a lone surrogate
    in particular) must never reach the peer's socket encoder."""
    if not isinstance(value, str) or len(value) > limit or not value.isascii():
        return False
    return not (_CONTROL_EXCEPT_CRLF_RE if multiline else _CONTROL_RE).search(value)


def _opt_plain(value: Any, limit: int) -> bool:
    return value is None or _plain(value, limit)


def validate_signal_data(data: Any) -> dict[str, Any] | None:
    """Returns a clean copy of an allowed signal payload, or None.

    Allowed: `{"kind":"offer"|"answer","sdp":str}` and
    `{"kind":"candidate","candidate":{candidate, sdpMid, sdpMLineIndex, usernameFragment}}`;
    exactly those keys, nothing else is ever relayed.
    """
    if not isinstance(data, dict):
        return None
    kind = data.get("kind")
    if kind in ("offer", "answer"):
        sdp = data.get("sdp")
        if set(data) != {"kind", "sdp"} or not _plain(sdp, MAX_SDP_CHARS, multiline=True):
            return None
        if not sdp or not sdp.startswith("v=0"):
            return None
        return {"kind": kind, "sdp": sdp}
    if kind == "candidate":
        cand = data.get("candidate")
        if set(data) != {"kind", "candidate"} or not isinstance(cand, dict):
            return None
        if set(cand) - {"candidate", "sdpMid", "sdpMLineIndex", "usernameFragment"}:
            return None
        line = cand.get("candidate")
        if not _plain(line, MAX_CANDIDATE_CHARS) or not isinstance(line, str) or not re.match(r"^(a=)?candidate:", line):
            return None
        mid = cand.get("sdpMid")
        index = cand.get("sdpMLineIndex")
        ufrag = cand.get("usernameFragment")
        if not _opt_plain(mid, _MAX_SHORT_FIELD) or not _opt_plain(ufrag, _MAX_SHORT_FIELD):
            return None
        if index is not None and (not isinstance(index, int) or isinstance(index, bool) or not 0 <= index <= 255):
            return None
        return {"kind": "candidate", "candidate": {
            "candidate": line,
            "sdpMid": mid,
            "sdpMLineIndex": index,
            "usernameFragment": ufrag,
        }}
    return None


def build_ice_servers() -> IceServersResponse:
    """STUN, plus a TURN relay when TURN_URL / TURN_USERNAME / TURN_CREDENTIAL are all configured."""
    servers = [IceServer(urls=[STUN_URL])]
    if TURN_URL and TURN_USERNAME and TURN_CREDENTIAL:
        urls = [u.strip() for u in TURN_URL.split(",") if u.strip()]
        if urls:
            servers.append(IceServer(urls=urls, username=TURN_USERNAME, credential=TURN_CREDENTIAL))
    return IceServersResponse(ice_servers=servers)


class CallService:
    def __init__(self, db: Database):
        self.chat_repo = ChatRepository(db)

    async def handle(self, user_id: int, username: str, websocket: WebSocket, frame: dict[str, Any]) -> None:
        """Handles one `{"type":"call"}` frame. Raises CallError for anything the sender can fix."""
        action = frame.get("action")
        raw_id = frame.get("call_id")
        call_id = raw_id if isinstance(raw_id, str) and _CALL_ID_RE.match(raw_id) else None
        if action not in _ACTIONS:
            raise CallError("invalid_call", "Unsupported call action", call_id)
        if call_id is None:
            raise CallError("invalid_call", "Invalid call")
        to = _int_id(frame.get("to"))
        if to is None or to == user_id:
            raise CallError("invalid_recipient", "Choose someone to call", call_id)

        if action == "invite":
            await self._invite(user_id, username, websocket, call_id, to, frame.get("media"))
            return

        # Foreign, unknown and finished calls all look the same; so does naming the wrong peer.
        call = call_manager.get(call_id)
        if call is None or user_id not in (call.caller, call.callee) or call.peer_of(user_id) != to:
            raise CallError("unknown_call", _NO_SUCH_CALL, call_id)
        role = call_manager.role_of(call, user_id, websocket)
        if role is None:
            raise CallError("unknown_call", _NO_SUCH_CALL, call_id)

        if action == "signal":
            data = validate_signal_data(frame.get("data"))
            if data is None:
                raise CallError("invalid_signal", "Invalid call data", call_id)
            error = await call_manager.relay_signal(call, user_id, websocket, username, data)
            if error == "rate_limited":
                raise CallError("rate_limited", "Too many call messages, slow down", call_id)
            if error == "call_not_active":
                raise CallError("call_not_active", "The call has not been answered yet", call_id)
            if error is not None:
                raise CallError("unknown_call", _NO_SUCH_CALL, call_id)
        elif action == "accept":
            await self._accept(call, role, websocket)
        elif action in ("decline", "busy"):
            if role != "callee" or call.state != "ringing":
                raise CallError("unknown_call", _NO_SUCH_CALL, call_id)
            await call_manager.decline(call, websocket, busy=action == "busy")
        elif action == "cancel" and role == "caller" and call.state == "ringing":
            await call_manager.end(call, "cancelled", by=user_id, skip=websocket, action="cancel")
        elif action in ("cancel", "hangup"):
            if role == "callee" and call.state == "ringing":
                await call_manager.decline(call, websocket)  # hanging up on an unanswered ring is a decline
            else:
                await call_manager.end(call, "hangup", by=user_id, skip=websocket)

    async def _invite(self, user_id: int, username: str, websocket: WebSocket,
                      call_id: str, to: int, media: Any) -> None:
        if media not in _MEDIA:
            raise CallError("invalid_media", "Choose an audio or video call", call_id)
        if not call_manager.allow_invite(user_id):
            raise CallError("rate_limited", "You are calling too often, try again in a minute", call_id)
        # Registered before the pair is checked, so an unlike / block that commits meanwhile finds
        # this call and ends it (CallManager.end_between) instead of it ringing afterwards.
        call = call_manager.begin(call_id, user_id, websocket, to, media)
        if call == "duplicate":
            raise CallError("invalid_call", "Invalid call", call_id)
        if call == "busy_self":
            await self._tell(user_id, websocket, "busy", call_id, to, reason="you_in_call")
            return
        if isinstance(call, str):  # "gone": this socket was closed while the frame was handled
            return
        try:
            # Same answer for "never connected", "unliked", "blocked" and "no such user" (see chat).
            allowed = await self.chat_repo.can_chat(user_id, to)
        except BaseException:
            call_manager.discard(call)
            raise
        if call_manager.get(call_id) is not call:
            raise CallError("not_connected", NOT_CONNECTED_DETAIL, call_id)  # ended by an unlike / block meanwhile
        if not allowed:
            call_manager.discard(call)
            raise CallError("not_connected", NOT_CONNECTED_DETAIL, call_id)
        outcome = await call_manager.ring(call, username)
        if outcome == "busy_peer":
            await self._tell(user_id, websocket, "busy", call_id, to, reason="peer_in_call")
        elif outcome == "unavailable":
            await self._tell(user_id, websocket, "unavailable", call_id, to)

    async def _accept(self, call: Call, role: str, websocket: WebSocket) -> None:
        if role != "callee" or call.state != "ringing":
            raise CallError("unknown_call", _NO_SUCH_CALL, call.call_id)
        # The pair may have been unliked or blocked while it rang: check again before connecting them.
        allowed = await self.chat_repo.can_chat(call.caller, call.callee)
        if call_manager.get(call.call_id) is not call or call.state != "ringing":
            raise CallError("unknown_call", _NO_SUCH_CALL, call.call_id)  # ended, or another tab won
        if not allowed:
            await call_manager.end(call, "disconnected")
            raise CallError("not_connected", NOT_CONNECTED_DETAIL, call.call_id)
        if not await call_manager.accept(call, websocket):
            raise CallError("unknown_call", _NO_SUCH_CALL, call.call_id)

    @staticmethod
    async def _tell(user_id: int, websocket: WebSocket, action: str, call_id: str, peer: int, **fields: Any) -> None:
        await call_manager.presence.send_to_socket(user_id, websocket, {
            "type": "call", "action": action, "call_id": call_id, "from": peer, **fields,
        })
