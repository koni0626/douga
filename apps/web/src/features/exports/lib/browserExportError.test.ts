import { describe, expect, it } from "vitest";

import {
  BrowserExportError,
  browserExportDiagnostics,
} from "./browserExportError";

describe("browserExportDiagnostics", () => {
  it("serializes the nested cause without exposing arbitrary object fields", () => {
    const error = new BrowserExportError("encode_failed", "export failed", {
      cause: new Error("webgl context lost"),
    });

    expect(browserExportDiagnostics(error)).toEqual([
      {
        name: "BrowserExportError",
        message: "export failed",
        code: "encode_failed",
      },
      { name: "Error", message: "webgl context lost", code: undefined },
    ]);
  });
});
