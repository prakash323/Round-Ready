import { describe, expect, it } from "vitest";
import {
  DEMO_DRIVES,
  DEMO_PROFILE,
  demoApplications,
  demoDrives,
} from "@/lib/demo-data";
import { agenda, buildBoard, counterpart, simulateAccept } from "@/lib/engine";
import { NOW } from "./fixtures";

/**
 * The demo is what a reviewer and the demo video actually see, so the claims
 * made about it are asserted here against the real engine. If the seed data
 * drifts — someone nudges a CGPA or shifts a round by an hour — these fail
 * rather than the video quietly becoming wrong.
 */

const input = {
  profile: DEMO_PROFILE,
  drives: demoDrives(NOW),
  applications: demoApplications(NOW),
};
const board = buildBoard(input, NOW);
const slugs = (views: { drive: { id: string } }[]) => views.map((v) => v.drive.id).sort();

describe("the seeded board", () => {
  it("has every drive accounted for in exactly one group", () => {
    expect(board.stats.total).toBe(DEMO_DRIVES.length);
    const sum =
      board.stats.actionable +
      board.stats.unknown +
      board.stats.notEligible +
      board.stats.blocked +
      board.stats.expired +
      board.stats.resolved;
    expect(sum).toBe(board.stats.total);
  });

  it("shows four drives the student is not eligible for, each for a different stated reason", () => {
    expect(slugs(board.notEligible)).toEqual(["nutanix", "qualcomm", "rubrik", "uber"]);

    const uber = board.notEligible.find((v) => v.drive.id === "uber")!;
    expect(uber.eligibility.failures.map((f) => f.key)).toEqual(["cgpa"]);
    expect(uber.eligibility.failures[0].actual).toBe("7.42");
    expect(uber.eligibility.failures[0].required).toBe("7.5");

    const qualcomm = board.notEligible.find((v) => v.drive.id === "qualcomm")!;
    expect(qualcomm.eligibility.failures.map((f) => f.key)).toEqual(["branch"]);
  });

  it("shows exactly one drive whose verdict cannot be determined", () => {
    expect(slugs(board.unknown)).toEqual(["siemens"]);
    expect(board.unknown[0].eligibility.unknowns.map((u) => u.key)).toEqual(["gapYears"]);
  });

  it("shows one drive whose deadline has gone", () => {
    expect(slugs(board.expired)).toEqual(["morgan-stanley"]);
  });

  it("shows the applications the student already has", () => {
    expect(slugs(board.resolved)).toEqual(["hexaware"]);
    const zoho = board.views.find((v) => v.drive.id === "zoho")!;
    expect(zoho.application?.status).toBe("in_progress");
    expect(zoho.status).toBe("actionable");
  });

  it("blocks nothing, because no offer has been accepted yet", () => {
    expect(board.stats.blocked).toBe(0);
    expect(board.stats.offers).toBe(0);
    expect(board.policyWarning).toBeNull();
  });

  it("ranks Atlassian first, as the best-paid drive open to the student", () => {
    expect(board.stats.bestAvailableCtcLpa).toBe(28);
    expect(board.actionable[0].drive.id).toBe("atlassian");
  });
});

describe("the seeded clashes", () => {
  it("finds exactly two", () => {
    expect(board.clashes).toHaveLength(2);
  });

  it("flags Atlassian against Walmart with a 60 minute overlap", () => {
    const clash = board.clashes.find((c) =>
      [c.a.driveId, c.b.driveId].includes("atlassian"),
    )!;
    expect(counterpart(clash, "atlassian").driveId).toBe("walmart");
    expect(clash.overlapMinutes).toBe(60);
  });

  it("flags Sprinklr against Cisco with a 30 minute overlap", () => {
    const clash = board.clashes.find((c) => [c.a.driveId, c.b.driveId].includes("sprinklr"))!;
    expect(counterpart(clash, "sprinklr").driveId).toBe("cisco");
    expect(clash.overlapMinutes).toBe(30);
  });

  it("does NOT flag Zoho against Infosys, whose rounds merely touch", () => {
    // Zoho's aptitude round runs 09:00–11:00 and Infosys starts at 11:00. This
    // is the half-open interval doing its job, and it is the single most
    // valuable thing in the demo data.
    const zoho = board.views.find((v) => v.drive.id === "zoho")!;
    const infosys = board.views.find((v) => v.drive.id === "infosys")!;
    expect(zoho.clashes.map((c) => counterpart(c, "zoho").driveId)).not.toContain("infosys");
    expect(infosys.clashes).toHaveLength(0);
  });

  it("flags both sides of every clash", () => {
    for (const clash of board.clashes) {
      const a = board.views.find((v) => v.drive.id === clash.a.driveId)!;
      const b = board.views.find((v) => v.drive.id === clash.b.driveId)!;
      expect(a.clashes.length).toBeGreaterThan(0);
      expect(b.clashes.length).toBeGreaterThan(0);
    }
  });
});

