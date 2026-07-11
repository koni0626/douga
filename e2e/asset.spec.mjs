import { expect, test } from "@playwright/test";
import { Buffer } from "node:buffer";

const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function silentWav() {
  const sampleRate = 8000;
  const samples = 800;
  const dataSize = samples * 2;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(dataSize, 40);
  return wav;
}

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
  await page.locator('input[type="file"]').setInputFiles({
    name: "tone.wav",
    mimeType: "audio/wav",
    buffer: silentWav(),
  });
  await expect(page.getByRole("heading", { name: "tone.wav" })).toBeVisible();

  await page.getByRole("link", { name: "プロジェクト" }).click();
  await page.getByLabel("新しいプロジェクト名").fill("素材参照テスト");
  await page.getByRole("button", { name: "作成" }).click();
  await page.getByRole("button", { name: "シーンを追加" }).click();
  await page
    .locator(".asset-picker")
    .getByRole("button", { name: "pixel.png" })
    .click();
  await page.getByText("ナレーション・BGM・効果音").click();
  await page.getByRole("button", { name: "tone.wav" }).click();
  await expect(page.getByText("保存済み")).toBeVisible();
  await page.reload();
  await expect(page.locator(".editor-preview image")).toBeVisible();
});
