import { randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";
import { adminAuth, db } from "./admin.js";
import { PIN_HASH, PIN_SALT, REGION, SESSION_HOURS } from "./config.js";
import { sha256 } from "./utils.js";

const loginSchema = z.object({
  pin: z.string().min(4).max(32),
  stationName: z.enum(["A", "B"])
});

export const startStaffSession = onCall(
  { region: REGION, secrets: [PIN_SALT, PIN_HASH], enforceAppCheck: true },
  async (request) => {
    const parsed = loginSchema.safeParse(request.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", "A valid PIN and station are required.");

    const ip = request.rawRequest.ip || request.rawRequest.get("x-forwarded-for") || "unknown";
    const limiterRef = db.doc(`securityRateLimits/${sha256(String(ip))}`);
    const limiter = await limiterRef.get();
    const limiterData = limiter.data();
    if (limiterData?.blockedUntil instanceof Timestamp && limiterData.blockedUntil.toMillis() > Date.now()) {
      throw new HttpsError("resource-exhausted", "Too many attempts. Try again later.");
    }

    const expected = Buffer.from(PIN_HASH.value(), "hex");
    const actual = scryptSync(parsed.data.pin, PIN_SALT.value(), expected.length);
    const valid = expected.length > 0 && expected.length === actual.length && timingSafeEqual(expected, actual);

    if (!valid) {
      await db.runTransaction(async (transaction) => {
        const current = await transaction.get(limiterRef);
        const now = Date.now();
        const currentData = current.data();
        const windowStart = currentData?.windowStart instanceof Timestamp ? currentData.windowStart.toMillis() : 0;
        const withinWindow = now - windowStart < 15 * 60_000;
        const failures = withinWindow ? Number(currentData?.failures || 0) + 1 : 1;
        transaction.set(limiterRef, {
          failures,
          windowStart: Timestamp.fromMillis(withinWindow ? windowStart : now),
          blockedUntil: failures >= 8 ? Timestamp.fromMillis(now + 15 * 60_000) : null,
          updatedAt: Timestamp.now()
        });
      });
      throw new HttpsError("permission-denied", "The event PIN is incorrect.");
    }

    await limiterRef.set({ failures: 0, blockedUntil: null, updatedAt: Timestamp.now() }, { merge: true });
    const eventId = "inas-quality-2026";
    const sessionId = randomUUID();
    const expiresAt = Timestamp.fromMillis(Date.now() + SESSION_HOURS * 60 * 60_000);
    const uid = `staff-${sessionId}`;
    await db.doc(`staffSessions/${sessionId}`).set({
      uid,
      eventId,
      stationName: parsed.data.stationName,
      createdAt: Timestamp.now(),
      expiresAt,
      revokedAt: null
    });
    const customToken = await adminAuth.createCustomToken(uid, {
      role: "staff",
      eventId,
      sessionId,
      stationName: parsed.data.stationName
    });
    return { customToken, expiresAt: expiresAt.toDate().toISOString() };
  }
);
