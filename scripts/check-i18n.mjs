import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const localeRoot = path.join(root, "apps", "web", "src", "i18n", "locales");

function flattenKeys(value, prefix = "") {
  return Object.entries(value).flatMap(([key, child]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    return typeof child === "object" && child !== null
      ? flattenKeys(child, fullKey)
      : [fullKey];
  });
}

async function load(locale) {
  const content = await readFile(
    path.join(localeRoot, locale, "common.json"),
    "utf8",
  );
  return new Set(flattenKeys(JSON.parse(content)));
}

const [japanese, english] = await Promise.all([load("ja"), load("en")]);
const onlyJapanese = [...japanese].filter((key) => !english.has(key));
const onlyEnglish = [...english].filter((key) => !japanese.has(key));

if (onlyJapanese.length || onlyEnglish.length) {
  throw new Error(
    `Translation key mismatch. Missing in en: ${onlyJapanese.join(", ") || "none"}; missing in ja: ${onlyEnglish.join(", ") || "none"}`,
  );
}

process.stdout.write(`i18n keys match (${japanese.size} keys).\n`);
