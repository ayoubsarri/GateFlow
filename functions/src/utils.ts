import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest, type Request } from "firebase-functions/v2/https";
import { db } from "./admin.js";
import { APPS_SCRIPT_HMAC_SECRET } from "./config.js";

export interface StaffContext {
  uid: string;
  eventId: string;
  sessionId: string;
  stationName: string;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

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

export function nameTokens(name: string): string[] {
  const words = normalizeText(name).split(/\s+/).filter(Boolean);
  const tokens = new Set<string>();
  for (const word of words) {
    tokens.add(word);
    for (let index = 2; index <= Math.min(word.length, 12); index += 1) tokens.add(word.slice(0, index));
  }
  if (words.length > 1) tokens.add(words.join(" "));
  return Array.from(tokens).slice(0, 80);
}

export function publicParticipant(id: string, data: FirebaseFirestore.DocumentData) {
  const iso = (value: unknown) => value instanceof Timestamp ? value.toDate().toISOString() : null;
  return {
    id,
    name: data.name,
    email: data.email,
    title: data.title || "",
    organization: data.organization || "",
    status: data.status || "accepted",
    inviteStatus: data.inviteStatus || "pending",
    checkedInAt: iso(data.checkedInAt),
    checkInId: data.checkInId || null,
    stationName: data.stationName || null,
    checkInMethod: data.checkInMethod || null
  };
}

export async function requireStaff(request: CallableRequest<unknown>): Promise<StaffContext> {
  const token = request.auth?.token;
  if (!request.auth || token?.role !== "staff" || typeof token.sessionId !== "string" || typeof token.eventId !== "string") {
    throw new HttpsError("unauthenticated", "A valid staff session is required.");
  }
  const session = await db.doc(`staffSessions/${token.sessionId}`).get();
  if (!session.exists) throw new HttpsError("unauthenticated", "The staff session no longer exists.");
  const data = session.data()!;
  if (!(data.expiresAt instanceof Timestamp) || data.expiresAt.toMillis() <= Date.now() || data.revokedAt) {
    throw new HttpsError("unauthenticated", "The staff session has expired.");
  }
  return {
    uid: request.auth.uid,
    eventId: token.eventId,
    sessionId: token.sessionId,
    stationName: String(token.stationName || data.stationName || "Staff station")
  };
}

export async function verifyAppsScriptRequest(request: Request): Promise<void> {
  const timestamp = String(request.get("x-inas-timestamp") || "");
  const nonce = String(request.get("x-inas-nonce") || "");
  const signature = String(request.get("x-inas-signature") || "").toLowerCase();
  const timestampNumber = Number(timestamp);
  if (!timestamp || !nonce || !signature || !Number.isFinite(timestampNumber) || Math.abs(Date.now() - timestampNumber) > 5 * 60_000) {
    throw new Error("AUTH_INVALID");
  }
  const rawBody = request.rawBody?.toString("utf8") || JSON.stringify(request.body || {});
  const expected = createHmac("sha256", APPS_SCRIPT_HMAC_SECRET.value())
    .update(`${timestamp}.${nonce}.${rawBody}`)
    .digest("hex");
  const providedBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) throw new Error("AUTH_INVALID");

  const nonceRef = db.doc(`hmacNonces/${sha256(nonce)}`);
  try {
    await nonceRef.create({ createdAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60_000) });
  } catch {
    throw new Error("AUTH_REPLAY");
  }
}

interface HttpResponse {
  status(code: number): HttpResponse;
  json(body: unknown): unknown;
}

export function handleHttpError(response: HttpResponse, error: unknown) {
  const message = error instanceof Error ? error.message : "INTERNAL";
  const status = message.startsWith("AUTH_") ? 401 : message.startsWith("VALIDATION_") ? 400 : 500;
  response.status(status).json({ ok: false, error: message });
}
