/**
 * Reading the portal's numbers and dates without inventing any.
 *
 * Campus notices write compensation a dozen ways and dates in at least four.
 * The rule throughout: a value that cannot be read with confidence becomes
 * `null` plus a note, never a guess. A wrong CTC moves a student's
 * secured-placement bar; a wrong deadline makes a live drive look expired.
 * Both are worse than an empty field the student is asked to fill in.
 */

export interface Parsed<T> {
  value: T | null;
  /** Kept verbatim, so a misread can be checked against what was written. */
  raw: string | null;
  /** Why it was refused, or what assumption was made to read it. */
  note: string | null;
}

const EMPTY: Parsed<never> = { value: null, raw: null, note: null };

function text(input: unknown): string | null {
  if (typeof input === "number" && Number.isFinite(input)) return String(input);
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  return trimmed === "" ? null : trimmed;
}

/** Phrases that mean "we are not telling you", not "zero". */
const UNDISCLOSED =
  /\b(not\s*disclosed|undisclosed|as\s*per\s*(company|industry)\s*norms?|confidential|tba|tbd|n\/?a)\b/i;

/**
 * Compensation, normalised to LPA.
 *
 * Handles, in order of confidence:
 *   "12 LPA", "12.5 lpa"              → 12, 12.5
 *   "8.5 lakh", "8.5 Lacs", "8.5L"    → 8.5
 *   "1.2 crore", "1.2 Cr"             → 120
 *   "850000", "8,50,000", "₹8,50,000" → 8.5   (absolute rupees per annum)
 *   "6-8 LPA"                         → 6, with a note
 *
 * Deliberately refused:
 *   a monthly stipend ("45k/month") — a stipend is not a CTC, and annualising
 *     one would put an internship on the same scale as a job offer
 *   "not disclosed" and its variants — absent, not zero
 */
export function parseCtcLpa(input: unknown): Parsed<number> {
  const raw = text(input);
  if (raw === null) return { ...EMPTY };

  if (UNDISCLOSED.test(raw)) {
    return { value: null, raw, note: "The portal did not state a figure" };
  }

  // A monthly or per-month figure is a stipend. Annualising it would silently
  // turn a 45k/month internship into a 5.4 LPA "offer" and let it gate a
  // placed student's board.
  if (/\b(per\s*month|\/\s*month|month(ly)?|p\.?m\.?)\b/i.test(raw)) {
    return {
      value: null,
      raw,
      note: "Reads as a monthly figure, so it was not treated as an annual CTC",
    };
  }

  // Currency symbols and Indian digit grouping are removed outright — turning
  // "8,50,000" into "8 50 000" would leave it unreadable as a single figure.
  const cleaned = raw.replace(/[₹$,]/g, "").replace(/\s+/g, " ").trim();

  const UNIT = "(lpa|lakhs?|lacs?|l\\b|crores?|cr\\b)";
  const toLpa = (n: number, unit: string | undefined): number =>
    unit !== undefined && /^(crores?|cr)$/i.test(unit) ? n * 100 : n;

  // A range is matched first and explicitly. Scanning for the first
  // number-with-unit instead would read "6-8 LPA" as 8, because only the
  // upper figure carries the unit — quietly reporting the best case as if the
  // employer had committed to it.
  const range = cleaned.match(
    new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:-|–|—|to)\\s*(\\d+(?:\\.\\d+)?)\\s*${UNIT}?`, "i"),
  );
  if (range) {
    return {
      value: round2(toLpa(Number(range[1]), range[3])),
      raw,
      note: "A range was stated; the lower figure was used. Check the notice.",
    };
  }

  const single = cleaned.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${UNIT}`, "i"));
  if (single) {
    return { value: round2(toLpa(Number(single[1]), single[2])), raw, note: null };
  }

  // A bare number. Rupees per annum above a lakh; anything smaller is already
  // LPA. Nothing in between is guessed at.
  const bare = cleaned.match(/^(\d+(?:\.\d+)?)$/);
  if (bare) {
    const n = Number(bare[1]);
    if (n >= 10000) return { value: round2(n / 100000), raw, note: null };
    if (n > 0 && n < 200) return { value: round2(n), raw, note: null };
    return {
      value: null,
      raw,
      note: "The figure is not clearly rupees or lakhs, so it was left for you to confirm",
    };
  }

  return { value: null, raw, note: "The compensation could not be read" };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * A date, normalised to an ISO instant.
 *
 * ISO strings and epoch milliseconds are taken at face value. "25 Oct 2026"
 * is unambiguous and read directly. A purely numeric slash date is read as
 * DD/MM/YYYY — the Indian convention, which this portal serves — and flagged
 * when the day could also be a month, because reading 05/06 the other way
 * moves a deadline by a month.
 */
