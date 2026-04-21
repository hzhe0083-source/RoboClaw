"""SO-101 automatic recalibration via sensorless hardstop detection."""

from __future__ import annotations

import json
import os
import time
from abc import ABC, abstractmethod
from collections.abc import Iterator
from dataclasses import dataclass
from threading import Event
from typing import Any

from loguru import logger

from lerobot.motors.feetech.feetech import FeetechMotorsBus
from lerobot.motors.motors_bus import Motor, MotorNormMode

from roboclaw.embodied.calibration.model import CalibrationProfile, MotorCalibrationProfile
from roboclaw.embodied.calibration.store import CalibrationStore
from roboclaw.embodied.embodiment.manifest.binding import ArmBinding

POSITION_MIN = 0
POSITION_MAX = 4095

DEFAULT_PROBE_STEP_TICKS = 20
DEFAULT_PROBE_INTERVAL_S = 0.04
DEFAULT_CURRENT_LIMIT_RAW = 400
DEFAULT_SATURATION_DELTA = 2
DEFAULT_SATURATION_CYCLES = 6
DEFAULT_SAFETY_MARGIN_TICKS = 20
DEFAULT_MOVE_STEP_TICKS = 8
DEFAULT_MOVE_TOLERANCE_TICKS = 20
MIN_VALID_RANGE_TICKS = 500

EEPROM_COMMIT_DELAY_S = 0.05
TORQUE_NUM_RETRY = 3
GOAL_WRITE_NUM_RETRY = 2
SAFE_START_MARGIN_TICKS = 300
EEPROM_BACKUP_PATH = "/tmp/auto_calibrate_eeprom_backup.txt"

SO101_SAFE_WINDOWS: dict[str, tuple[int, int]] = {
    "shoulder_pan": (800, 3600),
    "shoulder_lift": (800, 3200),
    "elbow_flex": (900, 3100),
    "wrist_flex": (850, 3000),
    "gripper": (1550, 3050),
}


class AutoCalibrationStopped(RuntimeError):
    """Raised when a running auto-calibration batch is stopped."""


@dataclass(frozen=True)
class ProbeResult:
    motor_id: int
    motor_name: str
    hard_min: int
    hard_max: int
    applied_min: int
    applied_max: int


class Worker(ABC):
    @abstractmethod
    def start(self) -> None: ...

    @abstractmethod
    def tick(self) -> bool: ...

    @property
    @abstractmethod
    def done(self) -> bool: ...


class ProbeWorker(Worker):
    def __init__(
        self,
        bus: FeetechMotorsBus,
        motor_name: str,
        direction: int,
        *,
        step_ticks: int = DEFAULT_PROBE_STEP_TICKS,
        current_limit_raw: int = DEFAULT_CURRENT_LIMIT_RAW,
        saturation_delta: int = DEFAULT_SATURATION_DELTA,
        saturation_cycles: int = DEFAULT_SATURATION_CYCLES,
    ) -> None:
        self._bus = bus
        self._name = motor_name
        self._direction = +1 if direction > 0 else -1
        self._step_ticks = step_ticks
        self._current_limit = current_limit_raw
        self._saturation_delta = saturation_delta
        self._saturation_cycles = saturation_cycles
        self._started = False
        self._done = False
        self._start_pos = 0
        self._last_pos = 0
        self._stalled = 0
        self._goal = 0
        self._result_pos: int | None = None
        self._reason = "unknown"

    def start(self) -> None:
        if self._started:
            return
        self._bus.disable_torque(self._name, num_retry=TORQUE_NUM_RETRY)
        self._bus.write("Operating_Mode", self._name, 0, normalize=False)
        self._start_pos = int(self._bus.read("Present_Position", self._name, normalize=False))
        self._goal = self._start_pos
        self._last_pos = self._start_pos
        self._bus.write("Goal_Position", self._name, self._start_pos, normalize=False)
        self._bus.enable_torque(self._name, num_retry=TORQUE_NUM_RETRY)
        self._started = True
        logger.debug("ProbeWorker {} dir={:+d} start_pos={}", self._name, self._direction, self._start_pos)

    def tick(self) -> bool:
        if not self._started:
            self.start()
        if self._done:
            return True
        self._goal = max(POSITION_MIN, min(POSITION_MAX, self._goal + self._direction * self._step_ticks))
        self._bus.write("Goal_Position", self._name, self._goal, normalize=False, num_retry=GOAL_WRITE_NUM_RETRY)
        pos = int(self._bus.read("Present_Position", self._name, normalize=False))
        cur = int(self._bus.read("Present_Current", self._name, normalize=False))

        if abs(cur) >= self._current_limit:
            self._finish(pos, "current-limit")
            return True
        if abs(pos - self._last_pos) < self._saturation_delta:
            self._stalled += 1
            if self._stalled >= self._saturation_cycles:
                self._finish(pos, "position-saturation")
                return True
        else:
            self._stalled = 0
        self._last_pos = pos
        if self._goal in (POSITION_MIN, POSITION_MAX):
            self._finish(pos, "range-edge")
            return True
        return False

    def _finish(self, pos: int, reason: str) -> None:
        self._result_pos = pos
        self._reason = reason
        self._done = True
        try:
            self._bus.write(
                "Goal_Position",
                self._name,
                pos,
                normalize=False,
                num_retry=GOAL_WRITE_NUM_RETRY,
            )
        except Exception as exc:
            logger.warning("ProbeWorker {} failed to clear goal after stall: {}", self._name, exc)
        time.sleep(0.1)
        logger.info("ProbeWorker {} stopped: stall_pos={} reason={}", self._name, pos, reason)

    @property
    def done(self) -> bool:
        return self._done

    @property
    def stall_position(self) -> int:
        if self._result_pos is None:
            raise RuntimeError(f"Probe {self._name} has not finished")
        return self._result_pos


