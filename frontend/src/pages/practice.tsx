import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, CircleHelp, Loader2, Target, X } from "lucide-react";
import { get, send } from "../lib/api";
import { Empty, ErrorNote, Loading, PageHeader, Panel, ProgressBar } from "../components/ui";
import { usePageMeta } from "../lib/use-page-meta";
import type { AttemptResult, AttemptRow, PracticeTopic, StartedAttempt } from "../lib/types";

/**
 * Practice and assessments.
 *
 * Questions arrive without their answers — the key never leaves the server —
 * and explanations come back only on submission, which is the first moment
 * they help rather than give the game away.
 *
 * The result page leads with the explanations rather than the mark. A student
 * told only "4 of 8" has learned nothing; the reason each answer was wrong is
 * the actual deliverable, and the score is just how we decide what to suggest
 * next.
 */

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

type View = "topics" | "taking" | "result";

export function PracticePage() {
  usePageMeta("Practice", "Check what you actually know, and read why.");

  const [topics, setTopics] = useState<PracticeTopic[] | null>(null);
  const [history, setHistory] = useState<AttemptRow[]>([]);
  const [view, setView] = useState<View>("topics");
  const [attempt, setAttempt] = useState<StartedAttempt | null>(null);
  const [chosen, setChosen] = useState<Record<string, number>>({});
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [t, h] = await Promise.all([
      get<{ topics: PracticeTopic[] }>("/api/practice/topics"),
      get<{ attempts: AttemptRow[] }>("/api/practice/attempts"),
    ]);
    if (t.failure || !t.data) {
      setFailure(t.failure?.message ?? "Practice topics could not be loaded.");
      return;
    }
    setTopics(t.data.topics);
    setHistory(h.data?.attempts ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function start(skillId: string) {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    const { data, failure: f } = await send<StartedAttempt>("/api/practice/attempts", "POST", {
      skillId,
    });
    setBusy(false);
    if (f || !data) {
      setFailure(f?.message ?? "That assessment could not be started.");
      return;
    }
    setAttempt(data);
    setChosen({});
    setResult(null);
    setView("taking");
  }

  async function submit() {
    if (!attempt || busy) return;
    setBusy(true);
    const { data, failure: f } = await send<AttemptResult>(
      `/api/practice/attempts/${attempt.attemptId}/submit`,
      "POST",
      {
        answers: attempt.questions.map((q) => ({
          questionId: q.id,
          chosen: chosen[q.id] ?? null,
        })),
      },
    );
    setBusy(false);
    if (f || !data) {
      setFailure(f?.message ?? "That attempt could not be submitted.");
      return;
    }
    setResult(data);
    setView("result");
    await load();
  }

  if (failure && topics === null) return <ErrorNote message={failure} />;
  if (topics === null) return <Loading label="Loading practice" rows={3} />;

  // --- Taking an assessment ---------------------------------------------
  if (view === "taking" && attempt) {
    const answered = attempt.questions.filter((q) => chosen[q.id] !== undefined).length;
    return (
      <div className="space-y-5">
        <PageHeader
          eyebrow={attempt.label}
          title="Practice assessment"
          description={`${attempt.questions.length} questions. There is no timer — read them properly.`}
          actions={
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setView("topics");
                setAttempt(null);
              }}
            >
              Leave
            </button>
          }
        />

        <Panel>
          <div className="flex items-center justify-between gap-3 text-xs text-muted">
            <span>
              {answered} of {attempt.questions.length} answered
            </span>
            {answered < attempt.questions.length && (
              <span className="text-faint">Unanswered questions count as wrong</span>
            )}
          </div>
          <div className="mt-2">
            <ProgressBar
              value={answered}
              max={attempt.questions.length}
              label={`${answered} of ${attempt.questions.length} answered`}
            />
          </div>
        </Panel>

        <ol className="space-y-4">
          {attempt.questions.map((question, index) => (
            <li key={question.id}>
              <Panel>
                <fieldset>
                  <legend className="text-sm font-medium leading-relaxed">
                    <span className="mr-1.5 text-faint">{index + 1}.</span>
                    {question.prompt}
                  </legend>
                  <div className="mt-3 space-y-1.5">
                    {question.options.map((option, optionIndex) => {
                      const id = `${question.id}-${optionIndex}`;
                      const selected = chosen[question.id] === optionIndex;
                      return (
                        <label
                          key={id}
                          htmlFor={id}
                          className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 text-sm transition-colors ${
                            selected
                              ? "border-accent bg-accent/10"
                              : "border-edge hover:bg-edge/30"
                          }`}
                        >
                          <input
                            id={id}
                            type="radio"
                            name={question.id}
                            checked={selected}
                            onChange={() =>
                              setChosen((prev) => ({ ...prev, [question.id]: optionIndex }))
                            }
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-accent"
                          />
                          <span className="min-w-0">{option}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              </Panel>
            </li>
          ))}
        </ol>

        {failure && <ErrorNote message={failure} />}

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void submit()}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Submit {answered} of {attempt.questions.length}
          </button>
          <p className="text-xs text-muted">Answers are marked on the server.</p>
        </div>
      </div>
    );
  }

  // --- The result -------------------------------------------------------
  if (view === "result" && result && attempt) {
    const byId = new Map(attempt.questions.map((q) => [q.id, q]));
    return (
      <div className="space-y-5">
        <PageHeader
          eyebrow={result.label}
          title="How that went"
          description="The explanations matter more than the mark. Read the ones you got wrong."
          actions={
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setView("topics");
                setAttempt(null);
                setResult(null);
              }}
            >
              Back to topics
            </button>
          }
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Score" value={`${result.grade.scorePercent}%`} />
          <Metric label="Correct" value={`${result.grade.correct} of ${result.grade.total}`} />
          <Metric label="Answered" value={`${result.grade.attempted} of ${result.grade.total}`} />
          <Metric label="Time" value={formatDuration(result.durationSeconds)} />
        </div>

        {/* A suggestion, never a verdict. Nothing was written to the profile. */}
        <Panel title="What this suggests about your level">
          <p className="text-sm leading-relaxed text-muted">{result.suggestion.rationale}</p>
          {result.suggestion.level !== null && result.suggestion.confident && (
            <p className="mt-2 text-sm">
              Suggested rating:{" "}
              <span className="font-medium capitalize">{result.suggestion.level}</span>.{" "}
              <Link to="/skills-gap" className="link">
                Set it on the skills gap page
              </Link>{" "}
              if you agree — nothing has been changed for you.
            </p>
          )}
          <p className="mt-2 text-2xs leading-relaxed text-faint">
            A short multiple-choice quiz is evidence, not a measurement. It cannot tell depth from
            luck, which is why it never suggests advanced and never edits your profile by itself.
          </p>
        </Panel>

        {result.recommendations.length > 0 && (
          <Panel title="What to do next">
            <ul className="space-y-2">
              {result.recommendations.map((line, i) => (
                <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-muted">
                  <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        <ol className="space-y-4">
          {result.grade.answers.map((answer, index) => {
            const question = byId.get(answer.questionId);
            if (!question) return null;
            return (
              <li key={answer.questionId}>
                <Panel>
                  <div className="flex items-start gap-2">
                    <span
                      className={`chip shrink-0 ${
                        answer.correct
                          ? "bg-ok/12 text-ok"
                          : answer.chosen === null
                            ? "bg-faint/15 text-faint"
                            : "bg-bad/12 text-bad"
                      }`}
                    >
                      {answer.correct ? (
                        <Check className="h-3 w-3" aria-hidden="true" />
                      ) : answer.chosen === null ? (
                        <CircleHelp className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        <X className="h-3 w-3" aria-hidden="true" />
                      )}
                      {answer.correct ? "Correct" : answer.chosen === null ? "Skipped" : "Wrong"}
                    </span>
                    <p className="min-w-0 text-sm font-medium leading-relaxed">
                      <span className="mr-1.5 text-faint">{index + 1}.</span>
                      {question.prompt}
                    </p>
                  </div>

                  <div className="mt-3 space-y-1.5">
                    {question.options.map((option, optionIndex) => {
                      const isAnswer = optionIndex === answer.correctIndex;
                      const wasChosen = optionIndex === answer.chosen;
                      return (
                        <div
                          key={optionIndex}
                          className={`flex items-start gap-2 rounded-lg border p-2.5 text-sm ${
                            isAnswer
                              ? "border-ok/40 bg-ok/[0.07]"
                              : wasChosen
                                ? "border-bad/40 bg-bad/[0.07]"
                                : "border-edge"
                          }`}
                        >
                          <span className="min-w-0 flex-1">{option}</span>
                          {isAnswer && (
                            <span className="chip shrink-0 bg-ok/12 text-ok">Correct answer</span>
                          )}
                          {wasChosen && !isAnswer && (
                            <span className="chip shrink-0 bg-bad/12 text-bad">You chose this</span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <p className="mt-3 border-t border-edge pt-3 text-sm leading-relaxed text-muted">
                    {answer.explanation}
                  </p>
                </Panel>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  // --- Topic list -------------------------------------------------------
  return (
    <div className="space-y-5">
      <PageHeader
        title="Practice"
        description="Check what you actually know, and read why each answer is what it is."
      />

      {topics.length === 0 ? (
        <Panel>
          <Empty title="No practice topics yet">
            Questions are added per skill. None are available right now.
          </Empty>
        </Panel>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {topics.map((topic) => (
            <article key={topic.skillId} className="panel flex min-w-0 flex-col p-4">
              <h2 className="truncate text-sm font-semibold">{topic.label}</h2>
              <p className="mt-0.5 text-2xs text-faint">
                {topic.questionCount} question{topic.questionCount === 1 ? "" : "s"}
              </p>

              {topic.bestScorePercent !== null ? (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-2xs text-muted">
                    <span>Best so far</span>
                    <span className="tabular font-medium">{topic.bestScorePercent}%</span>
                  </div>
                  <div className="mt-1">
                    <ProgressBar
                      value={topic.bestScorePercent}
                      label={`${topic.label}: best score ${topic.bestScorePercent}%`}
                      tone={topic.bestScorePercent >= 85 ? "ok" : topic.bestScorePercent >= 60 ? "accent" : "warn"}
                    />
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-2xs text-faint">Not attempted yet</p>
              )}

              <button
                type="button"
                className="btn-ghost btn-sm mt-3 self-start"
                disabled={busy}
                onClick={() => void start(topic.skillId)}
              >
                {topic.bestScorePercent === null ? "Start" : "Try again"}
              </button>
            </article>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <Panel title="Your attempts" subtitle="Most recent first">
          <ul className="divide-y divide-edge">
            {history.slice(0, 10).map((row) => (
              <li key={row._id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row.skillLabel}</p>
                  <p className="text-2xs text-faint">
                    {new Date(row.submittedAt).toLocaleString("en-IN")}
                    {row.durationSeconds !== null && ` · ${formatDuration(row.durationSeconds)}`}
                  </p>
                </div>
                <span className="tabular shrink-0 text-sm font-semibold">
                  {row.correct}/{row.total}
                  <span className="ml-1.5 text-2xs font-normal text-muted">
                    {row.scorePercent}%
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {failure && <ErrorNote message={failure} />}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel-flush px-3.5 py-3">
      <div className="tabular text-xl font-semibold">{value}</div>
      <div className="mt-0.5 text-2xs text-muted">{label}</div>
    </div>
  );
}
