import {
  AlertOctagon,
  Building2,
  Calendar,
  Check,
  Clock,
  Compass,
  Globe,
  Image as ImageIcon,
  MapPin,
  RefreshCw,
  Save,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload
} from "lucide-react";
import { useState } from "react";
import { copy } from "../lib/i18n";
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

export function EventScreen({
  language,
  event,
  participants,
  client,
  onEventChange,
  onNotice
}: EventScreenProps) {
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
  const [status, setStatus] = useState<"draft" | "live" | "closed">(event.status || "live");
  const [logoUrl, setLogoUrl] = useState(event.logoUrl || "");

  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [purging, setPurging] = useState(false);

  const labels = isAr
    ? {
        screenTitle: "إدارة الفعالية والمقر",
        screenSubtitle: "التحكم في بيانات المؤتمر الرسمية، الهوية البصرية، وحالة الاستقبال الميداني.",
        statusLive: "مباشر · الاستقبال مفتوح",
        statusDraft: "مسودة · قيد التحضير",
        statusClosed: "مغلق · انتهت الفعالية",
        metaRoster: "المشاركون المسجلون:",
        metaEventId: "معرّف الحدث:",
        brandingSection: "الهوية البصرية والشعار",
        brandingDesc: "ارفع الشعار الرسمي للفعالية؛ سيتم تطبيقه فورياً في ترويسة التطبيق وشاشة الترحيب العامة.",
        uploadLogoBtn: "رفع شعار جديد",
        resetLogoBtn: "استعادة الشعار الافتراضي",
        logoStageCaption: "المعاينة في المنصة وشاشة الاستقبال",
        defaultLogoNote: "شعار GateFlow الافتراضي نشط",
        detailsSection: "السجل التعريفي والموقع الرسمي",
        detailsDesc: "البيانات الأساسية التي تظهر في شاشات الاستقبال والترحيب وسجلات المندوبين.",
        titleAr: "عنوان الفعالية",
        titleEn: "عنوان الفعالية بالإنجليزية",
        topicAr: "الموضوع أو المحور",
        topicEn: "الموضوع بالإنجليزية",
        subtitleAr: "الوصف الفرعي أو الطبعة",
        subtitleEn: "الوصف الفرعي بالإنجليزية",
        date: "تاريخ الانعقاد",
        timeAr: "التوقيت المحلي",
        timeEn: "التوقيت بالإنجليزية",
        venueAr: "المقر والقاعة",
        venueEn: "المقر بالإنجليزية",
        statusLabel: "حالة استقبال البوابات",
        saveBtn: "حفظ التعديلات الرسمية",
        saved: "تم حفظ التعديلات بنجاح!",
        purgeSection: "المنطقة الحرجة · تصفير وإعادة تهيئة النظام",
        purgeDesc: "يمسح كافة سجلات الحضور وقوائم المدعوين الحالية لتجهيز المنصة لفعالية جديدة بنقاء تام.",
        purgeBtn: "تصفير قاعدة البيانات لبدء حدث جديد",
        purgeConfirmPrompt: "تحذير: سيتم حذف جميع بيانات الحضور والمدعوين نهائياً. هل أنت متأكد؟",
        confirmPurgeBtn: "نعم، تأكيد التصفير الشامل",
        cancelPurgeBtn: "إلغاء التراجع",
        purgedNotice: "تم تصفير قاعدة البيانات بنجاح، النظام جاهز لفعالية جديدة."
      }
    : {
        screenTitle: "Event Directorate & Venue",
        screenSubtitle: "Master configuration for conference metadata, visual crest, and active gate operations.",
        statusLive: "Live · Gates Open",
        statusDraft: "Draft · In Preparation",
        statusClosed: "Closed · Event Concluded",
        metaRoster: "Registered Roster:",
        metaEventId: "Event Identifier:",
        brandingSection: "Visual Identity & Emblem",
        brandingDesc: "Upload the official event emblem; dynamically deployed across staff consoles and the Public Welcome Board.",
        uploadLogoBtn: "Upload New Crest",
        resetLogoBtn: "Reset to Default",
        logoStageCaption: "Emblem projection across welcome screens",
        defaultLogoNote: "Default GateFlow Emblem Active",
        detailsSection: "Conference Nomenclature & Venue",
        detailsDesc: "Authoritative event records rendered on reception displays and delegate dossiers.",
        titleAr: "Event Title (Arabic)",
        titleEn: "Event Title (English)",
        topicAr: "Theme / Topic (Arabic)",
        topicEn: "Theme / Topic (English)",
        subtitleAr: "Edition / Subtitle (Arabic)",
        subtitleEn: "Edition / Subtitle (English)",
        date: "Convening Date",
        timeAr: "Local Time (Arabic)",
        timeEn: "Local Time (English)",
        venueAr: "Venue & Hall (Arabic)",
        venueEn: "Venue & Hall (English)",
        statusLabel: "Gate Operating Status",
        saveBtn: "Commit Configuration",
        saved: "Configuration committed successfully!",
        purgeSection: "Critical Maintenance · Fresh Slate Reset",
        purgeDesc: "Permanently purges attendee check-ins and roster entries to prepare GateFlow for a fresh event.",
        purgeBtn: "Zero Out Database for New Event",
        purgeConfirmPrompt: "Caution: This will permanently erase all delegate check-in logs. Are you certain?",
        confirmPurgeBtn: "Yes, Execute Full Wipe",
        cancelPurgeBtn: "Cancel",
        purgedNotice: "Database successfully zeroed out. Ready for new conference."
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
        onNotice(isAr ? "تم تحديث الشعار الرسمي بنجاح." : "Emblem updated successfully.");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleResetLogo = () => {
    setLogoUrl("");
    localStorage.removeItem("gateflow-custom-logo");
    onNotice(isAr ? "تمت استعادة الشعار الافتراضي للمنظومة." : "Default emblem restored.");
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
      setTimeout(() => setSavedSuccess(false), 3500);
    } catch {
      onNotice(isAr ? "تعذر حفظ تعديلات الفعالية." : "Failed to persist event configuration.");
    } finally {
      setSaving(false);
    }
  };

  const handlePurge = async () => {
    setPurging(true);
    try {
      await client.purgeDatabase();
      setConfirmPurge(false);
      onNotice(labels.purgedNotice);
    } catch {
      onNotice(isAr ? "فشل مسح وتصفير قاعدة البيانات." : "Failed to zero out database.");
    } finally {
      setPurging(false);
    }
  };

  return (
    <section className="event-directorate-root" dir={isAr ? "rtl" : "ltr"}>
      {/* Top Directorate Hero Bar */}
      <header className="directorate-hero-bar">
        <div className="hero-text-block">
          <div className="hero-kicker-row">
            <span className={`status-beacon status-beacon--${status}`}>
              <span className="beacon-pulse" />
              <span className="beacon-label">
                {status === "live" ? labels.statusLive : status === "draft" ? labels.statusDraft : labels.statusClosed}
              </span>
            </span>
            <span className="hero-meta-chip">
              <Compass size={13} />
              <span>{labels.metaEventId} <code>{event.id}</code></span>
            </span>
            <span className="hero-meta-chip">
              <Globe size={13} />
              <span>{labels.metaRoster} <strong>{participants.length}</strong></span>
            </span>
          </div>

          <h1 className="directorate-main-title">{labels.screenTitle}</h1>
          <p className="directorate-main-subtitle">{labels.screenSubtitle}</p>
        </div>
      </header>

      {/* Main Configuration Grid */}
      <div className="directorate-flow-grid">
        {/* Module 1: Emblem & Brand Stage */}
        <article className="directorate-module emblem-module">
          <div className="module-title-strip">
            <div className="module-icon-box">
              <ImageIcon size={18} />
            </div>
            <div>
              <h2 className="module-heading">{labels.brandingSection}</h2>
              <p className="module-subheading">{labels.brandingDesc}</p>
            </div>
          </div>

          <div className="emblem-curation-zone">
            <div className="emblem-stage-frame">
              <span className="frame-corner top-left" />
              <span className="frame-corner top-right" />
              <span className="frame-corner bottom-left" />
              <span className="frame-corner bottom-right" />

              {logoUrl ? (
                <div className="emblem-rendered-stage">
                  <img src={logoUrl} alt="Official Event Crest" className="emblem-img-preview" />
                  <span className="emblem-verified-badge">
                    <Check size={12} /> Custom Crest Active
                  </span>
                </div>
              ) : (
                <div className="emblem-fallback-stage">
                  <div className="fallback-crest-icon">
                    <Sparkles size={28} />
                  </div>
                  <strong className="fallback-title">{labels.defaultLogoNote}</strong>
                  <span className="fallback-hint">SVG / PNG / WebP · Max 4MB</span>
                </div>
              )}
            </div>

            <div className="emblem-actions-strip">
              <label className="emblem-upload-trigger">
                <Upload size={15} />
                <span>{labels.uploadLogoBtn}</span>
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/svg+xml, image/webp"
                  onChange={handleLogoFileChange}
                  className="visually-hidden"
                />
              </label>

              {logoUrl && (
                <button type="button" onClick={handleResetLogo} className="emblem-reset-trigger">
                  <RefreshCw size={14} />
                  <span>{labels.resetLogoBtn}</span>
                </button>
              )}
            </div>
          </div>
        </article>

        {/* Module 2: Conference Ledger Form */}
        <article className="directorate-module ledger-module">
          <div className="module-title-strip">
            <div className="module-icon-box text-accent">
              <Building2 size={18} />
            </div>
            <div>
              <h2 className="module-heading">{labels.detailsSection}</h2>
              <p className="module-subheading">{labels.detailsDesc}</p>
            </div>
          </div>

          <form onSubmit={handleSaveDetails} className="ledger-form">
            {/* Title Pair */}
            <div className="form-bilingual-row">
              <div className="field-group">
                <div className="field-label-row">
                  <span className="field-label">{labels.titleAr}</span>
                  <span className="field-lang-tag">AR</span>
                </div>
                <input
                  className="editorial-input"
                  value={titleAr}
                  onChange={(e) => setTitleAr(e.target.value)}
                  placeholder="مثال: الملتقى السنوي للجودة والابتكار 2026"
                  required
                />
              </div>

              <div className="field-group" dir="ltr">
                <div className="field-label-row">
                  <span className="field-label">{labels.titleEn}</span>
                  <span className="field-lang-tag">EN</span>
                </div>
                <input
                  className="editorial-input"
                  value={titleEn}
                  onChange={(e) => setTitleEn(e.target.value)}
                  placeholder="e.g. Annual Quality & Innovation Summit 2026"
                  required
                />
              </div>
            </div>

            {/* Topic Pair */}
            <div className="form-bilingual-row">
              <div className="field-group">
                <div className="field-label-row">
                  <span className="field-label">{labels.topicAr}</span>
                  <span className="field-lang-tag">AR</span>
                </div>
                <input
                  className="editorial-input"
                  value={topicAr}
                  onChange={(e) => setTopicAr(e.target.value)}
                  placeholder="المحور أو الشعار الأساسي"
                />
              </div>

              <div className="field-group" dir="ltr">
                <div className="field-label-row">
                  <span className="field-label">{labels.topicEn}</span>
                  <span className="field-lang-tag">EN</span>
                </div>
                <input
                  className="editorial-input"
                  value={topicEn}
                  onChange={(e) => setTopicEn(e.target.value)}
                  placeholder="Key Topic or Strategic Theme"
                />
              </div>
            </div>

            {/* Subtitle / Edition Pair */}
            <div className="form-bilingual-row">
              <div className="field-group">
                <div className="field-label-row">
                  <span className="field-label">{labels.subtitleAr}</span>
                  <span className="field-lang-tag">AR</span>
                </div>
                <input
                  className="editorial-input"
                  value={subtitleAr}
                  onChange={(e) => setSubtitleAr(e.target.value)}
                  placeholder="الطبعة أو الوصف الميداني"
                />
              </div>

              <div className="field-group" dir="ltr">
                <div className="field-label-row">
                  <span className="field-label">{labels.subtitleEn}</span>
                  <span className="field-lang-tag">EN</span>
                </div>
                <input
                  className="editorial-input"
                  value={subtitleEn}
                  onChange={(e) => setSubtitleEn(e.target.value)}
                  placeholder="Edition or Secondary Moniker"
                />
              </div>
            </div>

            {/* Logistics Trio: Date / Time / Venue */}
            <div className="form-trio-row">
              <div className="field-group">
                <div className="field-label-row">
                  <Calendar size={13} />
                  <span className="field-label">{labels.date}</span>
                </div>
                <input
                  type="date"
                  className="editorial-input"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>

              <div className="field-group">
                <div className="field-label-row">
                  <Clock size={13} />
                  <span className="field-label">{labels.timeAr}</span>
                </div>
                <input
                  className="editorial-input"
                  value={timeLabelAr}
                  onChange={(e) => setTimeLabelAr(e.target.value)}
                  placeholder="09:00 صباحاً"
                />
              </div>

              <div className="field-group" dir="ltr">
                <div className="field-label-row">
                  <Clock size={13} />
                  <span className="field-label">{labels.timeEn}</span>
                </div>
                <input
                  className="editorial-input"
                  value={timeLabelEn}
                  onChange={(e) => setTimeLabelEn(e.target.value)}
                  placeholder="09:00 AM"
                />
              </div>
            </div>

            {/* Venue Pair */}
            <div className="form-bilingual-row">
              <div className="field-group">
                <div className="field-label-row">
                  <MapPin size={13} />
                  <span className="field-label">{labels.venueAr}</span>
                </div>
                <input
                  className="editorial-input"
                  value={venueAr}
                  onChange={(e) => setVenueAr(e.target.value)}
                  placeholder="قصر المؤتمرات - القاعة الملكية"
                />
              </div>

              <div className="field-group" dir="ltr">
                <div className="field-label-row">
                  <MapPin size={13} />
                  <span className="field-label">{labels.venueEn}</span>
                </div>
                <input
                  className="editorial-input"
                  value={venueEn}
                  onChange={(e) => setVenueEn(e.target.value)}
                  placeholder="Convention Palace - Main Hall"
                />
              </div>
            </div>

            {/* Operating Status and Commit Bar */}
            <div className="ledger-footer-bar">
              <div className="status-selector-wrap">
                <span className="status-select-label">{labels.statusLabel}:</span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as "draft" | "live" | "closed")}
                  className="status-dropdown"
                >
                  <option value="live">{labels.statusLive}</option>
                  <option value="draft">{labels.statusDraft}</option>
                  <option value="closed">{labels.statusClosed}</option>
                </select>
              </div>

              <button type="submit" className="commit-changes-btn" disabled={saving}>
                {saving ? (
                  <RefreshCw className="spin" size={16} />
                ) : savedSuccess ? (
                  <Check size={16} />
                ) : (
                  <Save size={16} />
                )}
                <span>{savedSuccess ? labels.saved : labels.saveBtn}</span>
              </button>
            </div>
          </form>
        </article>

        {/* Module 3: Critical Maintenance & Clean Slate Zone */}
        <article className="directorate-module purge-zone-module">
          <div className="purge-strip-content">
            <div className="purge-alert-mark">
              <AlertOctagon size={24} />
            </div>
            <div className="purge-copy">
              <h3 className="purge-title">{labels.purgeSection}</h3>
              <p className="purge-desc">{labels.purgeDesc}</p>
            </div>

            {!confirmPurge ? (
              <button
                type="button"
                className="purge-arm-btn"
                onClick={() => setConfirmPurge(true)}
              >
                <Trash2 size={15} />
                <span>{labels.purgeBtn}</span>
              </button>
            ) : (
              <div className="purge-active-challenge">
                <p className="challenge-warning">{labels.purgeConfirmPrompt}</p>
                <div className="challenge-actions">
                  <button
                    type="button"
                    className="challenge-commit-btn"
                    onClick={handlePurge}
                    disabled={purging}
                  >
                    {purging ? <RefreshCw className="spin" size={15} /> : <ShieldAlert size={15} />}
                    <span>{labels.confirmPurgeBtn}</span>
                  </button>
                  <button
                    type="button"
                    className="challenge-abort-btn"
                    onClick={() => setConfirmPurge(false)}
                    disabled={purging}
                  >
                    <span>{labels.cancelPurgeBtn}</span>
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
