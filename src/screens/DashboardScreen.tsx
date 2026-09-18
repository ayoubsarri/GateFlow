import { ArrowDownToLine, CheckCircle2, ClipboardCheck, Clock3, MailCheck, MapPinned, TrendingUp, UserRoundX, UsersRound } from "lucide-react";
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
  const rows = participants.map((participant) => [participant.name, participant.email, participant.organization, participant.status, participant.inviteStatus, participant.confirmationStatus, participant.confirmedAt, participant.checkedInAt, participant.stationName, participant.checkInMethod].map(escape).join(","));
  const blob = new Blob(["\uFEFF", [header.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `inas-attendance-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function DashboardScreen({ language, stats, recent, participants }: DashboardScreenProps) {
  const t = copy[language];
  const attendanceRate = stats.accepted ? Math.round((stats.checkedIn / stats.accepted) * 100) : 0;
  const maxHourly = Math.max(...stats.hourly.map((item) => item.count), 1);
  const sentRate = stats.accepted ? Math.round((stats.invitationSent / stats.accepted) * 100) : 0;
  const hourly = stats.hourly.length ? stats.hourly : [
    { hour: "08:00", count: 0 }, { hour: "09:00", count: 0 }, { hour: "10:00", count: 0 }, { hour: "11:00", count: 0 }
  ];

  const metrics = [
    { label: t.accepted, value: stats.accepted, icon: UsersRound, tone: "teal" },
    { label: t.confirmed, value: stats.confirmed, icon: ClipboardCheck, tone: "green" },
    { label: t.checked, value: stats.checkedIn, icon: CheckCircle2, tone: "green" },
    { label: t.absent, value: stats.absent, icon: UserRoundX, tone: "gold" },
    { label: t.attendanceRate, value: `${attendanceRate}%`, icon: TrendingUp, tone: "navy" }
  ];

  return (
    <section className="dashboard-page">
      <div className="page-heading">
        <h1>{t.dashboard}</h1>
        <button className="secondary-button" onClick={() => downloadCsv(participants)}><ArrowDownToLine size={18} />{t.export}</button>
      </div>

      <div className="metrics-grid">
        {metrics.map(({ label, value, icon: Icon, tone }) => (
          <article className={`metric-card metric-card--${tone}`} key={label}>
            <div className="metric-card__icon"><Icon size={21} /></div>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>

      <div className="dashboard-grid">
        <article className="panel arrival-panel">
          <div className="panel-heading"><h2>{t.arrivals}</h2><Clock3 size={21} /></div>
          <div className="bar-chart" aria-label={t.arrivals}>
            {hourly.map((item) => (
              <div className="bar-column" key={item.hour}>
                <span className="bar-value">{item.count}</span>
                <div className="bar-track"><div className="bar-fill" style={{ height: `${Math.max((item.count / maxHourly) * 100, item.count ? 12 : 2)}%` }} /></div>
                <small>{item.hour}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="panel invitation-panel">
          <div className="panel-heading"><h2>{t.invitations}</h2><MailCheck size={21} /></div>
          <div className="donut" style={{ "--progress": `${sentRate * 3.6}deg` } as CSSProperties}>
            <div><strong>{sentRate}%</strong></div>
          </div>
          <div className="campaign-legend">
            <span><i className="sent" />{t.invitations}<strong>{stats.invitationSent}</strong></span>
            <span><i className="pending" />{t.waiting}<strong>{stats.invitationPending}</strong></span>
            <span><i className="failed" />{t.failed}<strong>{stats.invitationFailed + stats.invitationUnknown}</strong></span>
          </div>
        </article>

        <article className="panel stations-panel">
          <div className="panel-heading"><h2>{t.stations}</h2><MapPinned size={21} /></div>
          <div className="station-list">
            {(stats.stations.length ? stats.stations : [{ name: "—", count: 0 }]).map((station, index) => (
              <div className="station-item" key={station.name}>
                <span className="station-rank">{String(index + 1).padStart(2, "0")}</span>
                <div><strong>{station.name}</strong><div className="station-track"><span style={{ width: `${stats.checkedIn ? (station.count / stats.checkedIn) * 100 : 0}%` }} /></div></div>
                <b>{station.count}</b>
              </div>
            ))}
          </div>
        </article>

        <article className="panel recent-panel">
          <div className="panel-heading"><h2>{t.recent}</h2><span className="pulse-dot" /></div>
          <div className="recent-list">
            {recent.length ? recent.slice(0, 6).map((record) => (
              <div className="recent-item" key={record.id}>
                <div className="recent-check"><CheckCircle2 size={18} /></div>
                <div><strong>{record.participantName}</strong><span>{record.stationName} · {record.method === "qr" ? t.qr : t.manual}</span></div>
                <time>{formatEventTime(record.checkedInAt, language)}</time>
              </div>
            )) : <div className="empty-mini">{language === "ar" ? "لا توجد عمليات دخول بعد." : "No check-ins yet."}</div>}
          </div>
        </article>
      </div>
    </section>
  );
}
