import { AlertTriangle, Building, Calendar, Check, Clock, Download, FileText, Image as ImageIcon, MapPin, Plus, RefreshCw, Save, Sparkles, Trash2, Upload, UploadCloud } from "lucide-react";
import { useState } from "react";
import { copy } from "../lib/i18n";
import { createInvitationPdfWindow, openInvitationPdf } from "../lib/invitationPdf";
import type { EventClient } from "../lib/api";
import type { EventRecord, Language, Participant } from "../types";

interface EventScreenProps {
  language: Language;
  event: EventRecord;
  participants: Participant[];
  client: EventClient;
  onEventChange: (event: EventRecord) => void;
  onNotice: (msg: string) => void;
}

export function EventScreen({ language, event, participants, client, onEventChange, onNotice }: EventScreenProps) {
  const t = copy[language];
  const isAr = language === "ar";

  // Form states initialized from active event
  const [titleAr, setTitleAr] = useState(event.title?.ar || "");
  const [titleEn, setTitleEn] = useState(event.title?.en || "");
  const [topicAr, setTopicAr] = useState(event.topic?.ar || "");
  const [topicEn, setTopicEn] = useState(event.topic?.en || "");
  const [subtitleAr, setSubtitleAr] = useState(event.subtitle?.ar || "");
  const [subtitleEn, setSubtitleEn] = useState(event.subtitle?.en || "");
  const [date, setDate] = useState(event.date || "");
  const [timeLabelAr, setTimeLabelAr] = useState(event.timeLabel?.ar || "");
  const [timeLabelEn, setTimeLabelEn] = useState(event.timeLabel?.en || "");
  const [venueAr, setVenueAr] = useState(event.venue?.ar || "");
  const [venueEn, setVenueEn] = useState(event.venue?.en || "");
  const [status, setStatus] = useState(event.status || "live");
  const [logoUrl, setLogoUrl] = useState(event.logoUrl || "");

  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [purging, setPurging] = useState(false);

  // New Event Modal State
  const [showNewModal, setShowNewModal] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState("");

  const labels = isAr
    ? {
        title: "إدارة الفعالية والهوية",
        subtitle: "تخصيص تفاصيل المؤتمر، الشعار، وقوالب بطاقات الدخول (Badges).",
        logoTitle: "شعار وهوية الفعالية",
        logoHelp: "ارفع صورة الشعار الرسمية لاستبدال الشعار الافتراضي في التطبيق وشاشة الترحيب.",
        uploadLogoBtn: "رفع شعار جديد",
        resetLogoBtn: "استعادة الشعار الافتراضي",
        eventDetailsTitle: "بيانات المؤتمر والمكان",
        titleAr: "عنوان الفعالية (بالعربية)",
        titleEn: "عنوان الفعالية (بالإنجليزية)",
        topicAr: "الموضوع الرئيسي (بالعربية)",
        topicEn: "الموضوع الرئيسي (بالإنجليزية)",
        subtitleAr: "الوصف الفرعي (بالعربية)",
        subtitleEn: "الوصف الفرعي (بالإنجليزية)",
        date: "تاريخ الفعالية",
        timeAr: "التوقيت (بالعربية)",
        timeEn: "التوقيت (بالإنجليزية)",
        venueAr: "المقر والقاعة (بالعربية)",
        venueEn: "المقر والقاعة (بالإنجليزية)",
        status: "حالة الفعالية",
        saveBtn: "حفظ تفاصيل الفعالية",
        saved: "تم حفظ التعديلات بنجاح!",
        badgeTitle: "بطاقات الدعوة وشارات الحضور (PDF Badges)",
        badgeHelp: "توليد وتحميل بطاقات الدخول الرسمية مع رمز QR مشفر لجميع المشاركين.",
        exportAllPdf: "تحميل كافة بطاقات المشاركين (PDF)",
        purgeTitle: "إعادة ضبط ومسح قاعدة البيانات",
        purgeHelp: "حذف جميع بيانات الدخول وسجلات الحضور لبدء فعالية جديدة كلياً بنقاء 100%.",
        purgeBtn: "مسح قاعدة البيانات وتصفير السجلات",
        purgeConfirm: "هل أنت متأكد من مسح جميع سجلات الحضور؟ لا يمكن التراجع عن هذا الإجراء.",
        confirmYes: "نعم، احذف كافة البيانات",
        confirmCancel: "إلغاء",
        purgedNotice: "تم مسح بيانات قاعدة البيانات بالكامل.",
        newEvent: "+ إضافة فعالية جديدة"
      }
    : {
        title: "Event & Identity Management",
        subtitle: "Configure conference metadata, custom logo, and attendee credentials.",
        logoTitle: "Event Logo & Branding",
        logoHelp: "Upload an official vector/image logo to replace the default branding across app and Welcome Board.",
        uploadLogoBtn: "Upload New Logo",
        resetLogoBtn: "Reset to Default",
        eventDetailsTitle: "Event Details & Venue",
        titleAr: "Event Title (Arabic)",
        titleEn: "Event Title (English)",
        topicAr: "Topic / Theme (Arabic)",
        topicEn: "Topic / Theme (English)",
        subtitleAr: "Subtitle (Arabic)",
        subtitleEn: "Subtitle (English)",
        date: "Event Date",
        timeAr: "Time Label (Arabic)",
        timeEn: "Time Label (English)",
        venueAr: "Venue & Hall (Arabic)",
        venueEn: "Venue & Hall (English)",
        status: "Event Status",
        saveBtn: "Save Event Details",
        saved: "Event details saved successfully!",
        badgeTitle: "Attendee Badges & PDF Credentials",
        badgeHelp: "Generate and download official entrance passes with encrypted QR codes for all participants.",
        exportAllPdf: "Export All Attendee Badges (PDF)",
        purgeTitle: "Purge Database & Reset",
        purgeHelp: "Permanently delete attendance and participant records to prepare GateFlow for a fresh event.",
        purgeBtn: "Purge All Event Data",
        purgeConfirm: "Are you sure you want to purge the database? This action cannot be undone.",
        confirmYes: "Yes, Purge Database",
        confirmCancel: "Cancel",
        purgedNotice: "Database successfully purged.",
        newEvent: "+ Add New Event"
      };

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (eventResult) => {
      const dataUrl = eventResult.target?.result as string;
      if (dataUrl) {
        setLogoUrl(dataUrl);
        localStorage.setItem("gateflow-custom-logo", dataUrl);
        onNotice(isAr ? "تم تحديث الشعار بنجاح!" : "Logo updated successfully!");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleResetLogo = () => {
    setLogoUrl("");
    localStorage.removeItem("gateflow-custom-logo");
    onNotice(isAr ? "تمت استعادة الشعار الافتراضي." : "Default logo restored.");
  };

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);

    const updatedEvent: EventRecord = {
      ...event,
      title: { ar: titleAr.trim() || event.title.ar, en: titleEn.trim() || event.title.en },
      topic: { ar: topicAr.trim(), en: topicEn.trim() },
      subtitle: { ar: subtitleAr.trim(), en: subtitleEn.trim() },
      date: date.trim() || event.date,
      timeLabel: { ar: timeLabelAr.trim(), en: timeLabelEn.trim() },
      venue: { ar: venueAr.trim(), en: venueEn.trim() },
      status,
      logoUrl: logoUrl || undefined
    };

    try {
      await client.updateEventDetails(updatedEvent);
      onEventChange(updatedEvent);
      setSavedSuccess(true);
      onNotice(labels.saved);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch {
      onNotice(isAr ? "حدث خطأ أثناء الحفظ." : "Failed to save event details.");
    } finally {
      setSaving(false);
    }
  };

  const handleExportAllPdf = async () => {
    if (participants.length === 0) {
      onNotice(isAr ? "لا يوجد مشاركون لتحميل شاراتهم." : "No participants available to export badges.");
      return;
    }
    setPdfBusy(true);
    let popup: Window | null = null;
    try {
      popup = createInvitationPdfWindow(language);
      const entries = await Promise.all(
        participants.slice(0, 100).map(async (p) => {
          const asset = await client.getInvitationAsset(p);
          return { participant: p, asset };
        })
      );
      openInvitationPdf(entries, language, popup);
      onNotice(isAr ? "تم تجهيز ملف الشارات بنجاح." : "Badges document ready for print.");
    } catch {
      if (popup) popup.close();
      onNotice(isAr ? "تعذر فتح نافذة الطباعة." : "Pop-up blocked or failed to render badges.");
    } finally {
      setPdfBusy(false);
    }
  };

  const handlePurge = async () => {
    setPurging(true);
    try {
      await client.purgeDatabase();
      setConfirmPurge(false);
      onNotice(labels.purgedNotice);
    } catch {
      onNotice(isAr ? "فشل مسح البيانات." : "Failed to purge database.");
    } finally {
      setPurging(false);
    }
  };

  return (
    <section className="event-screen-root" dir={isAr ? "rtl" : "ltr"}>
      {/* Top Banner */}
      <div className="event-screen-header">
        <div>
          <h1 className="event-page-title">{labels.title}</h1>
          <p className="event-page-subtitle">{labels.subtitle}</p>
        </div>
      </div>

      <div className="event-cards-grid">
        {/* Card 1: Logo & Visual Branding */}
        <article className="event-config-card logo-card">
          <div className="card-header-row">
            <ImageIcon size={20} className="text-brand" />
            <div>
              <h2>{labels.logoTitle}</h2>
              <p>{labels.logoHelp}</p>
            </div>
          </div>

          <div className="logo-preview-box">
            <div className="logo-display-stage">
              {logoUrl ? (
                <img src={logoUrl} alt="Event Custom Logo" className="preview-event-logo" />
              ) : (
                <div className="default-logo-tag">
                  <Sparkles size={24} className="text-gold" />
                  <strong>GateFlow Default Logo Active</strong>
                  <small>INAS / Custom Event Emblem</small>
                </div>
              )}
            </div>

            <div className="logo-action-buttons">
              <label className="upload-logo-label-btn">
                <Upload size={16} />
                <span>{labels.uploadLogoBtn}</span>
                <input type="file" accept="image/*" onChange={handleLogoFileChange} className="visually-hidden" />
              </label>

              {logoUrl && (
                <button type="button" onClick={handleResetLogo} className="reset-logo-btn">
                  <RefreshCw size={15} />
                  <span>{labels.resetLogoBtn}</span>
                </button>
              )}
            </div>
          </div>
        </article>

        {/* Card 2: Badges & PDF Credentials (Moved from Attendees tab) */}
        <article className="event-config-card badges-card">
          <div className="card-header-row">
            <FileText size={20} className="text-gold" />
            <div>
              <h2>{labels.badgeTitle}</h2>
              <p>{labels.badgeHelp}</p>
            </div>
          </div>

          <div className="badges-info-banner">
            <div className="badge-stat">
              <strong>{participants.length}</strong>
              <span>{isAr ? "مشارك مسجل" : "Registered Attendees"}</span>
            </div>
            <button
              type="button"
              className="export-badges-btn"
              onClick={handleExportAllPdf}
              disabled={pdfBusy || participants.length === 0}
            >
              <Download size={18} />
              <span>{pdfBusy ? t.loading : labels.exportAllPdf}</span>
            </button>
          </div>
        </article>

        {/* Card 3: Event Metadata & Scheduling Form */}
        <article className="event-config-card details-card">
          <div className="card-header-row">
            <Calendar size={20} className="text-brand" />
            <div>
              <h2>{labels.eventDetailsTitle}</h2>
              <p>{isAr ? "البيانات المعروضة على شاشات الاستقبال والترحيب وتذاكر الدخول." : "Information projected onto Welcome Boards and attendee tickets."}</p>
            </div>
          </div>

          <form onSubmit={handleSaveDetails} className="event-details-form">
            <div className="form-two-cols">
              <label className="event-field">
                <span>{labels.titleAr}</span>
                <input value={titleAr} onChange={(e) => setTitleAr(e.target.value)} required />
              </label>
              <label className="event-field" dir="ltr">
                <span>{labels.titleEn}</span>
                <input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} required />
              </label>
            </div>

            <div className="form-two-cols">
              <label className="event-field">
                <span>{labels.topicAr}</span>
                <input value={topicAr} onChange={(e) => setTopicAr(e.target.value)} />
              </label>
              <label className="event-field" dir="ltr">
                <span>{labels.topicEn}</span>
                <input value={topicEn} onChange={(e) => setTopicEn(e.target.value)} />
              </label>
            </div>

            <div className="form-two-cols">
              <label className="event-field">
                <span>{labels.subtitleAr}</span>
                <input value={subtitleAr} onChange={(e) => setSubtitleAr(e.target.value)} />
              </label>
              <label className="event-field" dir="ltr">
                <span>{labels.subtitleEn}</span>
                <input value={subtitleEn} onChange={(e) => setSubtitleEn(e.target.value)} />
              </label>
            </div>

            <div className="form-three-cols">
              <label className="event-field">
                <span>{labels.date}</span>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label className="event-field">
                <span>{labels.timeAr}</span>
                <input value={timeLabelAr} onChange={(e) => setTimeLabelAr(e.target.value)} placeholder="09:00 صباحاً" />
              </label>
              <label className="event-field" dir="ltr">
                <span>{labels.timeEn}</span>
                <input value={timeLabelEn} onChange={(e) => setTimeLabelEn(e.target.value)} placeholder="09:00 AM" />
              </label>
            </div>

            <div className="form-two-cols">
              <label className="event-field">
                <span>{labels.venueAr}</span>
                <input value={venueAr} onChange={(e) => setVenueAr(e.target.value)} />
              </label>
              <label className="event-field" dir="ltr">
                <span>{labels.venueEn}</span>
                <input value={venueEn} onChange={(e) => setVenueEn(e.target.value)} />
              </label>
            </div>

            <div className="form-status-row">
              <label className="event-field">
                <span>{labels.status}</span>
                <select value={status} onChange={(e) => setStatus(e.target.value as any)}>
                  <option value="live">{t.live} (Live Check-in Open)</option>
                  <option value="draft">{t.draft} (Draft Setup)</option>
                  <option value="closed">{t.closed} (Event Closed)</option>
                </select>
              </label>

              <button type="submit" className="save-event-submit-btn" disabled={saving}>
                {saving ? <RefreshCw className="spin" size={17} /> : <Save size={17} />}
                <span>{savedSuccess ? labels.saved : labels.saveBtn}</span>
              </button>
            </div>
          </form>
        </article>

        {/* Card 4: Database Maintenance & Purge */}
        <article className="event-config-card purge-card">
          <div className="card-header-row text-danger">
            <AlertTriangle size={20} />
            <div>
              <h2>{labels.purgeTitle}</h2>
              <p>{labels.purgeHelp}</p>
            </div>
          </div>

          <div className="purge-action-box">
            <p className="purge-warning-text">
              {isAr
                ? "سيؤدي هذا الإجراء إلى تصفير كافة أرقام الحضور، وحذف سجلات الوصول، مما يتيح إعادة استخدام النظام فورياً لفعالية أخرى بدون أي بيانات سابقة."
                : "This action will reset all check-in counts and purge attendee logs, allowing immediate clean reuse for any future event."}
            </p>

            {!confirmPurge ? (
              <button
                type="button"
                className="purge-trigger-btn"
                onClick={() => setConfirmPurge(true)}
              >
                <Trash2 size={16} />
                <span>{labels.purgeBtn}</span>
              </button>
            ) : (
              <div className="purge-confirm-dialog">
                <span>{labels.purgeConfirm}</span>
                <div className="dialog-btns">
                  <button
                    type="button"
                    className="purge-confirm-btn"
                    onClick={handlePurge}
                    disabled={purging}
                  >
                    {purging ? <RefreshCw className="spin" size={15} /> : <Trash2 size={15} />}
                    <span>{labels.confirmYes}</span>
                  </button>
                  <button
                    type="button"
                    className="purge-cancel-btn"
                    onClick={() => setConfirmPurge(false)}
                    disabled={purging}
                  >
                    <span>{labels.confirmCancel}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
