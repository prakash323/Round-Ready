import { describe, expect, it } from "vitest";
import { buildImportPlan, normaliseAll, normaliseDrive, readSalary } from "@/lib/cdc";
import { NEOPAT_BASE_URL, NEOPAT_DRIVES } from "./fixtures/neopat-drives";
import type { ImportEnvelope } from "@/lib/cdc";

/**
 * The adapter, against the portal's real response shape.
 *
 * Every assertion here corresponds to something observed on the live portal
 * rather than assumed about it: the one-element arrays, the structured salary
 * object, the industry-not-category field, and the complete absence of
 * academic cutoffs from the student-facing payload.
 */

const drives = () => normaliseAll(NEOPAT_DRIVES, NEOPAT_BASE_URL);

describe("the portal's one-element arrays", () => {
  it("reads the role out of profile_designation", () => {
    // Not `job_title`, and not a plain string: the portal sends
    // `profile_designation: ["SDE Intern"]`.
    expect(drives()[0].role).toBe("SDE Intern");
  });

  it("reads the location out of company_location", () => {
    expect(drives()[0].location).toBe("Bangalore");
  });

  it("still reads a scalar if the portal ever sends one", () => {
    const d = normaliseDrive(
      { drive_id: "x", company_name: "Zoho", profile_designation: "MTS", salary_information: [] },
      NEOPAT_BASE_URL,
    );
    expect(d.role).toBe("MTS");
  });
});

describe("structured compensation", () => {
  it("converts fixedSalary from rupees per annum to LPA", () => {
    // 2600000 is what the portal renders as "₹26L PA".
    expect(drives()[0].ctcLpa).toBe(26);
  });

  it("takes the lower bound of a range and says so", () => {
    const infosys = drives()[1];
    expect(infosys.ctcLpa).toBe(7);
    expect(infosys.unreadable.join(" ")).toMatch(/range/i);
  });

  it("refuses to turn a monthly stipend into an annual CTC", () => {
    // PixelCompute pays a 40,000/month stipend and no salary. Annualising it
    // would create a 4.8 LPA "offer" that could gate a placed student's board.
    const pixel = drives()[2];
    expect(pixel.ctcLpa).toBeNull();
    expect(pixel.unreadable.join(" ")).toMatch(/not an annual CTC/i);
  });

  it("keeps the stipend visible in the raw text rather than dropping it", () => {
    expect(drives()[0].ctcRaw).toMatch(/stipend/i);
  });

  it("refuses a salary stated on an unexpected basis", () => {
    const reading = readSalary([{ fixedSalary: 50000, salaryBasis: "monthly" }]);
    expect(reading.ctcLpa).toBeNull();
    expect(reading.notes.join(" ")).toMatch(/monthly/i);
  });

  it("reports no figure at all when the portal states none", () => {
    const reading = readSalary([{ salary: false, fixedSalary: null, fixedStipend: null }]);
    expect(reading.ctcLpa).toBeNull();
    expect(reading.ctcRaw).toBeNull();
  });
});

describe("company_category is an industry, not a placement classification", () => {
  it("never becomes RoundReady's service/product category", () => {
    // The portal sends "IT". Mapping that onto service- or product-based would
    // silently decide whether a placed student's bar is 1.5x or 2x their
    // package — that is, whether they may sit for the drive at all.
    for (const drive of drives()) {
      expect(drive.category).toBeNull();
    }
  });

  it("tells the student what the portal did say, and that it is not enough", () => {
    expect(drives()[0].unreadable.join(" ")).toMatch(/"IT", which is an industry/);
  });
});

describe("fields the portal does not send", () => {
  it("leaves every academic cutoff unstated rather than reading it as zero", () => {
    // The student-facing drive list carries no CGPA, backlog or branch rule.
    // Unstated means "not evaluated", which is what produces an honest
    // "cannot determine" instead of an invented cutoff.
    const d = drives()[0];
    expect(d.criteria.cgpaMin).toBeNull();
    expect(d.criteria.maxActiveBacklogs).toBeNull();
    expect(d.criteria.allowedBranches).toEqual([]);
    expect(d.criteria.tenthPercentMin).toBeNull();
  });

  it("says so, so the student knows to fill it in from the official notice", () => {
    expect(drives()[0].unreadable.join(" ")).toMatch(/cannot determine/i);
  });

  it("leaves rounds empty rather than inventing a schedule", () => {
    // `rounds` exists on the record but was empty for every drive captured,
    // so its element shape is unknown. A guess would put wrong times on a
    // student's calendar.
    expect(drives()[0].rounds).toEqual([]);
  });
});

describe("identity and provenance", () => {
  it("keeps the portal's drive_id as the stable external id", () => {
    expect(drives()[0].externalId).toBe("dbc971fc-730f-4dd6-997a-f68750575db7");
  });

  it("builds the official drive URL the portal actually uses", () => {
    // Confirmed by navigation: opening a drive lands on
    // /placements/drives/{drive_id}.
    expect(drives()[0].sourceUrl).toBe(`${NEOPAT_BASE_URL}/dbc971fc-730f-4dd6-997a-f68750575db7`);
  });

  it("reads the ISO deadline the portal sends", () => {
    expect(drives()[0].applicationDeadline).toBe("2026-07-04T03:30:58.000Z");
  });
});

describe("a whole capture", () => {
  const envelope = (): ImportEnvelope => ({
    source: "neopat",
    schemaVersion: 1,
    sourceUrl: NEOPAT_BASE_URL,
    capturedAt: "2026-10-24T12:00:00.000Z",
    drives: NEOPAT_DRIVES,
  });

  it("imports the two drives with a real CTC and holds back the stipend-only one", () => {
    const plan = buildImportPlan(envelope(), drives(), []);
    expect(plan.counts.new).toBe(2);
    expect(plan.counts.needs_review).toBe(1);
    expect(plan.problems).toEqual([]);
  });

  it("re-syncs the same capture with nothing changed", () => {
    const first = drives();
    const existing = first.slice(0, 2).map((d, i) => ({
      id: `rr-${i}`,
      externalId: d.externalId,
      sourceUrl: d.sourceUrl,
      company: d.company,
      role: d.role,
      ctcLpa: d.ctcLpa ?? 0,
      location: d.location,
      applicationDeadline: d.applicationDeadline,
      criteria: d.criteria,
    }));
    const plan = buildImportPlan(envelope(), drives(), existing);
    expect(plan.counts.unchanged).toBe(2);
    expect(plan.counts.changed).toBe(0);
    expect(plan.counts.new).toBe(0);
  });
});
