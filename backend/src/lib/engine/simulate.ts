import { buildBoard } from "./board";
import type { BoardInput, DriveView } from "./board";
import type { Application, PlacementPolicy } from "./types";

/**
 * The offer-decision simulator.
 *
 * This is the feature the spreadsheet cannot have. A student holding an 8 LPA
 * offer under a dream-threshold policy has 48 hours to accept or decline, and
 * the question they cannot answer is *what does accepting cost me*. Not in the
 * abstract — which specific companies, still live, that I am actually eligible
 * for, close the moment I say yes.
 *
 * It is implemented by building the board twice: once as things stand, once
 * with a hypothetical accepted offer injected, then diffing the policy gate.
 * Because the board is derived rather than stored, a hypothetical costs nothing
 * — no transaction, no rollback, no risk of leaving the real board altered.
 */

export type SimulationVerdict = "safe" | "consider" | "costly";

export interface AffectedDrive {
  driveId: string;
  company: string;
  role: string;
  ctcLpa: number;
  nextDate: Date | null;
  deadlinePassed: boolean;
}

export interface SimulationResult {
  accepted: { driveId: string; company: string; role: string; ctcLpa: number };
  policy: PlacementPolicy;
  /** The CTC line this acceptance would draw. `Infinity` under a one-offer policy. */
  floorLpa: number | null;
  /** Drives available to you now that this acceptance would close. */
  closes: AffectedDrive[];
  /** Drives available to you now that would survive it. */
  survives: AffectedDrive[];
  /** The best-paid drive you would be giving up. */
  highestClosed: AffectedDrive | null;
  /** How much more the best forgone drive pays than this offer. Zero if none. */
  ctcForegone: number;
  verdict: SimulationVerdict;
  headline: string;
  rationale: string[];
}

function toAffected(view: DriveView): AffectedDrive {
  return {
    driveId: view.drive.id,
    company: view.drive.company,
    role: view.drive.role,
    ctcLpa: view.drive.ctcLpa,
    nextDate: view.nextDate?.at ?? null,
    deadlinePassed: view.deadlinePassed,
  };
}

/** A hypothetical application set in which `driveId` has been accepted. */
export function withHypotheticalOffer(
  applications: Application[],
  driveId: string,
  ctcLpa: number,
  now: Date,
): Application[] {
  const existing = applications.find((a) => a.driveId === driveId);
  const accepted: Application = {
    id: existing?.id ?? `hypothetical:${driveId}`,
    driveId,
    status: "offer",
    currentRound: existing?.currentRound ?? null,
    offerCtcLpa: ctcLpa,
    history: [...(existing?.history ?? []), { status: "offer", at: now }],
  };
  const rest = applications.filter((a) => a.driveId !== driveId);
  return [...rest, accepted];
}

export function simulateAccept(
  input: BoardInput,
  acceptDriveId: string,
  acceptCtcLpa?: number,
  now: Date = new Date(),
): SimulationResult {
  const drive = input.drives.find((d) => d.id === acceptDriveId);
  if (!drive) {
    throw new Error(`Cannot simulate: no drive with id ${acceptDriveId}`);
  }
  const ctc = acceptCtcLpa ?? drive.ctcLpa;

  const before = buildBoard(input, now);
  const after = buildBoard(
    { ...input, applications: withHypotheticalOffer(input.applications, acceptDriveId, ctc, now) },
    now,
  );

  // Only drives that were genuinely available before are a real loss. A drive
  // you were never eligible for, or whose deadline has already gone, is not a
  // cost of accepting — the board has already classified those as `not_eligible`
  // and `expired`, so taking `actionable` and `unknown` is exactly the live set.
  const availableBefore = [...before.actionable, ...before.unknown].filter(
    (v) => v.drive.id !== acceptDriveId,
  );
  const statusAfter = new Map(after.views.map((v) => [v.drive.id, v.status]));

  const closes: AffectedDrive[] = [];
  const survives: AffectedDrive[] = [];
  for (const view of availableBefore) {
    const target = statusAfter.get(view.drive.id) === "blocked" ? closes : survives;
    target.push(toAffected(view));
  }
  closes.sort((a, b) => b.ctcLpa - a.ctcLpa);
  survives.sort((a, b) => b.ctcLpa - a.ctcLpa);

  const highestClosed = closes[0] ?? null;
  const ctcForegone = highestClosed ? Math.max(0, round2(highestClosed.ctcLpa - ctc)) : 0;

  // A one-offer policy has an infinite floor, which does not survive JSON
  // (`JSON.stringify(Infinity)` is `null`). Report it as null and let the
  // policy name carry the meaning, rather than shipping a value that changes
  // when it crosses the wire.
  const rawFloor = after.views.find((v) => v.policy.floorLpa !== null)?.policy.floorLpa ?? null;
  const floorLpa = rawFloor !== null && Number.isFinite(rawFloor) ? rawFloor : null;

  const { verdict, headline, rationale } = judge({
    policy: input.profile.policy,
    company: drive.company,
    ctc,
    closes,
    survives,
    highestClosed,
    ctcForegone,
    floorLpa,
  });

  return {
    accepted: { driveId: drive.id, company: drive.company, role: drive.role, ctcLpa: ctc },
    policy: input.profile.policy,
    floorLpa,
    closes,
    survives,
    highestClosed,
    ctcForegone,
    verdict,
    headline,
    rationale,
  };
}

