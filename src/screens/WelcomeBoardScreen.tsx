import { useEffect, useState, useMemo } from "react";
import { ArrowLeft, Clock, Eye, EyeOff, Maximize, Minimize, Volume2, VolumeX, MapPin, Building, ShieldCheck, DoorOpen } from "lucide-react";
import { BrandLogo } from "../components/BrandLogo";
import type { CheckInRecord, EventRecord, Language, Participant } from "../types";

interface WelcomeBoardScreenProps {
  language: Language;
  event: EventRecord;
  recent: CheckInRecord[];
  participants: Participant[];
  onBack?: () => void;
}

export function WelcomeBoardScreen({ language, event, recent, participants, onBack }: WelcomeBoardScreenProps) {
  const [clock, setClock] = useState(() => new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [lastCheckInId, setLastCheckInId] = useState<string | null>(null);
  const [activeArrival, setActiveArrival] = useState<{
    id: string;
    name: string;
    organization?: string;
    title?: string;
    stationName: string;
    timestamp: string;
  } | null>(null);
  const [arrivalExpiresAt, setArrivalExpiresAt] = useState<number>(0);

  // Live Clock updater & automatic return to idle summit display after 25s
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setClock(new Date());
      setActiveArrival((current) => {
        if (current && now > arrivalExpiresAt && arrivalExpiresAt > 0) {
          return null;
        }
        return current;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [arrivalExpiresAt]);

  // Monitor latest check-in
  const latestCheckIn = recent[0] || null;

  useEffect(() => {
    if (!latestCheckIn) return;
    if (latestCheckIn.id !== lastCheckInId) {
      setLastCheckInId(latestCheckIn.id);

      const match = participants.find(
        (p) => p.id === latestCheckIn.participantId || p.name === latestCheckIn.participantName
      );

      const arrivalData = {
        id: latestCheckIn.id,
        name: latestCheckIn.participantName,
        organization: match?.organization,
        title: match?.title,
        stationName: latestCheckIn.stationName,
        timestamp: latestCheckIn.checkedInAt
      };

      setActiveArrival(arrivalData);
      setArrivalExpiresAt(Date.now() + 25000);

      // Prestigious audio chime
      if (soundEnabled) {
        try {
          const AudioContextValue =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          if (AudioContextValue) {
            const ctx = new AudioContextValue();
            const now = ctx.currentTime;
            // Pentatonic chords: F5 (698.46) -> A5 (880.00) -> C6 (1046.50)
            const freqs = [698.46, 880.00, 1046.50];
            freqs.forEach((freq, idx) => {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = "sine";
              osc.frequency.value = freq;
              gain.gain.setValueAtTime(0.07, now + idx * 0.12);
              gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.45);
              osc.connect(gain).connect(ctx.destination);
              osc.start(now + idx * 0.12);
              osc.stop(now + idx * 0.12 + 0.45);
            });
          }
        } catch {
          // Audio blocked
        }
      }
    }
  }, [latestCheckIn, lastCheckInId, participants, soundEnabled]);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      // Fullscreen not allowed
    }
  };

  const totalCheckedIn = useMemo(() => participants.filter((p) => p.checkedInAt).length, [participants]);
  const totalAccepted = participants.length || 1;
  const occupancyPercent = Math.round((totalCheckedIn / totalAccepted) * 100);

  // Dynamic Gate breakdown
  const gateBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    participants.forEach((p) => {
      if (p.checkedInAt && p.stationName) {
        counts[p.stationName] = (counts[p.stationName] || 0) + 1;
      }
    });
    return counts;
  }, [participants]);

  const formatDisplayName = (fullName: string) => {
    if (!privacyMode) return fullName;
    const parts = fullName.trim().split(" ");
    if (parts.length <= 1) return fullName;
    return `${parts[0]} ${parts[parts.length - 1][0]}.`;
  };

  return (
    <div className="wb-minimal-root" dir="ltr">
      {/* Cinematic Venue Atmospheric Backdrop */}
      <div className="wb-ambient-canvas">
        <div className="wb-venue-layer" style={{ backgroundImage: "url('/audience-hall.jpg')" }} />
        <div className="wb-vignette-wash" />
        <div className="wb-subtle-grid" />
      </div>

      {/* Top Sleek Hairline Masthead */}
      <header className="wb-sleek-bar">
        <div className="wb-bar-brand">
          <div className="wb-logo-capsule">
            <BrandLogo />
          </div>
          <div className="wb-brand-text">
            <span className="wb-pill-label">{event.date || "LIVE SUMMIT"}</span>
            <strong className="wb-title-text">{event.title[language] || event.title.en || event.title.ar || "CONFERENCE & SUMMIT"}</strong>
          </div>
        </div>

        {/* Center Minimalist Attendance Capsule */}
        <div className="wb-center-pulse">
          <span className="wb-pulse-emerald" />
          <strong className="wb-pulse-stat">
            {totalCheckedIn} / {totalAccepted}
          </strong>
          <span className="wb-pulse-label">
            DELEGATES ARRIVED · {occupancyPercent}% SEATED
          </span>
        </div>

        {/* Right Precision Monospace Clock & Screen Controls */}
        <div className="wb-bar-actions">
          <div className="wb-clock-capsule">
            <Clock size={15} className="text-gold" />
            <span className="wb-clock-digits">
              {String(clock.getHours()).padStart(2, "0")}:
              {String(clock.getMinutes()).padStart(2, "0")}:
              {String(clock.getSeconds()).padStart(2, "0")}
            </span>
            <small>WAT</small>
          </div>

          <div className="wb-action-icons">
            <button
              className={`wb-icon-btn ${privacyMode ? "active" : ""}`}
              onClick={() => setPrivacyMode(!privacyMode)}
              title={privacyMode ? "Privacy Mask Enabled" : "Full Names Display"}
            >
              {privacyMode ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            <button
              className={`wb-icon-btn ${soundEnabled ? "active" : ""}`}
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? "Audio On" : "Muted"}
            >
              {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            <button className="wb-icon-btn" onClick={toggleFullscreen} title="Toggle Fullscreen">
              {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>
            {onBack && (
              <button className="wb-icon-btn wb-exit-btn" onClick={onBack} title="Exit Welcome Screen">
                <ArrowLeft size={16} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Single Centered Hero Stage (Clean, Monumental, Original) */}
      <main className="wb-hero-stage">
        {activeArrival ? (
          <article className="wb-arrival-monument" key={activeArrival.id}>
            {/* Elegant Accent Header */}
            <div className="wb-arrival-tagline">
              <span className="wb-gold-spark">✦</span>
              <span className="wb-arrival-badge-text">DELEGATE ARRIVAL · بطاقة وصول معتمدة</span>
            </div>

            <div className="wb-salute-bilingual">
              <h2 className="wb-salute-ar">أهلاً وسهلاً بكم في الجلسة الافتتاحية</h2>
              <p className="wb-salute-en">Welcome to the Annual Plenary Session</p>
            </div>

            {/* Monumental Attendee Name */}
            <h1 className="wb-attendee-name">
              {formatDisplayName(activeArrival.name)}
            </h1>

            {/* Organization / Academic Affiliation */}
            {activeArrival.organization && (
              <div className="wb-affiliation-line">
                <Building size={19} className="text-gold" />
                <span>{activeArrival.organization}</span>
              </div>
            )}

            {/* Clean Minimalist Boarding Metadata (No heavy boxes) */}
            <div className="wb-meta-strip">
              <div className="wb-meta-item">
                <span className="wb-meta-key">ACCESS GATE</span>
                <strong className="wb-meta-val text-gold">
                  GATE {activeArrival.stationName || "A"}
                </strong>
              </div>

              <span className="wb-meta-sep">/</span>

              <div className="wb-meta-item">
                <span className="wb-meta-key">ENTRY TIME</span>
                <strong className="wb-meta-val">
                  {new Date(activeArrival.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit"
                  })}
                </strong>
              </div>

              <span className="wb-meta-sep">/</span>

              <div className="wb-meta-item">
                <span className="wb-meta-key">SECURITY STATUS</span>
                <strong className="wb-meta-val text-emerald">
                  <ShieldCheck size={16} /> VALIDATED BADGE
                </strong>
              </div>
            </div>
          </article>
        ) : (
          <article className="wb-idle-monument">
            <span className="wb-summit-badge">{event.topic?.[language] || event.topic?.en || event.topic?.ar || "OFFICIAL SUMMIT & CONFERENCE"}</span>

            <h1 className="wb-summit-arabic-title">
              {event.title.ar || event.title[language]}
            </h1>

            <h2 className="wb-summit-english-title">
              {event.title.en || event.title[language]}
            </h2>

            {event.subtitle && (
              <p className="wb-summit-sub">
                {event.subtitle[language] || event.subtitle.en || event.subtitle.ar}
              </p>
            )}

            {event.venue && (
              <div className="wb-venue-pill">
                <MapPin size={16} className="text-gold" />
                <span>{event.venue[language] || event.venue.en || event.venue.ar}</span>
              </div>
            )}

            {/* Clean Live Gate Throughput Ribbon (Integrated subtly) */}
            <div className="wb-gate-summary-row">
              <span className="wb-gate-summary-title">LIVE GATE RECEPTION:</span>
              {Object.keys(gateBreakdown).length > 0 ? (
                Object.entries(gateBreakdown).map(([gate, count]) => (
                  <div className="wb-gate-summary-pill" key={gate}>
                    <span className="wb-gate-tag">GATE {gate}</span>
                    <strong className="wb-gate-num">{count}</strong>
                  </div>
                ))
              ) : (
                <span className="wb-gate-summary-none">Gates Active & Standby</span>
              )}
            </div>
          </article>
        )}
      </main>
    </div>
  );
}
