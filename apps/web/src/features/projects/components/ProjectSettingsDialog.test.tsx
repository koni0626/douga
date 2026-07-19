import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { i18n } from "../../../i18n";
import { ProjectSettingsDialog } from "./ProjectSettingsDialog";

describe("ProjectSettingsDialog", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("applies an FPS change to the current project", () => {
    const onApply = vi.fn();
    render(
      <ProjectSettingsDialog fps={30} onApply={onApply} onClose={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText(/FPS for this project/), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(onApply).toHaveBeenCalledWith(10);
  });
});
