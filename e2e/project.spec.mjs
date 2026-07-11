import { expect, test } from "@playwright/test";

async function seekTimeline(page, timeMs) {
  await page
    .getByRole("slider", { name: "再生位置" })
    .evaluate((element, value) => {
      const bounds = element.getBoundingClientRect();
      element.dispatchEvent(
        new globalThis.PointerEvent("pointerdown", {
          bubbles: true,
          clientX: bounds.left + bounds.width * (value / 5_000),
        }),
      );
    }, timeMs);
}

test("create a project and auto-save its canvas", async ({ page }) => {
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
  await expect(page.locator(".scene-panel")).toHaveCount(0);
  await expect(page.locator(".timeline-scene-strip")).toHaveCount(0);
  const dropZone = page.getByLabel("キャンバス画像のドロップ領域");
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
    page.getByText("ここに画像をドロップしてキャンバスへ追加"),
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
  const renderedImage = page.locator(".editor-preview image");
  await expect(renderedImage).toHaveAttribute("width", "1080");
  await expect(renderedImage).toHaveAttribute("height", "1080");
  await expect(renderedImage).toHaveAttribute("x", "420");
  await expect(renderedImage).toHaveAttribute("y", "0");

  const objectHitbox = page.locator(".canvas-object-hitbox").first();
  await objectHitbox.click();
  await expect(page.locator(".canvas-object-toolbar")).toHaveCount(0);
  await expect(page.locator(".canvas-object-resize-handle")).toHaveCount(4);
  const hitboxBounds = await objectHitbox.boundingBox();
  if (!hitboxBounds) throw new Error("Canvas object is not measurable");
  await page.mouse.move(
    hitboxBounds.x + hitboxBounds.width / 2,
    hitboxBounds.y + hitboxBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    hitboxBounds.x + hitboxBounds.width / 2 + 20,
    hitboxBounds.y + hitboxBounds.height / 2 + 10,
  );
  await page.mouse.up();
  await expect(renderedImage).not.toHaveAttribute("x", "420");

  const resizeHandle = page.locator(".canvas-object-resize-handle--nw");
  const resizeBounds = await resizeHandle.boundingBox();
  if (!resizeBounds) throw new Error("Resize handle is not measurable");
  await page.mouse.move(
    resizeBounds.x + resizeBounds.width / 2,
    resizeBounds.y + resizeBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    resizeBounds.x + resizeBounds.width / 2 - 15,
    resizeBounds.y + resizeBounds.height / 2 - 15,
  );
  await page.mouse.up();
  await expect(renderedImage).not.toHaveAttribute("width", "1080");

  const rotateHandle = page.locator(".canvas-object-rotate-handle");
  const rotateBounds = await rotateHandle.boundingBox();
  if (!rotateBounds) throw new Error("Rotate handle is not measurable");
  await page.mouse.move(
    rotateBounds.x + rotateBounds.width / 2,
    rotateBounds.y + rotateBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    rotateBounds.x + rotateBounds.width / 2 + 25,
    rotateBounds.y + rotateBounds.height / 2 + 10,
  );
  await page.mouse.up();
  await expect(renderedImage).not.toHaveAttribute("transform", /rotate\(0\)/);

  await objectHitbox.click({ button: "right" });
  await page.getByRole("menuitem", { name: "左右反転" }).click();
  await expect(renderedImage).toHaveAttribute("transform", /scale\(-1 1\)/);
  await objectHitbox.click({ button: "right" });
  await page.getByRole("menuitem", { name: "上下反転" }).click();
  await expect(renderedImage).toHaveAttribute("transform", /scale\(-1 -1\)/);
  await objectHitbox.click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "キャンバスいっぱいに表示" })
    .click();
  await expect(renderedImage).toHaveAttribute("width", "1920");
  await expect(renderedImage).toHaveAttribute("height", "1920");
  await expect(renderedImage).toHaveAttribute("x", "0");
  await expect(renderedImage).toHaveAttribute("y", "-420");
  await expect(renderedImage).toHaveAttribute("transform", /rotate\(0\)/);
  await objectHitbox.click({ button: "right" });
  await page.getByRole("menuitem", { name: "ロック", exact: true }).click();
  await expect(page.locator('[aria-label="ロック中"]')).toBeVisible();
  await expect(page.locator(".object-timeline-clip--locked")).toBeVisible();
  await expect(
    page.locator('svg[data-render-canvas] [aria-label="ロック中"]'),
  ).toHaveCount(0);
  await objectHitbox.click({ button: "right" });
  await page.getByRole("menuitem", { name: "ロック解除" }).click();

  await page.getByRole("button", { name: "レイヤー", exact: true }).click();
  await page.getByRole("button", { name: "図形", exact: true }).click();
  const timelineLabels = page.locator(".object-timeline-label");
  // タイムライン上段がプレビューの最前面になる。
  await expect(timelineLabels).toHaveText(["図形", "画像"]);
  await expect(page.locator("svg[data-render-canvas] > *")).toHaveCount(3);
  await timelineLabels.nth(1).dragTo(timelineLabels.nth(0), {
    targetPosition: { x: 30, y: 1 },
  });
  await expect(timelineLabels).toHaveText(["画像", "図形"]);
  await expect(
    page.locator("svg[data-render-canvas] > *").nth(1),
  ).toHaveJSProperty("tagName", "rect");
  await expect(
    page.locator("svg[data-render-canvas] > *").nth(2),
  ).toHaveJSProperty("tagName", "image");
  await timelineLabels.nth(1).dragTo(timelineLabels.nth(0), {
    targetPosition: { x: 30, y: 1 },
  });
  await expect(timelineLabels).toHaveText(["図形", "画像"]);

  const shapeTimelineRow = page
    .locator(".object-timeline-row")
    .filter({ hasText: "図形" });
  await seekTimeline(page, 1000);
  await expect(page.getByRole("button", { name: "動きを記録" })).toHaveCount(0);
  const shapeHitbox = page.locator(".canvas-object-hitbox").last();
  await shapeHitbox.click({ button: "right" });
  await page.getByRole("menuitem", { name: "エフェクト ›" }).click();
  await page.getByRole("menuitem", { name: "フェードイン" }).click();
  await expect(shapeTimelineRow.locator(".object-keyframe-marker")).toHaveCount(
    2,
  );
  await seekTimeline(page, 4000);
  await page.getByRole("spinbutton", { name: "x" }).fill("600");
  await expect(shapeTimelineRow.locator(".object-keyframe-marker")).toHaveCount(
    3,
  );
  await seekTimeline(page, 2500);
  const animatedShape = page.locator("svg[data-render-canvas] > rect").nth(1);
  await expect(animatedShape).not.toHaveAttribute("x", "160");
  await expect(animatedShape).not.toHaveAttribute("x", "600");

  await page.getByRole("button", { name: "キーフレーム 4.0s" }).click();
  const keyframeDialog = page.getByRole("dialog", { name: "キーフレーム" });
  await keyframeDialog
    .getByRole("combobox", { name: "動き方" })
    .selectOption("linear");
  await expect(
    keyframeDialog.getByRole("combobox", { name: "動き方" }),
  ).toHaveValue("linear");
  await keyframeDialog.getByRole("button", { name: "現在位置に複製" }).click();
  await expect(shapeTimelineRow.locator(".object-keyframe-marker")).toHaveCount(
    4,
  );
  await page.getByRole("button", { name: "キーフレーム 2.5s" }).click();
  await page
    .getByRole("dialog", { name: "キーフレーム" })
    .getByRole("button", { name: "削除" })
    .click();
  await expect(shapeTimelineRow.locator(".object-keyframe-marker")).toHaveCount(
    3,
  );
  await shapeHitbox.click({ button: "right" });
  await page.getByRole("menuitem", { name: "アニメーション ›" }).click();
  await page.getByRole("menuitem", { name: "左からスライド" }).click();
  await expect(shapeTimelineRow.locator(".object-keyframe-marker")).toHaveCount(
    5,
  );
  await page.getByRole("button", { name: "設定を閉じる" }).click();

  await expect(page.locator(".object-timeline")).toBeVisible();
  await page.getByRole("button", { name: "タイムラインを閉じる" }).click();
  await expect(page.locator(".object-timeline-scroll")).toHaveCount(0);
  await page.getByRole("button", { name: "タイムラインを開く" }).click();
  await expect(page.locator(".object-timeline-scroll")).toBeVisible();
  await expect(page.locator(".preview-controls")).toHaveCount(0);
  await page.getByRole("button", { name: "再生", exact: true }).click();
  await expect(page.locator(".timeline-icon-button--active")).toBeVisible();
  await page.getByRole("button", { name: "停止", exact: true }).click();
  await expect(page.getByRole("slider", { name: "再生位置" })).toHaveAttribute(
    "aria-valuenow",
    "0",
  );
  const imageTimelineRow = page
    .locator(".object-timeline-row")
    .filter({ hasText: "画像" });
  const timelineTrack = imageTimelineRow.locator(".object-timeline-track");
  const timelineLabel = imageTimelineRow.locator(".object-timeline-label");
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
    imageTimelineRow.locator(".object-timeline-clip"),
  ).not.toHaveAttribute("style", /width: 100%/);
  await seekTimeline(page, 1000);
  await expect(page.locator(".editor-preview image")).toHaveCount(0);
  await seekTimeline(page, 4500);
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
  await page.getByRole("button", { name: "台本・テロップ" }).click();
  await expect(page.getByLabel("テロップ本文")).toHaveValue(
    "ノベルゲームのように自動で送られるテロップです。",
  );
  await expect(page.locator(".editor-preview image")).toHaveCount(0);
  await seekTimeline(page, 4500);
  await expect(page.locator(".editor-preview image")).toBeVisible();
  const pastedUpload = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /\/api\/v1\/assets\/[^/]+\/complete$/.test(response.url()) &&
      response.ok(),
  );
  await page.evaluate((base64) => {
    const binary = globalThis.atob(base64);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    const transfer = new globalThis.DataTransfer();
    transfer.items.add(
      new globalThis.File([bytes], "clipboard.png", { type: "image/png" }),
    );
    globalThis.dispatchEvent(
      new globalThis.ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer,
      }),
    );
  }, "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=");
  await pastedUpload;
  await expect(page.locator(".editor-preview image")).toHaveCount(2);
  await page.getByRole("link", { name: "プロジェクト", exact: true }).click();
  const projectCard = page
    .locator("article")
    .filter({ hasText: "自動保存テスト" });
  await expect(projectCard.locator(".project-thumbnail img")).toBeVisible();
  await expect(projectCard.getByText("NO PREVIEW")).toHaveCount(0);
});
