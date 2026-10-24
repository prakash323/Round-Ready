import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, FileText, Loader2, Sparkles, Trash2, Wand2 } from "lucide-react";
import { get, send } from "../lib/api";
import { GapPanel } from "../components/gap-panel";
import { PlanPanel } from "../components/plan-panel";
import { ChipList, SkillEditor } from "../components/skill-editor";
import { FormStatus } from "../components/field";
import { Empty, ErrorNote, Loading, Notice, PageHeader, Panel } from "../components/ui";
import { usePageMeta } from "../lib/use-page-meta";
import type { ExtractedSkill, JdAnalysis, JobDescriptionDoc } from "../lib/types";

/**
 * The preparation workspace for one role.
 *
 * Paste the description, read what the analyser found, correct it, save it.
 * The analysis is always a draft: every row is editable and nothing is stored
 * until the student says so, because the analyser is a keyword matcher and it
 * will be wrong about something.
 */

interface Draft {
  roleTitle: string;
  company: string;
  skills: ExtractedSkill[];
  responsibilities: string[];
  qualifications: string[];
  assessments: string[];
  experienceMinYears: number | null;
  gaps: string[];
}

function draftFrom(analysis: JdAnalysis): Draft {
  return {
    roleTitle: analysis.roleTitle ?? "",
    company: analysis.company ?? "",
    skills: analysis.skills,
    responsibilities: analysis.responsibilities,
    qualifications: analysis.qualifications,
    assessments: analysis.assessments,
    experienceMinYears: analysis.experience?.minYears ?? null,
    gaps: analysis.gaps,
  };
}

function draftFromSaved(doc: JobDescriptionDoc): Draft {
  return {
    roleTitle: doc.roleTitle ?? "",
    company: doc.company ?? "",
    skills: doc.skills,
    responsibilities: doc.responsibilities,
    qualifications: doc.qualifications,
    assessments: doc.assessments,
    experienceMinYears: doc.experienceMinYears,
    gaps: doc.gaps,
  };
}

