import { describe, expect, it } from "vitest";
import { fieldErrors, noteSchema } from "@/lib/schemas";

/**
 * Notes.
 *
 * A note is primary data: it cannot be recomputed, and losing one loses
 * something nobody can give back. So the validation is deliberately
 * permissive about content and strict about the things that would lose or
 * corrupt it.
 */

function errors(result: { success: boolean; error?: unknown }): Record<string, string> {
  if (result.success) throw new Error("expected validation to fail");
  return fieldErrors(result.error as Parameters<typeof fieldErrors>[0]);
}

const base = { title: "Hashing", body: "## Load factor\n\nKeep it under 0.75." };

describe("a note's content", () => {
  it("keeps the body exactly as written", () => {
    const parsed = noteSchema.parse(base);
    expect(parsed.body).toBe("## Load factor\n\nKeep it under 0.75.");
  });

  it("does not strip or escape markup in the body", () => {
    // The body is never rendered as HTML — the client parses it into React
    // elements — so a note about script tags stays a note about script tags.
    // Mangling it here would corrupt a student's own writing to defend
    // against an injection that cannot happen.
    const body = "Watch for <script>alert(1)</script> in user input.";
    expect(noteSchema.parse({ ...base, body }).body).toBe(body);
  });

  it("allows an empty body, because a title is enough to start", () => {
    expect(noteSchema.parse({ title: "Ideas" }).body).toBe("");
  });

  it("requires a title", () => {
    expect(errors(noteSchema.safeParse({ ...base, title: "   " }))).toHaveProperty("title");
  });

  it("refuses a body beyond what the editor can hold", () => {
    const result = noteSchema.safeParse({ ...base, body: "x".repeat(50_001) });
    expect(result.success).toBe(false);
  });

  it("accepts a body right at the limit", () => {
    expect(noteSchema.safeParse({ ...base, body: "x".repeat(50_000) }).success).toBe(true);
  });
});

describe("tags", () => {
  it("drops duplicates that differ only in case", () => {
    // "DSA" and "dsa" as separate tags would split a student's own notes
    // across two filters, and they would never find the other half.
    const parsed = noteSchema.parse({ ...base, tags: ["DSA", "dsa", "arrays", "DSA"] });
    expect(parsed.tags).toEqual(["DSA", "arrays"]);
  });

  it("keeps the first spelling the student used", () => {
    expect(noteSchema.parse({ ...base, tags: ["Arrays", "arrays"] }).tags).toEqual(["Arrays"]);
  });

  it("trims whitespace", () => {
    expect(noteSchema.parse({ ...base, tags: ["  dsa  "] }).tags).toEqual(["dsa"]);
  });

  it("defaults to none", () => {
    expect(noteSchema.parse(base).tags).toEqual([]);
  });

  it("refuses an unreasonable number of them", () => {
    const result = noteSchema.safeParse({
      ...base,
      tags: Array.from({ length: 21 }, (_, i) => `tag${i}`),
    });
    expect(result.success).toBe(false);
  });
});

describe("what a note points at", () => {
  it("treats every link as optional", () => {
    const parsed = noteSchema.parse(base);
    expect(parsed.driveId).toBeNull();
    expect(parsed.jobDescriptionId).toBeNull();
    expect(parsed.studyTaskId).toBeNull();
    expect(parsed.skillId).toBeNull();
  });

  it("accepts a real id", () => {
    const parsed = noteSchema.parse({ ...base, driveId: "6adca93997238f52b6a4ffb2" });
    expect(parsed.driveId).toBe("6adca93997238f52b6a4ffb2");
  });

  it("rejects an id that would throw when cast", () => {
    expect(errors(noteSchema.safeParse({ ...base, driveId: "nope" }))).toHaveProperty("driveId");
  });

  it("reads an empty string as no link rather than as a bad one", () => {
    expect(noteSchema.parse({ ...base, skillId: "" }).skillId).toBeNull();
  });
});

describe("pinning and folders", () => {
  it("defaults to unpinned", () => {
    expect(noteSchema.parse(base).pinned).toBe(false);
  });

  it("keeps a folder when one is given, and null when it is blank", () => {
    expect(noteSchema.parse({ ...base, folder: "Interviews" }).folder).toBe("Interviews");
    expect(noteSchema.parse({ ...base, folder: "   " }).folder).toBeNull();
  });
});
