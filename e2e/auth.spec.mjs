import { expect, test } from "@playwright/test";

test("register, change settings, and log out", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  await page.goto("/register");

  await page.getByLabel("メールアドレス").fill(email);
  await page
    .getByLabel("パスワード", { exact: true })
    .fill("correct horse battery staple");
  await page
    .getByLabel("パスワード（確認）")
    .fill("correct horse battery staple");
  await page.getByRole("button", { name: "登録する" }).click();

  await expect(
    page.getByRole("heading", { name: "動画づくりを始めましょう" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "設定" }).click();
  await expect(
    page.getByRole("heading", { name: "既定値の設定" }),
  ).toBeVisible();

  await page.getByLabel("画面の言語").selectOption("en");
  await expect(page.getByLabel("画面の言語")).toHaveValue("en");
  const settingsResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/settings") &&
      response.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "保存" }).click();
  expect((await settingsResponse).status()).toBe(200);
  await expect(page.getByText("Settings saved.")).toBeVisible();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
});
