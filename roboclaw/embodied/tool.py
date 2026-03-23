"""Embodied tool — bridges agent to the embodied robotics layer."""

from typing import Any

from roboclaw.agent.tools.base import Tool

_ACTIONS = [
    "doctor",
    "calibrate",
    "teleoperate",
    "record",
    "train",
    "run_policy",
    "job_status",
]

_DEFAULT_PORT = "/dev/ttyACM0"
_DEFAULT_CALIBRATION_DIR = "~/.roboclaw/workspace/embodied/calibration/so101"
_DATASET_ROOT = "~/.roboclaw/workspace/embodied/datasets"
_POLICY_OUTPUT = "~/.roboclaw/workspace/embodied/policies"
_LOGS_DIR = "~/.roboclaw/workspace/embodied/jobs"


class EmbodiedTool(Tool):
    """Control embodied robots via the agent."""

    @property
    def name(self) -> str:
        return "embodied"

    @property
    def description(self) -> str:
        return (
            "Control embodied robots — connect, calibrate, collect data, "
            "train policies, and run inference."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": _ACTIONS,
                    "description": "The action to perform.",
                },
                "port": {
                    "type": "string",
                    "description": "Serial port for the robot.",
                },
                "calibration_dir": {
                    "type": "string",
                    "description": "Directory for calibration data.",
                },
                "dataset_name": {
                    "type": "string",
                    "description": "Name for the dataset.",
                },
                "task": {
                    "type": "string",
                    "description": "Task description for recording.",
                },
                "num_episodes": {
                    "type": "integer",
                    "description": "Number of episodes to record or run.",
                },
                "fps": {
                    "type": "integer",
                    "description": "Frames per second for recording.",
                },
                "steps": {
                    "type": "integer",
                    "description": "Number of training steps.",
                },
                "checkpoint_path": {
                    "type": "string",
                    "description": "Path to a trained policy checkpoint.",
                },
                "job_id": {
                    "type": "string",
                    "description": "ID of a background training job.",
                },
                "device": {
                    "type": "string",
                    "description": "Device for training (default: cuda).",
                },
            },
            "required": ["action"],
        }

    async def execute(self, action: str, **kwargs: Any) -> str:
        from roboclaw.embodied.embodiment.so101 import SO101Controller
        from roboclaw.embodied.learning.act_pipeline import ACTPipeline
        from roboclaw.embodied.learning.runner import LocalLeRobotRunner

        port = kwargs.get("port", _DEFAULT_PORT)
        calibration_dir = kwargs.get("calibration_dir", _DEFAULT_CALIBRATION_DIR)

        controller = SO101Controller()
        pipeline = ACTPipeline()
        runner = LocalLeRobotRunner()

        if action == "doctor":
            return self._run_sync(runner, controller.doctor())

        if action == "calibrate":
            argv = controller.calibrate(port=port, calibration_dir=calibration_dir)
            return self._run_sync(runner, argv)

        if action == "teleoperate":
            argv = controller.teleoperate(port=port, calibration_dir=calibration_dir)
            return self._run_sync(runner, argv)

        if action == "record":
            argv = controller.record(
                port=port,
                calibration_dir=calibration_dir,
                dataset_name=kwargs.get("dataset_name", "default"),
                task=kwargs.get("task", "default_task"),
                num_episodes=kwargs.get("num_episodes", 10),
                fps=kwargs.get("fps", 30),
            )
            return self._run_sync(runner, argv)

        if action == "train":
            return self._handle_train(runner, pipeline, kwargs)

        if action == "run_policy":
            checkpoint = kwargs.get("checkpoint_path")
            if not checkpoint:
                checkpoint = pipeline.checkpoint_path(_POLICY_OUTPUT)
            argv = controller.run_policy(
                port=port,
                calibration_dir=calibration_dir,
                checkpoint_path=checkpoint,
                num_episodes=kwargs.get("num_episodes", 1),
            )
            return self._run_sync(runner, argv)

        if action == "job_status":
            job_id = kwargs.get("job_id", "")
            status = runner.job_status(job_id=job_id, log_dir=_LOGS_DIR)
            return self._format_job_status(status)

        return f"Unknown action: {action}"

    @staticmethod
    def _run_sync(runner: Any, argv: list[str]) -> str:
        returncode, stdout, stderr = runner.run(argv)
        if returncode != 0:
            return f"Command failed (exit {returncode}).\nstdout: {stdout}\nstderr: {stderr}"
        return stdout or "Done."

    @staticmethod
    def _handle_train(runner: Any, pipeline: Any, kwargs: dict[str, Any]) -> str:
        dataset_name = kwargs.get("dataset_name", "default")
        dataset_path = f"{_DATASET_ROOT}/{dataset_name}"
        device = kwargs.get("device", "cuda")
        steps = kwargs.get("steps", 100_000)

        argv = pipeline.train(
            dataset_path=dataset_path,
            output_dir=_POLICY_OUTPUT,
            steps=steps,
            device=device,
        )
        job_id = runner.run_detached(argv=argv, log_dir=_LOGS_DIR)
        return f"Training started. Job ID: {job_id}"

    @staticmethod
    def _format_job_status(status: dict[str, Any]) -> str:
        lines = [f"{k}: {v}" for k, v in status.items()]
        return "\n".join(lines)
