from douga.api_main import create_app
from httpx import ASGITransport, AsyncClient


async def test_live_health_check() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://testserver"
    ) as client:
        response = await client.get("/api/v1/health/live", headers={"X-Request-ID": "test-id"})

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["X-Request-ID"] == "test-id"
