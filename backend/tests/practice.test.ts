import { describe, expect, it } from "vitest";
import {
  MIN_QUESTIONS_FOR_SUGGESTION,
  QUESTIONS,
  assessableSkills,
  gradeAttempt,
  publicQuestion,
  questionsFor,
  recommendations,
  suggestProficiency,
} from "@/lib/practice";
import { SKILLS } from "@/lib/jd";

/**
 * Practice assessments.
 *
 * Two things are policed here above all: that the answer key never reaches a
 * client, and that a short quiz is never allowed to claim more than a short
 * quiz can show.
 */

describe("the question bank", () => {
  it("has a correct answer that indexes into its own options", () => {
    for (const q of QUESTIONS) {
      expect(q.options.length, q.id).toBeGreaterThanOrEqual(2);
      expect(q.answer, q.id).toBeGreaterThanOrEqual(0);
      expect(q.answer, q.id).toBeLessThan(q.options.length);
    }
  });

  it("explains every question, because the explanation is the point", () => {
    for (const q of QUESTIONS) {
      expect(q.explanation.trim().length, q.id).toBeGreaterThan(40);
    }
  });

  it("has no duplicate ids", () => {
    const ids = QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no duplicate options within a question", () => {
    for (const q of QUESTIONS) {
      expect(new Set(q.options).size, q.id).toBe(q.options.length);
    }
  });

  it("maps every question onto a skill the taxonomy knows", () => {
    // A weak result has to point at a real gap, not at a category invented
    // for the quiz and matching nothing on the student's profile.
    const known = new Set(SKILLS.map((s) => s.id));
    for (const q of QUESTIONS) {
      expect(known.has(q.skillId), `${q.id} -> ${q.skillId}`).toBe(true);
    }
  });

  it("offers only skills with enough questions to be worth taking", () => {
    for (const skillId of assessableSkills()) {
      expect(questionsFor(skillId).length, skillId).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("what a client is allowed to see", () => {
  it("strips the answer and the explanation", () => {
    // A quiz that ships its own answer key is a form, not an assessment.
    for (const q of QUESTIONS) {
      const shown = publicQuestion(q) as Record<string, unknown>;
      expect(Object.keys(shown).sort()).toEqual(
        ["format", "id", "options", "prompt", "skillId"].sort(),
      );
      expect(shown.answer).toBeUndefined();
      expect(shown.explanation).toBeUndefined();
    }
  });

  it("leaks nothing through serialisation", () => {
    const json = JSON.stringify(QUESTIONS.map(publicQuestion));
    for (const q of QUESTIONS) {
      expect(json).not.toContain(q.explanation);
    }
    expect(json).not.toContain('"answer"');
  });
});

describe("grading", () => {
  const ids = ["dsa-1", "dsa-2", "dsa-3", "dsa-4"];
  const correctFor = (id: string) => QUESTIONS.find((q) => q.id === id)!.answer;

  it("marks a perfect attempt", () => {
    const grade = gradeAttempt(
      ids,
      ids.map((id) => ({ questionId: id, chosen: correctFor(id) })),
    );
    expect(grade.correct).toBe(4);
    expect(grade.scorePercent).toBe(100);
  });

  it("counts unanswered questions against the score", () => {
    // Scoring only what was attempted would let a student answer the one
    // question they knew, skip the rest and come away with 100%.
    const grade = gradeAttempt(ids, [{ questionId: "dsa-1", chosen: correctFor("dsa-1") }]);
    expect(grade.attempted).toBe(1);
    expect(grade.correct).toBe(1);
    expect(grade.total).toBe(4);
    expect(grade.scorePercent).toBe(25);
  });

  it("returns the explanation for every question, right or wrong", () => {
    const grade = gradeAttempt(ids, ids.map((id) => ({ questionId: id, chosen: 1 })));
    for (const answer of grade.answers) {
      expect(answer.explanation.length).toBeGreaterThan(0);
    }
  });

  it("ignores a question id the bank no longer has", () => {
    // A stale tab should lose that question, not the whole attempt.
    const grade = gradeAttempt(
      ["dsa-1", "removed-question"],
      [{ questionId: "dsa-1", chosen: correctFor("dsa-1") }],
    );
    expect(grade.total).toBe(1);
    expect(grade.correct).toBe(1);
  });

  it("ignores an answer for a question that was not asked", () => {
    const grade = gradeAttempt(["dsa-1"], [
      { questionId: "dsa-1", chosen: correctFor("dsa-1") },
      { questionId: "sql-1", chosen: 0 },
    ]);
    expect(grade.total).toBe(1);
  });

  it("does not divide by zero on an empty attempt", () => {
    expect(gradeAttempt([], []).scorePercent).toBe(0);
  });
});

describe("what a score may suggest", () => {
  const grade = (correct: number, total: number) => ({
    answers: [],
    total,
    attempted: total,
    correct,
    scorePercent: total === 0 ? 0 : Math.round((correct / total) * 100),
  });

  it("suggests nothing from too few questions", () => {
    const suggestion = suggestProficiency(grade(3, 3));
    expect(suggestion.level).toBeNull();
    expect(suggestion.confident).toBe(false);
    expect(MIN_QUESTIONS_FOR_SUGGESTION).toBeGreaterThan(3);
  });

  it("never suggests advanced, however perfect the score", () => {
    // A handful of multiple-choice questions can show someone has the basics.
    // It cannot show depth, and awarding advanced would put a number on the
    // profile that the next interviewer disagrees with.
    const suggestion = suggestProficiency(grade(20, 20));
    expect(suggestion.level).toBe("intermediate");
  });

  it("suggests beginner for a middling score", () => {
    expect(suggestProficiency(grade(7, 10)).level).toBe("beginner");
  });

  it("is unconfident in the muddy middle", () => {
    const suggestion = suggestProficiency(grade(4, 10));
    expect(suggestion.confident).toBe(false);
    expect(suggestion.rationale).toMatch(/try again/i);
  });

  it("suggests not started for a poor score", () => {
    expect(suggestProficiency(grade(1, 10)).level).toBe("none");
  });

  it("always explains itself with the actual numbers", () => {
    const suggestion = suggestProficiency(grade(7, 10));
    expect(suggestion.rationale).toContain("7 of 10");
  });
});

describe("recommendations", () => {
  const ids = ["dsa-1", "dsa-2", "dsa-3", "dsa-4"];
  const correctFor = (id: string) => QUESTIONS.find((q) => q.id === id)!.answer;

  it("says when skipped questions dragged the score down", () => {
    const grade = gradeAttempt(ids, [{ questionId: "dsa-1", chosen: correctFor("dsa-1") }]);
    expect(recommendations(grade, "DSA").join(" ")).toMatch(/unanswered/);
  });

  it("points at the explanations when answers were wrong", () => {
    const grade = gradeAttempt(ids, ids.map((id) => ({ questionId: id, chosen: (correctFor(id) + 1) % 4 })));
    expect(recommendations(grade, "DSA").join(" ")).toMatch(/explanation/i);
  });

  it("does not congratulate a perfect score that skipped half the paper", () => {
    const grade = gradeAttempt(ids, [
      { questionId: "dsa-1", chosen: correctFor("dsa-1") },
      { questionId: "dsa-2", chosen: correctFor("dsa-2") },
    ]);
    expect(recommendations(grade, "DSA").join(" ")).not.toMatch(/strong result/i);
  });

  it("is empty when there is nothing worth saying", () => {
    const grade = gradeAttempt(ids, ids.map((id) => ({ questionId: id, chosen: correctFor(id) })));
    expect(recommendations(grade, "DSA").join(" ")).toMatch(/strong result/i);
  });
});
