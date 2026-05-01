from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi import Response
from fastapi.testclient import TestClient

from roboclaw.http.routes.collection import CloudApiError, register_collection_routes


class FakeDatasets:
    def __init__(self, root: Path) -> None:
        self.root = root


class FakeService:
    def __init__(self, root: Path) -> None:
        self.datasets = FakeDatasets(root)
        self.started: dict[str, Any] | None = None
        self.stopped = False
        self.fail_start = False
        self.status: dict[str, Any] = {
            "state": "idle",
            "record_phase": "idle",
            "saved_episodes": 0,
            "target_episodes": 0,
            "total_frames": 0,
            "elapsed_seconds": 0,
            "dataset": None,
            "error": "",
        }

    async def start_recording(self, **kwargs: Any) -> str:
        if self.fail_start:
            raise RuntimeError("local robot busy")
        self.started = kwargs
        self.status.update({
            "state": "recording",
            "record_phase": "recording",
            "target_episodes": kwargs["num_episodes"],
            "dataset": kwargs["dataset_name"],
        })
        return kwargs["dataset_name"]

    async def stop(self) -> None:
        self.stopped = True
        self.status.update({"state": "idle", "record_phase": "idle"})

    def get_status(self) -> dict[str, Any]:
        return dict(self.status)

    def get_hardware_status(self) -> dict[str, Any]:
        return {"ready": True, "arms": [], "cameras": []}


class FakeCloud:
    def __init__(self, name: str = "collection") -> None:
        self.name = name
        self.api_url = f"http://fake-{name}"
        self.requests: list[dict[str, Any]] = []
        self.proxy_requests: list[dict[str, Any]] = []
        self.fail_finish = False
        self.fail_assignments = False
        self.assignments = [{"id": "assign-1", "task_name": "Task A"}]

    async def request(
        self,
        method: str,
        path: str,
        *,
        authorization: str | None = None,
        json_body: Any | None = None,
        params: dict[str, Any] | None = None,
    ) -> Any:
        self.requests.append({
            "method": method,
            "path": path,
            "authorization": authorization,
            "json": json_body,
            "params": params,
        })
        if path == "/collection/my/assignments":
            if self.fail_assignments:
                raise CloudApiError(401, "用户不存在")
            return self.assignments
        if path == "/collection/today":
            return {"today": "2026-05-02", "timezone": "Asia/Shanghai"}
        if path == "/collection/runs/start":
            return {
                "id": "run-1",
                "dataset_name": "cloud_dataset",
                "status": "active",
                "task_params": {
                    "task": "cloud locked task",
                    "num_episodes": 2,
                    "fps": 20,
                    "episode_time_s": 5,
                    "reset_time_s": 1,
                    "use_cameras": False,
                    "arms": "left",
                },
            }
        if path.endswith("/heartbeat"):
            return {"id": "run-1", "status": "active"}
        if path.endswith("/finish"):
            if self.fail_finish:
                raise CloudApiError(502, "cloud down")
            return {"id": "run-1", "status": json_body["status"], "duration_seconds": json_body["duration_seconds"]}
        if path == "/collection/admin/tasks":
            return []
        if path == "/collection/admin/progress":
            return []
        raise AssertionError(f"unexpected cloud path {path}")

    async def proxy_raw(self, request: Any, path: str, authorization: str | None) -> Response:
        self.proxy_requests.append({
            "method": request.method,
            "path": path,
            "authorization": authorization,
        })
        return Response(
            json.dumps({"source": self.name, "path": path}),
            media_type="application/json",
        )


@pytest.fixture()
def app(tmp_path: Path):
    app = FastAPI()
    service = FakeService(tmp_path / "datasets")
    cloud = FakeCloud()
    register_collection_routes(
        app,
        service,  # type: ignore[arg-type]
        collection_config=type("Config", (), {"api_url": "http://fake", "heartbeat_interval_s": 999, "finish_retry_interval_s": 999})(),
        cloud_client=cloud,  # type: ignore[arg-type]
        state_dir=tmp_path / "state",
    )
    app.state.fake_service = service
    app.state.fake_cloud = cloud
    return app


@pytest.fixture()
def client(app: FastAPI):
    return TestClient(app, raise_server_exceptions=False)


def test_assignments_forwards_bearer_token(client: TestClient, app: FastAPI) -> None:
    resp = client.get("/api/collection/assignments?target_date=2026-05-01", headers={"Authorization": "Bearer abc"})

    assert resp.status_code == 200
    assert resp.json() == [{"id": "assign-1", "task_name": "Task A"}]
    request = app.state.fake_cloud.requests[-1]
    assert request["path"] == "/collection/my/assignments"
    assert request["authorization"] == "Bearer abc"
    assert request["params"] == {"target_date": "2026-05-01"}


