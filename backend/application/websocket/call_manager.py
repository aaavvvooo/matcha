"""In-memory state of voice / video calls (bonus B4, DESIGN.md §7).

Calls are signalled over the existing chat WebSocket; this module only keeps who is calling whom,
on which sockets, and relays the frames. Like PresenceManager's socket registry it is
per-process state: correct for the single-process Compose setup, not across several instances.

Every state change happens synchronously (no await between a check and the change they guard),
and the state is removed *before* anyone is notified, so a notification that drops a slow socket
(which re-enters through the disconnect hook) can never see a half-removed call.
"""

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any, Literal

from fastapi import WebSocket

from application.websocket.manager import PresenceManager, presence_manager
from application.websocket.rate_limit import SlidingWindowLimiter

logger = logging.getLogger(__name__)

# An unanswered invite ends after this long (tests shorten it on the instance).
RINGING_TIMEOUT_SECONDS = 45.0
# Invites per user (all their sockets together): 6 per minute.
INVITE_LIMIT = (6, 60.0)
# Signal frames one side may send in one call: 60 per 10 s (an ICE burst is about 20-30 frames,
# a restart another burst) and 600 in total.
SIGNAL_LIMIT = (60, 10.0)
MAX_SIGNALS_PER_SIDE = 600
# Above this many limiter entries, idle invite limiters are swept.
_INVITE_LIMITERS_SWEEP_AT = 256

# "checking": registered for the caller while the pair is being authorised, nothing sent yet.
CallState = Literal["checking", "ringing", "active"]


@dataclass(eq=False)
class Call:
    call_id: str
    caller: int
    callee: int
    media: str
    caller_ws: WebSocket
    state: CallState = "checking"
    callee_ws: WebSocket | None = None      # bound by the first accept
    timer: asyncio.Task[None] | None = None
    caller_limiter: SlidingWindowLimiter = field(default_factory=lambda: SlidingWindowLimiter(*SIGNAL_LIMIT))
    callee_limiter: SlidingWindowLimiter = field(default_factory=lambda: SlidingWindowLimiter(*SIGNAL_LIMIT))
    caller_signals: int = 0
    callee_signals: int = 0

    def peer_of(self, user_id: int) -> int:
        return self.callee if user_id == self.caller else self.caller


