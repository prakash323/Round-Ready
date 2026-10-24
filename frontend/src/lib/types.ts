/**
 * The board, as it arrives over the wire.
 *
 * These mirror the engine's domain types with one deliberate difference: every
 * `Date` is a `string`, because that is what `JSON.stringify` produces and
 * pretending otherwise is how a `.getTime()` on a string ends up in a render.
 * The `format.ts` helpers all accept `Date | string` for exactly this reason.
 */

export type PlacementPolicy = "none" | "one_offer" | "dream_threshold";

export type CompanyCategory = "service_based" | "product_based";

/** A placement the student has already accepted. Stated, never inferred. */
export interface SecuredPlacement {
  company: string;
  ctcLpa: number;
  category: CompanyCategory;
}

export type DriveStatus =
  | "actionable"
  | "unknown"
  | "not_eligible"
  | "blocked"
  | "expired"
  | "resolved";

export type ApplicationStatus =
  | "interested"
  | "applied"
  | "in_progress"
  | "offer"
  | "rejected"
  | "withdrawn";

export type RoundType =
  | "pre_placement_talk"
  | "online_test"
  | "group_discussion"
  | "technical_interview"
  | "hr_interview"
  | "other";

export interface Round {
  id: string;
  name: string;
  type: RoundType;
  startAt: string;
  endAt: string;
}

export interface Criteria {
  cgpaMin: number | null;
  maxActiveBacklogs: number | null;
  allowedBranches: string[];
  tenthPercentMin: number | null;
  twelfthPercentMin: number | null;
  gapYearsAllowed: number | null;
}

export interface Drive {
  id: string;
  company: string;
  role: string;
  ctcLpa: number;
  location: string | null;
  applicationDeadline: string | null;
  criteria: Criteria;
  rounds: Round[];
}

export interface CriterionResult {
  key: string;
  label: string;
  state: "pass" | "fail" | "unknown";
  required: string;
  actual: string;
  message: string;
}

export interface EligibilityResult {
  verdict: "eligible" | "not_eligible" | "unknown";
  checks: CriterionResult[];
  failures: CriterionResult[];
  unknowns: CriterionResult[];
}

export interface PolicyResult {
  state: "open" | "blocked";
  policy: PlacementPolicy;
  reason: string | null;
  governingOffer: { driveId: string; company: string; ctcLpa: number } | null;
  floorLpa: number | null;
  warning: string | null;
  securedPlacement: SecuredPlacement | null;
  securedMultiplier: number | null;
  securedThresholdLpa: number | null;
}

export interface RoundRef {
  driveId: string;
  company: string;
  roundId: string;
  roundName: string;
  startAt: string;
  endAt: string;
}

export interface Clash {
  a: RoundRef;
  b: RoundRef;
  overlapMinutes: number;
}

export interface PriorityComponent {
  label: string;
  points: number;
  detail: string;
}

export interface PriorityScore {
  total: number;
  components: PriorityComponent[];
}

export interface Application {
  id: string;
  driveId: string;
  status: ApplicationStatus;
  currentRound: string | null;
  offerCtcLpa: number | null;
  history: { status: ApplicationStatus; at: string }[];
}

export interface NextDate {
  kind: "deadline" | "round";
  at: string;
  label: string;
  live: boolean;
}

export interface DriveView {
  drive: Drive;
  eligibility: EligibilityResult;
  policy: PolicyResult;
  application: Application | null;
  clashes: Clash[];
  nextDate: NextDate | null;
  deadlinePassed: boolean;
  status: DriveStatus;
  priority: PriorityScore | null;
  /** Attached by the API, not by the engine — an author label, not a verdict. */
  createdByName: string | null;
}

export interface BoardStats {
  total: number;
  actionable: number;
  unknown: number;
  notEligible: number;
  blocked: number;
  expired: number;
  resolved: number;
  clashes: number;
  offers: number;
  bestAvailableCtcLpa: number | null;
  dueThisWeek: number;
}

export interface AgendaItem {
  at: string;
  kind: "deadline" | "round";
  label: string;
  company: string;
  driveId: string;
  ctcLpa: number;
  clashing: boolean;
}

export interface BoardResponse {
  stats: BoardStats;
  clashes: Clash[];
  policyWarning: string | null;
  profileIsUsable: boolean;
  policy: PlacementPolicy;
  dreamCtcLpa: number | null;
  securedPlacement: SecuredPlacement | null;
  securedThresholdLpa: number | null;
  securedMultiplier: number | null;
  agenda: AgendaItem[];
  groups: {
    actionable: DriveView[];
    unknown: DriveView[];
    blocked: DriveView[];
    notEligible: DriveView[];
    expired: DriveView[];
    resolved: DriveView[];
  };
}

export interface AffectedDrive {
  driveId: string;
  company: string;
  role: string;
  ctcLpa: number;
  nextDate: string | null;
  deadlinePassed: boolean;
}

export interface Simulation {
  accepted: { driveId: string; company: string; role: string; ctcLpa: number };
  policy: PlacementPolicy;
  floorLpa: number | null;
  closes: AffectedDrive[];
  survives: AffectedDrive[];
  highestClosed: AffectedDrive | null;
  ctcForegone: number;
  verdict: "safe" | "consider" | "costly";
  headline: string;
  rationale: string[];
}

export type Role = "student" | "cdc_officer";

export interface SessionUser {
  email: string;
  name: string;
  batchId: string;
  /**
   * Decides which controls are rendered — never what is permitted. Every
   * officer-only route is enforced on the server, so hiding a button here is
   * a courtesy to students, not a security boundary.
   */
  role: Role;
}

