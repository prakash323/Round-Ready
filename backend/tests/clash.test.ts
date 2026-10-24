import { describe, expect, it } from "vitest";
import { clashesByDrive, counterpart, findClashes, overlaps } from "@/lib/engine";
import { istAt, makeApplication, makeDrive, makeRound } from "./fixtures";

/** PRD section 9, "Clash detection". */

const t = (h: number, m = 0) => istAt(3, h, m);

describe("the half-open interval", () => {
  it("does not clash two rounds that merely touch", () => {
    // 10:00–11:00 followed by 11:00–12:00 is back to back, not a conflict.
    expect(overlaps(t(10), t(11), t(11), t(12))).toBe(false);
    expect(overlaps(t(11), t(12), t(10), t(11))).toBe(false);
  });

  it("clashes two rounds that overlap by one minute", () => {
    expect(overlaps(t(10), t(11), t(10, 59), t(12))).toBe(true);
  });

  it("clashes a round fully contained in another", () => {
    expect(overlaps(t(10), t(11), t(10, 15), t(10, 30))).toBe(true);
  });

  it("clashes two rounds with identical windows", () => {
    expect(overlaps(t(10), t(11), t(10), t(11))).toBe(true);
  });

  it("does not clash rounds on different days", () => {
    expect(overlaps(istAt(1, 10), istAt(1, 11), istAt(2, 10), istAt(2, 11))).toBe(false);
  });
});

describe("findClashes", () => {
  it("flags an overlapping pair once and measures the overlap", () => {
    const a = makeDrive({ id: "a", company: "Alpha", rounds: [makeRound("OA", t(10), t(11, 30))] });
    const b = makeDrive({ id: "b", company: "Beta", rounds: [makeRound("Test", t(11), t(12))] });
    const clashes = findClashes([a, b], []);
    expect(clashes).toHaveLength(1);
    expect(clashes[0].overlapMinutes).toBe(30);
  });

  it("finds nothing for back-to-back rounds", () => {
    const a = makeDrive({ id: "a", rounds: [makeRound("OA", t(10), t(11))] });
    const b = makeDrive({ id: "b", rounds: [makeRound("OA", t(11), t(12))] });
    expect(findClashes([a, b], [])).toHaveLength(0);
  });

  it("reports both sides of a conflict", () => {
    const a = makeDrive({ id: "a", company: "Alpha", rounds: [makeRound("OA", t(10), t(12))] });
    const b = makeDrive({ id: "b", company: "Beta", rounds: [makeRound("GD", t(11), t(13))] });
    const index = clashesByDrive(findClashes([a, b], []));
    expect(index.get("a")).toHaveLength(1);
    expect(index.get("b")).toHaveLength(1);
    expect(counterpart(index.get("a")![0], "a").company).toBe("Beta");
    expect(counterpart(index.get("b")![0], "b").company).toBe("Alpha");
  });

  it("names the other two when three rounds all overlap", () => {
    const drives = ["a", "b", "c"].map((id, i) =>
      makeDrive({ id, company: id.toUpperCase(), rounds: [makeRound("OA", t(10, i * 5), t(12))] }),
    );
    const clashes = findClashes(drives, []);
    expect(clashes).toHaveLength(3); // every pair
    const index = clashesByDrive(clashes);
    expect(index.get("a")).toHaveLength(2);
    expect(index.get("b")).toHaveLength(2);
    expect(index.get("c")).toHaveLength(2);
  });

  it("never flags two rounds of the same drive against each other", () => {
    // Sequential stages of one company's process are not a conflict even if
    // the student typed overlapping windows.
    const a = makeDrive({
      id: "a",
      rounds: [makeRound("OA", t(10), t(12)), makeRound("Interview", t(11), t(13))],
    });
    expect(findClashes([a], [])).toHaveLength(0);
  });

  it("excludes drives the student has been rejected from", () => {
    const a = makeDrive({ id: "a", rounds: [makeRound("OA", t(10), t(12))] });
    const b = makeDrive({ id: "b", rounds: [makeRound("OA", t(11), t(13))] });
    const apps = [makeApplication("b", "rejected")];
    expect(findClashes([a, b], apps)).toHaveLength(0);
  });

  it("excludes drives the student has withdrawn from", () => {
    const a = makeDrive({ id: "a", rounds: [makeRound("OA", t(10), t(12))] });
    const b = makeDrive({ id: "b", rounds: [makeRound("OA", t(11), t(13))] });
    expect(findClashes([a, b], [makeApplication("b", "withdrawn")])).toHaveLength(0);
  });

  it("still flags a clash with a drive the student only has an offer from", () => {
    // An offer is not an abandonment: the round may still be in the calendar.
    const a = makeDrive({ id: "a", rounds: [makeRound("OA", t(10), t(12))] });
    const b = makeDrive({ id: "b", rounds: [makeRound("OA", t(11), t(13))] });
    expect(findClashes([a, b], [makeApplication("b", "offer")])).toHaveLength(1);
  });

  it("handles a drive with no rounds without error", () => {
    const a = makeDrive({ id: "a", rounds: [] });
    const b = makeDrive({ id: "b", rounds: [makeRound("OA", t(10), t(11))] });
    expect(findClashes([a, b], [])).toHaveLength(0);
  });

  it("returns nothing for an empty board", () => {
    expect(findClashes([], [])).toHaveLength(0);
  });

  it("scales to a full season without quadratic blowup on non-overlapping rounds", () => {
    // 200 rounds, one per hour, none overlapping. The sweep stops as soon as a
    // candidate starts at or after the current round's end.
    const drives = Array.from({ length: 200 }, (_, i) =>
      makeDrive({ id: `d${i}`, rounds: [makeRound("OA", istAt(i, 10), istAt(i, 11))] }),
    );
    expect(findClashes(drives, [])).toHaveLength(0);
  });
});
