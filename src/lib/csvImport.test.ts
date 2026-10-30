import { describe, expect, it } from "vitest";
import { parseAttendeesCsv } from "./csvImport";

describe("parseAttendeesCsv", () => {
  it("parses CSV with international event headers and categories", () => {
    const csv = `Full Name,Email,Organization,Category,Title
Dr. Sarah Connor,sarah@cyber.org,Tech Alliance,VIP,Keynote Speaker
John Doe,john@example.com,Global Corp,Delegate,Software Engineer
Jane Smith,jane@press.net,Daily News,Press,Chief Reporter
Alex Vance,alex@resistance.org,Organizing Committee,Organizer,Lead Coordinator`;

    const parsed = parseAttendeesCsv(csv);
    expect(parsed).toHaveLength(4);
    expect(parsed[0].name).toBe("Dr. Sarah Connor");
    expect(parsed[0].email).toBe("sarah@cyber.org");
    expect(parsed[0].category).toBe("vip");
    expect(parsed[1].category).toBe("delegate");
    expect(parsed[2].category).toBe("press");
    expect(parsed[3].category).toBe("organizer");
  });

  it("handles Arabic headers and commas inside quotes", () => {
    const csv = `الاسم,البريد,الجهة,الفئة
"أحمد بن علي, دكتور",ahmed@univ.dz,"جامعة الجزائر, كلية الهندسة",متحدث
يوسف كريم,youssef@org.dz,جمعية المستقبل,مشارك`;

    const parsed = parseAttendeesCsv(csv);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].name).toBe("أحمد بن علي, دكتور");
    expect(parsed[0].email).toBe("ahmed@univ.dz");
    expect(parsed[0].organization).toBe("جامعة الجزائر, كلية الهندسة");
    expect(parsed[0].category).toBe("speaker");
    expect(parsed[1].category).toBe("delegate");
  });
});
