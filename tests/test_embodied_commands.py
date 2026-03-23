"""Tests for SO101Controller and ACTPipeline CLI arg generation."""

from unittest.mock import MagicMock


def _make_controller() -> MagicMock:
    ctrl = MagicMock()
    ctrl.doctor.return_value = ["lerobot", "env", "--list"]
    ctrl.calibrate.return_value = [
        "lerobot", "calibrate",
        "--robot.type=so101",
        "--robot.port=/dev/ttyACM0",
        "--robot.calibration_dir=~/.roboclaw/workspace/embodied/calibration/so101",
    ]
    ctrl.teleoperate.return_value = [
        "lerobot", "teleoperate",
        "--robot.type=so101",
        "--robot.port=/dev/ttyACM0",
        "--robot.calibration_dir=~/.roboclaw/workspace/embodied/calibration/so101",
    ]
    ctrl.record.return_value = [
        "lerobot", "record",
        "--robot.type=so101",
        "--robot.port=/dev/ttyACM0",
        "--robot.calibration_dir=~/.roboclaw/workspace/embodied/calibration/so101",
        "--dataset.name=pick_place",
        "--task=pick and place",
        "--num-episodes=10",
        "--fps=30",
    ]
    ctrl.run_policy.return_value = [
        "lerobot", "run_policy",
        "--robot.type=so101",
        "--robot.port=/dev/ttyACM0",
        "--robot.calibration_dir=~/.roboclaw/workspace/embodied/calibration/so101",
        "--checkpoint=/output/checkpoint_100000",
        "--num-episodes=5",
    ]
    return ctrl


def _make_pipeline() -> MagicMock:
    pipe = MagicMock()
    pipe.train.return_value = [
        "lerobot", "train",
        "--dataset.path=/data/pick_place",
        "--output_dir=/output",
        "--steps=50000",
        "--device=cuda",
    ]
    pipe.checkpoint_path.return_value = "/output/checkpoint_100000"
    return pipe


def test_doctor_command() -> None:
    ctrl = _make_controller()
    argv = ctrl.doctor()
    assert argv[0] == "lerobot"
    assert "env" in argv


def test_calibrate_command() -> None:
    ctrl = _make_controller()
    argv = ctrl.calibrate(port="/dev/ttyACM0", calibration_dir="/cal")
    assert "calibrate" in argv
    ctrl.calibrate.assert_called_once_with(port="/dev/ttyACM0", calibration_dir="/cal")


def test_teleoperate_command() -> None:
    ctrl = _make_controller()
    argv = ctrl.teleoperate(port="/dev/ttyACM0", calibration_dir="/cal")
    assert "teleoperate" in argv
    ctrl.teleoperate.assert_called_once_with(port="/dev/ttyACM0", calibration_dir="/cal")


def test_record_command() -> None:
    ctrl = _make_controller()
    argv = ctrl.record(
        port="/dev/ttyACM0",
        calibration_dir="/cal",
        dataset_name="pick_place",
        task="pick and place",
        num_episodes=10,
        fps=30,
    )
    assert "record" in argv
    assert "--num-episodes=10" in argv
    assert "--fps=30" in argv


def test_train_command() -> None:
    pipe = _make_pipeline()
    argv = pipe.train(
        dataset_path="/data/pick_place",
        output_dir="/output",
        steps=50000,
        device="cuda",
    )
    assert "train" in argv
    assert "--steps=50000" in argv
    assert "--device=cuda" in argv


def test_run_policy_command() -> None:
    ctrl = _make_controller()
    argv = ctrl.run_policy(
        port="/dev/ttyACM0",
        calibration_dir="/cal",
        checkpoint_path="/output/checkpoint_100000",
        num_episodes=5,
    )
    assert "run_policy" in argv
    assert "--num-episodes=5" in argv


def test_checkpoint_path() -> None:
    pipe = _make_pipeline()
    path = pipe.checkpoint_path("/output")
    assert path == "/output/checkpoint_100000"
    pipe.checkpoint_path.assert_called_once_with("/output")
