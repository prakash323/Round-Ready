import { describe, expect, it } from "vitest";
import { analyseJobDescription, splitSections } from "@/lib/jd";

/**
 * The job-description analyser.
 *
 * The cases that matter are the ones where being wrong costs a student an
 * evening: a skill invented from a city name, a "nice to have" promoted to
 * required, an interview round the notice never mentioned.
 */

const FULL = `
Company: Acme Systems
Role: Software Engineer I

About the company
Acme Systems builds payments infrastructure for the Bengaluru market.

Responsibilities
- Design and build REST APIs used by millions of customers
- Work with the Payments team to ship features end to end
- Participate in code reviews and improve test coverage

Requirements
- Strong command of Data Structures and Algorithms
- Proficiency in Java or Python
- Solid understanding of DBMS and Operating Systems
- Experience with SQL databases

Good to have
- Exposure to React and Node.js
- Familiarity with Docker and Kubernetes
- Awareness of AWS

Selection process
- Online assessment
- Two rounds of technical interview
- HR interview
`;

describe("sections", () => {
  const sections = splitSections(FULL);
  const kinds = sections.map((s) => s.kind);

  it("recognises the headings a job post actually uses", () => {
    expect(kinds).toContain("about");
    expect(kinds).toContain("responsibilities");
    expect(kinds).toContain("requirements");
    expect(kinds).toContain("preferred");
    expect(kinds).toContain("assessment");
  });

  it("reads 'Good to have' as preferred, not as another requirements block", () => {
    const preferred = sections.find((s) => s.kind === "preferred");
    expect(preferred?.heading).toBe("Good to have");
  });
});

describe("skills", () => {
  const result = analyseJobDescription(FULL);
  const byId = (id: string) => result.skills.find((s) => s.id === id);

  it("finds what the description names", () => {
    for (const id of ["dsa", "java", "python", "dbms", "os", "sql", "rest"]) {
      expect(byId(id), id).toBeDefined();
    }
  });

  it("marks everything under Requirements as required", () => {
    expect(byId("dsa")?.importance).toBe("required");
    expect(byId("java")?.importance).toBe("required");
    expect(byId("sql")?.importance).toBe("required");
  });

  it("marks everything under Good to have as preferred", () => {
    expect(byId("react")?.importance).toBe("preferred");
    expect(byId("docker")?.importance).toBe("preferred");
    expect(byId("aws")?.importance).toBe("preferred");
  });

  it("carries the exact line each skill came from", () => {
    expect(byId("dsa")?.evidence).toBe("Strong command of Data Structures and Algorithms");
    expect(byId("docker")?.evidence).toBe("Familiarity with Docker and Kubernetes");
  });

  it("does not invent skills from company or place names", () => {
    // "Payments" and "Bengaluru" appear in the prose. Neither is a skill, and
    // an analyser that treats any capitalised word as one would produce both.
    const labels = result.skills.map((s) => s.label.toLowerCase());
    expect(labels).not.toContain("payments");
    expect(labels).not.toContain("bengaluru");
    expect(labels).not.toContain("acme systems");
  });
});

describe("explicit versus inferred", () => {
  const result = analyseJobDescription(FULL);

  it("reports an implied skill separately, with its reasoning", () => {
    const js = result.skills.find((s) => s.id === "javascript");
    expect(js?.source).toBe("inferred");
    expect(js?.reason).toMatch(/implied by (React|Node\.js)/);
  });

  it("never marks something the text named as inferred", () => {
    for (const id of ["java", "python", "react", "docker"]) {
      expect(result.skills.find((s) => s.id === id)?.source, id).toBe("explicit");
    }
  });

  it("lists explicit skills before inferred ones", () => {
    const firstInferred = result.skills.findIndex((s) => s.source === "inferred");
    const lastExplicit = result.skills.map((s) => s.source).lastIndexOf("explicit");
    expect(lastExplicit).toBeLessThan(firstInferred);
  });

  it("does not infer when the skill was already named", () => {
    const named = analyseJobDescription("Requirements\n- React and JavaScript");
    expect(named.skills.find((s) => s.id === "javascript")?.source).toBe("explicit");
  });
});

describe("cue words beat the section they sit in", () => {
  it("keeps a required skill required under a nice-to-have heading", () => {
    const text = "Nice to have\n- Java (must have, strong proficiency required)";
    const result = analyseJobDescription(text);
    expect(result.skills.find((s) => s.id === "java")?.importance).toBe("required");
  });

  it("demotes a preferred skill under a requirements heading", () => {
    const text = "Requirements\n- Familiarity with Kubernetes is a plus";
    const result = analyseJobDescription(text);
    expect(result.skills.find((s) => s.id === "kubernetes")?.importance).toBe("preferred");
  });

  it("keeps the stronger reading when a skill appears twice", () => {
    const text = "Requirements\n- Strong Python\n\nGood to have\n- Python scripting";
    expect(analyseJobDescription(text).skills.find((s) => s.id === "python")?.importance).toBe(
      "required",
    );
  });
});

