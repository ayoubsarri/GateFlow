import { beforeEach, describe, expect, it } from "vitest";
import { getAvailableThemes, getCurrentTheme, setTheme } from "./theme";

describe("Theme Engine", () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    Object.keys(store).forEach((k) => delete store[k]);
    globalThis.localStorage = {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, val: string) => {
        store[key] = String(val);
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        Object.keys(store).forEach((k) => delete store[k]);
      },
      length: 0,
      key: () => null
    } as unknown as Storage;
  });

  it("provides 6 curated palettes with primary brand and gold/accent", () => {
    const themes = getAvailableThemes();
    expect(themes.length).toBe(6);
    expect(themes.map((t) => t.id)).toEqual([
      "teal",
      "indigo",
      "sapphire",
      "slate",
      "crimson",
      "emerald"
    ]);
  });

  it("changes and persists active theme in localStorage", () => {
    setTheme("indigo");
    expect(getCurrentTheme()).toBe("indigo");
    expect(localStorage.getItem("gateflow-theme")).toBe("indigo");

    setTheme("teal");
    expect(getCurrentTheme()).toBe("teal");
  });
});
