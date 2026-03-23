"""SO101 LeRobot command builder."""

from __future__ import annotations

from pathlib import Path


class SO101Controller:
    """Builds LeRobot CLI commands for SO101 robot arm."""

    def doctor(self) -> list[str]:
        """Check lerobot is importable."""
        return ["python3", "-c", "import lerobot; print(lerobot.__version__)"]

    def calibrate(self, robot_port: str, calibration_dir: str) -> list[str]:
        """Build the SO101 calibration command."""
        return [
            "lerobot-calibrate",
            *self._robot_args(robot_port, calibration_dir),
        ]

    def teleoperate(self, robot_port: str, calibration_dir: str) -> list[str]:
        """Build the SO101 teleoperation command."""
        return [
            "lerobot-teleoperate",
            *self._robot_args(robot_port, calibration_dir),
        ]

    def record(
        self,
        robot_port: str,
        calibration_dir: str,
        dataset_name: str,
        task: str,
        num_episodes: int = 10,
        fps: int = 30,
    ) -> list[str]:
        """Build the SO101 recording command."""
        return [
            "lerobot-record",
            *self._robot_args(robot_port, calibration_dir),
            f"--control.single_task={task}",
            f"--control.repo_id=local/{dataset_name}",
            f"--control.num_episodes={num_episodes}",
            f"--control.fps={fps}",
        ]

    def run_policy(
        self,
        robot_port: str,
        calibration_dir: str,
        checkpoint_path: str,
        num_episodes: int = 1,
    ) -> list[str]:
        """Build the SO101 policy execution command."""
        return [
            "lerobot-record",
            *self._robot_args(robot_port, calibration_dir),
            f"--control.policy.path={Path(checkpoint_path).expanduser()}",
            f"--control.num_episodes={num_episodes}",
        ]

    def _robot_args(self, robot_port: str, calibration_dir: str) -> list[str]:
        """Return shared SO101 robot arguments."""
        return [
            "--robot.type=so101",
            f"--robot.port={robot_port}",
            f"--robot.calibration_dir={Path(calibration_dir).expanduser()}",
        ]
