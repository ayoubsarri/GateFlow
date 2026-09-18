import { randomBytes, randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import QRCode from "qrcode";
import { z } from "zod";
import { db } from "./admin.js";
import { APPS_SCRIPT_HMAC_SECRET, REGION } from "./config.js";
import { importIdentityErrors } from "./invariants.js";
import { handleHttpError, nameTokens, normalizeText, sha256, verifyAppsScriptRequest } from "./utils.js";

const localizedSchema = z.object({ ar: z.string().trim().min(2).max(300), en: z.string().trim().min(2).max(300) });
const eventSettingsSchema = z.object({
  eventId: z.string().regex(/^[a-z0-9-]+$/),
  title: localizedSchema,
  topic: localizedSchema,
  subtitle: localizedSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeLabel: localizedSchema,
  venue: localizedSchema,
  timezone: z.string().default("Africa/Algiers"),
  status: z.enum(["draft", "live", "closed"])
});

const participantSchema = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(254),
  title: z.string().trim().max(80).optional().default(""),
  organization: z.string().trim().max(180).optional().default("")
});

function manualCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  const value = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `${value.slice(0, 4)}-${value.slice(4)}`;
}

function createTicket(participantId: string) {
  const rawToken = randomBytes(32).toString("base64url");
  const ticketHash = sha256(rawToken);
  const code = manualCode();
  return {
    ticketHash,
    rawToken,
    data: {
      participantId,
      rawToken,
      manualCode: code,
      manualCodeNormalized: code.replace(/-/g, ""),
      createdAt: Timestamp.now(),
      revokedAt: null
    }
  };
}

async function renderInvitationAsset(eventId: string, participantId: string, leaseId: string | null = null) {
  const eventSnapshot = await db.doc(`events/${eventId}`).get();
  if (!eventSnapshot.exists) throw new Error("VALIDATION_EVENT_NOT_FOUND");
  const event = eventSnapshot.data()!;
  const participantSnapshot = await db.doc(`events/${eventId}/rosters/${event.activeRosterId}/participants/${participantId}`).get();
  if (!participantSnapshot.exists) throw new Error("VALIDATION_PARTICIPANT_NOT_FOUND");
  const participant = participantSnapshot.data()!;
  if (!participant.ticketHash) throw new Error("VALIDATION_TICKET_NOT_FOUND");
  const ticketSnapshot = await db.doc(`events/${eventId}/ticketSecrets/${participant.ticketHash}`).get();
  if (!ticketSnapshot.exists || ticketSnapshot.data()!.revokedAt) throw new Error("VALIDATION_TICKET_NOT_FOUND");
  const ticket = ticketSnapshot.data()!;
  const qrPayload = `INAS1.${eventId}.${ticket.rawToken}`;
  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 520,
    color: { dark: "#072f33", light: "#ffffff" }
  });
  return {
    jobId: participantId,
    leaseId,
    participantId,
    name: participant.name,
    email: participant.email,
    title: participant.title || "",
    organization: participant.organization || "",
    manualCode: ticket.manualCode,
    qrPayload,
    qrBase64: qrDataUrl.replace(/^data:image\/png;base64,/, ""),
    event: {
      id: eventId,
      title: event.title,
      topic: event.topic,
      subtitle: event.subtitle,
      date: event.date,
      timeLabel: event.timeLabel,
      venue: event.venue,
      timezone: event.timezone
    }
  };
}

export const publishEventSettings = onRequest({ region: REGION, secrets: [APPS_SCRIPT_HMAC_SECRET], cors: false }, async (request, response) => {
  try {
    await verifyAppsScriptRequest(request);
    const parsed = eventSettingsSchema.safeParse(request.body);
    if (!parsed.success) throw new Error(`VALIDATION_EVENT_SETTINGS:${parsed.error.message}`);
    const eventRef = db.doc(`events/${parsed.data.eventId}`);
    const current = await eventRef.get();
    await eventRef.set({
      ...parsed.data,
      activeRosterId: current.data()?.activeRosterId || "roster-initial",
      updatedAt: Timestamp.now(),
      createdAt: current.data()?.createdAt || Timestamp.now()
    }, { merge: true });
    const statsRef = db.doc(`events/${parsed.data.eventId}/stats/summary`);
    if (!(await statsRef.get()).exists) {
      await statsRef.set({ accepted: 0, checkedIn: 0, absent: 0, invitationPending: 0, invitationSent: 0, invitationFailed: 0, invitationUnknown: 0, updatedAt: Timestamp.now() });
    }
    response.json({ ok: true, eventId: parsed.data.eventId });
  } catch (error) {
    handleHttpError(response, error);
  }
});

