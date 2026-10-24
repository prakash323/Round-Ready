import { describe, expect, it } from "vitest";
import { buildImportPlan, diffFields, normaliseAll, normaliseDrive } from "@/lib/cdc";
import type { ExistingDrive, ImportEnvelope, NormalisedDrive } from "@/lib/cdc";

/**
 * Turning a capture into a reviewable plan.
 *
 * The behaviour that matters most is re-sync: the same drives arrive every
 * time, and only the handful that genuinely moved may show as changed. A plan
 * that reported twenty changes on an unchanged portal would train the student
 * to click Import without reading, which is the one habit this screen exists
 * to prevent.
 */

const BASE = "https://vit.neopat.ai/placements/drives";

function envelope(drives: unknown[]): ImportEnvelope {
  return {
    source: "neopat",
    schemaVersion: 1,
    sourceUrl: BASE,
    capturedAt: "2026-10-24T12:00:00.000Z",
    drives,
  };
}

function plan(drives: unknown[], existing: ExistingDrive[] = []) {
  return buildImportPlan(envelope(drives), normaliseAll(drives, BASE), existing);
}

/**
 * A drive in the portal's real shape — one-element arrays and a structured
 * `salary_information` object, as captured from the live response. The plan
 * tests below are about matching and change detection, but they are fed the
 * genuine shape so that a change to the adapter cannot leave them passing
 * against a payload the portal never sends.
 */
const portalDrive = (over: Record<string, unknown> = {}) => ({
  drive_id: "D-1001",
  company_name: "Zoho",
  profile_designation: ["Member Technical Staff"],
  salary_information: [{ salaryBasis: "annually", fixedSalary: 1100000 }],
  company_location: ["Chennai"],
  lastDate: "2026-11-10T00:00:00.000Z",
  drive_objective: "MTS hiring",
  rounds: [],
  ...over,
});

const existingFrom = (drive: NormalisedDrive, id: string): ExistingDrive => ({
  id,
  externalId: drive.externalId,
  sourceUrl: drive.sourceUrl,
  company: drive.company,
  role: drive.role,
  ctcLpa: drive.ctcLpa ?? 0,
  location: drive.location,
  applicationDeadline: drive.applicationDeadline,
  criteria: drive.criteria,
});

describe("normalising one portal record", () => {
  it("reads the fields the portal states", () => {
    const d = normaliseDrive(portalDrive(), BASE);
    expect(d.externalId).toBe("D-1001");
    expect(d.company).toBe("Zoho");
    expect(d.role).toBe("Member Technical Staff");
    expect(d.ctcLpa).toBe(11);
    expect(d.location).toBe("Chennai");
  });

  it("builds the official URL from the drive id", () => {
    expect(normaliseDrive(portalDrive(), BASE).sourceUrl).toBe(`${BASE}/D-1001`);
  });

  it("never invents an academic cutoff the portal does not send", () => {
    const d = normaliseDrive(portalDrive(), BASE);
    expect(d.criteria.cgpaMin).toBeNull();
    expect(d.criteria.maxActiveBacklogs).toBeNull();
    expect(d.criteria.tenthPercentMin).toBeNull();
    expect(d.criteria.allowedBranches).toEqual([]);
  });

  it("leaves the employer category unset, whatever the portal's industry says", () => {
    const d = normaliseDrive(portalDrive({ company_category: "IT" }), BASE);
    expect(d.category).toBeNull();
    expect(d.unreadable.join(" ")).toMatch(/service-based or product-based/);
  });

  it("survives a record that is not an object at all", () => {
    const d = normaliseDrive("not a drive", BASE);
    expect(d.company).toBe("");
    expect(d.unreadable.length).toBeGreaterThan(0);
  });
});

describe("a first import", () => {
  it("reports everything as new", () => {
    const result = plan([portalDrive(), portalDrive({ drive_id: "D-1002", company_name: "Cisco" })]);
    expect(result.counts.new).toBe(2);
    expect(result.counts.total).toBe(2);
    expect(result.problems).toEqual([]);
  });
});

