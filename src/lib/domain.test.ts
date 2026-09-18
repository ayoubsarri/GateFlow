import { describe, expect, it } from "vitest";
import { calculateStats, createRequestId, matchesParticipant, normalizeText } from "./domain";
import type { Participant } from "../types";

const participant = (overrides: Partial<Participant> = {}): Participant => ({
  id: "p1",
  name: "الدكتورة أمينة بن يوسف",
  email: "amina@example.dz",
  organization: "جامعة الجزائر",
  status: "accepted",
  inviteStatus: "sent",
  confirmationStatus: "unknown",
  confirmedAt: null,
  confirmationUpdatedAt: null,
  checkedInAt: null,
  checkInId: null,
  stationName: null,
  checkInMethod: null,
  ...overrides
});

describe("participant domain", () => {
  it("normalizes Arabic letter variants for search", () => {
    expect(normalizeText("أمينة")).toBe(normalizeText("امينة"));
    expect(matchesParticipant(participant(), "امينه")).toBe(true);
  });

  it("keeps attendance and invitation totals consistent", () => {
    const rows = [
      participant({ checkedInAt: "2026-07-25T09:00:00.000Z", stationName: "Main", checkInId: "c1", checkInMethod: "qr" }),
      participant({ id: "p2", email: "b@example.dz", inviteStatus: "pending" }),
      participant({ id: "p3", email: "c@example.dz", status: "revoked" })
    ];
    const stats = calculateStats(rows);
    expect(stats).toMatchObject({ accepted: 2, checkedIn: 1, absent: 1, invitationSent: 1, invitationPending: 1 });
    expect(stats.stations).toEqual([{ name: "Main", count: 1 }]);
  });

  it("creates UUID idempotency keys", () => {
    expect(createRequestId()).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
