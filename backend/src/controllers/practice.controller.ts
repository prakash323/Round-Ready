import { Types } from "mongoose";
import { AssessmentAttempt } from "../models/AssessmentAttempt";
import { SKILLS } from "../lib/jd";
import {
  assessableSkills,
  gradeAttempt,
  publicQuestion,
  questionsFor,
  recommendations,
  suggestProficiency,
} from "../lib/practice";
import { sessionOf } from "../middleware/requireAuth";
import { HttpError, asyncHandler, notFound } from "../middleware/errorHandler";
import type { StartAssessmentInput, SubmitAssessmentInput } from "../lib/schemas";

/**
 * Practice assessments.
 *
 * The one rule that shapes every handler: the answer key stays on the server.
 * Questions go out through `publicQuestion`, which drops the answer and the
 * explanation; the explanations come back only once the attempt is submitted,
 * which is also the moment they become useful.
 */

function objectId(value: string): Types.ObjectId | null {
  return Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : null;
}

function labelFor(skillId: string): string {
  return SKILLS.find((s) => s.id === skillId)?.label ?? skillId;
}

/** The topics with enough questions to be worth offering. */
export const listTopics = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const userId = new Types.ObjectId(session.userId);

  const topics = assessableSkills();
  // The student's best previous score per topic, so the list can show
  // progress rather than presenting every topic as untouched.
  const attempts = await AssessmentAttempt.find({ userId, submittedAt: { $ne: null } })
    .select("skillId scorePercent submittedAt")
    .lean();

  const best = new Map<string, { scorePercent: number; submittedAt: Date | null }>();
  for (const attempt of attempts) {
    const current = best.get(attempt.skillId);
    if (!current || attempt.scorePercent > current.scorePercent) {
      best.set(attempt.skillId, {
        scorePercent: attempt.scorePercent,
        submittedAt: attempt.submittedAt ?? null,
      });
    }
  }

  res.json({
    topics: topics.map((skillId) => ({
      skillId,
      label: labelFor(skillId),
      questionCount: questionsFor(skillId).length,
      bestScorePercent: best.get(skillId)?.scorePercent ?? null,
      lastAttemptAt: best.get(skillId)?.submittedAt ?? null,
    })),
  });
});

/**
 * Start an attempt.
 *
 * The questions asked are recorded now, so grading later cannot be steered by
 * a submission that names a different set.
 */
export const startAttempt = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const { skillId } = req.body as StartAssessmentInput;

  const questions = questionsFor(skillId);
  if (questions.length === 0) {
    throw new HttpError(404, "There are no practice questions for that topic yet", {
      skillId: "No questions here",
    });
  }

  const attempt = await AssessmentAttempt.create({
    userId: new Types.ObjectId(session.userId),
    skillId,
    skillLabel: labelFor(skillId),
    questionIds: questions.map((q) => q.id),
    startedAt: new Date(),
  });

  res.status(201).json({
    attemptId: attempt._id.toHexString(),
    skillId,
    label: labelFor(skillId),
    // No answers, no explanations.
    questions: questions.map(publicQuestion),
  });
});

/**
 * Submit and mark.
 *
 * Grading uses the ids stored on the attempt, not the ids in the request.
 * Explanations are released here, which is the first moment they help rather
 * than give the game away.
 */
export const submitAttempt = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const id = objectId(req.params.id);
  if (!id) throw notFound("No such attempt");

  const attempt = await AssessmentAttempt.findOne({
    _id: id,
    userId: new Types.ObjectId(session.userId),
  })
    .select("questionIds skillId skillLabel startedAt submittedAt")
    .lean();
  if (!attempt) throw notFound("No such attempt");

  if (attempt.submittedAt !== null) {
    // Re-submitting would let a student grind the same paper until the score
    // suited them, and the history is meant to be a record.
    throw new HttpError(409, "That attempt has already been submitted");
  }

  const { answers } = req.body as SubmitAssessmentInput;
  const grade = gradeAttempt(attempt.questionIds, answers);

  const submittedAt = new Date();
  const durationSeconds = Math.max(
    0,
    Math.round((submittedAt.getTime() - attempt.startedAt.getTime()) / 1000),
  );

  /**
   * The write carries `submittedAt: null` in its own filter, so two
   * submissions racing each other cannot both succeed — the second matches
   * nothing. The check above gives the clearer error; this is what actually
   * enforces it.
   */
  const saved = await AssessmentAttempt.findOneAndUpdate(
    { _id: id, userId: new Types.ObjectId(session.userId), submittedAt: null },
    {
      $set: {
        answers: grade.answers.map((a) => ({
          questionId: a.questionId,
          chosen: a.chosen,
          correct: a.correct,
        })),
        total: grade.total,
        attempted: grade.attempted,
        correct: grade.correct,
        scorePercent: grade.scorePercent,
        submittedAt,
        durationSeconds,
      },
    },
    { new: true },
  ).lean();

  if (!saved) throw new HttpError(409, "That attempt has already been submitted");


  res.json({
    attemptId: String(saved._id),
    skillId: saved.skillId,
    label: saved.skillLabel,
    grade,
    /**
     * A suggestion the student may take or ignore. Nothing is written to
     * their skill profile here — a level they did not choose is a measurement
     * they did not agree to.
     */
    suggestion: suggestProficiency(grade),
    recommendations: recommendations(grade, saved.skillLabel),
    durationSeconds,
  });
});

/** Past attempts, newest first. */
export const listAttempts = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const docs = await AssessmentAttempt.find({
    userId: new Types.ObjectId(session.userId),
    submittedAt: { $ne: null },
  })
    .sort({ submittedAt: -1 })
    .select("skillId skillLabel total attempted correct scorePercent submittedAt durationSeconds")
    .limit(100)
    .lean();

  res.json({ attempts: docs });
});
