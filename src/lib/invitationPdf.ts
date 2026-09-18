import { INAS_LOGO_DATA_URI } from "../assets/inasLogo";
import { eventSchedule } from "../data/schedule";
import type { InvitationAsset, Language, Participant } from "../types";

const MAP_URL = "https://maps.app.goo.gl/qs6Hn6du4ZCHecKq8";

interface PdfEntry {
  participant: Participant;
  asset: InvitationAsset;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeDataUri(value: string): string {
  if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) {
    return value;
  }
  return "";
}

function fileSafeName(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").slice(0, 70) || "guest";
}

function labels(language: Language) {
  if (language === "en") {
    return {
      dir: "ltr",
      badge: "Personal invitation",
      guest: "Guest",
      date: "Saturday, 25 July 2026",
      time: "09:00 - 16:00",
      venue: "HIS, Bordj El Kiffan, Algiers",
      location: "Open location",
      qr: "Entry QR",
      code: "Manual code",
      privacy: "Personal ticket. Do not share.",
      program: "Program",
      print: "Save as PDF",
      close: "Close",
      loading: "Preparing PDF..."
    };
  }
  return {
    dir: "rtl",
    badge: "دعوة شخصية",
    guest: "الضيف",
    date: "السبت 25 جويلية 2026",
    time: "09:00 - 16:00",
    venue: "HIS، برج الكيفان، الجزائر العاصمة",
    location: "فتح الموقع",
    qr: "رمز الدخول",
    code: "الرمز اليدوي",
    privacy: "بطاقة شخصية. لا تشاركها.",
    program: "البرنامج",
    print: "حفظ PDF",
    close: "إغلاق",
    loading: "جاري تجهيز PDF..."
  };
}

function scheduleRows(language: Language): string {
  return eventSchedule.map((item) => {
    const title = language === "ar" ? item.titleAr : item.titleEn;
    const rows = language === "ar" ? item.itemsAr : item.itemsEn;
    return `
      <article class="program-row">
        <time dir="ltr">${escapeHtml(item.time)}</time>
        <div>
          <h3>${escapeHtml(title)}</h3>
          ${rows.length ? `<ul>${rows.map((row) => `<li>${escapeHtml(row)}</li>`).join("")}</ul>` : ""}
        </div>
      </article>
    `;
  }).join("");
}

function invitePage(entry: PdfEntry, language: Language): string {
  const t = labels(language);
  const participant = entry.participant;
  return `
    <section class="pdf-page" dir="${t.dir}">
      <div class="top-band"></div>

      <header class="page-header">
        <img src="${INAS_LOGO_DATA_URI}" alt="INAS" />
        <span>${t.badge}</span>
      </header>

      <section class="guest-card">
        <p>${t.guest}</p>
        <h1>${escapeHtml(participant.name)}</h1>
        ${participant.organization ? `<strong>${escapeHtml(participant.organization)}</strong>` : ""}
      </section>

      <section class="quick-info">
        <div><small>${language === "ar" ? "الموعد" : "Date"}</small><b>${t.date}</b></div>
        <div><small>${language === "ar" ? "الوقت" : "Time"}</small><b dir="ltr">${t.time}</b></div>
        <div><small>${language === "ar" ? "المكان" : "Venue"}</small><b>${t.venue}</b></div>
      </section>

      <section class="ticket-block">
        <div class="qr-box">
          <img src="${escapeHtml(safeDataUri(entry.asset.qrDataUrl))}" alt="${t.qr}" />
          <span>${t.qr}</span>
        </div>
        <div class="ticket-text">
          <small>${t.code}</small>
          <strong dir="ltr">${escapeHtml(entry.asset.manualCode)}</strong>
          <p>${t.privacy}</p>
          <a href="${MAP_URL}" target="_blank" rel="noreferrer">${t.location}</a>
        </div>
      </section>

      <section class="program-card">
        <h2>${t.program}</h2>
        <div class="program-list">
          ${scheduleRows(language)}
        </div>
      </section>

      <footer>communication@inas-dz.org · www.inasnetwork.org</footer>
    </section>
  `;
}

