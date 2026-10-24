import { ALIASES_LONGEST_FIRST, skillById } from "./taxonomy";
import type { SkillCategory, SkillDefinition } from "./taxonomy";

/**
 * Job-description analysis.
 *
 * Pure: text in, structure out, no clock and no database — the same property
 * that makes the placement engine cheap to test exhaustively.
 *
 * Two rules govern everything here.
 *
 * It never invents. Each extracted item carries the exact line it came from,
 * so a student can check the analyser's work against the notice rather than
 * trust it. Nothing about interview rounds, assessment formats or company
 * hiring criteria is produced unless the text says it.
 *
 * It separates what the notice said from what the analyser concluded. A skill
 * found verbatim is `explicit`; one reached through the taxonomy ("React, so
 * JavaScript") is `inferred` and carries its reasoning. The two are never
 * merged, because a study plan built on a guess should be visibly built on a
 * guess.
 */

export type SkillImportance = "required" | "preferred";
export type SkillSource = "explicit" | "inferred";

export interface ExtractedSkill {
  id: string;
  label: string;
  category: SkillCategory;
  importance: SkillImportance;
  source: SkillSource;
  /** The line this came from, verbatim, so the student can verify it. */
  evidence: string;
  /** Why the analyser concluded this, when `source` is "inferred". */
  reason?: string;
}

export type SectionKind =
  | "responsibilities"
  | "requirements"
  | "preferred"
  | "qualifications"
  | "assessment"
  | "about"
  | "other";

export interface JdSection {
  heading: string;
  kind: SectionKind;
  lines: string[];
}

export interface JdAnalysis {
  roleTitle: string | null;
  company: string | null;
  skills: ExtractedSkill[];
  responsibilities: string[];
  qualifications: string[];
  /** Only when the text states it. `null` means the notice did not say. */
  experience: { minYears: number | null; evidence: string } | null;
  /** Assessment steps the notice explicitly mentions. Never inferred. */
  assessments: string[];
  sections: JdSection[];
  /** What the analyser could not determine, said plainly. */
  gaps: string[];
  stats: { words: number; lines: number; skillsFound: number };
}

// --- Section detection -------------------------------------------------------

const HEADINGS: { kind: SectionKind; patterns: RegExp[] }[] = [
  {
    kind: "preferred",
    patterns: [
      /^(good|nice)[\s-]to[\s-]have/i,
      /^preferred\b/i,
      /^bonus\b/i,
      /^plus(es)?\b/i,
      /^desirable/i,
      /^optional\b/i,
    ],
  },
  {
    kind: "requirements",
    patterns: [
      /^(key\s+)?(requirements?|must[\s-]have|skills?\s*(required|needed)?|technical\s+skills?|what\s+we('|’)?re\s+looking\s+for|who\s+you\s+are|eligibility)\b/i,
    ],
  },
  {
    kind: "responsibilities",
    patterns: [
      /^(key\s+)?(responsibilit(y|ies)|what\s+you('|’)?ll\s+do|role\s+(and\s+)?responsibilit|job\s+description|the\s+role|about\s+the\s+role|your\s+impact)\b/i,
    ],
  },
  {
    kind: "qualifications",
    patterns: [/^(qualifications?|education|academic)\b/i],
  },
  {
    kind: "assessment",
    patterns: [
      /^(selection\s+process|interview\s+process|hiring\s+process|assessment|rounds?|evaluation\s+process|recruitment\s+process)\b/i,
    ],
  },
  { kind: "about", patterns: [/^(about\s+(us|the\s+company)|company\s+overview|who\s+we\s+are)\b/i] },
];

/** A heading is a short line that matches a known pattern, with or without a colon. */
function headingKind(line: string): SectionKind | null {
  const text = line.replace(/[:：]\s*$/, "").trim();
  if (text.length === 0 || text.length > 60) return null;
  for (const { kind, patterns } of HEADINGS) {
    if (patterns.some((p) => p.test(text))) return kind;
  }
  return null;
}

function isBullet(line: string): boolean {
  return /^\s*([-*•·▪o]|\d+[.)])\s+/.test(line);
}

function stripBullet(line: string): string {
  return line.replace(/^\s*([-*•·▪o]|\d+[.)])\s+/, "").trim();
}

export function splitSections(text: string): JdSection[] {
  const lines = text.split(/\r?\n/);
  const sections: JdSection[] = [];
  let current: JdSection = { heading: "", kind: "other", lines: [] };

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") continue;
    const kind = headingKind(line);
    if (kind) {
      if (current.lines.length > 0 || current.heading !== "") sections.push(current);
      current = { heading: line.replace(/[:：]\s*$/, "").trim(), kind, lines: [] };
      continue;
    }
    current.lines.push(line);
  }
  if (current.lines.length > 0 || current.heading !== "") sections.push(current);
  return sections;
}

// --- Skill matching ----------------------------------------------------------

/**
 * Word-boundary matching that survives the punctuation real skills contain.
 *
 * `\b` is useless against "C++", "C#" and ".NET" — the boundary falls in the
 * wrong place or nowhere at all — so the guard is explicit: the character
 * either side must not be one that could continue a token.
 */
function containsAlias(haystack: string, alias: string): boolean {
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(alias, from);
    if (at === -1) return false;
    const before = at === 0 ? " " : haystack[at - 1];
    const after = at + alias.length >= haystack.length ? " " : haystack[at + alias.length];
    const isWordish = (ch: string) => /[a-z0-9]/.test(ch);
    // A preceding dot continues the token unless the alias owns that dot:
    // ".net" may match after a space, but "js" must not match the tail of
    // "node.js" — which would report JavaScript as named by a description
    // that only ever said Node.
    const dotted = before === "." && !alias.startsWith(".");
    const startsClean = !isWordish(before) && !dotted;
    // Trailing "+" or "#" belongs to the alias itself, so a following one
    // means we matched a prefix: "c" inside "c++".
    const endsClean = !isWordish(after) && after !== "+" && after !== "#";
    if (startsClean && endsClean) return true;
    from = at + 1;
  }
}

