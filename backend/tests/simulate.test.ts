import { describe, expect, it } from "vitest";
import { buildBoard, simulateAccept, withHypotheticalOffer } from "@/lib/engine";
import { NOW, fromNow, makeApplication, makeCriteria, makeDrive, makeProfile } from "./fixtures";

/**
 * The simulator is the feature a spreadsheet cannot have, so it carries the
 * heaviest test burden: a wrong answer here is a student turning down the right
 * offer.
 */

const infosys = makeDrive({ id: "inf", company: "Infosys", ctcLpa: 6.5 });
const tcs = makeDrive({ id: "tcs", company: "TCS Digital", ctcLpa: 7.1 });
const zoho = makeDrive({ id: "zoho", company: "Zoho", ctcLpa: 11 });
const atlassian = makeDrive({ id: "atl", company: "Atlassian", ctcLpa: 28 });
const unreachable = makeDrive({
  id: "unr",
  company: "Rubrik",
  ctcLpa: 45,
  criteria: makeCriteria({ cgpaMin: 9.5 }),
});
const expired = makeDrive({
  id: "exp",
  company: "Expired Co",
  ctcLpa: 40,
  applicationDeadline: fromNow(-3),
});

const DRIVES = [infosys, tcs, zoho, atlassian, unreachable, expired];

describe("withHypotheticalOffer", () => {
  it("adds an accepted application where none existed", () => {
    const next = withHypotheticalOffer([], "inf", 6.5, NOW);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ driveId: "inf", status: "offer", offerCtcLpa: 6.5 });
  });

  it("replaces an existing application rather than duplicating it", () => {
    const next = withHypotheticalOffer([makeApplication("inf", "in_progress")], "inf", 6.5, NOW);
    expect(next).toHaveLength(1);
    expect(next[0].status).toBe("offer");
  });

  it("leaves the real application list untouched", () => {
    const original = [makeApplication("inf", "in_progress")];
    withHypotheticalOffer(original, "inf", 6.5, NOW);
    expect(original[0].status).toBe("in_progress");
  });

  it("appends to history without rewriting it", () => {
    const original = [makeApplication("inf", "applied")];
    const next = withHypotheticalOffer(original, "inf", 6.5, NOW);
    expect(next[0].history.map((h) => h.status)).toEqual(["applied", "offer"]);
  });
});

describe("under no placement policy", () => {
  const profile = makeProfile({ policy: "none" });

  it("closes nothing and says so plainly", () => {
    const result = simulateAccept({ profile, drives: DRIVES, applications: [] }, "inf", 6.5, NOW);
    expect(result.verdict).toBe("safe");
    expect(result.closes).toHaveLength(0);
    expect(result.rationale[0]).toContain("no offer-limiting policy");
  });
});

describe("under a one-offer policy", () => {
  const profile = makeProfile({ policy: "one_offer" });

  it("closes every other eligible live drive", () => {
    const result = simulateAccept({ profile, drives: DRIVES, applications: [] }, "inf", 6.5, NOW);
    expect(result.closes.map((c) => c.driveId).sort()).toEqual(["atl", "tcs", "zoho"]);
    expect(result.survives).toHaveLength(0);
  });

  it("does not count a drive you were never eligible for as a cost", () => {
    const result = simulateAccept({ profile, drives: DRIVES, applications: [] }, "inf", 6.5, NOW);
    expect(result.closes.map((c) => c.driveId)).not.toContain("unr");
  });

  it("does not count a drive whose deadline has already gone", () => {
    // Expired Co pays 40, which would dominate every number in the result, but
    // it cannot be applied to any more and so is not a cost of accepting.
    const result = simulateAccept({ profile, drives: DRIVES, applications: [] }, "inf", 6.5, NOW);
    expect(result.closes.map((c) => c.driveId)).not.toContain("exp");
    expect(result.highestClosed?.company).toBe("Atlassian");
    expect(result.ctcForegone).toBe(21.5);
  });

  it("calls a cheap offer against a much better live drive costly", () => {
    const result = simulateAccept({ profile, drives: DRIVES, applications: [] }, "inf", 6.5, NOW);
    expect(result.verdict).toBe("costly");
    expect(result.headline).toContain("28 LPA");
  });

  it("calls the best drive on the board safe", () => {
    const result = simulateAccept({ profile, drives: DRIVES, applications: [] }, "atl", 28, NOW);
    expect(result.verdict).toBe("safe");
    expect(result.ctcForegone).toBe(0);
    expect(result.headline).toContain("none pay more");
  });

  it("is safe when nothing else is live", () => {
    const result = simulateAccept(
      { profile, drives: [infosys, unreachable, expired], applications: [] },
      "inf",
      6.5,
      NOW,
    );
    expect(result.closes).toHaveLength(0);
    expect(result.verdict).toBe("safe");
  });
});

