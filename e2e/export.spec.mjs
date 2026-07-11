import { expect, test } from "@playwright/test";

test("render a project and show the completed MP4", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/register");
  await page
    .getByLabel("メールアドレス")
    .fill(`export-e2e-${Date.now()}@example.com`);
  await page
    .getByLabel("パスワード", { exact: true })
    .fill("correct horse battery staple");
  await page
    .getByLabel("パスワード（確認）")
    .fill("correct horse battery staple");
  await page.getByRole("button", { name: "登録する" }).click();

  await page.getByRole("link", { name: "設定" }).click();
  await expect(page.getByLabel("幅")).toHaveValue("1920");
  await page.getByLabel("幅").fill("320");
  await page.getByLabel("高さ").fill("240");
  await page.getByLabel("FPS").fill("10");
  await expect(page.getByLabel("幅")).toHaveValue("320");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("設定を保存しました。")).toBeVisible();

  await page.getByRole("link", { name: "プロジェクト" }).click();
  await page.getByLabel("新しいプロジェクト名").fill("E2E完成動画");
  await page.getByRole("button", { name: "作成" }).click();
  await page.locator(".scene-thumbnail-list").click({ button: "right" });
  await page.getByRole("menuitem", { name: "新規追加" }).click();
  await page.getByRole("button", { name: "台本・テロップ" }).click();
  await page.getByRole("button", { name: "テロップを追加" }).click();
  await expect(page.getByText("保存済み")).toBeVisible();
  await page.getByRole("link", { name: "プロジェクトへ戻る" }).click();
  await page.getByRole("button", { name: "MP4を書き出す" }).click();
  await expect(
    page.getByRole("heading", { name: "E2E完成動画.mp4" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("link", { name: "ダウンロード" })).toBeVisible({
    timeout: 30_000,
  });
});
