import { describe, expect, it } from "vitest";
import { SECURED_MULTIPLIERS, buildBoard, evaluatePolicy, securedGate } from "@/lib/engine";
import { profileSchema } from "@/lib/schemas";
import { NOW, makeApplication, makeDrive, makeProfile } from "./fixtures";
import type { SecuredPlacement } from "@/lib/engine";

/**
 * The secured-placement rule.
 *
 * A student who has already accepted a placement may only sit for a drive that
 * pays a multiple of what they secured: 1.5× from a service-based employer,
 * 2× from a product-based one.
 *
 * The bar is a FLOOR and it is INCLUSIVE — "at least 1.5×" admits a drive
 * paying exactly 1.5×. That boundary is deliberately the opposite of
 * `dream_threshold`, which blocks a drive sitting exactly on its line (R10),
 * which is why the two gates are never collapsed into a single number.
 */

const service = (ctcLpa: number, company = "Infosys"): SecuredPlacement => ({
  company,
  ctcLpa,
  category: "service_based",
});
const product = (ctcLpa: number, company = "Zoho"): SecuredPlacement => ({
  company,
  ctcLpa,
  category: "product_based",
});

describe("the threshold", () => {
  it("is 1.5× for a service-based employer", () => {
    expect(securedGate(service(6))?.thresholdLpa).toBe(9);
    expect(securedGate(service(6))?.multiplier).toBe(1.5);
  });

  it("is 2× for a product-based employer", () => {
    expect(securedGate(product(10))?.thresholdLpa).toBe(20);
    expect(securedGate(product(10))?.multiplier).toBe(2);
  });

  it("is null when the student is unplaced", () => {
    expect(securedGate(null)).toBeNull();
  });

  it("does not leave floating-point dust in the displayed number", () => {
    // 7.3 × 1.5 is 10.949999999999999 in binary floating point, and a student
    // told their bar is "10.949999999999999 LPA" would reasonably assume the
    // tool is broken.
    expect(securedGate(service(7.3))?.thresholdLpa).toBe(10.95);
    expect(securedGate(product(8.35))?.thresholdLpa).toBe(16.7);
  });

  it("reads its multipliers from an exported table, so a college can change them", () => {
    expect(SECURED_MULTIPLIERS).toEqual({ service_based: 1.5, product_based: 2 });
    const custom = { service_based: 1.25, product_based: 3 };
    expect(securedGate(service(8), custom)?.thresholdLpa).toBe(10);
    expect(securedGate(product(8), custom)?.thresholdLpa).toBe(24);
  });
});

describe("the gate, service-based at 6 LPA (threshold 9)", () => {
  const profile = makeProfile({ securedPlacement: service(6) });
  const check = (ctcLpa: number) =>
    evaluatePolicy(profile, makeDrive({ id: "d", ctcLpa }), [], []).state;

  it("blocks a drive paying less than the threshold", () => {
    expect(check(7)).toBe("blocked");
    expect(check(8.99)).toBe("blocked");
  });

  it("opens a drive paying exactly the threshold", () => {
    // Inclusive: "at least 1.5×" includes exactly 1.5×.
    expect(check(9)).toBe("open");
  });

  it("opens a drive paying more than the threshold", () => {
    expect(check(9.01)).toBe("open");
    expect(check(20)).toBe("open");
  });

  it("blocks a drive paying exactly what was secured", () => {
    expect(check(6)).toBe("blocked");
  });
});

describe("the gate, product-based at 10 LPA (threshold 20)", () => {
  const profile = makeProfile({ securedPlacement: product(10) });
  const check = (ctcLpa: number) =>
    evaluatePolicy(profile, makeDrive({ id: "d", ctcLpa }), [], []).state;

  it("blocks a drive that a service-based placement would have allowed", () => {
    // 15 LPA clears 1.5× of 10, but not 2×. The category is what decides it.
    expect(check(15)).toBe("blocked");
    expect(
      evaluatePolicy(
        makeProfile({ securedPlacement: service(10) }),
        makeDrive({ id: "d", ctcLpa: 15 }),
        [],
        [],
      ).state,
    ).toBe("open");
  });

  it("opens at exactly 2×", () => {
    expect(check(20)).toBe("open");
  });
});

