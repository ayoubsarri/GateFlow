import { describe, expect, it } from "vitest";
import { importIdentityErrors, parseQrPayload } from "./invariants.js";

describe("QR payload invariants", () => {
  it("accepts a versioned opaque token without participant data", () => {
    const token = "A".repeat(43);
    expect(parseQrPayload(`INAS1.inas-quality-2026.${token}`)).toEqual({ eventId: "inas-quality-2026", token });
  });

  it("rejects malformed, short, and cross-format payloads", () => {
    expect(parseQrPayload("https://example.com/person@example.com")).toBeNull();
    expect(parseQrPayload("INAS1.inas-quality-2026.short")).toBeNull();
  });
});

describe("import identity validation", () => {
  it("rejects duplicate emails case-insensitively", () => {
    const errors = importIdentityErrors([
      { name: "Amina Benali", email: "Amina@example.dz" },
      { name: "Other Guest", email: "amina@example.dz" }
    ]);
    expect(errors).toContain("row 3: duplicate email");
  });

  it("rejects malformed rows before any roster is activated", () => {
    const errors = importIdentityErrors([{ name: "", email: "not-an-email" }]);
    expect(errors).toEqual(["row 2: invalid name", "row 2: invalid email"]);
  });
});
