import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { i18n } from "../../../i18n";
import { ProjectListPage } from "./ProjectListPage";

function response(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

describe("ProjectListPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a project from the name and aspect ratio dialog", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return response(
            {
              project: { id: "project-1" },
              document: {},
            },
            201,
          );
        }
        return response({ items: [], total: 0 });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const view = render(
      <MemoryRouter>
        <ProjectListPage />
      </MemoryRouter>,
    );

    expect(
      screen.queryByRole("dialog", { name: "Create a new project" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(
      screen.getByRole("dialog", { name: "Create a new project" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("New project name"), {
      target: { value: "Portrait video" },
    });
    fireEvent.click(screen.getByRole("radio", { name: /9:16/ }));
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([, init]) => init?.method === "POST"),
      ).toBe(true),
    );
    const request = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "POST",
    );
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({
      name: "Portrait video",
      aspect_ratio: "9:16",
    });
    view.unmount();
  });

  it("opens export settings and sends a one-time FPS override", async () => {
    const project = {
      id: "project-1",
      name: "Existing project",
      status: "editing",
      content_locale: "ja",
      current_revision_number: 3,
      lock_version: 2,
      scene_count: 1,
      estimated_duration_ms: 10_000,
      thumbnail_asset_id: null,
      updated_at: "2026-07-19T00:00:00Z",
    };
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/projects/project-1")) {
          return response({
            project,
            document: {
              video: {
                width: 1920,
                height: 1080,
                fps: 30,
                duration_ms: 10_000,
              },
            },
          });
        }
        if (url.endsWith("/exports") && init?.method === "POST") {
          return response({ id: "export-1" }, 202);
        }
        return response({ items: [project], total: 1 });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const view = render(
      <MemoryRouter>
        <ProjectListPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Export MP4" }));
    expect(
      await screen.findByRole("dialog", { name: "MP4 export settings" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("FPS"), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start export" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            String(input).endsWith("/exports") && init?.method === "POST",
        ),
      ).toBe(true),
    );
    const exportRequest = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith("/exports") && init?.method === "POST",
    );
    expect(JSON.parse(String(exportRequest?.[1]?.body))).toEqual({
      project_id: "project-1",
      filename: "Existing project.mp4",
      width: 1920,
      height: 1080,
      fps: 10,
    });
    view.unmount();
  });

  it("renames a project from its card", async () => {
    const project = {
      id: "project-1",
      name: "Original title",
      status: "editing",
      content_locale: "ja",
      current_revision_number: 3,
      lock_version: 2,
      scene_count: 1,
      estimated_duration_ms: 10_000,
      thumbnail_asset_id: null,
      updated_at: "2026-07-19T00:00:00Z",
    };
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (
          String(input).endsWith("/projects/project-1") &&
          init?.method === "PATCH"
        ) {
          return response({ ...project, name: "Updated title" });
        }
        return response({ items: [project], total: 1 });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const view = render(
      <MemoryRouter>
        <ProjectListPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Edit title" }));
    fireEvent.change(screen.getByLabelText("Project title"), {
      target: { value: "Updated title" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            String(input).endsWith("/projects/project-1") &&
            init?.method === "PATCH",
        ),
      ).toBe(true),
    );
    const request = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith("/projects/project-1") &&
        init?.method === "PATCH",
    );
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({
      name: "Updated title",
    });
    expect(await screen.findByText("Updated title")).toBeInTheDocument();
    view.unmount();
  });
});
