import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetEnvForTests } from "@/config/env";
import {
  isOfficerCodeConfigured,
  officerAttemptsExhausted,
  officerCodeMatches,
  officerRetryAfterSeconds,
  recordFailedOfficerAttempt,
  resetOfficerAttempts,
} from "@/lib/officer-code";
import { ROLES } from "@/models/User";
import { batchPolicySchema, registerSchema } from "@/lib/schemas";

/**
 * Who may publish a drive.
 *
 * The role split is the one piece of this app where a mistake is not a wrong
 * number on a screen: an unauthorised write here changes the eligibility
 * criteria that three hundred students read. So these tests are about the
 * boundary rather than the happy path — what a student cannot do, what an
 * unconfigured deployment refuses, and what a wrong code costs.
 */

const CODE = "a-sufficiently-long-code";

/**
 * Run one case against a specific officer-code configuration.
 *
 * `loadEnv` memoises, so the cache is cleared on the way in and on the way
 * out — otherwise the first case in the process would decide the configuration
 * for all of them, and "no code configured" could never be tested at all.
 */
function withCode<T>(value: string | undefined, run: () => T): T {
  const previous = process.env.CDC_OFFICER_CODE;
  if (value === undefined) delete process.env.CDC_OFFICER_CODE;
  else process.env.CDC_OFFICER_CODE = value;
  resetEnvForTests();
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.CDC_OFFICER_CODE;
    else process.env.CDC_OFFICER_CODE = previous;
    resetEnvForTests();
  }
}

beforeEach(() => resetOfficerAttempts());
afterEach(() => resetOfficerAttempts());

describe("the officer code", () => {
  it("fails closed when no code is configured", () => {
    // A deployment that forgot to set one should have no officers, not an
    // open door where every registration becomes one.
    withCode(undefined, () => {
      expect(isOfficerCodeConfigured()).toBe(false);
      expect(officerCodeMatches("")).toBe(false);
      expect(officerCodeMatches("anything")).toBe(false);
    });
  });

  it("accepts only the exact code", () => {
    withCode(CODE, () => {
      expect(officerCodeMatches(CODE)).toBe(true);
      expect(officerCodeMatches(CODE.toUpperCase())).toBe(false);
      expect(officerCodeMatches(`${CODE} `)).toBe(false);
      expect(officerCodeMatches(CODE.slice(0, -1))).toBe(false);
    });
  });

  it("does not throw on a length mismatch", () => {
    // `timingSafeEqual` throws when the buffers differ in length, which would
    // turn a wrong-length guess into a 500 — and a 500 is itself an oracle.
    withCode(CODE, () => {
      expect(() => officerCodeMatches("x")).not.toThrow();
      expect(() => officerCodeMatches("x".repeat(500))).not.toThrow();
      expect(officerCodeMatches("x")).toBe(false);
    });
  });
});

describe("the attempt limiter", () => {
  it("allows a few failures and then stops", () => {
    expect(officerAttemptsExhausted("1.2.3.4")).toBe(false);
    for (let i = 0; i < 5; i += 1) recordFailedOfficerAttempt("1.2.3.4");
    expect(officerAttemptsExhausted("1.2.3.4")).toBe(true);
  });

  it("counts each address separately", () => {
    // One person guessing must not lock out a batch registering normally.
    for (let i = 0; i < 5; i += 1) recordFailedOfficerAttempt("1.2.3.4");
    expect(officerAttemptsExhausted("5.6.7.8")).toBe(false);
  });

  it("clears once the window passes", () => {
    const start = 1_700_000_000_000;
    for (let i = 0; i < 5; i += 1) recordFailedOfficerAttempt("1.2.3.4", start);
    expect(officerAttemptsExhausted("1.2.3.4", start)).toBe(true);
    expect(officerAttemptsExhausted("1.2.3.4", start + 15 * 60 * 1000 + 1)).toBe(false);
  });

  it("reports how long is left, for Retry-After", () => {
    const start = 1_700_000_000_000;
    recordFailedOfficerAttempt("1.2.3.4", start);
    expect(officerRetryAfterSeconds("1.2.3.4", start)).toBe(15 * 60);
    expect(officerRetryAfterSeconds("1.2.3.4", start + 15 * 60 * 1000 + 1)).toBe(0);
  });
});