class CallManager:
    def __init__(self, presence: PresenceManager):
        self.presence = presence
        self.ringing_timeout = RINGING_TIMEOUT_SECONDS
        self._calls: dict[str, Call] = {}
        self._by_user: dict[int, Call] = {}
        self._invite_limiters: dict[int, SlidingWindowLimiter] = {}
        presence.add_disconnect_hook(self._on_socket_closed)

    # ── queries ────────────────────────────────────────────────────────────
    def get(self, call_id: str) -> Call | None:
        return self._calls.get(call_id)

    def call_of(self, user_id: int) -> Call | None:
        return self._by_user.get(user_id)

    def in_call(self, user_id: int) -> bool:
        return user_id in self._by_user

    def is_empty(self) -> bool:
        return not self._calls and not self._by_user

    def allow_invite(self, user_id: int) -> bool:
        if len(self._invite_limiters) > _INVITE_LIMITERS_SWEEP_AT:
            self._invite_limiters = {u: lim for u, lim in self._invite_limiters.items() if not lim.is_idle()}
        limiter = self._invite_limiters.setdefault(user_id, SlidingWindowLimiter(*INVITE_LIMIT))
        return limiter.allow()

    def role_of(self, call: Call, user_id: int, websocket: WebSocket) -> Literal["caller", "callee"] | None:
        """Which side this socket may act as. The caller side is its one bound socket; the callee
        side is any of the callee's sockets while ringing, then only the socket that accepted."""
        if user_id == call.caller:
            return "caller" if websocket is call.caller_ws else None
        if user_id == call.callee:
            if call.state == "ringing":
                return "callee"
            return "callee" if websocket is call.callee_ws else None
        return None

    # ── sending ────────────────────────────────────────────────────────────
    @staticmethod
    def _frame(action: str, call: Call, **fields: Any) -> dict[str, Any]:
        return {"type": "call", "action": action, "call_id": call.call_id, **fields}

    async def _send(self, user_id: int, websocket: WebSocket | None, payload: dict[str, Any]) -> None:
        if websocket is not None:
            await self.presence.send_to_socket(user_id, websocket, payload)

    # ── state primitives (synchronous) ─────────────────────────────────────
    def _start_timer(self, call: Call) -> None:
        call.timer = asyncio.create_task(self._ring_timeout(call))

    def _remove(self, call: Call) -> bool:
        """Forgets the call; False when it was already gone (so the caller does not notify twice)."""
        if self._calls.get(call.call_id) is not call:
            return False
        del self._calls[call.call_id]
        for user_id in (call.caller, call.callee):
            if self._by_user.get(user_id) is call:
                del self._by_user[user_id]
        timer, call.timer = call.timer, None
        # The timeout task ends the call itself: it must not cancel itself half way.
        if timer is not None and timer is not asyncio.current_task():
            timer.cancel()
        return True

    async def _ring_timeout(self, call: Call) -> None:
        try:
            await asyncio.sleep(self.ringing_timeout)
            if call.state == "ringing":
                await self.end(call, "timeout")
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Ringing timeout failed")

    # ── transitions ────────────────────────────────────────────────────────
    def begin(self, call_id: str, caller: int, caller_ws: WebSocket, callee: int, media: str) -> Call | str:
        """Registers a call for the caller *before* the pair is authorised, so an unlike or block
        that commits meanwhile finds and ends it (end_between). Nothing is sent to anyone.

        Returns the call, or "duplicate" (call_id in use), "busy_self" (caller already in a
        call) or "gone" (the caller's socket was unregistered meanwhile).
        """
        if call_id in self._calls:
            return "duplicate"
        if caller in self._by_user:
            return "busy_self"
        if not self.presence.has_socket(caller, caller_ws):
            return "gone"
        call = Call(call_id, caller, callee, media, caller_ws)
        self._calls[call_id] = call
        self._by_user[caller] = call
        return call

    def discard(self, call: Call) -> None:
        self._remove(call)

    async def ring(self, call: Call, caller_name: str) -> str:
        """Starts ringing every socket of the callee, once the pair has been authorised.

        Returns "ringing", "gone" (the call or the caller's socket went away meanwhile),
        "busy_peer" (callee already in a call) or "unavailable" (callee has no open socket).
        """
        if self._calls.get(call.call_id) is not call or call.state != "checking":
            return "gone"
        if not self.presence.has_socket(call.caller, call.caller_ws):
            self._remove(call)
            return "gone"
        if call.callee in self._by_user:
            self._remove(call)
            return "busy_peer"
        if not self.presence.is_online(call.callee):
            self._remove(call)
            return "unavailable"
        call.state = "ringing"
        self._by_user[call.callee] = call
        self._start_timer(call)
        try:
            delivered = await self.presence.send_to_user(call.callee, self._frame(
                "invite", call, **{"from": call.caller, "from_username": caller_name, "media": call.media},
            ))
            if delivered == 0:
                self._remove(call)
                return "unavailable"
            # The caller's socket or the whole call may have gone while the invites were going out.
            await self._send(call.caller, call.caller_ws, self._frame("ringing", call, to=call.callee))
        except Exception:
            self._remove(call)
            raise
        return "ringing"

    async def accept(self, call: Call, callee_ws: WebSocket) -> bool:
        """First accept wins: binds the callee socket, tells the caller, and tells the callee's
        other sockets. False if the call is no longer ringing."""
        if self._calls.get(call.call_id) is not call or call.state != "ringing":
            return False
        if not self.presence.has_socket(call.callee, callee_ws):
            return False  # the accepting socket was unregistered while the pair was re-checked
        call.state = "active"
        call.callee_ws = callee_ws
        timer, call.timer = call.timer, None
        if timer is not None:
            timer.cancel()
        await self._send(call.caller, call.caller_ws, self._frame("accept", call, **{"from": call.callee}))
        await self.presence.send_to_user(
            call.callee, self._frame("answered_elsewhere", call, outcome="accepted"), exclude=callee_ws,
        )
        return True

    async def decline(self, call: Call, callee_ws: WebSocket, busy: bool = False) -> None:
        if not self._remove(call):
            return
        await self._send(call.caller, call.caller_ws, self._frame("busy" if busy else "decline", call, **{
            "from": call.callee, **({"reason": "peer_in_call"} if busy else {}),
        }))
        await self.presence.send_to_user(
            call.callee, self._frame("answered_elsewhere", call, outcome="declined"), exclude=callee_ws,
        )

    async def end(self, call: Call, reason: str, by: int | None = None, skip: WebSocket | None = None,
                  action: str = "hangup") -> None:
        """Ends the call and tells the other side(s) with a `hangup` (or `cancel`) frame carrying
        `reason`. While ringing that is every callee socket, once active the two bound sockets.
        `by` is the user who ended it (None: the server did); `skip` is that user's own socket."""
        if not self._remove(call):
            return
        if call.state == "checking":
            return  # nothing was sent yet; the inviting frame's handler answers the caller
        fields: dict[str, Any] = {"reason": reason}
        if by is not None:
            fields["from"] = by
        payload = self._frame(action, call, **fields)
        if call.state == "ringing":
            targets = [(call.callee, ws) for ws in self.presence.sockets_of(call.callee)]
        else:
            targets = [(call.callee, call.callee_ws)] if call.callee_ws is not None else []
        targets.append((call.caller, call.caller_ws))
        await asyncio.gather(*(
            self._send(user_id, ws, payload) for user_id, ws in targets if ws is not skip
        ))

    async def relay_signal(self, call: Call, sender: int, sender_ws: WebSocket, sender_name: str,
                           data: dict[str, Any]) -> str | None:
        """Forwards a validated signal to the other bound socket. Returns an error code or None."""
        if call.state != "active" or call.callee_ws is None:
            return "call_not_active"
        role = self.role_of(call, sender, sender_ws)
        if role is None:
            return "unknown_call"
        if role == "caller":
            limiter, count, target_id, target_ws = call.caller_limiter, call.caller_signals, call.callee, call.callee_ws
        else:
            limiter, count, target_id, target_ws = call.callee_limiter, call.callee_signals, call.caller, call.caller_ws
        if count >= MAX_SIGNALS_PER_SIDE or not limiter.allow():
            return "rate_limited"
        if role == "caller":
            call.caller_signals += 1
        else:
            call.callee_signals += 1
        await self._send(target_id, target_ws, self._frame("signal", call, **{
            "from": sender, "from_username": sender_name, "data": data,
        }))
        return None

    async def end_between(self, a: int, b: int, reason: str = "disconnected") -> None:
        """Ends any call between a and b (unlike / block), including one still being authorised.
        Never raises."""
        try:
            for user in (a, b):
                call = self._by_user.get(user)
                if call is not None and call.peer_of(user) == (b if user == a else a):
                    await self.end(call, reason)
        except Exception:
            logger.exception("Could not end the call between two users")

    # ── lifecycle ──────────────────────────────────────────────────────────
    async def _on_socket_closed(self, user_id: int, websocket: WebSocket) -> None:
        """PresenceManager hook: a closed bound socket ends the call; the peer is told."""
        call = self._by_user.get(user_id)
        if call is None:
            return
        if user_id == call.caller:
            if websocket is call.caller_ws:
                await self.end(call, "connection_lost", skip=websocket)
        elif call.state == "active":
            if websocket is call.callee_ws:
                await self.end(call, "connection_lost", skip=websocket)
        elif not self.presence.is_online(call.callee):
            # Ringing and that was the callee's last socket: nobody is left to answer.
            await self.end(call, "connection_lost", skip=websocket)

    def shutdown(self) -> None:
        """Drops all state and timers (application shutdown)."""
        for call in list(self._calls.values()):
            self._remove(call)


call_manager = CallManager(presence_manager)