describe("what the student is told", () => {
  it("names the employer, the multiplier and the arithmetic", () => {
    const result = evaluatePolicy(
      makeProfile({ securedPlacement: service(6, "Infosys") }),
      makeDrive({ id: "d", ctcLpa: 7 }),
      [],
      [],
    );
    expect(result.reason).toContain("Infosys");
    expect(result.reason).toContain("6 LPA");
    expect(result.reason).toContain("service-based");
    expect(result.reason).toContain("1.5×");
    expect(result.reason).toContain("9 LPA");
    expect(result.reason).toContain("7 LPA");
  });

  it("exposes the threshold even on drives that are open, so it can be shown", () => {
    const result = evaluatePolicy(
      makeProfile({ securedPlacement: product(10) }),
      makeDrive({ id: "d", ctcLpa: 30 }),
      [],
      [],
    );
    expect(result.state).toBe("open");
    expect(result.securedThresholdLpa).toBe(20);
    expect(result.securedMultiplier).toBe(2);
    expect(result.securedPlacement?.company).toBe("Zoho");
  });

  it("reports nothing secured for an unplaced student", () => {
    const result = evaluatePolicy(makeProfile(), makeDrive({ id: "d" }), [], []);
    expect(result.securedPlacement).toBeNull();
    expect(result.securedThresholdLpa).toBeNull();
  });
});

describe("alongside the college policy", () => {
  const drives = [
    makeDrive({ id: "low", ctcLpa: 8 }),
    makeDrive({ id: "mid", ctcLpa: 14 }),
    makeDrive({ id: "high", ctcLpa: 30 }),
  ];

  it("gates on its own, with no college policy and no offers", () => {
    const board = buildBoard(
      { profile: makeProfile({ policy: "none", securedPlacement: service(10) }), drives, applications: [] },
      NOW,
    );
    // Threshold 15: only the 30 LPA drive clears it.
    expect(board.actionable.map((v) => v.drive.id)).toEqual(["high"]);
    expect(board.blocked.map((v) => v.drive.id).sort()).toEqual(["low", "mid"]);
  });

  it("applies the stricter of the two bars", () => {
    // dream_threshold draws its line at 12 from a 9 LPA offer; the secured
    // placement draws its own at 2 × 10 = 20. The 14 LPA drive clears the
    // first and fails the second, so it stays blocked.
    const profile = makeProfile({
      policy: "dream_threshold",
      dreamCtcLpa: 12,
      securedPlacement: product(10),
    });
    const applications = [makeApplication("low", "offer", { offerCtcLpa: 9 })];
    const board = buildBoard({ profile, drives, applications }, NOW);
    expect(board.blocked.map((v) => v.drive.id)).toContain("mid");
    expect(board.actionable.map((v) => v.drive.id)).toEqual(["high"]);
  });

  it("leaves an unplaced student's board exactly as it was", () => {
    const profile = makeProfile({ policy: "dream_threshold", dreamCtcLpa: 12 });
    const applications = [makeApplication("low", "offer", { offerCtcLpa: 9 })];
    const withNull = buildBoard({ profile, drives, applications }, NOW);
    const withUndefinedField = buildBoard(
      { profile: { ...profile, securedPlacement: null }, drives, applications },
      NOW,
    );
    expect(withNull.views.map((v) => v.status)).toEqual(
      withUndefinedField.views.map((v) => v.status),
    );
    // The contrast with the test above: the same 14 LPA drive clears the
    // 12 LPA dream line and is open, where a 2 × 10 secured bar closed it.
    // `low` produced the offer, so it is resolved rather than blocked (R12).
    expect(withNull.blocked).toHaveLength(0);
    expect(withNull.actionable.map((v) => v.drive.id).sort()).toEqual(["high", "mid"]);
    expect(withNull.resolved.map((v) => v.drive.id)).toEqual(["low"]);
  });

  it("does not treat a received offer as a secured placement", () => {
    // The student has an offer recorded in RoundReady but has not told us they
    // accepted anything. Only the college policy gate may fire.
    const profile = makeProfile({ policy: "none" });
    const applications = [makeApplication("high", "offer", { offerCtcLpa: 30 })];
    const board = buildBoard({ profile, drives, applications }, NOW);
    expect(board.blocked).toHaveLength(0);
  });
});

