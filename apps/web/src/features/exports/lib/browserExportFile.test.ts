import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createBrowserExportWritable,
  isBrowserExportPickerCanceled,
} from "./browserExportFile";

afterEach(() => {
  Reflect.deleteProperty(window, "showSaveFilePicker");
});

describe("createBrowserExportWritable", () => {
  it("opens a writable MP4 destination with a safe filename", async () => {
    const writable = new WritableStream();
    const picker = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue(writable),
    });
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: picker,
    });

    await expect(createBrowserExportWritable("bad:name")).resolves.toBe(
      writable,
    );
    expect(picker).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: "bad_name.mp4" }),
    );
  });
});

describe("isBrowserExportPickerCanceled", () => {
  it("recognizes a canceled file picker", () => {
    expect(
      isBrowserExportPickerCanceled(new DOMException("Canceled", "AbortError")),
    ).toBe(true);
  });
});
