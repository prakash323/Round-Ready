import { describe, expect, it } from "vitest";
import { agenda, buildBoard, nextDateFor } from "@/lib/engine";
import {
  NOW,
  fromNow,
  istAt,
  makeApplication,
  makeCriteria,
  makeDrive,
  makeProfile,
  makeRound,
} from "./fixtures";

describe("status derivation", () => {
  it("labels a drive you clear and are allowed to sit for as actionable", () => {
    const drive = makeDrive({ criteria: makeCriteria({ cgpaMin: 7.0 }) });
    const board = buildBoard({ profile: makeProfile(), drives: [drive], applications: [] }, NOW);
    expect(board.actionable.map((v) => v.drive.id)).toEqual([drive.id]);
  });

  it("keeps an ineligible drive on the board rather than hiding it", () => {
    const drive = makeDrive({ criteria: makeCriteria({ cgpaMin: 9.5 }) });
    const board = buildBoard({ profile: makeProfile(), drives: [drive], applications: [] }, NOW);
    expect(board.notEligible).toHaveLength(1);
    expect(board.views).toHaveLength(1);
    expect(board.notEligible[0].eligibility.failures[0].key).toBe("cgpa");
  });

  it("prefers 'not eligible' over 'blocked' — you were never in the running", () => {
    const offered = makeDrive({ id: "o", ctcLpa: 8 });
    const tooHigh = makeDrive({ id: "x", ctcLpa: 20, criteria: makeCriteria({ cgpaMin: 9.9 }) });
    const board = buildBoard(
      {
        profile: makeProfile({ policy: "one_offer" }),
        drives: [offered, tooHigh],
        applications: [makeApplication("o", "offer", { offerCtcLpa: 8 })],
      },
      NOW,
    );
    expect(board.notEligible.map((v) => v.drive.id)).toEqual(["x"]);
    expect(board.blocked).toHaveLength(0);
  });

  it("reports the drive that produced your offer as resolved, not blocked", () => {
    const offered = makeDrive({ id: "o", ctcLpa: 8 });
    const other = makeDrive({ id: "p", ctcLpa: 9 });
    const board = buildBoard(
      {
        profile: makeProfile({ policy: "one_offer" }),
        drives: [offered, other],
        applications: [makeApplication("o", "offer", { offerCtcLpa: 8 })],
      },
      NOW,
    );
    expect(board.resolved.map((v) => v.drive.id)).toEqual(["o"]);
    expect(board.blocked.map((v) => v.drive.id)).toEqual(["p"]);
  });

  it("separates drives whose verdict cannot be determined", () => {
    const drive = makeDrive({ criteria: makeCriteria({ twelfthPercentMin: 60 }) });
    const board = buildBoard(
      { profile: makeProfile({ twelfthPercent: null }), drives: [drive], applications: [] },
      NOW,
    );
    expect(board.unknown).toHaveLength(1);
    expect(board.actionable).toHaveLength(0);
  });

  it("treats a rejected drive as resolved whatever its eligibility", () => {
    const drive = makeDrive({ id: "r" });
    const board = buildBoard(
      { profile: makeProfile(), drives: [drive], applications: [makeApplication("r", "rejected")] },
      NOW,
    );
    expect(board.resolved.map((v) => v.drive.id)).toEqual(["r"]);
  });
});

describe("the next thing that needs attention", () => {
  it("is the application deadline while you have not applied", () => {
    const drive = makeDrive({
      applicationDeadline: fromNow(3),
      rounds: [makeRound("OA", fromNow(10), fromNow(10.1))],
    });
    const next = nextDateFor(drive, null, NOW);
    expect(next?.kind).toBe("deadline");
  });

  it("becomes the next round once you have applied", () => {
    const drive = makeDrive({
      applicationDeadline: fromNow(3),
      rounds: [makeRound("OA", fromNow(10), fromNow(10.1))],
    });
    const next = nextDateFor(drive, makeApplication(drive.id, "applied"), NOW);
    expect(next?.kind).toBe("round");
    expect(next?.label).toBe("OA");
  });

  it("still counts the deadline while you are only 'interested'", () => {
    const drive = makeDrive({ applicationDeadline: fromNow(2), rounds: [] });
    expect(nextDateFor(drive, makeApplication(drive.id, "interested"), NOW)?.kind).toBe("deadline");
  });

  it("ignores a deadline that has already passed", () => {
    const drive = makeDrive({ applicationDeadline: fromNow(-2), rounds: [] });
    expect(nextDateFor(drive, null, NOW)).toBeNull();
  });

  it("ignores rounds in the past and picks the earliest future one", () => {
    const drive = makeDrive({
      applicationDeadline: null,
      rounds: [
        makeRound("Past", fromNow(-5), fromNow(-4.9)),
        makeRound("Later", fromNow(9), fromNow(9.1)),
        makeRound("Sooner", fromNow(4), fromNow(4.1)),
      ],
    });
    expect(nextDateFor(drive, null, NOW)?.label).toBe("Sooner");
  });

  it("returns null for a drive with no deadline and no rounds", () => {
    const drive = makeDrive({ applicationDeadline: null, rounds: [] });
    expect(nextDateFor(drive, null, NOW)).toBeNull();
  });

  it("marks a passed deadline on the view without erroring", () => {
    const drive = makeDrive({ applicationDeadline: fromNow(-1), rounds: [] });
    const board = buildBoard({ profile: makeProfile(), drives: [drive], applications: [] }, NOW);
    expect(board.views[0].deadlinePassed).toBe(true);
    expect(board.views[0].nextDate).toBeNull();
  });
});

