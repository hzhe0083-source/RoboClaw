"""Consumers — bridge between subprocess I/O and the Board."""

from __future__ import annotations

import asyncio
from contextlib import suppress
from typing import TYPE_CHECKING

from roboclaw.embodied.board.constants import Command

if TYPE_CHECKING:
    from roboclaw.embodied.board.board import Board


class Consumer:
    """Base class for Board I/O consumers."""

    def __init__(self, board: Board) -> None:
        self.board = board
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()
            with suppress(asyncio.CancelledError):
                await self._task
            self._task = None

    async def _run(self) -> None:
        raise NotImplementedError


class OutputConsumer(Consumer):
    """Reads subprocess stdout, parses lines, updates Board.

    Subclasses override parse_line() for operation-specific parsing.
    """

    def __init__(self, board: Board, stdout: asyncio.StreamReader) -> None:
        super().__init__(board)
        self._stdout = stdout

    async def _run(self) -> None:
        try:
            async for raw in self._stdout:
                line = raw.decode("utf-8", errors="replace").rstrip("\n")
                if not line:
                    continue
                self.board.log(line)
                await self.parse_line(line)
        except (OSError, ConnectionError):
            pass

    async def parse_line(self, line: str) -> None:
        """Override in subclasses for operation-specific parsing."""


class InputConsumer(Consumer):
    """Reads commands from Board, translates to stdin bytes for subprocess."""

    _KEYMAP: dict[str, bytes] = {
        Command.SAVE_EPISODE: b"\x1b[C",       # right arrow
        Command.DISCARD_EPISODE: b"\x1b[D",    # left arrow
        Command.SKIP_RESET: b"\x1b[C",         # right arrow
        Command.STOP: b"\x1b",                 # ESC
        Command.CONFIRM: b"\n",                # Enter
    }

    def __init__(self, board: Board, stdin: asyncio.StreamWriter) -> None:
        super().__init__(board)
        self._stdin = stdin
        self._notify = asyncio.Event()

    def _on_command_posted(self) -> None:
        """Called by Board when a command is posted. Wakes the consumer."""
        self._notify.set()

    async def _run(self) -> None:
        try:
            while True:
                await self._notify.wait()
                self._notify.clear()
                while (cmd := self.board.poll_command()) is not None:
                    data = self.translate(cmd)
                    if data:
                        self._stdin.write(data)
                        await self._stdin.drain()
        except (OSError, ConnectionError, asyncio.CancelledError):
            pass

    def translate(self, command: str) -> bytes | None:
        """Command string -> stdin bytes. Subclasses can override."""
        return self._KEYMAP.get(command)
