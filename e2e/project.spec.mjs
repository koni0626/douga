import { expect, test } from "@playwright/test";

test("create a project and auto-save a scene", async ({ page }) => {
  const email = `project-e2e-${Date.now()}@example.com`;
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
  await page.getByLabel("新しいプロジェクト名").fill("自動保存テスト");
  await page.getByRole("button", { name: "作成" }).click();
  await expect(
    page.getByRole("heading", { name: "自動保存テスト" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "シーンを追加" }).click();
  await page.getByRole("button", { name: "テロップを追加" }).click();
  await page
    .getByLabel("テロップ本文")
    .fill("ノベルゲームのように自動で送られるテロップです。");
  await expect(page.getByText("保存済み")).toBeVisible();
  await page.reload();
  await expect(page.getByText("1. シーン 1")).toBeVisible();
  await expect(page.getByLabel("テロップ本文")).toHaveValue(
    "ノベルゲームのように自動で送られるテロップです。",
  );
});
