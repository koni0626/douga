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
  await expect(page.locator(".editor-workspace")).toBeVisible();

  await page.locator(".scene-thumbnail-list").click({ button: "right" });
  await page.getByRole("menuitem", { name: "新規追加" }).click();
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
  await expect(page.locator(".object-timeline")).toBeVisible();
  const timelineTrack = page.locator(".object-timeline-track").first();
  const timelineLabel = page.locator(".object-timeline-label").first();
  const trackBounds = await timelineTrack.boundingBox();
  const labelBounds = await timelineLabel.boundingBox();
  if (!trackBounds || !labelBounds)
    throw new Error("Timeline is not measurable");
  expect(trackBounds.x).toBeGreaterThanOrEqual(
    labelBounds.x + labelBounds.width - 1,
  );
  const hitTarget = await page.evaluate(
    ({ x, y }) => globalThis.document.elementFromPoint(x, y)?.className,
    {
      x: trackBounds.x + 5,
      y: trackBounds.y + trackBounds.height / 2,
    },
  );
  if (!String(hitTarget).includes("object-timeline-")) {
    throw new Error(`Unexpected timeline hit target: ${String(hitTarget)}`);
  }
  await page.mouse.move(
    trackBounds.x + 5,
    trackBounds.y + trackBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    trackBounds.x + trackBounds.width / 2,
    trackBounds.y + trackBounds.height / 2,
  );
  await page.mouse.up();
  await expect(
    page.locator(".object-timeline-clip").first(),
  ).not.toHaveAttribute("style", /width: 100%/);
  await page.getByLabel("再生位置").fill("1000");
  await expect(page.locator(".editor-preview image")).toHaveCount(0);
  await page.getByLabel("再生位置").fill("9000");
  await expect(page.locator(".editor-preview image")).toBeVisible();
  await page.getByRole("button", { name: "レイヤー" }).click();
  await expect(page.getByText("dropped.png")).toBeVisible();
  await page.getByRole("button", { name: "台本・テロップ" }).click();
  await page.getByRole("button", { name: "テロップを追加" }).click();
  const savedRevision = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /\/api\/v1\/projects\/[^/]+\/revisions$/.test(response.url()) &&
      response.ok(),
  );
  await page
    .getByLabel("テロップ本文")
    .fill("ノベルゲームのように自動で送られるテロップです。");
  await savedRevision;
  await page.reload();
  await expect(
    page.getByRole("button", { name: "1. シーン 1", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "台本・テロップ" }).click();
  await expect(page.getByLabel("テロップ本文")).toHaveValue(
    "ノベルゲームのように自動で送られるテロップです。",
  );
  await expect(page.locator(".editor-preview image")).toHaveCount(0);
  await page.getByLabel("再生位置").fill("9000");
  await expect(page.locator(".editor-preview image")).toBeVisible();

  const originalScene = page.getByRole("button", {
    name: "1. シーン 1",
    exact: true,
  });
  await originalScene.click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "新規追加" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "複製" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "削除" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+C");
  await page.keyboard.press("Control+V");

  const copiedScene = page.getByRole("button", {
    name: "2. シーン 1 コピー",
    exact: true,
  });
  await expect(copiedScene).toBeVisible();
  const copiedItem = page.locator(".scene-thumbnail-item").filter({
    has: copiedScene,
  });
  const originalItem = page.locator(".scene-thumbnail-item").filter({
    has: originalScene,
  });
  await copiedItem.dragTo(originalItem, { targetPosition: { x: 20, y: 2 } });
  const movedCopy = page.getByRole("button", {
    name: "1. シーン 1 コピー",
    exact: true,
  });
  await expect(movedCopy).toBeVisible();
  await page.keyboard.press("Control+Z");
  await expect(
    page.getByRole("button", {
      name: "2. シーン 1 コピー",
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press("Control+Y");
  await expect(movedCopy).toBeVisible();
  await movedCopy.click({ button: "right" });
  await page.getByRole("menuitem", { name: "削除" }).click();
  await expect(movedCopy).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "1. シーン 1", exact: true }),
  ).toBeVisible();
});