/** The batch's higher-offer multipliers, as set by its CDC officer. */
export interface BatchPolicy {
  batchId: string;
  serviceMultiplier: number;
  productMultiplier: number;
  /** False when no officer has saved one, so the UI can say "standard". */
  configured: boolean;
  updatedAt: string | null;
}

/** A drive as the REST routes return it, with Mongo's field names. */
export interface DriveDoc {
  _id: string;
  company: string;
  role: string;
  ctcLpa: number;
  location: string | null;
  applicationDeadline: string | null;
  criteria: Criteria;
  rounds: (Round & { _id: string })[];
  createdBy: { name: string } | string | null;
}

export interface ProfileDoc {
  cgpa: number | null;
  activeBacklogs: number | null;
  branch: string;
  tenthPercent: number | null;
  twelfthPercent: number | null;
  gapYears: number | null;
  policy: PlacementPolicy;
  dreamCtcLpa: number | null;
  hasSecuredPlacement: boolean;
  securedCompany: string | null;
  securedCtcLpa: number | null;
  securedCategory: CompanyCategory | null;
}

// --- Job-description analysis ----------------------------------------------

export type SkillImportance = "required" | "preferred";
/** "manual" is a skill the student added that the taxonomy missed. */
export type SkillSource = "explicit" | "inferred" | "manual";

export interface ExtractedSkill {
  id: string;
  label: string;
  category: string;
  importance: SkillImportance;
  source: SkillSource;
  /** The line this came from, verbatim, so the analysis can be checked. */
  evidence: string;
  reason?: string | null;
}

export interface JdSection {
  heading: string;
  kind: string;
  lines: string[];
}

export interface JdAnalysis {
  roleTitle: string | null;
  company: string | null;
  skills: ExtractedSkill[];
  responsibilities: string[];
  qualifications: string[];
  experience: { minYears: number | null; evidence: string } | null;
  assessments: string[];
  sections: JdSection[];
  /** What the analyser could not determine, stated plainly. */
  gaps: string[];
  stats: { words: number; lines: number; skillsFound: number };
}

export interface JobDescriptionDoc {
  _id: string;
  driveId: string | null;
  roleTitle: string | null;
  company: string | null;
  rawText: string;
  skills: ExtractedSkill[];
  responsibilities: string[];
  qualifications: string[];
  assessments: string[];
  experienceMinYears: number | null;
  gaps: string[];
  editedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// --- Skill gaps -------------------------------------------------------------

export type Proficiency = "none" | "beginner" | "intermediate" | "advanced";
/** Only "self_reported" is produced today; "assessment" is reserved so a
 *  measured level can never be silently merged into a self-assessment. */
export type ProficiencySource = "self_reported" | "assessment";

export interface StudentSkill {
  skillId: string;
  label: string;
  level: Proficiency;
  source: ProficiencySource;
}

export type GapStatus = "met" | "partial" | "missing" | "unknown";

export interface SkillGap {
  skill: ExtractedSkill;
  /** null when never rated. Never defaulted to "none". */
  level: Proficiency | null;
  source: ProficiencySource | null;
  target: Proficiency;
  status: GapStatus;
  distance: number;
  priority: number;
  rationale: string;
}

export interface GapAnalysis {
  gaps: SkillGap[];
  summary: {
    total: number;
    met: number;
    partial: number;
    missing: number;
    unknown: number;
    requiredOutstanding: number;
  };
  caveats: string[];
}

// --- Study plan -------------------------------------------------------------

export type TaskKind = "study" | "assess";

export interface PlanTask {
  /** Stable across rebuilds; completion is recorded against this. */
  id: string;
  skillId: string;
  label: string;
  kind: TaskKind;
  importance: SkillImportance;
  objective: string;
  hours: number;
  dayOffset: number;
  date: string;
  done: boolean;
}

export interface PlanDay {
  dayOffset: number;
  date: string;
  tasks: PlanTask[];
  hours: number;
}

export interface UncoveredSkill {
  skillId: string;
  label: string;
  importance: SkillImportance;
  hoursShort: number;
  reason: string;
}

export interface StudyPlan {
  days: PlanDay[];
  uncovered: UncoveredSkill[];
  summary: {
    totalHours: number;
    doneHours: number;
    totalTasks: number;
    doneTasks: number;
    daysAvailable: number;
    hoursAvailable: number;
    requiredUncovered: number;
  };
  notes: string[];
}

/** The three inputs the plan is derived from. The plan itself is never sent. */
export interface PlanSettings {
  hoursPerDay: number;
  deadline: string | null;
  completedTaskIds: string[];
}

export interface PlanResponse {
  plan: StudyPlan;
  settings: PlanSettings;
}

// --- Learning resources -----------------------------------------------------

export type ResourceKind = "official" | "reference" | "practice";

export interface LearningResource {
  title: string;
  url: string;
  kind: ResourceKind;
  note: string;
}

export interface SkillGuide {
  /** Original guidance on what to cover. Not sourced from anywhere. */
  focus: string[];
  resources: LearningResource[];
}

export interface SavedResource {
  _id: string;
  skillId: string | null;
  title: string;
  url: string;
  note: string;
  /** True when it came from the curated set rather than the student. */
  curated: boolean;
  createdAt: string;
}

export interface SkillResources {
  skillId: string;
  /** null when nothing is curated for this skill — no filler is invented. */
  guide: SkillGuide | null;
  saved: SavedResource[];
}
