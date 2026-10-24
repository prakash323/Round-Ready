import { describe, expect, it } from "vitest";
import {
  MISSING_DRIVE,
  activeOffers,
  evaluatePolicy,
  governingOffer,
  policyFloor,
  unresolvableOffers,
} from "@/lib/engine";
import { makeApplication, makeDrive, makeProfile } from "./fixtures";

/** PRD section 9, "Placement policy". */

const google = makeDrive({ id: "g", company: "Google", ctcLpa: 32 });
const mid = makeDrive({ id: "m", company: "Mindtree", ctcLpa: 10 });
const low = makeDrive({ id: "l", company: "Local Co", ctcLpa: 4.5 });
const dream = makeDrive({ id: "d", company: "Dream Corp", ctcLpa: 14 });
const exactly12 = makeDrive({ id: "e", company: "Twelve Ltd", ctcLpa: 12 });
const ALL = [google, mid, low, dream, exactly12];

describe("policy 'none' gates nothing", () => {
  it("leaves every drive open even with an accepted offer", () => {
    const profile = makeProfile({ policy: "none" });
    const apps = [makeApplication("m", "offer", { offerCtcLpa: 8 })];
    for (const drive of ALL) {
      expect(evaluatePolicy(profile, drive, apps, ALL).state, drive.company).toBe("open");
    }
  });

  it("reports no floor", () => {
    expect(policyFloor("none", null, { driveId: "m", company: "Mindtree", ctcLpa: 8 })).toBeNull();
  });
});

describe("one-offer policy", () => {
  const profile = makeProfile({ policy: "one_offer" });
  const apps = [makeApplication("m", "offer", { offerCtcLpa: 8 })];

  it("blocks every other drive once an offer is accepted", () => {
    for (const drive of [google, low, dream, exactly12]) {
      const result = evaluatePolicy(profile, drive, apps, ALL);
      expect(result.state, drive.company).toBe("blocked");
      expect(result.reason).toContain("one-offer");
    }
  });

  it("does not report the drive that produced the offer as blocked", () => {
    expect(evaluatePolicy(profile, mid, apps, ALL).state).toBe("open");
  });

  it("blocks nothing before any offer exists", () => {
    const pending = [makeApplication("m", "in_progress")];
    expect(evaluatePolicy(profile, google, pending, ALL).state).toBe("open");
  });

  it("has an infinite floor, which is what 'everything else' means", () => {
    expect(policyFloor("one_offer", null, { driveId: "m", company: "Mindtree", ctcLpa: 8 })).toBe(
      Number.POSITIVE_INFINITY,
    );
  });
});

describe("dream-threshold policy", () => {
  const profile = makeProfile({ policy: "dream_threshold", dreamCtcLpa: 12 });
  const accepted8 = [makeApplication("m", "offer", { offerCtcLpa: 8 })];

  it("blocks a drive below the dream cutoff", () => {
    expect(evaluatePolicy(profile, low, accepted8, ALL).state).toBe("blocked");
  });

  it("leaves a drive above the dream cutoff open", () => {
    expect(evaluatePolicy(profile, dream, accepted8, ALL).state).toBe("open");
    expect(evaluatePolicy(profile, google, accepted8, ALL).state).toBe("open");
  });

  it("blocks a drive sitting exactly on the cutoff", () => {
    // The comparison is `<=` by design: "above the dream CTC" excludes equal to.
    expect(evaluatePolicy(profile, exactly12, accepted8, ALL).state).toBe("blocked");
  });

  it("uses the accepted offer as the floor when it exceeds the dream cutoff", () => {
    const accepted15 = [makeApplication("g", "offer", { offerCtcLpa: 15 })];
    expect(evaluatePolicy(profile, dream, accepted15, ALL).state).toBe("blocked");
    expect(evaluatePolicy(profile, exactly12, accepted15, ALL).state).toBe("blocked");
    expect(policyFloor("dream_threshold", 12, { driveId: "g", company: "G", ctcLpa: 15 })).toBe(15);
  });

  it("explains which number drew the line", () => {
    const belowDream = evaluatePolicy(profile, low, accepted8, ALL);
    expect(belowDream.reason).toContain("dream cutoff is 12");

    const accepted15 = [makeApplication("g", "offer", { offerCtcLpa: 15 })];
    const aboveDream = evaluatePolicy(profile, dream, accepted15, ALL);
    expect(aboveDream.reason).toContain("accepted offer is 15");
  });
});

