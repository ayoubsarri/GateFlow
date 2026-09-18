import { calculateStats } from "../lib/domain";
import type { CheckInRecord, EventRecord, EventSnapshot, Participant } from "../types";

export const demoEvent: EventRecord = {
  id: "inas-quality-2026",
  title: {
    ar: "الملتقى الصيفي الرابع لإيناس",
    en: "INAS Fourth Summer Forum"
  },
  topic: {
    ar: "ضمان الجودة في الجامعة الجزائرية",
    en: "Quality Assurance in the Algerian University"
  },
  subtitle: {
    ar: "تطبيق معيار ISO 9001: الواقع، التجارب والتحديات المستقبلية",
    en: "Applying ISO 9001: practice, experience and future challenges"
  },
  date: "2026-07-25",
  timeLabel: {
    ar: "السبت 25 جويلية 2026 · 09:00",
    en: "Saturday, 25 July 2026 · 09:00"
  },
  venue: {
    ar: "جامعة HIS، برج الكيفان، الجزائر العاصمة",
    en: "HIS University, Bordj El Kiffan, Algiers"
  },
  timezone: "Africa/Algiers",
  status: "live",
  activeRosterId: "roster-demo"
};

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

export const demoParticipants: Participant[] = [
  { id: "p01", name: "الدكتورة أمينة بن يوسف", email: "amina.benyoussef@example.dz", title: "Dr.", organization: "جامعة الجزائر 1", status: "accepted", inviteStatus: "sent", checkedInAt: minutesAgo(8), checkInId: "c01", stationName: "A", checkInMethod: "qr" },
  { id: "p02", name: "الأستاذ سمير قاسمي", email: "samir.kacemi@example.dz", title: "Prof.", organization: "جامعة وهران 2", status: "accepted", inviteStatus: "sent", checkedInAt: minutesAgo(14), checkInId: "c02", stationName: "A", checkInMethod: "qr" },
  { id: "p03", name: "الدكتور ياسين بوعلام", email: "y.boualem@example.dz", title: "Dr.", organization: "HIS University", status: "accepted", inviteStatus: "sent", checkedInAt: minutesAgo(22), checkInId: "c03", stationName: "B", checkInMethod: "manual" },
  { id: "p04", name: "نوال رحماني", email: "n.rahmani@example.dz", organization: "وزارة التعليم العالي", status: "accepted", inviteStatus: "sent", checkedInAt: null, checkInId: null, stationName: null, checkInMethod: null },
  { id: "p05", name: "الدكتور عبد النور حميدي", email: "a.hamidi@example.dz", title: "Dr.", organization: "جامعة سطيف 1", status: "accepted", inviteStatus: "pending", checkedInAt: null, checkInId: null, stationName: null, checkInMethod: null },
  { id: "p06", name: "Professor Lynda Ait Salem", email: "lynda.aitsalem@example.dz", title: "Prof.", organization: "USTHB", status: "accepted", inviteStatus: "sent", checkedInAt: minutesAgo(31), checkInId: "c06", stationName: "B", checkInMethod: "qr" },
  { id: "p07", name: "الدكتور محمد شريف", email: "m.cherif@example.dz", title: "Dr.", organization: "جامعة قسنطينة 3", status: "accepted", inviteStatus: "failed", checkedInAt: null, checkInId: null, stationName: null, checkInMethod: null },
  { id: "p08", name: "سارة غربي", email: "s.gharbi@example.dz", organization: "شبكة النخبة", status: "accepted", inviteStatus: "sent", checkedInAt: null, checkInId: null, stationName: null, checkInMethod: null },
  { id: "p09", name: "الدكتور كريم مسعودي", email: "k.messaoudi@example.dz", title: "Dr.", organization: "جامعة البليدة 1", status: "accepted", inviteStatus: "unknown", checkedInAt: null, checkInId: null, stationName: null, checkInMethod: null },
  { id: "p10", name: "ليلى زروقي", email: "l.zerrouki@example.dz", organization: "HIS University", status: "revoked", inviteStatus: "sent", checkedInAt: null, checkInId: null, stationName: null, checkInMethod: null },
  { id: "p11", name: "ضيف تجريبي 01", email: "test01@example.invalid", status: "accepted", inviteStatus: "sent", checkedInAt: null, checkInId: null, stationName: null, checkInMethod: null },
  { id: "p12", name: "ضيف تجريبي 02", email: "test02@example.invalid", status: "accepted", inviteStatus: "sent", checkedInAt: null, checkInId: null, stationName: null, checkInMethod: null },
  { id: "p13", name: "ضيف تجريبي 03", email: "test03@example.invalid", status: "accepted", inviteStatus: "sent", checkedInAt: null, checkInId: null, stationName: null, checkInMethod: null },
  { id: "p14", name: "ضيف تجريبي 04", email: "test04@example.invalid", status: "accepted", inviteStatus: "sent", checkedInAt: null, checkInId: null, stationName: null, checkInMethod: null },
  { id: "p15", name: "ضيف تجريبي 05", email: "test05@example.invalid", status: "accepted", inviteStatus: "sent", checkedInAt: null, checkInId: null, stationName: null, checkInMethod: null },
  { id: "p16", name: "ضيف تجريبي 06", email: "test06@example.invalid", status: "accepted", inviteStatus: "sent", checkedInAt: null, checkInId: null, stationName: null, checkInMethod: null },
  { id: "p17", name: "ضيف تجريبي 07", email: "test07@example.invalid", status: "accepted", inviteStatus: "sent", checkedInAt: null, checkInId: null, stationName: null, checkInMethod: null },
  { id: "p18", name: "ضيف تجريبي 08", email: "test08@example.invalid", status: "accepted", inviteStatus: "sent", checkedInAt: null, checkInId: null, stationName: null, checkInMethod: null },
  { id: "p19", name: "ضيف تجريبي 09", email: "test09@example.invalid", status: "accepted", inviteStatus: "sent", checkedInAt: null, checkInId: null, stationName: null, checkInMethod: null },
  { id: "p20", name: "ضيف تجريبي 10", email: "test10@example.invalid", status: "accepted", inviteStatus: "sent", checkedInAt: null, checkInId: null, stationName: null, checkInMethod: null }
].map((participant, index) => ({
  confirmationStatus: index < 5 ? "confirmed" : index === 7 ? "declined" : "unknown",
  confirmedAt: index < 5 ? minutesAgo(180 + index) : null,
  confirmationUpdatedAt: index < 8 ? minutesAgo(170 + index) : null,
  ...participant
} as Participant));

export function makeDemoSnapshot(participants = demoParticipants): EventSnapshot {
  const recent: CheckInRecord[] = participants
    .filter((participant) => participant.checkedInAt && participant.checkInId)
    .map((participant) => ({
      id: participant.checkInId as string,
      participantId: participant.id,
      participantName: participant.name,
      stationName: participant.stationName || "—",
      method: participant.checkInMethod || "qr",
      checkedInAt: participant.checkedInAt as string,
      active: true
    }))
    .sort((a, b) => b.checkedInAt.localeCompare(a.checkedInAt));

  return {
    event: demoEvent,
    participants,
    stats: calculateStats(participants),
    recent
  };
}
