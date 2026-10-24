import { questionById } from "./questions";
import type { Proficiency } from "../jd";

/**
 * Grading, and what a result is allowed to claim.
 *
 * Grading happens here and nowhere else. The client is never sent an answer
 * key and its arithmetic is never trusted — a score the browser computed is a
 * score the browser can choose, and a proficiency awarded from it would be a
 * number the student typed rather than earned.
 */

export interface SubmittedAnswer {
  questionId: string;
  /** Index into the options, or null when it was left blank. */
  chosen: number | null;
}

export interface GradedAnswer {
  questionId: string;
  chosen: number | null;
  correctIndex: number;
  correct: boolean;
  /** Released only after submission — this is the actual deliverable. */
  explanation: string;
}

export interface Grade {
  answers: GradedAnswer[];
  total: number;
  attempted: number;
  correct: number;
  /** Whole percent of the total asked, not of the ones attempted. */
  scorePercent: number;
}

/**
 * Mark a submission.
 *
 * Unanswered questions count against the score rather than being excluded.
 * Scoring only the attempted ones would let a student answer the one question
 * they knew, skip the rest and come away with 100%.
 *
 * An unknown question id is ignored rather than throwing: a stale tab
 * submitting against a bank that has since changed should lose that question,
 * not the whole attempt.
 */
export function gradeAttempt(questionIds: string[], submitted: SubmittedAnswer[]): Grade {
  const byId = new Map(submitted.map((a) => [a.questionId, a.chosen]));
  const answers: GradedAnswer[] = [];

  for (const id of questionIds) {
    const question = questionById(id);
    if (!question) continue;
    const chosen = byId.get(id) ?? null;
    answers.push({
      questionId: id,
      chosen,
      correctIndex: question.answer,
      correct: chosen === question.answer,
      explanation: question.explanation,
    });
  }

  const total = answers.length;
  const correct = answers.filter((a) => a.correct).length;
  const attempted = answers.filter((a) => a.chosen !== null).length;

  return {
    answers,
    total,
    attempted,
    correct,
    scorePercent: total === 0 ? 0 : Math.round((correct / total) * 100),
  };
}

export interface ProficiencySuggestion {
  level: Proficiency | null;
  /** Why this was suggested, in words the student reads before accepting. */
  rationale: string;
  /**
   * Whether the result is worth acting on at all.
   *
   * A three-question quiz cannot separate "knows this" from "guessed well",
   * so below the threshold nothing is suggested and the page says so instead
   * of offering a level with a quiet caveat nobody reads.
   */
  confident: boolean;
}

/** Fewer than this and the result is noise, whatever the percentage. */
export const MIN_QUESTIONS_FOR_SUGGESTION = 4;

/**
 * What a score suggests about proficiency — as a suggestion, never a verdict.
 *
 * This is deliberately conservative, and it caps at intermediate. A handful of
 * multiple-choice questions can show that someone has the basics; it cannot
 * show they are advanced, and awarding that from a quiz would put a number on
 * the student's profile that the next interviewer will disagree with.
 *
 * Nothing here writes. The student is shown the suggestion and chooses whether
 * to take it, which is what keeps a self-assessment honestly a self-assessment.
 */
export function suggestProficiency(grade: Grade): ProficiencySuggestion {
  if (grade.total < MIN_QUESTIONS_FOR_SUGGESTION) {
    return {
      level: null,
      confident: false,
      rationale: `Only ${grade.total} question${grade.total === 1 ? "" : "s"} — too few to say anything about your level.`,
    };
  }

  const pct = grade.scorePercent;

  if (pct >= 85) {
    return {
      level: "intermediate",
      confident: true,
      rationale: `${grade.correct} of ${grade.total} correct. That is a solid grasp of the basics — but a short quiz cannot show depth, so this suggests intermediate rather than advanced.`,
    };
  }
  if (pct >= 60) {
    return {
      level: "beginner",
      confident: true,
      rationale: `${grade.correct} of ${grade.total} correct. The foundations are there with gaps in between, which is what beginner describes.`,
    };
  }
  if (pct >= 30) {
    return {
      level: "beginner",
      confident: false,
      rationale: `${grade.correct} of ${grade.total} correct. Somewhere between not started and beginner — read the explanations and try again before changing your rating.`,
    };
  }
  return {
    level: "none",
    confident: true,
    rationale: `${grade.correct} of ${grade.total} correct. Worth treating this as not started and working through the material from the beginning.`,
  };
}

/**
 * What to do next, from the result.
 *
 * Every line is derived from something the attempt actually showed, and says
 * which. "Revise X" because X was answered wrongly is advice; "keep it up" is
 * decoration.
 */
export function recommendations(grade: Grade, skillLabel: string): string[] {
  const out: string[] = [];
  const wrong = grade.answers.filter((a) => !a.correct && a.chosen !== null).length;
  const skipped = grade.total - grade.attempted;

  if (skipped > 0) {
    out.push(
      `You left ${skipped} of ${grade.total} unanswered. Those counted against the score, so the figure above is lower than what you know — worth another attempt once you have read the explanations.`,
    );
  }
  if (wrong > 0) {
    out.push(
      `${wrong} answer${wrong === 1 ? " was" : "s were"} wrong. The explanation under each one says why; reading those is worth more than the mark.`,
    );
  }
  if (grade.scorePercent >= 85 && skipped === 0) {
    out.push(
      `A strong result on ${skillLabel}. Add a task for a harder topic rather than repeating this one.`,
    );
  } else if (grade.scorePercent < 60) {
    out.push(
      `Schedule a study session on ${skillLabel} before attempting this again — the planner can add one.`,
    );
  }
  return out;
}