describe("the profile schema", () => {
  const base = {
    branch: "CSE",
    cgpa: 8,
    activeBacklogs: 0,
    tenthPercent: 90,
    twelfthPercent: 90,
    gapYears: 0,
    policy: "none",
    dreamCtcLpa: null,
  };

  it("accepts an unplaced student with the fields left blank", () => {
    const parsed = profileSchema.safeParse({ ...base, hasSecuredPlacement: false });
    expect(parsed.success).toBe(true);
  });

  it("requires the company once the student says they are placed", () => {
    const parsed = profileSchema.safeParse({
      ...base,
      hasSecuredPlacement: true,
      securedCtcLpa: 6,
      securedCategory: "service_based",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0].path).toContain("securedCompany");
  });

  it("requires the package", () => {
    const parsed = profileSchema.safeParse({
      ...base,
      hasSecuredPlacement: true,
      securedCompany: "Infosys",
      securedCategory: "service_based",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0].path).toContain("securedCtcLpa");
  });

  it("requires the category, because the multiplier depends on it", () => {
    const parsed = profileSchema.safeParse({
      ...base,
      hasSecuredPlacement: true,
      securedCompany: "Infosys",
      securedCtcLpa: 6,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0].path).toContain("securedCategory");
  });

  it("rejects a category it does not recognise", () => {
    const parsed = profileSchema.safeParse({
      ...base,
      hasSecuredPlacement: true,
      securedCompany: "Infosys",
      securedCtcLpa: 6,
      securedCategory: "consulting",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a complete record, and reads a checkbox's \"on\"", () => {
    const parsed = profileSchema.safeParse({
      ...base,
      hasSecuredPlacement: "on",
      securedCompany: "Infosys",
      securedCtcLpa: "6",
      securedCategory: "service_based",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.hasSecuredPlacement).toBe(true);
      expect(parsed.data.securedCtcLpa).toBe(6);
    }
  });
});

/**
 * The multipliers as a batch-level setting.
 *
 * The numbers are the CDC officer's to set, because they are a statement of
 * college policy rather than a fact about any one student. These assert that
 * the officer's figures actually reach the gate — a setting that is stored but
 * never consulted is worse than no setting, because the officer believes the
 * rule changed and the students are still gated by the old one.
 */
describe("a batch's own multipliers", () => {
  const placed = makeProfile({
    policy: "none",
    securedPlacement: service(8),
  });

  it("moves the bar when the officer raises the multiplier", () => {
    const drive = makeDrive({ id: "d1", ctcLpa: 13 });

    // Standard 1.5× puts the bar at 12, so a 13 LPA drive is open.
    expect(evaluatePolicy(placed, drive, [], [drive]).state).toBe("open");

    // The officer raises it to 1.75×: the bar becomes 14 and the same drive
    // closes, with the reason naming the number the officer set.
    const raised = evaluatePolicy(placed, drive, [], [drive], {
      service_based: 1.75,
      product_based: 2,
    });
    expect(raised.state).toBe("blocked");
    expect(raised.securedThresholdLpa).toBe(14);
    expect(raised.reason).toContain("1.75");
  });

  it("opens drives when the officer lowers it", () => {
    const drive = makeDrive({ id: "d1", ctcLpa: 9 });
    expect(evaluatePolicy(placed, drive, [], [drive]).state).toBe("blocked");

    const lowered = evaluatePolicy(placed, drive, [], [drive], {
      service_based: 1,
      product_based: 2,
    });
    expect(lowered.state).toBe("open");
    expect(lowered.securedThresholdLpa).toBe(8);
  });

  it("only moves the category it applies to", () => {
    const drive = makeDrive({ id: "d1", ctcLpa: 13 });
    const custom = { service_based: 1.75, product_based: 2 };

    // The same 8 LPA secured at a product-based employer is still on 2×.
    const productPlaced = makeProfile({ policy: "none", securedPlacement: product(8) });
    expect(evaluatePolicy(productPlaced, drive, [], [drive], custom).securedThresholdLpa).toBe(16);
  });

  it("reaches the board, not just the single-drive call", () => {
    // buildBoard resolves the policy context once for the whole board, so it
    // is a separate path to the gate and has to be asserted separately.
    const drives = [makeDrive({ id: "d1", ctcLpa: 13 }), makeDrive({ id: "d2", ctcLpa: 20 })];
    const board = buildBoard(
      {
        profile: placed,
        drives,
        applications: [],
        multipliers: { service_based: 1.75, product_based: 2 },
      },
      NOW,
    );

    const byId = new Map(board.views.map((v) => [v.drive.id, v]));
    expect(byId.get("d1")?.policy.state).toBe("blocked");
    expect(byId.get("d2")?.policy.state).toBe("open");
    expect(byId.get("d1")?.policy.securedThresholdLpa).toBe(14);
  });

  it("falls back to the standard numbers when a batch has set none", () => {
    // A batch whose officer has never opened the policy page must be gated
    // exactly like one that opened it and kept the defaults.
    const drives = [makeDrive({ id: "d1", ctcLpa: 11.99 })];
    const withoutSetting = buildBoard({ profile: placed, drives, applications: [] }, NOW);
    const withDefaults = buildBoard(
      { profile: placed, drives, applications: [], multipliers: SECURED_MULTIPLIERS },
      NOW,
    );
    expect(withoutSetting.views[0].policy.securedThresholdLpa).toBe(12);
    expect(withDefaults.views[0].policy.securedThresholdLpa).toBe(12);
    expect(withoutSetting.views[0].policy.state).toBe("blocked");
  });
});

/**
 * The board's summary of the bar, against the bar it actually applied.
 *
 * This is a regression test for a real defect: the board-level
 * `securedThresholdLpa` was derived by calling `securedGate` a second time, in
 * the controller, without the batch's multipliers. A student on a batch whose
 * officer had set 1.75× saw "1.5× — 12 LPA" at the top of the page and drives
 * blocked at 14 LPA underneath it, with nothing to explain the gap.
 *
 * The fix was to stop deriving it twice. These assert the single source holds.
 */
describe("the board's own summary of the bar", () => {
  const placed = makeProfile({ policy: "none", securedPlacement: service(8) });
  const custom = { service_based: 1.75, product_based: 2 };

  it("matches what the drives beneath it were judged against", () => {
    const drives = [makeDrive({ id: "d1", ctcLpa: 13 })];
    const board = buildBoard({ profile: placed, drives, applications: [], multipliers: custom }, NOW);

    expect(board.securedGate?.thresholdLpa).toBe(14);
    expect(board.securedGate?.multiplier).toBe(1.75);
    // The same number the verdict used, not a parallel calculation of it.
    expect(board.views[0].policy.securedThresholdLpa).toBe(board.securedGate?.thresholdLpa);
    expect(board.views[0].policy.securedMultiplier).toBe(board.securedGate?.multiplier);
  });

  it("is still right on a board with no drives at all", () => {
    // The old code read the bar off the first drive view, so an empty board
    // had no bar to report even though the student was plainly gated.
    const board = buildBoard({ profile: placed, drives: [], applications: [], multipliers: custom }, NOW);
    expect(board.views).toHaveLength(0);
    expect(board.securedGate?.thresholdLpa).toBe(14);
  });

  it("is null for a student who has not accepted anything", () => {
    const board = buildBoard(
      { profile: makeProfile({ policy: "none" }), drives: [], applications: [] },
      NOW,
    );
    expect(board.securedGate).toBeNull();
  });
});
