import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[5]))

from scripts.douga.client import DougaClient


def configured_client(handler: httpx.MockTransport) -> DougaClient:
    client = DougaClient("http://douga.test/api/v1", "dga_pat_test", max_retries=1)
    client.client.close()
    client.client = httpx.Client(
        base_url="http://douga.test/api/v1",
        headers={"Authorization": "Bearer dga_pat_test"},
        transport=handler,
    )
    return client


def test_client_retries_transient_response_and_records_operation_id() -> None:
    calls = 0

    def handle(_: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(
                503, json={"error": {"code": "BUSY"}}, headers={"Retry-After": "0"}
            )
        return httpx.Response(
            200,
            json={"project": {"id": "project-1"}},
            headers={"X-Automation-Operation-ID": "operation-1"},
        )

    with configured_client(httpx.MockTransport(handle)) as client:
        result = client.get_project("project-1")

    assert calls == 2
    assert result["project"]["id"] == "project-1"
    assert client.operation_ids == ["operation-1"]


def test_asset_upload_streams_file_through_three_step_protocol(tmp_path: Path) -> None:
    content = b"large-enough-fixture" * 10_000
    asset_path = tmp_path / "fixture.png"
    asset_path.write_bytes(content)
    observed_put = b""

    def handle(request: httpx.Request) -> httpx.Response:
        nonlocal observed_put
        if request.method == "POST" and request.url.path.endswith("/assets/uploads"):
            return httpx.Response(201, json={"asset": {"id": "asset-1", "status": "pending"}})
        if request.method == "GET":
            return httpx.Response(200, json={"id": "asset-1", "status": "pending"})
        if request.method == "PUT":
            observed_put = request.read()
            return httpx.Response(200, json={"id": "asset-1", "status": "processing"})
        if request.method == "POST" and request.url.path.endswith("/complete"):
            return httpx.Response(
                200,
                json={"id": "asset-1", "status": "ready", "width": 100, "height": 100},
            )
        raise AssertionError(f"unexpected request: {request.method} {request.url}")

    with configured_client(httpx.MockTransport(handle)) as client:
        result = client.upload_asset(asset_path, "image")

    assert result["status"] == "ready"
    assert observed_put == content
