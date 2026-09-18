import { describe, expect, it } from "vitest";
import { demoTestTickets } from "./testTickets";

describe("demo test tickets", () => {
  it("contains ten unique, private QR payloads", () => {
    expect(demoTestTickets).toHaveLength(10);
    expect(new Set(demoTestTickets.map((ticket) => ticket.payload)).size).toBe(10);
    expect(new Set(demoTestTickets.map((ticket) => ticket.participantId)).size).toBe(10);
    for (const ticket of demoTestTickets) {
      expect(ticket.payload).toMatch(/^INAS1\.inas-quality-2026\.[a-f0-9]{64}$/);
    }
  });
});
