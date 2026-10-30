import type { EntranceConfig, EntranceName } from "../types";

const STORAGE_KEY = "inas-entrances";
export const DEFAULT_ENTRANCE_NAMES: string[] = ["A", "B", "C", "D"];

export function defaultEntrances(): EntranceConfig[] {
  return DEFAULT_ENTRANCE_NAMES.map((name) => ({ name, enabled: name === "A" || name === "B" }));
}

export function loadEntrances(): EntranceConfig[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as EntranceConfig[] | null;
    if (saved && Array.isArray(saved) && saved.length > 0) {
      // Clean and validate
      const valid = saved.filter((item) => item && typeof item.name === "string" && item.name.trim().length > 0);
      if (valid.length > 0) {
        if (!valid.some((item) => item.enabled)) valid[0].enabled = true;
        return valid;
      }
    }
    return defaultEntrances();
  } catch {
    return defaultEntrances();
  }
}

export function saveEntrances(config: EntranceConfig[]): EntranceConfig[] {
  // Deduplicate and normalize
  const seen = new Set<string>();
  const normalized: EntranceConfig[] = [];

  for (const item of config) {
    const cleanName = item.name.trim();
    const key = cleanName.toUpperCase();
    if (cleanName && !seen.has(key)) {
      seen.add(key);
      normalized.push({
        name: cleanName,
        enabled: Boolean(item.enabled)
      });
    }
  }

  if (normalized.length === 0) {
    return saveEntrances(defaultEntrances());
  }

  // Ensure at least one enabled
  if (!normalized.some((item) => item.enabled)) {
    normalized[0].enabled = true;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));

  const station = localStorage.getItem("inas-station") as EntranceName | null;
  if (station && !normalized.find((item) => item.name === station)?.enabled) {
    localStorage.setItem("inas-station", normalized.find((item) => item.enabled)?.name || normalized[0].name);
  }

  return normalized;
}

export function addEntrance(current: EntranceConfig[], rawName: string): EntranceConfig[] {
  const cleanName = rawName.trim().toUpperCase().replace(/[^A-Z0-9\-\s]/gi, "");
  if (!cleanName || cleanName.length > 15) return current;

  const exists = current.some((item) => item.name.toUpperCase() === cleanName);
  if (exists) return current;

  const next: EntranceConfig[] = [...current, { name: cleanName, enabled: true }];
  return saveEntrances(next);
}

export function removeEntrance(current: EntranceConfig[], nameToRemove: string): EntranceConfig[] {
  if (current.length <= 1) return current;
  const next = current.filter((item) => item.name !== nameToRemove);
  return saveEntrances(next);
}

export function enabledEntrances(config: EntranceConfig[]): EntranceName[] {
  return config.filter((item) => item.enabled).map((item) => item.name);
}
