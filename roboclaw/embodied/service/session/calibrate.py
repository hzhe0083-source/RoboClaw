"""Calibration Session — runs lerobot-calibrate subprocess per arm.

Same architecture as TeleopSession / RecordSession:
  Session → subprocess → OutputConsumer → Board → WebSocket → Frontend
  Frontend → Board.post_command() → InputConsumer → subprocess stdin
"""

from __future__ import annotations

import importlib
import json
import re
from pathlib import Path
from typing import TYPE_CHECKING, Any

from loguru import logger

from roboclaw.embodied.board.channels import CH_SESSION
from roboclaw.embodied.board.constants import Command, SessionState
from roboclaw.embodied.board.consumer import InputConsumer, OutputConsumer
from roboclaw.embodied.command import CommandBuilder, resolve_action_arms
from roboclaw.embodied.embodiment.arm.registry import get_model, get_role
from roboclaw.embodied.embodiment.manifest.binding import Binding
from roboclaw.embodied.service.session.base import Session

if TYPE_CHECKING:
    from roboclaw.embodied.embodiment.manifest import Manifest
    from roboclaw.embodied.service import EmbodiedService

# Minimal spec data needed for EEPROM sync after calibration.
_MOTOR_SPECS: dict[str, dict[str, Any]] = {
    "so101": {
        "motor_bus_module": "lerobot.motors.feetech",
        "motor_bus_class": "FeetechMotorsBus",
        "default_motor": "sts3215",
    },
    "koch": {
        "motor_bus_module": "lerobot.motors.dynamixel",
        "motor_bus_class": "DynamixelMotorsBus",
        "default_motor": "xl330-m288",
    },
}

# Regex patterns for parsing calibration subprocess output
_RE_POSITION_ROW = re.compile(
    r"(\w+)\s+\|\s+(-?\d+)\s+\|\s+(-?\d+)\s+\|\s+(-?\d+)"
)


def _get_spec(arm_type: str) -> dict[str, Any]:
    model = get_model(arm_type)
    if model not in _MOTOR_SPECS:
        raise ValueError(f"No motor spec for model '{model}'")
    return _MOTOR_SPECS[model]


# ── Consumers ────────────────────────────────────────────────────────────


class CalibrationOutputConsumer(OutputConsumer):
    """Parse lerobot-calibrate subprocess stdout → Board state updates."""

    def __init__(self, board: Any, stdout: Any, arm: Binding) -> None:
        super().__init__(board, stdout)
        self._arm = arm

    async def parse_line(self, line: str) -> None:
        low = line.lower()

        if "press enter to use provided calibration" in low:
            await self.board.update(
                state=SessionState.CALIBRATING,
                calibration_step="choose",
                calibration_arm=self._arm.alias,
            )
        elif "running calibration" in low:
            await self.board.update(calibration_step="starting")
        elif "move" in low and "middle" in low and "press enter" in low:
            await self.board.update(calibration_step="homing")
        elif "recording positions" in low and "press enter to stop" in low:
            await self.board.update(calibration_step="recording")
        elif "calibration saved" in low:
            await self.board.update(calibration_step="done")
        else:
            m = _RE_POSITION_ROW.search(line)
            if m:
                name, mn, pos, mx = m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(4))
                positions = self.board.get("calibration_positions") or {}
                positions[name] = {"min": mn, "pos": pos, "max": mx}
                await self.board.update(calibration_positions=dict(positions))


class CalibrationInputConsumer(InputConsumer):
    """Extend keymap with RECALIBRATE command."""

    def translate(self, command: str) -> bytes | None:
        if command == Command.RECALIBRATE:
            return b"c\n"
        return super().translate(command)


# ── Session ──────────────────────────────────────────────────────────────


