import { useEffect, useState, useMemo } from "react";
import { ArrowLeft, Clock, Eye, EyeOff, Maximize, Minimize, Volume2, VolumeX, MapPin, Building, ShieldCheck, Calendar, Activity } from "lucide-react";
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

      const match = participants.find((p) => p.id === latestCheckIn.participantId || p.name === latestCheckIn.participantName);

      const arrivalData = {
        id: latestCheckIn.id,
        name: latestCheckIn.participantName,
        organization: match?.organization,
        title: match?.title,
        stationName: latestCheckIn.stationName,
        timestamp: latestCheckIn.checkedInAt
      };

      setActiveArrival(arrivalData);

      // Play prestigious welcome chime
      if (soundEnabled) {
        try {
          const AudioContextValue = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          if (AudioContextValue) {
            const ctx = new AudioContextValue();
            const now = ctx.currentTime;
            // Pentatonic arpeggio chime: F5 (698.46) -> A5 (880.00) -> C6 (1046.50)
            const freqs = [698.46, 880.00, 1046.50];
            freqs.forEach((freq, idx) => {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = "sine";
              osc.frequency.value = freq;
              gain.gain.setValueAtTime(0.08, now + idx * 0.12);
              gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.4);
              osc.connect(gain).connect(ctx.destination);
              osc.start(now + idx * 0.12);
              osc.stop(now + idx * 0.12 + 0.4);
            });
          }
        } catch {
          // Audio blocked
        }
      }

      // Keep active arrival spotlight for 30 seconds before returning to idle schedule
      const timeout = setTimeout(() => {
        setActiveArrival(null);
      }, 30000);

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

  // Gate breakdown calculation
  const gateBreakdown = useMemo(() => {
    const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
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

  // 20-segment LED occupancy bar
  const totalSegments = 20;
  const activeSegments = Math.round((occupancyPercent / 100) * totalSegments);

  return (
    <div className="wb-editorial-root" dir="ltr">
      {/* Real Venue Photography Background with Deep Duotone Wash */}
      <div className="wb-background-layer">
        <div className="wb-photo-duotone" style={{ backgroundImage: "url('/audience-hall.jpg')" }} />
        <div className="wb-ink-overlay" />
        <div className="wb-grid-marks" />
      </div>

      {/* Top Editorial Masthead */}
      <header className="wb-masthead">
        <div className="wb-masthead-left">
          <div className="wb-logo-plate">
            <BrandLogo />
          </div>
          <div className="wb-edition-meta">
            <span className="wb-eyebrow">NATIONAL SCIENTIFIC CONVENTION · ALGIERS</span>
            <h1 className="wb-event-headline">INAS ANNUAL PLENARY 2026</h1>
            <p className="wb-event-arabic">الملتقى الوطني لشبكة العلماء والخبراء الجزائريين</p>
          </div>
        </div>

        <div className="wb-masthead-right">
          {/* Real-time Clock */}
          <div className="wb-clock-box">
            <Clock size={16} className="text-gold" />
            <span className="wb-clock-time">
              {String(clock.getHours()).padStart(2, "0")}:
              {String(clock.getMinutes()).padStart(2, "0")}:
              {String(clock.getSeconds()).padStart(2, "0")}
            </span>
            <span className="wb-clock-tz">WAT (UTC+1)</span>
          </div>

          {/* Folio Controls */}
          <div className="wb-controls-group">
            <button
              className={`wb-tool-btn ${privacyMode ? "is-active" : ""}`}
              onClick={() => setPrivacyMode(!privacyMode)}
              title={privacyMode ? "Privacy Mode (Masked)" : "Full Names Mode"}
            >
              {privacyMode ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>

            <button
              className={`wb-tool-btn ${soundEnabled ? "is-active" : ""}`}
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? "Audio Chime ON" : "Audio Muted"}
            >
              {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>

            <button className="wb-tool-btn" onClick={toggleFullscreen} title="Fullscreen Toggle">
              {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>

            {onBack && (
              <button className="wb-tool-btn wb-exit-btn" onClick={onBack} title="Exit Screen">
                <ArrowLeft size={16} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Editorial Workspace: 65% Arrival Stage / 35% Auditorium Telemetry */}
      <div className="wb-main-split">
        {/* Left: The Grand Arrival Spotlight Stage */}
        <section className="wb-stage-column">
          {activeArrival ? (
            <article className="wb-arrival-dossier" key={activeArrival.id}>
              {/* Technical Registration Marks */}
              <span className="wb-reg-mark mark-tl">┌</span>
              <span className="wb-reg-mark mark-tr">┐</span>
              <span className="wb-reg-mark mark-bl">└</span>
              <span className="wb-reg-mark mark-br">┘</span>

              <div className="wb-dossier-header">
                <div className="wb-highlighter-tag">
                  <span>DELEGATE ARRIVAL · بطاقة وصول معتمدة</span>
                </div>
                <div className="wb-verified-badge">
                  <ShieldCheck size={18} />
                  <span>OFFICIALLY VERIFIED</span>
                </div>
              </div>

              <div className="wb-salutation-line">
                <h2>أهلاً وسهلاً بكم في الجلسة الافتتاحية</h2>
                <h3>Welcome to the Annual Plenary Session</h3>
              </div>

              <div className="wb-guest-block">
                <h1 className="wb-guest-primary-name">{formatDisplayName(activeArrival.name)}</h1>
                {activeArrival.title && <span className="wb-guest-title-tag">{activeArrival.title}</span>}
              </div>

              {activeArrival.organization && (
                <div className="wb-guest-institution-box">
                  <Building size={20} className="text-gold" />
                  <span className="wb-institution-text">{activeArrival.organization}</span>
                </div>
              )}

              {/* Physical Boarding Slip / Gate Manifest Stamp */}
              <div className="wb-manifest-footer">
                <div className="wb-manifest-cell">
                  <span className="wb-manifest-lbl">ACCESS GATE · المدخل</span>
                  <strong className="wb-manifest-val gate-val">
                    <MapPin size={16} />
                    GATE {activeArrival.stationName || "A"}
                  </strong>
                </div>

                <div className="wb-manifest-cell">
                  <span className="wb-manifest-lbl">ENTRY TIMESTAMP</span>
                  <strong className="wb-manifest-val">
                    {new Date(activeArrival.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </strong>
                </div>

                <div className="wb-manifest-cell">
                  <span className="wb-manifest-lbl">SECURITY CLEARANCE</span>
                  <strong className="wb-manifest-val clearance-val">✓ VALIDATED PASS</strong>
                </div>
              </div>
            </article>
          ) : (
            <article className="wb-idle-dossier">
              <span className="wb-reg-mark mark-tl">┌</span>
              <span className="wb-reg-mark mark-tr">┐</span>
              <span className="wb-reg-mark mark-bl">└</span>
              <span className="wb-reg-mark mark-br">┘</span>

              <div className="wb-idle-eyebrow">
                <span>PLENARY SESSION IN PROGRESS · الجلسة العامة</span>
              </div>

              <h2 className="wb-idle-main-title">
                البحث العلمي، معايير الجودة والابتكار الوطني
              </h2>
              <h3 className="wb-idle-sub-title">
                Higher Education, Research Quality & Global Innovation
              </h3>

              <div className="wb-program-schedule">
                <div className="wb-schedule-item is-current">
                  <span className="wb-item-time">09:30</span>
                  <div className="wb-item-body">
                    <strong>Opening Keynote: Strategy for Academic Excellence</strong>
                    <small>Main Amphitheater · الجلسة الافتتاحية</small>
                  </div>
                  <span className="wb-item-badge">IN SESSION</span>
                </div>

                <div className="wb-schedule-item">
                  <span className="wb-item-time">11:15</span>
                  <div className="wb-item-body">
                    <strong>Panel: Engaging the Algerian Scientific Diaspora</strong>
                    <small>Conference Hall B · منصة الشراكة الدولية</small>
                  </div>
                  <span className="wb-item-badge standby">UP NEXT</span>
                </div>

                <div className="wb-schedule-item">
                  <span className="wb-item-time">14:00</span>
                  <div className="wb-item-body">
                    <strong>Workshops: Tech Transfer, Patents & DeepTech</strong>
                    <small>Innovation Pavilions 1 & 2</small>
                  </div>
                  <span className="wb-item-badge standby">SCHEDULED</span>
                </div>
              </div>

              <div className="wb-venue-bar">
                <MapPin size={16} className="text-gold" />
                <span>Palais de la Culture Moufdi Zakaria · Plateau des Annassers, Algiers</span>
              </div>
            </article>
          )}
        </section>

        {/* Right: Auditorium Telemetry & Traffic Radar */}
        <aside className="wb-telemetry-column">
          {/* Block 1: "By The Numbers" Hall Occupancy */}
          <div className="wb-telemetry-card">
            <div className="wb-card-eyebrow">
              <span>AUDITORIUM CAPACITY</span>
              <Activity size={16} className="text-green" />
            </div>

            <div className="wb-big-number-row">
              <span className="wb-big-stat">{occupancyPercent}%</span>
              <div className="wb-number-context">
                <strong>{totalCheckedIn} / {totalAccepted}</strong>
                <small>CONFIRMED SEATS TAKEN</small>
              </div>
            </div>

            {/* Segmented Architectural 20-Bar Meter */}
            <div className="wb-segmented-meter" aria-label="Hall Occupancy Meter">
              {Array.from({ length: totalSegments }).map((_, i) => (
                <span
                  key={i}
                  className={`wb-meter-segment ${i < activeSegments ? "is-filled" : ""}`}
                />
              ))}
            </div>

            <div className="wb-meter-legend">
              <span>0% ENTRY</span>
              <span>HALL OCCUPANCY: {totalCheckedIn} ATTENDING</span>
              <span>100% FULL</span>
            </div>
          </div>

          {/* Block 2: Live Gate Load Balancer */}
          <div className="wb-telemetry-card">
            <div className="wb-card-eyebrow">
              <span>GATE TRAFFIC MATRIX · توزيع المداخل</span>
              <span className="wb-live-pulse-dot" />
            </div>

            <div className="wb-gate-matrix-grid">
              {(["A", "B", "C", "D"] as const).map((gate) => {
                const count = gateBreakdown[gate] || 0;
                const share = totalCheckedIn ? Math.round((count / totalCheckedIn) * 100) : 0;
                return (
                  <div className="wb-gate-cell" key={gate}>
                    <div className="wb-gate-badge">GATE {gate}</div>
                    <div className="wb-gate-data">
                      <strong>{count}</strong>
                      <small>{share}% share</small>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Block 3: Conference Dignitaries & Welcome Note */}
          <div className="wb-telemetry-card wb-welcome-seal-card">
            <div className="wb-seal-header">
              <Calendar size={18} className="text-gold" />
              <strong>WELCOME DELEGATES</strong>
            </div>
            <p className="wb-welcome-paragraph">
              Welcome to all esteemed professors, researchers, academic partners, and international delegates joining us in Algiers. Please proceed to your allocated auditorium zone.
            </p>
            <div className="wb-arabic-welcome-note">
              مرحباً بجميع العلماء، الأساتذة والباحثين المشاركين من داخل الوطن وخارجه.
            </div>
          </div>
        </aside>
      </div>

      {/* Bottom Live Arrivals Stream: Split-Flap Ticker */}
      <footer className="wb-ticker-bar">
        <div className="wb-ticker-header">
          <span className="wb-pulse-indicator" />
          <span>RECENT ARRIVALS · سجل الوصول المباشر</span>
        </div>

        <div className="wb-ticker-scroll">
          {recent.slice(0, 8).map((record) => (
            <div className="wb-ticker-plate" key={record.id}>
              <span className="wb-plate-gate">GATE {record.stationName}</span>
              <strong className="wb-plate-name">{formatDisplayName(record.participantName)}</strong>
              <small className="wb-plate-time">
                {new Date(record.checkedInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </small>
            </div>
          ))}
          {recent.length === 0 && (
            <div className="wb-ticker-idle">Gate check-in streams are active and synchronizing live...</div>
          )}
        </div>
      </footer>
    </div>
  );
}