describe("ranking", () => {
  it("sorts actionable drives by priority, highest first", () => {
    const soonAndRich = makeDrive({ id: "rich", ctcLpa: 30, applicationDeadline: fromNow(1) });
    const farAndPoor = makeDrive({ id: "poor", ctcLpa: 4, applicationDeadline: fromNow(60) });
    const board = buildBoard(
      { profile: makeProfile(), drives: [farAndPoor, soonAndRich], applications: [] },
      NOW,
    );
    expect(board.actionable.map((v) => v.drive.id)).toEqual(["rich", "poor"]);
  });

  it("does not score drives you cannot act on", () => {
    const drive = makeDrive({ criteria: makeCriteria({ cgpaMin: 9.9 }) });
    const board = buildBoard({ profile: makeProfile(), drives: [drive], applications: [] }, NOW);
    expect(board.notEligible[0].priority).toBeNull();
  });

  it("normalises compensation against the best drive you can actually take", () => {
    // A 30 LPA drive you are ineligible for must not shrink the compensation
    // score of the 12 LPA drive you can take.
    const unreachable = makeDrive({ ctcLpa: 30, criteria: makeCriteria({ cgpaMin: 9.9 }) });
    const reachable = makeDrive({ id: "ok", ctcLpa: 12 });
    const board = buildBoard(
      { profile: makeProfile(), drives: [unreachable, reachable], applications: [] },
      NOW,
    );
    expect(board.stats.bestAvailableCtcLpa).toBe(12);
    const comp = board.actionable[0].priority!.components.find((c) => c.label === "Compensation");
    expect(comp!.points).toBe(45);
  });
});

describe("statistics", () => {
  it("counts each group and reconciles with the total", () => {
    const board = buildBoard(
      {
        profile: makeProfile({ policy: "one_offer" }),
        drives: [
          makeDrive({ id: "a" }),
          makeDrive({ id: "b", criteria: makeCriteria({ cgpaMin: 9.9 }) }),
          makeDrive({ id: "c", criteria: makeCriteria({ twelfthPercentMin: 60 }) }),
          makeDrive({ id: "d" }),
        ],
        applications: [makeApplication("d", "offer", { offerCtcLpa: 10 })],
      },
      NOW,
    );
    const { stats } = board;
    expect(stats.total).toBe(4);
    expect(
      stats.actionable +
        stats.unknown +
        stats.notEligible +
        stats.blocked +
        stats.expired +
        stats.resolved,
    ).toBe(stats.total);
    expect(stats.offers).toBe(1);
  });

  it("counts clashes once, not once per side", () => {
    const a = makeDrive({ id: "a", rounds: [makeRound("OA", istAt(2, 10), istAt(2, 12))] });
    const b = makeDrive({ id: "b", rounds: [makeRound("OA", istAt(2, 11), istAt(2, 13))] });
    const board = buildBoard({ profile: makeProfile(), drives: [a, b], applications: [] }, NOW);
    expect(board.stats.clashes).toBe(1);
    expect(board.views[0].clashes).toHaveLength(1);
    expect(board.views[1].clashes).toHaveLength(1);
  });
});

