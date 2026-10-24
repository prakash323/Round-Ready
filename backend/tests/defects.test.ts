import { describe, expect, it } from "vitest";
import {
  agenda,
  buildBoard,
  evaluatePolicy,
  evaluatePolicyFor,
  nextDateFor,
  resolvePolicyContext,
} from "@/lib/engine";
import type { Application, Profile } from "@/lib/engine";
import { boardToCalendarEvents } from "@/lib/calendar";
import { roundSchema } from "@/lib/schemas";
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

/**
 * Regressions for the defects in AUDIT.md.
 *
 * Each case here failed before its fix. They live in one file rather than
 * scattered through the suite because what they have in common is being a
 * defect report — the rule each one protects is already covered by the
 * behavioural suites next door.
 */

// --- D3 — duplicate round names must not collapse ---------------------------
describe("D3: two rounds that share a name", () => {
  const clashing = makeRound("Technical Interview", istAt(3, 10), istAt(3, 11));
  const quiet = makeRound("Technical Interview", istAt(5, 10), istAt(5, 11));

  const subject = makeDrive({
    id: "subject",
    company: "Subject Co",
    rounds: [clashing, quiet],
  });
  const other = makeDrive({
    id: "other",
    company: "Other Co",
    rounds: [makeRound("Online test", istAt(3, 10, 30), istAt(3, 11, 30))],
  });

  const board = buildBoard(
    { profile: makeProfile(), drives: [subject, other], applications: [] },
    NOW,
  );

  it("flags only the round that actually clashes", () => {
    const items = agenda(board, 10, NOW).filter(
      (i) => i.driveId === "subject" && i.kind === "round",
    );
    expect(items).toHaveLength(2);
    // Keyed on the round name, both of these came back `true` — the quiet
    // round on day 5 was reported as clashing with a drive two days earlier.
    expect(items.map((i) => i.clashing)).toEqual([true, false]);
  });

  it("gives each round its own calendar UID", () => {
    const events = boardToCalendarEvents(board, NOW);
    const uids = events.map((e) => e.uid);
    expect(new Set(uids).size).toBe(uids.length);
  });
});

// --- D4 — a null datetime must not become 1 Jan 1970 ------------------------
describe("D4: roundSchema rejects a datetime it cannot read", () => {
  const base = { name: "Online test", type: "online_test", endAt: "2030-01-01T11:00:00Z" };

  it("rejects null rather than coercing it to the epoch", () => {
    const parsed = roundSchema.safeParse({ ...base, startAt: null });
    expect(parsed.success).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(roundSchema.safeParse({ ...base, startAt: "" }).success).toBe(false);
  });

  it("rejects a number, which Date would read as a timestamp", () => {
    expect(roundSchema.safeParse({ ...base, startAt: 0 }).success).toBe(false);
  });

  it("still accepts a real ISO string", () => {
    const parsed = roundSchema.safeParse({ ...base, startAt: "2030-01-01T10:00:00Z" });
    expect(parsed.success).toBe(true);
  });

  it("names the field so the form can show the error next to the input", () => {
    const parsed = roundSchema.safeParse({ ...base, startAt: null });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].path).toContain("startAt");
    }
  });
});

// --- D5 — undecidable drives must not be ranked against themselves ---------
describe("D5: compensation is normalised against everything available", () => {
  // Nothing is actionable: the only drive asks for a gap-year count the profile
  // does not have, so it lands in `unknown`.
  const profile = makeProfile({ gapYears: null });
  const small = makeDrive({
    id: "small",
    ctcLpa: 3,
    criteria: makeCriteria({ gapYearsAllowed: 0 }),
  });

  // Note what is *not* a defect: a lone 3 LPA drive scoring 45 is correct, for
  // the same reason a lone 3 LPA actionable drive does. The score is relative,
  // so whatever is best available takes the full weight. The defect was that
  // the `unknown` group's denominator ignored the other `unknown` drives, so
  // every one of them was the best available and they all scored 45 — leaving
  // the group in no order at all.
  it("ranks two undecidable drives against each other, not each against itself", () => {
    const big = makeDrive({
      id: "big",
      ctcLpa: 30,
      criteria: makeCriteria({ gapYearsAllowed: 0 }),
    });
    const board = buildBoard({ profile, drives: [small, big], applications: [] }, NOW);
    const points = (id: string) =>
      board.unknown.find((v) => v.drive.id === id)!.priority!.components[0].points;

    expect(points("big")).toBe(45);
    expect(points("small")).toBe(4.5);
    expect(board.unknown.map((v) => v.drive.id)).toEqual(["big", "small"]);
  });

  it("uses the best of the actionable and unknown drives as the denominator", () => {
    const big = makeDrive({
      id: "big",
      ctcLpa: 30,
      criteria: makeCriteria({ gapYearsAllowed: 0 }),
    });
    const board = buildBoard({ profile, drives: [small, big], applications: [] }, NOW);
    expect(board.stats.bestAvailableCtcLpa).toBe(30);
    const view = board.unknown.find((v) => v.drive.id === "small")!;
    expect(view.priority?.components[0].detail).toContain("against the best available 30 LPA");
  });
});

