import { describe, expect, it } from "vitest";
import { emptyPortfolio } from "@/models/Portfolio";
import {
  certificateEntrySchema,
  codingProfileEntrySchema,
  educationEntrySchema,
  experienceEntrySchema,
  fieldErrors,
  portfolioSchema,
  projectEntrySchema,
} from "@/lib/schemas";

/**
 * The student portfolio.
 *
 * The rules worth testing here are the ones where being helpful would be
 * wrong: converting between grading scales, treating an uploaded file as
 * proof, or accepting a link that is not a link.
 */

function errors(result: { success: boolean; error?: unknown }): Record<string, string> {
  if (result.success) throw new Error("expected validation to fail");
  return fieldErrors(result.error as Parameters<typeof fieldErrors>[0]);
}

describe("an empty portfolio", () => {
  it("is a shape, not a null", () => {
    // So no caller branches on "missing", and nothing needs migrating for a
    // student who existed before this document did.
    const empty = emptyPortfolio();
    expect(empty.education).toEqual([]);
    expect(empty.codingProfiles).toEqual([]);
    expect(empty.summary).toBe("");
    expect(empty.phone).toBeNull();
  });

  it("parses with nothing supplied at all", () => {
    const parsed = portfolioSchema.parse({});
    expect(parsed.education).toEqual([]);
    expect(parsed.linkedinUrl).toBeNull();
  });
});

describe("education records", () => {
  const base = { institution: "VIT-AP", qualification: "B.Tech CSE" };

  it("keeps a percentage and a CGPA on their own scales", () => {
    // 9.1 CGPA is not 91%, and the conversion differs by university — so
    // neither is ever turned into the other.
    expect(
      educationEntrySchema.parse({ ...base, scoreType: "cgpa", scoreValue: 9.1 }).scoreValue,
    ).toBe(9.1);
    expect(
      educationEntrySchema.parse({ ...base, scoreType: "percentage", scoreValue: 91 }).scoreValue,
    ).toBe(91);
  });

  it("refuses a CGPA above the ten-point scale", () => {
    const result = educationEntrySchema.safeParse({ ...base, scoreType: "cgpa", scoreValue: 91 });
    expect(result.success).toBe(false);
    expect(errors(result)).toHaveProperty("scoreValue");
  });

  it("refuses a percentage above 100", () => {
    expect(
      educationEntrySchema.safeParse({ ...base, scoreType: "percentage", scoreValue: 101 }).success,
    ).toBe(false);
  });

  it("requires the grade text when the score is a letter grade", () => {
    expect(
      educationEntrySchema.safeParse({ ...base, scoreType: "grade", scoreText: "" }).success,
    ).toBe(false);
    expect(
      educationEntrySchema.safeParse({ ...base, scoreType: "grade", scoreText: "A+" }).success,
    ).toBe(true);
  });

  it("allows a record with no score at all", () => {
    // Not every qualification has a number attached yet.
    const parsed = educationEntrySchema.parse(base);
    expect(parsed.scoreType).toBeNull();
    expect(parsed.scoreValue).toBeNull();
  });

  it("requires an institution and a qualification", () => {
    expect(errors(educationEntrySchema.safeParse({ ...base, institution: " " }))).toHaveProperty(
      "institution",
    );
  });
});

describe("experience", () => {
  const base = { organisation: "Zoho", role: "SDE Intern" };

  it("treats an ongoing role as having no end date", () => {
    expect(experienceEntrySchema.parse({ ...base, current: true }).endDate).toBeNull();
  });

  it("refuses an ongoing role that also claims to have ended", () => {
    const result = experienceEntrySchema.safeParse({
      ...base,
      current: true,
      endDate: "2026-05",
    });
    expect(result.success).toBe(false);
  });

  it("refuses an end before the start", () => {
    const result = experienceEntrySchema.safeParse({
      ...base,
      startDate: "2026-06",
      endDate: "2026-01",
    });
    expect(errors(result)).toHaveProperty("endDate");
  });

  it("accepts a role still running with only a start", () => {
    expect(
      experienceEntrySchema.safeParse({ ...base, startDate: "2026-06", current: true }).success,
    ).toBe(true);
  });

  it("de-duplicates technologies case-insensitively", () => {
    const parsed = experienceEntrySchema.parse({
      ...base,
      technologies: ["Java", "java", "Spring"],
    });
    expect(parsed.technologies).toEqual(["Java", "Spring"]);
  });

  it("refuses a malformed month", () => {
    expect(experienceEntrySchema.safeParse({ ...base, startDate: "June 2026" }).success).toBe(
      false,
    );
  });
});

