import type {
  Application,
  CompanyCategory,
  Drive,
  PlacementPolicy,
  Profile,
  SecuredPlacement,
} from "./types";

/**
 * The multiplier a placed student must clear to sit for anything further.
 *
 * Exported and passed in rather than read from module scope, so a college with
 * different numbers is a configuration change rather than a code change — the
 * rule itself is the same shape everywhere.
 */
export const SECURED_MULTIPLIERS: Record<CompanyCategory, number> = {
  service_based: 1.5,
  product_based: 2,
};

export interface SecuredGate {
  secured: SecuredPlacement;
  multiplier: number;
  /** The CTC a further drive must reach. */
  thresholdLpa: number;
}

/**
 * The bar a placed student has to clear.
 *
 * A *floor*, and an inclusive one: "eligible for offers of at least 1.5× the
 * secured package" admits a drive paying exactly 1.5×. That boundary is the
 * opposite of `dream_threshold`, which blocks a drive sitting exactly on its
 * line (PRD R10) — which is why the two gates are evaluated separately below
 * rather than collapsed into one number. Merging them would silently move one
 * of the two boundaries by a rupee, on the rule that decides whether a placed
 * student may sit at all.
 */
export function securedGate(
  secured: SecuredPlacement | null,
  multipliers: Record<CompanyCategory, number> = SECURED_MULTIPLIERS,
): SecuredGate | null {
  if (secured === null) return null;
  const multiplier = multipliers[secured.category];
  if (multiplier === undefined) return null;
  return {
    secured,
    multiplier,
    // Rounded to paise-free LPA so the displayed threshold and the compared
    // threshold are the same number.
    thresholdLpa: Math.round(secured.ctcLpa * multiplier * 100) / 100,
  };
}

const CATEGORY_LABEL: Record<CompanyCategory, string> = {
  service_based: "service-based",
  product_based: "product-based",
};

/**
 * Placement-policy gating (PRD rules R7–R10).
 *
 * This is the rule students lose drives to. Under a one-offer policy, accepting
 * anything ends the season. Under a dream-threshold policy, accepting at 8 LPA
 * leaves open only drives above the dream cutoff — and nothing in the student's
 * spreadsheet notices that eleven of their tracked companies just became
 * unavailable.
 *
 * Only an application's CURRENT status counts. An application that reached
 * `offer` and was then withdrawn blocks nothing (R9), which is why the gate is
 * computed from live state rather than from history.
 */

export type PolicyState = "open" | "blocked";

export interface ActiveOffer {
  driveId: string;
  company: string;
  ctcLpa: number;
}

export interface PolicyResult {
  state: PolicyState;
  policy: PlacementPolicy;
  reason: string | null;
  /** The offer responsible for the gate, if any. */
  governingOffer: ActiveOffer | null;
  /** Drives with CTC at or below this are blocked. `null` when nothing gates. */
  floorLpa: number | null;
  /** Set when the application set is in a state the gate cannot fully trust —
   *  more than one live offer, or an offer whose drive has gone. */
  warning: string | null;
  /** The placement already accepted, if any. Shown so the student can see
   *  exactly which record is gating them, and correct it if it is wrong. */
  securedPlacement: SecuredPlacement | null;
  /** The multiplier that category attracts: 1.5 service-based, 2 product-based. */
  securedMultiplier: number | null;
  /** `securedPlacement.ctcLpa × securedMultiplier`. A drive must reach this. */
  securedThresholdLpa: number | null;
}

/** Stands in for the company when the offer's drive is no longer on the board. */
export const MISSING_DRIVE = "a drive no longer on your board";

