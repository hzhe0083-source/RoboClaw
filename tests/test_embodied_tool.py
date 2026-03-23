"""Tests for the EmbodiedTool integration with the agent."""

import sys
import types
from unittest.mock import MagicMock, patch

import pytest

from roboclaw.embodied.tool import EmbodiedTool


def _patch_embodied_imports(mock_controller_cls, mock_pipeline_cls, mock_runner_cls):
    """Create mock modules so lazy imports inside execute() resolve."""
    so101_mod = types.ModuleType("roboclaw.embodied.embodiment.so101")
    so101_mod.SO101Controller = mock_controller_cls

    act_mod = types.ModuleType("roboclaw.embodied.learning.act_pipeline")
    act_mod.ACTPipeline = mock_pipeline_cls

    runner_mod = types.ModuleType("roboclaw.embodied.learning.runner")
    runner_mod.LocalLeRobotRunner = mock_runner_cls

    return patch.dict(sys.modules, {
        "roboclaw.embodied.embodiment.so101": so101_mod,
        "roboclaw.embodied.learning.act_pipeline": act_mod,
        "roboclaw.embodied.learning.runner": runner_mod,
    })


def test_tool_schema() -> None:
    tool = EmbodiedTool()
    assert tool.name == "embodied"
    assert "robot" in tool.description.lower()

    params = tool.parameters
    assert params["type"] == "object"
    assert "action" in params["properties"]
    assert params["required"] == ["action"]

    action_schema = params["properties"]["action"]
    assert action_schema["type"] == "string"
    expected_actions = [
        "doctor", "calibrate", "teleoperate", "record",
        "train", "run_policy", "job_status",
    ]
    assert action_schema["enum"] == expected_actions

    for key in ("port", "calibration_dir", "dataset_name", "task",
                "num_episodes", "fps", "steps", "checkpoint_path",
                "job_id", "device"):
        assert key in params["properties"], f"Missing optional param: {key}"


@pytest.mark.asyncio
async def test_doctor_action() -> None:
    tool = EmbodiedTool()

    mock_controller = MagicMock()
    mock_controller.doctor.return_value = ["lerobot", "env", "--list"]

    mock_runner = MagicMock()
    mock_runner.run.return_value = (0, "lerobot is available", "")

    with _patch_embodied_imports(
        lambda: mock_controller, MagicMock, lambda: mock_runner,
    ):
        result = await tool.execute(action="doctor")

    assert result == "lerobot is available"
    mock_controller.doctor.assert_called_once()
    mock_runner.run.assert_called_once_with(["lerobot", "env", "--list"])


@pytest.mark.asyncio
async def test_record_action() -> None:
    tool = EmbodiedTool()

    mock_controller = MagicMock()
    expected_argv = [
        "lerobot", "record",
        "--robot.type=so101",
        "--robot.port=/dev/ttyACM0",
        "--dataset.name=my_data",
        "--task=grasp block",
        "--num-episodes=5",
        "--fps=15",
    ]
    mock_controller.record.return_value = expected_argv

    mock_runner = MagicMock()
    mock_runner.run.return_value = (0, "Recorded 5 episodes", "")

    with _patch_embodied_imports(
        lambda: mock_controller, MagicMock, lambda: mock_runner,
    ):
        result = await tool.execute(
            action="record",
            dataset_name="my_data",
            task="grasp block",
            num_episodes=5,
            fps=15,
        )

    assert result == "Recorded 5 episodes"
    mock_controller.record.assert_called_once_with(
        port="/dev/ttyACM0",
        calibration_dir="~/.roboclaw/workspace/embodied/calibration/so101",
        dataset_name="my_data",
        task="grasp block",
        num_episodes=5,
        fps=15,
    )
    mock_runner.run.assert_called_once_with(expected_argv)


@pytest.mark.asyncio
async def test_train_action() -> None:
    tool = EmbodiedTool()

    mock_pipeline = MagicMock()
    train_argv = ["lerobot", "train", "--steps=5000", "--device=cuda"]
    mock_pipeline.train.return_value = train_argv

    mock_runner = MagicMock()
    mock_runner.run_detached.return_value = "job-abc-123"

    with _patch_embodied_imports(
        MagicMock, lambda: mock_pipeline, lambda: mock_runner,
    ):
        result = await tool.execute(
            action="train",
            dataset_name="my_data",
            steps=5000,
        )

    assert "job-abc-123" in result
    assert "Training started" in result
    mock_pipeline.train.assert_called_once_with(
        dataset_path="~/.roboclaw/workspace/embodied/datasets/my_data",
        output_dir="~/.roboclaw/workspace/embodied/policies",
        steps=5000,
        device="cuda",
    )
    mock_runner.run_detached.assert_called_once_with(
        argv=train_argv,
        log_dir="~/.roboclaw/workspace/embodied/jobs",
    )


@pytest.mark.asyncio
async def test_job_status_action() -> None:
    tool = EmbodiedTool()

    mock_runner = MagicMock()
    mock_runner.job_status.return_value = {
        "status": "running",
        "step": 2500,
        "total_steps": 5000,
    }

    with _patch_embodied_imports(
        MagicMock, MagicMock, lambda: mock_runner,
    ):
        result = await tool.execute(action="job_status", job_id="job-abc-123")

    assert "running" in result
    assert "2500" in result
    mock_runner.job_status.assert_called_once_with(
        job_id="job-abc-123",
        log_dir="~/.roboclaw/workspace/embodied/jobs",
    )


@pytest.mark.asyncio
async def test_command_failure_returns_error() -> None:
    tool = EmbodiedTool()

    mock_controller = MagicMock()
    mock_controller.doctor.return_value = ["lerobot", "env", "--list"]

    mock_runner = MagicMock()
    mock_runner.run.return_value = (1, "", "lerobot not found")

    with _patch_embodied_imports(
        lambda: mock_controller, MagicMock, lambda: mock_runner,
    ):
        result = await tool.execute(action="doctor")

    assert "Command failed" in result
    assert "lerobot not found" in result


@pytest.mark.asyncio
async def test_unknown_action() -> None:
    tool = EmbodiedTool()

    with _patch_embodied_imports(MagicMock, MagicMock, MagicMock):
        result = await tool.execute(action="fly_to_moon")

    assert "Unknown action" in result
