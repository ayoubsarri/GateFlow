import { Ban, Check, CheckCircle2, CircleHelp, Clock3, FileDown, Mail, Pencil, Plus, RotateCcw, Search, ShieldCheck, Trash2, UserCheck, UsersRound, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { createRequestId, formatEventTime, matchesParticipantWithNeedle, normalizeText } from "../lib/domain";
import { copy } from "../lib/i18n";
import { createInvitationPdfWindow, openInvitationPdf } from "../lib/invitationPdf";
import type { EventClient } from "../lib/api";
import type { Language, ManualInviteInput, Participant } from "../types";

type Filter = "all" | "checked" | "waiting" | "revoked";

interface PeopleScreenProps {
  language: Language;
  participants: Participant[];
  client: EventClient;
}

export function PeopleScreen({ language, participants, client }: PeopleScreenProps) {
  const t = copy[language];
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [codeMatchIds, setCodeMatchIds] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [manualInvite, setManualInvite] = useState<ManualInviteInput>({ name: "", email: "", organization: "" });
  const [visibleCount, setVisibleCount] = useState(50);

  useEffect(() => {
    setVisibleCount(50);
  }, [query, filter]);

  const labels = language === "ar" ? {
    add: "إضافة",
    addGuest: "إضافة مدعو",
    editGuest: "تعديل مدعو",
    name: "الاسم",
    email: "البريد",
    organization: "الجهة",
    save: "حفظ",
    cancel: "إلغاء",
    pdf: "PDF",
    pdfAll: "PDF الكل",
    restore: "استرجاع",
    restoreAll: "استرجاع الملغى",
    edit: "تعديل",
    delete: "حذف",
    deleteReason: "سبب حذف المدعو",
    revokeReason: "سبب إلغاء الدعوة",
    restoreReason: "سبب الاسترجاع",
    correctionReason: "سبب تصحيح سجل الحضور",
    revokedNotice: "تم إلغاء الدعوة.",
    restored: "تم الاسترجاع.",
    restoredAll: "تم استرجاع قائمة الملغى.",
    created: "تمت الإضافة.",
    updated: "تم التعديل.",
    deleted: "تم الحذف.",
    correction: "تصحيح",
    corrected: "تم التصحيح.",
    popupBlocked: "اسمح بفتح النافذة لحفظ PDF.",
    confirmed: "مؤكد",
    unconfirmed: "لم يؤكد",
    declined: "لن يحضر"
  } : {
    add: "Add",
    addGuest: "Add guest",
    editGuest: "Edit guest",
    name: "Name",
    email: "Email",
    organization: "Organization",
    save: "Save",
    cancel: "Cancel",
    pdf: "PDF",
    pdfAll: "All PDFs",
    restore: "Restore",
    restoreAll: "Restore revoked",
    edit: "Edit",
    delete: "Delete",
    deleteReason: "Reason for deleting this guest",
    revokeReason: "Reason for revoking this invitation",
    restoreReason: "Reason for restoring this invitation",
    correctionReason: "Reason for correcting this attendance record",
    revokedNotice: "Invitation revoked.",
    restored: "Invitation restored.",
    restoredAll: "Revoked list restored.",
    created: "Guest added.",
    updated: "Guest updated.",
    deleted: "Guest deleted.",
    correction: "Correct",
    corrected: "Attendance corrected.",
    popupBlocked: "Allow the pop-up to save the PDF.",
    confirmed: "Confirmed",
    unconfirmed: "No reply",
    declined: "Not coming"
  };

  const confirmationTitle = (participant: Participant) => participant.confirmationStatus === "confirmed"
    ? labels.confirmed
    : participant.confirmationStatus === "declined"
      ? labels.declined
      : labels.unconfirmed;

  useEffect(() => {
    const looksLikeCode = /^[A-Z0-9-]{6,12}$/i.test(query.trim());
    if (!looksLikeCode) {
      setCodeMatchIds(new Set());
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      void client.lookup(query.trim()).then((matches) => {
        if (active) setCodeMatchIds(new Set(matches.map((participant) => participant.id)));
      }).catch(() => {
        if (active) setCodeMatchIds(new Set());
      });
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [client, query]);

  const filtered = useMemo(() => {
    const trimmed = query.trim();
    const needle = trimmed ? normalizeText(trimmed) : "";
    return participants.filter((participant) => {
      const matchesFilter = filter === "all"
        || (filter === "checked" && Boolean(participant.checkedInAt))
        || (filter === "waiting" && participant.status === "accepted" && !participant.checkedInAt)
        || (filter === "revoked" && participant.status === "revoked");
      if (!matchesFilter) return false;
      if (codeMatchIds.has(participant.id)) return true;
      if (!needle) return true;
      return matchesParticipantWithNeedle(participant, needle);
    });
  }, [codeMatchIds, filter, participants, query]);

  const visibleParticipants = useMemo(() => {
    return filtered.slice(0, visibleCount);
  }, [filtered, visibleCount]);

  const resetForm = () => {
    setAdding(false);
    setEditingId(null);
    setManualInvite({ name: "", email: "", organization: "" });
  };

  const beginAdd = () => {
    setAdding(true);
    setEditingId(null);
    setManualInvite({ name: "", email: "", organization: "" });
  };

  const beginEdit = (participant: Participant) => {
    setAdding(false);
    setEditingId(participant.id);
    setManualInvite({
      name: participant.name,
      email: participant.email,
      organization: participant.organization || "",
      title: participant.title || ""
    });
  };

  const checkIn = async (participant: Participant) => {
    setBusyId(participant.id);
    setNotice(null);
    try {
      const result = await client.manualCheckIn(participant.id, createRequestId());
      setNotice(result.status === "success" ? `${t.success}: ${participant.name}` : result.status === "already" ? t.already : t.invalid);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t.invalid);
    } finally {
      setBusyId(null);
    }
  };

  const revoke = async (participant: Participant) => {
    const reason = window.prompt(labels.revokeReason);
    if (!reason?.trim()) return;
    setBusyId(participant.id);
    try {
      await client.revokeParticipant(participant.id, reason.trim());
      setNotice(labels.revokedNotice);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t.invalid);
    } finally {
      setBusyId(null);
    }
  };

  const restore = async (participant: Participant) => {
    const reason = window.prompt(labels.restoreReason);
    if (!reason?.trim()) return;
    setBusyId(participant.id);
    try {
      await client.restoreParticipant(participant.id, reason.trim());
      setNotice(labels.restored);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t.invalid);
    } finally {
      setBusyId(null);
    }
  };

  const restoreAllRevoked = async () => {
    const revoked = participants.filter((participant) => participant.status === "revoked" && !participant.checkedInAt);
    if (!revoked.length) return;
    setBusyId("restore-all");
    try {
      for (const participant of revoked) {
        await client.restoreParticipant(participant.id, "reset revoked list");
      }
      setNotice(labels.restoredAll);
      setFilter("all");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t.invalid);
    } finally {
      setBusyId(null);
    }
  };

  const correctAttendance = async (participant: Participant) => {
    if (!participant.checkInId) return;
    const reason = window.prompt(labels.correctionReason);
    if (!reason?.trim()) return;
    setBusyId(participant.id);
    try {
      await client.undoCheckIn(participant.checkInId, reason.trim());
      setNotice(labels.corrected);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t.invalid);
    } finally {
      setBusyId(null);
    }
  };

  const submitParticipant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusyId(editingId || "new");
    try {
      if (editingId) {
        await client.updateParticipant(editingId, manualInvite);
        setNotice(labels.updated);
      } else {
        const participant = await client.createParticipant(manualInvite);
        setNotice(`${labels.created} ${participant.name}`);
      }
      resetForm();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t.invalid);
    } finally {
      setBusyId(null);
    }
  };

  const deleteParticipant = async (participant: Participant) => {
    const reason = window.prompt(labels.deleteReason);
    if (!reason?.trim()) return;
    setBusyId(participant.id);
    try {
      await client.deleteParticipant(participant, reason.trim());
      setNotice(labels.deleted);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t.invalid);
    } finally {
      setBusyId(null);
    }
  };

  const pdfFor = async (participant: Participant) => {
    let popup: Window | null = null;
    try {
      popup = createInvitationPdfWindow(language);
    } catch (error) {
      setNotice(error instanceof Error && error.message === "popup-blocked" ? labels.popupBlocked : error instanceof Error ? error.message : t.invalid);
      return;
    }
    setBusyId(participant.id);
    try {
      const asset = await client.getInvitationAsset(participant);
      openInvitationPdf([{ participant, asset }], language, popup);
    } catch (error) {
      popup.close();
      setNotice(error instanceof Error && error.message === "popup-blocked" ? labels.popupBlocked : error instanceof Error ? error.message : t.invalid);
    } finally {
      setBusyId(null);
    }
  };

  const pdfForAll = async () => {
    const guests = filtered.filter((participant) => participant.status === "accepted");
    if (!guests.length) return;
    let popup: Window | null = null;
    try {
      popup = createInvitationPdfWindow(language);
    } catch (error) {
      setNotice(error instanceof Error && error.message === "popup-blocked" ? labels.popupBlocked : error instanceof Error ? error.message : t.invalid);
      return;
    }
    setPdfBusy(true);
    try {
      const entries = await Promise.all(guests.map(async (participant) => ({ participant, asset: await client.getInvitationAsset(participant) })));
      openInvitationPdf(entries, language, popup);
    } catch (error) {
      popup.close();
      setNotice(error instanceof Error && error.message === "popup-blocked" ? labels.popupBlocked : error instanceof Error ? error.message : t.invalid);
    } finally {
      setPdfBusy(false);
    }
  };

  const filters: Array<{ id: Filter; label: string }> = [
    { id: "all", label: t.all },
    { id: "checked", label: t.checked },
    { id: "waiting", label: t.waiting },
    { id: "revoked", label: t.revokedFilter }
  ];
  const revokedCount = participants.filter((participant) => participant.status === "revoked" && !participant.checkedInAt).length;

  return (
    <section className="people-page">
      <div className="page-heading page-heading--people">
        <h1>{t.people}</h1>
        <div className="people-heading-actions">
          <button className="secondary-button" onClick={beginAdd}><Plus size={18} />{labels.add}</button>
          <button className="secondary-button" onClick={() => void restoreAllRevoked()} disabled={!revokedCount || busyId === "restore-all"}><RotateCcw size={18} />{labels.restoreAll}</button>
          <button className="secondary-button" onClick={() => void pdfForAll()} disabled={pdfBusy}><FileDown size={18} />{labels.pdfAll}</button>
          <div className="count-badge"><UsersRound size={20} /><strong>{participants.filter((participant) => participant.status === "accepted").length}</strong><span>{t.accepted}</span></div>
        </div>
      </div>

      {(adding || editingId) && (
        <form className="manual-invite-panel" onSubmit={(event) => void submitParticipant(event)}>
          <strong>{editingId ? labels.editGuest : labels.addGuest}</strong>
          <input required value={manualInvite.name} onChange={(event) => setManualInvite({ ...manualInvite, name: event.target.value })} placeholder={labels.name} />
          <input required type="email" value={manualInvite.email} onChange={(event) => setManualInvite({ ...manualInvite, email: event.target.value })} placeholder={labels.email} />
          <input value={manualInvite.organization || ""} onChange={(event) => setManualInvite({ ...manualInvite, organization: event.target.value })} placeholder={labels.organization} />
          <button type="submit" className="primary-button" disabled={busyId === "new" || Boolean(editingId && busyId === editingId)}><Plus size={18} />{labels.save}</button>
          <button type="button" className="secondary-button" onClick={resetForm}>{labels.cancel}</button>
        </form>
      )}

      <div className="people-toolbar">
        <label className="search-box">
          <Search size={20} />
          <input aria-label={t.search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} />
          {query && <button onClick={() => setQuery("")} aria-label="Clear">×</button>}
        </label>
        <div className="filter-tabs">
          {filters.map((item) => <button key={item.id} className={filter === item.id ? "active" : ""} onClick={() => setFilter(item.id)}>{item.label}</button>)}
        </div>
      </div>

      {notice && <div className="toast-notice" role="status"><ShieldCheck size={18} />{notice}<button onClick={() => setNotice(null)}>×</button></div>}

      <div className="participants-list">
        {visibleParticipants.length ? visibleParticipants.map((participant) => (
          <article className="participant-row" key={participant.id}>
            <div className={`avatar ${participant.checkedInAt ? "is-checked" : participant.status === "revoked" ? "is-revoked" : ""}`}>
              {participant.checkedInAt ? <Check size={20} /> : participant.name.trim().slice(0, 1)}
            </div>
            <div className="participant-main">
              <div className="participant-heading">
                <strong>{participant.name}</strong>
                <span className={`rsvp-dot ${participant.confirmationStatus}`} title={confirmationTitle(participant)} aria-label={confirmationTitle(participant)}>
                  {participant.confirmationStatus === "confirmed" ? <CheckCircle2 size={15} /> : participant.confirmationStatus === "declined" ? <XCircle size={15} /> : <CircleHelp size={15} />}
                </span>
                <span className={`participant-state ${participant.status === "revoked" ? "revoked" : participant.checkedInAt ? "checked" : "waiting"}`}>
                  {participant.status === "revoked" ? <Ban size={13} /> : participant.checkedInAt ? <UserCheck size={13} /> : <Clock3 size={13} />}
                  {participant.status === "revoked" ? t.revokedFilter : participant.checkedInAt ? t.checked : t.waiting}
                </span>
              </div>
              <div className="participant-details">
                <span><Mail size={14} />{participant.email}</span>
                {participant.organization && <span>{participant.organization}</span>}
              </div>
              {participant.checkedInAt && <small>{formatEventTime(participant.checkedInAt, language)} · {participant.stationName}</small>}
            </div>
            <div className="participant-actions">
              {participant.status === "accepted" && (
                <button className="small-icon-button" onClick={() => void pdfFor(participant)} disabled={busyId === participant.id} title={labels.pdf}><FileDown size={17} /></button>
              )}
              {!participant.checkedInAt && (
                <button className="small-icon-button" onClick={() => beginEdit(participant)} disabled={busyId === participant.id} title={labels.edit}><Pencil size={17} /></button>
              )}
              {participant.status === "accepted" && !participant.checkedInAt && (
                <button className="small-primary-button" onClick={() => void checkIn(participant)} disabled={busyId === participant.id}>
                  <UserCheck size={17} />{t.manualCheckIn}
                </button>
              )}
              {participant.status === "accepted" && !participant.checkedInAt && (
                <button className="small-icon-button danger" onClick={() => void revoke(participant)} disabled={busyId === participant.id} title={t.revoke}><Ban size={17} /></button>
              )}
              {participant.status === "accepted" && participant.checkedInAt && participant.checkInId && (
                <button className="small-primary-button" onClick={() => void correctAttendance(participant)} disabled={busyId === participant.id}>
                  <RotateCcw size={17} />{labels.correction}
                </button>
              )}
              {participant.status === "revoked" && (
                <button className="small-primary-button" onClick={() => void restore(participant)} disabled={busyId === participant.id}>
                  <RotateCcw size={17} />{labels.restore}
                </button>
              )}
              {!participant.checkedInAt && (
                <button className="small-icon-button danger" onClick={() => void deleteParticipant(participant)} disabled={busyId === participant.id} title={labels.delete}><Trash2 size={17} /></button>
              )}
            </div>
          </article>
        )) : (
          <div className="empty-state"><Search size={35} /><strong>{t.noResults}</strong></div>
        )}
        {filtered.length > visibleCount && (
          <div className="pagination-panel" style={{ display: "flex", justifyContent: "center", padding: "16px" }}>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setVisibleCount((prev) => prev + 50)}
            >
              {language === "ar"
                ? `عرض المزيد (${filtered.length - visibleCount} متبقٍ)`
                : `Load More (${filtered.length - visibleCount} remaining)`}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
