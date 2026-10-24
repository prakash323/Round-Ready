import { describe, expect, it } from "vitest";
import { parseBranches, parseCategory, parseCtcLpa, parseDate, parseNumber } from "@/lib/cdc";

/**
 * Reading the portal's values.
 *
 * Every case here is a way a campus notice actually writes something. The
 * through-line is what the parsers REFUSE: a figure that cannot be read
 * becomes null and says why, because a wrong CTC moves a placed student's
 * eligibility bar and a wrong deadline makes a live drive look expired. An
 * empty field the student is asked about is the better failure.
 */

describe("compensation", () => {
  it("reads the explicit LPA forms", () => {
    expect(parseCtcLpa("12 LPA").value).toBe(12);
    expect(parseCtcLpa("12.5 lpa").value).toBe(12.5);
    expect(parseCtcLpa("8.5 Lakhs").value).toBe(8.5);
    expect(parseCtcLpa("8.5 Lacs").value).toBe(8.5);
    expect(parseCtcLpa("1.2 Crore").value).toBe(120);
    expect(parseCtcLpa("1.2 Cr").value).toBe(120);
  });

  it("reads absolute rupee amounts, including Indian digit grouping", () => {
    expect(parseCtcLpa("850000").value).toBe(8.5);
    expect(parseCtcLpa("8,50,000").value).toBe(8.5);
    expect(parseCtcLpa("₹8,50,000").value).toBe(8.5);
    expect(parseCtcLpa(1200000).value).toBe(12);
  });

  it("takes the lower figure of a range, and says so", () => {
    // A range commits the employer only to its lower bound. The student is
    // told, and the original text is kept beside it.
    const parsed = parseCtcLpa("6-8 LPA");
    expect(parsed.value).toBe(6);
    expect(parsed.note).toMatch(/range/i);
    expect(parsed.raw).toBe("6-8 LPA");
  });

  it("refuses a monthly stipend rather than annualising it", () => {
    // Annualising would put a 45k/month internship on the same scale as a job
    // offer, where it could gate a placed student's whole board.
    for (const input of ["45000 per month", "45k/month", "₹45,000 p.m."]) {
      const parsed = parseCtcLpa(input);
      expect(parsed.value, input).toBeNull();
      expect(parsed.note, input).toMatch(/monthly/i);
      expect(parsed.raw, input).toBe(input);
    }
  });

  it("treats 'not disclosed' as absent, not as zero", () => {
    for (const input of ["Not Disclosed", "As per company norms", "TBA", "N/A"]) {
      const parsed = parseCtcLpa(input);
      expect(parsed.value, input).toBeNull();
      expect(parsed.note, input).not.toBeNull();
    }
  });

  it("refuses a bare number it cannot place", () => {
    // 5000 is neither a plausible LPA figure nor a plausible annual salary.
    const parsed = parseCtcLpa("5000");
    expect(parsed.value).toBeNull();
    expect(parsed.note).toMatch(/rupees or lakhs/i);
  });

  it("keeps the original text whatever happens", () => {
    expect(parseCtcLpa("12 LPA").raw).toBe("12 LPA");
    expect(parseCtcLpa("gibberish").raw).toBe("gibberish");
  });

  it("reports nothing at all for an absent value", () => {
    for (const input of [null, undefined, "", "   "]) {
      expect(parseCtcLpa(input).value).toBeNull();
      expect(parseCtcLpa(input).raw).toBeNull();
      expect(parseCtcLpa(input).note).toBeNull();
    }
  });
});

