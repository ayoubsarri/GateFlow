import type { ManualInviteInput, ParticipantCategory } from "../types";

function normalizeCategory(val?: string): ParticipantCategory {
  if (!val) return "delegate";
  const s = val.toLowerCase().trim();
  if (s.includes("vip") || s.includes("شرف") || s.includes("خاص")) return "vip";
  if (s.includes("speak") || s.includes("متحدث") || s.includes("محاضر") || s.includes("orateur")) return "speaker";
  if (s.includes("press") || s.includes("صحاف") || s.includes("إعلام") || s.includes("media")) return "press";
  if (s.includes("org") || s.includes("منظم") || s.includes("staff")) return "organizer";
  return "delegate";
}

export function parseAttendeesCsv(csvText: string): ManualInviteInput[] {
  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const parseCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headerLine = lines[0];
  const headers = parseCsvLine(headerLine).map((h) => h.toLowerCase().replace(/["']/g, "").trim());

  const nameIndex = headers.findIndex((h) => h.includes("name") || h.includes("اسم") || h.includes("nom"));
  const emailIndex = headers.findIndex((h) => h.includes("mail") || h.includes("بريد") || h.includes("courriel"));
  const orgIndex = headers.findIndex((h) => h.includes("org") || h.includes("جهة") || h.includes("جامعة") || h.includes("company") || h.includes("institution"));
  const roleIndex = headers.findIndex((h) => h.includes("role") || h.includes("cat") || h.includes("فئة") || h.includes("صفة") || h.includes("type"));
  const titleIndex = headers.findIndex((h) => h.includes("title") || h.includes("لقب") || h.includes("رتبة"));

  const results: ManualInviteInput[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    if (row.length === 0 || row.every((c) => !c)) continue;

    const name = nameIndex !== -1 ? row[nameIndex] : row[0];
    const email = emailIndex !== -1 ? row[emailIndex] : (row[1] || `${row[0]?.toLowerCase().replace(/\s+/g, ".")}@guest.invalid`);
    const organization = orgIndex !== -1 ? row[orgIndex] : (row[2] || undefined);
    const rawCategory = roleIndex !== -1 ? row[roleIndex] : undefined;
    const title = titleIndex !== -1 ? row[titleIndex] : undefined;

    if (name && name.length >= 2) {
      results.push({
        name,
        email: email || `delegate-${i}@event.invalid`,
        organization,
        title: title || rawCategory,
        category: normalizeCategory(rawCategory)
      });
    }
  }

  return results;
}
