import type { EventStats, Participant } from "../types";

export const EVENT_ID = import.meta.env.VITE_EVENT_ID || "inas-quality-2026";

export function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .trim()
    .toLocaleLowerCase();
}

export function matchesParticipantWithNeedle(participant: Participant, normalizedNeedle: string): boolean {
  if (!normalizedNeedle) return true;
  return normalizeText(`${participant.name} ${participant.email} ${participant.organization || ""} ${participant.title || ""}`).includes(normalizedNeedle);
}

export function matchesParticipant(participant: Participant, query: string): boolean {
  const needle = normalizeText(query);
  return matchesParticipantWithNeedle(participant, needle);
}

export function calculateStats(participants: Participant[]): EventStats {
  const acceptedParticipants = participants.filter((participant) => participant.status === "accepted");
  const checked = acceptedParticipants.filter((participant) => participant.checkedInAt);
  const confirmed = acceptedParticipants.filter((participant) => participant.confirmationStatus === "confirmed").length;
  const declined = acceptedParticipants.filter((participant) => participant.confirmationStatus === "declined").length;
  const invitationSent = acceptedParticipants.filter((participant) => participant.inviteStatus === "sent").length;
  const invitationFailed = acceptedParticipants.filter((participant) => participant.inviteStatus === "failed").length;
  const invitationUnknown = acceptedParticipants.filter((participant) => participant.inviteStatus === "unknown").length;
  const stationMap = new Map<string, number>();
  const hourMap = new Map<string, number>();

  checked.forEach((participant) => {
    const station = participant.stationName || "—";
    stationMap.set(station, (stationMap.get(station) || 0) + 1);
    const date = new Date(participant.checkedInAt as string);
    const hour = `${String(date.getHours()).padStart(2, "0")}:00`;
    hourMap.set(hour, (hourMap.get(hour) || 0) + 1);
  });

  return {
    accepted: acceptedParticipants.length,
    confirmed,
    declined,
    unconfirmed: Math.max(acceptedParticipants.length - confirmed - declined, 0),
    checkedIn: checked.length,
    absent: Math.max(acceptedParticipants.length - checked.length, 0),
    invitationPending: Math.max(acceptedParticipants.length - invitationSent - invitationFailed - invitationUnknown, 0),
    invitationSent,
    invitationFailed,
    invitationUnknown,
    hourly: Array.from(hourMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, count]) => ({ hour, count })),
    stations: Array.from(stationMap.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => ({ name, count }))
  };
}

export function formatEventTime(iso: string, language: "ar" | "en"): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(language === "ar" ? "ar-DZ" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Algiers"
  }).format(date);
}

export function createRequestId(): string {
  return crypto.randomUUID();
}
