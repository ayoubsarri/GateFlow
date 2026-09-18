import { createHash } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";
import { db } from "./admin.js";
import { REGION } from "./config.js";
import { parseQrPayload } from "./invariants.js";
import { normalizeText, publicParticipant, requireStaff, sha256 } from "./utils.js";

const requestSchema = z.object({ requestId: z.string().uuid() });
const qrSchema = requestSchema.extend({ qrPayload: z.string().min(20).max(300) });
const manualSchema = requestSchema.extend({ participantId: z.string().min(8).max(80) });

async function recordCheckIn(input: { eventId: string; participantId?: string; ticketHash?: string; requestId: string; stationName: string; method: "qr" | "manual" }) {
  const eventRef = db.doc(`events/${input.eventId}`);
  const idempotencyRef = db.doc(`events/${input.eventId}/idempotency/${sha256(input.requestId)}`);
  const ticketRef = input.ticketHash ? db.doc(`events/${input.eventId}/ticketSecrets/${input.ticketHash}`) : null;
  const statsRef = db.doc(`events/${input.eventId}/stats/summary`);
  const checkInRef = db.collection(`events/${input.eventId}/checkins`).doc();

  return db.runTransaction(async (transaction) => {
    const eventSnapshot = await transaction.get(eventRef);
    if (!eventSnapshot.exists) return { status: "invalid" as const };
    const event = eventSnapshot.data()!;
    const ticketSnapshot = ticketRef ? await transaction.get(ticketRef) : null;
    const idempotencySnapshot = await transaction.get(idempotencyRef);
    if (idempotencySnapshot.exists) return idempotencySnapshot.data()!.result;
    if (event.status !== "live") return { status: "closed" as const };

    let participantId = input.participantId;
    if (ticketSnapshot) {
      if (!ticketSnapshot.exists || ticketSnapshot.data()!.revokedAt) return { status: "invalid" as const };
      participantId = ticketSnapshot.data()!.participantId;
    }
    if (!participantId || !event.activeRosterId) return { status: "invalid" as const };

    const participantRef = db.doc(`events/${input.eventId}/rosters/${event.activeRosterId}/participants/${participantId}`);
    const participantSnapshot = await transaction.get(participantRef);
    await transaction.get(statsRef);
    if (!participantSnapshot.exists) return { status: "invalid" as const };
    const participant = participantSnapshot.data()!;
    if (participant.status === "revoked") return { status: "revoked" as const, participantId, participantName: participant.name };
    if (participant.checkedInAt instanceof Timestamp) {
      const result = {
        status: "already" as const,
        participantId,
        participantName: participant.name,
        checkedInAt: participant.checkedInAt.toDate().toISOString(),
        checkInId: participant.checkInId || null,
        stationName: participant.stationName || ""
      };
      transaction.set(idempotencyRef, { result, createdAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60_000) });
      return result;
    }

    const now = Timestamp.now();
    const result = {
      status: "success" as const,
      participantId,
      participantName: participant.name,
      checkedInAt: now.toDate().toISOString(),
      checkInId: checkInRef.id,
      stationName: input.stationName
    };
    transaction.update(participantRef, {
      checkedInAt: now,
      checkInId: checkInRef.id,
      stationName: input.stationName,
      checkInMethod: input.method,
      updatedAt: now
    });
    transaction.set(checkInRef, {
      participantId,
      participantName: participant.name,
      stationName: input.stationName,
      method: input.method,
      checkedInAt: now,
      active: true,
      requestIdHash: sha256(input.requestId)
    });
    transaction.set(statsRef, { checkedIn: FieldValue.increment(1), absent: FieldValue.increment(-1), updatedAt: now }, { merge: true });
    transaction.set(idempotencyRef, { result, createdAt: now, expiresAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60_000) });
    return result;
  });
}

export const checkIn = onCall({ region: REGION, enforceAppCheck: true }, async (request) => {
  const staff = await requireStaff(request);
  const parsed = qrSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "A valid QR payload and request ID are required.");
  const qr = parseQrPayload(parsed.data.qrPayload);
  if (!qr || qr.eventId !== staff.eventId) return { status: "invalid" as const };
  const ticketHash = createHash("sha256").update(qr.token).digest("hex");
  return recordCheckIn({ eventId: staff.eventId, ticketHash, requestId: parsed.data.requestId, stationName: staff.stationName, method: "qr" });
});

export const manualCheckIn = onCall({ region: REGION, enforceAppCheck: true }, async (request) => {
  const staff = await requireStaff(request);
  const parsed = manualSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "A participant and request ID are required.");
  return recordCheckIn({ eventId: staff.eventId, participantId: parsed.data.participantId, requestId: parsed.data.requestId, stationName: staff.stationName, method: "manual" });
});