class MoveWorker(Worker):
    def __init__(
        self,
        bus: FeetechMotorsBus,
        motor_name: str,
        target: int,
        *,
        step_ticks: int = DEFAULT_MOVE_STEP_TICKS,
        tolerance_ticks: int = DEFAULT_MOVE_TOLERANCE_TICKS,
    ) -> None:
        self._bus = bus
        self._name = motor_name
        self._target = max(POSITION_MIN, min(POSITION_MAX, target))
        self._step_ticks = step_ticks
        self._tolerance = tolerance_ticks
        self._started = False
        self._done = False
        self._goal = 0

    def start(self) -> None:
        if self._started:
            return
        self._bus.disable_torque(self._name, num_retry=TORQUE_NUM_RETRY)
        self._bus.write("Operating_Mode", self._name, 0, normalize=False)
        start_pos = int(self._bus.read("Present_Position", self._name, normalize=False))
        self._goal = start_pos
        self._bus.write("Goal_Position", self._name, start_pos, normalize=False)
        self._bus.enable_torque(self._name, num_retry=TORQUE_NUM_RETRY)
        self._started = True

    def tick(self) -> bool:
        if not self._started:
            self.start()
        if self._done:
            return True
        if self._goal != self._target:
            diff = self._target - self._goal
            step = max(-self._step_ticks, min(self._step_ticks, diff))
            self._goal += step
            self._bus.write("Goal_Position", self._name, self._goal, normalize=False, num_retry=GOAL_WRITE_NUM_RETRY)
            return False
        pos = int(self._bus.read("Present_Position", self._name, normalize=False))
        if abs(pos - self._target) < self._tolerance:
            self._done = True
            return True
        return False

    @property
    def done(self) -> bool:
        return self._done


class SequentialWorker(Worker):
    def __init__(self, sub_workers: Iterator[Worker]) -> None:
        self._gen = sub_workers
        self._current: Worker | None = None
        self._started = False
        self._done = False

    def start(self) -> None:
        if self._started:
            return
        self._current = next(self._gen, None)
        if self._current is None:
            self._done = True
        else:
            self._current.start()
        self._started = True

    def tick(self) -> bool:
        if not self._started:
            self.start()
        if self._done:
            return True
        assert self._current is not None
        if not self._current.tick():
            return False
        self._current = next(self._gen, None)
        if self._current is None:
            self._done = True
            return True
        self._current.start()
        return False

    @property
    def done(self) -> bool:
        return self._done


def run_concurrent(
    workers: list[Worker],
    *,
    interval_s: float = DEFAULT_PROBE_INTERVAL_S,
    stop_event: Event | None = None,
) -> None:
    for worker in workers:
        if not worker.done:
            worker.start()
    while True:
        if stop_event and stop_event.is_set():
            raise AutoCalibrationStopped("Stopped by user.")
        still_running = False
        for worker in workers:
            if worker.done:
                continue
            worker.tick()
            if not worker.done:
                still_running = True
        if not still_running:
            return
        time.sleep(interval_s)


