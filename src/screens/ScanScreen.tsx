import { Check, CircleAlert, Flashlight, LoaderCircle, QrCode, Radio, RefreshCw, RotateCcw, ScanLine, Video, VideoOff, X, Zap } from "lucide-react";
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

  // Subscribe to P2P Mesh peer count & incoming check-in notifications
  useEffect(() => {
    const unsubPeers = p2pMesh.onPeerCountChange(setPeerCount);
    const unsubMesh = p2pMesh.subscribe((event) => {
      // If another station checked someone in, record notice
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
      // Audio blocked or unsupported
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

    // 1. Check Local P2P Mesh Invariant Cache First (Detects duplicate scan at other offline gates)
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
      setBurstCount((c) => c + 1);
      setProcessing(false);
      playChime("success");
      autoDismissTimerRef.current = window.setTimeout(dismissResult, speedGate ? 1200 : 2800);
      return;
    }

    // 3. Online Check-in via Client
    try {
      const response = await client.checkIn(payload, requestId);
      setResult(response);
      setPending(response.status === "offline" ? { payload, requestId } : null);

      if (response.status === "offline") {
        enqueueOfflineScan("qr", payload, requestId);
      }

      // Broadcast check-in across P2P Mesh to all paired gates
      if (response.status === "success") {
        p2pMesh.broadcastCheckIn({
          payload,
          requestId,
          participantId: response.participantId,
          participantName: response.participantName,
          stationName: response.stationName || localStorage.getItem("inas-station") || "A"
        });
        setBurstCount((c) => c + 1);
        setUndoSeconds(10);
      }

      playChime(response.status);

      // Auto-dismiss HUD so staff NEVER has to tap "Scan Another" in burst mode
      const dismissDuration = speedGate ? (response.status === "success" ? 1300 : 2000) : 2800;
      autoDismissTimerRef.current = window.setTimeout(dismissResult, dismissDuration);
    } catch (error) {
      if (isNetworkFailure(error)) {
        enqueueOfflineScan("qr", payload, requestId);
        p2pMesh.broadcastCheckIn({
          payload,
          requestId,
          stationName: localStorage.getItem("inas-station") || "A"
        });
        setResult({ status: "offline" });
        setBurstCount((c) => c + 1);
        playChime("success");
        autoDismissTimerRef.current = window.setTimeout(dismissResult, speedGate ? 1200 : 2800);
      } else {
        setResult({ status: "error", message: error instanceof Error ? error.message : undefined });
        playChime("error");
      }
    } finally {
      setProcessing(false);
    }
  }, [client, dismissResult, isAr, speedGate]);

  const processManualCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    clearAutoDismiss();
    setProcessing(true);
    setResult(null);
    const requestId = createRequestId();

    // Check P2P Mesh
    const meshMatch = p2pMesh.queryMeshCheckIn(code);
    if (meshMatch) {
      setResult({
        status: "already",
        participantName: meshMatch.participantName,
        stationName: meshMatch.stationName,
        message: isAr ? `مسجل مسبقاً في المدخل ${meshMatch.stationName} (P2P)` : `Checked in at Station ${meshMatch.stationName} (P2P)`
      });
      playChime("already");
      setManualCode("");
      setProcessing(false);
      autoDismissTimerRef.current = window.setTimeout(dismissResult, 2500);
      return;
    }

    if (!navigator.onLine) {
      enqueueOfflineScan("manual", code, requestId);
      setResult({ status: "offline" });
      setManualCode("");
      setBurstCount((c) => c + 1);
      setProcessing(false);
      playChime("success");
      return;
    }

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
      {/* Top Operations Strip: Speed-Gate Burst Mode & P2P Local Mesh Status */}
      <div className="scan-operations-strip">
        <button
          className={`speed-gate-toggle ${speedGate ? "is-active" : ""}`}
          onClick={toggleSpeedGate}
          title={isAr ? "تبديل وضع السرعة القصوى للمسح المتتالي" : "Toggle Continuous Speed-Gate Burst Mode"}
        >
          <Zap size={16} />
          <strong>{isAr ? "وضع السرعة" : "Speed-Gate"}</strong>
          <span className="speed-gate-badge">{speedGate ? (isAr ? "مفعّل" : "ON") : (isAr ? "معطل" : "OFF")}</span>
        </button>

        {speedGate && (
          <div className="burst-metric-chip" title="Burst Throughput">
            <span>{burstCount} {isAr ? "مسح" : "scans"}</span>
            <small>· {burstVelocity}/min</small>
            {burstCount > 0 && (
              <button className="burst-reset-button" onClick={resetBurstSession} title="Reset counter">
                <RotateCcw size={12} />
              </button>
            )}
          </div>
        )}

        <button
          className={`mesh-pill-button ${peerCount > 0 ? "has-peers" : ""}`}
          onClick={() => setShowMeshModal(true)}
          title={isAr ? "ربط شبكة المداخل P2P للمزامنة عند انقطاع الإنترنت" : "P2P Gate Mesh Sync Status"}
        >
          <Radio size={15} />
          <span>{peerCount > 0 ? `${peerCount} ${isAr ? "مداخل متصلة" : "Gates"}` : (isAr ? "شبكة P2P" : "P2P Mesh")}</span>
        </button>
      </div>

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

      <div className={`scanner-card scanner-card--single ${scanning ? "is-scanning" : ""} ${result ? `scanner-card--flash-${result.status}` : ""}`}>
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
            {result.message && <p className="result-message" style={{ fontSize: "0.85rem", opacity: 0.9, marginTop: "4px" }}>{result.message}</p>}
            
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
