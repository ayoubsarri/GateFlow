import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { Timestamp, getFirestore } from "firebase-admin/firestore";

const app = getApps()[0] || initializeApp({ credential: applicationDefault() });
const db = getFirestore(app, "inas-eu");
const eventId = "inas-quality-2026";
const event = {
  title: { ar: "الملتقى الصيفي الرابع لإيناس", en: "INAS Fourth Summer Forum" },
  topic: { ar: "ضمان الجودة في الجامعة الجزائرية", en: "Quality Assurance in the Algerian University" },
  subtitle: { ar: "تطبيق معيار ISO 9001: الواقع، التجارب والتحديات المستقبلية", en: "Applying ISO 9001: practice, experience and future challenges" },
  date: "2026-07-25",
  timeLabel: { ar: "السبت 25 جويلية 2026 · 09:00", en: "Saturday, 25 July 2026 · 09:00" },
  venue: { ar: "جامعة HIS، برج الكيفان، الجزائر العاصمة", en: "HIS University, Bordj El Kiffan, Algiers" },
  timezone: "Africa/Algiers",
  status: "draft",
  activeRosterId: "roster-initial",
  createdAt: Timestamp.now(),
  updatedAt: Timestamp.now()
};
await db.doc(`events/${eventId}`).set(event, { merge: true });
await db.doc(`events/${eventId}/stats/summary`).set({ accepted: 0, checkedIn: 0, absent: 0, invitationPending: 0, invitationSent: 0, invitationFailed: 0, invitationUnknown: 0, updatedAt: Timestamp.now() }, { merge: true });
console.log(`Seeded ${eventId} in draft mode.`);