describe("under a dream-threshold policy", () => {
  const profile = makeProfile({ policy: "dream_threshold", dreamCtcLpa: 12 });

  it("closes only the drives at or below the resulting line", () => {
    const result = simulateAccept({ profile, drives: DRIVES, applications: [] }, "inf", 6.5, NOW);
    expect(result.floorLpa).toBe(12);
    expect(result.closes.map((c) => c.driveId).sort()).toEqual(["tcs", "zoho"]);
    expect(result.survives.map((s) => s.driveId).sort()).toEqual(["atl"]);
  });

  it("leaves the better drives open and reports them", () => {
    const result = simulateAccept({ profile, drives: DRIVES, applications: [] }, "inf", 6.5, NOW);
    expect(result.rationale.some((r) => r.includes("would remain open"))).toBe(true);
  });

  it("raises the line to the offer when the offer beats the dream cutoff", () => {
    const result = simulateAccept({ profile, drives: DRIVES, applications: [] }, "atl", 28, NOW);
    expect(result.floorLpa).toBe(28);
    expect(result.closes.map((c) => c.driveId).sort()).toEqual(["inf", "tcs", "zoho"]);
  });

  it("is safe when the drives it closes all pay less", () => {
    const result = simulateAccept({ profile, drives: DRIVES, applications: [] }, "zoho", 11, NOW);
    expect(result.ctcForegone).toBe(0);
    expect(result.verdict).toBe("safe");
  });

  it("treats a modest sacrifice as worth considering rather than costly", () => {
    // A dream cutoff of 20 against an 11 LPA offer draws the line at 20, so the
    // 13 LPA drive closes even though it pays more than the offer. Giving up 13
    // for 11 is an 18% sacrifice: a judgement call, not a blunder.
    const ambitious = makeProfile({ policy: "dream_threshold", dreamCtcLpa: 20 });
    const near = makeDrive({ id: "near", company: "Near Co", ctcLpa: 13 });
    const result = simulateAccept(
      { profile: ambitious, drives: [infosys, near], applications: [] },
      "inf",
      11,
      NOW,
    );
    expect(result.floorLpa).toBe(20);
    expect(result.closes.map((c) => c.driveId)).toEqual(["near"]);
    expect(result.ctcForegone).toBe(2);
    expect(result.verdict).toBe("consider");
  });
});

describe("the simulation never alters the real board", () => {
  it("leaves the live board identical after running", () => {
    const input = {
      profile: makeProfile({ policy: "one_offer" }),
      drives: DRIVES,
      applications: [makeApplication("tcs", "in_progress")],
    };
    const before = buildBoard(input, NOW);
    simulateAccept(input, "inf", 6.5, NOW);
    const after = buildBoard(input, NOW);
    expect(after.stats).toEqual(before.stats);
    expect(input.applications[0].status).toBe("in_progress");
  });
});

describe("inputs", () => {
  it("defaults the offer amount to the drive's advertised CTC", () => {
    const result = simulateAccept(
      { profile: makeProfile({ policy: "one_offer" }), drives: DRIVES, applications: [] },
      "zoho",
      undefined,
      NOW,
    );
    expect(result.accepted.ctcLpa).toBe(11);
  });

  it("accepts a negotiated amount that differs from the advertised CTC", () => {
    const result = simulateAccept(
      { profile: makeProfile({ policy: "dream_threshold", dreamCtcLpa: 12 }), drives: DRIVES, applications: [] },
      "zoho",
      15,
      NOW,
    );
    expect(result.accepted.ctcLpa).toBe(15);
    expect(result.floorLpa).toBe(15);
  });

  it("refuses to simulate a drive that does not exist", () => {
    expect(() =>
      simulateAccept({ profile: makeProfile(), drives: DRIVES, applications: [] }, "nope", 10, NOW),
    ).toThrow(/no drive with id/);
  });

  it("reports a serialisable floor under a one-offer policy", () => {
    // The internal floor is Infinity, which JSON turns into null. The API must
    // not ship a number that changes meaning when it crosses the wire.
    const result = simulateAccept(
      { profile: makeProfile({ policy: "one_offer" }), drives: DRIVES, applications: [] },
      "inf",
      6.5,
      NOW,
    );
    expect(result.floorLpa).toBeNull();
    expect(JSON.parse(JSON.stringify(result)).floorLpa).toBeNull();
  });
});
