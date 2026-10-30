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

export const demoParticipants: Participant[] = [];

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

  let event = demoEvent;
  if (typeof localStorage !== "undefined") {
    try {
      const saved = localStorage.getItem("gateflow-event-details");
      if (saved) {
        event = { ...demoEvent, ...JSON.parse(saved) };
      }
      const customLogo = localStorage.getItem("gateflow-custom-logo");
      if (customLogo) {
        event = { ...event, logoUrl: customLogo };
      }
    } catch {
      // Fallback
    }
  }

  return {
    event,
    participants,
    stats: calculateStats(participants),
    recent
  };
}
