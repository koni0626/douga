import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { i18n } from "../../../i18n";
import { SettingsPage } from "./SettingsPage";

const settings = {
  preferred_locale: "ja",
  default_content_locale: "ja",
  default_video_width: 1920,
  default_video_height: 1080,
  default_video_fps: "30",
  default_caption_settings: {},
};

function response(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

describe("SettingsPage API tokens", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("ja");
  });

  it("issues a token, shows the secret once, and refreshes the list", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (
          url.endsWith("/settings") &&
          (!init?.method || init.method === "GET")
        ) {
          return response(settings);
        }
        if (url.endsWith("/settings/api-tokens") && init?.method === "POST") {
          return response(
            {
              id: "token-1",
              name: "NovelCreator Codex",
              token: "dga_pat_secret",
              token_prefix: "dga_pat_sec",
              scopes: ["projects:read"],
              last_used_at: null,
              expires_at: null,
              revoked_at: null,
              created_at: "2026-07-12T00:00:00Z",
            },
            201,
          );
        }
        if (url.endsWith("/settings/api-tokens")) {
          const issued = fetchMock.mock.calls.some(
            ([called, options]) =>
              String(called).endsWith("/settings/api-tokens") &&
              options?.method === "POST",
          );
          return response({
            items: issued
              ? [
                  {
                    id: "token-1",
                    name: "NovelCreator Codex",
                    token_prefix: "dga_pat_sec",
                    scopes: ["projects:read"],
                    last_used_at: null,
                    expires_at: null,
                    revoked_at: null,
                    created_at: "2026-07-12T00:00:00Z",
                  },
                ]
              : [],
          });
        }
        return response({}, 404);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<SettingsPage />);
    expect(await screen.findByText("外部APIトークン")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "APIトークンを発行" }));

    expect(
      await screen.findByDisplayValue("dga_pat_secret"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("dga_pat_sec…")).toBeInTheDocument(),
    );
  });
});
