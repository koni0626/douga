import { expect, test } from "@playwright/test";

test("collaborate, edit, undo and approve costly assistant tools", async ({
  page,
}) => {
  test.setTimeout(90_000);
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
  await page
    .getByRole("button", { name: "AIアシスタントを折りたたむ" })
    .click();
  await expect(panel).toHaveCount(0);
  await page.getByRole("button", { name: "AIアシスタントを展開する" }).click();
  await expect(panel).toBeVisible();

  const resize = page.getByRole("separator", {
    name: "AIアシスタントの幅を変更",
  });
  const widthBefore = Number(await resize.getAttribute("aria-valuenow"));
  const resizeBox = await resize.boundingBox();
  if (!resizeBox) throw new Error("Assistant resize handle is not visible");
  await resize.dispatchEvent("pointerdown", { clientX: resizeBox.x + 2 });
  await page.evaluate((clientX) => {
    window.dispatchEvent(new window.PointerEvent("pointermove", { clientX }));
    window.dispatchEvent(new window.PointerEvent("pointerup", { clientX }));
  }, resizeBox.x - 60);
  await expect(resize).not.toHaveAttribute(
    "aria-valuenow",
    String(widthBefore),
  );

  const composer = page.getByLabel("AIアシスタントへのメッセージ");
  const timelineRows = page.locator(".object-timeline-row");
  const rowsBefore = await timelineRows.count();
  await composer.fill("プロットを一緒に考えて");
  await composer.press("Enter");
  await expect(panel.getByText(/目的/).last()).toBeVisible({ timeout: 15_000 });
  await expect(timelineRows).toHaveCount(rowsBefore);

  await composer.fill("テキスト「E2E AI」を追加して");
  await composer.press("Enter");
  await expect(
    panel.getByRole("button", { name: "AIの変更を取り消す" }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(timelineRows).toHaveCount(rowsBefore + 1);
  await panel.getByRole("button", { name: "AIの変更を取り消す" }).click();
  await expect(timelineRows).toHaveCount(rowsBefore);

  await composer.fill("朝の工場の画像を生成してタイムラインに配置して");
  await composer.press("Enter");
  await expect(panel.getByText("生成した画像")).toBeVisible({
    timeout: 20_000,
  });
  await expect(timelineRows).toHaveCount(rowsBefore + 1);
  await expect(composer).toBeEnabled({ timeout: 15_000 });

  await composer.fill("夜の工場の高品質画像を生成して");
  await composer.press("Enter");
  await expect(panel.getByText("実行前の確認が必要です")).toBeVisible({
    timeout: 15_000,
  });
  await panel.getByRole("button", { name: "今回はしない" }).click();
  await expect(panel.getByText("実行前の確認が必要です")).toHaveCount(0);

  await composer.fill("MP4を書き出して");
  await composer.press("Enter");
  await expect(panel.getByText("MP4を書き出し")).toBeVisible({
    timeout: 15_000,
  });
  await panel.getByRole("button", { name: "今回はしない" }).click();
  await expect(panel.locator(".assistant-approval-card")).toHaveCount(0);

  await page.reload();
  await expect(page.getByText("E2E AI").first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByRole("complementary", { name: "AIアシスタント" }),
  ).toBeVisible();
});

test("use the assistant UI in English", async ({ page }) => {
  const email = `assistant-en-e2e-${Date.now()}@example.com`;
  await page.goto("/register");
  await page.getByLabel("言語").selectOption("en");
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("correct horse battery staple");
  await page
    .getByLabel("Confirm password")
    .fill("correct horse battery staple");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("link", { name: "Projects" }).click();
  await page.getByLabel("New project name").fill("English assistant");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(
    page.getByRole("complementary", { name: "AI assistant" }),
  ).toBeVisible();
  await expect(page.getByLabel("Message to the AI assistant")).toBeEnabled({
    timeout: 10_000,
  });
});
