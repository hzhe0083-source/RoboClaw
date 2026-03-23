"""ACT policy command builder."""

from __future__ import annotations

from pathlib import Path


class ACTPipeline:
    """Builds LeRobot training commands for ACT policy."""

    def train(
        self,
        dataset_path: str,
        output_dir: str,
        steps: int = 100000,
        device: str = "cuda",
    ) -> list[str]:
        """Build the ACT training command."""
        dataset_dir = Path(dataset_path).expanduser()
        return [
            "lerobot-train",
            f"--dataset.repo_id=local/{dataset_dir.name}",
            f"--dataset.root={dataset_dir.parent}",
            "--policy.type=act",
            f"--output_dir={Path(output_dir).expanduser()}",
            f"--training.num_steps={steps}",
            f"--device={device}",
        ]

    def checkpoint_path(self, output_dir: str) -> str:
        """Return the last checkpoint path."""
        return str(Path(output_dir).expanduser() / "checkpoints" / "last" / "pretrained_model")
