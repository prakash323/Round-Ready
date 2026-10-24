import { describe, expect, it } from "vitest";
import {
  applicationSchema,
  batchPolicySchema,
  criteriaSchema,
  driveSchema,
  fieldErrors,
  profileSchema,
  registerSchema,
  roundSchema,
  simulateSchema,
} from "@/lib/schemas";

/** PRD section 9, "Input validation". */

function errors(result: { success: boolean; error?: unknown }): Record<string, string> {
  if (result.success) throw new Error("expected validation to fail");
  return fieldErrors(result.error as Parameters<typeof fieldErrors>[0]);
}

const validProfile = {
  cgpa: 7.4,
  activeBacklogs: 0,
  branch: "CSE",
  tenthPercent: 88,
  twelfthPercent: 82,
  gapYears: 0,
  policy: "none" as const,
  dreamCtcLpa: null,
};

describe("the profile", () => {
  it("accepts a complete profile", () => {
    expect(profileSchema.safeParse(validProfile).success).toBe(true);
  });

  it("rejects a CGPA above 10 or below 0", () => {
    expect(errors(profileSchema.safeParse({ ...validProfile, cgpa: 11 }))).toHaveProperty("cgpa");
    expect(errors(profileSchema.safeParse({ ...validProfile, cgpa: -1 }))).toHaveProperty("cgpa");
  });

  it("rejects negative backlogs", () => {
    expect(errors(profileSchema.safeParse({ ...validProfile, activeBacklogs: -1 }))).toHaveProperty(
      "activeBacklogs",
    );
  });

  it("rejects a fractional backlog count", () => {
    expect(errors(profileSchema.safeParse({ ...validProfile, activeBacklogs: 1.5 }))).toHaveProperty(
      "activeBacklogs",
    );
  });

  it("requires a branch", () => {
    expect(errors(profileSchema.safeParse({ ...validProfile, branch: "   " }))).toHaveProperty(
      "branch",
    );
  });

  it("treats an empty form field as 'not provided', not as zero", () => {
    // This is the whole basis of the `unknown` verdict: a blank 12th-percentage
    // box must not become a 0 that fails every cutoff.
    const parsed = profileSchema.parse({ ...validProfile, twelfthPercent: "" });
    expect(parsed.twelfthPercent).toBeNull();
  });

  it("coerces a numeric string from a form post", () => {
    const parsed = profileSchema.parse({ ...validProfile, cgpa: "8.25" });
    expect(parsed.cgpa).toBe(8.25);
  });

  it("rejects text in a numeric field", () => {
    expect(errors(profileSchema.safeParse({ ...validProfile, cgpa: "eight" }))).toHaveProperty(
      "cgpa",
    );
  });

  it("refuses a dream-threshold policy with no threshold", () => {
    const result = profileSchema.safeParse({
      ...validProfile,
      policy: "dream_threshold",
      dreamCtcLpa: null,
    });
    expect(errors(result)).toHaveProperty("dreamCtcLpa");
  });

  it("accepts a dream-threshold policy with a threshold", () => {
    expect(
      profileSchema.safeParse({ ...validProfile, policy: "dream_threshold", dreamCtcLpa: 12 })
        .success,
    ).toBe(true);
  });

  it("rejects an unknown policy name", () => {
    expect(profileSchema.safeParse({ ...validProfile, policy: "two_offers" }).success).toBe(false);
  });
});

describe("criteria", () => {
  it("defaults an omitted branch list to empty, meaning all branches", () => {
    const parsed = criteriaSchema.parse({});
    expect(parsed.allowedBranches).toEqual([]);
    expect(parsed.cgpaMin).toBeNull();
  });

  it("de-duplicates and trims the branch list", () => {
    const parsed = criteriaSchema.parse({ allowedBranches: [" CSE ", "CSE", "IT"] });
    expect(parsed.allowedBranches).toEqual(["CSE", "IT"]);
  });

  it("keeps a zero cutoff, which is a real cutoff", () => {
    expect(criteriaSchema.parse({ cgpaMin: 0 }).cgpaMin).toBe(0);
  });
});