describe("dates", () => {
  it("takes ISO strings and Date objects at face value", () => {
    expect(parseDate("2026-11-02T04:00:00.000Z").value).toBe("2026-11-02T04:00:00.000Z");
    expect(parseDate("2026-11-02").value).toBe("2026-11-02T00:00:00.000Z");
    expect(parseDate(new Date("2026-11-02T04:00:00.000Z")).value).toBe("2026-11-02T04:00:00.000Z");
  });

  it("tells epoch seconds from epoch milliseconds", () => {
    expect(parseDate(1793577600000).value).toBe(new Date(1793577600000).toISOString());
    expect(parseDate(1793577600).value).toBe(new Date(1793577600000).toISOString());
  });

  it("reads a named month without ambiguity", () => {
    const parsed = parseDate("25 Oct 2026");
    expect(parsed.value?.slice(0, 10)).toBe("2026-10-25");
    expect(parsed.note).toBeNull();
  });

  it("reads a numeric slash date as DD/MM, and flags it when it could be either", () => {
    // 05/06/2026 is 5 June under the Indian convention this portal serves and
    // 6 May under the American one — a month apart on a deadline.
    const ambiguous = parseDate("05/06/2026");
    expect(ambiguous.value?.slice(0, 10)).toBe("2026-06-05");
    expect(ambiguous.note).toMatch(/DD\/MM/);

    const unambiguous = parseDate("25/10/2026");
    expect(unambiguous.value?.slice(0, 10)).toBe("2026-10-25");
    expect(unambiguous.note).toBeNull();
  });

  it("refuses a format it does not recognise", () => {
    const parsed = parseDate("sometime next week");
    expect(parsed.value).toBeNull();
    expect(parsed.note).toMatch(/not recognised/i);
  });

  it("does not turn an absent date into the epoch", () => {
    // The same trap as the drive schema: `new Date(0)` is a valid Date that
    // renders as permanently expired, and no error is ever shown.
    for (const input of [null, undefined, ""]) {
      expect(parseDate(input).value).toBeNull();
    }
  });
});

describe("stated cutoffs", () => {
  it("keeps a stated zero, which is a real cutoff everyone clears", () => {
    const parsed = parseNumber("0", 0, 50);
    expect(parsed.value).toBe(0);
  });

  it("keeps an absent cutoff null, which is not evaluated at all", () => {
    expect(parseNumber(null, 0, 50).value).toBeNull();
    expect(parseNumber("", 0, 50).value).toBeNull();
  });

  it("pulls the number out of a sentence", () => {
    expect(parseNumber("Minimum 7.5 CGPA", 0, 10).value).toBe(7.5);
    expect(parseNumber("No active backlogs", 0, 50).value).toBeNull();
  });

  it("refuses a value outside the plausible range", () => {
    const parsed = parseNumber("75", 0, 10);
    expect(parsed.value).toBeNull();
    expect(parsed.note).toMatch(/range/i);
  });
});

describe("branches", () => {
  it("reads a list or a delimited string", () => {
    expect(parseBranches(["CSE", "IT"])).toEqual(["CSE", "IT"]);
    expect(parseBranches("CSE, IT; ECE")).toEqual(["CSE", "IT", "ECE"]);
  });

  it("does not expand an abbreviation into something it did not say", () => {
    expect(parseBranches("CSE")).toEqual(["CSE"]);
  });

  it("treats an empty list as 'no restriction stated', not as unknown", () => {
    expect(parseBranches(null)).toEqual([]);
    expect(parseBranches([])).toEqual([]);
  });

  it("drops duplicates", () => {
    expect(parseBranches("CSE, CSE, IT")).toEqual(["CSE", "IT"]);
  });
});

describe("employer category", () => {
  it("reads only what the portal states", () => {
    expect(parseCategory("Service Based")).toBe("service_based");
    expect(parseCategory("product_based")).toBe("product_based");
    expect(parseCategory("PRODUCT")).toBe("product_based");
  });

  it("returns null for anything else rather than guessing", () => {
    // This value decides whether a placed student's bar is 1.5x or 2x their
    // package — whether they may sit for a drive at all. A guess from the
    // company's name is not a cosmetic error.
    for (const input of ["Infosys", "Consulting", "", null, "startup", undefined]) {
      expect(parseCategory(input), String(input)).toBeNull();
    }
  });
});
