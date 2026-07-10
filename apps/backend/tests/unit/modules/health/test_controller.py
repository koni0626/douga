from douga.api_main import create_app
from fastapi.testclient import TestClient


def test_live_health_check() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/api/v1/health/live", headers={"X-Request-ID": "test-id"})

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["X-Request-ID"] == "test-id"
