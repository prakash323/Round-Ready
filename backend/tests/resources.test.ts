import { describe, expect, it } from "vitest";
import { OFFICIAL_HOSTS, SKILLS, allGuides, guideFor } from "@/lib/jd";
import { savedResourceSchema } from "@/lib/schemas";

/**
 * The curated learning resources.
 *
 * These tests exist to police two claims the module makes about itself,
 * because both are the kind of thing that decays quietly: that no link is
 * invented, and that "official" means official. A plausible-looking URL that
 * 404s is worse than no link, and calling a blog post the official
 * documentation makes every other label untrustworthy.
 */

const guides = allGuides();
const resources = guides.flatMap(([skillId, g]) => g.resources.map((r) => ({ skillId, ...r })));

describe("every resource", () => {
  it("has a parseable https URL", () => {
    for (const r of resources) {
      expect(() => new URL(r.url), `${r.skillId}: ${r.url}`).not.toThrow();
      expect(new URL(r.url).protocol, `${r.skillId}: ${r.url}`).toBe("https:");
    }
  });

  it("carries a title and a reason for being there", () => {
    for (const r of resources) {
      expect(r.title.trim().length, r.url).toBeGreaterThan(0);
      expect(r.note.trim().length, r.url).toBeGreaterThan(10);
    }
  });

  it("points at a documentation root rather than a deep versioned path", () => {
    // Deep paths rot first. Roots and /docs/ entry points survive rewrites,
    // which is the whole reason the curated set is shallow.
    for (const r of resources) {
      const segments = new URL(r.url).pathname.split("/").filter(Boolean);
      expect(segments.length, `${r.url} is ${segments.length} levels deep`).toBeLessThanOrEqual(5);
    }
  });

  it("is not duplicated across skills", () => {
    const seen = new Map<string, string>();
    for (const r of resources) {
      const existing = seen.get(r.url);
      // The same URL under two skills usually means one was pasted lazily.
      expect(existing, `${r.url} appears under both ${existing} and ${r.skillId}`).toBeUndefined();
      seen.set(r.url, r.skillId);
    }
  });
});

describe('"official" means official', () => {
  it("only labels a resource official when its host owns the technology", () => {
    for (const r of resources.filter((x) => x.kind === "official")) {
      const host = new URL(r.url).hostname;
      expect(
        (OFFICIAL_HOSTS as readonly string[]).includes(host),
        `${r.skillId}: ${host} is marked official but is not in OFFICIAL_HOSTS`,
      ).toBe(true);
    }
  });

  it("keeps the allowlist free of anything that is not a vendor or project domain", () => {
    for (const host of OFFICIAL_HOSTS) {
      expect(host, host).not.toMatch(
        /medium\.com|blogspot|wordpress|youtube|geeksforgeeks|w3schools|tutorialspoint/i,
      );
    }
  });

  it("does not claim a kind outside the three it defines", () => {
    for (const r of resources) {
      expect(["official", "reference", "practice"]).toContain(r.kind);
    }
  });
});

describe("the guidance", () => {
  it("is written for skills the taxonomy actually knows", () => {
    const known = new Set(SKILLS.map((s) => s.id));
    for (const [skillId] of guides) {
      expect(known.has(skillId), `${skillId} has a guide but is not in the taxonomy`).toBe(true);
    }
  });

  it("says something specific rather than filler", () => {
    for (const [skillId, g] of guides) {
      for (const line of g.focus) {
        expect(line.length, `${skillId}: "${line}"`).toBeGreaterThan(25);
        expect(line.toLowerCase(), skillId).not.toMatch(
          /^(read the docs|practise|practice|study hard|learn the basics)\.?$/,
        );
      }
    }
  });

  it("covers the fundamentals a placement season actually tests", () => {
    for (const id of ["dsa", "oops", "os", "dbms", "networks", "sql", "system_design"]) {
      expect(guideFor(id), id).not.toBeNull();
    }
  });
});

describe("a skill with nothing curated", () => {
  it("returns null rather than generic filler", () => {
    // "Read the documentation and practise" dressed up as advice wastes the
    // student's attention and teaches them to skim the section.
    expect(guideFor("flutter")).toBeNull();
    expect(guideFor("not-a-real-skill")).toBeNull();
  });

  it("has no curated entry that is empty in the first place", () => {
    // `guideFor` also returns null for an entry with neither focus nor
    // resources. That guard is unreachable today and should stay that way:
    // an empty entry is a half-finished edit, not a deliberate state. This
    // asserts the invariant rather than conditionally asserting nothing.
    for (const [skillId, g] of guides) {
      expect(
        g.focus.length + g.resources.length,
        `${skillId} has an entry but says nothing`,
      ).toBeGreaterThan(0);
    }
  });
});

describe("skills with no resource links still help", () => {
  it("gives focus notes where no stable official source exists", () => {
    // DSA, OS and system design have no single canonical vendor site, so they
    // get original guidance rather than a link to somebody's blog.
    for (const id of ["dsa", "os", "system_design", "problem_solving"]) {
      const guide = guideFor(id)!;
      expect(guide.resources, id).toHaveLength(0);
      expect(guide.focus.length, id).toBeGreaterThan(2);
    }
  });
});

describe("saving a link", () => {
  const base = { title: "Pro Git", skillId: "git", note: "" };
  const parse = (url: string) => savedResourceSchema.safeParse({ ...base, url });

  it("accepts an ordinary web address", () => {
    expect(parse("https://git-scm.com/book/en/v2").success).toBe(true);
    expect(parse("http://example.com/notes").success).toBe(true);
  });

  it("rejects a javascript: URL", () => {
    // This is rendered as a link the student clicks, so accepting one would
    // turn a note-taking feature into an attack on its own author.
    expect(parse("javascript:alert(document.cookie)").success).toBe(false);
  });

  it("rejects data: and file: URLs", () => {
    expect(parse("data:text/html,<script>alert(1)</script>").success).toBe(false);
    expect(parse("file:///etc/passwd").success).toBe(false);
  });

  it("rejects something that is not a URL at all", () => {
    expect(parse("just some text").success).toBe(false);
    expect(parse("").success).toBe(false);
  });

  it("requires a title", () => {
    expect(savedResourceSchema.safeParse({ title: "", url: "https://example.com" }).success).toBe(
      false,
    );
  });

  it("keeps the skill optional, for a link that belongs to no one topic", () => {
    const parsed = savedResourceSchema.safeParse({
      title: "Notes",
      url: "https://example.com",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.skillId).toBeNull();
  });
});