describe("rounds", () => {
  const start = "2026-10-27T04:30:00.000Z";

  it("accepts a round that ends after it starts", () => {
    expect(
      roundSchema.safeParse({
        name: "Online test",
        type: "online_test",
        startAt: start,
        endAt: "2026-10-27T06:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("rejects a round that ends before it starts", () => {
    const result = roundSchema.safeParse({
      name: "Online test",
      type: "online_test",
      startAt: start,
      endAt: "2026-10-27T03:00:00.000Z",
    });
    expect(errors(result)).toHaveProperty("endAt");
  });

  it("rejects a zero-length round, which would silently never clash", () => {
    const result = roundSchema.safeParse({
      name: "Online test",
      type: "online_test",
      startAt: start,
      endAt: start,
    });
    expect(errors(result)).toHaveProperty("endAt");
  });

  it("requires a name", () => {
    const result = roundSchema.safeParse({
      name: "",
      type: "online_test",
      startAt: start,
      endAt: "2026-10-27T06:00:00.000Z",
    });
    expect(errors(result)).toHaveProperty("name");
  });
});

describe("drives", () => {
  const validDrive = {
    company: "Zoho",
    role: "Member Technical Staff",
    ctcLpa: 11,
    location: "Chennai",
    applicationDeadline: "2026-10-30T18:29:00.000Z",
    criteria: {},
    rounds: [],
  };

  it("accepts a minimal drive with no criteria and no rounds", () => {
    const parsed = driveSchema.parse({ company: "Zoho", role: "MTS", ctcLpa: 11, criteria: {} });
    expect(parsed.rounds).toEqual([]);
    expect(parsed.applicationDeadline).toBeNull();
    expect(parsed.location).toBeNull();
  });

  it("requires a company name", () => {
    expect(errors(driveSchema.safeParse({ ...validDrive, company: " " }))).toHaveProperty("company");
  });

  it("rejects a negative CTC", () => {
    expect(errors(driveSchema.safeParse({ ...validDrive, ctcLpa: -5 }))).toHaveProperty("ctcLpa");
  });

  it("rejects an invalid round inside an otherwise valid drive", () => {
    const result = driveSchema.safeParse({
      ...validDrive,
      rounds: [
        {
          name: "OA",
          type: "online_test",
          startAt: "2026-10-27T06:00:00.000Z",
          endAt: "2026-10-27T04:30:00.000Z",
        },
      ],
    });
    expect(Object.keys(errors(result))[0]).toContain("rounds.0");
  });
});

describe("applications", () => {
  // A realistic id: the schema now checks the shape, because anything else
  // reaches `new Types.ObjectId` in a controller and throws a 500.
  const DRIVE_ID = "6adca93997238f52b6a4ffb2";

  it("accepts a status change with no offer", () => {
    expect(
      applicationSchema.safeParse({ driveId: DRIVE_ID, status: "applied", offerCtcLpa: null }).success,
    ).toBe(true);
  });

  it("refuses to record an offer without its CTC", () => {
    const result = applicationSchema.safeParse({
      driveId: DRIVE_ID,
      status: "offer",
      offerCtcLpa: null,
    });
    expect(errors(result)).toHaveProperty("offerCtcLpa");
  });

  it("accepts an offer with its CTC", () => {
    expect(
      applicationSchema.safeParse({ driveId: DRIVE_ID, status: "offer", offerCtcLpa: 8 }).success,
    ).toBe(true);
  });
});

describe("registration", () => {
  it("lowercases and trims the email", () => {
    const parsed = registerSchema.parse({
      name: "Aarav",
      email: "  Aarav@Example.COM ",
      password: "a-long-enough-password",
      college: "Example Institute",
      gradYear: 2027,
    });
    expect(parsed.email).toBe("aarav@example.com");
  });

  it("rejects a short password", () => {
    const result = registerSchema.safeParse({
      name: "Aarav",
      email: "a@b.com",
      password: "short",
      college: "Example Institute",
      gradYear: 2027,
    });
    expect(errors(result)).toHaveProperty("password");
  });

  it("rejects an implausible graduating year", () => {
    const result = registerSchema.safeParse({
      name: "Aarav",
      email: "a@b.com",
      password: "a-long-enough-password",
      college: "Example Institute",
      gradYear: 1999,
    });
    expect(errors(result)).toHaveProperty("gradYear");
  });
});

describe("fieldErrors", () => {
  it("keeps the first message per field so a form shows one error per input", () => {
    const result = profileSchema.safeParse({ ...validProfile, cgpa: 99, branch: "" });
    const map = errors(result);
    expect(Object.keys(map).sort()).toEqual(["branch", "cgpa"]);
    expect(typeof map.cgpa).toBe("string");
  });
});

/**
 * The validation sweep.
 *
 * Each of these is a field that parsed happily before and produced something
 * wrong further downstream — a 500 from a cast, a drive permanently expired on
 * the epoch, a gate that never fires. They are grouped here because the common
 * thread is not the field but the failure mode: input that is accepted and
 * then quietly misbehaves is worse than input that is rejected with a sentence.
 */
describe("ids that will be cast to an ObjectId", () => {
  const DRIVE_ID = "6adca93997238f52b6a4ffb2";

  it("accepts a real id", () => {
    expect(applicationSchema.safeParse({ driveId: DRIVE_ID, status: "applied" }).success).toBe(
      true,
    );
    expect(simulateSchema.safeParse({ driveId: DRIVE_ID, offerCtcLpa: 12 }).success).toBe(true);
  });

  it("rejects anything that is not one, rather than letting the cast throw", () => {
    // `new Types.ObjectId("abc")` throws inside the controller, which reads to
    // the client as a 500 — a server fault for what is a client mistake.
    for (const bad of ["abc", "", "   ", "6adca93997238f52b6a4ff", `${DRIVE_ID}0`, "../../etc"]) {
      expect(
        applicationSchema.safeParse({ driveId: bad, status: "applied" }).success,
        `driveId ${JSON.stringify(bad)}`,
      ).toBe(false);
    }
  });

  it("names the field so the form can show the error", () => {
    expect(errors(applicationSchema.safeParse({ driveId: "abc", status: "applied" }))).toHaveProperty(
      "driveId",
    );
  });
});

describe("an application deadline", () => {
  const validDrive = { company: "Zoho", role: "MTS", ctcLpa: 11, criteria: {}, rounds: [] };

  it("is optional", () => {
    expect(driveSchema.parse({ ...validDrive }).applicationDeadline).toBeNull();
    expect(
      driveSchema.parse({ ...validDrive, applicationDeadline: "" }).applicationDeadline,
    ).toBeNull();
  });

  it("does not silently become the epoch", () => {
    // `z.coerce.date()` turns 0, false and null into 1 January 1970, all of
    // which are *valid* Dates — so the drive renders as permanently expired
    // and no error is ever shown. D4, one step quieter.
    for (const bad of [0, false, "not a date"]) {
      const result = driveSchema.safeParse({ ...validDrive, applicationDeadline: bad });
      expect(result.success, `deadline ${JSON.stringify(bad)}`).toBe(false);
    }
  });

  it("rejects a year that cannot be right", () => {
    // A mistyped 20255 is a deadline two hundred centuries out, which never
    // expires and sits at the top of every sort forever.
    expect(
      driveSchema.safeParse({ ...validDrive, applicationDeadline: "20255-10-30T00:00:00.000Z" })
        .success,
    ).toBe(false);
    expect(
      driveSchema.safeParse({ ...validDrive, applicationDeadline: "1970-01-01T00:00:00.000Z" })
        .success,
    ).toBe(false);
  });

  it("accepts a real one", () => {
    const parsed = driveSchema.parse({
      ...validDrive,
      applicationDeadline: "2026-10-30T18:29:00.000Z",
    });
    expect(parsed.applicationDeadline?.getUTCFullYear()).toBe(2026);
  });
});

describe("rounds within one drive", () => {
  const base = { company: "Zoho", role: "MTS", ctcLpa: 11, criteria: {} };
  const round = (name: string, startAt: string, endAt: string) => ({
    name,
    type: "online_test" as const,
    startAt,
    endAt,
  });

  it("rejects two that overlap each other", () => {
    // A drive that clashes with itself reaches the board as a scheduling
    // conflict the student has no way to resolve.
    const result = driveSchema.safeParse({
      ...base,
      rounds: [
        round("OA", "2026-10-27T04:00:00.000Z", "2026-10-27T06:00:00.000Z"),
        round("Tech", "2026-10-27T05:00:00.000Z", "2026-10-27T07:00:00.000Z"),
      ],
    });
    expect(result.success).toBe(false);
    expect(Object.keys(errors(result))[0]).toContain("rounds.1");
    expect(Object.values(errors(result))[0]).toContain("OA");
  });

  it("allows two that merely touch", () => {
    // Half-open, matching the engine: an 11:00 round does not clash with one
    // ending at 11:00, and an officer scheduling back-to-back rounds is doing
    // something completely ordinary.
    expect(
      driveSchema.safeParse({
        ...base,
        rounds: [
          round("OA", "2026-10-27T04:00:00.000Z", "2026-10-27T06:00:00.000Z"),
          round("Tech", "2026-10-27T06:00:00.000Z", "2026-10-27T08:00:00.000Z"),
        ],
      }).success,
    ).toBe(true);
  });

  it("allows two on different days", () => {
    expect(
      driveSchema.safeParse({
        ...base,
        rounds: [
          round("OA", "2026-10-27T04:00:00.000Z", "2026-10-27T06:00:00.000Z"),
          round("Tech", "2026-10-28T04:00:00.000Z", "2026-10-28T06:00:00.000Z"),
        ],
      }).success,
    ).toBe(true);
  });
});

describe("a secured package of zero", () => {
  it("is refused, because it would multiply out to a bar of zero", () => {
    // Every drive clears a threshold of 0, so the strictest gate on the board
    // would silently never fire and the student would never learn why.
    const result = profileSchema.safeParse({
      ...validProfile,
      hasSecuredPlacement: true,
      securedCompany: "Infosys",
      securedCtcLpa: 0,
      securedCategory: "service_based",
    });
    expect(result.success).toBe(false);
    expect(errors(result)).toHaveProperty("securedCtcLpa");
  });
});

describe("the officer's multipliers", () => {
  it("round-trip through the same schema the route uses", () => {
    expect(batchPolicySchema.parse({ serviceMultiplier: 1.5, productMultiplier: 2 })).toEqual({
      serviceMultiplier: 1.5,
      productMultiplier: 2,
    });
  });
});

describe("a rejected deadline", () => {
  it("says what is wrong rather than \"Invalid input\"", () => {
    // A number falls through every member of the union, and the default
    // message names neither the field's problem nor what to type instead.
    const result = driveSchema.safeParse({
      company: "Zoho",
      role: "MTS",
      ctcLpa: 11,
      criteria: {},
      applicationDeadline: 0,
    });
    expect(errors(result).applicationDeadline).toBe("That is not a date we can read");
  });
});
