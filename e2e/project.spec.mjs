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
  const dropZone = page.getByLabel("シーン画像のドロップ領域");
  await dropZone.evaluate((element) => {
    element.dispatchEvent(
      new globalThis.DragEvent("dragenter", {
        bubbles: true,
        cancelable: true,
        dataTransfer: new globalThis.DataTransfer(),
      }),
    );
  });
  await expect(
    page.getByText("ここに画像をドロップしてシーンへ追加"),
  ).toBeVisible();
  await dropZone.evaluate((element, base64) => {
    const binary = globalThis.atob(base64);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    const transfer = new globalThis.DataTransfer();
    transfer.items.add(
      new globalThis.File([bytes], "dropped.png", { type: "image/png" }),
    );
    element.dispatchEvent(
      new globalThis.DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }),
    );
  }, "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=");
  await expect(page.locator(".editor-preview image")).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "レイヤー" }).click();
  await expect(page.getByText("dropped.png")).toBeVisible();
  await page.getByRole("button", { name: "台本・テロップ" }).click();
  await page.getByRole("button", { name: "テロップを追加" }).click();
  await page
    .getByLabel("テロップ本文")
    .fill("ノベルゲームのように自動で送られるテロップです。");
  await expect(page.getByText("保存済み")).toBeVisible();
  await page.reload();
  await expect(page.getByText("1. シーン 1")).toBeVisible();
  await page.getByRole("button", { name: "台本・テロップ" }).click();
  await expect(page.getByLabel("テロップ本文")).toHaveValue(
    "ノベルゲームのように自動で送られるテロップです。",
  );
  await expect(page.locator(".editor-preview image")).toBeVisible();
});
