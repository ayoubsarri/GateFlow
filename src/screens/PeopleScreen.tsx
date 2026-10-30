import {
  Ban,
  Check,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Mail,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Tag,
  Trash2,
  UploadCloud,
  UserCheck,
  UsersRound,
  X,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { createRequestId, formatEventTime, matchesParticipantWithNeedle, normalizeText } from "../lib/domain";
import { copy } from "../lib/i18n";
import { parseAttendeesCsv } from "../lib/csvImport";
import type { EventClient } from "../lib/api";
import type { Language, ManualInviteInput, Participant, ParticipantCategory } from "../types";

type Filter = "all" | "checked" | "waiting" | "revoked";
type CategoryFilter = "all" | ParticipantCategory;

interface PeopleScreenProps {
  language: Language;
  participants: Participant[];
  client: EventClient;
}

export function PeopleScreen({ language, participants, client }: PeopleScreenProps) {
  const t = copy[language];
  const isAr = language === "ar";

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [codeMatchIds, setCodeMatchIds] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [manualInvite, setManualInvite] = useState<ManualInviteInput>({
    name: "",
    email: "",
    organization: "",
    title: "",
    category: "delegate"
  });
  const [visibleCount, setVisibleCount] = useState(50);

  // CSV Import State
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvPreview, setCsvPreview] = useState<ManualInviteInput[]>([]);
  const [csvFileName, setCsvFileName] = useState("");
  const [csvImporting, setCsvImporting] = useState(false);

  useEffect(() => {
    setVisibleCount(50);
  }, [query, filter, categoryFilter]);

  const labels = isAr
    ? {
        add: "إضافة مدعو",
        addGuest: "إضافة مدعو جديد",
        editGuest: "تعديل بيانات المدعو",
        importCsv: "استيراد CSV",
        name: "الاسم الكامل",
        email: "البريد الإلكتروني",
        organization: "الجهة / المؤسسة",
        title: "الصفة / اللقب",
        category: "فئة المشارك",
        save: "حفظ",
        cancel: "إلغاء",
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
        created: "تمت إضافة المدعو بنجاح.",
        updated: "تم تعديل البيانات.",
        deleted: "تم حذف المدعو.",
        correction: "تصحيح الحضور",
        corrected: "تم تصحيح الحضور.",
        confirmed: "مؤكد",
        unconfirmed: "لم يؤكد",
        declined: "اعتذر عن الحضور",
        csvModalTitle: "استيراد المدعوين من ملف CSV",
        csvHelpText: "يدعم الحقول: Name, Email, Organization, Role / Category, Title",
        csvUploadBtn: "اختر ملف CSV",
        csvPreviewTitle: "معاينة البيانات المستوردة",
        csvConfirmBtn: "تأكيد واستيراد إلى قاعدة البيانات",
        csvSuccess: "تم استيراد المدعوين بنجاح!",
        catAll: "كافة الفئات",
        catDelegate: "مشارك",
        catVip: "VIP كبار الشخصيات",
        catSpeaker: "متحدث",
        catPress: "صحافة وإعلام",
        catOrganizer: "منظم"
      }
    : {
        add: "Add Guest",
        addGuest: "Add New Guest",
        editGuest: "Edit Guest",
        importCsv: "Import CSV",
        name: "Full Name",
        email: "Email Address",
        organization: "Organization / Entity",
        title: "Title / Rank",
        category: "Participant Category",
        save: "Save",
        cancel: "Cancel",
        restore: "Restore",
        restoreAll: "Restore Revoked",
        edit: "Edit",
        delete: "Delete",
        deleteReason: "Reason for deleting this guest",
        revokeReason: "Reason for revoking this invitation",
        restoreReason: "Reason for restoring this invitation",
        correctionReason: "Reason for correcting attendance",
        revokedNotice: "Invitation revoked.",
        restored: "Invitation restored.",
        restoredAll: "Revoked list restored.",
        created: "Guest added successfully.",
        updated: "Guest updated.",
        deleted: "Guest deleted.",
        correction: "Correct",
        corrected: "Attendance corrected.",
        confirmed: "Confirmed",
        unconfirmed: "No reply",
        declined: "Declined",
        csvModalTitle: "Import Attendees via CSV",
        csvHelpText: "Recognizes columns: Name, Email, Organization, Role / Category, Title",
        csvUploadBtn: "Select CSV File",
        csvPreviewTitle: "Import Preview",
        csvConfirmBtn: "Confirm & Ingest into Database",
        csvSuccess: "Attendees imported successfully!",
        catAll: "All Categories",
        catDelegate: "Delegate",
        catVip: "VIP",
        catSpeaker: "Speaker",
        catPress: "Press / Media",
        catOrganizer: "Organizer"
      };

  const categoryLabels: Record<ParticipantCategory, string> = {
    delegate: labels.catDelegate,
    vip: labels.catVip,
    speaker: labels.catSpeaker,
    press: labels.catPress,
    organizer: labels.catOrganizer
  };

  const confirmationTitle = (participant: Participant) =>
    participant.confirmationStatus === "confirmed"
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
      void client
        .lookup(query.trim())
        .then((matches) => {
          if (active) setCodeMatchIds(new Set(matches.map((participant) => participant.id)));
        })
        .catch(() => {
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
      const matchesFilter =
        filter === "all" ||
        (filter === "checked" && Boolean(participant.checkedInAt)) ||
        (filter === "waiting" && participant.status === "accepted" && !participant.checkedInAt) ||
        (filter === "revoked" && participant.status === "revoked");

      if (!matchesFilter) return false;

      const participantCat: ParticipantCategory = participant.category || "delegate";
      if (categoryFilter !== "all" && participantCat !== categoryFilter) {
        return false;
      }

      if (codeMatchIds.has(participant.id)) return true;
      if (!needle) return true;
      return matchesParticipantWithNeedle(participant, needle);
    });
  }, [codeMatchIds, filter, categoryFilter, participants, query]);

  const visibleParticipants = useMemo(() => {
    return filtered.slice(0, visibleCount);
  }, [filtered, visibleCount]);

  const resetForm = () => {
    setAdding(false);
    setEditingId(null);
    setManualInvite({ name: "", email: "", organization: "", title: "", category: "delegate" });
  };

  const beginAdd = () => {
    setAdding(true);
    setEditingId(null);
    setManualInvite({ name: "", email: "", organization: "", title: "", category: "delegate" });
  };

  const beginEdit = (participant: Participant) => {
    setAdding(false);
    setEditingId(participant.id);
    setManualInvite({
      name: participant.name,
      email: participant.email,
      organization: participant.organization || "",
      title: participant.title || "",
      category: participant.category || "delegate"
    });
  };

  const checkIn = async (participant: Participant) => {
    setBusyId(participant.id);
    setNotice(null);
    try {
      const result = await client.manualCheckIn(participant.id, createRequestId());
      setNotice(
        result.status === "success"
          ? `${t.success}: ${participant.name}`
          : result.status === "already"
            ? t.already
            : t.invalid
      );
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

  // CSV Handlers
  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (text) {
        const parsed = parseAttendeesCsv(text);
        setCsvPreview(parsed);
      }
    };
    reader.readAsText(file);
  };

  const commitCsvImport = async () => {
    if (!csvPreview.length) return;
    setCsvImporting(true);
    try {
      const count = await client.importParticipants(csvPreview);
      setNotice(`${labels.csvSuccess} (${count})`);
      setShowCsvModal(false);
      setCsvPreview([]);
      setCsvFileName("");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : t.failed);
    } finally {
      setCsvImporting(false);
    }
  };

  const filters: Array<{ id: Filter; label: string }> = [
    { id: "all", label: t.all },
    { id: "checked", label: t.checked },
    { id: "waiting", label: t.waiting },
    { id: "revoked", label: t.revokedFilter }
  ];

  const categoryFilterList: Array<{ id: CategoryFilter; label: string }> = [
    { id: "all", label: labels.catAll },
    { id: "vip", label: labels.catVip },
    { id: "speaker", label: labels.catSpeaker },
    { id: "delegate", label: labels.catDelegate },
    { id: "press", label: labels.catPress },
    { id: "organizer", label: labels.catOrganizer }
  ];

  const revokedCount = participants.filter((p) => p.status === "revoked" && !p.checkedInAt).length;

  return (
    <section className="people-page">
      <div className="page-heading page-heading--people">
        <div className="people-title-group">
          <h1>{t.people}</h1>
          <span className="people-count-pill">
            <UsersRound size={15} />
            <strong>{participants.filter((p) => p.status === "accepted").length}</strong>
            <span>{t.accepted}</span>
          </span>
        </div>
        <div className="people-heading-actions">
          <button className="primary-button" onClick={beginAdd}>
            <Plus size={17} />
            <span>{labels.add}</span>
          </button>
          <button className="secondary-button" onClick={() => setShowCsvModal(true)}>
            <UploadCloud size={17} />
            <span>{labels.importCsv}</span>
          </button>
          {revokedCount > 0 && (
            <button
              className="secondary-button"
              onClick={() => void restoreAllRevoked()}
              disabled={busyId === "restore-all"}
            >
              <RotateCcw size={17} />
              <span>{labels.restoreAll}</span>
            </button>
          )}
        </div>
      </div>

      {/* Manual Add / Edit Inline Panel */}
      {(adding || editingId) && (
        <form className="manual-invite-panel" onSubmit={(event) => void submitParticipant(event)}>
          <div className="manual-invite-header">
            <strong>{editingId ? labels.editGuest : labels.addGuest}</strong>
            <button type="button" className="close-btn" onClick={resetForm}>
              <X size={16} />
            </button>
          </div>
          <div className="manual-invite-grid">
            <input
              required
              value={manualInvite.name}
              onChange={(event) => setManualInvite({ ...manualInvite, name: event.target.value })}
              placeholder={labels.name}
            />
            <input
              required
              type="email"
              value={manualInvite.email}
              onChange={(event) => setManualInvite({ ...manualInvite, email: event.target.value })}
              placeholder={labels.email}
            />
            <input
              value={manualInvite.organization || ""}
              onChange={(event) => setManualInvite({ ...manualInvite, organization: event.target.value })}
              placeholder={labels.organization}
            />
            <input
              value={manualInvite.title || ""}
              onChange={(event) => setManualInvite({ ...manualInvite, title: event.target.value })}
              placeholder={labels.title}
            />
            <select
              value={manualInvite.category || "delegate"}
              onChange={(e) => setManualInvite({ ...manualInvite, category: e.target.value as ParticipantCategory })}
              className="category-select"
            >
              <option value="delegate">{labels.catDelegate}</option>
              <option value="vip">{labels.catVip}</option>
              <option value="speaker">{labels.catSpeaker}</option>
              <option value="press">{labels.catPress}</option>
              <option value="organizer">{labels.catOrganizer}</option>
            </select>
          </div>
          <div className="manual-invite-footer">
            <button
              type="submit"
              className="primary-button"
              disabled={busyId === "new" || Boolean(editingId && busyId === editingId)}
            >
              <Check size={17} />
              <span>{labels.save}</span>
            </button>
            <button type="button" className="secondary-button" onClick={resetForm}>
              {labels.cancel}
            </button>
          </div>
        </form>
      )}

      {/* CSV Import Modal */}
      {showCsvModal && (
        <div className="modal-backdrop" onClick={() => !csvImporting && setShowCsvModal(false)}>
          <div className="modal-card csv-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-row">
                <UploadCloud size={22} />
                <h2>{labels.csvModalTitle}</h2>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowCsvModal(false)}
                disabled={csvImporting}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <p className="csv-modal-hint">{labels.csvHelpText}</p>

              <label className="csv-dropzone">
                <input type="file" accept=".csv,text/csv" onChange={handleCsvFile} disabled={csvImporting} />
                <UploadCloud size={32} />
                <strong>{csvFileName || labels.csvUploadBtn}</strong>
                <span>{isAr ? "اضغط هنا لاختيار ملف .csv" : "Click to browse or drop .csv"}</span>
              </label>

              {csvPreview.length > 0 && (
                <div className="csv-preview-container">
                  <div className="csv-preview-header">
                    <strong>{labels.csvPreviewTitle}</strong>
                    <span className="count-chip">{csvPreview.length} {t.accepted}</span>
                  </div>
                  <div className="csv-table-wrapper">
                    <table className="csv-preview-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>{labels.name}</th>
                          <th>{labels.email}</th>
                          <th>{labels.category}</th>
                          <th>{labels.organization}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvPreview.slice(0, 5).map((row, idx) => (
                          <tr key={idx}>
                            <td>{idx + 1}</td>
                            <td><strong>{row.name}</strong></td>
                            <td>{row.email}</td>
                            <td>
                              <span className={`category-pill category-pill--${row.category || "delegate"}`}>
                                {categoryLabels[row.category || "delegate"]}
                              </span>
                            </td>
                            <td>{row.organization || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {csvPreview.length > 5 && (
                    <small className="csv-more-rows">
                      {isAr ? `... و ${csvPreview.length - 5} سجلات أخرى` : `... and ${csvPreview.length - 5} more rows`}
                    </small>
                  )}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="primary-button"
                disabled={csvPreview.length === 0 || csvImporting}
                onClick={commitCsvImport}
              >
                {csvImporting ? <RotateCcw className="spin" size={17} /> : <Check size={17} />}
                <span>{labels.csvConfirmBtn} ({csvPreview.length})</span>
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowCsvModal(false)}
                disabled={csvImporting}
              >
                {labels.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search Toolbar */}
      <div className="people-toolbar">
        <label className="search-box">
          <Search size={19} />
          <input
            aria-label={t.search}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.search}
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="Clear">
              ×
            </button>
          )}
        </label>

        {/* Status Filters */}
        <div className="filter-tabs">
          {filters.map((item) => (
            <button
              key={item.id}
              className={filter === item.id ? "active" : ""}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Category Pills Filter Bar */}
      <div className="category-filter-bar">
        <Tag size={14} />
        {categoryFilterList.map((item) => (
          <button
            key={item.id}
            className={`category-filter-chip ${categoryFilter === item.id ? "active" : ""}`}
            onClick={() => setCategoryFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {notice && (
        <div className="toast-notice" role="status">
          <ShieldCheck size={18} />
          {notice}
          <button onClick={() => setNotice(null)}>×</button>
        </div>
      )}

      {/* Participants List */}
      <div className="participants-list">
        {visibleParticipants.length ? (
          visibleParticipants.map((participant) => {
            const cat = participant.category || "delegate";
            return (
              <article className="participant-row" key={participant.id}>
                <div
                  className={`avatar ${
                    participant.checkedInAt
                      ? "is-checked"
                      : participant.status === "revoked"
                        ? "is-revoked"
                        : ""
                  }`}
                >
                  {participant.checkedInAt ? <Check size={20} /> : participant.name.trim().slice(0, 1)}
                </div>

                <div className="participant-main">
                  <div className="participant-heading">
                    <strong className="participant-name">{participant.name}</strong>

                    <span className={`category-pill category-pill--${cat}`}>
                      {categoryLabels[cat]}
                    </span>

                    <span
                      className={`rsvp-dot ${participant.confirmationStatus}`}
                      title={confirmationTitle(participant)}
                      aria-label={confirmationTitle(participant)}
                    >
                      {participant.confirmationStatus === "confirmed" ? (
                        <CheckCircle2 size={14} />
                      ) : participant.confirmationStatus === "declined" ? (
                        <XCircle size={14} />
                      ) : (
                        <CircleHelp size={14} />
                      )}
                    </span>

                    <span
                      className={`participant-state ${
                        participant.status === "revoked"
                          ? "revoked"
                          : participant.checkedInAt
                            ? "checked"
                            : "waiting"
                      }`}
                    >
                      {participant.status === "revoked" ? (
                        <Ban size={13} />
                      ) : participant.checkedInAt ? (
                        <UserCheck size={13} />
                      ) : (
                        <Clock3 size={13} />
                      )}
                      {participant.status === "revoked"
                        ? t.revokedFilter
                        : participant.checkedInAt
                          ? t.checked
                          : t.waiting}
                    </span>
                  </div>

                  <div className="participant-details">
                    <span>
                      <Mail size={13} />
                      {participant.email}
                    </span>
                    {participant.organization && (
                      <span className="participant-org">{participant.organization}</span>
                    )}
                    {participant.title && (
                      <span className="participant-role-title">({participant.title})</span>
                    )}
                  </div>

                  {participant.checkedInAt && (
                    <small className="participant-checkin-meta">
                      {formatEventTime(participant.checkedInAt, language)} · {participant.stationName}
                    </small>
                  )}
                </div>

                <div className="participant-actions">
                  {!participant.checkedInAt && (
                    <button
                      className="small-icon-button"
                      onClick={() => beginEdit(participant)}
                      disabled={busyId === participant.id}
                      title={labels.edit}
                      aria-label={labels.edit}
                    >
                      <Pencil size={17} />
                    </button>
                  )}
                  {participant.status === "accepted" && !participant.checkedInAt && (
                    <button
                      className="small-primary-button"
                      onClick={() => void checkIn(participant)}
                      disabled={busyId === participant.id}
                    >
                      <UserCheck size={16} />
                      <span>{t.manualCheckIn}</span>
                    </button>
                  )}
                  {participant.status === "accepted" && !participant.checkedInAt && (
                    <button
                      className="small-icon-button danger"
                      onClick={() => void revoke(participant)}
                      disabled={busyId === participant.id}
                      title={t.revoke}
                      aria-label={t.revoke}
                    >
                      <Ban size={17} />
                    </button>
                  )}
                  {participant.status === "accepted" && participant.checkedInAt && participant.checkInId && (
                    <button
                      className="small-primary-button"
                      onClick={() => void correctAttendance(participant)}
                      disabled={busyId === participant.id}
                    >
                      <RotateCcw size={15} />
                      <span>{labels.correction}</span>
                    </button>
                  )}
                  {participant.status === "revoked" && (
                    <button
                      className="small-primary-button"
                      onClick={() => void restore(participant)}
                      disabled={busyId === participant.id}
                    >
                      <RotateCcw size={15} />
                      <span>{labels.restore}</span>
                    </button>
                  )}
                  {!participant.checkedInAt && (
                    <button
                      className="small-icon-button danger"
                      onClick={() => void deleteParticipant(participant)}
                      disabled={busyId === participant.id}
                      title={labels.delete}
                      aria-label={labels.delete}
                    >
                      <Trash2 size={17} />
                    </button>
                  )}
                </div>
              </article>
            );
          })
        ) : (
          <div className="empty-state">
            <Search size={35} />
            <strong>{t.noResults}</strong>
          </div>
        )}

        {filtered.length > visibleCount && (
          <div className="pagination-panel" style={{ display: "flex", justifyContent: "center", padding: "16px" }}>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setVisibleCount((prev) => prev + 50)}
            >
              {isAr
                ? `عرض المزيد (${filtered.length - visibleCount} متبقٍ)`
                : `Load More (${filtered.length - visibleCount} remaining)`}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
