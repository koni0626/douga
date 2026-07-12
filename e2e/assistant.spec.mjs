import { expect, test } from "@playwright/test";

test("open the project assistant and keep the conversation composer available", async ({
  page,
}) => {
  const email = `assistant-e2e-${Date.now()}@example.com`;
  await page.goto("/register");
  await page.getByLabel("メールアドレス").fill(email);
  await page
    .getByLabel("パスワード", { exact: true })
    .fill("correct horse battery staple");
  await page
    .getByLabel("パスワード（確認）")
    .fill("correct horse battery staple");
  await page.getByRole("button", { name: "登録する" }).click();

  await page.getByRole("link", { name: "プロジェクト" }).click();
  await page.getByLabel("新しいプロジェクト名").fill("AIアシスタント確認");
  await page.getByRole("button", { name: "作成" }).click();

  const panel = page.getByRole("complementary", { name: "AIアシスタント" });
  await expect(panel).toBeVisible();
  await expect(page.getByLabel("AIアシスタントへのメッセージ")).toBeEnabled({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "AIアシスタントを閉じる" }).click();
  await expect(panel).toHaveCount(0);
  await page.getByRole("button", { name: "AIアシスタントを開く" }).click();
  await expect(panel).toBeVisible();
});