/** Cue words that override whatever section a line sits in. */
const PREFERRED_CUES =
  /\b(nice to have|good to have|preferred|preferably|bonus|a plus|is a plus|desirable|optional|familiarity|exposure to|awareness of)\b/i;
const REQUIRED_CUES = /\b(must|required|mandatory|essential|strong|proficien|expert|solid)\b/i;

function importanceFor(line: string, sectionKind: SectionKind): SkillImportance {
  // An explicit cue in the line itself beats the section it happens to be in:
  // "Java (required)" under a Nice-to-have heading is still required.
  if (PREFERRED_CUES.test(line)) return "preferred";
  if (REQUIRED_CUES.test(line)) return "required";
  if (sectionKind === "preferred") return "preferred";
  return "required";
}

// --- Experience and assessment ----------------------------------------------

const EXPERIENCE = /(\d+(?:\.\d+)?)\s*(?:\+|plus)?\s*(?:-\s*\d+\s*)?(?:years?|yrs?)\b[^.\n]{0,40}?(?:experience|exp\b)/i;

function findExperience(text: string): JdAnalysis["experience"] {
  for (const line of text.split(/\r?\n/)) {
    const match = EXPERIENCE.exec(line);
    if (match) {
      const years = Number(match[1]);
      return { minYears: Number.isFinite(years) ? years : null, evidence: line.trim() };
    }
  }
  return null;
}

const ASSESSMENT_TERMS =
  /\b(online (test|assessment)|coding (round|test|challenge)|technical interview|hr interview|group discussion|aptitude test|written test|machine coding|system design round|pre[\s-]placement talk)\b/gi;

function findAssessments(sections: JdSection[]): string[] {
  const found = new Set<string>();
  for (const section of sections) {
    for (const line of section.lines) {
      // Only what the text names. Nothing about a company's usual process is
      // invented here — if the notice does not say, the student is told so.
      for (const match of line.matchAll(ASSESSMENT_TERMS)) {
        found.add(match[0].toLowerCase().replace(/\s+/g, " "));
      }
    }
  }
  return [...found];
}

// --- Role and company --------------------------------------------------------

const ROLE_LINE = /^(role|position|job title|designation|title)\s*[:\-–]\s*(.+)$/i;
const COMPANY_LINE = /^(company|organisation|organization|employer)\s*[:\-–]\s*(.+)$/i;

function findLabelled(text: string, pattern: RegExp): string | null {
  for (const line of text.split(/\r?\n/)) {
    const match = pattern.exec(line.trim());
    if (match) {
      const value = match[2].trim();
      if (value.length > 0 && value.length <= 120) return value;
    }
  }
  return null;
}