describe("the role itself", () => {
  it("has exactly two values", () => {
    // Guards against an "admin" appearing with no gate written for it.
    expect([...ROLES]).toEqual(["student", "cdc_officer"]);
  });
});

describe("registration", () => {
  const base = {
    name: "Aarav Sharma",
    email: "aarav@example.edu",
    password: "placement2026",
    college: "VIT-AP",
    gradYear: new Date().getFullYear() + 1,
  };

  it("treats a missing officer code as a student registration", () => {
    const parsed = registerSchema.parse(base);
    expect(parsed.officerCode).toBeNull();
  });

  it("treats a blank officer code as no claim at all", () => {
    // An empty optional input must not read as "tried and failed", or every
    // student registration would spend an attempt against the limiter.
    expect(registerSchema.parse({ ...base, officerCode: "" }).officerCode).toBeNull();
    expect(registerSchema.parse({ ...base, officerCode: "   " }).officerCode).toBeNull();
  });

  it("keeps a supplied code for the server to check", () => {
    expect(registerSchema.parse({ ...base, officerCode: " secret-code " }).officerCode).toBe(
      "secret-code",
    );
  });

  it("rejects a password that is the email address", () => {
    const result = registerSchema.safeParse({
      ...base,
      password: base.email,
    });
    expect(result.success).toBe(false);
  });

  it("accepts the years either side of today rather than two frozen literals", () => {
    const year = new Date().getFullYear();
    expect(registerSchema.safeParse({ ...base, gradYear: year + 4 }).success).toBe(true);
    expect(registerSchema.safeParse({ ...base, gradYear: year - 5 }).success).toBe(true);
    expect(registerSchema.safeParse({ ...base, gradYear: year + 20 }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, gradYear: 1998 }).success).toBe(false);
  });
});

describe("the batch policy an officer sets", () => {
  it("accepts the standard multipliers", () => {
    const parsed = batchPolicySchema.parse({ serviceMultiplier: 1.5, productMultiplier: 2 });
    expect(parsed).toEqual({ serviceMultiplier: 1.5, productMultiplier: 2 });
  });

  it("refuses a multiplier below 1", () => {
    // Below 1 the rule inverts: a placed student could sit for something that
    // pays less than what they already hold, which is the opposite of a
    // higher-offer policy.
    const result = batchPolicySchema.safeParse({
      serviceMultiplier: 0.8,
      productMultiplier: 2,
    });
    expect(result.success).toBe(false);
  });

  it("allows exactly 1, which means anything strictly better", () => {
    expect(
      batchPolicySchema.safeParse({ serviceMultiplier: 1, productMultiplier: 1 }).success,
    ).toBe(true);
  });

  it("refuses a multiplier that would close the batch to everyone", () => {
    expect(
      batchPolicySchema.safeParse({ serviceMultiplier: 50, productMultiplier: 2 }).success,
    ).toBe(false);
  });

  it("refuses more precision than the displayed threshold can carry", () => {
    expect(
      batchPolicySchema.safeParse({ serviceMultiplier: 1.555, productMultiplier: 2 }).success,
    ).toBe(false);
  });

  it("reads a multiplier typed into a form", () => {
    // The form submits strings; coercion happens here rather than in a handler.
    const parsed = batchPolicySchema.parse({ serviceMultiplier: "1.75", productMultiplier: "2.5" });
    expect(parsed.serviceMultiplier).toBe(1.75);
  });

  it("names the field it is unhappy about", () => {
    const result = batchPolicySchema.safeParse({ serviceMultiplier: 1.5, productMultiplier: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["productMultiplier"]);
    }
  });
});