describe("punctuation-heavy skill names", () => {
  const match = (text: string) =>
    analyseJobDescription(`Requirements\n- ${text}`).skills.map((s) => s.id);

  it("matches C++ without matching C", () => {
    const ids = match("Strong C++ and systems programming");
    expect(ids).toContain("cpp");
    expect(ids).not.toContain("c");
  });

  it("matches C# and .NET", () => {
    expect(match("C# and .NET experience")).toEqual(expect.arrayContaining(["csharp", "dotnet"]));
  });

  it("matches Node.js", () => {
    expect(match("Node.js backend development")).toContain("node");
  });

  it("prefers the longer alias", () => {
    // "spring boot" must not be swallowed by "spring", nor "react native" by
    // "react".
    expect(match("Spring Boot microservices")).toContain("spring");
    expect(match("React Native apps")).toContain("react_native");
  });

  it("does not match a skill inside an unrelated word", () => {
    // "Rust" is not in the taxonomy; "go" must not fire on "going".
    expect(match("Going above and beyond for customers")).not.toContain("go");
    expect(match("Scalable services")).not.toContain("scala");
  });
});

describe("experience", () => {
  it("reads a stated minimum", () => {
    const r = analyseJobDescription("Requirements\n- 3+ years of experience in backend systems");
    expect(r.experience?.minYears).toBe(3);
    expect(r.experience?.evidence).toContain("3+ years");
  });

  it("reads a range as its lower bound", () => {
    const r = analyseJobDescription("Requirements\n- 2 - 4 years experience required");
    expect(r.experience?.minYears).toBe(2);
  });

  it("is null when the description does not say, rather than zero", () => {
    const r = analyseJobDescription("Requirements\n- Strong Java");
    expect(r.experience).toBeNull();
    expect(r.gaps.join(" ")).toContain("does not state an experience requirement");
  });
});

describe("assessments", () => {
  it("reports only the rounds the description names", () => {
    const r = analyseJobDescription(FULL);
    expect(r.assessments).toEqual(
      expect.arrayContaining(["online assessment", "technical interview", "hr interview"]),
    );
  });

  it("invents nothing when the description is silent", () => {
    // The commonest way a tool like this misleads: filling in "probably an
    // online test, then two interviews" because that is usually true.
    const r = analyseJobDescription("Requirements\n- Strong Java and DSA");
    expect(r.assessments).toEqual([]);
    expect(r.gaps.join(" ")).toContain("does not name its assessment rounds");
  });
});

describe("role and company", () => {
  it("reads labelled lines", () => {
    const r = analyseJobDescription(FULL);
    expect(r.roleTitle).toBe("Software Engineer I");
    expect(r.company).toBe("Acme Systems");
  });

  it("falls back to what the drive already knows", () => {
    const r = analyseJobDescription("Requirements\n- Java", {
      fallbackRole: "SDE-1",
      fallbackCompany: "Zoho",
    });
    expect(r.roleTitle).toBe("SDE-1");
    expect(r.company).toBe("Zoho");
  });

  it("prefers the description over the fallback", () => {
    const r = analyseJobDescription("Role: Backend Engineer\nRequirements\n- Java", {
      fallbackRole: "SDE-1",
    });
    expect(r.roleTitle).toBe("Backend Engineer");
  });

  it("is null when neither is available", () => {
    expect(analyseJobDescription("Requirements\n- Java").roleTitle).toBeNull();
  });
});

describe("a description the analyser cannot do much with", () => {
  const r = analyseJobDescription("We are hiring great people to join our growing team!");

  it("returns an empty analysis rather than guessing", () => {
    expect(r.skills).toEqual([]);
    expect(r.responsibilities).toEqual([]);
    expect(r.assessments).toEqual([]);
  });

  it("says so, in terms the student can act on", () => {
    expect(r.gaps.join(" ")).toContain("No recognised skills were found");
    expect(r.gaps.join(" ")).toContain("No headings were recognised");
  });

  it("does not throw on empty input", () => {
    expect(() => analyseJobDescription("")).not.toThrow();
    expect(analyseJobDescription("").stats.words).toBe(0);
  });
});

describe("an unstructured description", () => {
  it("reads everything as required and warns that it did", () => {
    const text = "Looking for someone with strong Java, SQL and problem solving skills.";
    const r = analyseJobDescription(text);
    expect(r.skills.every((s) => s.importance === "required")).toBe(true);
    expect(r.gaps.join(" ")).toContain("could not be told apart");
  });
});

describe("the original text is never lost", () => {
  it("keeps every non-empty line inside a section", () => {
    const r = analyseJobDescription(FULL);
    const kept = r.sections.flatMap((s) => s.lines).length;
    const headings = r.sections.filter((s) => s.heading !== "").length;
    const original = FULL.split(/\r?\n/).filter((l) => l.trim() !== "").length;
    expect(kept + headings).toBe(original);
  });
});