describe("only live offers gate anything", () => {
  const profile = makeProfile({ policy: "one_offer" });

  it("ignores an offer that was later withdrawn", () => {
    const withdrawn = [makeApplication("g", "withdrawn", { offerCtcLpa: 32 })];
    expect(evaluatePolicy(profile, mid, withdrawn, ALL).state).toBe("open");
  });

  it("ignores a rejected application whatever CTC it carried", () => {
    const rejected = [makeApplication("g", "rejected", { offerCtcLpa: 32 })];
    expect(evaluatePolicy(profile, mid, rejected, ALL).state).toBe("open");
    expect(activeOffers(rejected, ALL)).toHaveLength(0);
  });

  it("reads the current status, not the history", () => {
    const hadOffer = makeApplication("g", "withdrawn", {
      history: [
        { status: "applied", at: new Date("2026-09-01T00:00:00Z") },
        { status: "offer", at: new Date("2026-10-01T00:00:00Z") },
        { status: "withdrawn", at: new Date("2026-10-05T00:00:00Z") },
      ],
    });
    expect(activeOffers([hadOffer], ALL)).toHaveLength(0);
  });
});

describe("offer valuation", () => {
  it("falls back to the drive's CTC when the offer amount was not recorded", () => {
    const offers = activeOffers([makeApplication("g", "offer", { offerCtcLpa: null })], ALL);
    expect(offers[0].ctcLpa).toBe(32);
  });

  it("lets the highest live offer govern, and warns that there are several", () => {
    const apps = [
      makeApplication("m", "offer", { offerCtcLpa: 8 }),
      makeApplication("g", "offer", { offerCtcLpa: 30 }),
    ];
    const gov = governingOffer(activeOffers(apps, ALL));
    expect(gov?.ctcLpa).toBe(30);

    const profile = makeProfile({ policy: "dream_threshold", dreamCtcLpa: 12 });
    const result = evaluatePolicy(profile, dream, apps, ALL);
    expect(result.warning).toContain("2 live offers");
    expect(result.state).toBe("blocked"); // 14 LPA is below the 30 LPA floor
  });

  it("does not crash when an application points at a drive that no longer exists", () => {
    const offers = activeOffers([makeApplication("deleted-drive", "offer", { offerCtcLpa: null })], ALL);
    expect(offers).toHaveLength(0);
  });
});

/**
 * Drives are shared across a batch, so a classmate deleting one leaves every
 * other student holding an application that points at nothing. An orphaned
 * `offer` row used to be valued at 0 LPA, which under a dream-threshold policy
 * blocked every drive below the cutoff and attributed it to a company that had
 * no card on the board to explain or clear.
 */
describe("an offer whose drive has been deleted", () => {
  const profile = makeProfile({ policy: "dream_threshold", dreamCtcLpa: 12 });
  const orphan = makeApplication("deleted-drive", "offer", { offerCtcLpa: null });

  it("is dropped rather than valued at zero", () => {
    expect(activeOffers([orphan], ALL)).toHaveLength(0);
    expect(unresolvableOffers([orphan], ALL)).toHaveLength(1);
  });

  it("does not gate any drive", () => {
    for (const drive of ALL) {
      expect(evaluatePolicy(profile, drive, [orphan], ALL).state, drive.company).toBe("open");
    }
  });

  it("says so, instead of blocking the board silently", () => {
    const result = evaluatePolicy(profile, mid, [orphan], ALL);
    expect(result.warning).toContain("no longer on your board");
    expect(result.governingOffer).toBeNull();
  });

  it("still gates when the application recorded the offered CTC itself", () => {
    // The amount came from the student, not from the drive, so it survives the
    // drive's deletion and remains a real gate.
    const valued = makeApplication("deleted-drive", "offer", { offerCtcLpa: 15 });
    const result = evaluatePolicy(profile, dream, [valued], ALL);
    expect(result.state).toBe("blocked"); // 14 LPA is below the 15 LPA floor
    expect(result.governingOffer?.ctcLpa).toBe(15);
    expect(result.governingOffer?.company).toBe(MISSING_DRIVE);
    expect(unresolvableOffers([valued], ALL)).toHaveLength(0);
  });

  it("does not warn when every offer resolves", () => {
    const real = makeApplication("g", "offer", { offerCtcLpa: null });
    expect(evaluatePolicy(profile, mid, [real], ALL).warning).toBeNull();
  });

  it("counts more than one of them, in the plural", () => {
    const two = [
      makeApplication("gone-a", "offer", { offerCtcLpa: null }),
      makeApplication("gone-b", "offer", { offerCtcLpa: null }),
    ];
    const warning = evaluatePolicy(profile, mid, two, ALL).warning ?? "";
    expect(warning).toContain("2 recorded offers point at a drive");
    expect(warning).toContain("they are gating nothing");
  });
});
