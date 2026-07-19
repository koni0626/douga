import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  ApiError,
  apiRequest,
  type AssetDto,
  type SpeechSynthesisDto,
  type SpeechSynthesisSettingsDto,
  type SpeechVoiceListDto,
} from "../../../shared/lib/api";

export interface AivisSpeechPanelProps {
  initialText?: string;
  initialSettings?: SpeechSynthesisSettingsDto;
  onGenerated: (asset: AssetDto, settings: SpeechSynthesisSettingsDto) => void;
  submitLabel?: string;
}

interface ParameterProps {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}

function SpeechParameter({ label, max, min, onChange, value }: ParameterProps) {
  return (
    <label className="speech-parameter">
      <span>
        {label} <output>{value.toFixed(1)}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={0.1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export function AivisSpeechPanel({
  initialText,
  initialSettings,
  onGenerated,
  submitLabel,
}: AivisSpeechPanelProps) {
  const { t } = useTranslation();
  const [voices, setVoices] = useState<SpeechVoiceListDto["items"]>([]);
  const [styleId, setStyleId] = useState<number | undefined>(
    initialSettings?.style_id,
  );
  const [text, setText] = useState(initialSettings?.text ?? initialText ?? "");
  const [speedScale, setSpeedScale] = useState(
    initialSettings?.speed_scale ?? 1,
  );
  const [intonationScale, setIntonationScale] = useState(
    initialSettings?.intonation_scale ?? 1,
  );
  const [tempoDynamicsScale, setTempoDynamicsScale] = useState(
    initialSettings?.tempo_dynamics_scale ?? 1,
  );
  const [volumeScale, setVolumeScale] = useState(
    initialSettings?.volume_scale ?? 1,
  );
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [errorKey, setErrorKey] = useState<string>();

  const options = useMemo(
    () =>
      voices.flatMap((voice) =>
        voice.styles.map((style) => ({
          id: style.id,
          label: `${voice.name} / ${style.name}`,
        })),
      ),
    [voices],
  );

  useEffect(() => {
    let cancelled = false;
    async function loadVoices() {
      setLoadingVoices(true);
      setErrorKey(undefined);
      try {
        const response = await apiRequest<SpeechVoiceListDto>("/speech/voices");
        if (cancelled) return;
        setVoices(response.items);
        const firstStyle = response.items[0]?.styles[0];
        setStyleId((current) => current ?? firstStyle?.id);
      } catch (error) {
        if (!cancelled) setErrorKey(errorMessageKey(error));
      } finally {
        if (!cancelled) setLoadingVoices(false);
      }
    }
    void loadVoices();
    return () => {
      cancelled = true;
    };
  }, []);

  async function generate() {
    if (styleId === undefined || !text.trim() || generating) return;
    setGenerating(true);
    setErrorKey(undefined);
    try {
      const response = await apiRequest<SpeechSynthesisDto>(
        "/speech/syntheses",
        {
          method: "POST",
          body: JSON.stringify({
            text: text.trim(),
            style_id: styleId,
            speed_scale: speedScale,
            intonation_scale: intonationScale,
            tempo_dynamics_scale: tempoDynamicsScale,
            volume_scale: volumeScale,
          }),
        },
      );
      onGenerated(response.asset, {
        provider: "aivis_speech",
        text: text.trim(),
        style_id: styleId,
        speed_scale: speedScale,
        intonation_scale: intonationScale,
        tempo_dynamics_scale: tempoDynamicsScale,
        volume_scale: volumeScale,
      });
    } catch (error) {
      setErrorKey(errorMessageKey(error));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section
      className="speech-generator"
      aria-labelledby="speech-generator-title"
    >
      <div className="speech-generator-heading">
        <div>
          <strong id="speech-generator-title">
            {t("editor.speech.title")}
          </strong>
          <p>{t("editor.speech.lead")}</p>
        </div>
        <span>AivisSpeech</span>
      </div>
      <label>
        <span>{t("editor.speech.voice")}</span>
        <select
          value={styleId ?? ""}
          disabled={loadingVoices || options.length === 0}
          onChange={(event) => setStyleId(Number(event.target.value))}
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{t("editor.speech.text")}</span>
        <textarea
          maxLength={500}
          rows={4}
          value={text}
          placeholder={t("editor.speech.placeholder")}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <div className="speech-parameter-grid">
        <SpeechParameter
          label={t("editor.speech.speed")}
          min={0.5}
          max={2}
          value={speedScale}
          onChange={setSpeedScale}
        />
        <SpeechParameter
          label={t("editor.speech.emotion")}
          min={0}
          max={2}
          value={intonationScale}
          onChange={setIntonationScale}
        />
        <SpeechParameter
          label={t("editor.speech.tempo")}
          min={0}
          max={2}
          value={tempoDynamicsScale}
          onChange={setTempoDynamicsScale}
        />
        <SpeechParameter
          label={t("editor.speech.outputVolume")}
          min={0}
          max={2}
          value={volumeScale}
          onChange={setVolumeScale}
        />
      </div>
      {loadingVoices ? (
        <p className="form-note">{t("editor.speech.loadingVoices")}</p>
      ) : null}
      {!loadingVoices && !errorKey && options.length === 0 ? (
        <p className="form-note">{t("editor.speech.noVoices")}</p>
      ) : null}
      {errorKey ? <p className="form-error">{t(errorKey)}</p> : null}
      <button
        type="button"
        className="primary speech-generate-button"
        disabled={
          generating || loadingVoices || styleId === undefined || !text.trim()
        }
        onClick={() => void generate()}
      >
        {generating
          ? t("editor.speech.generating")
          : (submitLabel ?? t("editor.speech.generate"))}
      </button>
    </section>
  );
}

function errorMessageKey(error: unknown): string {
  return error instanceof ApiError ? error.messageKey : "errors.unknown";
}