export function PreparePage() {
  const { driveId, jdId } = useParams<{ driveId?: string; jdId?: string }>();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const prefillCompany = params.get("company") ?? "";
  const prefillRole = params.get("role") ?? "";

  const [text, setText] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(driveId || jdId));
  const [analysing, setAnalysing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  usePageMeta(prefillCompany ? `Prepare — ${prefillCompany}` : "Prepare for a role");

  /**
   * Reopen an existing workspace rather than starting blank.
   *
   * Two ways in: a drive-linked analysis is found by its drive, a standalone
   * one by its own id. That second route is what stops a saved standalone
   * analysis from becoming unreachable the moment you navigate away.
   */
  useEffect(() => {
    if (!driveId && !jdId) return;
    let cancelled = false;
    void (async () => {
      const path = jdId ? `/api/jd/${jdId}` : `/api/jd/for-drive/${driveId}`;
      const { data, failure } = await get<{ jobDescription: JobDescriptionDoc | null }>(path);
      if (cancelled) return;
      if (data?.jobDescription) {
        setSavedId(data.jobDescription._id);
        setText(data.jobDescription.rawText);
        setDraft(draftFromSaved(data.jobDescription));
      } else if (jdId) {
        // A direct link to something deleted, or belonging to someone else.
        // `for-drive` legitimately returns null for a drive never analysed,
        // so only the by-id route treats an empty result as an error.
        setError(failure?.message ?? "That analysis is no longer saved.");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [driveId, jdId]);

  const analyse = useCallback(async () => {
    if (analysing || text.trim() === "") return;
    setAnalysing(true);
    setError(null);
    setSaved(null);
    const { data, failure } = await send<{ analysis: JdAnalysis }>("/api/jd/analyse", "POST", {
      text,
      driveId: driveId ?? null,
    });
    setAnalysing(false);
    if (failure || !data) {
      setError(failure?.message ?? "The description could not be analysed.");
      return;
    }
    setDraft(draftFrom(data.analysis));
  }, [analysing, text, driveId]);

  async function save() {
    if (saving || !draft) return;
    setSaving(true);
    setError(null);
    setSaved(null);
    const body = {
      driveId: driveId ?? null,
      roleTitle: draft.roleTitle || null,
      company: draft.company || null,
      rawText: text,
      skills: draft.skills,
      responsibilities: draft.responsibilities,
      qualifications: draft.qualifications,
      assessments: draft.assessments,
      experienceMinYears: draft.experienceMinYears,
      gaps: draft.gaps,
    };
    const result = savedId
      ? await send<{ jobDescription: JobDescriptionDoc }>(`/api/jd/${savedId}`, "PATCH", body)
      : await send<{ jobDescription: JobDescriptionDoc }>("/api/jd", "PUT", body);
    setSaving(false);
    if (result.failure || !result.data) {
      setError(result.failure?.message ?? "Could not save.");
      return;
    }
    // Only after the server confirms.
    const id = result.data.jobDescription._id;
    setSavedId(id);
    setSaved("Saved. Your corrections are kept, not the analyser's first guess.");
    // A standalone analysis now lives at its own address, so a refresh or a
    // bookmark reaches it — without this it saved into a list it had no way
    // back from. `replace`, not `push`: Back should leave the workspace, not
    // step through its own save.
    if (!driveId && !jdId) navigate(`/prepare/jd/${id}`, { replace: true });
  }

  if (loading) return <Loading label="Opening your workspace" rows={2} />;

  const patch = (next: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...next } : d));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        {/* Always a way back: to the drive when this came from one, to the
            list of saved analyses otherwise. */}
        <Link
          to={driveId ? `/drives/${driveId}` : "/prepare"}
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {driveId ? prefillCompany || "Back to the drive" : "All analyses"}
        </Link>
        <div className="mt-2">
          <PageHeader
            title={prefillCompany ? `Prepare for ${prefillCompany}` : "Prepare for a role"}
            description="Paste the job description. The analyser pulls out the skills it recognises and tells you what it could not work out — then you correct it."
          />
        </div>
      </div>

      <Panel
        title="The job description"
        subtitle="Kept exactly as pasted, so you can always check the analysis against it"
        action={
          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={analyse}
            disabled={analysing || text.trim() === ""}
          >
            {analysing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {analysing ? "Analysing…" : draft ? "Analyse again" : "Analyse"}
          </button>
        }
      >
        <label className="sr-only" htmlFor="jdText">
          Job description text
        </label>
        <textarea
          id="jdText"
          className="field min-h-[12rem] resize-y font-mono text-xs leading-relaxed"
          value={text}
          placeholder={`Role: Software Engineer\n\nResponsibilities\n- Build and ship backend services\n\nRequirements\n- Strong Data Structures and Algorithms\n- Java or Python\n\nGood to have\n- Exposure to Docker`}
          onChange={(event) => setText(event.target.value)}
        />
        <p className="mt-2 text-xs text-faint">
          {text.trim() === ""
            ? "Headings like Requirements and Good to have are what let it tell required from preferred."
            : `${text.split(/\s+/).filter(Boolean).length} words`}
        </p>
      </Panel>

      <div aria-live="polite">
        {error && <ErrorNote message={error} />}
      </div>

      {!draft && !error && (
        <Panel>
          <Empty title="Nothing analysed yet">
            Paste a description above and press Analyse. Nothing is saved until you choose to save
            it.
          </Empty>
        </Panel>
      )}

      {draft && (
        <>
          {/* Said plainly rather than papered over: the student needs to know
              how much of this to trust. */}
          {draft.gaps.length > 0 && (
            <Notice tone="warn">
              <p className="font-medium">What the analyser could not work out</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4">
                {draft.gaps.map((gap, i) => (
                  <li key={i}>{gap}</li>
                ))}
              </ul>
              <p className="mt-2">Fill in anything that matters below — it is all editable.</p>
            </Notice>
          )}

          <Panel title="The role">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="roleTitle">
                  Role title
                </label>
                <input
                  id="roleTitle"
                  className="field"
                  value={draft.roleTitle}
                  placeholder={prefillRole || "Software Engineer"}
                  onChange={(event) => patch({ roleTitle: event.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor="companyName">
                  Company
                </label>
                <input
                  id="companyName"
                  className="field"
                  value={draft.company}
                  placeholder={prefillCompany || "Acme Systems"}
                  onChange={(event) => patch({ company: event.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor="expYears">
                  Minimum experience (years)
                  <span className="ml-1.5 font-normal text-faint">Optional</span>
                </label>
                <input
                  id="expYears"
                  className="field tabular"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.5"
                  value={draft.experienceMinYears ?? ""}
                  placeholder="Not stated"
                  onChange={(event) =>
                    patch({
                      experienceMinYears:
                        event.target.value === "" ? null : Number(event.target.value),
                    })
                  }
                />
                <p className="mt-1.5 text-xs text-faint">
                  Blank means the description did not say — not zero.
                </p>
              </div>
            </div>
          </Panel>

          <Panel
            title="Skills"
            subtitle="Correct anything the analyser got wrong. A wrong skill here becomes a wasted evening later."
          >
            <SkillEditor skills={draft.skills} onSkills={(skills) => patch({ skills })} />
          </Panel>

          {/* Gaps need a saved analysis: they are computed server-side from
              the stored skills, so there is nothing to compare until the
              student has committed one. */}
          {savedId && <GapPanel key={savedId} jobDescriptionId={savedId} />}
          {savedId && <PlanPanel key={savedId + "-plan"} jobDescriptionId={savedId} />}

          <Panel
            title="Assessment rounds"
            subtitle="Only what the description actually named — nothing is assumed about this company's process"
          >
            <ChipList
              items={draft.assessments}
              onRemove={(index) =>
                patch({ assessments: draft.assessments.filter((_, i) => i !== index) })
              }
              emptyNote="The description did not name any rounds, so none are listed. Check the official TPO notice."
            />
          </Panel>

          {draft.responsibilities.length > 0 && (
            <Panel title="Responsibilities" subtitle="Pulled verbatim from the description">
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
                {draft.responsibilities.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </Panel>
          )}

          {draft.qualifications.length > 0 && (
            <Panel title="Qualifications" subtitle="Pulled verbatim from the description">
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
                {draft.qualifications.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </Panel>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-primary" onClick={save} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              )}
              {saving ? "Saving…" : savedId ? "Save changes" : "Save this analysis"}
            </button>
            {savedId && (
              <button
                type="button"
                className="btn-ghost hover:border-bad/50 hover:text-bad"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  const { failure } = await send(`/api/jd/${savedId}`, "DELETE");
                  setSaving(false);
                  if (failure) {
                    setError(failure.message);
                    return;
                  }
                  setSavedId(null);
                  setDraft(null);
                  setSaved(null);
                  // Discarding a standalone analysis leaves its URL pointing
                  // at nothing, so go back to the list instead of sitting on
                  // a dead address.
                  if (!driveId) navigate("/prepare", { replace: true });
                }}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Discard saved analysis
              </button>
            )}
            <span className="inline-flex items-center gap-1.5 text-xs text-faint">
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              {draft.skills.length} skills · {draft.assessments.length} rounds
            </span>
          </div>

          <FormStatus success={saved} />
        </>
      )}
    </div>
  );
}
