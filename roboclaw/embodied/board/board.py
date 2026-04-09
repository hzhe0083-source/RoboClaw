"""Board — per-session unified state source (看板).

Writers: OutputConsumer writes parsed subprocess output.
Readers: Agent and Frontend read current state and logs.
Commands: Agent and Frontend post commands (save, discard, stop).
"""

from __future__ import annotations

import threading
import time
from collections import deque
from typing import Any

from roboclaw.embodied.board.constants import SessionState
from roboclaw.embodied.events import EventBus, SessionStateChangedEvent

IDLE_STATE: dict[str, Any] = {
    "state": SessionState.IDLE,
    "episode_phase": "",
    "saved_episodes": 0,
    "current_episode": 0,
    "target_episodes": 0,
    "total_frames": 0,
    "elapsed_seconds": 0.0,
    "dataset": None,
    "rerun_web_port": 0,
    "error": "",
}


class Board:
    def __init__(self, event_bus: EventBus | None = None, max_log_lines: int = 200) -> None:
        self._bus = event_bus
        self._lock = threading.Lock()
        self._state: dict[str, Any] = dict(IDLE_STATE)
        self._commands: deque[str] = deque()
        self._log: deque[str] = deque(maxlen=max_log_lines)
        self._start_time: float = 0.0
        self._input_consumer_notify: Any = None  # set by Session when wiring InputConsumer

    # ── State (OutputConsumer writes, Agent/Frontend reads) ──

    @property
    def state(self) -> dict[str, Any]:
        """Thread-safe state snapshot."""
        with self._lock:
            s = dict(self._state)
            if self._start_time and s["state"] not in (SessionState.IDLE, SessionState.ERROR):
                s["elapsed_seconds"] = round(time.monotonic() - self._start_time, 1)
            return s

    async def update(self, **fields: Any) -> None:
        """Update state fields and emit SessionStateChangedEvent.

        Only emits if at least one field actually changed.
        """
        with self._lock:
            changed = any(self._state.get(k) != v for k, v in fields.items())
            if not changed:
                return
            self._state.update(fields)
            snapshot = dict(self._state)
            if self._start_time and snapshot["state"] not in (SessionState.IDLE, SessionState.ERROR):
                snapshot["elapsed_seconds"] = round(time.monotonic() - self._start_time, 1)
        if self._bus:
            await self._bus.emit(SessionStateChangedEvent(**snapshot))

    def start_timer(self) -> None:
        with self._lock:
            self._start_time = time.monotonic()

    def reset(self) -> None:
        """Reset to initial idle state."""
        with self._lock:
            self._state = dict(IDLE_STATE)
            self._commands.clear()
            self._start_time = 0.0

    def get(self, key: str, default: Any = None) -> Any:
        """Read a single state field without full snapshot copy."""
        with self._lock:
            return self._state.get(key, default)

    # ── Commands (Agent/Frontend writes, InputConsumer reads) ──

    def post_command(self, command: str) -> None:
        """Post a command. Thread-safe. Called by Agent/Frontend."""
        with self._lock:
            self._commands.append(command)
        if self._input_consumer_notify:
            self._input_consumer_notify()

    def poll_command(self) -> str | None:
        """Take one command. Called by InputConsumer."""
        with self._lock:
            return self._commands.popleft() if self._commands else None

    # ── Logs (OutputConsumer writes, Agent/Frontend reads) ──

    def log(self, line: str) -> None:
        with self._lock:
            self._log.append(line)

    def recent_logs(self, n: int = 20) -> list[str]:
        with self._lock:
            return list(self._log)[-n:]