export const importParticipants = onRequest({ region: REGION, secrets: [APPS_SCRIPT_HMAC_SECRET], cors: false, timeoutSeconds: 300, memory: "1GiB" }, async (request, response) => {
  try {
    await verifyAppsScriptRequest(request);
    const parsed = z.object({
      eventId: z.string().regex(/^[a-z0-9-]+$/),
      importId: z.string().min(6).max(100),
      fileHash: z.string().min(16).max(128),
      fileName: z.string().min(1).max(240),
      participants: z.array(participantSchema).min(1).max(1000)
    }).safeParse(request.body);
    if (!parsed.success) throw new Error(`VALIDATION_IMPORT:${parsed.error.message}`);

    const { eventId, fileHash, fileName } = parsed.data;
    const identityErrors = importIdentityErrors(parsed.data.participants);
    if (identityErrors.length) throw new Error(`VALIDATION_IMPORT_IDENTITIES:${identityErrors.join(";")}`);

    const importKey = sha256(fileHash);
    const importRef = db.doc(`events/${eventId}/imports/${importKey}`);
    const previousImport = await importRef.get();
    if (previousImport.data()?.status === "completed") {
      response.json({ ok: true, duplicate: true, count: previousImport.data()!.count, rosterId: previousImport.data()!.rosterId });
      return;
    }

    const eventRef = db.doc(`events/${eventId}`);
    const eventSnapshot = await eventRef.get();
    if (!eventSnapshot.exists) throw new Error("VALIDATION_EVENT_NOT_FOUND");
    const activeRosterId = eventSnapshot.data()!.activeRosterId || "roster-initial";
    const rosterId = `roster-${importKey.slice(0, 18)}`;
    await importRef.set({ status: "staging", importId: parsed.data.importId, fileHash, fileName, rosterId, startedAt: Timestamp.now(), count: parsed.data.participants.length });

    const existingSnapshot = await db.collection(`events/${eventId}/rosters/${activeRosterId}/participants`).get();
    const merged = new Map<string, FirebaseFirestore.DocumentData>();
    existingSnapshot.docs.forEach((document) => merged.set(document.data().emailNormalized, { id: document.id, ...document.data() }));

    const newTickets: Array<{ participantId: string; ticketHash: string; data: FirebaseFirestore.DocumentData }> = [];
    for (const input of parsed.data.participants) {
      const emailNormalized = input.email.toLocaleLowerCase();
      const existing = merged.get(emailNormalized);
      const participantId = existing?.id || sha256(emailNormalized).slice(0, 28);
      let ticketHash = existing?.ticketHash as string | undefined;
      if (!ticketHash) {
        const ticket = createTicket(participantId);
        ticketHash = ticket.ticketHash;
        newTickets.push({ participantId, ticketHash, data: ticket.data });
      }
      merged.set(emailNormalized, {
        ...existing,
        id: participantId,
        name: input.name,
        email: input.email,
        emailNormalized,
        title: input.title,
        organization: input.organization,
        nameTokens: nameTokens(input.name),
        status: existing?.status || "accepted",
        inviteStatus: existing?.inviteStatus || "pending",
        checkedInAt: existing?.checkedInAt || null,
        checkInId: existing?.checkInId || null,
        stationName: existing?.stationName || null,
        checkInMethod: existing?.checkInMethod || null,
        ticketHash,
        createdAt: existing?.createdAt || Timestamp.now(),
        updatedAt: Timestamp.now(),
        importedFrom: fileName
      });
    }

    const writer = db.bulkWriter();
    for (const participant of merged.values()) {
      const { id, ...data } = participant;
      writer.set(db.doc(`events/${eventId}/rosters/${rosterId}/participants/${id}`), data);
    }
    for (const ticket of newTickets) {
      writer.set(db.doc(`events/${eventId}/ticketSecrets/${ticket.ticketHash}`), ticket.data);
      writer.set(db.doc(`events/${eventId}/invitationJobs/${ticket.participantId}`), {
        participantId: ticket.participantId,
        status: "pending",
        attempts: 0,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });
    }
    await writer.close();

    const participants = Array.from(merged.values());
    const accepted = participants.filter((participant) => participant.status === "accepted");
    const checkedIn = accepted.filter((participant) => participant.checkedInAt instanceof Timestamp).length;
    const countStatus = (status: string) => accepted.filter((participant) => participant.inviteStatus === status).length;
    const stats = {
      accepted: accepted.length,
      checkedIn,
      absent: Math.max(accepted.length - checkedIn, 0),
      invitationSent: countStatus("sent"),
      invitationFailed: countStatus("failed"),
      invitationUnknown: countStatus("unknown"),
      invitationPending: accepted.filter((participant) => ["pending", "leased"].includes(participant.inviteStatus)).length,
      updatedAt: Timestamp.now()
    };

    await db.runTransaction(async (transaction) => {
      const latestEvent = await transaction.get(eventRef);
      const latestImport = await transaction.get(importRef);
      if (!latestEvent.exists || latestImport.data()?.status === "completed") return;
      const now = Timestamp.now();
      transaction.update(eventRef, { activeRosterId: rosterId, updatedAt: now });
      transaction.set(db.doc(`events/${eventId}/stats/summary`), stats, { merge: true });
      transaction.update(importRef, { status: "completed", completedAt: now, count: parsed.data.participants.length, mergedCount: merged.size });
      transaction.set(db.collection(`events/${eventId}/auditLogs`).doc(), { action: "roster_imported", fileName, fileHash, importId: parsed.data.importId, rosterId, rowCount: parsed.data.participants.length, mergedCount: merged.size, createdAt: now });
    });

    response.json({ ok: true, duplicate: false, count: parsed.data.participants.length, mergedCount: merged.size, rosterId });
  } catch (error) {
    handleHttpError(response, error);
  }
});

