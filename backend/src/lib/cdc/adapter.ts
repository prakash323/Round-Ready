import { parseBranches, parseCtcLpa, parseDate, parseNumber } from "./parse";
import type { NormalisedDrive } from "./types";

/**
 * Mapping one NeoPAT drive record onto RoundReady's vocabulary.
 *
 * Every key below was read off a real authenticated response, captured in the
 * student's own browser — not guessed, and not carried over from another
 * portal. Three things about that payload shaped this file:
 *
 *  - Several scalar-looking fields are ARRAYS of one: `profile_designation`,
 *    `company_location`, `drive_type`, `salary_information`.
 *  - Compensation is STRUCTURED, not text. `salary_information[0].fixedSalary`
 *    is rupees per annum (2600000 renders as "₹26L PA" on the portal), with
 *    ranges in `fromRange`/`toRange` and a separate monthly `fixedStipend`.
 *  - `company_category` is an INDUSTRY ("IT"), not a placement classification.
 *    It is deliberately not mapped onto RoundReady's service/product category:
 *    that value moves a placed student's bar between 1.5x and 2x of their
 *    package, and "IT" says nothing about which side of that line an employer
 *    falls on.
 *
 * The response carries no CGPA, backlog or branch cutoffs at all, so imported
 * drives arrive with those unstated. That is the honest result: RoundReady
 * then returns "cannot determine" rather than inventing a cutoff, which is
 * exactly what an unstated criterion is supposed to produce.
 */

type Rec = Record<string, unknown>;

