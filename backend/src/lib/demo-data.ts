import type { Application, Criteria, Drive, Profile, RoundType } from "./engine";

/**
 * The demo batch.
 *
 * This is a plain data module rather than inline constants inside the seed
 * script, for one reason: the demo is what a reviewer and a two-minute video
 * will see, so the claims it makes — "two clashes, one touching pair that is
 * correctly not flagged, one undecidable verdict, one near miss on CGPA" — are
 * asserted in `src/tests/demo-data.test.ts` against the real engine. A demo
 * whose script says one thing and whose data says another is worse than no
 * demo.
 *
 * Dates are relative to a `now` passed in, so the board is never stale and the
 * tests never depend on the clock.
 */

export const DEMO_BATCH_COLLEGE = "Demo Institute of Technology";
export const DEMO_BATCH_GRAD_YEAR = 2027;
export const DEMO_BATCH_ID = "demo-institute-of-technology:2027";
export const DEMO_NAME = "Aarav Sharma";

/**
 * Gap years is deliberately left blank. One drive asks for it, which is what
 * puts a drive in the "cannot determine" group instead of guessing in the
 * student's favour.
 */
export const DEMO_PROFILE: Profile = {
  cgpa: 7.42,
  activeBacklogs: 0,
  branch: "CSE",
  tenthPercent: 88.6,
  twelfthPercent: 82.4,
  gapYears: null,
  policy: "dream_threshold",
  dreamCtcLpa: 12,
  // The demo student is unplaced, so the secured-placement gate stays out of
  // the way of everything the demo is there to show.
  securedPlacement: null,
};

const DAY = 86_400_000;

/**
 * A UTC instant for an IST wall-clock time, `days` from `now`.
 *
 * `hour` may be fractional: `16.5` means 16:30. Half-hour starts are how
 * placement slots are actually scheduled, and one of the demo clashes depends on
 * a 30-minute overlap rather than a whole hour.
 */
export function istFrom(now: Date, days: number, hour: number, minute = 0): Date {
  const whole = Math.floor(hour);
  const minutes = minute + Math.round((hour - whole) * 60);
  const base = new Date(now.getTime() + days * DAY);
  return new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), whole - 5, minutes - 30),
  );
}

type RoundSpec = [name: string, type: RoundType, dayOffset: number, fromHour: number, toHour: number];

export interface DemoDrive {
  slug: string;
  company: string;
  role: string;
  ctcLpa: number;
  location: string;
  deadlineDays: number;
  criteria: Partial<Criteria>;
  rounds: RoundSpec[];
  /** What this row is in the demo for. Printed by the seed script. */
  note: string;
}

