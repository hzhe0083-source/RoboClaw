from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path
from unittest.mock import patch

import pytest

from roboclaw.embodied.board import Board
from roboclaw.embodied.calibration.batch import AutoCalibrationBatch
from roboclaw.embodied.calibration.model import CalibrationProfile, MotorCalibrationProfile
from roboclaw.embodied.calibration.so101.auto import (
    AutoCalibrationStopped,
    ProbeResult,
    SO101AutoCalibrationStrategy,
)
from roboclaw.embodied.calibration.store import CalibrationStore
from roboclaw.embodied.embodiment.manifest import Manifest
from roboclaw.embodied.embodiment.manifest.binding import load_binding
from roboclaw.embodied.embodiment.manifest.helpers import save_manifest


class DummyManifest:
    def __init__(self) -> None:
        self.marked: list[str] = []

    def mark_arm_calibrated(self, alias: str) -> None:
        self.marked.append(alias)


class FastStrategy:
    def recalibrate(self, arm: object, store: CalibrationStore, *, stop_event=None) -> CalibrationProfile:
        return store.load_profile(arm)


class SlowStrategy:
    def recalibrate(self, arm: object, store: CalibrationStore, *, stop_event=None) -> CalibrationProfile:
        while stop_event is not None and not stop_event.is_set():
            time.sleep(0.02)
        raise AutoCalibrationStopped("stopped")


def _build_manifest(tmp_path: Path) -> tuple[Manifest, Path]:
    cal_dir = tmp_path / "calibration" / "SIM001"
    cal_dir.mkdir(parents=True)
    port = tmp_path / "tty.sim001"
    port.write_text("", encoding="utf-8")
    path = tmp_path / "manifest.json"
    save_manifest(
        {
            "version": 2,
            "arms": [
                {
                    "alias": "test_arm",
                    "type": "so101_follower",
                    "port": str(port),
                    "calibration_dir": str(cal_dir),
                    "calibrated": True,
                }
            ],
            "hands": [],
            "cameras": [],
            "datasets": {"root": "/data"},
            "policies": {"root": "/policies"},
        },
        path,
    )
    return Manifest(path=path), cal_dir


def _baseline_profile() -> dict[str, dict[str, int]]:
    return {
        "shoulder_pan": {"id": 1, "drive_mode": 0, "homing_offset": -1276, "range_min": 974, "range_max": 3369},
        "shoulder_lift": {"id": 2, "drive_mode": 0, "homing_offset": -1609, "range_min": 820, "range_max": 3231},
        "elbow_flex": {"id": 3, "drive_mode": 0, "homing_offset": 1951, "range_min": 910, "range_max": 3122},
        "wrist_flex": {"id": 4, "drive_mode": 0, "homing_offset": -1413, "range_min": 920, "range_max": 3228},
        "wrist_roll": {"id": 5, "drive_mode": 0, "homing_offset": -1110, "range_min": 0, "range_max": 4095},
        "gripper": {"id": 6, "drive_mode": 0, "homing_offset": -528, "range_min": 1532, "range_max": 2772},
    }


def _write_profile(cal_dir: Path, data: dict[str, dict[str, int]]) -> None:
    (cal_dir / f"{cal_dir.name}.json").write_text(
        json.dumps(data, indent=4) + "\n",
        encoding="utf-8",
    )


def _make_arm(tmp_path: Path, *, alias: str, arm_type: str, connected: bool, with_profile: bool) -> object:
    cal_dir = tmp_path / "calibration" / alias
    cal_dir.mkdir(parents=True, exist_ok=True)
    if with_profile:
        _write_profile(cal_dir, _baseline_profile())
    port = tmp_path / f"{alias}.tty"
    if connected:
        port.write_text("", encoding="utf-8")
    return load_binding({
        "alias": alias,
        "type": arm_type,
        "port": str(port),
        "calibration_dir": str(cal_dir),
        "calibrated": with_profile,
    }, "arm", {})