describe("the seven-day agenda", () => {
  it("includes an item exactly seven days out and excludes one a minute later", () => {
    const inside = makeDrive({
      id: "in",
      applicationDeadline: null,
      rounds: [makeRound("OA", new Date(NOW.getTime() + 7 * 86_400_000), fromNow(7.1))],
    });
    const outside = makeDrive({
      id: "out",
      applicationDeadline: null,
      rounds: [makeRound("OA", new Date(NOW.getTime() + 7 * 86_400_000 + 60_000), fromNow(7.2))],
    });
    const board = buildBoard(
      { profile: makeProfile(), drives: [inside, outside], applications: [] },
      NOW,
    );
    const items = agenda(board, 7, NOW);
    expect(items.map((i) => i.driveId)).toEqual(["in"]);
  });

  it("is ordered chronologically across drives", () => {
    const a = makeDrive({
      id: "a",
      applicationDeadline: null,
      rounds: [makeRound("Interview", istAt(4, 14), istAt(4, 15))],
    });
    const b = makeDrive({
      id: "b",
      applicationDeadline: null,
      rounds: [makeRound("OA", istAt(2, 10), istAt(2, 11))],
    });
    const board = buildBoard({ profile: makeProfile(), drives: [a, b], applications: [] }, NOW);
    const items = agenda(board, 7, NOW);
    expect(items.map((i) => i.driveId)).toEqual(["b", "a"]);
  });

  it("marks a clashing round so the agenda shows the conflict", () => {
    const a = makeDrive({
      id: "a",
      applicationDeadline: null,
      rounds: [makeRound("OA", istAt(2, 10), istAt(2, 12))],
    });
    const b = makeDrive({
      id: "b",
      applicationDeadline: null,
      rounds: [makeRound("OA", istAt(2, 11), istAt(2, 13))],
    });
    const board = buildBoard({ profile: makeProfile(), drives: [a, b], applications: [] }, NOW);
    expect(agenda(board, 7, NOW).every((i) => i.clashing)).toBe(true);
  });

  it("omits drives you are not eligible for", () => {
    const drive = makeDrive({
      criteria: makeCriteria({ cgpaMin: 9.9 }),
      applicationDeadline: fromNow(2),
    });
    const board = buildBoard({ profile: makeProfile(), drives: [drive], applications: [] }, NOW);
    expect(agenda(board, 7, NOW)).toHaveLength(0);
  });

  it("omits the application deadline once you have applied", () => {
    const drive = makeDrive({ applicationDeadline: fromNow(2), rounds: [] });
    const board = buildBoard(
      { profile: makeProfile(), drives: [drive], applications: [makeApplication(drive.id, "applied")] },
      NOW,
    );
    expect(agenda(board, 7, NOW)).toHaveLength(0);
  });
});

describe("an application left behind by a deleted drive", () => {
  // The symptom this bug produced: a classmate deletes a shared drive, and
  // every other student's board quietly blocks everything under the dream
  // cutoff with no card on it to explain why.
  const orphan = makeApplication("deleted-by-a-classmate", "offer", { offerCtcLpa: null });

  it("leaves the rest of the board open", () => {
    const drive = makeDrive({ id: "live", ctcLpa: 10 });
    const board = buildBoard(
      {
        profile: makeProfile({ policy: "dream_threshold", dreamCtcLpa: 12 }),
        drives: [drive],
        applications: [orphan],
      },
      NOW,
    );
    expect(board.actionable.map((v) => v.drive.id)).toEqual(["live"]);
    expect(board.blocked).toHaveLength(0);
  });

  it("warns on the board instead of failing silently", () => {
    const board = buildBoard(
      {
        profile: makeProfile({ policy: "dream_threshold", dreamCtcLpa: 12 }),
        drives: [makeDrive({ ctcLpa: 10 })],
        applications: [orphan],
      },
      NOW,
    );
    expect(board.policyWarning).toContain("no longer on your board");
  });
});

describe("an empty board", () => {
  it("produces zero counts rather than throwing", () => {
    const board = buildBoard({ profile: makeProfile(), drives: [], applications: [] }, NOW);
    expect(board.stats.total).toBe(0);
    expect(board.stats.bestAvailableCtcLpa).toBeNull();
    expect(board.policyWarning).toBeNull();
    expect(agenda(board, 7, NOW)).toHaveLength(0);
  });
});