describe("projects", () => {
  const base = { name: "Placement tracker" };

  it("accepts http and https repository links", () => {
    expect(projectEntrySchema.parse({ ...base, repoUrl: "https://github.com/x/y" }).repoUrl).toBe(
      "https://github.com/x/y",
    );
  });

  it("refuses a javascript: link", () => {
    // Rendered as a link the student clicks in their own record.
    expect(
      errors(projectEntrySchema.safeParse({ ...base, repoUrl: "javascript:alert(1)" })),
    ).toHaveProperty("repoUrl");
  });

  it("refuses something that is not a URL", () => {
    expect(projectEntrySchema.safeParse({ ...base, liveUrl: "my site" }).success).toBe(false);
  });

  it("treats a blank link as no link rather than a bad one", () => {
    expect(projectEntrySchema.parse({ ...base, repoUrl: "" }).repoUrl).toBeNull();
  });
});

describe("certificates", () => {
  const base = { title: "AWS Cloud Practitioner" };

  it("refuses an expiry before the issue date", () => {
    const result = certificateEntrySchema.safeParse({
      ...base,
      issuedOn: "2026-06",
      expiresOn: "2025-06",
    });
    expect(errors(result)).toHaveProperty("expiresOn");
  });

  it("has no way to claim a certificate is verified", () => {
    // A document being present proves a document is present. If uploading one
    // could set this, the word would be worthless on every certificate that
    // genuinely was checked.
    const parsed = certificateEntrySchema.parse({ ...base, verified: true } as never) as Record<
      string,
      unknown
    >;
    expect(parsed.verified).toBeUndefined();
  });

  it("accepts one with no dates at all", () => {
    expect(certificateEntrySchema.safeParse(base).success).toBe(true);
  });
});

describe("coding profiles", () => {
  const base = { platform: "github" as const, profileUrl: "https://github.com/someone" };

  it("accepts a known platform with a link", () => {
    expect(codingProfileEntrySchema.parse(base).profileUrl).toBe("https://github.com/someone");
  });

  it("requires a link", () => {
    expect(errors(codingProfileEntrySchema.safeParse({ ...base, profileUrl: "" }))).toHaveProperty(
      "profileUrl",
    );
  });

  it("refuses a link that is not http(s)", () => {
    expect(
      codingProfileEntrySchema.safeParse({ ...base, profileUrl: "javascript:alert(1)" }).success,
    ).toBe(false);
  });

  it("requires a name when the platform is not a known one", () => {
    expect(
      codingProfileEntrySchema.safeParse({ ...base, platform: "other", platformName: "" }).success,
    ).toBe(false);
    expect(
      codingProfileEntrySchema.safeParse({ ...base, platform: "other", platformName: "AtCoder" })
        .success,
    ).toBe(true);
  });

  it("stores no metrics, because none are fetched", () => {
    // RoundReady has no integration with any of these platforms. A repository
    // count here would be a number nobody retrieved, and a linked account is
    // a link rather than evidence of proficiency.
    const parsed = codingProfileEntrySchema.parse({
      ...base,
      repositories: 42,
      rating: 1800,
    } as never) as Record<string, unknown>;
    expect(parsed.repositories).toBeUndefined();
    expect(parsed.rating).toBeUndefined();
  });
});

describe("the whole portfolio", () => {
  it("caps each section rather than accepting unbounded input", () => {
    const tooMany = Array.from({ length: 11 }, () => ({
      institution: "X",
      qualification: "Y",
    }));
    expect(portfolioSchema.safeParse({ education: tooMany }).success).toBe(false);
  });

  it("rejects the whole write when one nested entry is invalid", () => {
    // Partial acceptance would leave the student's page showing nine of ten
    // records with no indication the tenth was dropped.
    const result = portfolioSchema.safeParse({
      education: [
        { institution: "VIT-AP", qualification: "B.Tech", scoreType: "cgpa", scoreValue: 50 },
      ],
    });
    expect(result.success).toBe(false);
  });
});