function isRec(v: unknown): v is Rec {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** First meaningful entry of a one-element array, or the scalar itself. */
function firstOf(value: unknown): unknown {
  if (Array.isArray(value)) return value.find((v) => v !== null && v !== undefined && v !== "");
  return value;
}

function textOf(value: unknown): string | null {
  const v = firstOf(value);
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function lpaFromRupees(rupees: number): number {
  return Math.round((rupees / 100000) * 100) / 100;
}

export interface SalaryReading {
  ctcLpa: number | null;
  ctcRaw: string | null;
  notes: string[];
}

/**
 * Compensation out of `salary_information`.
 *
 * Only the annual salary becomes a CTC. `fixedStipend` is monthly and belongs
 * to an internship — annualising it would put a ₹1L/month internship on the
 * same scale as a job offer, where it could gate a placed student's whole
 * board. It is reported in the raw text instead, so nothing is lost.
 *
 * A range is read at its lower bound, which is the only figure the employer
 * has committed to, and the student is told.
 */
export function readSalary(input: unknown): SalaryReading {
  const notes: string[] = [];
  const entry = firstOf(input);

  if (!isRec(entry)) {
    // Some records may carry a plain string instead; fall back to the text
    // parser rather than dropping the figure.
    const parsed = parseCtcLpa(entry);
    if (parsed.note) notes.push(`Compensation: ${parsed.note}`);
    return { ctcLpa: parsed.value, ctcRaw: parsed.raw, notes };
  }

  const basis = typeof entry.salaryBasis === "string" ? entry.salaryBasis.toLowerCase() : null;
  const fixed = num(entry.fixedSalary);
  const from = num(entry.fromRange);
  const to = num(entry.toRange);
  const stipend = num(entry.fixedStipend);
  const stipendBasis =
    typeof entry.stipendBasis === "string" ? entry.stipendBasis.toLowerCase() : null;

  const describeStipend = (): string | null =>
    stipend === null
      ? null
      : `stipend ${lpaFromRupees(stipend)}L ${stipendBasis === "monthly" ? "per month" : (stipendBasis ?? "")}`.trim();

  if (fixed !== null) {
    if (basis !== null && basis !== "annually" && basis !== "annual" && basis !== "yearly") {
      // An unexpected basis is refused rather than assumed annual.
      notes.push(
        `Compensation: the portal gave a salary on a "${basis}" basis, which was not read as an annual CTC.`,
      );
      return { ctcLpa: null, ctcRaw: `${fixed} (${basis})`, notes };
    }
    const raw = [`${fixed} per annum`, describeStipend()].filter(Boolean).join(", ");
    return { ctcLpa: lpaFromRupees(fixed), ctcRaw: raw, notes };
  }

  if (from !== null) {
    notes.push(
      "Compensation: the portal stated a range; the lower figure was used. Check the drive.",
    );
    const raw = [`${from}–${to ?? "?"} per annum`, describeStipend()].filter(Boolean).join(", ");
    return { ctcLpa: lpaFromRupees(from), ctcRaw: raw, notes };
  }

  if (stipend !== null) {
    notes.push(
      `Compensation: only a ${stipendBasis ?? ""} stipend was stated, which is not an annual CTC. `.trim() +
        "Enter the package yourself if this drive converts to a full-time offer.",
    );
    return { ctcLpa: null, ctcRaw: describeStipend(), notes };
  }

  notes.push("Compensation: the portal stated no figure.");
  return { ctcLpa: null, ctcRaw: null, notes };
}

/**
 * The official URL for a drive.
 *
 * Confirmed by navigation: opening a drive puts the browser on
 * `/placements/drives/{drive_id}`.
 */
export function driveUrl(externalId: string | null, baseUrl: string | null): string | null {
  if (externalId === null || baseUrl === null) return null;
  return `${baseUrl.replace(/\/+$/, "")}/${externalId}`;
}

export function normaliseDrive(input: unknown, baseUrl: string | null): NormalisedDrive {
  const unreadable: string[] = [];
  const rec: Rec = isRec(input) ? input : {};
  if (!isRec(input)) unreadable.push("This row was not a drive record and could not be read.");

  const externalId = textOf(rec.drive_id) ?? textOf(rec._id);
  const company = textOf(rec.company_name) ?? textOf(rec.name) ?? "";
  const role = textOf(rec.profile_designation) ?? textOf(rec.selected_profiles) ?? "";

  const salary = readSalary(rec.salary_information);
  unreadable.push(...salary.notes);

  const deadline = parseDate(rec.lastDate);
  if (deadline.note !== null) unreadable.push(`Deadline: ${deadline.note}`);

  // `company_category` is the employer's industry ("IT"), not a placement
  // classification, so RoundReady's category is left unset and the student is
  // asked. Mapping "IT" onto service- or product-based would decide, silently
  // and wrongly, whether a placed student may sit for this drive at all.
  const industry = textOf(rec.company_category);
  unreadable.push(
    industry === null
      ? "The portal did not say whether this employer is service-based or product-based. Set it yourself if you need the higher-offer rule to apply."
      : `The portal classifies this employer as "${industry}", which is an industry rather than service-based or product-based. Set the category yourself if you need the higher-offer rule to apply.`,
  );

  // The student-facing payload carries no academic cutoffs at all. They stay
  // unstated, so RoundReady reports "cannot determine" rather than inventing
  // a cutoff or reading a missing one as zero.
  const criteria = {
    cgpaMin: parseNumber(rec.cgpa, 0, 10).value,
    maxActiveBacklogs: parseNumber(rec.backlogs ?? rec.active_backlogs, 0, 50).value,
    allowedBranches: parseBranches(rec.degree_specialization ?? rec.branches),
    tenthPercentMin: null,
    twelfthPercentMin: null,
    gapYearsAllowed: null,
  };
  if (criteria.cgpaMin === null && criteria.allowedBranches.length === 0) {
    unreadable.push(
      "The portal's drive list states no CGPA, backlog or branch cutoff, so eligibility here will read as “cannot determine” until you enter what the official notice says.",
    );
  }

  const driveType = textOf(rec.drive_type);
  const description =
    textOf(rec.drive_objective) ??
    (driveType !== null ? `Drive type: ${driveType}` : null);

  return {
    externalId,
    sourceUrl: driveUrl(externalId, baseUrl),
    company,
    role,
    ctcLpa: salary.ctcLpa,
    ctcRaw: salary.ctcRaw,
    location: textOf(rec.company_location),
    applicationDeadline: deadline.value,
    deadlineRaw: deadline.raw,
    criteria,
    // `rounds` exists on the record but was empty for every drive captured, so
    // its element shape is unknown. Mapping it from a guess would put wrong
    // times on a student's calendar, so it stays empty and is reported.
    rounds: [],
    category: null,
    description,
    skills: [],
    unreadable,
  };
}

export function normaliseAll(records: unknown[], baseUrl: string | null): NormalisedDrive[] {
  return records.map((record) => normaliseDrive(record, baseUrl));
}
