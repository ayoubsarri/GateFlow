import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
  type DocumentData,
  type Unsubscribe
} from "firebase/firestore";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut } from "firebase/auth";
import QRCode from "qrcode";
import { demoParticipants, makeDemoSnapshot } from "../data/demo";
import { demoTestTickets } from "../data/testTickets";
import { calculateStats, EVENT_ID, normalizeText } from "./domain";
import { auth, db, isFirebaseConfigured } from "./firebase";
import type { CheckInRecord, ConfirmationStatus, EntranceName, EventRecord, EventSnapshot, InvitationAsset, ManualInviteInput, Participant, ScanResult, StaffSession } from "../types";

export interface EventClient {
  readonly demo: boolean;
  hasSession(): Promise<boolean>;
  startSession(pin: string, stationName: string): Promise<StaffSession>;
  endSession(): Promise<void>;
  subscribe(callback: (snapshot: EventSnapshot) => void, onError: (error: Error) => void): Unsubscribe;
  checkIn(qrPayload: string, requestId: string): Promise<ScanResult>;
  manualCheckIn(participantId: string, requestId: string): Promise<ScanResult>;
  undoCheckIn(checkInId: string, reason: string): Promise<void>;
  revokeParticipant(participantId: string, reason: string): Promise<void>;
  restoreParticipant(participantId: string, reason: string): Promise<void>;
  setConfirmation(participantId: string, status: ConfirmationStatus, reason: string): Promise<void>;
  createParticipant(input: ManualInviteInput): Promise<Participant>;
  updateParticipant(participantId: string, input: ManualInviteInput): Promise<void>;
  deleteParticipant(participant: Participant, reason: string): Promise<void>;
  getInvitationAsset(participant: Participant): Promise<InvitationAsset>;
  lookup(queryText: string): Promise<Participant[]>;
}

function iso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value && "toDate" in value) {
    return (value as { toDate(): Date }).toDate().toISOString();
  }
  return null;
}

