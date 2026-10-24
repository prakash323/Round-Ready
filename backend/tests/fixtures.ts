import type {
  Application,
  ApplicationStatus,
  Criteria,
  Drive,
  Profile,
  Round,
  RoundType,
} from "@/lib/engine";

/**
 * Test fixtures.
 *
 * `NOW` is fixed. Every function in the engine takes the current time as an
 * argument precisely so the tests never depend on when they run — a suite that
 * passes in the morning and fails at 23:55 IST is not a suite.
 *
 * 2026-10-23T06:00:00Z is 11:30 IST on Friday 23 October 2026.
 */
export const NOW = new Date("2026-10-23T06:00:00.000Z");

export function iso(value: string): Date {
  return new Date(value);
}

/** Days from NOW, as a Date. Accepts fractions. */
export function fromNow(days: number): Date {
  return new Date(NOW.getTime() + days * 86_400_000);
}

export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    cgpa: 7.4,
    activeBacklogs: 0,
    branch: "CSE",
    tenthPercent: 88,
    twelfthPercent: 82,
    gapYears: 0,
    policy: "none",
    dreamCtcLpa: null,
    securedPlacement: null,
    ...overrides,
  };
}

/** All criteria unspecified — nothing is evaluated unless a test sets it. */
export function makeCriteria(overrides: Partial<Criteria> = {}): Criteria {
  return {
    cgpaMin: null,
    maxActiveBacklogs: null,
    allowedBranches: [],
    tenthPercentMin: null,
    twelfthPercentMin: null,
    gapYearsAllowed: null,
    ...overrides,
  };
}

let roundCounter = 0;

/**
 * The id is generated rather than derived from the name, so that two rounds
 * sharing a name still get distinct identities — which is the whole point of
 * `Round.id` (AUDIT.md D3). Pass `id` explicitly when a test needs to assert
 * against a specific one.
 */
export function makeRound(
  name: string,
  startAt: Date,
  endAt: Date,
  type: RoundType = "online_test",
  id?: string,
): Round {
  roundCounter += 1;
  return { id: id ?? `round-${roundCounter}`, name, type, startAt, endAt };
}

let driveCounter = 0;

export function makeDrive(overrides: Partial<Drive> = {}): Drive {
  driveCounter += 1;
  return {
    id: `drive-${driveCounter}`,
    company: `Company ${driveCounter}`,
    role: "Software Engineer",
    ctcLpa: 10,
    location: "Bengaluru",
    applicationDeadline: fromNow(5),
    criteria: makeCriteria(),
    rounds: [],
    ...overrides,
  };
}

export function makeApplication(
  driveId: string,
  status: ApplicationStatus,
  overrides: Partial<Application> = {},
): Application {
  return {
    id: `app-${driveId}`,
    driveId,
    status,
    currentRound: null,
    offerCtcLpa: status === "offer" ? 10 : null,
    history: [{ status, at: NOW }],
    ...overrides,
  };
}

/** A fixed IST wall-clock time on a given day offset, as a UTC Date. */
export function istAt(dayOffset: number, hour: number, minute = 0): Date {
  // IST is UTC+05:30 with no daylight saving, so the conversion is exact.
  const base = new Date(NOW.getTime() + dayOffset * 86_400_000);
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth();
  const d = base.getUTCDate();
  return new Date(Date.UTC(y, m, d, hour - 5, minute - 30));
}