describe("drives whose deadline has gone", () => {
  it("moves a never-applied drive out of the actionable list", () => {
    const drive = makeDrive({ id: "gone", ctcLpa: 40, applicationDeadline: fromNow(-2) });
    const board = buildBoard({ profile: makeProfile(), drives: [drive], applications: [] }, NOW);
    expect(board.expired.map((v) => v.drive.id)).toEqual(["gone"]);
    expect(board.actionable).toHaveLength(0);
  });

  it("does not let an expired drive set the ceiling for ranking", () => {
    // A 40 LPA drive nobody can apply to any more must not make a live 10 LPA
    // drive look like a quarter of what is available.
    const gone = makeDrive({ ctcLpa: 40, applicationDeadline: fromNow(-2) });
    const live = makeDrive({ id: "live", ctcLpa: 10 });
    const board = buildBoard({ profile: makeProfile(), drives: [gone, live], applications: [] }, NOW);
    expect(board.stats.bestAvailableCtcLpa).toBe(10);
  });

  it("keeps a drive you have already applied to, because the deadline is now moot", () => {
    const drive = makeDrive({ id: "in", applicationDeadline: fromNow(-2) });
    const board = buildBoard(
      { profile: makeProfile(), drives: [drive], applications: [makeApplication("in", "applied")] },
      NOW,
    );
    expect(board.actionable.map((v) => v.drive.id)).toEqual(["in"]);
    expect(board.expired).toHaveLength(0);
  });

  it("expires a drive you only marked as interested", () => {
    const drive = makeDrive({ id: "maybe", applicationDeadline: fromNow(-2) });
    const board = buildBoard(
      {
        profile: makeProfile(),
        drives: [drive],
        applications: [makeApplication("maybe", "interested")],
      },
      NOW,
    );
    expect(board.expired.map((v) => v.drive.id)).toEqual(["maybe"]);
  });

  it("still reports ineligibility ahead of expiry, since that is the more useful fact", () => {
    const drive = makeDrive({
      id: "both",
      applicationDeadline: fromNow(-2),
      criteria: makeCriteria({ cgpaMin: 9.9 }),
    });
    const board = buildBoard({ profile: makeProfile(), drives: [drive], applications: [] }, NOW);
    expect(board.notEligible.map((v) => v.drive.id)).toEqual(["both"]);
  });

  it("keeps an expired drive out of the agenda", () => {
    const drive = makeDrive({
      applicationDeadline: fromNow(-2),
      rounds: [makeRound("OA", fromNow(2), fromNow(2.1))],
    });
    const board = buildBoard({ profile: makeProfile(), drives: [drive], applications: [] }, NOW);
    expect(agenda(board, 7, NOW)).toHaveLength(0);
  });
});

describe("clash detection only covers drives you could actually sit", () => {
  const slot = (day: number, from: number, to: number) =>
    makeRound("OA", istAt(day, from), istAt(day, to));

  it("ignores a round on a drive you are not eligible for", () => {
    // A company whose CGPA cutoff you miss is not competing for your Tuesday
    // morning, and reporting it would bury the conflicts that are real.
    const mine = makeDrive({ id: "mine", rounds: [slot(3, 10, 12)] });
    const theirs = makeDrive({
      id: "theirs",
      rounds: [slot(3, 11, 13)],
      criteria: makeCriteria({ cgpaMin: 9.9 }),
    });
    const board = buildBoard(
      { profile: makeProfile(), drives: [mine, theirs], applications: [] },
      NOW,
    );
    expect(board.clashes).toHaveLength(0);
    expect(board.views.every((v) => v.clashes.length === 0)).toBe(true);
  });

  it("ignores a round on a drive blocked by your placement policy", () => {
    const offered = makeDrive({ id: "offered", ctcLpa: 20 });
    const mine = makeDrive({ id: "mine", ctcLpa: 25, rounds: [slot(3, 10, 12)] });
    const closed = makeDrive({ id: "closed", ctcLpa: 8, rounds: [slot(3, 11, 13)] });
    const board = buildBoard(
      {
        profile: makeProfile({ policy: "one_offer" }),
        drives: [offered, mine, closed],
        applications: [makeApplication("offered", "offer", { offerCtcLpa: 20 })],
      },
      NOW,
    );
    expect(board.clashes).toHaveLength(0);
  });

  it("ignores a round on a drive whose deadline has gone", () => {
    const mine = makeDrive({ id: "mine", rounds: [slot(3, 10, 12)] });
    const gone = makeDrive({
      id: "gone",
      applicationDeadline: fromNow(-1),
      rounds: [slot(3, 11, 13)],
    });
    const board = buildBoard(
      { profile: makeProfile(), drives: [mine, gone], applications: [] },
      NOW,
    );
    expect(board.clashes).toHaveLength(0);
  });

  it("still flags a clash between a decided drive and an undecidable one", () => {
    // "Cannot determine" means you might well be eligible, so the conflict is
    // real and the student needs to see it.
    const mine = makeDrive({ id: "mine", rounds: [slot(3, 10, 12)] });
    const maybe = makeDrive({
      id: "maybe",
      rounds: [slot(3, 11, 13)],
      criteria: makeCriteria({ twelfthPercentMin: 60 }),
    });
    const board = buildBoard(
      {
        profile: makeProfile({ twelfthPercent: null }),
        drives: [mine, maybe],
        applications: [],
      },
      NOW,
    );
    expect(board.clashes).toHaveLength(1);
  });
});