// --- The analyser ------------------------------------------------------------

export interface AnalyseOptions {
  /** Known from the drive, used only when the text does not say. */
  fallbackRole?: string | null;
  fallbackCompany?: string | null;
}

export function analyseJobDescription(text: string, options: AnalyseOptions = {}): JdAnalysis {
  const sections = splitSections(text);
  const words = text.split(/\s+/).filter(Boolean).length;
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "").length;

  // --- Skills, explicit ------------------------------------------------------
  // Keyed by skill id. A skill named twice keeps the stronger importance:
  // "required" beats "preferred", because missing a required skill is the
  // costlier mistake.
  const explicit = new Map<string, ExtractedSkill>();

  for (const section of sections) {
    for (const line of section.lines) {
      const haystack = line.toLowerCase();
      const seenHere = new Set<string>();
      for (const { alias, skill } of ALIASES_LONGEST_FIRST) {
        if (seenHere.has(skill.id)) continue;
        if (!containsAlias(haystack, alias)) continue;
        seenHere.add(skill.id);

        const importance = importanceFor(line, section.kind);
        const existing = explicit.get(skill.id);
        if (existing && existing.importance === "required") continue;
        if (existing && importance === "preferred") continue;

        explicit.set(skill.id, {
          id: skill.id,
          label: skill.label,
          category: skill.category,
          importance,
          source: "explicit",
          evidence: stripBullet(line),
        });
      }
    }
  }

  // --- Skills, inferred ------------------------------------------------------
  // Kept strictly separate: a plan built on a guess should look like one.
  const inferred = new Map<string, ExtractedSkill>();
  for (const skill of explicit.values()) {
    const definition: SkillDefinition | undefined = skillById(skill.id);
    for (const impliedId of definition?.implies ?? []) {
      if (explicit.has(impliedId) || inferred.has(impliedId)) continue;
      const implied = skillById(impliedId);
      if (!implied) continue;
      inferred.set(impliedId, {
        id: implied.id,
        label: implied.label,
        category: implied.category,
        importance: skill.importance,
        source: "inferred",
        evidence: skill.evidence,
        reason: `Not named in the description — implied by ${skill.label}.`,
      });
    }
  }

  const skills = [...explicit.values(), ...inferred.values()].sort((a, b) => {
    if (a.source !== b.source) return a.source === "explicit" ? -1 : 1;
    if (a.importance !== b.importance) return a.importance === "required" ? -1 : 1;
    return a.label.localeCompare(b.label);
  });

  // --- Prose ----------------------------------------------------------------
  const take = (kind: SectionKind) =>
    sections
      .filter((s) => s.kind === kind)
      .flatMap((s) => s.lines)
      .filter((l) => isBullet(l) || l.length > 25)
      .map(stripBullet);

  const responsibilities = take("responsibilities");
  const qualifications = take("qualifications");
  const experience = findExperience(text);
  const assessments = findAssessments(sections);

  // --- What could not be determined ----------------------------------------
  // Said plainly rather than papered over, so the student knows exactly how
  // much of this to trust and what to fill in themselves.
  const gaps: string[] = [];
  if (skills.length === 0) {
    gaps.push("No recognised skills were found. Add them by hand below.");
  }
  if (responsibilities.length === 0) {
    gaps.push("No responsibilities section was found.");
  }
  if (qualifications.length === 0) {
    gaps.push("No qualifications or eligibility section was found.");
  }
  if (experience === null) {
    gaps.push("The description does not state an experience requirement.");
  }
  if (assessments.length === 0) {
    gaps.push(
      "The description does not name its assessment rounds. Nothing has been assumed about them.",
    );
  }
  if (sections.every((s) => s.kind === "other")) {
    gaps.push(
      "No headings were recognised, so required and preferred skills could not be told apart — everything was read as required.",
    );
  }

  return {
    roleTitle: findLabelled(text, ROLE_LINE) ?? options.fallbackRole ?? null,
    company: findLabelled(text, COMPANY_LINE) ?? options.fallbackCompany ?? null,
    skills,
    responsibilities,
    qualifications,
    experience,
    assessments,
    sections,
    gaps,
    stats: { words, lines, skillsFound: skills.length },
  };
}
