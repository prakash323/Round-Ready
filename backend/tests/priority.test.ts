import { describe, expect, it } from "vitest";
import { URGENCY_HORIZON_DAYS, WEIGHTS, daysUntil, scoreDrive } from "@/lib/engine";
import type { PriorityInput } from "@/lib/engine";
import { NOW, fromNow, makeApplication, makeDrive } from "./fixtures";

const base: PriorityInput = {
  drive: makeDrive({ ctcLpa: 10 }),
  application: null,
  nextDate: null,
  maxCtcLpa: 10,
  highestClashingCtcLpa: null,
  now: NOW,
};

function component(label: string, overrides: Partial<PriorityInput> = {}) {
  const score = scoreDrive({ ...base, ...overrides });
  const found = score.components.find((c) => c.label === label);
  if (!found) throw new Error(`no component "${label}"`);
  return found;
}

describe("compensation", () => {
  it("awards the full weight to the best-paid available drive", () => {
    expect(component("Compensation").points).toBe(WEIGHTS.ctc);
  });

  it("scales linearly below the best", () => {
    expect(component("Compensation", { maxCtcLpa: 20 }).points).toBe(WEIGHTS.ctc / 2);
  });

  it("awards nothing when there is no comparable drive", () => {
    expect(component("Compensation", { maxCtcLpa: 0 }).points).toBe(0);
  });

  it("never exceeds the weight, even if this drive pays more than the maximum", () => {
    expect(component("Compensation", { maxCtcLpa: 5 }).points).toBe(WEIGHTS.ctc);
  });
});

describe("urgency", () => {
  it("awards nothing when nothing is scheduled", () => {
    const c = component("Urgency");
    expect(c.points).toBe(0);
    expect(c.detail).toBe("nothing scheduled yet");
  });

  it("awards close to the full weight for something due today", () => {
    const c = component("Urgency", { nextDate: new Date(NOW.getTime() + 3_600_000) });
    expect(c.points).toBeGreaterThan(WEIGHTS.urgency * 0.95);
    expect(c.detail).toBe("due within 24 hours");
  });

  it("awards nothing beyond the horizon", () => {
    expect(component("Urgency", { nextDate: fromNow(URGENCY_HORIZON_DAYS) }).points).toBe(0);
    expect(component("Urgency", { nextDate: fromNow(90) }).points).toBe(0);
  });

  it("awards half the weight at half the horizon", () => {
    const c = component("Urgency", { nextDate: fromNow(URGENCY_HORIZON_DAYS / 2) });
    expect(c.points).toBeCloseTo(WEIGHTS.urgency / 2, 1);
  });

  it("awards nothing for a date that has already passed, and says so", () => {
    const c = component("Urgency", { nextDate: fromNow(-1) });
    expect(c.points).toBe(0);
    expect(c.detail).toBe("next date has passed");
  });

  it("describes the wait in whole days", () => {
    expect(component("Urgency", { nextDate: fromNow(1.5) }).detail).toBe("1 day away");
    expect(component("Urgency", { nextDate: fromNow(5.2) }).detail).toBe("5 days away");
  });
});

describe("progress through the funnel", () => {
  it("awards nothing before you have applied", () => {
    expect(component("Progress").points).toBe(0);
    expect(component("Progress").detail).toBe("not applied yet");
  });

  it("rewards each further stage more than the last", () => {
    const interested = component("Progress", { application: makeApplication("x", "interested") });
    const applied = component("Progress", { application: makeApplication("x", "applied") });
    const inProgress = component("Progress", { application: makeApplication("x", "in_progress") });
    expect(interested.points).toBeLessThan(applied.points);
    expect(applied.points).toBeLessThan(inProgress.points);
    expect(inProgress.points).toBe(WEIGHTS.stage);
  });
});

describe("the clash penalty", () => {
  it("is zero with no conflict", () => {
    expect(component("Conflict").points).toBe(0);
  });

  it("is full when the conflict is with a better-paid drive", () => {
    const c = component("Conflict", { highestClashingCtcLpa: 25 });
    expect(c.points).toBe(WEIGHTS.clash);
    expect(c.detail).toBe("clashes with a better-paid 25 LPA drive");
  });

  it("is halved when the conflict is with a worse-paid drive", () => {
    const c = component("Conflict", { highestClashingCtcLpa: 5 });
    expect(c.points).toBe(WEIGHTS.clash / 2);
    expect(c.detail).toBe("clashes with a lower-paid 5 LPA drive");
  });

  it("is halved for an equally-paid conflict, and says so without implying a ranking", () => {
    const c = component("Conflict", { highestClashingCtcLpa: 10 });
    expect(c.points).toBe(WEIGHTS.clash / 2);
    expect(c.detail).toBe("clashes with another 10 LPA drive");
  });
});

describe("the total", () => {
  it("is the sum of its components", () => {
    const score = scoreDrive({
      ...base,
      nextDate: fromNow(1),
      application: makeApplication("x", "applied"),
      highestClashingCtcLpa: 20,
    });
    const sum = score.components.reduce((n, c) => n + c.points, 0);
    expect(score.total).toBeCloseTo(sum, 1);
  });

  it("reaches 100 for the best-paid drive that is imminent and already in progress", () => {
    const score = scoreDrive({
      ...base,
      nextDate: new Date(NOW.getTime() + 60_000),
      application: makeApplication("x", "in_progress"),
    });
    expect(score.total).toBeCloseTo(100, 0);
  });

  it("never goes below zero, however many penalties apply", () => {
    const score = scoreDrive({
      ...base,
      maxCtcLpa: 1000,
      nextDate: fromNow(90),
      highestClashingCtcLpa: 2000,
    });
    expect(score.total).toBeGreaterThanOrEqual(0);
  });

  it("always explains itself with one component per factor", () => {
    expect(scoreDrive(base).components.map((c) => c.label)).toEqual([
      "Compensation",
      "Urgency",
      "Progress",
      "Conflict",
    ]);
  });
});

describe("daysUntil", () => {
  it("is positive for the future and negative for the past", () => {
    expect(daysUntil(NOW, fromNow(3))).toBeCloseTo(3, 5);
    expect(daysUntil(NOW, fromNow(-3))).toBeCloseTo(-3, 5);
  });
});
