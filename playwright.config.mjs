import { defineConfig } from "@playwright/test";

const apiPort = Number(process.env.E2E_API_PORT ?? 8000);
const webPort = Number(process.env.E2E_WEB_PORT ?? 5173);
const apiOrigin = `http://127.0.0.1:${apiPort}`;
const webOrigin = `http://127.0.0.1:${webPort}`;
const apiCommand =
  process.platform === "win32"
    ? `.venv\\Scripts\\python.exe -m uvicorn douga.api_main:app --host 127.0.0.1 --port ${apiPort}`
    : `uv run uvicorn douga.api_main:app --host 127.0.0.1 --port ${apiPort}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: webOrigin,
    channel: process.env.CI
      ? undefined
      : (process.env.PLAYWRIGHT_CHANNEL ?? "msedge"),
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: apiCommand,
      url: `${apiOrigin}/api/v1/health/live`,
      reuseExistingServer: true,
      env: {
        APP_ENV: "test",
        APP_SECRET_KEY: "e2e-only-secret-key-with-at-least-32-characters",
        ASSISTANT_PROVIDER: "fake",
        IMAGE_PROVIDER: "fake",
        ALLOWED_ORIGINS: JSON.stringify([webOrigin]),
        DATABASE_URL:
          process.env.TEST_DATABASE_URL ??
          "postgresql+asyncpg://postgres@127.0.0.1:5432/douga_test",
      },
    },
    {
      command: `pnpm --filter @douga/web dev --host 127.0.0.1 --port ${webPort}`,
      url: `${webOrigin}/login`,
      reuseExistingServer: true,
      env: {
        VITE_API_BASE_URL: `${apiOrigin}/api/v1`,
      },
    },
  ],
});
