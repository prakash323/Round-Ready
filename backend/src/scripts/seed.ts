import { Types } from "mongoose";
import { connectDb, disconnectDb } from "../config/db";
import { Application } from "../models/Application";
import { Drive } from "../models/Drive";
import { Profile } from "../models/Profile";
import { User } from "../models/User";
import {
  DEMO_APPLICATIONS,
  DEMO_BATCH_COLLEGE,
  DEMO_BATCH_GRAD_YEAR,
  DEMO_BATCH_ID,
  DEMO_DRIVES,
  DEMO_NAME,
  DEMO_PROFILE,
  fullCriteria,
  istFrom,
} from "../lib/demo-data";
import { hashPassword } from "../lib/session";

/**
 * Seed the demo batch.
 *
 * The data lives in `src/lib/demo-data.ts` rather than here, because the claims
 * it makes — two clashes, one touching pair that must NOT be flagged, one
 * undecidable verdict, a 0.08-CGPA near miss — are asserted against the real
 * engine in `tests/demo-data.test.ts`. This script is only the part that writes
 * them to MongoDB.
 *
 * Run with: npm run seed
 */

const EMAIL = process.env.SEED_EMAIL ?? "demo@roundready.app";
const PASSWORD = process.env.SEED_PASSWORD ?? "placement2026";
const OFFICER_EMAIL = process.env.SEED_OFFICER_EMAIL ?? "cdc@roundready.app";
const OFFICER_PASSWORD = process.env.SEED_OFFICER_PASSWORD ?? PASSWORD;

/** Upsert one account by email, keeping its id stable across re-seeds. */
async function seedUser(
  email: string,
  name: string,
  password: string,
  role: "student" | "cdc_officer",
  now: Date,
): Promise<Types.ObjectId> {
  const existing = await User.findOne({ email }).lean();
  const _id = existing?._id ?? new Types.ObjectId();
  await User.updateOne(
    { _id },
    {
      $set: {
        email,
        name,
        passwordHash: await hashPassword(password),
        college: DEMO_BATCH_COLLEGE,
        gradYear: DEMO_BATCH_GRAD_YEAR,
        batchId: DEMO_BATCH_ID,
        role,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );
  return _id;
}

async function main(): Promise<void> {
  const now = new Date();
  await connectDb();

  /**
   * Two accounts, because the app now has two kinds of person in it.
   *
   * The officer is seeded directly rather than through the registration code:
   * this script already has database access, so making it ask for a secret it
   * could simply write would be theatre. The code gates the *public* route,
   * which is the one an attacker can reach.
   */
  const userId = await seedUser(EMAIL, DEMO_NAME, PASSWORD, "student", now);
  const officerId = await seedUser(OFFICER_EMAIL, "CDC Office", OFFICER_PASSWORD, "cdc_officer", now);

  await Profile.updateOne(
    { userId },
    { $set: { ...DEMO_PROFILE, updatedAt: now }, $setOnInsert: { userId } },
    { upsert: true },
  );

  // --- Replace this batch's drives, and any applications pointing at them ---
  // A hard delete is right here and nowhere else: this is the seed resetting
  // its own fixture, not a student removing a drive their classmates rely on.
  const old = await Drive.find({ batchId: DEMO_BATCH_ID }).select("_id").lean();
  if (old.length > 0) {
    await Application.deleteMany({ driveId: { $in: old.map((d) => d._id) } });
    await Drive.deleteMany({ batchId: DEMO_BATCH_ID });
  }

  const idBySlug = new Map<string, Types.ObjectId>();
  const driveDocs = DEMO_DRIVES.map((drive) => {
    const _id = new Types.ObjectId();
    idBySlug.set(drive.slug, _id);
    return {
      _id,
      batchId: DEMO_BATCH_ID,
      company: drive.company,
      role: drive.role,
      ctcLpa: drive.ctcLpa,
      location: drive.location,
      applicationDeadline: istFrom(now, drive.deadlineDays, 23, 59),
      criteria: fullCriteria(drive.criteria),
      // No `_id` is supplied per round: Mongoose mints one for each
      // subdocument, which is what the calendar UID and clash set key on (D3).
      rounds: drive.rounds.map(([name, type, day, from, to]) => ({
        name,
        type,
        startAt: istFrom(now, day, from),
        endAt: istFrom(now, day, to),
      })),
      // Drives are published by the CDC office, which is now the only role
      // that can create one — so the demo data says so too.
      createdBy: officerId,
      createdAt: now,
      deletedAt: null,
    };
  });
  await Drive.insertMany(driveDocs);

  const appDocs = Object.entries(DEMO_APPLICATIONS).map(([slug, state]) => ({
    userId,
    driveId: idBySlug.get(slug)!,
    status: state.status,
    currentRound: state.currentRound ?? null,
    offerCtcLpa: null,
    history: [{ status: state.status, at: new Date(now.getTime() - 3 * 86_400_000) }],
    updatedAt: now,
  }));
  await Application.insertMany(appDocs);

  // --- Report --------------------------------------------------------------
  console.log(`\nSeeded batch ${DEMO_BATCH_ID}`);
  console.log(`  ${driveDocs.length} drives, ${appDocs.length} applications\n`);
  console.log(`Sign in as the student:\n  ${EMAIL}\n  ${PASSWORD}\n`);
  console.log(
    `Sign in as the CDC officer (can add, edit and withdraw drives, and set\n` +
      `the batch's higher-offer multipliers):\n  ${OFFICER_EMAIL}\n  ${OFFICER_PASSWORD}\n`,
  );
  console.log("Profile: CGPA 7.42 · 0 backlogs · CSE · 10th 88.6% · 12th 82.4%");
  console.log("         gap years blank · dream-threshold policy at 12 LPA\n");
  console.log("What the board should show:");
  for (const drive of DEMO_DRIVES) {
    console.log(
      `  ${drive.company.padEnd(22)}${String(drive.ctcLpa).padStart(5)} LPA  ${drive.note}`,
    );
  }
  console.log("");

  await disconnectDb();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
