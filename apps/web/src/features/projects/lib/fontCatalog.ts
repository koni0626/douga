export type FontCategory = "display" | "gothic" | "mincho" | "system";

export interface FontOption {
  category: FontCategory;
  family: string;
  label: string;
  source: "bundled" | "system";
}

const SYSTEM_FONTS: FontOption[] = [
  {
    category: "system",
    family: "sans-serif",
    label: "Sans Serif",
    source: "system",
  },
  {
    category: "system",
    family: "serif",
    label: "Serif",
    source: "system",
  },
  {
    category: "system",
    family: "monospace",
    label: "Monospace",
    source: "system",
  },
];

export const BUNDLED_FONT_OPTIONS: FontOption[] = [
  {
    category: "gothic",
    family: '"Noto Sans JP", "Yu Gothic", sans-serif',
    label: "Noto Sans JP",
    source: "bundled",
  },
  {
    category: "gothic",
    family: '"M PLUS 1p", sans-serif',
    label: "M PLUS 1p",
    source: "bundled",
  },
  {
    category: "gothic",
    family: '"Zen Kaku Gothic New", sans-serif',
    label: "Zen Kaku Gothic New",
    source: "bundled",
  },
  {
    category: "gothic",
    family: '"Dela Gothic One", sans-serif',
    label: "Dela Gothic One",
    source: "bundled",
  },
  {
    category: "gothic",
    family: '"DotGothic16", sans-serif',
    label: "DotGothic16",
    source: "bundled",
  },
  {
    category: "gothic",
    family: '"RocknRoll One", sans-serif',
    label: "RocknRoll One",
    source: "bundled",
  },
  {
    category: "gothic",
    family: '"Sawarabi Gothic", sans-serif',
    label: "Sawarabi Gothic",
    source: "bundled",
  },
  {
    category: "gothic",
    family: '"Reggae One", sans-serif',
    label: "Reggae One",
    source: "bundled",
  },
  {
    category: "mincho",
    family: '"Noto Serif JP", "Yu Mincho", serif',
    label: "Noto Serif JP",
    source: "bundled",
  },
  {
    category: "mincho",
    family: '"Zen Old Mincho", serif',
    label: "Zen Old Mincho",
    source: "bundled",
  },
  {
    category: "mincho",
    family: '"Shippori Mincho", serif',
    label: "Shippori Mincho",
    source: "bundled",
  },
  {
    category: "mincho",
    family: '"Kaisei Decol", serif',
    label: "Kaisei Decol",
    source: "bundled",
  },
  {
    category: "mincho",
    family: '"Sawarabi Mincho", serif',
    label: "Sawarabi Mincho",
    source: "bundled",
  },
  {
    category: "mincho",
    family: '"Yuji Syuku", serif',
    label: "Yuji Syuku",
    source: "bundled",
  },
  {
    category: "display",
    family: '"M PLUS Rounded 1c", sans-serif',
    label: "M PLUS Rounded 1c",
    source: "bundled",
  },
  {
    category: "display",
    family: '"Zen Maru Gothic", sans-serif',
    label: "Zen Maru Gothic",
    source: "bundled",
  },
  {
    category: "display",
    family: '"Yomogi", cursive',
    label: "Yomogi",
    source: "bundled",
  },
  {
    category: "display",
    family: '"Hachi Maru Pop", cursive',
    label: "Hachi Maru Pop",
    source: "bundled",
  },
  {
    category: "display",
    family: '"Kiwi Maru", serif',
    label: "Kiwi Maru",
    source: "bundled",
  },
  {
    category: "display",
    family: '"Mochiy Pop One", sans-serif',
    label: "Mochiy Pop One",
    source: "bundled",
  },
];

export const FONT_OPTIONS = [...SYSTEM_FONTS, ...BUNDLED_FONT_OPTIONS];

export const FONT_CATEGORIES: FontCategory[] = [
  "system",
  "gothic",
  "mincho",
  "display",
];
