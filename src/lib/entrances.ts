import type { EntranceConfig, EntranceName } from "../types";

const STORAGE_KEY = "inas-entrances";
export const ENTRANCE_NAMES: EntranceName[] = ["A", "B", "C", "D"];

export function defaultEntrances(): EntranceConfig[] {
  return ENTRANCE_NAMES.map((name) => ({ name, enabled: name === "A" || name === "B" }));
}

export function loadEntrances(): EntranceConfig[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as EntranceConfig[] | null;
    if (!saved) return defaultEntrances();
    return ENTRANCE_NAMES.map((name) => ({
      name,
      enabled: Boolean(saved.find((item) => item.name === name)?.enabled)
    }));
  } catch {
    return defaultEntrances();
  }
}

export function saveEntrances(config: EntranceConfig[]): EntranceConfig[] {
  const normalized = ENTRANCE_NAMES.map((name) => ({
    name,
    enabled: Boolean(config.find((item) => item.name === name)?.enabled)
  }));
  if (!normalized.some((item) => item.enabled)) normalized[0].enabled = true;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  const station = localStorage.getItem("inas-station") as EntranceName | null;
  if (station && !normalized.find((item) => item.name === station)?.enabled) {
    localStorage.setItem("inas-station", normalized.find((item) => item.enabled)?.name || "A");
  }
  return normalized;
}

export function enabledEntrances(config: EntranceConfig[]): EntranceName[] {
  return config.filter((item) => item.enabled).map((item) => item.name);
}
