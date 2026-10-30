export type Language = "ar" | "en";
export type UserRole = "admin" | "staff";
export type EventStatus = "draft" | "live" | "closed";
export type InviteStatus = "pending" | "leased" | "sent" | "failed" | "unknown";
export type ParticipantStatus = "accepted" | "revoked";
export type ConfirmationStatus = "unknown" | "confirmed" | "declined";
export type CheckInMethod = "qr" | "manual";
export type EntranceName = string;
export type AppView = "scan" | "people" | "confirmations" | "dashboard" | "event" | "settings" | "welcome-board";
export type ParticipantCategory = "delegate" | "vip" | "speaker" | "press" | "organizer";

export type ThemeName = "teal" | "indigo" | "sapphire" | "slate" | "crimson" | "emerald";

export interface ThemeOption {
  id: ThemeName;
  name: LocalizedText;
  brand: string;
  brandDeep: string;
  gold: string;
  surface: string;
}

export interface LocalizedText {
  ar: string;
  en: string;
}

export interface EventRecord {
  id: string;
  title: LocalizedText;
  topic: LocalizedText;
  subtitle: LocalizedText;
  date: string;
  timeLabel: LocalizedText;
  venue: LocalizedText;
  timezone: string;
  status: EventStatus;
  activeRosterId: string;
  logoUrl?: string;
}

export interface Participant {
  id: string;
  name: string;
  email: string;
  title?: string;
  organization?: string;
  category?: ParticipantCategory;
  ticketHash?: string;
  status: ParticipantStatus;
  inviteStatus: InviteStatus;
  confirmationStatus: ConfirmationStatus;
  confirmedAt: string | null;
  confirmationUpdatedAt: string | null;
  confirmationNote?: string;
  checkedInAt: string | null;
  checkInId: string | null;
  stationName: string | null;
  checkInMethod: CheckInMethod | null;
}

export interface CheckInRecord {
  id: string;
  participantId: string;
  participantName: string;
  stationName: string;
  method: CheckInMethod;
  checkedInAt: string;
  active: boolean;
}

export interface EventStats {
  accepted: number;
  confirmed: number;
  declined: number;
  unconfirmed: number;
  checkedIn: number;
  absent: number;
  invitationPending: number;
  invitationSent: number;
  invitationFailed: number;
  invitationUnknown: number;
  hourly: Array<{ hour: string; count: number }>;
  stations: Array<{ name: string; count: number }>;
}

export type ScanStatus = "success" | "already" | "invalid" | "revoked" | "closed" | "offline" | "error";

export interface ScanResult {
  status: ScanStatus;
  participantId?: string;
  participantName?: string;
  checkedInAt?: string;
  checkInId?: string;
  stationName?: string;
  message?: string;
}

export interface StaffSession {
  stationName: EntranceName;
  expiresAt: string;
  demo: boolean;
  role: UserRole;
}

export interface EntranceConfig {
  name: EntranceName;
  enabled: boolean;
}

export interface ManualInviteInput {
  name: string;
  email: string;
  organization?: string;
  title?: string;
  category?: ParticipantCategory;
}

export interface InvitationAsset {
  participantId: string;
  manualCode: string;
  qrPayload: string;
  qrDataUrl: string;
}

export interface EventSnapshot {
  event: EventRecord;
  participants: Participant[];
  stats: EventStats;
  recent: CheckInRecord[];
}