class _SO101AutoCalibrator:
    ARM_MOTORS: dict[str, int] = {
        "shoulder_pan": 1,
        "shoulder_lift": 2,
        "elbow_flex": 3,
        "wrist_flex": 4,
    }
    GRIPPER_NAME = "gripper"
    GRIPPER_ID = 6
    ACTIVE_MOTORS: tuple[str, ...] = (
        "shoulder_pan",
        "shoulder_lift",
        "elbow_flex",
        "wrist_flex",
        "gripper",
    )

    def __init__(
        self,
        port: str,
        *,
        safety_margin_ticks: int = DEFAULT_SAFETY_MARGIN_TICKS,
        probe_step_ticks: int = DEFAULT_PROBE_STEP_TICKS,
        move_step_ticks: int = DEFAULT_MOVE_STEP_TICKS,
        current_limit_raw: int = DEFAULT_CURRENT_LIMIT_RAW,
        stop_event: Event | None = None,
    ) -> None:
        self._port = port
        self._safety_margin = safety_margin_ticks
        self._probe_step = probe_step_ticks
        self._move_step = move_step_ticks
        self._current_limit = current_limit_raw
        self._stop_event = stop_event

        motors = {
            name: Motor(id=motor_id, model="sts3215", norm_mode=MotorNormMode.RANGE_0_100)
            for name, motor_id in self.ARM_MOTORS.items()
        }
        motors[self.GRIPPER_NAME] = Motor(
            id=self.GRIPPER_ID,
            model="sts3215",
            norm_mode=MotorNormMode.RANGE_0_100,
        )
        self._bus = FeetechMotorsBus(port=port, motors=motors)

    def calibrate(self) -> dict[str, ProbeResult]:
        self._bus.connect(handshake=True)
        orig_limits: dict[str, tuple[int, int]] = {}
        try:
            self._check_stopped()
            for name in self.ACTIVE_MOTORS:
                orig_limits[name] = self._widen_eeprom(name)
            self._persist_backup(orig_limits)
            hard = self._run_sequence(orig_limits)
            results = self._finalize(hard, orig_limits)
            self._clear_backup()
            return results
        except Exception:
            logger.exception("Auto-calibration failed; restoring original EEPROM limits")
            self._restore_via_fresh_bus(orig_limits)
            raise
        finally:
            try:
                self._bus.disconnect(disable_torque=True)
            except Exception as exc:
                logger.warning("disconnect raised during cleanup: {}", exc)

    def _check_stopped(self) -> None:
        if self._stop_event and self._stop_event.is_set():
            raise AutoCalibrationStopped("Stopped by user.")

    def _restore_via_fresh_bus(self, orig_limits: dict[str, tuple[int, int]]) -> None:
        try:
            self._bus.disconnect(disable_torque=True)
        except Exception as exc:
            logger.warning("disconnect before restore raised: {}", exc)
        time.sleep(0.3)
        try:
            self._bus.connect(handshake=False)
        except Exception:
            logger.exception("Could not reconnect bus to restore EEPROM")
            return
        for name, (orig_min, orig_max) in orig_limits.items():
            try:
                self._write_eeprom(name, orig_min, orig_max)
            except Exception:
                logger.exception("{}: restore write failed — see backup at {}", name, EEPROM_BACKUP_PATH)

    def _run_sequence(self, orig_limits: dict[str, tuple[int, int]]) -> dict[str, tuple[int, int]]:
        gripper_state: dict[str, int] = {}
        gripper_worker = SequentialWorker(self._gripper_plan(gripper_state, orig_limits))

        def with_gripper(*main_workers: Worker) -> None:
            run_concurrent([*main_workers, gripper_worker], stop_event=self._stop_event)

        self._ensure_safe_start("wrist_flex", -1)
        probe_m4_neg = self._probe("wrist_flex", -1)
        with_gripper(probe_m4_neg)
        m4_min = probe_m4_neg.stall_position

        self._ensure_safe_start("shoulder_pan", -1)
        probe_m1_neg = self._probe("shoulder_pan", -1)
        with_gripper(probe_m1_neg)
        m1_min = probe_m1_neg.stall_position

        self._ensure_safe_start("shoulder_pan", +1)
        probe_m1_pos = self._probe("shoulder_pan", +1)
        with_gripper(probe_m1_pos)
        m1_max = probe_m1_pos.stall_position
        with_gripper(self._move("shoulder_pan", (m1_min + m1_max) // 2))

        self._ensure_safe_start("elbow_flex", +1)
        self._ensure_safe_start("shoulder_lift", -1)
        probe_m3_pos = self._probe("elbow_flex", +1)
        probe_m2_neg = self._probe("shoulder_lift", -1)
        with_gripper(probe_m3_pos, probe_m2_neg)
        m3_max = probe_m3_pos.stall_position
        m2_min = probe_m2_neg.stall_position

        self._ensure_safe_start("elbow_flex", -1)
        self._ensure_safe_start("shoulder_lift", +1)
        probe_m3_neg = self._probe("elbow_flex", -1)
        probe_m2_pos = self._probe("shoulder_lift", +1)
        with_gripper(probe_m3_neg, probe_m2_pos)
        m3_min = probe_m3_neg.stall_position
        m2_max = probe_m2_pos.stall_position

        with_gripper(
            self._move("elbow_flex", (m3_min + m3_max) // 2),
            self._move("shoulder_lift", (m2_min + m2_max) // 2),
        )

        self._ensure_safe_start("wrist_flex", +1)
        probe_m4_pos = self._probe("wrist_flex", +1)
        with_gripper(probe_m4_pos)
        m4_max = probe_m4_pos.stall_position
        with_gripper(self._move("wrist_flex", (m4_min + m4_max) // 2))

        if not gripper_worker.done:
            run_concurrent([gripper_worker], stop_event=self._stop_event)

        return {
            "shoulder_pan": (m1_min, m1_max),
            "shoulder_lift": (m2_min, m2_max),
            "elbow_flex": (m3_min, m3_max),
            "wrist_flex": (m4_min, m4_max),
            "gripper": (gripper_state["min"], gripper_state["max"]),
        }

    def _gripper_plan(
        self,
        state: dict[str, int],
        orig_limits: dict[str, tuple[int, int]],
    ) -> Iterator[Worker]:
        del orig_limits
        self._ensure_safe_start(self.GRIPPER_NAME, -1)
        probe_min = self._probe(self.GRIPPER_NAME, -1)
        yield probe_min
        state["min"] = probe_min.stall_position
        self._ensure_safe_start(self.GRIPPER_NAME, +1)
        probe_max = self._probe(self.GRIPPER_NAME, +1)
        yield probe_max
        state["max"] = probe_max.stall_position
        yield self._move(self.GRIPPER_NAME, (state["min"] + state["max"]) // 2)

    def _ensure_safe_start(self, name: str, direction: int) -> None:
        self._check_stopped()
        safe_min, safe_max = SO101_SAFE_WINDOWS[name]
        current = int(self._bus.read("Present_Position", name, normalize=False))
        too_close = (
            (direction > 0 and current > safe_max - SAFE_START_MARGIN_TICKS)
            or (direction < 0 and current < safe_min + SAFE_START_MARGIN_TICKS)
        )
        if not too_close:
            return
        safe_target = (safe_min + safe_max) // 2
        logger.info(
            "{}: pre-probe retreat from {} to {} (dir={:+d}, safe window [{}, {}])",
            name,
            current,
            safe_target,
            direction,
            safe_min,
            safe_max,
        )
        move = MoveWorker(self._bus, name, safe_target, step_ticks=self._move_step)
        run_concurrent([move], stop_event=self._stop_event)

    def _probe(self, motor_name: str, direction: int) -> ProbeWorker:
        return ProbeWorker(
            self._bus,
            motor_name,
            direction,
            step_ticks=self._probe_step,
            current_limit_raw=self._current_limit,
        )

    def _move(self, motor_name: str, target: int) -> MoveWorker:
        return MoveWorker(self._bus, motor_name, target, step_ticks=self._move_step)

    def _widen_eeprom(self, name: str) -> tuple[int, int]:
        self._check_stopped()
        self._bus.disable_torque(name, num_retry=TORQUE_NUM_RETRY)
        orig_min = int(self._bus.read("Min_Position_Limit", name, normalize=False))
        orig_max = int(self._bus.read("Max_Position_Limit", name, normalize=False))
        if orig_min <= POSITION_MIN + 1 and orig_max >= POSITION_MAX - 1:
            raise RuntimeError(
                f"{name}: EEPROM already at [0, 4095]. A previous auto-cal run likely failed "
                f"to restore. Check {EEPROM_BACKUP_PATH} before re-running."
            )
        self._bus.write("Min_Position_Limit", name, POSITION_MIN, normalize=False)
        time.sleep(EEPROM_COMMIT_DELAY_S)
        self._bus.write("Max_Position_Limit", name, POSITION_MAX, normalize=False)
        time.sleep(EEPROM_COMMIT_DELAY_S)
        return orig_min, orig_max

    def _persist_backup(self, orig_limits: dict[str, tuple[int, int]]) -> None:
        with open(EEPROM_BACKUP_PATH, "w", encoding="utf-8") as handle:
            json.dump({name: [lo, hi] for name, (lo, hi) in orig_limits.items()}, handle)

    def _clear_backup(self) -> None:
        if os.path.exists(EEPROM_BACKUP_PATH):
            os.remove(EEPROM_BACKUP_PATH)

    def _write_eeprom(self, name: str, min_limit: int, max_limit: int) -> None:
        self._check_stopped()
        self._bus.disable_torque(name, num_retry=TORQUE_NUM_RETRY)
        self._bus.write("Min_Position_Limit", name, min_limit, normalize=False)
        time.sleep(EEPROM_COMMIT_DELAY_S)
        self._bus.write("Max_Position_Limit", name, max_limit, normalize=False)
        time.sleep(EEPROM_COMMIT_DELAY_S)

    def _finalize(
        self,
        hard: dict[str, tuple[int, int]],
        orig_limits: dict[str, tuple[int, int]],
    ) -> dict[str, ProbeResult]:
        results: dict[str, ProbeResult] = {}
        for name in self.ACTIVE_MOTORS:
            self._check_stopped()
            hard_min, hard_max = hard[name]
            self._validate_range(name, hard_min, hard_max)
            applied_min = hard_min + self._safety_margin
            applied_max = hard_max - self._safety_margin
            if applied_min >= applied_max:
                raise RuntimeError(
                    f"{name}: safety margin collapses range: "
                    f"hard=[{hard_min}, {hard_max}] margin={self._safety_margin}"
                )
            self._write_eeprom(name, applied_min, applied_max)
            results[name] = ProbeResult(
                motor_id=(self.ARM_MOTORS.get(name) or self.GRIPPER_ID),
                motor_name=name,
                hard_min=hard_min,
                hard_max=hard_max,
                applied_min=applied_min,
                applied_max=applied_max,
            )
        return results

    def _validate_range(self, name: str, hard_min: int, hard_max: int) -> None:
        if hard_max - hard_min < MIN_VALID_RANGE_TICKS:
            raise RuntimeError(
                f"{name}: probed range too narrow ({hard_min}..{hard_max}); "
                f"expected at least {MIN_VALID_RANGE_TICKS} ticks"
            )
        if hard_min <= POSITION_MIN + 1 or hard_max >= POSITION_MAX - 1:
            logger.warning(
                "{}: probed range pinned at raw edge ({}..{}) — hardstop may not be real",
                name,
                hard_min,
                hard_max,
            )


class SO101AutoCalibrationStrategy:
    RANGE_MOTORS: tuple[str, ...] = (
        "shoulder_pan",
        "shoulder_lift",
        "elbow_flex",
        "wrist_flex",
        "gripper",
    )

    def recalibrate(
        self,
        arm: ArmBinding,
        store: CalibrationStore,
        *,
        stop_event: Event | None = None,
    ) -> CalibrationProfile:
        baseline = store.load_profile(arm)
        self._validate_baseline(arm, baseline)

        calibrator = _SO101AutoCalibrator(arm.port, stop_event=stop_event)
        probed = calibrator.calibrate()

        merged = dict(baseline.motors)
        for motor_name, result in probed.items():
            original = merged[motor_name]
            merged[motor_name] = MotorCalibrationProfile(
                id=original.id,
                drive_mode=original.drive_mode,
                homing_offset=original.homing_offset,
                range_min=result.applied_min,
                range_max=result.applied_max,
            )
        return CalibrationProfile(merged)

    def _validate_baseline(self, arm: ArmBinding, profile: CalibrationProfile) -> None:
        missing = [name for name in (*self.RANGE_MOTORS, "wrist_roll") if name not in profile.motors]
        if missing:
            raise RuntimeError(
                f"Calibration profile for {arm.alias} is missing baseline motors: {', '.join(missing)}"
            )
