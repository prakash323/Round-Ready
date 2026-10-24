import { Types } from "mongoose";
import { Application } from "../models/Application";
import { BatchPolicy } from "../models/BatchPolicy";
import { Drive } from "../models/Drive";
import { Profile } from "../models/Profile";
import type { Role } from "../models/User";
import type {
  Application as DomainApplication,
  BoardInput,
  CompanyCategory,
  Drive as DomainDrive,
  Profile as DomainProfile,
} from "./engine";

/**
 * The boundary between Mongoose documents and the engine's domain types.
 *
 * The engine must not know that ids are ObjectIds, that drives are scoped to a
 * batch, or that a deleted drive is only flagged rather than removed. It takes
 * plain objects with string ids. Keeping the mapping in one place is what lets
 * the engine stay pure and therefore testable without a database.
 */

export interface SessionUser {
  userId: string;
  email: string;
  name: string;
  batchId: string;
  /**
   * What the token says the account is — good enough to decide which buttons
   * to render, never good enough to authorise a write. `requireOfficer` reads
   * the role back from the database instead, so a role revoked today does not
   * stay effective until a seven-day token expires.
   */
  role: Role;
}

export const EMPTY_PROFILE: DomainProfile = {
  cgpa: null,
  activeBacklogs: null,
  branch: "",
  tenthPercent: null,
  twelfthPercent: null,
  gapYears: null,
  policy: "none",
  dreamCtcLpa: null,
  securedPlacement: null,
};

/**
 * The filter every read of a shared drive must use.
 *
 * A soft-deleted drive that leaks back onto one person's board is the same
 * class of bug as the one soft-deleting was introduced to fix, so the filter is
 * a named function rather than an object literal copied to six call sites
 * (AUDIT.md D1).
 */
export function liveDriveFilter(batchId: string): { batchId: string; deletedAt: null } {
  return { batchId, deletedAt: null };
}

