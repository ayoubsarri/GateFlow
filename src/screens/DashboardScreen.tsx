import { Activity, ArrowDownToLine, CheckCircle2, ClipboardCheck, Clock3, Gauge, TrendingUp, UserRoundX, UsersRound, Zap, DoorOpen } from "lucide-react";
import type { CSSProperties } from "react";
import { copy } from "../lib/i18n";
import { formatEventTime } from "../lib/domain";
import type { CheckInRecord, EventStats, Language, Participant } from "../types";

interface DashboardScreenProps {
  language: Language;
  stats: EventStats;
  recent: CheckInRecord[];
  participants: Participant[];
}

function downloadCsv(participants: Participant[]) {
  const header = ["name", "email", "organization", "status", "invite_status", "confirmation_status", "confirmed_at", "checked_in_at", "station", "method"];
  const escape = (value: unknown) => {
    let str = String(value ?? "");
    const trimmed = str.trimStart();
    if (/^[=+\-@\t\r]/.test(trimmed)) {
      str = `'${str}`;
    }
    return `"${str.replace(/"/g, '""')}"`;
  };
  const rows = participants.map((participant) => [
    participant.name,
    participant.email,
    participant.organization,
    participant.status,
    participant.inviteStatus,
    participant.confirmationStatus,
    participant.confirmedAt,
    participant.checkedInAt,
    participant.stationName,
    participant.checkInMethod
  ].map(escape).join(","));
  const blob = new Blob(["\uFEFF", [header.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `gateflow-attendance-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function DashboardScreen({ language, stats, recent, participants }: DashboardScreenProps) {
  const t = copy[language];
  const isAr = language === "ar";
  const attendanceRate = stats.accepted ? Math.round((stats.checkedIn / stats.accepted) * 100) : 0;
  const maxHourly = Math.max(...stats.hourly.map((item) => item.count), 1);
  const hourly = stats.hourly.length ? stats.hourly : [
    { hour: "08:00", count: 0 }, { hour: "09:00", count: 0 }, { hour: "10:00", count: 0 }, { hour: "11:00", count: 0 }
  ];

  // 1. Calculate Real-Time Arrival Velocity (Last 15 minutes and peak velocity)
  const checkedInList = participants
    .filter((p) => p.checkedInAt)
    .map((p) => new Date(p.checkedInAt!).getTime())
    .sort((a, b) => a - b);

  const now = Date.now();
  const recent15m = checkedInList.filter((time) => now - time <= 15 * 60 * 1000).length;
  const currentVelocityPerMin = (recent15m / 15).toFixed(1);

  // Peak velocity window (any 15-minute rolling window)
  let peakVelocityWindow = 0;
  for (let i = 0; i < checkedInList.length; i++) {
    const windowStart = checkedInList[i];
    const inWindow = checkedInList.filter((t) => t >= windowStart && t <= windowStart + 15 * 60 * 1000).length;
    if (inWindow > peakVelocityWindow) {
      peakVelocityWindow = inWindow;
    }
  }
  const peakVelocityPerMin = (peakVelocityWindow / 15).toFixed(1);

  // 2. 5-Minute Micro-Chart Buckets (Last 6 intervals / 30 mins)
  const fiveMinBuckets: Array<{ label: string; count: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const bucketEnd = now - i * 5 * 60 * 1000;
    const bucketStart = bucketEnd - 5 * 60 * 1000;
    const count = checkedInList.filter((t) => t >= bucketStart && t < bucketEnd).length;
    const dateObj = new Date(bucketEnd);
    const label = `${String(dateObj.getHours()).padStart(2, "0")}:${String(dateObj.getMinutes()).padStart(2, "0")}`;
    fiveMinBuckets.push({ label, count });
  }
  const maxFiveMin = Math.max(...fiveMinBuckets.map((b) => b.count), 1);

  // 3. Dynamic Gate Distribution (supports all configured gates + actual checkin stations)
  const stationCountsMap = new Map<string, number>();
  // Pre-seed from stats.stations
  if (stats.stations && stats.stations.length > 0) {
    stats.stations.forEach((s) => stationCountsMap.set(s.name, s.count));
  } else {
    ["A", "B", "C", "D"].forEach((name) => stationCountsMap.set(name, 0));
  }
  // Also count directly from participants to ensure newly added gates show immediately
  participants.forEach((p) => {
    if (p.checkedInAt && p.stationName) {
      stationCountsMap.set(p.stationName, (stationCountsMap.get(p.stationName) || 0) + 1);
    }
  });

  const stationsData = Array.from(stationCountsMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const maxStationCount = Math.max(...stationsData.map((s) => s.count), 1);

  const metrics = [
    { label: t.accepted, value: stats.accepted, icon: UsersRound, tone: "teal" },
    { label: t.confirmed, value: stats.confirmed, icon: ClipboardCheck, tone: "green" },
    { label: t.checked, value: stats.checkedIn, icon: CheckCircle2, tone: "green" },
    { label: t.absent, value: stats.absent, icon: UserRoundX, tone: "gold" },
    { label: t.attendanceRate, value: `${attendanceRate}%`, icon: TrendingUp, tone: "navy" }
  ];

  return (
    <section className="dashboard-page">
      {/* Top Header */}
      <div className="page-heading">
        <div>
          <h1>{t.dashboard}</h1>
          <p className="sub-heading">
            {isAr ? "لوحة المتابعة والتحليلات اللحظية للحدث" : "Live Event Operations & Analytics Dashboard"}
          </p>
        </div>
        <button className="secondary-button" onClick={() => downloadCsv(participants)}>
          <ArrowDownToLine size={18} />
          {t.export}
        </button>
      </div>

      {/* Row 1: High-Level Pulse Summary Cards */}
      <div className="metrics-grid">
        {metrics.map(({ label, value, icon: Icon, tone }) => (
          <article className={`metric-card metric-card--${tone}`} key={label}>
            <div className="metric-card__icon"><Icon size={21} /></div>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>

      {/* Row 2: Live Velocity & Gate Traffic Distribution */}
      <div className="velocity-heatmap-row">
        {/* Panel A: Arrival Velocity & Cadence */}
        <article className="panel velocity-panel">
          <div className="panel-heading">
            <div className="panel-title-group">
              <Gauge size={20} className="text-teal" />
              <h2>{isAr ? "سرعة تدفق الوافدين" : "Arrival Velocity"}</h2>
            </div>
            <span className="live-pulse-badge">
              <span className="pulse-dot" />
              {isAr ? "مباشر" : "LIVE"}
            </span>
          </div>

          <div className="velocity-readout">
            <div className="velocity-stat">
              <span className="velocity-label">{isAr ? "التدفق الحالي" : "Current Rate"}</span>
              <div className="velocity-number">
                <strong>{currentVelocityPerMin}</strong>
                <small>{isAr ? "وافد / دقيقة" : "guests / min"}</small>
              </div>
            </div>

            <div className="velocity-stat">
              <span className="velocity-label">{isAr ? "أعلى ذروة مسجلة" : "Peak Recorded"}</span>
              <div className="velocity-number text-gold">
                <strong>{peakVelocityPerMin}</strong>
                <small>{isAr ? "وافد / دقيقة" : "guests / min"}</small>
              </div>
            </div>

            <div className="velocity-stat">
              <span className="velocity-label">{isAr ? "آخر 15 دقيقة" : "Last 15 Mins"}</span>
              <div className="velocity-number text-green">
                <strong>{recent15m}</strong>
                <small>{isAr ? "مسجل" : "scans"}</small>
              </div>
            </div>
          </div>

          {/* 5-minute Micro-Chart */}
          <div className="micro-chart-container">
            <div className="micro-chart-header">
              <Activity size={14} />
              <span>{isAr ? "التدفق كل 5 دقائق (آخر نصف ساعة)" : "5-Min Rolling Cadence"}</span>
            </div>
            <div className="micro-bars">
              {fiveMinBuckets.map((bucket) => {
                const heightPct = Math.max((bucket.count / maxFiveMin) * 100, bucket.count > 0 ? 15 : 4);
                return (
                  <div className="micro-bar-col" key={bucket.label}>
                    <span className="micro-bar-val">{bucket.count}</span>
                    <div className="micro-bar-track">
                      <div className="micro-bar-fill" style={{ height: `${heightPct}%` }} />
                    </div>
                    <span className="micro-bar-lbl">{bucket.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </article>

        {/* Panel B: Gate Traffic Distribution (Note: '(Gate Heatmap)' label removed per user specification) */}
        <article className="panel heatmap-panel">
          <div className="panel-heading">
            <div className="panel-title-group">
              <DoorOpen size={20} className="text-gold" />
              <h2>{isAr ? "توزيع حركة المداخل" : "Gate Traffic Distribution"}</h2>
            </div>
            <span className="panel-badge-subtle">
              <Zap size={14} className="text-teal" />
              {isAr ? "موازنة الأحمال" : "Load Balance"}
            </span>
          </div>

          <div className="heatmap-list">
            {stationsData.map((station) => {
              const share = stats.checkedIn ? Math.round((station.count / stats.checkedIn) * 100) : 0;
              const isBottleneck = share > 45 && stats.checkedIn > 20;
              const isBalanced = share >= 15 && share <= 45;

              return (
                <div className={`heatmap-station-row ${isBottleneck ? "is-congested" : ""}`} key={station.name}>
                  <div className="heatmap-station-header">
                    <div className="station-badge-circle">{station.name}</div>
                    <div className="station-meta">
                      <strong>{isAr ? `المدخل ${station.name}` : `Gate ${station.name}`}</strong>
                      <span className="station-share">{share}% {isAr ? "من إجمالي الدخول" : "of total entries"}</span>
                    </div>
                    <div className="station-count-pill">
                      <b>{station.count}</b>
                      <small>{isAr ? "وافد" : "guests"}</small>
                    </div>
                  </div>

                  <div className="heatmap-bar-track">
                    <div
                      className={`heatmap-bar-fill ${isBottleneck ? "fill-congested" : isBalanced ? "fill-optimal" : "fill-light"}`}
                      style={{ width: `${Math.max((station.count / maxStationCount) * 100, 3)}%` }}
                    />
                  </div>

                  <div className="heatmap-status-indicator">
                    {isBottleneck ? (
                      <span className="status-tag tag-warning">
                        ⚠️ {isAr ? "ضغط عالي — وجّه الوافدين لمداخل أخرى" : "High Volume — Distribute to other gates"}
                      </span>
                    ) : (
                      <span className="status-tag tag-normal">
                        ✓ {isAr ? "تدفق سلس ومستقر" : "Smooth Flow"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      </div>

      {/* Row 3: Hourly Trends & Recent Arrivals Stream */}
      <div className="dashboard-grid-organized">
        {/* Hourly Trend Panel */}
        <article className="panel arrival-panel">
          <div className="panel-heading">
            <div className="panel-title-group">
              <Clock3 size={20} />
              <h2>{t.arrivals}</h2>
            </div>
            <span className="panel-sub-label">{isAr ? "التوزيع بالساعات" : "Hourly Breakdown"}</span>
          </div>
          <div className="bar-chart" aria-label={t.arrivals}>
            {hourly.map((item) => (
              <div className="bar-column" key={item.hour}>
                <span className="bar-value">{item.count}</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ height: `${Math.max((item.count / maxHourly) * 100, item.count ? 12 : 2)}%` }} />
                </div>
                <small>{item.hour}</small>
              </div>
            ))}
          </div>
        </article>

        {/* Live Recent Check-in Feed */}
        <article className="panel recent-panel">
          <div className="panel-heading">
            <div className="panel-title-group">
              <span className="pulse-dot" />
              <h2>{t.recent}</h2>
            </div>
            <span className="panel-sub-label">{isAr ? "آخر عمليات الدخول" : "Live Stream"}</span>
          </div>
          <div className="recent-list">
            {recent.length ? (
              recent.slice(0, 6).map((record) => (
                <div className="recent-item" key={record.id}>
                  <div className="recent-check"><CheckCircle2 size={18} /></div>
                  <div className="recent-meta">
                    <strong>{record.participantName}</strong>
                    <span>{isAr ? `المدخل ${record.stationName}` : `Gate ${record.stationName}`} · {record.method === "qr" ? t.qr : t.manual}</span>
                  </div>
                  <time>{formatEventTime(record.checkedInAt, language)}</time>
                </div>
              ))
            ) : (
              <div className="empty-mini">{language === "ar" ? "لا توجد عمليات دخول بعد." : "No check-ins yet."}</div>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