def test_so101_strategy_preserves_homing_offsets_and_wrist_roll(tmp_path: Path) -> None:
    manifest, cal_dir = _build_manifest(tmp_path)
    _write_profile(cal_dir, _baseline_profile())
    arm = manifest.find_arm("test_arm")
    strategy = SO101AutoCalibrationStrategy()
    store = CalibrationStore()

    with patch("roboclaw.embodied.calibration.so101.auto._SO101AutoCalibrator") as calibrator_cls:
        calibrator_cls.return_value.calibrate.return_value = {
            "shoulder_pan": ProbeResult(1, "shoulder_pan", 900, 3400, 920, 3380),
            "shoulder_lift": ProbeResult(2, "shoulder_lift", 810, 3200, 830, 3180),
            "elbow_flex": ProbeResult(3, "elbow_flex", 880, 3090, 900, 3070),
            "wrist_flex": ProbeResult(4, "wrist_flex", 860, 3000, 880, 2980),
            "gripper": ProbeResult(6, "gripper", 1540, 2780, 1560, 2760),
        }
        profile = strategy.recalibrate(arm, store)

    assert profile.motors["shoulder_pan"].homing_offset == -1276
    assert profile.motors["shoulder_pan"].range_min == 920
    assert profile.motors["shoulder_pan"].range_max == 3380
    assert profile.motors["gripper"].homing_offset == -528
    assert profile.motors["gripper"].range_min == 1560
    assert profile.motors["gripper"].range_max == 2760
    assert profile.motors["wrist_roll"].homing_offset == -1110
    assert profile.motors["wrist_roll"].range_min == 0
    assert profile.motors["wrist_roll"].range_max == 4095


@pytest.mark.asyncio
async def test_auto_calibration_batch_skips_unsupported_and_missing_baseline(tmp_path: Path) -> None:
    store = CalibrationStore()
    board = Board()
    manifest = DummyManifest()
    batch = AutoCalibrationBatch(board=board, manifest=manifest, store=store, strategy=FastStrategy())

    supported = _make_arm(tmp_path, alias="supported", arm_type="so101_follower", connected=True, with_profile=True)
    unsupported = _make_arm(tmp_path, alias="unsupported", arm_type="koch_follower", connected=True, with_profile=True)
    disconnected = _make_arm(tmp_path, alias="disconnected", arm_type="so101_follower", connected=False, with_profile=True)
    no_profile = _make_arm(tmp_path, alias="manual_first", arm_type="so101_follower", connected=True, with_profile=False)

    total = await batch.start([supported, unsupported, disconnected, no_profile])
    assert total == 4
    assert batch._task is not None
    await asyncio.wait_for(batch._task, timeout=2.0)

    state = board.state
    results = {item["alias"]: item for item in state["calibration_results"]}
    assert state["state"] == "idle"
    assert results["supported"]["status"] == "success"
    assert results["unsupported"]["status"] == "skipped"
    assert results["unsupported"]["reason"] == "unsupported_arm_type"
    assert results["disconnected"]["status"] == "skipped"
    assert results["disconnected"]["reason"] == "disconnected"
    assert results["manual_first"]["status"] == "skipped"
    assert results["manual_first"]["reason"] == "manual_calibration_required"
    assert manifest.marked == ["supported"]


@pytest.mark.asyncio
async def test_auto_calibration_batch_stop_marks_remaining_items(tmp_path: Path) -> None:
    store = CalibrationStore()
    board = Board()
    manifest = DummyManifest()
    batch = AutoCalibrationBatch(board=board, manifest=manifest, store=store, strategy=SlowStrategy())

    first = _make_arm(tmp_path, alias="first", arm_type="so101_follower", connected=True, with_profile=True)
    second = _make_arm(tmp_path, alias="second", arm_type="so101_follower", connected=True, with_profile=True)

    await batch.start([first, second])
    await asyncio.sleep(0.05)
    await batch.stop()

    state = board.state
    results = {item["alias"]: item for item in state["calibration_results"]}
    assert state["state"] == "idle"
    assert results["first"]["status"] == "failed"
    assert results["first"]["reason"] == "stopped"
    assert results["second"]["status"] == "skipped"
    assert results["second"]["reason"] == "batch_stopped"
