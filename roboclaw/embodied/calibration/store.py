from __future__ import annotations

import json
from pathlib import Path

from roboclaw.embodied.calibration.model import CalibrationProfile


class CalibrationStore:
    def profile_path(self, arm: object) -> Path:
        calibration_dir = Path(getattr(arm, "calibration_dir", "")).expanduser()
        arm_id = getattr(arm, "arm_id", "")
        if not calibration_dir or not arm_id:
            raise RuntimeError(f"Arm '{getattr(arm, 'alias', '<unknown>')}' has no calibration path.")
        return calibration_dir / f"{arm_id}.json"

    def has_profile(self, arm: object) -> bool:
        return self.profile_path(arm).exists()

    def load_profile(self, arm: object) -> CalibrationProfile:
        path = self.profile_path(arm)
        if not path.exists():
            raise RuntimeError(f"Calibration profile missing for {getattr(arm, 'alias', '<unknown>')}.")
        data = json.loads(path.read_text(encoding="utf-8"))
        return CalibrationProfile.from_dict(data)

    def save_profile(self, arm: object, profile: CalibrationProfile) -> Path:
        path = self.profile_path(arm)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(profile.to_dict(), indent=4, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        return path