describe("re-syncing", () => {
  it("reports an unchanged portal as unchanged, not as a pile of edits", () => {
    const first = normaliseDrive(portalDrive(), BASE);
    const result = plan([portalDrive()], [existingFrom(first, "rr-1")]);
    expect(result.counts.unchanged).toBe(1);
    expect(result.counts.changed).toBe(0);
    expect(result.candidates[0].matchedOn).toBe("external_id");
  });

  it("reports only the fields that actually moved", () => {
    const first = normaliseDrive(portalDrive(), BASE);
    const result = plan([portalDrive({ salary_information: [{ salaryBasis: "annually", fixedSalary: 1300000 }] })], [existingFrom(first, "rr-1")]);
    expect(result.counts.changed).toBe(1);
    expect(result.candidates[0].changes).toEqual([{ field: "ctcLpa", from: 11, to: 13 }]);
  });

  it("matches on the portal's id even when the role is renamed", () => {
    const first = normaliseDrive(portalDrive(), BASE);
    const result = plan(
      [portalDrive({ profile_designation: ["Software Engineer"] })],
      [existingFrom(first, "rr-1")],
    );
    expect(result.candidates[0].matchedDriveId).toBe("rr-1");
    expect(result.candidates[0].matchedOn).toBe("external_id");
    expect(result.candidates[0].changes).toContainEqual({
      field: "role",
      from: "Member Technical Staff",
      to: "Software Engineer",
    });
  });

  it("falls back to company and role when the portal gives no id, and says so", () => {
    const noId = normaliseDrive(portalDrive({ drive_id: null }), BASE);
    const result = plan([portalDrive({ drive_id: null })], [existingFrom(noId, "rr-1")]);
    expect(result.candidates[0].matchedOn).toBe("company_role");
    expect(result.candidates[0].notes.join(" ")).toMatch(/gave no id/);
  });

  it("does not clear a criterion just because the portal stopped stating it", () => {
    // Far more likely to mean the page rendered differently than that the
    // cutoff was lifted — and silently clearing it would make a student
    // eligible for something they are not.
    const first = normaliseDrive(portalDrive(), BASE);
    const result = plan([portalDrive({ lastDate: null })], [existingFrom(first, "rr-1")]);
    expect(result.candidates[0].changes.map((c) => c.field)).not.toContain("criteria.cgpaMin");
    expect(result.counts.unchanged).toBe(1);
  });

  it("never reports a change to a field the student owns", () => {
    // Application status, notes and manual corrections are not in the synced
    // set at all, so no sync can overwrite them.
    const first = normaliseDrive(portalDrive(), BASE);
    const changes = diffFields(normaliseDrive(portalDrive({ salary_information: [{ salaryBasis: "annually", fixedSalary: 1300000 }] }), BASE), {
      ...existingFrom(first, "rr-1"),
    });
    for (const change of changes) {
      expect(["status", "notes", "category", "currentRound"]).not.toContain(change.field);
    }
  });
});

describe("duplicates within one capture", () => {
  it("imports the first and flags the second", () => {
    const result = plan([portalDrive(), portalDrive()]);
    expect(result.counts.new).toBe(1);
    expect(result.counts.duplicate).toBe(1);
    expect(result.candidates[1].notes.join(" ")).toMatch(/appears earlier/);
  });

  it("catches a duplicate that differs only in casing and spacing", () => {
    const result = plan([
      portalDrive({ drive_id: null }),
      portalDrive({ drive_id: null, company_name: "  zoho  ", profile_designation: ["member technical staff"] }),
    ]);
    expect(result.counts.duplicate).toBe(1);
  });

  it("does not treat two genuinely different roles at one company as duplicates", () => {
    const result = plan([
      portalDrive({ drive_id: "D-1" }),
      portalDrive({ drive_id: "D-2", profile_designation: ["Data Engineer"] }),
    ]);
    expect(result.counts.new).toBe(2);
    expect(result.counts.duplicate).toBe(0);
  });
});

describe("records that cannot be imported safely", () => {
  it("holds back a drive with no readable compensation", () => {
    // The engine ranks on CTC and the secured-placement gate compares against
    // it, so a drive without one cannot be evaluated at all.
    const result = plan([portalDrive({ salary_information: [] })]);
    expect(result.counts.needs_review).toBe(1);
    expect(result.candidates[0].notes.join(" ")).toMatch(/compensation/i);
  });

  it("holds back a drive with no company", () => {
    const result = plan([portalDrive({ company_name: null, name: null })]);
    expect(result.counts.needs_review).toBe(1);
  });

  it("reports a monthly stipend rather than annualising it into an offer", () => {
    const result = plan([portalDrive({ salary_information: [{ stipend: true, stipendBasis: "monthly", fixedStipend: 45000 }] })]);
    expect(result.counts.needs_review).toBe(1);
    expect(result.candidates[0].notes.join(" ")).toMatch(/monthly/i);
  });

  it("lets the rest of the capture through when one row is broken", () => {
    // A partial failure must not cost the student the other nineteen drives.
    const result = plan([portalDrive({ salary_information: [] }), portalDrive({ drive_id: "D-2" })]);
    expect(result.counts.needs_review).toBe(1);
    expect(result.counts.new).toBe(1);
  });
});

describe("a capture that is wrong at the envelope level", () => {
  it("refuses a different source", () => {
    const bad = { ...envelope([]), source: "somewhere-else" as "neopat" };
    const result = buildImportPlan(bad, [], []);
    expect(result.problems.join(" ")).toMatch(/not supported/);
  });

  it("refuses a schema version it does not read, and says to re-copy the snippet", () => {
    const bad = { ...envelope([portalDrive()]), schemaVersion: 99 };
    const result = buildImportPlan(bad, normaliseAll(bad.drives, BASE), []);
    expect(result.problems.join(" ")).toMatch(/snippet again/);
  });

  it("explains an empty capture instead of silently succeeding", () => {
    const result = plan([]);
    expect(result.problems.join(" ")).toMatch(/let it finish loading/i);
  });
});