class CalibrationSession(Session):
    """Calibration as a proper Session subclass.

    Lifecycle: start_calibration(arm) → subprocess runs → OutputConsumer
    parses prompts → Board state updates → frontend/agent reacts →
    InputConsumer sends user responses → subprocess completes.
    """

    def __init__(self, parent: EmbodiedService) -> None:
        super().__init__(parent.manifest, parent.board)
        self._parent = parent
        self._arm: Binding | None = None
        self._manifest: Manifest | None = None

    def _make_output_consumer(self, board: Any, stdout: Any) -> OutputConsumer:
        return CalibrationOutputConsumer(board, stdout, self._arm)

    def _make_input_consumer(self, board: Any, stdin: Any) -> InputConsumer:
        return CalibrationInputConsumer(board, stdin)

    async def start_calibration(self, arm: Binding, manifest: Manifest) -> None:
        """Start calibration subprocess for a single arm."""
        self._arm = arm
        self._manifest = manifest
        argv = CommandBuilder.calibrate(arm)
        await self.start(argv, initial_state=SessionState.CALIBRATING, auto_confirm=False)

    async def _on_process_exit(self, rc: int) -> None:
        """Called when subprocess exits. Sync EEPROM on success."""
        if rc == 0 and self._arm and self._manifest:
            self._manifest.mark_arm_calibrated(self._arm.alias)
            _sync_calibration_to_motors(self._arm)

    # -- CLI protocol (used by TtySession when invoked from agent) ---------

    def interaction_spec(self):
        from roboclaw.embodied.toolkit.protocol import PollingSpec
        return PollingSpec(label="lerobot-calibrate")

    def status_line(self) -> str:
        state = self.board.state
        step = state.get("calibration_step", "")
        alias = state.get("calibration_arm", "")
        if step == "choose":
            return f"Calibrating {alias}: waiting for choice..."
        if step == "homing":
            return f"Calibrating {alias}: move to middle position"
        if step == "recording":
            return f"Calibrating {alias}: recording range of motion"
        if step == "done":
            return f"Calibrating {alias}: done"
        return f"Calibrating {alias}: {step or 'preparing'}"

    async def on_key(self, key: str) -> None:
        if key in ("ctrl_c", "esc"):
            await self.stop()

    def result(self) -> str:
        state = self.board.state
        step = state.get("calibration_step", "")
        alias = state.get("calibration_arm", "")
        if step == "done":
            return f"Calibration of {alias} completed successfully."
        if state.get("state") == SessionState.ERROR:
            return f"Calibration of {alias} failed: {state.get('error', 'unknown error')}"
        return f"Calibration of {alias} ended."

    async def stop(self) -> None:
        if not self._parent.embodiment_busy:
            return
        await super().stop()

    # -- Agent entry point (backward compat with tool dispatch) ------------

    async def calibrate(
        self,
        manifest: Manifest,
        kwargs: dict[str, Any],
        tty_handoff: Any,
    ) -> str:
        """Agent/CLI entry: calibrate arms via TtySession."""
        if not tty_handoff:
            return "This action requires a local terminal."

        configured = manifest.arms
        if not configured:
            return "No arms configured."

        targets = _resolve_targets(manifest, kwargs)
        if not targets:
            return "All arms are already calibrated."

        results: list[str] = []
        for arm in targets:
            from roboclaw.embodied.toolkit.tty import TtySession

            self._arm = arm
            self._manifest = manifest
            argv = CommandBuilder.calibrate(arm)

            await tty_handoff(start=True, label=f"Calibrating: {arm.alias}")
            try:
                await self.start(argv, initial_state=SessionState.CALIBRATING, auto_confirm=False)
                result = await TtySession(tty_handoff).run(self)
                # Check if calibration succeeded
                step = self.board.get("calibration_step", "")
                if step == "done":
                    manifest.mark_arm_calibrated(arm.alias)
                    _sync_calibration_to_motors(arm)
                    results.append(f"{arm.alias}: OK")
                else:
                    results.append(f"{arm.alias}: {result}")
            except Exception as exc:
                results.append(f"{arm.alias}: FAILED ({exc})")
            finally:
                await tty_handoff(start=False, label=f"Calibrating: {arm.alias}")

        manifest.reload()
        ok = sum(1 for r in results if r.endswith(": OK"))
        fail = len(results) - ok
        return f"{ok} succeeded, {fail} failed.\n" + "\n".join(results)


# ── Helpers ──────────────────────────────────────────────────────────────


def _resolve_targets(manifest: Manifest, kwargs: dict[str, Any]) -> list[Binding]:
    selected = resolve_action_arms(manifest, kwargs.get("arms", ""))
    if kwargs.get("arms", ""):
        return selected
    return [arm for arm in selected if not arm.calibrated]


def _sync_calibration_to_motors(arm: Binding) -> None:
    """Sync calibration data to motor EEPROM after successful calibration."""
    cal_dir = arm.calibration_dir
    serial = Path(cal_dir).name
    cal_path = Path(cal_dir) / f"{serial}.json"
    if not cal_path.exists():
        return

    from lerobot.motors.motors_bus import Motor, MotorCalibration, MotorNormMode

    spec = _get_spec(arm.type_name)
    default_motor = spec["default_motor"]
    cal = json.loads(cal_path.read_text())

    motors = {}
    calibration = {}
    for name, cfg in cal.items():
        motors[name] = Motor(id=cfg["id"], model=default_motor, norm_mode=MotorNormMode.DEGREES)
        calibration[name] = MotorCalibration(
            id=cfg["id"],
            drive_mode=cfg["drive_mode"],
            homing_offset=cfg["homing_offset"],
            range_min=cfg["range_min"],
            range_max=cfg["range_max"],
        )

    mod = importlib.import_module(spec["motor_bus_module"])
    bus_class = getattr(mod, spec["motor_bus_class"])
    bus = bus_class(port=arm.port, motors=motors, calibration=calibration)
    try:
        bus.connect()
        for name, cfg in cal.items():
            bus.write("Homing_Offset", name, cfg["homing_offset"], normalize=False)
            bus.write("Min_Position_Limit", name, cfg["range_min"], normalize=False)
            bus.write("Max_Position_Limit", name, cfg["range_max"], normalize=False)
    except (OSError, ConnectionError):
        logger.warning("Motor EEPROM sync failed for {}", arm.alias)
    finally:
        bus.disconnect()
