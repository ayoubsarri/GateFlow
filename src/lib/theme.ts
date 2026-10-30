import type { ThemeName, ThemeOption } from "../types";

export const THEMES: Record<ThemeName, {
  name: { ar: string; en: string };
  brand: string;
  brandDeep: string;
  brandSoft: string;
  gold: string;
  goldSoft: string;
  line: string;
  surface2: string;
  ink: string;
  ink2: string;
}> = {
  teal: {
    name: { ar: "العقيق الفيروزي (الافتراضي)", en: "GateFlow Teal (Default)" },
    brand: "#074643",
    brandDeep: "#052f32",
    brandSoft: "#d8e8e4",
    gold: "#dfad24",
    goldSoft: "#fff3c7",
    line: "#dce7e3",
    surface2: "#f4f8f6",
    ink: "#0c3033",
    ink2: "#174d4d"
  },
  indigo: {
    name: { ar: "الأرجواني التقني (Indigo)", en: "Midnight Indigo" },
    brand: "#4338ca",
    brandDeep: "#312e81",
    brandSoft: "#e0e7ff",
    gold: "#f59e0b",
    goldSoft: "#fef3c7",
    line: "#c7d2fe",
    surface2: "#f5f3ff",
    ink: "#1e1b4b",
    ink2: "#3730a3"
  },
  sapphire: {
    name: { ar: "الأزرق الملكي (Sapphire)", en: "Royal Sapphire" },
    brand: "#1d4ed8",
    brandDeep: "#1e3a8a",
    brandSoft: "#dbeafe",
    gold: "#eab308",
    goldSoft: "#fef9c3",
    line: "#bfdbfe",
    surface2: "#eff6ff",
    ink: "#0f172a",
    ink2: "#1e293b"
  },
  slate: {
    name: { ar: "الرمادي المعماري (Slate)", en: "Nordic Slate" },
    brand: "#1e293b",
    brandDeep: "#0f172a",
    brandSoft: "#e2e8f0",
    gold: "#0284c7",
    goldSoft: "#e0f2fe",
    line: "#cbd5e1",
    surface2: "#f8fafc",
    ink: "#020617",
    ink2: "#334155"
  },
  crimson: {
    name: { ar: "العنابي الياقوتي (Crimson)", en: "Imperial Crimson" },
    brand: "#881337",
    brandDeep: "#4c0519",
    brandSoft: "#ffe4e6",
    gold: "#d97706",
    goldSoft: "#fef3c7",
    line: "#fecdd3",
    surface2: "#fff1f2",
    ink: "#4c0519",
    ink2: "#9f1239"
  },
  emerald: {
    name: { ar: "الزمرد الفاخر (Emerald)", en: "Prestige Emerald" },
    brand: "#065f46",
    brandDeep: "#064e3b",
    brandSoft: "#d1fae5",
    gold: "#10b981",
    goldSoft: "#ecfdf5",
    line: "#a7f3d0",
    surface2: "#f0fdf4",
    ink: "#022c22",
    ink2: "#047857"
  }
};

const STORAGE_KEY = "gateflow-theme";

export function getAvailableThemes(): ThemeOption[] {
  return (Object.keys(THEMES) as ThemeName[]).map((id) => ({
    id,
    name: THEMES[id].name,
    brand: THEMES[id].brand,
    brandDeep: THEMES[id].brandDeep,
    gold: THEMES[id].gold,
    surface: THEMES[id].surface2
  }));
}

export function getCurrentTheme(): ThemeName {
  if (typeof localStorage !== "undefined" && typeof localStorage.getItem === "function") {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ThemeName | null;
      if (saved && saved in THEMES) return saved;
    } catch {}
  }
  return "teal";
}

export function applyTheme(themeName: ThemeName) {
  const theme = THEMES[themeName] || THEMES.teal;
  if (typeof document === "undefined" || !document.documentElement) return;
  const root = document.documentElement;

  root.style.setProperty("--brand", theme.brand);
  root.style.setProperty("--brand-deep", theme.brandDeep);
  root.style.setProperty("--brand-soft", theme.brandSoft);
  root.style.setProperty("--gold", theme.gold);
  root.style.setProperty("--gold-soft", theme.goldSoft);
  root.style.setProperty("--line", theme.line);
  root.style.setProperty("--surface-2", theme.surface2);
  root.style.setProperty("--ink", theme.ink);
  root.style.setProperty("--ink-2", theme.ink2);

  root.setAttribute("data-theme", themeName);
}

export function setTheme(themeName: ThemeName) {
  if (typeof localStorage !== "undefined" && typeof localStorage.setItem === "function") {
    localStorage.setItem(STORAGE_KEY, themeName);
  }
  applyTheme(themeName);
}

export function initTheme(): ThemeName {
  const current = getCurrentTheme();
  applyTheme(current);
  return current;
}
