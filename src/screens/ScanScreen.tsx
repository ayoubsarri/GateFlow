import { Check, CircleAlert, Flashlight, LoaderCircle, QrCode, RefreshCw, RotateCcw, ScanLine, Video, VideoOff, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { createRequestId, formatEventTime } from "../lib/domain";
import { copy } from "../lib/i18n";
import { resetScanCooldown, scannerSupportsTorch, startQrScanner, stopQrScanner, toggleScannerTorch } from "../lib/scanner";
import type { EventClient } from "../lib/api";
import type { EventStatus, Language, ScanResult } from "../types";
import { enqueueOfflineScan, flushOfflineQueue, isNetworkFailure } from "../lib/offlineQueue";

let sharedAudioContext: AudioContext | null = null;
function getSharedAudioContext(): AudioContext | null {
  try {
    const AudioContextValue = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextValue) return null;
    if (!sharedAudioContext || sharedAudioContext.state === "closed") {
      sharedAudioContext = new AudioContextValue();
    }
    if (sharedAudioContext.state === "suspended") {
      sharedAudioContext.resume().catch(() => undefined);
    }
    return sharedAudioContext;
  } catch {
    return null;
  }
}

interface ScanScreenProps {
  language: Language;
  status: EventStatus;
  client: EventClient;
  online: boolean;
}

