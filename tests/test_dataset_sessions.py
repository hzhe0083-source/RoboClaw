from __future__ import annotations

from pathlib import Path

import pytest

from roboclaw.data import dataset_sessions


def test_session_handle_rejects_path_segments() -> None:
    handle = "session:remote:../../outside"

    assert dataset_sessions.parse_session_handle(handle) is None
    with pytest.raises(ValueError, match="Invalid dataset session handle"):
        dataset_sessions.resolve_session_dataset_path(handle)


def test_uploaded_directory_session_rejects_path_escape(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(dataset_sessions, "get_roboclaw_home", lambda: tmp_path)

    with pytest.raises(ValueError, match="Invalid uploaded file path"):
        dataset_sessions.create_uploaded_directory_session(files=[("../escape.txt", b"x")])
    with pytest.raises(ValueError, match="Invalid uploaded file path"):
        dataset_sessions.create_uploaded_directory_session(files=[("../dataset2/escape.txt", b"x")])

    assert not (tmp_path / "cache" / "escape.txt").exists()
    local_sessions = tmp_path / "cache" / "dataset-sessions" / "local_directory"
    assert not list(local_sessions.glob("*/dataset2/escape.txt"))


def test_remote_session_rolls_back_partial_download(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(dataset_sessions, "get_roboclaw_home", lambda: tmp_path)

    def fail_snapshot_download(
        *,
        repo_id: str,
        repo_type: str,
        local_dir: str,
        allow_patterns: list[str],
    ) -> None:
        dataset_dir = Path(local_dir)
        (dataset_dir / "meta").mkdir(parents=True)
        (dataset_dir / "meta" / "partial.json").write_text("{}", encoding="utf-8")
        raise RuntimeError("download failed")

    monkeypatch.setattr(dataset_sessions, "snapshot_download", fail_snapshot_download)

    with pytest.raises(RuntimeError, match="download failed"):
        dataset_sessions.register_remote_dataset_session("owner/dataset")

    remote_sessions = tmp_path / "cache" / "dataset-sessions" / "remote"
    assert not remote_sessions.exists() or not list(remote_sessions.iterdir())
    assert dataset_sessions.list_session_dataset_summaries() == []