def test_today_forwards_bearer_token(client: TestClient, app: FastAPI) -> None:
    resp = client.get("/api/collection/today", headers={"Authorization": "Bearer abc"})

    assert resp.status_code == 200
    assert resp.json() == {"today": "2026-05-02", "timezone": "Asia/Shanghai"}
    request = app.state.fake_cloud.requests[-1]
    assert request["path"] == "/collection/today"
    assert request["authorization"] == "Bearer abc"


def test_assignments_returns_cloud_error_without_500(client: TestClient, app: FastAPI) -> None:
    app.state.fake_cloud.fail_assignments = True

    resp = client.get("/api/collection/assignments", headers={"Authorization": "Bearer abc"})

    assert resp.status_code == 401
    assert resp.json()["detail"] == "用户不存在"


def test_evo_auth_proxy_uses_auth_cloud_not_collection_cloud(tmp_path: Path) -> None:
    app = FastAPI()
    service = FakeService(tmp_path / "datasets")
    collection_cloud = FakeCloud("collection")
    auth_cloud = FakeCloud("auth")
    register_collection_routes(
        app,
        service,  # type: ignore[arg-type]
        collection_config=type(
            "Config",
            (),
            {
                "auth_api_url": "https://api.evomind-tech.com",
                "api_url": "http://8.136.130.234/dev-api",
                "heartbeat_interval_s": 999,
                "finish_retry_interval_s": 999,
            },
        )(),
        cloud_client=collection_cloud,  # type: ignore[arg-type]
        auth_client=auth_cloud,  # type: ignore[arg-type]
        state_dir=tmp_path / "state",
    )
    client = TestClient(app, raise_server_exceptions=False)

    resp = client.get("/api/evo/auth/me", headers={"Authorization": "Bearer prod-token"})

    assert resp.status_code == 200
    assert resp.json() == {"source": "auth", "path": "/auth/me"}
    assert auth_cloud.proxy_requests[-1]["authorization"] == "Bearer prod-token"
    assert collection_cloud.proxy_requests == []


def test_start_uses_cloud_task_params_not_browser_params(client: TestClient, app: FastAPI) -> None:
    resp = client.post(
        "/api/collection/runs/start",
        headers={"Authorization": "Bearer abc"},
        json={"assignment_id": "assign-1", "task": "browser should not win"},
    )

    assert resp.status_code == 200
    assert resp.json()["dataset_name"] == "cloud_dataset"
    assert app.state.fake_service.started == {
        "task": "cloud locked task",
        "num_episodes": 2,
        "fps": 20,
        "episode_time_s": 5,
        "reset_time_s": 1,
        "dataset_name": "cloud_dataset",
        "use_cameras": False,
    }


def test_start_failure_marks_cloud_run_failed(client: TestClient, app: FastAPI) -> None:
    app.state.fake_service.fail_start = True

    resp = client.post(
        "/api/collection/runs/start",
        headers={"Authorization": "Bearer abc"},
        json={"assignment_id": "assign-1"},
    )

    assert resp.status_code == 400
    finish = app.state.fake_cloud.requests[-1]
    assert finish["path"] == "/collection/runs/run-1/finish"
    assert finish["json"]["status"] == "failed"
    assert finish["json"]["metadata"] == {"local_start_failed": True}


def test_finish_failure_is_queued_without_persisting_token(client: TestClient, app: FastAPI, tmp_path: Path) -> None:
    start = client.post(
        "/api/collection/runs/start",
        headers={"Authorization": "Bearer secret-token"},
        json={"assignment_id": "assign-1"},
    )
    assert start.status_code == 200
    dataset_meta = tmp_path / "datasets" / "local" / "cloud_dataset" / "meta"
    dataset_meta.mkdir(parents=True)
    (dataset_meta / "info.json").write_text(
        json.dumps({"total_episodes": 1, "total_frames": 40, "fps": 20}),
        encoding="utf-8",
    )
    app.state.fake_cloud.fail_finish = True

    stop = client.post("/api/collection/runs/stop", headers={"Authorization": "Bearer secret-token"})

    assert stop.status_code == 200
    assert stop.json()["status"] == "pending_cloud_finish"
    pending_path = tmp_path / "state" / "pending_collection_finishes.json"
    pending_text = pending_path.read_text(encoding="utf-8")
    assert "secret-token" not in pending_text
    assert "cloud_dataset" in pending_text

    app.state.fake_cloud.fail_finish = False
    retry = client.post("/api/collection/pending/retry", headers={"Authorization": "Bearer secret-token"})

    assert retry.status_code == 200
    assert retry.json()["synced"] == 1
    assert json.loads(pending_path.read_text(encoding="utf-8")) == []