// --- D6 — a round in progress is the most urgent state there is ------------
describe("D6: a round that is running right now", () => {
  const now = istAt(0, 10, 30);
  const live = makeRound("Online test", istAt(0, 10), istAt(0, 12));
  const drive = makeDrive({ id: "live", applicationDeadline: null, rounds: [live] });

  it("is reported as the next date instead of 'nothing scheduled'", () => {
    const next = nextDateFor(drive, null, now);
    expect(next).not.toBeNull();
    expect(next?.label).toBe("Online test");
  });

  it("is marked live, so the board can say so", () => {
    expect(nextDateFor(drive, null, now)?.live).toBe(true);
  });

  it("scores full urgency, because it cannot be more urgent than now", () => {
    const board = buildBoard({ profile: makeProfile(), drives: [drive], applications: [] }, now);
    const urgency = board.actionable[0].priority?.components[1];
    expect(urgency?.detail).toBe("in progress right now");
    expect(urgency?.points).toBe(35);
  });

  it("still prefers a sooner future round over a running one it has passed", () => {
    // A round that has finished is not the next thing; the one after it is.
    const finished = makeRound("Pre-placement talk", istAt(0, 8), istAt(0, 9));
    const upcoming = makeRound("Interview", istAt(2, 10), istAt(2, 11));
    const d = makeDrive({
      id: "seq",
      applicationDeadline: null,
      rounds: [finished, upcoming],
    });
    expect(nextDateFor(d, null, now)?.label).toBe("Interview");
    expect(nextDateFor(d, null, now)?.live).toBe(false);
  });

  it("counts a live round as due this week", () => {
    const board = buildBoard({ profile: makeProfile(), drives: [drive], applications: [] }, now);
    expect(board.stats.dueThisWeek).toBe(1);
  });

  it("puts a live round on the agenda", () => {
    const board = buildBoard({ profile: makeProfile(), drives: [drive], applications: [] }, now);
    const items = agenda(board, 7, now);
    expect(items.map((i) => i.label)).toContain("Online test");
  });

  it("leaves a round that has already ended off the agenda", () => {
    const over = makeRound("Done", istAt(-2, 10), istAt(-2, 11));
    const d = makeDrive({ id: "over", applicationDeadline: fromNow(4), rounds: [over] });
    const board = buildBoard({ profile: makeProfile(), drives: [d], applications: [] }, NOW);
    expect(agenda(board, 7, NOW).map((i) => i.label)).not.toContain("Done");
  });
});

// --- D7 — the gate is resolved once, not per drive --------------------------
describe("D7: hoisting the policy gate out of the board loop", () => {
  /**
   * D7 had no behavioural symptom — it was `evaluatePolicy` rebuilding a Map of
   * every drive and rescanning every application once per drive, for an answer
   * identical across the board. So there is no test that failed before the fix;
   * what matters is that the two code paths cannot drift, because the whole
   * point of the change is that nothing about the output changed.
   */
  const matrix: { label: string; profile: Profile; applications: Application[] }[] = [
    { label: "no policy, no offers", profile: makeProfile(), applications: [] },
    {
      label: "one_offer with an accepted offer",
      profile: makeProfile({ policy: "one_offer" }),
      applications: [makeApplication("a", "offer", { offerCtcLpa: 9 })],
    },
    {
      label: "dream_threshold below the line",
      profile: makeProfile({ policy: "dream_threshold", dreamCtcLpa: 12 }),
      applications: [makeApplication("a", "offer", { offerCtcLpa: 8 })],
    },
    {
      label: "dream_threshold above the line",
      profile: makeProfile({ policy: "dream_threshold", dreamCtcLpa: 12 }),
      applications: [makeApplication("c", "offer", { offerCtcLpa: 20 })],
    },
    {
      label: "two live offers",
      profile: makeProfile({ policy: "dream_threshold", dreamCtcLpa: 12 }),
      applications: [
        makeApplication("a", "offer", { offerCtcLpa: 8 }),
        makeApplication("b", "offer", { offerCtcLpa: 14 }),
      ],
    },
    {
      label: "an offer whose drive has gone",
      profile: makeProfile({ policy: "dream_threshold", dreamCtcLpa: 12 }),
      applications: [makeApplication("vanished", "offer", { offerCtcLpa: null })],
    },
    {
      label: "withdrawn, so nothing gates",
      profile: makeProfile({ policy: "one_offer" }),
      applications: [makeApplication("a", "withdrawn", { offerCtcLpa: 30 })],
    },
  ];

  const drives = [
    makeDrive({ id: "a", company: "A", ctcLpa: 8 }),
    makeDrive({ id: "b", company: "B", ctcLpa: 14 }),
    makeDrive({ id: "c", company: "C", ctcLpa: 20 }),
    makeDrive({ id: "d", company: "D", ctcLpa: 12 }),
  ];

  it("gives byte-identical results to resolving per drive", () => {
    for (const { label, profile, applications } of matrix) {
      const context = resolvePolicyContext(profile, applications, drives);
      for (const drive of drives) {
        expect(
          evaluatePolicyFor(profile, drive, context),
          `${label} / ${drive.company}`,
        ).toEqual(evaluatePolicy(profile, drive, applications, drives));
      }
    }
  });

  it("produces the same board either way", () => {
    for (const { label, profile, applications } of matrix) {
      const board = buildBoard({ profile, drives, applications }, NOW);
      // Rebuilt from the per-drive path, which buildBoard no longer uses.
      const expected = drives.map(
        (d) => evaluatePolicy(profile, d, applications, drives).state,
      );
      expect(
        board.views.map((v) => v.policy.state),
        label,
      ).toEqual(expected);
    }
  });

  it("carries one warning for the whole board, not one per drive", () => {
    const profile = makeProfile({ policy: "dream_threshold", dreamCtcLpa: 12 });
    const applications = [
      makeApplication("a", "offer", { offerCtcLpa: 8 }),
      makeApplication("b", "offer", { offerCtcLpa: 14 }),
    ];
    const board = buildBoard({ profile, drives, applications }, NOW);
    const distinct = new Set(board.views.map((v) => v.policy.warning));
    expect(distinct.size).toBe(1);
    expect(board.policyWarning).toContain("2 live offers");
  });
});
