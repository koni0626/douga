import { expect, test } from "@playwright/test";

test("editor layout and Delete shortcut stay scoped", async ({ page }) => {
  const email = `editor-layout-e2e-${Date.now()}@example.com`;
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
  await page.getByLabel("新しいプロジェクト名").fill("レイアウトテスト");
  await page.getByRole("button", { name: "作成" }).click();
  await expect(page.locator(".editor-workspace")).toBeVisible();

  const layout = await page.evaluate(() => ({
    clientHeight: globalThis.document.documentElement.clientHeight,
    scrollHeight: globalThis.document.documentElement.scrollHeight,
    timelineBottom: globalThis.document
      .querySelector(".editor-timeline-area")
      ?.getBoundingClientRect().bottom,
  }));
  expect(layout.scrollHeight).toBeLessThanOrEqual(layout.clientHeight + 1);
  expect(layout.timelineBottom).toBeCloseTo(layout.clientHeight, 0);
  await expect(page.getByLabel("テロップ本文を直接入力")).toHaveCount(0);

  const timeline = page.getByRole("slider", { name: "再生位置" });
  await timeline.click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "テキストボックス（横）を追加" })
    .click();
  const textObject = page.locator(".canvas-object-hitbox");
  await expect(textObject).toHaveCount(1);
  await textObject.dblclick();

  const inlineEditor = page.getByLabel("テキストを直接編集");
  await inlineEditor.fill("AB");
  await inlineEditor.press("Home");
  await inlineEditor.press("Delete");
  await expect(inlineEditor).toHaveValue("B");
  await expect(textObject).toHaveCount(1);

  await inlineEditor.press("Control+Enter");
  await textObject.click();
  await page.keyboard.press("Delete");
  await expect(textObject).toHaveCount(0);

  await page.getByRole("button", { name: "テロップを追加" }).click();
  const captionClip = page.locator(".caption-timeline-clip");
  await expect(captionClip).toHaveCount(1);
  await expect(captionClip).toHaveClass(/caption-timeline-clip--selected/);
  await expect(page.getByLabel("テロップ本文を直接入力")).toBeVisible();

  const captionInput = captionClip.locator("input");
  await captionInput.fill("AB");
  await captionInput.press("Home");
  await captionInput.press("Delete");
  await expect(captionInput).toHaveValue("B");
  await expect(captionClip).toHaveCount(1);

  await captionClip.click({ position: { x: 3, y: 3 } });
  await page.getByRole("heading", { name: "タイムライン" }).click();
  await page.keyboard.press("Delete");
  await expect(captionClip).toHaveCount(0);
  await expect(page.getByLabel("テロップ本文を直接入力")).toHaveCount(0);
});