export const DEMO_DRIVES: DemoDrive[] = [
  {
    slug: "rubrik",
    company: "Rubrik",
    role: "Software Engineer",
    ctcLpa: 45,
    location: "Bengaluru",
    deadlineDays: 9,
    criteria: { cgpaMin: 9.0, maxActiveBacklogs: 0, allowedBranches: ["CSE", "IT"] },
    rounds: [["Online assessment", "online_test", 12, 10, 12]],
    note: "not eligible — CGPA 7.42 against a 9.0 cutoff",
  },
  {
    slug: "atlassian",
    company: "Atlassian",
    role: "Software Engineer",
    ctcLpa: 28,
    location: "Bengaluru",
    deadlineDays: 3,
    criteria: { cgpaMin: 7.0, maxActiveBacklogs: 0, allowedBranches: ["CSE", "IT", "ECE"] },
    rounds: [
      ["Online assessment", "online_test", 4, 10, 12],
      ["Technical interview 1", "technical_interview", 9, 14, 15],
    ],
    note: "eligible, best paid available — clashes with Walmart",
  },
  {
    slug: "uber",
    company: "Uber",
    role: "Software Engineer I",
    ctcLpa: 24,
    location: "Hyderabad",
    deadlineDays: 5,
    criteria: { cgpaMin: 7.5, allowedBranches: ["CSE", "IT"] },
    rounds: [["CodeSignal assessment", "online_test", 7, 19, 21]],
    note: "not eligible by 0.08 CGPA — the near miss",
  },
  {
    slug: "nutanix",
    company: "Nutanix",
    role: "Member of Technical Staff",
    ctcLpa: 22,
    location: "Bengaluru",
    deadlineDays: 11,
    criteria: { cgpaMin: 8.0, maxActiveBacklogs: 0 },
    rounds: [["Online assessment", "online_test", 13, 10, 12]],
    note: "not eligible — CGPA",
  },
  {
    slug: "qualcomm",
    company: "Qualcomm",
    role: "Software Engineer",
    ctcLpa: 21,
    location: "Hyderabad",
    deadlineDays: 8,
    criteria: { cgpaMin: 7.0, allowedBranches: ["ECE", "EEE", "VLSI"] },
    rounds: [["Technical assessment", "online_test", 10, 10, 12]],
    note: "not eligible — branch",
  },
  {
    slug: "walmart",
    company: "Walmart Global Tech",
    role: "Software Engineer III",
    ctcLpa: 19,
    location: "Bengaluru",
    deadlineDays: 3,
    criteria: { cgpaMin: 7.0, maxActiveBacklogs: 0 },
    rounds: [
      ["Online assessment", "online_test", 4, 11, 13],
      ["Technical interview", "technical_interview", 11, 10, 11],
    ],
    note: "eligible — clashes with Atlassian by 60 minutes",
  },
  {
    slug: "morgan-stanley",
    company: "Morgan Stanley",
    role: "Technology Analyst",
    ctcLpa: 18,
    location: "Mumbai",
    deadlineDays: -2,
    criteria: { cgpaMin: 7.0, twelfthPercentMin: 60 },
    rounds: [],
    note: "eligible but the deadline has gone — populates the expired group",
  },
  {
    slug: "sprinklr",
    company: "Sprinklr",
    role: "Product Engineer",
    ctcLpa: 17,
    location: "Gurugram",
    deadlineDays: 1,
    criteria: { cgpaMin: 7.0, allowedBranches: ["CSE", "IT", "ECE"] },
    rounds: [["Online assessment", "online_test", 2, 15, 17]],
    note: "eligible, imminent — clashes with Cisco by 30 minutes",
  },
  {
    slug: "cisco",
    company: "Cisco",
    role: "Software Engineer",
    ctcLpa: 16,
    location: "Bengaluru",
    deadlineDays: 1,
    criteria: { cgpaMin: 7.0, twelfthPercentMin: 70 },
    rounds: [["Hackathon round", "online_test", 2, 16.5, 18.5]],
    note: "eligible — clashes with Sprinklr by 30 minutes",
  },
  {
    slug: "jpmc",
    company: "JP Morgan Chase",
    role: "Software Engineer",
    ctcLpa: 15.5,
    location: "Bengaluru",
    deadlineDays: 6,
    criteria: { cgpaMin: 7.0, maxActiveBacklogs: 0, tenthPercentMin: 60 },
    rounds: [
      ["Coding assessment", "online_test", 8, 10, 12],
      ["Superday", "technical_interview", 15, 9, 13],
    ],
    note: "eligible",
  },
  {
    slug: "oracle",
    company: "Oracle",
    role: "Server Technology Engineer",
    ctcLpa: 14,
    location: "Bengaluru",
    deadlineDays: 7,
    criteria: { cgpaMin: 7.0 },
    rounds: [["Online test", "online_test", 9, 15, 17]],
    note: "eligible",
  },
  {
    slug: "freshworks",
    company: "Freshworks",
    role: "Software Engineer",
    ctcLpa: 13,
    location: "Chennai",
    deadlineDays: 4,
    criteria: { cgpaMin: 6.5, tenthPercentMin: 85 },
    rounds: [["Online assessment", "online_test", 6, 14, 16]],
    note: "eligible — just above the 12 LPA dream line",
  },
  {
    slug: "zoho",
    company: "Zoho",
    role: "Member Technical Staff",
    ctcLpa: 11,
    location: "Chennai",
    deadlineDays: 2,
    criteria: { cgpaMin: 6.5 },
    rounds: [
      ["Aptitude round", "online_test", 6, 9, 11],
      ["Technical interview 1", "technical_interview", 12, 11, 12],
    ],
    note: "eligible, in progress — below the dream line",
  },
  {
    slug: "siemens",
    company: "Siemens",
    role: "Graduate Engineer Trainee",
    ctcLpa: 10,
    location: "Pune",
    deadlineDays: 10,
    criteria: { cgpaMin: 6.5, gapYearsAllowed: 0 },
    rounds: [["Technical round", "technical_interview", 14, 10, 11]],
    note: "cannot determine — the profile leaves gap years blank",
  },
  {
    slug: "infosys",
    company: "Infosys",
    role: "Specialist Programmer",
    ctcLpa: 9.5,
    location: "Pune",
    deadlineDays: 5,
    criteria: { cgpaMin: 6.0, maxActiveBacklogs: 0 },
    rounds: [["HackWithInfy round 1", "online_test", 6, 11, 13]],
    note: "eligible — starts exactly when Zoho's aptitude round ends, and must NOT be a clash",
  },
  {
    slug: "deloitte",
    company: "Deloitte USI",
    role: "Analyst",
    ctcLpa: 7.6,
    location: "Hyderabad",
    deadlineDays: 12,
    criteria: { cgpaMin: 6.5, twelfthPercentMin: 60, tenthPercentMin: 60 },
    rounds: [
      ["Assessment", "online_test", 16, 10, 12],
      ["Group discussion", "group_discussion", 18, 14, 16],
    ],
    note: "eligible, marked interested",
  },
  {
    slug: "tcs",
    company: "TCS Digital",
    role: "Systems Engineer",
    ctcLpa: 7.1,
    location: "Chennai",
    deadlineDays: 2,
    criteria: { cgpaMin: 6.0, maxActiveBacklogs: 0 },
    rounds: [["NQT Advanced", "online_test", 5, 10, 12]],
    note: "eligible, applied",
  },
  {
    slug: "hexaware",
    company: "Hexaware",
    role: "Engineer Trainee",
    ctcLpa: 4.5,
    location: "Chennai",
    deadlineDays: 14,
    criteria: {},
    rounds: [["Aptitude and technical", "online_test", 17, 10, 13]],
    note: "no criteria stated at all — open to everyone; rejected in the seeded history",
  },
];

