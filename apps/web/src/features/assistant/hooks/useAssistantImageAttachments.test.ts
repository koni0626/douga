import { describe, expect, it } from "vitest";

import { imageFilesFromClipboard } from "./useAssistantImageAttachments";

function item(file: File | null, type: string, kind = "file") {
  return { getAsFile: () => file, kind, type } as DataTransferItem;
}

describe("imageFilesFromClipboard", () => {
  it("returns only image files and gives unnamed clipboard images a filename", () => {
    const image = new File(["image"], "image", { type: "image/png" });
    const audio = new File(["audio"], "sound.mp3", { type: "audio/mpeg" });

    const files = imageFilesFromClipboard([
      item(image, "image/png"),
      item(audio, "audio/mpeg"),
      item(null, "text/plain", "string"),
    ] as unknown as DataTransferItemList);

    expect(files).toHaveLength(1);
    expect(files[0]?.name).toMatch(/^clipboard-\d+\.png$/);
    expect(files[0]?.type).toBe("image/png");
  });
});
