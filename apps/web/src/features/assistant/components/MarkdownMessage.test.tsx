import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MarkdownMessage } from "./MarkdownMessage";

afterEach(cleanup);

describe("MarkdownMessage", () => {
  it("renders common assistant markdown", () => {
    render(
      <MarkdownMessage
        content={
          "## Plot\n- **Opening**\n- `ending`\n[Docs](https://example.com)"
        }
      />,
    );

    expect(screen.getByRole("heading", { name: "Plot" })).toBeInTheDocument();
    expect(screen.getByText("Opening").tagName).toBe("STRONG");
    expect(screen.getByText("ending").tagName).toBe("CODE");
    expect(screen.getByRole("link", { name: "Docs" })).toHaveAttribute(
      "href",
      "https://example.com",
    );
  });

  it("does not turn unsafe schemes into links", () => {
    render(<MarkdownMessage content="[bad](javascript:alert(1))" />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("[bad](javascript:alert(1))")).toBeInTheDocument();
  });
});
