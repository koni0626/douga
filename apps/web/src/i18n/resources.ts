import enCommon from "./locales/en/common.json";
import jaCommon from "./locales/ja/common.json";

export const resources = {
  ja: { common: jaCommon },
  en: { common: enCommon },
} as const;

export type SupportedLocale = keyof typeof resources;
