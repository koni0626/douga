import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  ApiError,
  apiRequest,
  apiUpload,
  assetContentUrl,
  type AssetDto,
  type AssetListDto,
  type ImageGenerationDto,
  type ImageGenerationListDto,
  type UploadTargetDto,
} from "../../../shared/lib/api";

function kindFor(file: File): AssetDto["kind"] | undefined {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return undefined;
}

export function AssetLibraryPage() {
  const { t } = useTranslation();
  const [assets, setAssets] = useState<AssetListDto>();
  const [uploading, setUploading] = useState(false);
  const [errorKey, setErrorKey] = useState<string>();
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generations, setGenerations] = useState<ImageGenerationListDto>();

  async function load() {
    try {
      const [nextAssets, nextGenerations] = await Promise.all([
        apiRequest<AssetListDto>("/assets"),
        apiRequest<ImageGenerationListDto>("/image-generations"),
      ]);
      setAssets(nextAssets);
      setGenerations(nextGenerations);
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.messageKey : "errors.unknown",
      );
    }
  }

  async function generate(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim()) return;
    setGenerating(true);
    setErrorKey(undefined);
    try {
      await apiRequest<ImageGenerationDto>("/image-generations", {
        method: "POST",
        body: JSON.stringify({
          prompt: prompt.trim(),
          quality: "medium",
          size: "1536x1024",
        }),
      });
      setPrompt("");
      await load();
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.messageKey : "errors.unknown",
      );
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(timer);
  }, []);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const kind = kindFor(file);
    if (!kind) {
      setErrorKey("errors.uploadInvalid");
      return;
    }
    setUploading(true);
    setErrorKey(undefined);
    try {
      const target = await apiRequest<UploadTargetDto>("/assets/uploads", {
        method: "POST",
        body: JSON.stringify({
          name: file.name,
          original_filename: file.name,
          kind,
        }),
      });
      await apiUpload(target.upload_path, file);
      await apiRequest<AssetDto>(`/assets/${target.asset.id}/complete`, {
        method: "POST",
      });
      await load();
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.messageKey : "errors.unknown",
      );
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function remove(assetId: string) {
    await apiRequest<void>(`/assets/${assetId}`, { method: "DELETE" });
    await load();
  }

  const latestGeneration = generations?.items.at(0);

  return (
    <section className="page-card assets-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t("assets.eyebrow")}</p>
          <h1>{t("assets.title")}</h1>
        </div>
        <label className="upload-button">
          <span>{uploading ? t("assets.uploading") : t("assets.upload")}</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,video/*,audio/*"
            disabled={uploading}
            onChange={(event) => void upload(event)}
          />
        </label>
      </div>
      <p>{t("assets.lead")}</p>
      <form
        className="image-generation-form"
        onSubmit={(event) => void generate(event)}
      >
        <label>
          <span>{t("assets.generatePrompt")}</span>
          <textarea
            value={prompt}
            maxLength={4000}
            rows={3}
            placeholder={t("assets.generatePlaceholder")}
            onChange={(event) => setPrompt(event.target.value)}
          />
        </label>
        <button type="submit" disabled={generating || !prompt.trim()}>
          {generating ? t("assets.generating") : t("assets.generate")}
        </button>
      </form>
      {latestGeneration ? (
        <p className="generation-history">
          {t("assets.latestGeneration", {
            status: t(`jobs.${latestGeneration.status}`),
          })}
        </p>
      ) : null}
      {errorKey ? (
        <p role="alert" className="form-error">
          {t(errorKey)}
        </p>
      ) : null}
      {!assets ? (
        <p>{t("loading")}</p>
      ) : assets.items.length === 0 ? (
        <p className="empty-state">{t("assets.empty")}</p>
      ) : (
        <div className="asset-grid">
          {assets.items.map((asset) => (
            <article className="asset-card" key={asset.id}>
              <div className="asset-preview">
                {asset.kind === "image" && asset.status === "ready" ? (
                  <img src={assetContentUrl(asset.id)} alt="" />
                ) : (
                  <span>{t(`assets.kind.${asset.kind}`)}</span>
                )}
              </div>
              <h2>{asset.name}</h2>
              <p>{t(`assets.status.${asset.status}`)}</p>
              {asset.width && asset.height ? (
                <p>
                  {asset.width} × {asset.height}
                </p>
              ) : null}
              <button
                type="button"
                className="danger"
                onClick={() => void remove(asset.id)}
              >
                {t("assets.delete")}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