async function expireAmbiguousLeases(eventId: string) {
  const now = Timestamp.now();
  const expired = await db.collection(`events/${eventId}/invitationJobs`)
    .where("status", "==", "leased")
    .where("leaseUntil", "<", now)
    .limit(50)
    .get();
  if (expired.empty) return;
  const event = await db.doc(`events/${eventId}`).get();
  const batch = db.batch();
  for (const job of expired.docs) {
    batch.update(job.ref, { status: "unknown", updatedAt: now, error: "Lease expired after possible send" });
    batch.set(db.doc(`events/${eventId}/rosters/${event.data()!.activeRosterId}/participants/${job.id}`), { inviteStatus: "unknown", updatedAt: now }, { merge: true });
  }
  batch.set(db.doc(`events/${eventId}/stats/summary`), {
    invitationPending: FieldValue.increment(-expired.size),
    invitationUnknown: FieldValue.increment(expired.size),
    updatedAt: now
  }, { merge: true });
  await batch.commit();
}

export const leaseInvitationBatch = onRequest({ region: REGION, secrets: [APPS_SCRIPT_HMAC_SECRET], cors: false, timeoutSeconds: 120, memory: "512MiB" }, async (request, response) => {
  try {
    await verifyAppsScriptRequest(request);
    const parsed = z.object({ eventId: z.string().regex(/^[a-z0-9-]+$/), mode: z.enum(["summary", "test", "batch"]).default("batch"), limit: z.number().int().min(1).max(25).default(25) }).safeParse(request.body);
    if (!parsed.success) throw new Error(`VALIDATION_LEASE:${parsed.error.message}`);
    const { eventId, mode } = parsed.data;
    await expireAmbiguousLeases(eventId);

    if (mode === "summary") {
      const jobs = await db.collection(`events/${eventId}/invitationJobs`).get();
      const counts: Record<string, number> = {};
      jobs.docs.forEach((job) => { const status = String(job.data().status); counts[status] = (counts[status] || 0) + 1; });
      response.json({ ok: true, counts, total: jobs.size });
      return;
    }

    const candidates = await db.collection(`events/${eventId}/invitationJobs`).where("status", "==", "pending").orderBy("createdAt", "asc").limit(mode === "test" ? 1 : parsed.data.limit).get();
    if (candidates.empty) {
      response.json({ ok: true, jobs: [], complete: true });
      return;
    }

    if (mode === "test") {
      response.json({ ok: true, jobs: [await renderInvitationAsset(eventId, candidates.docs[0].id)], complete: false });
      return;
    }

    const leased = await db.runTransaction(async (transaction) => {
      const results: Array<{ participantId: string; leaseId: string }> = [];
      const eventRef = db.doc(`events/${eventId}`);
      const eventSnapshot = await transaction.get(eventRef);
      if (!eventSnapshot.exists) throw new Error("VALIDATION_EVENT_NOT_FOUND");
      const freshCandidates = await Promise.all(candidates.docs.map((candidate) => transaction.get(candidate.ref)));
      const participantRefs = candidates.docs.map((candidate) => db.doc(`events/${eventId}/rosters/${eventSnapshot.data()!.activeRosterId}/participants/${candidate.id}`));
      const participantSnapshots = await Promise.all(participantRefs.map((participantRef) => transaction.get(participantRef)));
      for (const [index, candidate] of candidates.docs.entries()) {
        const fresh = freshCandidates[index];
        if (fresh.data()?.status !== "pending" || !participantSnapshots[index].exists) continue;
        const leaseId = randomUUID();
        transaction.update(candidate.ref, { status: "leased", leaseId, leaseUntil: Timestamp.fromMillis(Date.now() + 10 * 60_000), attempts: FieldValue.increment(1), updatedAt: Timestamp.now() });
        transaction.update(participantRefs[index], { inviteStatus: "leased", updatedAt: Timestamp.now() });
        results.push({ participantId: candidate.id, leaseId });
      }
      return results;
    });
    const jobs = await Promise.all(leased.map((item) => renderInvitationAsset(eventId, item.participantId, item.leaseId)));
    response.json({ ok: true, jobs, complete: jobs.length === 0 });
  } catch (error) {
    handleHttpError(response, error);
  }
});