/** The demo student's existing application state, by drive slug. */
export const DEMO_APPLICATIONS: Record<string, { status: Application["status"]; currentRound?: string }> =
  {
    tcs: { status: "applied" },
    zoho: { status: "in_progress", currentRound: "Technical interview 1" },
    deloitte: { status: "interested" },
    hexaware: { status: "rejected" },
  };

export function fullCriteria(partial: Partial<Criteria>): Criteria {
  return {
    cgpaMin: partial.cgpaMin ?? null,
    maxActiveBacklogs: partial.maxActiveBacklogs ?? null,
    allowedBranches: partial.allowedBranches ?? [],
    tenthPercentMin: partial.tenthPercentMin ?? null,
    twelfthPercentMin: partial.twelfthPercentMin ?? null,
    gapYearsAllowed: partial.gapYearsAllowed ?? null,
  };
}

/** The demo drives as engine domain objects, with slugs as ids. */
export function demoDrives(now: Date): Drive[] {
  return DEMO_DRIVES.map((d) => ({
    id: d.slug,
    company: d.company,
    role: d.role,
    ctcLpa: d.ctcLpa,
    location: d.location,
    applicationDeadline: istFrom(now, d.deadlineDays, 23, 59),
    criteria: fullCriteria(d.criteria),
    // The id is positional rather than a slug of the name, because two rounds
    // on one drive may share a name and still need separate identities (D3).
    rounds: d.rounds.map(([name, type, day, from, to], i) => ({
      id: `${d.slug}-r${i + 1}`,
      name,
      type,
      startAt: istFrom(now, day, from),
      endAt: istFrom(now, day, to),
    })),
  }));
}

/** The demo applications as engine domain objects. */
export function demoApplications(now: Date): Application[] {
  return Object.entries(DEMO_APPLICATIONS).map(([slug, state]) => ({
    id: `app-${slug}`,
    driveId: slug,
    status: state.status,
    currentRound: state.currentRound ?? null,
    offerCtcLpa: null,
    history: [{ status: state.status, at: new Date(now.getTime() - 3 * DAY) }],
  }));
}