/**
 * Live offers, with a CTC for each — falling back to the drive's own CTC.
 *
 * An application can outlive its drive: drives are shared across a batch, so a
 * classmate deleting one leaves everybody else holding an application that
 * points at nothing. Such an offer is still usable as a gate *if the
 * application itself recorded the offered amount*, because that number came
 * from the student rather than from the drive.
 *
 * With neither a drive nor a recorded CTC there is no number to reason about,
 * and the offer is dropped. Valuing it at `0` instead — which is what this did
 * before — meant a deleted drive silently blocked every drive under the dream
 * cutoff, attributed to a company with no card on the board, so the student
 * could neither see the cause nor clear it. `unresolvableOffers` reports the
 * ones dropped so the board can say so out loud.
 */
export function activeOffers(applications: Application[], drives: Drive[]): ActiveOffer[] {
  const byId = new Map(drives.map((d) => [d.id, d]));
  const offers: ActiveOffer[] = [];
  for (const application of applications) {
    if (application.status !== "offer") continue;
    const drive = byId.get(application.driveId);
    const ctcLpa = application.offerCtcLpa ?? drive?.ctcLpa ?? null;
    if (ctcLpa === null) continue;
    offers.push({
      driveId: application.driveId,
      company: drive?.company ?? MISSING_DRIVE,
      ctcLpa,
    });
  }
  return offers;
}

/**
 * Live offers that cannot be valued at all: no drive on the board and no
 * recorded CTC. These gate nothing, and the student is told rather than left
 * with a board that quietly disagrees with itself.
 */
export function unresolvableOffers(applications: Application[], drives: Drive[]): Application[] {
  const onBoard = new Set(drives.map((d) => d.id));
  return applications.filter(
    (a) => a.status === "offer" && a.offerCtcLpa === null && !onBoard.has(a.driveId),
  );
}

/** The offer that governs the gate: the highest CTC among live offers. */
export function governingOffer(offers: ActiveOffer[]): ActiveOffer | null {
  if (offers.length === 0) return null;
  return offers.reduce((best, o) => (o.ctcLpa > best.ctcLpa ? o : best));
}

/**
 * The CTC at or below which drives are blocked, given a policy and a live offer.
 *
 * `one_offer`  → Infinity: every other drive is closed.
 * `dream_threshold` → max(offer CTC, dream cutoff). Taking the maximum matters:
 *   a student who accepts 15 LPA under a 12 LPA dream cutoff should not then be
 *   shown 13 LPA drives as available, because they are already above the dream
 *   line and the college considers them placed.
 * `none` → null: nothing is gated.
 */
export function policyFloor(
  policy: PlacementPolicy,
  dreamCtcLpa: number | null,
  offer: ActiveOffer | null,
): number | null {
  if (offer === null) return null;
  if (policy === "none") return null;
  if (policy === "one_offer") return Number.POSITIVE_INFINITY;
  return Math.max(offer.ctcLpa, dreamCtcLpa ?? 0);
}

/**
 * The part of the gate that does not depend on which drive is being asked
 * about: who holds the governing offer, where that draws the line, and whether
 * the application set is in a state worth warning about.
 *
 * Split out because it was being recomputed per drive — each call rebuilding a
 * Map of every drive and rescanning every application, for an answer that is
 * identical across the whole board (AUDIT.md D7). Resolving it once turns
 * `buildBoard` from O(drives² + drives·applications) into O(drives).
 */
export interface PolicyContext {
  offer: ActiveOffer | null;
  floorLpa: number | null;
  warning: string | null;
  /** The secured-placement bar, or null when the student is unplaced. */
  secured: SecuredGate | null;
}

export function resolvePolicyContext(
  profile: Profile,
  applications: Application[],
  drives: Drive[],
  multipliers: Record<CompanyCategory, number> = SECURED_MULTIPLIERS,
): PolicyContext {
  const offers = activeOffers(applications, drives);
  const offer = governingOffer(offers);
  const floorLpa = policyFloor(profile.policy, profile.dreamCtcLpa, offer);

  const notes: string[] = [];
  if (offers.length > 1) {
    notes.push(
      `${offers.length} live offers are recorded; the highest (${offer?.company}, ${offer?.ctcLpa} LPA) is being treated as the governing one.`,
    );
  }
  const orphaned = unresolvableOffers(applications, drives);
  if (orphaned.length > 0) {
    const one = orphaned.length === 1;
    notes.push(
      `${orphaned.length} recorded offer${one ? "" : "s"} point${one ? "s" : ""} at a drive that is ` +
        `no longer on your board and carr${one ? "ies" : "y"} no offered CTC, so ${one ? "it is" : "they are"} ` +
        `gating nothing. Clear that status, or re-add the drive with the amount, if it should count.`,
    );
  }

  return {
    offer,
    floorLpa,
    warning: notes.length > 0 ? notes.join(" ") : null,
    secured: securedGate(profile.securedPlacement, multipliers),
  };
}