export const getInvitationAssets = onRequest({ region: REGION, secrets: [APPS_SCRIPT_HMAC_SECRET], cors: false, timeoutSeconds: 60 }, async (request, response) => {
  try {
    await verifyAppsScriptRequest(request);
    const parsed = z.object({ eventId: z.string().regex(/^[a-z0-9-]+$/), participantId: z.string().min(8).max(100).optional() }).safeParse(request.body);
    if (!parsed.success) throw new Error(`VALIDATION_ASSET:${parsed.error.message}`);
    let participantId = parsed.data.participantId;
    if (!participantId) {
      const pending = await db.collection(`events/${parsed.data.eventId}/invitationJobs`).where("status", "==", "pending").orderBy("createdAt", "asc").limit(1).get();
      if (pending.empty) throw new Error("VALIDATION_NO_PENDING_INVITATIONS");
      participantId = pending.docs[0].id;
    }
    response.json({ ok: true, asset: await renderInvitationAsset(parsed.data.eventId, participantId) });
  } catch (error) {
    handleHttpError(response, error);
  }
});

export const completeInvitationJob = onRequest({ region: REGION, secrets: [APPS_SCRIPT_HMAC_SECRET], cors: false }, async (request, response) => {
  try {
    await verifyAppsScriptRequest(request);
    const parsed = z.object({ eventId: z.string().regex(/^[a-z0-9-]+$/), jobId: z.string().min(8).max(100), leaseId: z.string().uuid(), status: z.enum(["sent", "failed", "unknown"]), error: z.string().max(500).optional().default("") }).safeParse(request.body);
    if (!parsed.success) throw new Error(`VALIDATION_COMPLETE:${parsed.error.message}`);
    const eventRef = db.doc(`events/${parsed.data.eventId}`);
    const jobRef = db.doc(`events/${parsed.data.eventId}/invitationJobs/${parsed.data.jobId}`);
    const statsRef = db.doc(`events/${parsed.data.eventId}/stats/summary`);
    await db.runTransaction(async (transaction) => {
      const event = await transaction.get(eventRef);
      const job = await transaction.get(jobRef);
      await transaction.get(statsRef);
      if (!event.exists || !job.exists) throw new Error("VALIDATION_JOB_NOT_FOUND");
      if (job.data()!.status !== "leased" || job.data()!.leaseId !== parsed.data.leaseId) throw new Error("VALIDATION_LEASE_MISMATCH");
      const participantRef = db.doc(`events/${parsed.data.eventId}/rosters/${event.data()!.activeRosterId}/participants/${parsed.data.jobId}`);
      const participant = await transaction.get(participantRef);
      if (!participant.exists) throw new Error("VALIDATION_PARTICIPANT_NOT_FOUND");
      const now = Timestamp.now();
      transaction.update(jobRef, { status: parsed.data.status, error: parsed.data.error, completedAt: now, updatedAt: now, leaseUntil: null });
      transaction.set(participantRef, { inviteStatus: parsed.data.status, inviteSentAt: parsed.data.status === "sent" ? now : null, updatedAt: now }, { merge: true });
      const statField = parsed.data.status === "sent" ? "invitationSent" : parsed.data.status === "failed" ? "invitationFailed" : "invitationUnknown";
      transaction.set(statsRef, { invitationPending: FieldValue.increment(-1), [statField]: FieldValue.increment(1), updatedAt: now }, { merge: true });
    });
    response.json({ ok: true });
  } catch (error) {
    handleHttpError(response, error);
  }
});