export const undoCheckIn = onCall({ region: REGION, enforceAppCheck: true }, async (request) => {
  const staff = await requireStaff(request);
  const parsed = z.object({ checkInId: z.string().min(8).max(100), reason: z.string().trim().min(3).max(200) }).safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "A check-in and correction reason are required.");
  const eventRef = db.doc(`events/${staff.eventId}`);
  const checkInRef = db.doc(`events/${staff.eventId}/checkins/${parsed.data.checkInId}`);
  const statsRef = db.doc(`events/${staff.eventId}/stats/summary`);
  await db.runTransaction(async (transaction) => {
    const eventSnapshot = await transaction.get(eventRef);
    const checkInSnapshot = await transaction.get(checkInRef);
    await transaction.get(statsRef);
    if (!eventSnapshot.exists || !checkInSnapshot.exists) throw new HttpsError("not-found", "Check-in not found.");
    const event = eventSnapshot.data()!;
    const checkInData = checkInSnapshot.data()!;
    if (!checkInData.active) return;
    const participantRef = db.doc(`events/${staff.eventId}/rosters/${event.activeRosterId}/participants/${checkInData.participantId}`);
    const participantSnapshot = await transaction.get(participantRef);
    if (!participantSnapshot.exists || participantSnapshot.data()!.checkInId !== checkInRef.id) throw new HttpsError("failed-precondition", "Attendance has changed since this check-in.");
    const now = Timestamp.now();
    transaction.update(participantRef, { checkedInAt: null, checkInId: null, stationName: null, checkInMethod: null, updatedAt: now });
    transaction.update(checkInRef, { active: false, undoneAt: now, undoReason: parsed.data.reason, undoStationName: staff.stationName });
    transaction.set(statsRef, { checkedIn: FieldValue.increment(-1), absent: FieldValue.increment(1), updatedAt: now }, { merge: true });
    transaction.set(db.collection(`events/${staff.eventId}/auditLogs`).doc(), { action: "checkin_undone", checkInId: checkInRef.id, participantId: checkInData.participantId, reason: parsed.data.reason, stationName: staff.stationName, createdAt: now });
  });
  return { ok: true };
});

export const revokeParticipant = onCall({ region: REGION, enforceAppCheck: true }, async (request) => {
  const staff = await requireStaff(request);
  const parsed = z.object({ participantId: z.string().min(8).max(100), reason: z.string().trim().min(3).max(200) }).safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "A participant and revocation reason are required.");
  const eventRef = db.doc(`events/${staff.eventId}`);
  const statsRef = db.doc(`events/${staff.eventId}/stats/summary`);
  await db.runTransaction(async (transaction) => {
    const eventSnapshot = await transaction.get(eventRef);
    await transaction.get(statsRef);
    if (!eventSnapshot.exists) throw new HttpsError("not-found", "Event not found.");
    const participantRef = db.doc(`events/${staff.eventId}/rosters/${eventSnapshot.data()!.activeRosterId}/participants/${parsed.data.participantId}`);
    const participantSnapshot = await transaction.get(participantRef);
    if (!participantSnapshot.exists) throw new HttpsError("not-found", "Participant not found.");
    const participant = participantSnapshot.data()!;
    if (participant.checkedInAt) throw new HttpsError("failed-precondition", "Undo attendance before revoking this invitation.");
    if (participant.status === "revoked") return;
    const ticketRef = db.doc(`events/${staff.eventId}/ticketSecrets/${participant.ticketHash}`);
    const ticketSnapshot = await transaction.get(ticketRef);
    const now = Timestamp.now();
    transaction.update(participantRef, { status: "revoked", revokedAt: now, revokeReason: parsed.data.reason, updatedAt: now });
    if (ticketSnapshot.exists) transaction.update(ticketRef, { revokedAt: now, revokeReason: parsed.data.reason });
    transaction.set(statsRef, { accepted: FieldValue.increment(-1), absent: FieldValue.increment(-1), updatedAt: now }, { merge: true });
    transaction.set(db.collection(`events/${staff.eventId}/auditLogs`).doc(), { action: "participant_revoked", participantId: parsed.data.participantId, reason: parsed.data.reason, stationName: staff.stationName, createdAt: now });
  });
  return { ok: true };
});

export const manualLookup = onCall({ region: REGION, enforceAppCheck: true }, async (request) => {
  const staff = await requireStaff(request);
  const parsed = z.object({ query: z.string().trim().min(2).max(120) }).safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Enter at least two characters.");
  const event = await db.doc(`events/${staff.eventId}`).get();
  if (!event.exists) throw new HttpsError("not-found", "Event not found.");
  const rosterPath = `events/${staff.eventId}/rosters/${event.data()!.activeRosterId}/participants`;
  const normalized = normalizeText(parsed.data.query);
  let snapshots: FirebaseFirestore.QuerySnapshot;
  if (normalized.includes("@")) {
    snapshots = await db.collection(rosterPath).where("emailNormalized", "==", normalized).limit(25).get();
  } else if (/^[A-Z0-9-]{6,12}$/i.test(parsed.data.query)) {
    const tickets = await db.collection(`events/${staff.eventId}/ticketSecrets`).where("manualCodeNormalized", "==", parsed.data.query.replace(/-/g, "").toUpperCase()).limit(1).get();
    if (tickets.empty) return [];
    const participant = await db.doc(`${rosterPath}/${tickets.docs[0].data().participantId}`).get();
    return participant.exists ? [publicParticipant(participant.id, participant.data()!)] : [];
  } else {
    const token = normalized.split(/\s+/)[0];
    snapshots = await db.collection(rosterPath).where("nameTokens", "array-contains", token).limit(25).get();
  }
  return snapshots.docs.map((snapshot) => publicParticipant(snapshot.id, snapshot.data()));
});
