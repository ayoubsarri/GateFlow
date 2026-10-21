import { useEffect, useState, useMemo } from "react";
import { ArrowLeft, Clock, Eye, EyeOff, Maximize, Minimize, Sparkles, Volume2, VolumeX, Users, MapPin, Building } from "lucide-react";
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
    stationName: string;
    timestamp: string;
  } | null>(null);

  // Live Clock updater
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Monitor latest check-in
  const latestCheckIn = recent[0] || null;

  useEffect(() => {
    if (!latestCheckIn) return;
    if (latestCheckIn.id !== lastCheckInId) {
      setLastCheckInId(latestCheckIn.id);

      // Find matching participant to get organization/affiliation
      const match = participants.find((p) => p.id === latestCheckIn.participantId || p.name === latestCheckIn.participantName);

      const arrivalData = {
        id: latestCheckIn.id,
        name: latestCheckIn.participantName,
        organization: match?.organization || match?.title,
        stationName: latestCheckIn.stationName,
        timestamp: latestCheckIn.checkedInAt
      };

      setActiveArrival(arrivalData);

      // Play polite welcome chime
      if (soundEnabled) {
        try {
          const AudioContextValue = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          if (AudioContextValue) {
            const ctx = new AudioContextValue();
            const now = ctx.currentTime;
            // Pentatonic welcome chime: C5 (523.25) -> G5 (783.99) -> C6 (1046.50)
            const freqs = [523.25, 783.99, 1046.50];
            freqs.forEach((freq, idx) => {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.frequency.value = freq;
              gain.gain.setValueAtTime(0.06, now + idx * 0.1);
              gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.35);
              osc.connect(gain).connect(ctx.destination);
              osc.start(now + idx * 0.1);
              osc.stop(now + idx * 0.1 + 0.35);
            });
          }
        } catch {
          // Audio blocked
        }
      }

      // Keep active arrival spotlight for 25 seconds before returning to idle rotation
      const timeout = setTimeout(() => {
        setActiveArrival(null);
      }, 25000);

      return () => clearTimeout(timeout);
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
      // Fullscreen not permitted
    }
  };

  const totalCheckedIn = useMemo(() => participants.filter((p) => p.checkedInAt).length, [participants]);
  const totalAccepted = participants.length || 1;
  const occupancyPercent = Math.round((totalCheckedIn / totalAccepted) * 100);

  const formatDisplayName = (fullName: string) => {
    if (!privacyMode) return fullName;
    const parts = fullName.trim().split(" ");
    if (parts.length <= 1) return fullName;
    return `${parts[0]} ${parts[parts.length - 1][0]}.`;
  };

  return (
    <div className="welcome-board-container" dir="ltr">
      {/* Ambient background flares */}
      <div className="welcome-flare flare-1" />
      <div className="welcome-flare flare-2" />

      {/* Top Header Bar */}
      <header className="welcome-header">
        <div className="welcome-brand">
          <BrandLogo />
          <div className="welcome-event-info">
            <h1>{event.title.en || "INAS National Forum"}</h1>
            <p>{event.venue.en || "Algiers, Algeria"} · {event.date || "2026"}</p>
          </div>
        </div>

        <div className="welcome-header-actions">
          {/* Live Hall Occupancy Pill */}
          <div className="occupancy-pill">
            <Users size={18} />
            <span>
              <strong>{totalCheckedIn}</strong> / {totalAccepted} ({occupancyPercent}%)
            </span>
          </div>

          {/* Digital Clock */}
          <div className="welcome-clock">
            <Clock size={18} />
            <span>
              {String(clock.getHours()).padStart(2, "0")}:
              {String(clock.getMinutes()).padStart(2, "0")}:
              {String(clock.getSeconds()).padStart(2, "0")}
            </span>
          </div>

          {/* Privacy Toggle */}
          <button
            className="kiosk-control-btn"
            onClick={() => setPrivacyMode(!privacyMode)}
            title={privacyMode ? "Privacy Mode Active" : "Full Names Displayed"}
          >
            {privacyMode ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>

          {/* Sound Toggle */}
          <button
            className="kiosk-control-btn"
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? "Mute Chimes" : "Enable Chimes"}
          >
            {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>

          {/* Fullscreen Toggle */}
          <button className="kiosk-control-btn" onClick={toggleFullscreen} title="Toggle Fullscreen">
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>

          {/* Back to App */}
          {onBack && (
            <button className="kiosk-control-btn exit-btn" onClick={onBack} title="Exit Kiosk Mode">
              <ArrowLeft size={18} />
            </button>
          )}
        </div>
      </header>

      {/* Center Stage: Dynamic Arrival Spotlight or Idle Showcase */}
      <main className="welcome-main-stage">
        {activeArrival ? (
          <div className="arrival-spotlight-card" key={activeArrival.id}>
            <div className="spotlight-badge">
              <Sparkles size={20} className="sparkle-icon" />
              <span>JUST CHECKED IN · دخول جديد</span>
            </div>

            <h2 className="welcome-salutation">أهلاً وسهلاً بكم · Welcome</h2>
            <h3 className="spotlight-guest-name">{formatDisplayName(activeArrival.name)}</h3>

            {activeArrival.organization && (
              <div className="spotlight-affiliation">
                <Building size={20} />
                <span>{activeArrival.organization}</span>
              </div>
            )}

            <div className="spotlight-meta-tags">
              <span className="spotlight-gate">
                <MapPin size={16} />
                Gate {activeArrival.stationName || "A"}
              </span>
              <span className="spotlight-time">
                {new Date(activeArrival.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          </div>
        ) : (
          <div className="welcome-idle-card">
            <div className="idle-hero-tag">
              <span>INTERNATIONAL SCIENTIFIC CONVENTION</span>
            </div>
            <h2 className="idle-hero-title">
              الملتقى الوطني لشبكة العلماء الجزائريين
            </h2>
            <h3 className="idle-hero-subtitle">
              INAS National Forum: Quality, Research & Global Knowledge
            </h3>

            <div className="idle-occupancy-bar">
              <div className="occupancy-track">
                <div className="occupancy-fill" style={{ width: `${occupancyPercent}%` }} />
              </div>
              <div className="occupancy-labels">
                <span>Hall Occupancy: <strong>{totalCheckedIn} Attending</strong></span>
                <span>Capacity: <strong>{occupancyPercent}%</strong></span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Ticker: Recent Arrivals Feed */}
      <footer className="welcome-bottom-ticker">
        <div className="ticker-label">
          <span className="pulse-dot" />
          <span>RECENT ARRIVALS</span>
        </div>
        <div className="ticker-stream">
          {recent.slice(0, 6).map((item) => (
            <div className="ticker-item" key={item.id}>
              <strong>{formatDisplayName(item.participantName)}</strong>
              <span className="ticker-gate">Gate {item.stationName}</span>
              <small>{new Date(item.checkedInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
            </div>
          ))}
          {recent.length === 0 && (
            <div className="ticker-empty">Gate check-in stream is live and active...</div>
          )}
        </div>
      </footer>
    </div>
  );
}
