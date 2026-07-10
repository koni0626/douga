import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { App } from "./App";
import { i18n } from "./i18n";

describe("App", () => {
  beforeEach(async () => {
    globalThis.localStorage.clear();
    await i18n.changeLanguage("ja");
  });

  it("uses Japanese by default and can switch to English", async () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "プレビュー" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("言語"), {
      target: { value: "en" },
    });

    expect(
      await screen.findByRole("heading", { name: "Preview" }),
    ).toBeInTheDocument();
    expect(globalThis.localStorage.getItem("douga.locale")).toBe("en");
  });
});