describe("the seeded agenda", () => {
  it("has something in the next seven days", () => {
    const week = agenda(board, 7, NOW);
    expect(week.length).toBeGreaterThan(3);
  });

  it("is in chronological order", () => {
    const week = agenda(board, 42, NOW);
    const times = week.map((i) => i.at.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("never lists a drive the student is not eligible for", () => {
    const ineligible = new Set(slugs(board.notEligible));
    for (const item of agenda(board, 42, NOW)) {
      expect(ineligible.has(item.driveId)).toBe(false);
    }
  });
});

describe("the seeded offer simulator", () => {
  it("makes accepting Zoho at 11 LPA visibly expensive under the 12 LPA dream line", () => {
    const result = simulateAccept(input, "zoho", 11, NOW);
    expect(result.floorLpa).toBe(12);
    // Everything at or below 12 LPA closes; everything above survives.
    expect(result.closes.map((c) => c.driveId).sort()).toEqual([
      "deloitte",
      "infosys",
      "siemens",
      "tcs",
    ]);
    expect(result.survives.map((s) => s.driveId)).toContain("atlassian");
    expect(result.verdict).toBe("safe"); // nothing better paid closes
  });

  it("makes accepting TCS Digital costly, because Zoho and more close with it", () => {
    const result = simulateAccept(input, "tcs", 7.1, NOW);
    expect(result.highestClosed?.company).toBe("Zoho");
    expect(result.ctcForegone).toBeCloseTo(3.9, 5);
    expect(result.verdict).toBe("costly");
  });

  it("makes accepting Atlassian safe, since it is the best thing available", () => {
    const result = simulateAccept(input, "atlassian", 28, NOW);
    expect(result.ctcForegone).toBe(0);
    expect(result.verdict).toBe("safe");
    expect(result.survives).toHaveLength(0);
  });

  it("never counts an ineligible or expired drive as a cost", () => {
    const result = simulateAccept(input, "tcs", 7.1, NOW);
    const ids = result.closes.map((c) => c.driveId);
    for (const id of ["rubrik", "uber", "nutanix", "qualcomm", "morgan-stanley"]) {
      expect(ids).not.toContain(id);
    }
  });
});

describe("the demo data itself", () => {
  it("has a unique slug per drive", () => {
    const slugSet = new Set(DEMO_DRIVES.map((d) => d.slug));
    expect(slugSet.size).toBe(DEMO_DRIVES.length);
  });

  it("gives every round an end after its start", () => {
    for (const drive of demoDrives(NOW)) {
      for (const round of drive.rounds) {
        expect(round.endAt.getTime(), `${drive.company} / ${round.name}`).toBeGreaterThan(
          round.startAt.getTime(),
        );
      }
    }
  });

  it("points every seeded application at a drive that exists", () => {
    const ids = new Set(demoDrives(NOW).map((d) => d.id));
    for (const app of demoApplications(NOW)) {
      expect(ids.has(app.driveId), app.driveId).toBe(true);
    }
  });

  it("spans a wide enough CTC range for the dream line to be interesting", () => {
    const ctcs = DEMO_DRIVES.map((d) => d.ctcLpa);
    expect(Math.min(...ctcs)).toBeLessThan(DEMO_PROFILE.dreamCtcLpa!);
    expect(Math.max(...ctcs)).toBeGreaterThan(DEMO_PROFILE.dreamCtcLpa! * 2);
  });
});
