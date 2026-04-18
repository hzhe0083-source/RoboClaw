"""Tests for setup wizard dashboard routes."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

pytest.importorskip("fastapi")

from fastapi import FastAPI
from fastapi.testclient import TestClient

from roboclaw.embodied.embodiment.interface.serial import SerialInterface
from roboclaw.embodied.embodiment.interface.video import VideoInterface
from roboclaw.embodied.embodiment.manifest import Manifest
from roboclaw.http.routes.setup import register_setup_routes


_RAW_PORTS = [
    SerialInterface(
        by_path="/dev/serial/by-path/pci-0:2.1",
        by_id="/dev/serial/by-id/usb-ABC-if00",
        dev="/dev/ttyACM0",
        motor_ids=(1, 2, 3, 4, 5, 6),
    ),
]

_MOCK_CAMERAS = [
    VideoInterface(by_path="/dev/v4l/by-path/cam0", by_id="", dev="/dev/video0", width=640, height=480),
]
def _make_app(session_busy: bool = False) -> FastAPI:
    """Create a minimal FastAPI app with setup routes registered."""
    from roboclaw.embodied.embodiment.hardware.discovery import HardwareDiscovery

    app = FastAPI()
    svc = MagicMock()
    svc.busy = session_busy
    svc.embodiment_busy = session_busy
    svc.busy_reason = "recording"

    scanner = HardwareDiscovery()
    setup = MagicMock()

    def _run_full_scan(model=""):
        scanner._scanned_ports = list(_RAW_PORTS)
        scanner._scanned_cameras = list(_MOCK_CAMERAS)
        return {
            "ports": list(_RAW_PORTS),
            "cameras": list(_MOCK_CAMERAS),
        }

    setup.run_full_scan = _run_full_scan
    setup.capture_previews = scanner.capture_camera_previews
    setup.start_motion_detection = scanner.start_motion_detection
    setup.poll_motion = scanner.poll_motion
    setup.stop_motion_detection = MagicMock(side_effect=lambda: scanner.stop_motion_detection())
    setup.to_dict = MagicMock(return_value={
        "phase": "idle",
        "model": "",
        "candidates": [],
        "assignments": [],
        "unassigned": [],
        "busy": session_busy,
        "busy_reason": "recording" if session_busy else "",
    })

    if session_busy:
        from roboclaw.embodied.service import EmbodimentBusyError
        setup.run_full_scan = MagicMock(
            side_effect=EmbodimentBusyError("Embodiment busy: recording"),
        )

    svc.setup = setup
    svc.manifest = MagicMock(spec=Manifest)
    svc.manifest.snapshot = {
        "arms": [{"alias": "left", "type": "so101_follower"}],
        "cameras": [{"alias": "top"}],
        "hands": [],
    }

    app.state.embodied_service = svc
    app.state.setup_wizard = scanner
    register_setup_routes(app, svc)
    return app


def test_scan_returns_ports_and_cameras() -> None:
    app = _make_app()
    client = TestClient(app)
    resp = client.post("/api/setup/scan")

    assert resp.status_code == 200
    data = resp.json()
    assert len(data["ports"]) == 1
    assert data["ports"][0]["motor_ids"] == [1, 2, 3, 4, 5, 6]
    assert len(data["cameras"]) == 1


def test_motion_start_after_scan() -> None:
    app = _make_app()
    client = TestClient(app)
    client.post("/api/setup/scan")

    with patch("roboclaw.embodied.embodiment.hardware.motion_detector.MotionDetector._read_positions", return_value={1: 100, 2: 200}):
        resp = client.post("/api/setup/motion/start")

    assert resp.status_code == 200
    assert resp.json()["status"] == "watching"
    assert resp.json()["port_count"] == 1


def test_motion_start_without_scan_returns_400() -> None:
    app = _make_app()
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.post("/api/setup/motion/start")
    assert resp.status_code == 400


def test_motion_poll_returns_deltas() -> None:
    app = _make_app()
    client = TestClient(app)
    client.post("/api/setup/scan")
    with patch("roboclaw.embodied.embodiment.hardware.motion_detector.MotionDetector._read_positions", return_value={1: 100, 2: 200}):
        client.post("/api/setup/motion/start")
    with patch("roboclaw.embodied.embodiment.hardware.motion_detector.MotionDetector._read_positions", return_value={1: 200, 2: 300}):
        resp = client.get("/api/setup/motion/poll")

    assert resp.status_code == 200
    ports = resp.json()["ports"]
    assert len(ports) == 1
    assert ports[0]["delta"] == 200  # |200-100| + |300-200|
    assert ports[0]["moved"] is True


def test_motion_poll_without_start_returns_400() -> None:
    app = _make_app()
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.get("/api/setup/motion/poll")
    assert resp.status_code == 400


def test_motion_stop_clears_state() -> None:
    app = _make_app()
    client = TestClient(app)
    resp = client.post("/api/setup/motion/stop")
    assert resp.status_code == 200
    assert resp.json()["status"] == "stopped"
    assert app.state.setup_wizard.motion_active is False
    assert app.state.embodied_service.setup.stop_motion_detection.called


def test_setup_session_returns_busy_fields() -> None:
    app = _make_app(session_busy=True)
    client = TestClient(app)
    resp = client.get("/api/setup/session")
    assert resp.status_code == 200
    assert resp.json()["busy"] is True
    assert resp.json()["busy_reason"] == "recording"


def test_setup_reset_calls_service_reset() -> None:
    app = _make_app()
    client = TestClient(app)
    resp = client.post("/api/setup/session/reset")
    assert resp.status_code == 200
    assert resp.json() == {"status": "reset"}
    assert app.state.embodied_service.setup.reset.called


def test_scan_returns_409_when_recording() -> None:
    app = _make_app(session_busy=True)
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.post("/api/setup/scan")
    assert resp.status_code == 409
