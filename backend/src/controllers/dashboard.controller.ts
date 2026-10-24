import { Types } from "mongoose";
import { AssessmentAttempt } from "../models/AssessmentAttempt";
import { JobDescription } from "../models/JobDescription";
import { Note } from "../models/Note";
import { SkillProfile } from "../models/SkillProfile";
import { StudyTask } from "../models/StudyTask";
import { agenda, buildBoard } from "../lib/engine";
import { CRITICAL_GAP_STEPS, analyseGaps } from "../lib/jd";
import { priorityItems } from "../lib/dashboard";
import { dayKeyOf, studyStreak } from "../lib/planner";
import { loadBoardInput, profileIsUsable } from "../lib/repo";
import { sessionOf } from "../middleware/requireAuth";
import { asyncHandler } from "../middleware/errorHandler";
import type { ExtractedSkill, StudentSkill } from "../lib/jd";

/**
 * Everything the overview page shows, assembled in one request.
 *
 * One endpoint rather than six parallel calls from the browser: the priority
 * ranking needs the board, the tasks, the gaps and the assessments together,
 * and deciding what matters most is a judgement that belongs on the server
 * where it can be tested.
 *
 * Nothing here is stored. The board is rebuilt, the gaps recomputed and the
 * ranking derived on every load, exactly as everywhere else.
 */
export const getDashboard = asyncHandler(async (req, res) => {
  const session = sessionOf(req);
  const userId = new Types.ObjectId(session.userId);
  const now = new Date();
  const today = dayKeyOf(now);

  const input = await loadBoardInput(session);
  const board = buildBoard(input, now);

  const [tasks, overdueTaskCount, allCompleted, notes, attempts, savedJds, skillProfile] =
    await Promise.all([
      StudyTask.find({ userId, scheduledOn: today })
        .sort({ startTime: 1, createdAt: 1 })
        .lean(),
      StudyTask.countDocuments({ userId, scheduledOn: { $lt: today }, completedAt: null }),
      StudyTask.find({ userId, completedAt: { $ne: null } })
        .select("scheduledOn durationMinutes completedAt")
        .lean(),
      Note.find({ userId })
        .sort({ updatedAt: -1 })
        .select("title updatedAt tags")
        .limit(4)
        .lean(),
      AssessmentAttempt.find({ userId, submittedAt: { $ne: null } })
        .sort({ submittedAt: -1 })
        .select("skillId skillLabel scorePercent correct total submittedAt")
        .limit(10)
        .lean(),
      // Only the most recent analysis feeds the gap suggestions: ranking a
      // student's whole history of saved roles would bury today's.
      JobDescription.find({ userId }).sort({ updatedAt: -1 }).select("skills").limit(1).lean(),
      SkillProfile.findOne({ userId }).lean(),
    ]);

  // Critical gaps, from the most recently touched analysis.
  const criticalGaps: { skillId: string; label: string; jobDescriptionId: string }[] = [];
  if (savedJds.length > 0) {
    const jd = savedJds[0];
    const gaps = analyseGaps(
      jd.skills as unknown as ExtractedSkill[],
      (skillProfile?.skills ?? []) as unknown as StudentSkill[],
    );
    for (const gap of gaps.gaps) {
      if (
        gap.status !== "unknown" &&
        gap.skill.importance === "required" &&
        gap.distance >= CRITICAL_GAP_STEPS
      ) {
        criticalGaps.push({
          skillId: gap.skill.id,
          label: gap.skill.label,
          jobDescriptionId: String(jd._id),
        });
      }
    }
  }

  // The worst recent score per topic, so one bad day does not fill the list
  // with the same topic three times.
  const worstBySkill = new Map<string, { skillId: string; label: string; scorePercent: number }>();
  for (const attempt of attempts) {
    const current = worstBySkill.get(attempt.skillId);
    if (!current || attempt.scorePercent < current.scorePercent) {
      worstBySkill.set(attempt.skillId, {
        skillId: attempt.skillId,
        label: attempt.skillLabel,
        scorePercent: attempt.scorePercent,
      });
    }
  }
  const weakAssessments = [...worstBySkill.values()]
    .filter((a) => a.scorePercent < 60)
    .sort((a, b) => a.scorePercent - b.scorePercent);

  // Which drives the student has actually applied to, so a deadline they have
  // already dealt with is not nagged about.
  const appliedDriveIds = new Set(
    input.applications
      .filter((a) => a.status !== "interested" && a.status !== "withdrawn")
      .map((a) => a.driveId),
  );

  const priorities = priorityItems({
    now,
    profileIsUsable: profileIsUsable(input.profile),
    openDrives: [...board.actionable, ...board.unknown].map((view) => ({
      id: view.drive.id,
      company: view.drive.company,
      role: view.drive.role,
      applicationDeadline: view.drive.applicationDeadline,
      hasApplied: appliedDriveIds.has(view.drive.id),
    })),
    todayTasks: tasks.map((t) => ({
      id: String(t._id),
      title: t.title,
      done: t.completedAt !== null && t.completedAt !== undefined,
      durationMinutes: t.durationMinutes,
    })),
    overdueTaskCount,
    criticalGaps,
    weakAssessments,
  });

  res.json({
    stats: board.stats,
    profileIsUsable: profileIsUsable(input.profile),
    priorities,
    /** Placement events for the next week — rounds and deadlines. */
    agenda: agenda(board, 7, now),
    today: {
      day: today,
      tasks,
      doneCount: tasks.filter((t) => t.completedAt).length,
      plannedMinutes: tasks.reduce((sum, t) => sum + t.durationMinutes, 0),
    },
    streak: studyStreak(
      allCompleted.map((t) => ({
        id: String(t._id),
        scheduledOn: t.scheduledOn,
        durationMinutes: t.durationMinutes,
        completedAt: t.completedAt ?? null,
      })),
      now,
    ),
    recent: {
      notes: notes.map((n) => ({
        _id: String(n._id),
        title: n.title,
        tags: n.tags,
        updatedAt: n.updatedAt,
      })),
      attempts: attempts.slice(0, 3).map((a) => ({
        _id: String(a._id),
        skillLabel: a.skillLabel,
        scorePercent: a.scorePercent,
        correct: a.correct,
        total: a.total,
        submittedAt: a.submittedAt,
      })),
    },
  });
});