interface JudgeInput {
  policy: PlacementPolicy;
  company: string;
  ctc: number;
  closes: AffectedDrive[];
  survives: AffectedDrive[];
  highestClosed: AffectedDrive | null;
  ctcForegone: number;
  floorLpa: number | null;
}

/**
 * The verdict is advisory and says so. The tool does the arithmetic the student
 * cannot do from a spreadsheet; it does not decide for them, because risk
 * appetite, family circumstances and how much they want a particular company
 * are not in the data model.
 */
function judge(input: JudgeInput): Pick<SimulationResult, "verdict" | "headline" | "rationale"> {
  const { policy, company, ctc, closes, survives, highestClosed, ctcForegone, floorLpa } = input;
  const rationale: string[] = [];

  if (policy === "none") {
    rationale.push(
      "Your college has no offer-limiting policy on file, so accepting does not close anything here.",
    );
    rationale.push("If your TPO does restrict further drives, set the policy in your profile first.");
    return {
      verdict: "safe",
      headline: `Accepting ${company} closes nothing on your board`,
      rationale,
    };
  }

  if (policy === "one_offer") {
    rationale.push("Your college runs a one-offer policy: accepting ends your placement season.");
  } else {
    rationale.push(
      `Accepting at ${ctc} LPA sets your line at ${floorLpa} LPA — only drives above it stay open.`,
    );
  }

  if (closes.length === 0) {
    rationale.push("Nothing you are currently eligible for would be closed by this.");
    return {
      verdict: "safe",
      headline: `Accepting ${company} costs you nothing you can still act on`,
      rationale,
    };
  }

  rationale.push(
    `${closes.length} drive${closes.length === 1 ? "" : "s"} you are eligible for and can still apply to would close.`,
  );

  if (highestClosed && ctcForegone <= 0) {
    rationale.push(
      `The best of them, ${highestClosed.company} at ${highestClosed.ctcLpa} LPA, pays no more than this offer.`,
    );
    return {
      verdict: "safe",
      headline: `${closes.length} drives close, but none pay more than ${ctc} LPA`,
      rationale,
    };
  }

  if (highestClosed) {
    rationale.push(
      `The best of them is ${highestClosed.company} at ${highestClosed.ctcLpa} LPA — ${ctcForegone} LPA more than this offer.`,
    );
  }
  if (survives.length > 0) {
    rationale.push(
      `${survives.length} drive${survives.length === 1 ? "" : "s"} would remain open to you.`,
    );
  } else {
    rationale.push("No drives would remain open to you afterwards.");
  }
  rationale.push(
    "This is arithmetic, not advice — a sure offer now against uncertain drives later is your call.",
  );

  const costly = ctc > 0 && ctcForegone / ctc >= 0.4;
  return {
    verdict: costly ? "costly" : "consider",
    // Naming the company beats "a 11 LPA shot" — it is better information, and
    // it sidesteps an indefinite article that is wrong for 8, 11 and 18.
    headline: costly
      ? `Accepting ${company} gives up ${highestClosed?.company} at ${highestClosed?.ctcLpa} LPA, which you are eligible for`
      : `${closes.length} eligible drive${closes.length === 1 ? "" : "s"} would close, the best at ${highestClosed?.ctcLpa} LPA`,
    rationale,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
