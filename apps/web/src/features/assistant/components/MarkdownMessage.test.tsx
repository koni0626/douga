import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarkdownMessage } from "./MarkdownMessage";

describe("MarkdownMessage", () => {
  it("renders a GitHub-style Markdown table", () => {
    render(
      <MarkdownMessage
        content={[
          "| Variety | Feature | Example |",
          "| :--- | :--- | ---: |",
          "| **Sweet** | Crisp and fragrant | Apple |",
          "| Tart | Refreshing | Lemon |",
        ].join("\n")}
      />,
    );

    const table = screen.getByRole("table");
    expect(
      within(table).getByRole("columnheader", { name: "Variety" }),
    ).toHaveStyle({ textAlign: "left" });
    expect(
      within(table).getByRole("columnheader", { name: "Example" }),
    ).toHaveStyle({ textAlign: "right" });
    expect(within(table).getByText("Sweet").tagName).toBe("STRONG");
    expect(within(table).getByText("Lemon")).toBeInTheDocument();
  });
});