export function ScanScreen({ language, status, client, online }: ScanScreenProps) {
  const t = copy[language];
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [pending, setPending] = useState<{ payload: string; requestId: string } | null>(null);
  const [undoSeconds, setUndoSeconds] = useState(0);
  const [manualCode, setManualCode] = useState("");
  const [conflictNotice, setConflictNotice] = useState<{ name: string; station?: string } | null>(null);

  const wasScanningRef = useRef(false);
  const autoDismissTimerRef = useRef<number | null>(null);

  const clearAutoDismiss = () => {
    if (autoDismissTimerRef.current) {
      window.clearTimeout(autoDismissTimerRef.current);
      autoDismissTimerRef.current = null;
    }
  };

  const stop = useCallback(async () => {
    clearAutoDismiss();
    await stopQrScanner().catch(() => undefined);
    setScanning(false);
    setTorchOn(false);
    wasScanningRef.current = false;
  }, []);

  const dismissResult = useCallback(() => {
    clearAutoDismiss();
    setResult(null);
    resetScanCooldown();
  }, []);

  useEffect(() => () => void stop(), [stop]);

  // Handle visibility changes (phone calls, screen lock) and auto-resume
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (scanning) {
          wasScanningRef.current = true;
          void stop();
        }
      } else if (document.visibilityState === "visible") {
        if (wasScanningRef.current && status === "live" && videoRef.current) {
          wasScanningRef.current = false;
          // Auto-resume camera smoothly
          setScanning(true);
          startQrScanner(videoRef.current, (payload) => void processPayload(payload, createRequestId()))
            .then(async () => setTorchAvailable(await scannerSupportsTorch()))
            .catch(() => {
              setScanning(false);
              setCameraError(true);
            });
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [scanning, status, stop]);

  // Listen for offline queue conflict notifications
  useEffect(() => {
    const handleConflict = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail) {
        setConflictNotice({ name: detail.participantName || "Guest", station: detail.stationName });
      }
    };
    window.addEventListener("inas-offline-conflict", handleConflict);
    return () => window.removeEventListener("inas-offline-conflict", handleConflict);
  }, []);

  const flush = useCallback(async () => {
    if (!navigator.onLine) return;
    await flushOfflineQueue(client).catch(() => undefined);
  }, [client]);

  useEffect(() => {
    if (online && !processing) {
      void flush();
    }
  }, [online, processing, flush]);

  useEffect(() => {
    if (undoSeconds <= 0) return;
    const timer = window.setInterval(() => setUndoSeconds((value) => Math.max(value - 1, 0)), 1000);
    return () => window.clearInterval(timer);
  }, [undoSeconds]);

  const feedback = (success: boolean) => {
    if (navigator.vibrate) navigator.vibrate(success ? [80, 40, 80] : [180]);
    try {
      const context = getSharedAudioContext();
      if (!context) return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = success ? 880 : 220;
      gain.gain.setValueAtTime(0.06, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.12);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.12);
    } catch {
      // Visible and haptic feedback remain available when audio is blocked.
    }
  };

  const processPayload = useCallback(async (payload: string, requestId: string) => {
    clearAutoDismiss();
    setProcessing(true);
    setPending({ payload, requestId });
    setResult(null);

    // CONTINUOUS CAMERA: We DO NOT call stop() here! Sensor stays warm and streaming for next guest.
    if (!navigator.onLine) {
      enqueueOfflineScan("qr", payload, requestId);
      setResult({ status: "offline" });
      setProcessing(false);
      feedback(true);
      autoDismissTimerRef.current = window.setTimeout(dismissResult, 3000);
      return;
    }
    try {
      const response = await client.checkIn(payload, requestId);
      setResult(response);
      setPending(response.status === "offline" ? { payload, requestId } : null);
      if (response.status === "offline") {
        enqueueOfflineScan("qr", payload, requestId);
      }
      feedback(response.status === "success");
      if (response.status === "success") {
        setUndoSeconds(10);
        // Auto-dismiss HUD after 2.6s of success so staff doesn't even need to touch screen
        autoDismissTimerRef.current = window.setTimeout(dismissResult, 2600);
      }
    } catch (error) {
      if (isNetworkFailure(error)) {
        enqueueOfflineScan("qr", payload, requestId);
        setResult({ status: "offline" });
        feedback(true);
        autoDismissTimerRef.current = window.setTimeout(dismissResult, 3000);
      } else {
        setResult({ status: "error", message: error instanceof Error ? error.message : undefined });
        feedback(false);
      }
    } finally {
      setProcessing(false);
    }
  }, [client, dismissResult]);

  const processManualCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    clearAutoDismiss();
    setProcessing(true);
    setResult(null);
    const requestId = createRequestId();
    if (!navigator.onLine) {
      enqueueOfflineScan("manual", code, requestId);
      setResult({ status: "offline" });
      setManualCode("");
      setProcessing(false);
      feedback(true);
      return;
    }
    try {
      const matches = await client.lookup(code);
      const participant = matches[0];
      if (!participant) {
        setResult({ status: "invalid" });
        feedback(false);
        return;
      }
      const response = await client.manualCheckIn(participant.id, requestId);
      setResult(response);
      setManualCode("");
      feedback(response.status === "success");
      if (response.status === "success") {
        setUndoSeconds(10);
        autoDismissTimerRef.current = window.setTimeout(dismissResult, 3000);
      }
    } catch (error) {
      if (isNetworkFailure(error)) {
        enqueueOfflineScan("manual", code, requestId);
        setResult({ status: "offline" });
        setManualCode("");
        feedback(true);
      } else {
        setResult({ status: "error", message: error instanceof Error ? error.message : undefined });
        feedback(false);
      }
    } finally {
      setProcessing(false);
    }
  };

  const start = async () => {
    if (status !== "live") {
      setResult({ status: "closed" });
      return;
    }
    if (!videoRef.current) return;
    // Warm up AudioContext on direct user interaction
    const ctx = getSharedAudioContext();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => undefined);
    }

    setCameraError(false);
    dismissResult();
    try {
      setScanning(true);
      setTorchAvailable(await scannerSupportsTorch());
      await startQrScanner(videoRef.current, (payload) => void processPayload(payload, createRequestId()));
      setTorchAvailable(await scannerSupportsTorch());
    } catch {
      setScanning(false);
      setCameraError(true);
    }
  };

  const undo = async () => {
    if (!result?.checkInId) return;
    clearAutoDismiss();
    setProcessing(true);
    try {
      await client.undoCheckIn(result.checkInId, "Quick scan correction");
      dismissResult();
      setUndoSeconds(0);
    } finally {
      setProcessing(false);
    }
  };

  const ResultIcon = result?.status === "success" ? Check
    : result?.status === "already" || result?.status === "offline" ? RefreshCw
      : result?.status === "invalid" || result?.status === "revoked" ? X
        : CircleAlert;
  const resultTitle = result
    ? result.status === "success" ? t.success
      : result.status === "already" ? t.already
        : result.status === "invalid" ? t.invalid
          : result.status === "revoked" ? t.revoked
            : result.status === "offline" ? t.offline
              : result.status === "closed" ? (status === "draft" ? t.draft : t.closed)
                : t.failed
    : "";

  return (
    <section className="scan-screen">
      {conflictNotice && (
        <div className="inline-warning scan-warning" style={{ background: "#fff3cd", color: "#856404", borderColor: "#ffeeba" }}>
          <CircleAlert size={19} />
          <span>
            {language === "ar"
              ? `تنبيه: تم تسجيل دخول مكرر متزامن لـ (${conflictNotice.name}) في محطة ${conflictNotice.station || "أخرى"}.`
              : `Alert: Duplicate sync check-in detected for (${conflictNotice.name}) at Station ${conflictNotice.station || "other"}.`}
          </span>
          <button style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", fontWeight: "bold" }} onClick={() => setConflictNotice(null)}>×</button>
        </div>
      )}

      <div className={`scanner-card scanner-card--single ${scanning ? "is-scanning" : ""}`}>
        <video ref={videoRef} className="scanner-video" muted playsInline aria-label={t.scan} />
        <div className="scanner-ambient" />

        <div className="scanner-frame" aria-hidden="true" style={{ opacity: result ? 0.35 : 1 }}>
          <i className="corner corner--one" /><i className="corner corner--two" /><i className="corner corner--three" /><i className="corner corner--four" />
          {scanning && !result && <span className="scanner-line" />}
          {!scanning && !result && <div className="scanner-placeholder"><QrCode size={64} /><strong>{t.scan}</strong></div>}
        </div>

        <div className="scanner-controls">
          <button className="camera-button" onClick={scanning ? stop : start} disabled={processing || status !== "live"}>
            {scanning ? <VideoOff size={20} /> : <Video size={20} />}
            <span>{scanning ? t.stopCamera : t.startCamera}</span>
          </button>
          {torchAvailable && scanning && (
            <button className={`round-control ${torchOn ? "active" : ""}`} onClick={async () => { const next = await toggleScannerTorch(); setTorchOn(next); }} aria-label={t.torch}>
              <Flashlight size={20} />
            </button>
          )}
          {client.demo && !scanning && (
            <button className="round-control demo-icon-button" onClick={() => void processPayload("DEMO", createRequestId())} disabled={processing} aria-label={t.demoScan} title={t.demoScan}>
              <ScanLine size={20} />
            </button>
          )}
        </div>

        {!result && (
          <form className="manual-code-panel" onSubmit={(event) => void processManualCode(event)}>
            <input
              dir="ltr"
              value={manualCode}
              onChange={(event) => setManualCode(event.target.value.toUpperCase())}
              placeholder={language === "ar" ? "الرمز اليدوي" : "Manual code"}
              aria-label={language === "ar" ? "الرمز اليدوي" : "Manual code"}
              disabled={processing || status !== "live"}
            />
            <button disabled={processing || status !== "live" || !manualCode.trim()}>{language === "ar" ? "دخول" : "Check"}</button>
          </form>
        )}

        {result && (
          <article className={`scan-result-overlay scan-result--${result.status}`}>
            <div className="scan-result__icon"><ResultIcon size={36} /></div>
            <h1>{resultTitle}</h1>
            {result.participantName && <strong className="participant-name">{result.participantName}</strong>}
            {result.checkedInAt && <span className="result-time">{formatEventTime(result.checkedInAt, language)}</span>}
            <div className="result-actions">
              {result.status === "success" && undoSeconds > 0 && (
                <button className="secondary-button" onClick={undo} disabled={processing}><RotateCcw size={18} />{t.undo} · {undoSeconds}</button>
              )}
              {(result.status === "offline" || result.status === "error") && pending && (
                <button className="primary-button" onClick={() => void processPayload(pending.payload, pending.requestId)} disabled={processing || !online}><RefreshCw size={18} />{t.retry}</button>
              )}
              <button className="camera-button" onClick={dismissResult}><QrCode size={18} />{t.scanAnother}</button>
            </div>
          </article>
        )}

        {processing && <div className="processing-overlay"><LoaderCircle className="spin" size={32} /></div>}
      </div>

      {cameraError && <div className="inline-warning scan-warning"><CircleAlert size={19} /><span>{t.cameraDenied}</span></div>}
    </section>
  );
}
