import type { EventClient } from "./api";
import type { ScanResult } from "../types";

export interface QueuedScanItem {
  id: string;
  type: "qr" | "manual";
  payload: string; // QR payload or participant ID or manual code
  requestId: string;
  timestamp: string;
  attempts: number;
  lastError?: string;
}

const STORAGE_KEY = "inas-offline-queue";
const DEAD_LETTER_KEY = "inas-offline-dead-letter";
let isFlushing = false;

function safeSetStorage(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.error(`Failed to write to localStorage for key ${key}:`, error);
    return false;
  }
}

export function getOfflineQueue(): QueuedScanItem[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function getDeadLetterQueue(): QueuedScanItem[] {
  try {
    return JSON.parse(localStorage.getItem(DEAD_LETTER_KEY) || "[]");
  } catch {
    return [];
  }
}

function quarantineDeadLetter(item: QueuedScanItem, errorMsg: string) {
  try {
    const deadLetters = getDeadLetterQueue();
    deadLetters.push({ ...item, lastError: errorMsg });
    safeSetStorage(DEAD_LETTER_KEY, JSON.stringify(deadLetters.slice(-100)));
  } catch {
    // Ignore storage issues for dead letters
  }
}

export function enqueueOfflineScan(type: "qr" | "manual", payload: string, requestId: string): QueuedScanItem {
  const queue = getOfflineQueue();
  const existing = queue.find((item) => item.requestId === requestId);
  if (existing) return existing;

  const item: QueuedScanItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    payload,
    requestId,
    timestamp: new Date().toISOString(),
    attempts: 0
  };
  queue.push(item);
  safeSetStorage(STORAGE_KEY, JSON.stringify(queue));
  window.dispatchEvent(new CustomEvent("inas-queue-updated", { detail: queue.length }));
  return item;
}

export function isNetworkFailure(error: unknown): boolean {
  if (!navigator.onLine) return true;
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes("network")
      || msg.includes("offline")
      || msg.includes("unavailable")
      || msg.includes("timeout")
      || msg.includes("failed to fetch")
      || msg.includes("client is offline");
  }
  return false;
}

async function executeQueuedCheckIn(client: EventClient, item: QueuedScanItem): Promise<ScanResult> {
  if (item.type === "qr") {
    return client.checkIn(item.payload, item.requestId);
  }

  let participantId = item.payload;
  // If payload is an 8-character manual short code, resolve to participant ID first
  if (/^[A-Z0-9-]{6,12}$/i.test(participantId)) {
    const matches = await client.lookup(participantId);
    if (matches.length > 0) {
      participantId = matches[0].id;
    }
  }
  return client.manualCheckIn(participantId, item.requestId);
}

export async function flushOfflineQueue(client: EventClient): Promise<{ flushed: number; conflicts: number; remaining: number }> {
  if (isFlushing || !navigator.onLine) {
    return { flushed: 0, conflicts: 0, remaining: getOfflineQueue().length };
  }

  isFlushing = true;
  let flushedCount = 0;
  let conflictCount = 0;

  try {
    while (navigator.onLine) {
      const queue = getOfflineQueue();
      if (queue.length === 0) break;

      const current = queue[0];
      try {
        const result = await executeQueuedCheckIn(client, current);
        if (result.status === "already") {
          conflictCount++;
          window.dispatchEvent(new CustomEvent("inas-offline-conflict", {
            detail: {
              participantId: result.participantId,
              participantName: result.participantName,
              timestamp: current.timestamp,
              stationName: result.stationName
            }
          }));
        }

        flushedCount++;
        // Safely pop current item from freshest queue state
        const updated = getOfflineQueue().filter((item) => item.id !== current.id);
        safeSetStorage(STORAGE_KEY, JSON.stringify(updated));

        // Throttle UI notification so large queues don't cause React re-render thrashing
        if (flushedCount % 3 === 0 || updated.length === 0) {
          window.dispatchEvent(new CustomEvent("inas-queue-updated", { detail: updated.length }));
        }
      } catch (error) {
        if (isNetworkFailure(error)) {
          break; // Stop flushing while network is down
        }

        // Authentication error while offline? Do not discard! Retain until staff re-authenticates.
        const errorMsg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
        if (errorMsg.includes("not-authenticated") || errorMsg.includes("invalid-session") || errorMsg.includes("permission-denied")) {
          break;
        }

        // Genuine permanent error on this specific scan
        const updated = getOfflineQueue();
        const target = updated.find((item) => item.id === current.id);
        if (target) {
          target.attempts = (target.attempts || 0) + 1;
          target.lastError = error instanceof Error ? error.message : String(error);

          if (target.attempts >= 3) {
            quarantineDeadLetter(target, target.lastError);
            const filtered = updated.filter((item) => item.id !== current.id);
            safeSetStorage(STORAGE_KEY, JSON.stringify(filtered));
            window.dispatchEvent(new CustomEvent("inas-queue-updated", { detail: filtered.length }));
          } else {
            safeSetStorage(STORAGE_KEY, JSON.stringify(updated));
          }
        }
        break;
      }
    }
  } finally {
    isFlushing = false;
    // Final UI update guarantee
    window.dispatchEvent(new CustomEvent("inas-queue-updated", { detail: getOfflineQueue().length }));
  }

  return { flushed: flushedCount, conflicts: conflictCount, remaining: getOfflineQueue().length };
}
