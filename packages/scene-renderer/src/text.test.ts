import { describe, expect, it } from "vitest";

import type { TextLayer } from "./text";
import { visibleTextAtTime } from "./text";

function textLayer(patch: Partial<TextLayer> = {}): TextLayer {
  return {
    id: "text-1",
    type: "text",
    text: "縦書きテキスト",
    font_size: 64,
    color: "#ffffff",
    x: 0,
    y: 0,
    width: 400,
    height: 400,
    rotation: 0,
    opacity: 1,
    start_ms: 1000,
    ...patch,
  };
}

describe("visibleTextAtTime", () => {
  it("returns all text for the default instant effect", () => {
    expect(visibleTextAtTime(textLayer(), 1000)).toBe("縦書きテキスト");
  });

  it("reveals text from the layer start time at the configured speed", () => {
    const layer = textLayer({
      text: "あいうえお",
      display_effect: "typewriter",
      characters_per_second: 2,
    });

    expect(visibleTextAtTime(layer, 1499)).toBe("");
    expect(visibleTextAtTime(layer, 2000)).toBe("あい");
    expect(visibleTextAtTime(layer, 4000)).toBe("あいうえお");
  });
});
