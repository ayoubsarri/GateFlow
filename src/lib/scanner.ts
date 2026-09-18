import { setZXingModuleOverrides } from "barcode-detector";
import "barcode-detector/polyfill";
import {
  BarcodeFormat,
  BarcodeScanner,
  LensFacing,
  Resolution
} from "@capacitor-mlkit/barcode-scanning";
import type { PluginListenerHandle } from "@capacitor/core";

// Force ZXing WASM polyfill to load from local origin instead of external fastly.jsdelivr.net CDN
setZXingModuleOverrides({
  locateFile: (path: string) => `/${path}`
});

let listener: PluginListenerHandle | null = null;
let wakeLockSentinel: { release(): Promise<void> } | null = null;
let activeVideoElement: HTMLVideoElement | null = null;
let currentTorchState = false;

const recentScans = new Map<string, number>();

export function isPayloadInCooldown(payload: string, cooldownMs = 3500): boolean {
  const now = Date.now();
  const last = recentScans.get(payload);
  if (last && now - last < cooldownMs) {
    return true;
  }
  recentScans.set(payload, now);
  for (const [key, timestamp] of recentScans.entries()) {
    if (now - timestamp > 15000) recentScans.delete(key);
  }
  return false;
}

export function resetScanCooldown(payload?: string) {
  if (payload) {
    recentScans.delete(payload);
  } else {
    recentScans.clear();
  }
}

async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator && (navigator as unknown as { wakeLock: { request(type: string): Promise<{ release(): Promise<void> }> } }).wakeLock) {
      wakeLockSentinel = await (navigator as unknown as { wakeLock: { request(type: string): Promise<{ release(): Promise<void> }> } }).wakeLock.request("screen");
    }
  } catch {
    // WakeLock is progressive enhancement
  }
}

async function releaseWakeLock() {
  try {
    if (wakeLockSentinel) {
      await wakeLockSentinel.release();
      wakeLockSentinel = null;
    }
  } catch {
    // ignore
  }
}

function getActiveVideoTrack(): MediaStreamTrack | null {
  if (!activeVideoElement) return null;
  const stream = activeVideoElement.srcObject as MediaStream | null;
  if (!stream) return null;
  return stream.getVideoTracks()[0] || null;
}

export async function startQrScanner(videoElement: HTMLVideoElement, onValue: (value: string) => void) {
  const existingPermission = await BarcodeScanner.checkPermissions();
  const permission = existingPermission.camera === "granted"
    ? existingPermission
    : await BarcodeScanner.requestPermissions();
  if (permission.camera !== "granted") throw new Error("camera-permission-denied");

  activeVideoElement = videoElement;
  currentTorchState = false;
  document.body.classList.add("scanner-active");
  await requestWakeLock();

  listener = await BarcodeScanner.addListener("barcodesScanned", (event) => {
    const value = event.barcodes.find((barcode) => barcode.rawValue)?.rawValue;
    if (value && !isPayloadInCooldown(value)) {
      onValue(value);
    }
  });

  await BarcodeScanner.startScan({
    formats: [BarcodeFormat.QrCode],
    lensFacing: LensFacing.Back,
    videoElement,
    resolution: Resolution["1280x720"]
  });
}

export async function stopQrScanner() {
  try {
    if (currentTorchState) {
      await toggleScannerTorch(false).catch(() => undefined);
    }
    await BarcodeScanner.stopScan();
  } finally {
    await listener?.remove();
    listener = null;
    activeVideoElement = null;
    currentTorchState = false;
    await releaseWakeLock();
    document.body.classList.remove("scanner-active");
  }
}

export async function toggleScannerTorch(enable?: boolean): Promise<boolean> {
  const track = getActiveVideoTrack();
  if (track) {
    try {
      const capabilities = (track.getCapabilities?.() || {}) as { torch?: boolean };
      if (capabilities.torch) {
        const next = enable !== undefined ? enable : !currentTorchState;
        await track.applyConstraints({
          advanced: [{ torch: next } as unknown as MediaTrackConstraintSet]
        });
        currentTorchState = next;
        return currentTorchState;
      }
    } catch {
      // Fall back to BarcodeScanner plugin
    }
  }

  try {
    await BarcodeScanner.toggleTorch();
    currentTorchState = !currentTorchState;
    return currentTorchState;
  } catch {
    return false;
  }
}

export async function scannerSupportsTorch(): Promise<boolean> {
  const track = getActiveVideoTrack();
  if (track) {
    try {
      const capabilities = (track.getCapabilities?.() || {}) as { torch?: boolean };
      if (capabilities.torch) return true;
    } catch {
      // ignore
    }
  }
  try {
    return (await BarcodeScanner.isTorchAvailable()).available;
  } catch {
    return false;
  }
}
