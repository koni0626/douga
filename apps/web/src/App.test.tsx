import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { App } from "./App";
import { i18n } from "./i18n";

describe("App", () => {
  beforeEach(async () => {
    globalThis.localStorage.clear();
    await i18n.changeLanguage("ja");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: "AUTH_REQUIRED" } }),
      }),
    );
  });

  it("uses Japanese by default and can switch to English", async () => {
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "ログイン" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("言語"), {
      target: { value: "en" },
    });

    expect(
      await screen.findByRole("heading", { name: "Log in" }),
    ).toBeInTheDocument();
    expect(globalThis.localStorage.getItem("douga.locale")).toBe("en");
  });
});
