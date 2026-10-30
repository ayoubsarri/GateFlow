import { Check, CircleAlert, Flashlight, LoaderCircle, QrCode, Radio, RefreshCw, RotateCcw, ScanLine, Video, VideoOff, X, Zap, ShieldCheck, MapPin } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { MeshPairingModal } from "../components/MeshPairingModal";
import { createRequestId, formatEventTime } from "../lib/domain";
import { copy } from "../lib/i18n";
import { enqueueOfflineScan, flushOfflineQueue, isNetworkFailure } from "../lib/offlineQueue";
import { p2pMesh } from "../lib/p2pMesh";
import { resetScanCooldown, scannerSupportsTorch, startQrScanner, stopQrScanner, toggleScannerTorch } from "../lib/scanner";
import type { EventClient } from "../lib/api";
import type { EventStatus, Language, ScanResult, ScanStatus } from "../types";

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
  const isAr = language === "ar";
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

  // Station info
  const currentStation = localStorage.getItem("inas-station") || "A";

  // Speed-Gate & Continuous Burst Mode State
  const [speedGate, setSpeedGate] = useState<boolean>(() => {
    return localStorage.getItem("inas-speed-gate") !== "false";
  });
  const [burstCount, setBurstCount] = useState<number>(0);
  const [burstStartTime, setBurstStartTime] = useState<number>(() => Date.now());

  // P2P Mesh State
  const [peerCount, setPeerCount] = useState<number>(0);
  const [showMeshModal, setShowMeshModal] = useState<boolean>(false);

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

  // Subscribe to P2P Mesh peer count
  useEffect(() => {
    const unsubPeers = p2pMesh.onPeerCountChange(setPeerCount);
    const unsubMesh = p2pMesh.subscribe((event) => {
      console.log(`[GateFlow Mesh] Inbound check-in received from Station ${event.stationName}:`, event.participantName);
    });
    return () => {
      unsubPeers();
      unsubMesh();
    };
  }, []);

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

  // High-fidelity Multi-Tone Audio Chimes
  const playChime = (scanStatus: ScanStatus) => {
    if (navigator.vibrate) {
      navigator.vibrate(scanStatus === "success" ? [70, 30, 70] : scanStatus === "already" ? [120, 40] : [200]);
    }
    try {
      const context = getSharedAudioContext();
      if (!context) return;
      const now = context.currentTime;

      if (scanStatus === "success") {
        // High pleasant dual chime (880Hz -> 1318.5Hz)
        const osc1 = context.createOscillator();
        const gain1 = context.createGain();
        osc1.frequency.value = 880;
        gain1.gain.setValueAtTime(0.08, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc1.connect(gain1).connect(context.destination);
        osc1.start(now);
        osc1.stop(now + 0.08);

        const osc2 = context.createOscillator();
        const gain2 = context.createGain();
        osc2.frequency.value = 1318.51;
        gain2.gain.setValueAtTime(0.08, now + 0.08);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc2.connect(gain2).connect(context.destination);
        osc2.start(now + 0.08);
        osc2.stop(now + 0.22);
      } else if (scanStatus === "already") {
        // Warning dual buzz (440Hz -> 330Hz)
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(330, now + 0.09);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        osc.connect(gain).connect(context.destination);
        osc.start(now);
        osc.stop(now + 0.24);
      } else {
        // Low error buzz (220Hz)
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.type = "sawtooth";
        osc.frequency.value = 220;
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.connect(gain).connect(context.destination);
        osc.start(now);
        osc.stop(now + 0.22);
      }
    } catch {
      // Audio blocked
    }
  };

  const toggleSpeedGate = () => {
    setSpeedGate((prev) => {
      const next = !prev;
      localStorage.setItem("inas-speed-gate", String(next));
      return next;
    });
  };

  const resetBurstSession = () => {
    setBurstCount(0);
    setBurstStartTime(Date.now());
  };

  const burstMinutes = Math.max((Date.now() - burstStartTime) / 60000, 0.1);
  const burstVelocity = Math.round(burstCount / burstMinutes);

  const processPayload = useCallback(async (payload: string, requestId: string) => {
    clearAutoDismiss();
    setProcessing(true);
    setPending({ payload, requestId });
    setResult(null);

    // 1. Check Local P2P Mesh Invariant Cache
    const meshMatch = p2pMesh.queryMeshCheckIn(payload);
    if (meshMatch) {
      const res: ScanResult = {
        status: "already",
        participantName: meshMatch.participantName,
        stationName: meshMatch.stationName,
        checkedInAt: meshMatch.timestamp,
        message: isAr
          ? `مسجل مسبقاً في المدخل ${meshMatch.stationName} (عبر شبكة P2P)`
          : `Checked in at Station ${meshMatch.stationName} (via P2P Mesh)`
      };
      setResult(res);
      playChime("already");
      setProcessing(false);
      autoDismissTimerRef.current = window.setTimeout(dismissResult, speedGate ? 1400 : 2800);
      return;
    }

    // 2. Offline Fallback
    if (!navigator.onLine) {
      enqueueOfflineScan("qr", payload, requestId);
      p2pMesh.broadcastCheckIn({
        payload,
        requestId,
        stationName: localStorage.getItem("inas-station") || "A"
      });
      setResult({ status: "offline" });
      playChime("success");
      setProcessing(false);
      autoDismissTimerRef.current = window.setTimeout(dismissResult, speedGate ? 1400 : 2500);
      return;
    }

    // 3. Online Client Processing
    try {
      const response = await client.checkIn(payload, requestId);
      setResult(response);
      if (response.status === "success") {
        setBurstCount((c) => c + 1);
        setUndoSeconds(10);
        p2pMesh.broadcastCheckIn({
          payload,
          requestId,
          participantId: response.checkInId,
          participantName: response.participantName,
          stationName: response.stationName || "A"
        });
      }
      playChime(response.status);
      autoDismissTimerRef.current = window.setTimeout(dismissResult, speedGate ? 1400 : 3000);
    } catch (error) {
      if (isNetworkFailure(error)) {
        enqueueOfflineScan("qr", payload, requestId);
        setResult({ status: "offline" });
        playChime("success");
      } else {
        setResult({ status: "error", message: error instanceof Error ? error.message : undefined });
        playChime("error");
      }
    } finally {
      setProcessing(false);
    }
  }, [client, dismissResult, isAr, speedGate]);

  const processManualCode = async (eventValue: FormEvent) => {
    eventValue.preventDefault();
    const code = manualCode.trim().toUpperCase();
    if (!code) return;

    clearAutoDismiss();
    setProcessing(true);
    setResult(null);
    const requestId = createRequestId();
    setPending({ payload: code, requestId });

    try {
      const matches = await client.lookup(code);
      const participant = matches[0];
      if (!participant) {
        setResult({ status: "invalid" });
        playChime("invalid");
        return;
      }
      const response = await client.manualCheckIn(participant.id, requestId);
      setResult(response);
      setManualCode("");
      if (response.status === "success") {
        setBurstCount((c) => c + 1);
        setUndoSeconds(10);
        p2pMesh.broadcastCheckIn({
          payload: code,
          requestId,
          participantId: participant.id,
          participantName: participant.name,
          stationName: response.stationName || "A"
        });
      }
      playChime(response.status);
      autoDismissTimerRef.current = window.setTimeout(dismissResult, speedGate ? 1400 : 3000);
    } catch (error) {
      if (isNetworkFailure(error)) {
        enqueueOfflineScan("manual", code, requestId);
        setResult({ status: "offline" });
        setManualCode("");
        playChime("success");
      } else {
        setResult({ status: "error", message: error instanceof Error ? error.message : undefined });
        playChime("error");
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

  const ResultIcon =
    result?.status === "success"
      ? Check
      : result?.status === "already" || result?.status === "offline"
      ? RefreshCw
      : result?.status === "invalid" || result?.status === "revoked"
      ? X
      : CircleAlert;

  const resultTitle = result
    ? result.status === "success"
      ? t.success
      : result.status === "already"
      ? t.already
      : result.status === "invalid"
      ? t.invalid
      : result.status === "revoked"
      ? t.revoked
      : result.status === "offline"
      ? t.offline
      : result.status === "closed"
      ? status === "draft"
        ? t.draft
        : t.closed
      : t.failed
    : "";

  return (
    <section className="scan-screen-v2">
      {/* Top Operations & Gate Context Strip */}
      <div className="gate-ops-bar">
        {/* Current Gate Badge */}
        <div className="gate-ident-chip">
          <MapPin size={15} />
          <strong>{isAr ? `المدخل ${currentStation}` : `Gate ${currentStation}`}</strong>
        </div>

        {/* Speed-Gate Burst Mode Toggle */}
        <button
          className={`speed-gate-toggle-v2 ${speedGate ? "active" : ""}`}
          onClick={toggleSpeedGate}
          title={isAr ? "وضع السرعة الفائقة للمسح المتتالي" : "Toggle Continuous Burst Speed Mode"}
        >
          <Zap size={15} />
          <span>{isAr ? "وضع السرعة" : "Speed"}</span>
          <b className="mode-tag">{speedGate ? (isAr ? "مفعّل" : "ON") : (isAr ? "متوقف" : "OFF")}</b>
        </button>

        {speedGate && burstCount > 0 && (
          <div className="burst-badge-v2" title="Burst Throughput">
            <span>{burstCount} {isAr ? "دخول" : "scans"}</span>
            <small>· {burstVelocity}/m</small>
            <button className="burst-reset-icon" onClick={resetBurstSession} title="Reset Counter">
              <RotateCcw size={11} />
            </button>
          </div>
        )}

        {/* P2P Mesh Gate Sync Indicator */}
        <button
          className={`p2p-mesh-pill ${peerCount > 0 ? "connected" : ""}`}
          onClick={() => setShowMeshModal(true)}
          title={isAr ? "حالة الربط بين المداخل عند انقطاع الإنترنت" : "P2P Gate Mesh Sync Status"}
        >
          <Radio size={14} />
          <span>{peerCount > 0 ? `${peerCount} ${isAr ? "مداخل" : "Gates"}` : (isAr ? "P2P شبكة" : "Mesh")}</span>
        </button>
      </div>

      {conflictNotice && (
        <div className="inline-warning scan-warning">
          <CircleAlert size={18} />
          <span>
            {language === "ar"
              ? `تنبيه: تم تسجيل دخول مكرر متزامن لـ (${conflictNotice.name}) في محطة ${conflictNotice.station || "أخرى"}.`
              : `Alert: Duplicate sync check-in detected for (${conflictNotice.name}) at Station ${conflictNotice.station || "other"}.`}
          </span>
          <button onClick={() => setConflictNotice(null)}>×</button>
        </div>
      )}

      {/* Main Viewfinder Card */}
      <div className={`camera-viewfinder-card ${scanning ? "is-scanning" : ""} ${result ? `flash-${result.status}` : ""}`}>
        <video ref={videoRef} className="camera-feed-video" muted playsInline aria-label={t.scan} />
        <div className="camera-feed-ambient" />

        {/* Reticle / Laser sweep */}
        <div className="viewfinder-reticle" aria-hidden="true" style={{ opacity: result ? 0.25 : 1 }}>
          <span className="reticle-corner corner-tl" />
          <span className="reticle-corner corner-tr" />
          <span className="reticle-corner corner-bl" />
          <span className="reticle-corner corner-br" />
          {scanning && !result && <span className="laser-sweep-line" />}
          {!scanning && !result && (
            <div className="viewfinder-idle-state">
              <div className="viewfinder-qr-icon">
                <QrCode size={56} />
              </div>
              <strong>{isAr ? "الكاميرا جاهزة للمسح" : "Camera Ready to Scan"}</strong>
              <small>{isAr ? "اضغط على زر تشغيل الكاميرا للبدء" : "Tap Start Camera to begin scanning badges"}</small>
            </div>
          )}
        </div>

        {/* Floating Controls Bar over camera */}
        <div className="viewfinder-floating-actions">
          <button
            className={`action-btn-camera ${scanning ? "is-active" : ""}`}
            onClick={scanning ? stop : start}
            disabled={processing || status !== "live"}
          >
            {scanning ? <VideoOff size={18} /> : <Video size={18} />}
            <span>{scanning ? t.stopCamera : t.startCamera}</span>
          </button>

          {torchAvailable && scanning && (
            <button
              className={`action-btn-torch ${torchOn ? "is-on" : ""}`}
              onClick={async () => {
                const next = await toggleScannerTorch();
                setTorchOn(next);
              }}
              aria-label={t.torch}
              title={t.torch}
            >
              <Flashlight size={18} />
            </button>
          )}

          {client.demo && !scanning && (
            <button
              className="action-btn-demo"
              onClick={() => void processPayload("DEMO", createRequestId())}
              disabled={processing}
              title={t.demoScan}
            >
              <ScanLine size={18} />
              <span>{t.demoScan}</span>
            </button>
          )}
        </div>

        {/* Processing Spinner */}
        {processing && (
          <div className="scan-processing-hud">
            <LoaderCircle className="spin" size={32} />
            <span>{isAr ? "جارٍ التحقق..." : "Validating badge..."}</span>
          </div>
        )}
      </div>

      {cameraError && (
        <div className="inline-warning scan-warning">
          <CircleAlert size={18} />
          <span>{t.cameraDenied}</span>
        </div>
      )}

      {/* Instant Scan Result HUD Card */}
      {result && (
        <article className={`scan-result-card result-${result.status}`} role="alert">
          <div className="result-card-header">
            <div className="result-badge-icon">
              <ResultIcon size={24} />
            </div>
            <div className="result-badge-title">
              <h2>{resultTitle}</h2>
              {result.checkedInAt && (
                <time>{formatEventTime(result.checkedInAt, language)}</time>
              )}
            </div>
            {result.stationName && (
              <span className="result-gate-tag">GATE {result.stationName}</span>
            )}
          </div>

          {result.participantName && (
            <div className="result-attendee-name">
              <strong>{result.participantName}</strong>
            </div>
          )}

          {result.message && <p className="result-card-msg">{result.message}</p>}

          <div className="result-card-buttons">
            {result.status === "success" && undoSeconds > 0 && (
              <button className="undo-action-btn" onClick={undo} disabled={processing}>
                <RotateCcw size={16} />
                <span>{t.undo} ({undoSeconds}s)</span>
              </button>
            )}
            {(result.status === "offline" || result.status === "error") && pending && (
              <button
                className="retry-action-btn"
                onClick={() => void processPayload(pending.payload, pending.requestId)}
                disabled={processing || !online}
              >
                <RefreshCw size={16} />
                <span>{t.retry}</span>
              </button>
            )}
            <button className="dismiss-action-btn" onClick={dismissResult}>
              <QrCode size={16} />
              <span>{t.scanAnother}</span>
            </button>
          </div>
        </article>
      )}

      {/* Manual Code Input Bar (Clean, Separated Dock) */}
      <form className="manual-entry-dock" onSubmit={(event) => void processManualCode(event)}>
        <div className="manual-input-wrapper">
          <input
            dir="ltr"
            value={manualCode}
            onChange={(event) => setManualCode(event.target.value.toUpperCase())}
            placeholder={language === "ar" ? "إدخال يدوي (مثال: ABCD-1234)" : "Manual code (e.g. ABCD-1234)"}
            aria-label={language === "ar" ? "الرمز اليدوي" : "Manual code"}
            disabled={processing || status !== "live"}
            maxLength={16}
          />
          <button
            type="submit"
            className="manual-submit-btn"
            disabled={processing || status !== "live" || !manualCode.trim()}
          >
            <span>{language === "ar" ? "تسجيل" : "Check In"}</span>
          </button>
        </div>
      </form>

      {/* P2P Local Mesh Pairing Modal */}
      {showMeshModal && (
        <MeshPairingModal
          language={language}
          peerCount={peerCount}
          onClose={() => setShowMeshModal(false)}
        />
      )}
    </section>
  );
}
