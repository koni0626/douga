import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { i18n } from "../../../i18n";
import type { AssetDto } from "../../../shared/lib/api";
import { AivisSpeechPanel } from "./AivisSpeechPanel";

function response(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

const generatedAsset: AssetDto = {
  id: "audio-1",
  kind: "audio",
  source: "generated",
  status: "ready",
  name: "こんにちは",
  original_filename: "audio-1.wav",
  mime_type: "audio/wav",
  size_bytes: 1024,
  width: null,
  height: null,
  duration_ms: 1200,
  tags: [],
};

describe("AivisSpeechPanel", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("ja");
  });

  it("generates speech with the selected style and returns the audio asset", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/speech/voices")) {
          return response({
            items: [
              {
                speaker_uuid: "voice-1",
                name: "ナレーター",
                styles: [{ id: 42, name: "ノーマル" }],
              },
            ],
          });
        }
        if (url.endsWith("/speech/syntheses") && init?.method === "POST") {
          return response({ asset: generatedAsset }, 201);
        }
        return response({}, 404);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const onGenerated = vi.fn();

    const view = render(<AivisSpeechPanel onGenerated={onGenerated} />);
    expect(
      await screen.findByText("ナレーター / ノーマル"),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("読み上げる文章"), {
      target: { value: "こんにちは" },
    });
    fireEvent.click(screen.getByRole("button", { name: "音声を生成して追加" }));

    await waitFor(() =>
      expect(onGenerated).toHaveBeenCalledWith(generatedAsset, {
        provider: "aivis_speech",
        text: generatedAsset.name,
        style_id: 42,
        speed_scale: 1,
        intonation_scale: 1,
        tempo_dynamics_scale: 1,
        volume_scale: 1,
      }),
    );
    const request = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/speech/syntheses"),
    );
    expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({
      text: "こんにちは",
      style_id: 42,
      speed_scale: 1,
      intonation_scale: 1,
    });
    view.unmount();
  });

  it("prefills the text and speaker settings when editing generated speech", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response({
          items: [
            {
              speaker_uuid: "voice-1",
              name: "Narrator",
              styles: [{ id: 42, name: "Normal" }],
            },
          ],
        }),
      ),
    );
    const view = render(
      <AivisSpeechPanel
        initialSettings={{
          provider: "aivis_speech",
          text: "Original narration",
          style_id: 42,
          speed_scale: 1.2,
          intonation_scale: 0.8,
          tempo_dynamics_scale: 1.1,
          volume_scale: 0.9,
        }}
        onGenerated={vi.fn()}
      />,
    );

    await screen.findByText("Narrator / Normal");
    expect(view.container.querySelector("textarea")).toHaveValue(
      "Original narration",
    );
    expect(screen.getByRole("combobox")).toHaveValue("42");
    view.unmount();
  });
});