export const rotateInvitation = onRequest({ region: REGION, secrets: [APPS_SCRIPT_HMAC_SECRET], cors: false }, async (request, response) => {
  try {
    await verifyAppsScriptRequest(request);
    const parsed = z.object({ eventId: z.string().regex(/^[a-z0-9-]+$/), participantId: z.string().min(8).max(100), reason: z.string().trim().min(3).max(200) }).safeParse(request.body);
    if (!parsed.success) throw new Error(`VALIDATION_ROTATE:${parsed.error.message}`);
    const eventRef = db.doc(`events/${parsed.data.eventId}`);
    const jobRef = db.doc(`events/${parsed.data.eventId}/invitationJobs/${parsed.data.participantId}`);
    const statsRef = db.doc(`events/${parsed.data.eventId}/stats/summary`);
    const replacement = createTicket(parsed.data.participantId);
    const leaseId = randomUUID();
    await db.runTransaction(async (transaction) => {
      const event = await transaction.get(eventRef);
      const job = await transaction.get(jobRef);
      await transaction.get(statsRef);
      if (!event.exists || !job.exists) throw new Error("VALIDATION_JOB_NOT_FOUND");
      const participantRef = db.doc(`events/${parsed.data.eventId}/rosters/${event.data()!.activeRosterId}/participants/${parsed.data.participantId}`);
      const participant = await transaction.get(participantRef);
      if (!participant.exists) throw new Error("VALIDATION_PARTICIPANT_NOT_FOUND");
      const oldTicketRef = db.doc(`events/${parsed.data.eventId}/ticketSecrets/${participant.data()!.ticketHash}`);
      await transaction.get(oldTicketRef);
      const now = Timestamp.now();
      transaction.set(oldTicketRef, { revokedAt: now, revokeReason: parsed.data.reason }, { merge: true });
      transaction.set(db.doc(`events/${parsed.data.eventId}/ticketSecrets/${replacement.ticketHash}`), replacement.data);
      transaction.update(participantRef, { ticketHash: replacement.ticketHash, inviteStatus: "leased", inviteSentAt: null, updatedAt: now });
      transaction.set(jobRef, { participantId: parsed.data.participantId, status: "leased", attempts: FieldValue.increment(1), leaseId, leaseUntil: Timestamp.fromMillis(Date.now() + 10 * 60_000), error: "", updatedAt: now, createdAt: job.data()!.createdAt || now }, { merge: true });
      const previousStatus = participant.data()!.inviteStatus;
      const decrementField = previousStatus === "sent" ? "invitationSent" : previousStatus === "failed" ? "invitationFailed" : previousStatus === "unknown" ? "invitationUnknown" : null;
      transaction.set(statsRef, { invitationPending: FieldValue.increment(previousStatus === "pending" || previousStatus === "leased" ? 0 : 1), ...(decrementField ? { [decrementField]: FieldValue.increment(-1) } : {}), updatedAt: now }, { merge: true });
      transaction.set(db.collection(`events/${parsed.data.eventId}/auditLogs`).doc(), { action: "invitation_rotated", participantId: parsed.data.participantId, reason: parsed.data.reason, createdAt: now });
    });
    response.json({ ok: true, asset: await renderInvitationAsset(parsed.data.eventId, parsed.data.participantId, leaseId) });
  } catch (error) {
    handleHttpError(response, error);
  }
});
