"""Hardware scanning — detect serial ports and cameras."""

from __future__ import annotations

import glob
import os
import re
from pathlib import Path


def scan_serial_ports() -> list[dict[str, str]]:
    """Scan /dev/serial/by-id/ for connected serial devices."""
    by_id_dir = Path("/dev/serial/by-id")
    if not by_id_dir.exists():
        return []
    ports = []
    for entry in sorted(by_id_dir.iterdir()):
        if not entry.is_symlink():
            continue
        target = os.path.realpath(str(entry))
        if not os.path.exists(target):
            continue
        ports.append({"id": entry.name, "path": str(entry), "target": target})
    return ports


def scan_cameras() -> list[dict[str, str | int]]:
    """Scan /dev/video* and probe with OpenCV to find real cameras."""
    try:
        import cv2
    except ImportError:
        return []

    devnull = os.open(os.devnull, os.O_WRONLY)
    saved_stderr = os.dup(2)
    os.dup2(devnull, 2)
    os.close(devnull)
    try:
        return _probe_video_devices(cv2)
    finally:
        os.dup2(saved_stderr, 2)
        os.close(saved_stderr)


def _probe_video_devices(cv2) -> list[dict[str, str | int]]:
    """Try opening each /dev/videoN with OpenCV, return those that work."""
    cameras = []
    for dev in sorted(glob.glob("/dev/video*")):
        m = re.match(r"/dev/video(\d+)$", dev)
        if not m:
            continue
        info = _try_open_camera(cv2, int(m.group(1)), dev)
        if info:
            cameras.append(info)
    return cameras


def _try_open_camera(cv2, index: int, dev: str) -> dict[str, str | int] | None:
    """Open a single camera by index, return info dict or None."""
    cap = cv2.VideoCapture(index)
    try:
        if not cap.isOpened():
            return None
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        return {"id": dev, "width": w, "height": h}
    finally:
        cap.release()
