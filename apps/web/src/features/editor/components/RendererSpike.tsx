import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { SceneRenderer } from "@douga/scene-renderer";
import { buildSceneTimeline } from "@douga/scene-renderer";
import type { ProjectDocument } from "@douga/project-schema";

import { changeLocale } from "../../../i18n";
import { sampleProject } from "../../../sample-project";

declare global {
  interface Window {
    __DOUGA_SET_RENDER_TIME__?: (timeMs: number) => void;
    __DOUGA_SET_RENDER_SCENE__?: (sceneIndex: number) => void;
    __DOUGA_RENDER_PROJECT__?: ProjectDocument;
    __DOUGA_RENDER_ASSETS__?: Record<string, string>;
    __DOUGA_RENDER_INFO__?: { sceneDurationsMs: number[] };
  }
}

export function RendererSpike({ renderMode }: { renderMode: boolean }) {
  const { t, i18n } = useTranslation();
  const [timeMs, setTimeMs] = useState(0);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const previousFrame = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.__DOUGA_SET_RENDER_TIME__ = setTimeMs;
    window.__DOUGA_SET_RENDER_SCENE__ = setSceneIndex;
    return () => {
      delete window.__DOUGA_SET_RENDER_TIME__;
      delete window.__DOUGA_SET_RENDER_SCENE__;
    };
  }, []);

  const project = window.__DOUGA_RENDER_PROJECT__ ?? sampleProject;
  const assetMap = window.__DOUGA_RENDER_ASSETS__ ?? {};
  window.__DOUGA_RENDER_INFO__ = {
    sceneDurationsMs: project.scenes.map((scene) => {
      const timeline = buildSceneTimeline(
        scene,
        project.caption_style,
        project.content_locale,
      );
      return Math.max(1000, timeline.at(-1)?.endMs ?? 0);
    }),
  };

  useEffect(() => {
    if (!playing) {
      previousFrame.current = undefined;
      return;
    }
    let animationFrame = 0;
    const tick = (timestamp: number) => {
      const previous = previousFrame.current ?? timestamp;
      setTimeMs((current) => current + (timestamp - previous));
      previousFrame.current = timestamp;
      animationFrame = requestAnimationFrame(tick);
    };
    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [playing]);

  return (
    <main className={renderMode ? "app app--render" : "app"}>
      {!renderMode ? (
        <header className="toolbar">
          <div>
            <p className="eyebrow">{t("appName")}</p>
            <h1>{t("preview")}</h1>
          </div>
          <div className="toolbar__actions">
            <label>
              <span>{t("language")}</span>
              <select
                aria-label={t("language")}
                value={i18n.language.startsWith("en") ? "en" : "ja"}
                onChange={(event) =>
                  void changeLocale(event.target.value === "en" ? "en" : "ja")
                }
              >
                <option value="ja">{t("japanese")}</option>
                <option value="en">{t("english")}</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => setPlaying((current) => !current)}
            >
              {playing ? t("pause") : t("play")}
            </button>
            <button type="button" onClick={() => setTimeMs(0)}>
              {t("reset")}
            </button>
          </div>
        </header>
      ) : null}
      <section className="canvas-shell">
        <SceneRenderer
          project={project}
          sceneIndex={sceneIndex}
          timeMs={timeMs}
          assetUrl={(assetId) => assetMap[assetId]}
        />
      </section>
      {!renderMode ? (
        <p className="time-readout">
          {t("currentTime", { seconds: (timeMs / 1000).toFixed(2) })}
        </p>
      ) : null}
    </main>
  );
}