export function createInvitationPdfWindow(language: Language): Window {
  const t = labels(language);
  const popup = window.open("about:blank", "_blank");
  if (!popup) throw new Error("popup-blocked");
  popup.document.write(`<!doctype html>
<html lang="${language}" dir="${t.dir}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>INAS PDF</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      color: #073f3e;
      background: #eef4f2;
      font-family: Tahoma, "Segoe UI", Arial, sans-serif;
      font-weight: 800;
    }
  </style>
</head>
<body>${t.loading}</body>
</html>`);
  popup.document.close();
  return popup;
}

export function openInvitationPdf(entries: PdfEntry[], language: Language, targetWindow?: Window): void {
  if (!entries.length) return;
  const t = labels(language);
  const title = entries.length === 1
    ? `INAS-${fileSafeName(entries[0].participant.name)}`
    : "INAS-invitations";
  const popup = targetWindow || window.open("", "_blank");
  if (!popup) throw new Error("popup-blocked");
  popup.document.write(`<!doctype html>
<html lang="${language}" dir="${t.dir}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; }
    body {
      color: #0c3033;
      background: #eef4f2;
      font-family: Tahoma, "Segoe UI", Arial, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .print-toolbar {
      position: sticky;
      top: 0;
      z-index: 20;
      padding: 10px;
      display: flex;
      justify-content: center;
      gap: 8px;
      background: rgba(238, 244, 242, 0.96);
      border-bottom: 1px solid #dce7e3;
    }
    .print-toolbar button {
      min-height: 40px;
      padding: 0 18px;
      border: 0;
      border-radius: 10px;
      color: white;
      background: #074643;
      font-weight: 900;
      cursor: pointer;
    }
    .print-toolbar button.secondary {
      color: #074643;
      background: white;
      border: 1px solid #dce7e3;
    }
    .preview-wrap {
      padding: 16px 0 24px;
      overflow-x: auto;
    }
    .pdf-page {
      position: relative;
      width: 210mm;
      height: 297mm;
      margin: 0 auto 18px;
      padding: 12mm 14mm 10mm;
      overflow: hidden;
      page-break-after: always;
      background:
        radial-gradient(circle at 5% 6%, rgba(223, 173, 36, 0.13), transparent 45mm),
        radial-gradient(circle at 96% 93%, rgba(7, 70, 67, 0.10), transparent 48mm),
        linear-gradient(180deg, #ffffff 0%, #f8fbfa 100%);
      box-shadow: 0 12px 38px rgba(5, 47, 50, 0.14);
    }
    .pdf-page:last-child { page-break-after: auto; margin-bottom: 0; }
    .pdf-page::before {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      background-image: radial-gradient(circle, rgba(7, 70, 67, 0.13) 1px, transparent 1px);
      background-size: 7mm 7mm;
      mask-image: linear-gradient(135deg, transparent 0 64%, black 64% 100%);
      opacity: 0.3;
    }
    .top-band {
      position: absolute;
      inset: 0 0 auto;
      height: 6mm;
      background: linear-gradient(90deg, #074643 0%, #dfad24 50%, #074643 100%);
    }
    .page-header {
      position: relative;
      z-index: 1;
      height: 27mm;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8mm;
    }
    [dir="rtl"] .page-header { flex-direction: row-reverse; }
    .page-header img { width: 50mm; height: auto; }
    .page-header span {
      padding: 6px 14px;
      border-radius: 999px;
      color: #74540a;
      background: #fff3c7;
      border: 1px solid #ead584;
      font-size: 11px;
      font-weight: 900;
      white-space: nowrap;
    }
    .guest-card {
      position: relative;
      z-index: 1;
      margin-top: 4mm;
      padding: 7mm 9mm;
      border-radius: 15px;
      color: white;
      background: linear-gradient(135deg, #073f3e, #0d5651);
      text-align: center;
    }
    .guest-card p {
      margin: 0;
      color: #e5c661;
      font-size: 11px;
      font-weight: 900;
    }
    h1 {
      margin: 2mm auto 1mm;
      max-width: 150mm;
      font-size: 25px;
      line-height: 1.25;
    }
    .guest-card strong {
      color: #d5e7e3;
      font-size: 10px;
    }
    .quick-info {
      position: relative;
      z-index: 1;
      margin-top: 5mm;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 3mm;
    }
    .quick-info div {
      min-height: 22mm;
      padding: 3mm;
      display: grid;
      place-items: center;
      border: 1px solid #dce7e3;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.88);
      text-align: center;
      line-height: 1.35;
    }
    .quick-info small {
      color: #a67b12;
      font-size: 9px;
      font-weight: 900;
    }
    .quick-info b { font-size: 10.5px; }
    .ticket-block {
      position: relative;
      z-index: 1;
      margin-top: 5mm;
      display: grid;
      grid-template-columns: 46mm 1fr;
      overflow: hidden;
      border: 1px solid #dfad24;
      border-radius: 15px;
      background: #073f3e;
      min-height: 48mm;
    }
    .qr-box {
      padding: 5mm;
      display: grid;
      justify-items: center;
      align-content: center;
      gap: 1.5mm;
      color: #0c3033;
      background: #ffffff;
      font-size: 9px;
      font-weight: 900;
    }
    .qr-box img { width: 35mm; height: 35mm; }
    .ticket-text {
      padding: 7mm;
      display: grid;
      align-content: center;
      gap: 3mm;
      color: white;
    }
    .ticket-text small {
      color: #e5c661;
      font-size: 10px;
      font-weight: 900;
    }
    .ticket-text strong {
      width: fit-content;
      padding: 3mm 5mm;
      border-radius: 9px;
      color: #0c3033;
      background: #ffffff;
      font-family: Consolas, "Courier New", monospace;
      font-size: 17px;
      letter-spacing: 2px;
    }
    .ticket-text p {
      margin: 0;
      color: #c8dcda;
      font-size: 10px;
    }
    .ticket-text a {
      width: fit-content;
      padding: 7px 12px;
      border-radius: 8px;
      color: #073f3e;
      background: #e5c661;
      text-decoration: none;
      font-size: 10px;
      font-weight: 900;
    }
    .program-card {
      position: relative;
      z-index: 1;
      margin-top: 5mm;
      padding: 5mm;
      border: 1px solid #dce7e3;
      border-radius: 15px;
      background: rgba(255, 255, 255, 0.9);
    }
    .program-card h2 {
      margin: 0 0 3mm;
      color: #073f3e;
      font-size: 17px;
      text-align: center;
    }
    .program-list {
      display: grid;
      gap: 2mm;
    }
    .program-row {
      display: grid;
      grid-template-columns: 28mm 1fr;
      gap: 2.5mm;
      align-items: start;
      padding: 2mm;
      border-radius: 10px;
      background: #f6faf8;
      border-inline-start: 3px solid #dfad24;
      break-inside: avoid;
    }
    .program-row time {
      display: grid;
      place-items: center;
      min-height: 9mm;
      border-radius: 7px;
      color: white;
      background: #074643;
      font-size: 8.5px;
      font-weight: 900;
      text-align: center;
    }
    .program-row h3 {
      margin: 0 0 1mm;
      color: #0a3c3c;
      font-size: 10.5px;
      line-height: 1.25;
    }
    .program-row ul {
      margin: 0;
      padding-inline-start: 14px;
      color: #334f4f;
      font-size: 8px;
      line-height: 1.24;
    }
    footer {
      position: absolute;
      inset: auto 14mm 6mm;
      z-index: 1;
      color: #6f8280;
      text-align: center;
      font-size: 9px;
    }
    @media print {
      body { background: white; }
      .print-toolbar { display: none; }
      .preview-wrap { padding: 0; overflow: visible; }
      .pdf-page {
        margin: 0;
        box-shadow: none;
      }
    }
  </style>
</head>
<body>
  <div class="print-toolbar">
    <button onclick="savePdf()">${t.print}</button>
    <button class="secondary" onclick="window.close()">${t.close}</button>
  </div>
  <main class="preview-wrap">
    ${entries.map((entry) => invitePage(entry, language)).join("")}
  </main>
  <script>
    async function waitForAssets() {
      if (document.fonts && document.fonts.ready) {
        try { await document.fonts.ready; } catch (_) {}
      }
      await Promise.all(Array.from(document.images).map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => {
          img.addEventListener("load", resolve, { once: true });
          img.addEventListener("error", resolve, { once: true });
        });
      }));
    }
    async function savePdf() {
      await waitForAssets();
      window.focus();
      window.print();
    }
    waitForAssets();
  </script>
</body>
</html>`);
  popup.document.close();
}