/** Normalise a college name and graduating year into a shared batch key. */
export function batchKey(college: string, gradYear: number): string {
  const slug = college
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug}:${gradYear}`;
}

// --- Document shapes as actually read (lean) --------------------------------

interface LeanProfile {
  cgpa: number | null;
  activeBacklogs: number | null;
  branch: string;
  tenthPercent: number | null;
  twelfthPercent: number | null;
  gapYears: number | null;
  policy: DomainProfile["policy"];
  dreamCtcLpa: number | null;
  hasSecuredPlacement?: boolean | null;
  securedCompany?: string | null;
  securedCtcLpa?: number | null;
  securedCategory?: "service_based" | "product_based" | null;
}

interface LeanRound {
  _id: Types.ObjectId;
  name: string;
  type: DomainDrive["rounds"][number]["type"];
  startAt: Date;
  endAt: Date;
}

interface LeanDrive {
  _id: Types.ObjectId;
  company: string;
  role: string;
  ctcLpa: number;
  location: string | null;
  applicationDeadline: Date | null;
  criteria: DomainDrive["criteria"];
  rounds: LeanRound[];
  createdBy?: Types.ObjectId | null;
}

interface LeanApplication {
  _id: Types.ObjectId;
  driveId: Types.ObjectId;
  status: DomainApplication["status"];
  currentRound: string | null;
  offerCtcLpa: number | null;
  history: { status: DomainApplication["status"]; at: Date }[];
}

// --- Mapping ---------------------------------------------------------------

export function toDomainProfile(doc: LeanProfile | null): DomainProfile {
  if (!doc) return EMPTY_PROFILE;
  return {
    cgpa: doc.cgpa ?? null,
    activeBacklogs: doc.activeBacklogs ?? null,
    branch: doc.branch ?? "",
    tenthPercent: doc.tenthPercent ?? null,
    twelfthPercent: doc.twelfthPercent ?? null,
    gapYears: doc.gapYears ?? null,
    policy: doc.policy ?? "none",
    dreamCtcLpa: doc.dreamCtcLpa ?? null,
    // Collapsed into one object or null, so the engine never has to reason
    // about a partially filled record. All three parts or nothing.
    securedPlacement:
      doc.hasSecuredPlacement &&
      doc.securedCompany &&
      doc.securedCtcLpa !== null &&
      doc.securedCtcLpa !== undefined &&
      doc.securedCategory
        ? {
            company: doc.securedCompany,
            ctcLpa: doc.securedCtcLpa,
            category: doc.securedCategory,
          }
        : null,
  };
}

export function toDomainDrive(doc: LeanDrive): DomainDrive {
  return {
    id: doc._id.toHexString(),
    company: doc.company,
    role: doc.role,
    ctcLpa: doc.ctcLpa,
    location: doc.location ?? null,
    applicationDeadline: doc.applicationDeadline ?? null,
    criteria: {
      cgpaMin: doc.criteria?.cgpaMin ?? null,
      maxActiveBacklogs: doc.criteria?.maxActiveBacklogs ?? null,
      allowedBranches: doc.criteria?.allowedBranches ?? [],
      tenthPercentMin: doc.criteria?.tenthPercentMin ?? null,
      twelfthPercentMin: doc.criteria?.twelfthPercentMin ?? null,
      gapYearsAllowed: doc.criteria?.gapYearsAllowed ?? null,
    },
    rounds: (doc.rounds ?? []).map((r) => ({
      // The subdocument's own `_id`. This is what the calendar UID and the
      // clash set key on, so two rounds sharing a name stay distinct (D3).
      id: r._id.toHexString(),
      name: r.name,
      type: r.type,
      startAt: new Date(r.startAt),
      endAt: new Date(r.endAt),
    })),
  };
}

export function toDomainApplication(doc: LeanApplication): DomainApplication {
  return {
    id: doc._id.toHexString(),
    driveId: doc.driveId.toHexString(),
    status: doc.status,
    currentRound: doc.currentRound ?? null,
    offerCtcLpa: doc.offerCtcLpa ?? null,
    history: (doc.history ?? []).map((h) => ({ status: h.status, at: new Date(h.at) })),
  };
}

// --- Loading ---------------------------------------------------------------

/**
 * The batch's secured-placement multipliers.
 *
 * Returns the standard numbers when the officer has never set any, so no
 * caller ever branches on a missing policy row and an unconfigured batch is
 * gated exactly like a configured one that kept the defaults.
 */
export const DEFAULT_MULTIPLIERS: Record<CompanyCategory, number> = {
  service_based: 1.5,
  product_based: 2,
};

export async function multipliersFor(batchId: string): Promise<Record<CompanyCategory, number>> {
  const doc = await BatchPolicy.findOne({ batchId }).lean<{
    serviceMultiplier: number;
    productMultiplier: number;
  } | null>();
  if (!doc) return DEFAULT_MULTIPLIERS;
  return { service_based: doc.serviceMultiplier, product_based: doc.productMultiplier };
}

/** Everything the engine needs for one student, in one round trip each. */
export async function loadBoardInput(session: SessionUser): Promise<BoardInput> {
  const userId = new Types.ObjectId(session.userId);

  const [profileDoc, driveDocs, appDocs, multipliers] = await Promise.all([
    Profile.findOne({ userId }).lean<LeanProfile | null>(),
    Drive.find(liveDriveFilter(session.batchId)).lean<LeanDrive[]>(),
    Application.find({ userId }).lean<LeanApplication[]>(),
    multipliersFor(session.batchId),
  ]);

  return {
    profile: toDomainProfile(profileDoc),
    drives: driveDocs.map(toDomainDrive),
    applications: appDocs.map(toDomainApplication),
    multipliers,
  };
}

/**
 * Who created each drive in the batch, for display.
 *
 * Kept out of the engine's `Drive` type on purpose: it is an author label, not
 * an input to any verdict, and widening the domain type for it would mean the
 * engine knew about users.
 */
export async function loadDriveAuthors(batchId: string): Promise<Map<string, string>> {
  const docs = await Drive.find(liveDriveFilter(batchId))
    .populate<{ createdBy: { _id: Types.ObjectId; name: string } | null }>("createdBy", "name")
    .select("createdBy")
    .lean();

  const out = new Map<string, string>();
  for (const doc of docs) {
    const author = doc.createdBy;
    if (author && typeof author.name === "string") {
      out.set(String(doc._id), author.name);
    }
  }
  return out;
}

/** True when the student has entered enough to get real verdicts. */
export function profileIsUsable(profile: DomainProfile): boolean {
  return profile.branch.trim() !== "" && profile.cgpa !== null;
}
