import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { resources, type SupportedLocale } from "./resources";

const storedLocale = globalThis.localStorage?.getItem("douga.locale");
const initialLocale: SupportedLocale = storedLocale === "en" ? "en" : "ja";

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLocale,
  fallbackLng: "ja",
  supportedLngs: ["ja", "en"],
  defaultNS: "common",
  ns: ["common"],
  interpolation: { escapeValue: false },
});

export async function changeLocale(locale: SupportedLocale): Promise<void> {
  globalThis.localStorage?.setItem("douga.locale", locale);
  await i18n.changeLanguage(locale);
  document.documentElement.lang = locale;
}

export { i18n };
