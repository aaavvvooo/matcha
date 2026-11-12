import time
from collections import deque


class SlidingWindowLimiter:
    """Allows at most `limit` events per `window` seconds. One instance per connection."""

    def __init__(self, limit: int, window: float):
        self.limit = limit
        self.window = window
        self._events: deque[float] = deque()

    def allow(self) -> bool:
        now = time.monotonic()
        cutoff = now - self.window
        while self._events and self._events[0] <= cutoff:
            self._events.popleft()
        if len(self._events) >= self.limit:
            return False
        self._events.append(now)
        return True

    def is_idle(self) -> bool:
        """True when no event is still inside the window (the limiter can be dropped)."""
        cutoff = time.monotonic() - self.window
        while self._events and self._events[0] <= cutoff:
            self._events.popleft()
        return not self._events