export function parseDate(input: unknown): Parsed<string> {
  if (input instanceof Date) {
    return Number.isNaN(input.getTime())
      ? { value: null, raw: null, note: "Not a readable date" }
      : { value: input.toISOString(), raw: input.toISOString(), note: null };
  }

  if (typeof input === "number" && Number.isFinite(input)) {
    // Epoch seconds and milliseconds are told apart by magnitude; anything
    // before 2001 in ms is almost certainly seconds.
    const ms = input < 1e11 ? input * 1000 : input;
    const d = new Date(ms);
    return Number.isNaN(d.getTime())
      ? { value: null, raw: String(input), note: "Not a readable date" }
      : { value: d.toISOString(), raw: String(input), note: null };
  }

  const raw = text(input);
  if (raw === null) return { ...EMPTY };

  if (/^\d{4}-\d{2}-\d{2}([T ]|$)/.test(raw)) {
    const d = new Date(raw.includes("T") ? raw : `${raw}T00:00:00.000Z`);
    if (!Number.isNaN(d.getTime())) return { value: d.toISOString(), raw, note: null };
  }

  // "25 Oct 2026", "25 October 2026", "Oct 25, 2026" — month named, so no
  // day/month ambiguity exists.
  //
  // A date with no time is rebuilt in UTC from the calendar components. Left
  // as `new Date(raw)` it is parsed at LOCAL midnight, which in IST is 18:30
  // the previous day in UTC — so a deadline of the 25th is stored, displayed
  // and compared as the 24th.
  const named = new Date(raw);
  if (/[A-Za-z]{3}/.test(raw) && !Number.isNaN(named.getTime())) {
    const hasTime = /\d{1,2}:\d{2}/.test(raw);
    const value = hasTime
      ? named
      : new Date(Date.UTC(named.getFullYear(), named.getMonth(), named.getDate()));
    return { value: value.toISOString(), raw, note: null };
  }

  const slash = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (slash) {
    const [, a, b, y] = slash;
    const day = Number(a);
    const month = Number(b);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(Date.UTC(Number(y), month - 1, day));
      return {
        value: d.toISOString(),
        raw,
        note:
          day <= 12
            ? "Read as DD/MM/YYYY. If the portal meant MM/DD, correct the date."
            : null,
      };
    }
  }

  return { value: null, raw, note: "The date format was not recognised" };
}

/**
 * A number the portal states as a cutoff — CGPA, backlogs, percentages.
 *
 * The distinction that matters: an absent cutoff is `null` and is not
 * evaluated, while a stated `0` is a real cutoff that everyone clears. The
 * strings "0" and "" must therefore not collapse into the same answer.
 */
export function parseNumber(input: unknown, min: number, max: number): Parsed<number> {
  if (input === null || input === undefined) return { ...EMPTY };
  const raw = text(input);
  if (raw === null) return { ...EMPTY };
  if (UNDISCLOSED.test(raw)) return { value: null, raw, note: "Not stated" };

  const match = raw.match(/-?\d+(?:\.\d+)?/);
  if (!match) return { value: null, raw, note: "Not a number" };

  const n = Number(match[0]);
  if (!Number.isFinite(n) || n < min || n > max) {
    return { value: null, raw, note: `Outside the plausible range ${min}–${max}` };
  }
  return { value: n, raw, note: null };
}

/**
 * A branch list.
 *
 * An empty list means the notice placed no branch restriction, which is a real
 * and common state — it is not "unknown". Entries are trimmed and de-duplicated
 * but never expanded: "CSE" is not silently turned into "Computer Science".
 */
export function parseBranches(input: unknown): string[] {
  const values: unknown[] = Array.isArray(input) ? input : typeof input === "string" ? input.split(/[,;|]/) : [];
  const out: string[] = [];
  for (const value of values) {
    const name = text(value);
    if (name !== null && !out.includes(name)) out.push(name);
  }
  return out;
}

/**
 * The employer's category, only when the portal states it.
 *
 * Never inferred from the company's name. This value decides whether a placed
 * student's bar is 1.5x or 2x their package — the difference between being
 * allowed to sit for a drive and not — so a guess here is not a cosmetic
 * error. Anything unrecognised returns null and the student is asked.
 */
export function parseCategory(input: unknown): "service_based" | "product_based" | null {
  const raw = text(input);
  if (raw === null) return null;
  const value = raw.toLowerCase().replace(/[\s_-]+/g, "");
  if (value.includes("service")) return "service_based";
  if (value.includes("product")) return "product_based";
  return null;
}
