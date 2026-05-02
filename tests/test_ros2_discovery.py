"""Tests for ROS 2 discovery helpers."""

from __future__ import annotations

from roboclaw.embodied.transport.ros2.discovery import CommandResult, Ros2Discovery


def test_ros2_cli_available_uses_injected_runner() -> None:
    calls = []

    def runner(argv, timeout_s):
        calls.append((tuple(argv), timeout_s))
        return CommandResult(0, "usage", "")

    discovery = Ros2Discovery(runner=runner, default_timeout_s=1.5)

    assert discovery.ros2_cli_available() is True
    assert calls == [(("ros2", "--help"), 1.5)]


def test_ros2_cli_available_reports_runner_failure() -> None:
    discovery = Ros2Discovery(
        runner=lambda argv, timeout_s: CommandResult(127, "", "missing"),
    )

    assert discovery.ros2_cli_available() is False
