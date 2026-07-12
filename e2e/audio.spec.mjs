import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

const mp3 = execFileSync("ffmpeg", [
  "-hide_banner",
  "-loglevel",
  "error",
  "-f",
  "lavfi",
  "-i",
  "anullsrc=r=8000:cl=mono",
  "-t",
  "0.5",
  "-f",
  "mp3",
  "pipe:1",
]);

test("drop an MP3 on the timeline and edit playback settings", async ({
  page,
}) => {
  await page.goto("/register");
  await page
    .getByLabel("メールアドレス")
    .fill(`audio-e2e-${Date.now()}@example.com`);
  await page
    .getByLabel("パスワード", { exact: true })
    .fill("correct horse battery staple");
  await page
    .getByLabel("パスワード（確認）")
    .fill("correct horse battery staple");
  await page.getByRole("button", { name: "登録する" }).click();
  await page.getByRole("link", { name: "プロジェクト" }).click();
  await page.getByLabel("新しいプロジェクト名").fill("音声タイムライン");
  await page.getByRole("button", { name: "作成" }).click();

  const completedMp3 = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /\/api\/v1\/assets\/[^/]+\/complete$/.test(response.url()) &&
      response.ok(),
  );
  await page.locator(".editor-timeline-area").evaluate((element, base64) => {
    const binary = globalThis.atob(base64);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    const transfer = new globalThis.DataTransfer();
    transfer.items.add(
      new globalThis.File([bytes], "music.mp3", { type: "audio/mpeg" }),
    );
    const ruler = element.querySelector(".object-timeline-ruler");
    const bounds = ruler?.getBoundingClientRect();
    element.dispatchEvent(
      new globalThis.DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        clientX: bounds ? bounds.left + bounds.width * 0.4 : 0,
        dataTransfer: transfer,
      }),
    );
  }, mp3.toString("base64"));
  await completedMp3;

  await expect(page.locator(".audio-timeline-clip")).toHaveText("music.mp3");
  await expect(page.getByLabel("再生開始（秒）")).not.toHaveValue("0");
  await page.getByLabel("フェードイン（秒）").fill("0.2");
  await page.getByLabel("フェードアウト（秒）").fill("0.3");
  await page.getByLabel("音量").fill("0.55");
  await expect(page.getByLabel("音量")).toHaveValue("0.55");

  const clip = page.locator(".audio-timeline-clip");
  const bounds = await clip.boundingBox();
  if (!bounds) throw new Error("Audio clip is not measurable");
  const startBeforeDrag = await page.getByLabel("再生開始（秒）").inputValue();
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2 + 80,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.up();
  await expect(page.getByLabel("再生開始（秒）")).not.toHaveValue(
    startBeforeDrag,
  );
});