/**
 * Evaluate the gate for one drive against an already-resolved context.
 *
 * `evaluatePolicy` below keeps its original signature and resolves the context
 * itself, so every existing caller and test is unaffected; the only difference
 * is that `buildBoard` now resolves once and calls this directly. The two paths
 * are asserted to agree in `tests/defects.test.ts`, because a refactor whose
 * whole point is that nothing changes needs something watching that nothing
 * changed.
 */
export function evaluatePolicyFor(
  profile: Profile,
  drive: Drive,
  context: PolicyContext,
): PolicyResult {
  const { offer, floorLpa: floor, warning, secured } = context;
  const base = {
    policy: profile.policy,
    governingOffer: offer,
    floorLpa: floor,
    warning,
    securedPlacement: secured?.secured ?? null,
    securedMultiplier: secured?.multiplier ?? null,
    securedThresholdLpa: secured?.thresholdLpa ?? null,
  };

  /**
   * The secured-placement bar, checked before the college offer gate.
   *
   * It is the stricter statement about what the student may sit for at all:
   * they have already accepted something, and the college only lets them chase
   * a materially better package. A drive below that bar is closed whatever the
   * offer gate would have said, so it is reported first — naming the secured
   * employer is more actionable than naming an offer that is not the binding
   * constraint.
   */
  if (secured !== null && drive.ctcLpa < secured.thresholdLpa) {
    const { company, ctcLpa, category } = secured.secured;
    return {
      ...base,
      state: "blocked",
      reason:
        `You have secured ${company} at ${ctcLpa} LPA (${CATEGORY_LABEL[category]}), so a ` +
        `further drive must pay at least ${secured.multiplier}× that — ${secured.thresholdLpa} LPA. ` +
        `This one pays ${drive.ctcLpa} LPA.`,
    };
  }

  if (offer === null || floor === null) {
    return { ...base, state: "open", reason: null };
  }

  // The drive that produced the offer is never reported as blocked by itself.
  if (drive.id === offer.driveId) {
    return { ...base, state: "open", reason: null };
  }

  if (profile.policy === "one_offer") {
    return {
      ...base,
      state: "blocked",
      reason: `Your college runs a one-offer policy and you have accepted ${offer.company} at ${offer.ctcLpa} LPA.`,
    };
  }

  // dream_threshold: inclusive comparison, so a drive exactly at the floor is blocked.
  if (drive.ctcLpa <= floor) {
    const because =
      offer.ctcLpa >= (profile.dreamCtcLpa ?? 0)
        ? `your accepted offer is ${offer.ctcLpa} LPA`
        : `the dream cutoff is ${profile.dreamCtcLpa} LPA`;
    return {
      ...base,
      state: "blocked",
      reason: `At ${drive.ctcLpa} LPA this is not above the ${floor} LPA line, and ${because}.`,
    };
  }

  return { ...base, state: "open", reason: null };
}

/** The original signature, resolving its own context. */
export function evaluatePolicy(
  profile: Profile,
  drive: Drive,
  applications: Application[],
  drives: Drive[],
  multipliers: Record<CompanyCategory, number> = SECURED_MULTIPLIERS,
): PolicyResult {
  return evaluatePolicyFor(
    profile,
    drive,
    resolvePolicyContext(profile, applications, drives, multipliers),
  );
}