function mapParticipant(id: string, data: DocumentData): Participant {
  return {
    id,
    name: String(data.name || ""),
    email: String(data.email || ""),
    title: data.title ? String(data.title) : undefined,
    organization: data.organization ? String(data.organization) : undefined,
    ticketHash: data.ticketHash ? String(data.ticketHash) : undefined,
    status: data.status === "revoked" ? "revoked" : "accepted",
    inviteStatus: data.inviteStatus || "pending",
    confirmationStatus: data.confirmationStatus === "confirmed" || data.confirmationStatus === "declined" ? data.confirmationStatus : "unknown",
    confirmedAt: iso(data.confirmedAt),
    confirmationUpdatedAt: iso(data.confirmationUpdatedAt),
    confirmationNote: data.confirmationNote ? String(data.confirmationNote) : undefined,
    checkedInAt: iso(data.checkedInAt),
    checkInId: data.checkInId || null,
    stationName: data.stationName || null,
    checkInMethod: data.checkInMethod || null
  };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomHex(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function manualCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const raw = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

function normalizedManualCode(code: string): string {
  return code.replace(/-/g, "").toUpperCase();
}

function emailKey(email: string): string {
  return normalizeText(email).toLowerCase();
}

function nameTokens(value: string): string[] {
  return Array.from(new Set(normalizeText(value).split(/\s+/).filter((token) => token.length >= 2)));
}

function participantFromInput(id: string, input: ManualInviteInput, ticketHash: string): Participant {
  return {
    id,
    name: input.name.trim(),
    email: input.email.trim(),
    title: input.title?.trim() || undefined,
    organization: input.organization?.trim() || undefined,
    ticketHash,
    status: "accepted",
    inviteStatus: "pending",
    confirmationStatus: "unknown",
    confirmedAt: null,
    confirmationUpdatedAt: null,
    checkedInAt: null,
    checkInId: null,
    stationName: null,
    checkInMethod: null
  };
}

function allEntrances(): EntranceName[] {
  return ["A", "B", "C", "D"];
}

function entranceEmail(stationName: string): string {
  if (stationName === "A" || stationName === "C") return import.meta.env.VITE_ENTRANCE_A_EMAIL || "checkin-a@inas-dz.org";
  if (stationName === "B" || stationName === "D") return import.meta.env.VITE_ENTRANCE_B_EMAIL || "checkin-b@inas-dz.org";
  throw new Error("invalid-entrance");
}

class FirebaseEventClient implements EventClient {
  readonly demo = false;
  private participants: Participant[] = [];
  private event: EventRecord | null = null;

  private stationName(): EntranceName {
    const saved = localStorage.getItem("inas-station") as EntranceName | null;
    return saved && allEntrances().includes(saved) ? saved : "A";
  }

  private async activeEvent(): Promise<EventRecord> {
    if (this.event) return this.event;
    if (!db) throw new Error("Firebase is not configured.");
    const snapshot = await getDoc(doc(db, "events", EVENT_ID));
    if (!snapshot.exists()) throw new Error("event-not-found");
    this.event = { id: snapshot.id, ...(snapshot.data() as Omit<EventRecord, "id">) };
    return this.event;
  }

  async hasSession(): Promise<boolean> {
    if (!auth || !db) return false;
    await auth.authStateReady();
    const user = auth.currentUser;
    if (!user) return false;
    const rawExpires = localStorage.getItem("inas-session-expires");
    const expiresAt = rawExpires ? Number(rawExpires) : 0;
    if (!expiresAt || expiresAt <= Date.now()) {
      localStorage.removeItem("inas-session-expires");
      await firebaseSignOut(auth);
      return false;
    }
    if (!navigator.onLine && localStorage.getItem("inas-station")) {
      return true;
    }
    try {
      const staff = await getDoc(doc(db, "staff", user.uid));
      const stationName = this.stationName();
      return staff.exists() && staff.data().active === true && allEntrances().includes(stationName);
    } catch {
      return Boolean(localStorage.getItem("inas-station"));
    }
  }

  async startSession(pin: string, stationName: string): Promise<StaffSession> {
    if (!auth || !db) throw new Error("Firebase is not configured.");
    if (!allEntrances().includes(stationName as EntranceName) || pin.length < 6) throw new Error("invalid-session");
    const credential = await signInWithEmailAndPassword(auth, entranceEmail(stationName), pin);
    const staff = await getDoc(doc(db, "staff", credential.user.uid));
    if (!staff.exists() || staff.data().active !== true) {
      await firebaseSignOut(auth);
      throw new Error("invalid-session");
    }
    const expiresAt = new Date(Date.now() + 12 * 60 * 60_000).toISOString();
    localStorage.setItem("inas-station", stationName);
    localStorage.setItem("inas-session-expires", String(new Date(expiresAt).getTime()));
    return { stationName: stationName as EntranceName, expiresAt, demo: false };
  }

  async endSession(): Promise<void> {
    localStorage.removeItem("inas-session-expires");
    if (auth) await firebaseSignOut(auth);
  }

  subscribe(callback: (snapshot: EventSnapshot) => void, onError: (error: Error) => void): Unsubscribe {
    if (!db) return () => undefined;
    let participants: Participant[] = [];
    let recent: CheckInRecord[] = [];
    let event: EventRecord | null = null;
    let rosterUnsubscribe: Unsubscribe | null = null;
    let recentUnsubscribe: Unsubscribe | null = null;

    const emit = () => {
      if (!event) return;
      callback({ event, participants, stats: calculateStats(participants), recent });
    };

    const eventUnsubscribe = onSnapshot(
      doc(db, "events", EVENT_ID),
      (snapshot) => {
        if (!snapshot.exists()) {
          if (snapshot.metadata.fromCache) {
            return;
          }
          onError(new Error("The configured event does not exist."));
          return;
        }
        const data = snapshot.data();
        event = { id: snapshot.id, ...(data as Omit<EventRecord, "id">) };
        this.event = event;
        rosterUnsubscribe?.();
        recentUnsubscribe?.();
        const rosterId = event.activeRosterId;
        rosterUnsubscribe = onSnapshot(
          collection(db!, "events", EVENT_ID, "rosters", rosterId, "participants"),
          (rows) => {
            participants = rows.docs.map((row) => mapParticipant(row.id, row.data())).sort((a, b) => a.name.localeCompare(b.name, "ar"));
            this.participants = participants;
            emit();
          },
          (error) => onError(error)
        );
        recentUnsubscribe = onSnapshot(
          query(collection(db!, "events", EVENT_ID, "checkins"), orderBy("checkedInAt", "desc"), limit(12)),
          (rows) => {
            recent = rows.docs
              .map((row) => {
                const item = row.data();
                return {
                  id: row.id,
                  participantId: item.participantId,
                  participantName: item.participantName,
                  stationName: item.stationName,
                  method: item.method,
                  checkedInAt: iso(item.checkedInAt) || new Date().toISOString(),
                  active: item.active !== false
                } as CheckInRecord;
              })
              .filter((row) => row.active);
            emit();
          },
          (error) => onError(error)
        );
        emit();
      },
      (error) => onError(error)
    );

    return () => {
      eventUnsubscribe();
      rosterUnsubscribe?.();
      recentUnsubscribe?.();
    };
  }

  async checkIn(qrPayload: string, requestId: string): Promise<ScanResult> {
    const firestore = db;
    const user = auth?.currentUser;
    if (!firestore || !user) throw new Error("not-authenticated");
    const [prefix, eventId, token, ...extra] = qrPayload.split(".");
    if (prefix !== "INAS1" || eventId !== EVENT_ID || !token || extra.length) return { status: "invalid" };
    const ticketHash = await sha256Hex(token);
    const stationName = this.stationName();
    const localTime = new Date().toISOString();
    return runTransaction(firestore, async (transaction) => {
      const eventRef = doc(firestore, "events", EVENT_ID);
      const checkInRef = doc(firestore, "events", EVENT_ID, "checkins", requestId);
      const ticketRef = doc(firestore, "events", EVENT_ID, "ticketSecrets", ticketHash);
      const eventSnapshot = await transaction.get(eventRef);
      const existingCheckIn = await transaction.get(checkInRef);
      const ticketSnapshot = await transaction.get(ticketRef);
      if (existingCheckIn.exists()) {
        const existing = existingCheckIn.data();
        if (existing.active !== false) {
          return {
            status: "success",
            participantId: existing.participantId,
            participantName: existing.participantName,
            checkedInAt: iso(existing.checkedInAt) || localTime,
            checkInId: existingCheckIn.id,
            stationName: existing.stationName
          };
        }
      }
      if (!eventSnapshot.exists() || eventSnapshot.data().status !== "live") return { status: "closed" };
      if (!ticketSnapshot.exists() || ticketSnapshot.data().revokedAt) return { status: "invalid" };
      const participantId = String(ticketSnapshot.data().participantId || "");
      const rosterId = String(eventSnapshot.data().activeRosterId || "");
      if (!participantId || !rosterId) return { status: "invalid" };
      const participantRef = doc(firestore, "events", EVENT_ID, "rosters", rosterId, "participants", participantId);
      const participantSnapshot = await transaction.get(participantRef);
      if (!participantSnapshot.exists()) return { status: "invalid" };
      const participant = participantSnapshot.data();
      if (participant.status === "revoked") return { status: "revoked", participantId, participantName: participant.name };
      if (participant.checkedInAt) {
        return {
          status: "already",
          participantId,
          participantName: participant.name,
          checkedInAt: iso(participant.checkedInAt) || undefined,
          checkInId: participant.checkInId || undefined,
          stationName: participant.stationName || undefined
        };
      }
      transaction.update(participantRef, {
        checkedInAt: serverTimestamp(),
        checkInId: requestId,
        stationName,
        checkInMethod: "qr",
        updatedAt: serverTimestamp()
      });
      transaction.set(checkInRef, {
        participantId,
        participantName: participant.name,
        rosterId,
        stationName,
        method: "qr",
        checkedInAt: serverTimestamp(),
        active: true,
        staffUid: user.uid
      });
      return { status: "success", participantId, participantName: participant.name, checkedInAt: localTime, checkInId: requestId, stationName };
    });
  }

  async manualCheckIn(participantId: string, requestId: string): Promise<ScanResult> {
    const firestore = db;
    const user = auth?.currentUser;
    if (!firestore || !user) throw new Error("not-authenticated");
    const event = await this.activeEvent();
    const stationName = this.stationName();
    const localTime = new Date().toISOString();
    return runTransaction(firestore, async (transaction) => {
      const eventRef = doc(firestore, "events", EVENT_ID);
      const participantRef = doc(firestore, "events", EVENT_ID, "rosters", event.activeRosterId, "participants", participantId);
      const checkInRef = doc(firestore, "events", EVENT_ID, "checkins", requestId);
      const eventSnapshot = await transaction.get(eventRef);
      const participantSnapshot = await transaction.get(participantRef);
      const existingCheckIn = await transaction.get(checkInRef);
      if (existingCheckIn.exists()) {
        const existing = existingCheckIn.data();
        return { status: "success", participantId: existing.participantId, participantName: existing.participantName, checkedInAt: iso(existing.checkedInAt) || localTime, checkInId: existingCheckIn.id, stationName: existing.stationName };
      }
      if (!eventSnapshot.exists() || eventSnapshot.data().status !== "live") return { status: "closed" };
      if (!participantSnapshot.exists()) return { status: "invalid" };
      const participant = participantSnapshot.data();
      if (participant.status === "revoked") return { status: "revoked", participantId, participantName: participant.name };
      if (participant.checkedInAt) return { status: "already", participantId, participantName: participant.name, checkedInAt: iso(participant.checkedInAt) || undefined, checkInId: participant.checkInId || undefined, stationName: participant.stationName || undefined };
      transaction.update(participantRef, { checkedInAt: serverTimestamp(), checkInId: requestId, stationName, checkInMethod: "manual", updatedAt: serverTimestamp() });
      transaction.set(checkInRef, { participantId, participantName: participant.name, rosterId: event.activeRosterId, stationName, method: "manual", checkedInAt: serverTimestamp(), active: true, staffUid: user.uid });
      return { status: "success", participantId, participantName: participant.name, checkedInAt: localTime, checkInId: requestId, stationName };
    });
  }

  async undoCheckIn(checkInId: string, reason: string): Promise<void> {
    const firestore = db;
    const user = auth?.currentUser;
    if (!firestore || !user) throw new Error("not-authenticated");
    const stationName = this.stationName();
    await runTransaction(firestore, async (transaction) => {
      const checkInRef = doc(firestore, "events", EVENT_ID, "checkins", checkInId);
      const checkInSnapshot = await transaction.get(checkInRef);
      if (!checkInSnapshot.exists() || checkInSnapshot.data().active !== true) return;
      const checkIn = checkInSnapshot.data();
      const participantRef = doc(firestore, "events", EVENT_ID, "rosters", checkIn.rosterId, "participants", checkIn.participantId);
      const participantSnapshot = await transaction.get(participantRef);
      if (!participantSnapshot.exists() || participantSnapshot.data().checkInId !== checkInId) throw new Error("attendance-changed");
      const auditRef = doc(collection(firestore, "events", EVENT_ID, "auditLogs"));
      transaction.update(participantRef, { checkedInAt: null, checkInId: null, stationName: null, checkInMethod: null, updatedAt: serverTimestamp() });
      transaction.update(checkInRef, { active: false, undoneAt: serverTimestamp(), undoReason: reason, undoStationName: stationName });
      transaction.set(auditRef, { action: "checkin_undone", checkInId, participantId: checkIn.participantId, reason, stationName, staffUid: user.uid, createdAt: serverTimestamp() });
    });
  }

  async revokeParticipant(participantId: string, reason: string): Promise<void> {
    const firestore = db;
    const user = auth?.currentUser;
    if (!firestore || !user) throw new Error("not-authenticated");
    const event = await this.activeEvent();
    const stationName = this.stationName();
    await runTransaction(firestore, async (transaction) => {
      const participantRef = doc(firestore, "events", EVENT_ID, "rosters", event.activeRosterId, "participants", participantId);
      const participantSnapshot = await transaction.get(participantRef);
      if (!participantSnapshot.exists()) throw new Error("participant-not-found");
      if (participantSnapshot.data().checkedInAt) throw new Error("undo-before-revoke");
      if (participantSnapshot.data().status === "revoked") return;
      const participant = participantSnapshot.data();
      const auditRef = doc(collection(firestore, "events", EVENT_ID, "auditLogs"));
      transaction.update(participantRef, { status: "revoked", revokedAt: serverTimestamp(), revokeReason: reason, updatedAt: serverTimestamp() });
      if (participant.ticketHash) {
        transaction.update(doc(firestore, "events", EVENT_ID, "ticketSecrets", String(participant.ticketHash)), { revokedAt: serverTimestamp(), revokeReason: reason });
      }
      transaction.set(auditRef, { action: "participant_revoked", participantId, reason, stationName, staffUid: user.uid, createdAt: serverTimestamp() });
    });
  }

  async restoreParticipant(participantId: string, reason: string): Promise<void> {
    const firestore = db;
    const user = auth?.currentUser;
    if (!firestore || !user) throw new Error("not-authenticated");
    const event = await this.activeEvent();
    const stationName = this.stationName();
    await runTransaction(firestore, async (transaction) => {
      const participantRef = doc(firestore, "events", EVENT_ID, "rosters", event.activeRosterId, "participants", participantId);
      const participantSnapshot = await transaction.get(participantRef);
      if (!participantSnapshot.exists()) throw new Error("participant-not-found");
      const participant = participantSnapshot.data();
      if (participant.status !== "revoked") return;
      const auditRef = doc(collection(firestore, "events", EVENT_ID, "auditLogs"));
      transaction.update(participantRef, { status: "accepted", revokedAt: null, revokeReason: null, restoreReason: reason, restoredAt: serverTimestamp(), updatedAt: serverTimestamp() });
      if (participant.ticketHash) {
        transaction.update(doc(firestore, "events", EVENT_ID, "ticketSecrets", String(participant.ticketHash)), { revokedAt: null, revokeReason: null, restoredAt: serverTimestamp() });
      }
      transaction.set(auditRef, { action: "participant_restored", participantId, reason, stationName, staffUid: user.uid, createdAt: serverTimestamp() });
    });
  }

  async setConfirmation(participantId: string, status: ConfirmationStatus, reason: string): Promise<void> {
    const firestore = db;
    const user = auth?.currentUser;
    if (!firestore || !user) throw new Error("not-authenticated");
    const event = await this.activeEvent();
    const stationName = this.stationName();
    await runTransaction(firestore, async (transaction) => {
      const participantRef = doc(firestore, "events", EVENT_ID, "rosters", event.activeRosterId, "participants", participantId);
      const participantSnapshot = await transaction.get(participantRef);
      if (!participantSnapshot.exists()) throw new Error("participant-not-found");
      if (participantSnapshot.data().status === "revoked") throw new Error("participant-revoked");
      const auditRef = doc(collection(firestore, "events", EVENT_ID, "auditLogs"));
      transaction.update(participantRef, {
        confirmationStatus: status,
        confirmedAt: status === "confirmed" ? serverTimestamp() : null,
        confirmationUpdatedAt: serverTimestamp(),
        confirmationNote: reason,
        updatedAt: serverTimestamp()
      });
      transaction.set(auditRef, { action: "confirmation_updated", participantId, reason, stationName, staffUid: user.uid, createdAt: serverTimestamp() });
    });
  }

  async createParticipant(input: ManualInviteInput): Promise<Participant> {
    const firestore = db;
    const user = auth?.currentUser;
    if (!firestore || !user) throw new Error("not-authenticated");
    const name = input.name.trim();
    const email = input.email.trim();
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("invalid-invite");
    const event = await this.activeEvent();
    const normalizedEmail = emailKey(email);
    const existing = await getDocs(query(collection(firestore, "events", EVENT_ID, "rosters", event.activeRosterId, "participants"), where("emailNormalized", "==", normalizedEmail), limit(1)));
    if (!existing.empty) throw new Error("email-exists");

    const participantId = `manual-${crypto.randomUUID()}`;
    const token = randomHex(32);
    const ticketHash = await sha256Hex(token);
    const code = manualCode();
    const qrPayload = `INAS1.${EVENT_ID}.${token}`;
    const qrDataUrl = await QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: "H",
      margin: 2,
      width: 720,
      color: { dark: "#073f3e", light: "#ffffff" }
    });
    const participant = participantFromInput(participantId, { ...input, name, email }, ticketHash);
    const batch = writeBatch(firestore);
    batch.set(doc(firestore, "events", EVENT_ID, "rosters", event.activeRosterId, "participants", participantId), {
      name,
      email,
      emailNormalized: normalizedEmail,
      nameTokens: nameTokens(`${name} ${input.organization || ""}`),
      title: input.title?.trim() || null,
      organization: input.organization?.trim() || null,
      status: "accepted",
      inviteStatus: "pending",
      confirmationStatus: "unknown",
      confirmedAt: null,
      confirmationUpdatedAt: null,
      confirmationNote: null,
      ticketHash,
      checkedInAt: null,
      checkInId: null,
      stationName: null,
      checkInMethod: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    batch.set(doc(firestore, "events", EVENT_ID, "ticketSecrets", ticketHash), {
      participantId,
      rawToken: token,
      manualCode: code,
      manualCodeNormalized: normalizedManualCode(code),
      qrBase64: qrDataUrl.split(",")[1] || "",
      createdAt: serverTimestamp(),
      createdBy: user.uid
    });
    batch.set(doc(firestore, "events", EVENT_ID, "invitationJobs", participantId), {
      participantId,
      rosterId: event.activeRosterId,
      status: "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    batch.set(doc(collection(firestore, "events", EVENT_ID, "auditLogs")), { action: "participant_created", participantId, reason: "manual", stationName: this.stationName(), staffUid: user.uid, createdAt: serverTimestamp() });
    await batch.commit();
    this.participants = [...this.participants, participant].sort((a, b) => a.name.localeCompare(b.name, "ar"));
    return participant;
  }

  async updateParticipant(participantId: string, input: ManualInviteInput): Promise<void> {
    const firestore = db;
    const user = auth?.currentUser;
    if (!firestore || !user) throw new Error("not-authenticated");
    const name = input.name.trim();
    const email = input.email.trim();
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("invalid-invite");
    const event = await this.activeEvent();
    const normalizedEmail = emailKey(email);
    const duplicate = await getDocs(query(collection(firestore, "events", EVENT_ID, "rosters", event.activeRosterId, "participants"), where("emailNormalized", "==", normalizedEmail), limit(2)));
    if (duplicate.docs.some((item) => item.id !== participantId)) throw new Error("email-exists");
    const stationName = this.stationName();
    await runTransaction(firestore, async (transaction) => {
      const participantRef = doc(firestore, "events", EVENT_ID, "rosters", event.activeRosterId, "participants", participantId);
      const participantSnapshot = await transaction.get(participantRef);
      if (!participantSnapshot.exists()) throw new Error("participant-not-found");
      if (participantSnapshot.data().checkedInAt) throw new Error("undo-before-edit");
      transaction.update(participantRef, {
        name,
        email,
        emailNormalized: normalizedEmail,
        nameTokens: nameTokens(`${name} ${input.organization || ""}`),
        title: input.title?.trim() || null,
        organization: input.organization?.trim() || null,
        updatedAt: serverTimestamp()
      });
      transaction.set(doc(collection(firestore, "events", EVENT_ID, "auditLogs")), { action: "participant_updated", participantId, reason: "edit", stationName, staffUid: user.uid, createdAt: serverTimestamp() });
    });
  }

  async deleteParticipant(participant: Participant, reason: string): Promise<void> {
    const firestore = db;
    const user = auth?.currentUser;
    if (!firestore || !user) throw new Error("not-authenticated");
    if (participant.checkedInAt) throw new Error("undo-before-delete");
    const event = await this.activeEvent();
    const stationName = this.stationName();
    const batch = writeBatch(firestore);
    batch.delete(doc(firestore, "events", EVENT_ID, "rosters", event.activeRosterId, "participants", participant.id));
    batch.delete(doc(firestore, "events", EVENT_ID, "invitationJobs", participant.id));
    if (participant.ticketHash) batch.delete(doc(firestore, "events", EVENT_ID, "ticketSecrets", participant.ticketHash));
    batch.set(doc(collection(firestore, "events", EVENT_ID, "auditLogs")), { action: "participant_deleted", participantId: participant.id, reason, stationName, staffUid: user.uid, createdAt: serverTimestamp() });
    await batch.commit();
  }

  async getInvitationAsset(participant: Participant): Promise<InvitationAsset> {
    const firestore = db;
    if (!firestore) throw new Error("not-authenticated");
    if (!participant.ticketHash) throw new Error("ticket-missing");
    const ticket = await getDoc(doc(firestore, "events", EVENT_ID, "ticketSecrets", participant.ticketHash));
    if (!ticket.exists() || ticket.data().revokedAt) throw new Error("ticket-invalid");
    const rawToken = String(ticket.data().rawToken || "");
    const manual = String(ticket.data().manualCode || "");
    const qrPayload = `INAS1.${EVENT_ID}.${rawToken}`;
    const qrBase64 = String(ticket.data().qrBase64 || "");
    return {
      participantId: participant.id,
      manualCode: manual,
      qrPayload,
      qrDataUrl: qrBase64 ? `data:image/png;base64,${qrBase64}` : await QRCode.toDataURL(qrPayload, { errorCorrectionLevel: "H", margin: 2, width: 720, color: { dark: "#073f3e", light: "#ffffff" } })
    };
  }

  async lookup(queryText: string): Promise<Participant[]> {
    const trimmed = queryText.trim();
    const firestore = db;

    // Prioritize exact manual code lookup if pattern matches
    if (firestore && /^[A-Z0-9-]{6,12}$/i.test(trimmed)) {
      try {
        const normalized = trimmed.replace(/-/g, "").toUpperCase();
        const tickets = await getDocs(query(collection(firestore, "events", EVENT_ID, "ticketSecrets"), where("manualCodeNormalized", "==", normalized), limit(1)));
        if (!tickets.empty) {
          const event = await this.activeEvent();
          const participantId = String(tickets.docs[0].data().participantId || "");
          const participant = await getDoc(doc(firestore, "events", EVENT_ID, "rosters", event.activeRosterId, "participants", participantId));
          if (participant.exists()) {
            return [mapParticipant(participant.id, participant.data())];
          }
        }
      } catch {
        // Fall back to local search if ticketSecrets query fails
      }
    }

    const queryValue = normalizeText(trimmed.replace(/-/g, ""));
    const localMatches = this.participants.filter((participant) => normalizeText(`${participant.name} ${participant.email} ${participant.organization || ""}`).includes(queryValue));
    return localMatches.slice(0, 25);
  }
}

class DemoEventClient implements EventClient {
  readonly demo = true;
  private participants = structuredClone(demoParticipants);
  private subscribers = new Set<(snapshot: EventSnapshot) => void>();

  async hasSession(): Promise<boolean> {
    return sessionStorage.getItem("inas-demo-session") === "active";
  }

  async startSession(pin: string, stationName: string): Promise<StaffSession> {
    await new Promise((resolve) => setTimeout(resolve, 450));
    if (pin !== "2026" || !allEntrances().includes(stationName as EntranceName)) throw new Error("invalid-session");
    sessionStorage.setItem("inas-demo-session", "active");
    localStorage.setItem("inas-station", stationName);
    return { stationName: stationName as EntranceName, expiresAt: new Date(Date.now() + 12 * 60 * 60_000).toISOString(), demo: true };
  }

  async endSession(): Promise<void> {
    sessionStorage.removeItem("inas-demo-session");
  }

  subscribe(callback: (snapshot: EventSnapshot) => void): Unsubscribe {
    this.subscribers.add(callback);
    callback(makeDemoSnapshot(this.participants));
    return () => this.subscribers.delete(callback);
  }

  private emit() {
    const snapshot = makeDemoSnapshot(this.participants);
    this.subscribers.forEach((subscriber) => subscriber(snapshot));
  }

  async checkIn(qrPayload: string, requestId: string): Promise<ScanResult> {
    void requestId;
    await new Promise((resolve) => setTimeout(resolve, 550));
    if (!navigator.onLine) return { status: "offline" };
    const testParticipantId = demoTestTickets.find((ticket) => ticket.payload === qrPayload)?.participantId;
    const participant = qrPayload.includes("DEMO-ALREADY")
      ? this.participants[0]
      : testParticipantId
        ? this.participants.find((item) => item.id === testParticipantId)
        : this.participants.find((item) => item.status === "accepted" && !item.checkedInAt);
    if (!participant || (!qrPayload.startsWith("INAS1.") && qrPayload !== "DEMO")) return { status: "invalid" };
    if (participant.status === "revoked") return { status: "revoked", participantName: participant.name };
    if (participant.checkedInAt) {
      return { status: "already", participantId: participant.id, participantName: participant.name, checkedInAt: participant.checkedInAt, stationName: participant.stationName || undefined };
    }
    const now = new Date().toISOString();
    const checkInId = `demo-${crypto.randomUUID()}`;
    participant.checkedInAt = now;
    participant.checkInId = checkInId;
    participant.stationName = (localStorage.getItem("inas-station") as EntranceName | null) || "A";
    participant.checkInMethod = "qr";
    this.emit();
    return { status: "success", participantId: participant.id, participantName: participant.name, checkedInAt: now, checkInId, stationName: participant.stationName };
  }

  async manualCheckIn(participantId: string, requestId: string): Promise<ScanResult> {
    void requestId;
    await new Promise((resolve) => setTimeout(resolve, 350));
    if (!navigator.onLine) return { status: "offline" };
    const participant = this.participants.find((item) => item.id === participantId);
    if (!participant) return { status: "invalid" };
    if (participant.status === "revoked") {
      return { status: "revoked", participantId, participantName: participant.name };
    }
    if (participant.checkedInAt) {
      return {
        status: "already",
        participantId,
        participantName: participant.name,
        checkedInAt: participant.checkedInAt,
        checkInId: participant.checkInId || undefined,
        stationName: participant.stationName || undefined
      };
    }
    const now = new Date().toISOString();
    const checkInId = `demo-${crypto.randomUUID()}`;
    participant.checkedInAt = now;
    participant.checkInId = checkInId;
    participant.stationName = (localStorage.getItem("inas-station") as EntranceName | null) || "A";
    participant.checkInMethod = "manual";
    this.emit();
    return {
      status: "success",
      participantId,
      participantName: participant.name,
      checkedInAt: now,
      checkInId,
      stationName: participant.stationName
    };
  }

  async undoCheckIn(checkInId: string): Promise<void> {
    const participant = this.participants.find((item) => item.checkInId === checkInId);
    if (!participant) throw new Error("Check-in not found.");
    participant.checkedInAt = null;
    participant.checkInId = null;
    participant.stationName = null;
    participant.checkInMethod = null;
    this.emit();
  }

  async revokeParticipant(participantId: string): Promise<void> {
    const participant = this.participants.find((item) => item.id === participantId);
    if (!participant) throw new Error("Participant not found.");
    if (participant.checkedInAt) throw new Error("Undo check-in before revoking this participant.");
    participant.status = "revoked";
    this.emit();
  }

  async restoreParticipant(participantId: string): Promise<void> {
    const participant = this.participants.find((item) => item.id === participantId);
    if (!participant) throw new Error("Participant not found.");
    participant.status = "accepted";
    this.emit();
  }

  async setConfirmation(participantId: string, status: ConfirmationStatus, reason: string): Promise<void> {
    const participant = this.participants.find((item) => item.id === participantId);
    if (!participant) throw new Error("Participant not found.");
    if (participant.status === "revoked") throw new Error("Participant revoked.");
    participant.confirmationStatus = status;
    participant.confirmedAt = status === "confirmed" ? new Date().toISOString() : null;
    participant.confirmationUpdatedAt = new Date().toISOString();
    participant.confirmationNote = reason;
    this.emit();
  }

  async createParticipant(input: ManualInviteInput): Promise<Participant> {
    const participant = participantFromInput(`demo-${crypto.randomUUID()}`, input, `demo-ticket-${crypto.randomUUID()}`);
    this.participants.push(participant);
    this.emit();
    return participant;
  }

  async updateParticipant(participantId: string, input: ManualInviteInput): Promise<void> {
    const participant = this.participants.find((item) => item.id === participantId);
    if (!participant) throw new Error("Participant not found.");
    participant.name = input.name.trim();
    participant.email = input.email.trim();
    participant.organization = input.organization?.trim() || undefined;
    participant.title = input.title?.trim() || undefined;
    this.emit();
  }

  async deleteParticipant(participant: Participant): Promise<void> {
    this.participants = this.participants.filter((item) => item.id !== participant.id);
    this.emit();
  }

  async getInvitationAsset(participant: Participant): Promise<InvitationAsset> {
    const token = randomHex(32);
    const qrPayload = `INAS1.${EVENT_ID}.${token}`;
    return {
      participantId: participant.id,
      manualCode: manualCode(),
      qrPayload,
      qrDataUrl: await QRCode.toDataURL(qrPayload, { errorCorrectionLevel: "H", margin: 2, width: 720, color: { dark: "#073f3e", light: "#ffffff" } })
    };
  }

  async lookup(queryText: string): Promise<Participant[]> {
    const queryValue = normalizeText(queryText.replace(/-/g, ""));
    return this.participants.filter((participant) => normalizeText(`${participant.name} ${participant.email}`).includes(queryValue)).slice(0, 25);
  }
}

let client: EventClient | null = null;

export function getEventClient(): EventClient {
  if (!client) {
    const forceDemo = import.meta.env.VITE_DEMO_MODE === "true";
    client = isFirebaseConfigured && !forceDemo ? new FirebaseEventClient() : new DemoEventClient();
  }
  return client;
}

export function waitForAuthState(): Promise<void> {
  const firebaseAuth = auth;
  if (!firebaseAuth) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, () => {
      unsubscribe();
      resolve();
    });
  });
}
