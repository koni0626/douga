import { expect, test } from "@playwright/test";
import { Buffer } from "node:buffer";

const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

test("upload and display an image asset", async ({ page }) => {
  await page.goto("/register");
  await page
    .getByLabel("メールアドレス")
    .fill(`asset-e2e-${Date.now()}@example.com`);
  await page
    .getByLabel("パスワード", { exact: true })
    .fill("correct horse battery staple");
  await page
    .getByLabel("パスワード（確認）")
    .fill("correct horse battery staple");
  await page.getByRole("button", { name: "登録する" }).click();

  await page.getByRole("link", { name: "素材" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "pixel.png",
    mimeType: "image/png",
    buffer: pixel,
  });
  await expect(page.getByRole("heading", { name: "pixel.png" })).toBeVisible();
  await expect(page.locator(".asset-preview img")).toBeVisible();
  await expect(page.getByText("1 × 1")).toBeVisible();
});
