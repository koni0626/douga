import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:5173",
    channel: process.env.CI
      ? undefined
      : (process.env.PLAYWRIGHT_CHANNEL ?? "msedge"),
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "uv run uvicorn douga.api_main:app --host 127.0.0.1 --port 8000",
      url: "http://127.0.0.1:8000/api/v1/health/live",
      reuseExistingServer: true,
      env: {
        APP_ENV: "test",
        APP_SECRET_KEY: "e2e-only-secret-key-with-at-least-32-characters",
        DATABASE_URL:
          process.env.TEST_DATABASE_URL ??
          "postgresql+asyncpg://postgres@127.0.0.1:5432/douga_test",
      },
    },
    {
      command: "pnpm --filter @douga/web dev --host 127.0.0.1 --port 5173",
      url: "http://127.0.0.1:5173/login",
      reuseExistingServer: true,
    },
  ],
});
