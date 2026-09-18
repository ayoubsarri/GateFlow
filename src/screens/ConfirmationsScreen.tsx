import { CheckCircle2, CircleHelp, Mail, Search, UserRoundX, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { matchesParticipant } from "../lib/domain";
import { copy } from "../lib/i18n";
import type { EventClient } from "../lib/api";
import type { ConfirmationStatus, Language, Participant } from "../types";

type Filter = "all" | ConfirmationStatus;

interface ConfirmationsScreenProps {
  language: Language;
  participants: Participant[];
  client: EventClient;
}

function confirmationIcon(status: ConfirmationStatus) {
  if (status === "confirmed") return <CheckCircle2 size={18} />;
  if (status === "declined") return <XCircle size={18} />;
  return <CircleHelp size={18} />;
}

export function ConfirmationsScreen({ language, participants, client }: ConfirmationsScreenProps) {
  const t = copy[language];
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const labels = language === "ar" ? {
    title: "التأكيدات",
    subtitle: "متابعة تأكيد الحضور قبل يوم الحدث فقط.",
    confirm: "تأكيد",
    decline: "لن يحضر",
    reset: "إلغاء التأكيد",
    reasonConfirm: "تأكيد يدوي",
    reasonDecline: "اعتذار يدوي",
    reasonReset: "إلغاء حالة التأكيد",
    done: "تم التحديث",
    confirmed: "مؤكد",
    unknown: "لم يؤكد",
    declined: "لن يحضر"
  } : {
    title: "Confirmations",
    subtitle: "Pre-event RSVP tracking only.",
    confirm: "Confirm",
    decline: "Not coming",
    reset: "Reset",
    reasonConfirm: "Manual confirmation",
    reasonDecline: "Manual decline",
    reasonReset: "Confirmation reset",
    done: "Updated",
    confirmed: "Confirmed",
    unknown: "No reply",
    declined: "Not coming"
  };

  const accepted = participants.filter((participant) => participant.status === "accepted");
  const counts = {
    all: accepted.length,
    confirmed: accepted.filter((participant) => participant.confirmationStatus === "confirmed").length,
    unknown: accepted.filter((participant) => participant.confirmationStatus === "unknown").length,
    declined: accepted.filter((participant) => participant.confirmationStatus === "declined").length
  };

  const filtered = useMemo(() => accepted.filter((participant) => {
    const statusMatch = filter === "all" || participant.confirmationStatus === filter;
    return statusMatch && matchesParticipant(participant, query);
  }), [accepted, filter, query]);

  const setStatus = async (participant: Participant, status: ConfirmationStatus, reason: string) => {
    setBusyId(participant.id);
    setNotice(null);
    try {
      await client.setConfirmation(participant.id, status, reason);
      setNotice(`${labels.done}: ${participant.name}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t.invalid);
    } finally {
      setBusyId(null);
    }
  };

  const filterItems: Array<{ id: Filter; label: string; count: number }> = [
    { id: "all", label: t.all, count: counts.all },
    { id: "confirmed", label: labels.confirmed, count: counts.confirmed },
    { id: "unknown", label: labels.unknown, count: counts.unknown },
    { id: "declined", label: labels.declined, count: counts.declined }
  ];

  return (
    <section className="confirmations-page people-page">
      <div className="page-heading page-heading--people">
        <div>
          <h1>{labels.title}</h1>
          <p>{labels.subtitle}</p>
        </div>
        <div className="confirmation-mini-stats">
          <span className="confirmed"><CheckCircle2 size={16} />{counts.confirmed}</span>
          <span className="unknown"><CircleHelp size={16} />{counts.unknown}</span>
          <span className="declined"><XCircle size={16} />{counts.declined}</span>
        </div>
      </div>

      <div className="people-toolbar">
        <label className="search-box">
          <Search size={20} />
          <input aria-label={t.search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} />
          {query && <button onClick={() => setQuery("")} aria-label="Clear">×</button>}
        </label>
        <div className="filter-tabs">
          {filterItems.map((item) => <button key={item.id} className={filter === item.id ? "active" : ""} onClick={() => setFilter(item.id)}>{item.label} <b>{item.count}</b></button>)}
        </div>
      </div>

      {notice && <div className="toast-notice" role="status"><CheckCircle2 size={18} />{notice}<button onClick={() => setNotice(null)}>×</button></div>}

      <div className="participants-list">
        {filtered.length ? filtered.map((participant) => (
          <article className="participant-row confirmation-row" key={participant.id}>
            <div className={`confirmation-status-icon ${participant.confirmationStatus}`}>
              {confirmationIcon(participant.confirmationStatus)}
            </div>
            <div className="participant-main">
              <div className="participant-heading">
                <strong>{participant.name}</strong>
                <span className={`participant-state confirmation-state ${participant.confirmationStatus}`}>
                  {confirmationIcon(participant.confirmationStatus)}
                  {participant.confirmationStatus === "confirmed" ? labels.confirmed : participant.confirmationStatus === "declined" ? labels.declined : labels.unknown}
                </span>
              </div>
              <div className="participant-details">
                <span><Mail size={14} />{participant.email}</span>
                {participant.organization && <span>{participant.organization}</span>}
              </div>
            </div>
            <div className="participant-actions">
              <button className="small-icon-button success" onClick={() => void setStatus(participant, "confirmed", labels.reasonConfirm)} disabled={busyId === participant.id} title={labels.confirm}><CheckCircle2 size={17} /></button>
              <button className="small-icon-button danger" onClick={() => void setStatus(participant, "declined", labels.reasonDecline)} disabled={busyId === participant.id} title={labels.decline}><UserRoundX size={17} /></button>
              <button className="small-icon-button" onClick={() => void setStatus(participant, "unknown", labels.reasonReset)} disabled={busyId === participant.id} title={labels.reset}><CircleHelp size={17} /></button>
            </div>
          </article>
        )) : (
          <div className="empty-state"><Search size={35} /><strong>{t.noResults}</strong></div>
        )}
      </div>
    </section>
  );
}
