export interface ImportIdentity {
  name: string;
  email: string;
}

export function parseQrPayload(payload: string): { eventId: string; token: string } | null {
  const match = /^INAS1\.([a-z0-9-]+)\.([A-Za-z0-9_-]{43})$/.exec(payload);
  return match ? { eventId: match[1], token: match[2] } : null;
}

export function importIdentityErrors(participants: ImportIdentity[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  participants.forEach((participant, index) => {
    const row = index + 2;
    const email = participant.email.trim().toLocaleLowerCase();
    if (participant.name.trim().length < 2) errors.push(`row ${row}: invalid name`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push(`row ${row}: invalid email`);
    if (seen.has(email)) errors.push(`row ${row}: duplicate email`);
    seen.add(email);
  });
  return errors;
}
