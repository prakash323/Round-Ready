import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { ExtractedSkill, SkillImportance } from "../lib/types";

/**
 * The extracted skills, as a list the student corrects.
 *
 * The analyser's output is a starting point, not a verdict. Every row can be
 * reclassified or removed and the student can add what the taxonomy missed —
 * which matters because a wrong skill here becomes a study task later.
 *
 * Provenance is always visible. A skill the description named reads
 * differently from one the analyser inferred, and both read differently from
 * one the student typed, because a plan built on a guess should look like one.
 */

const SOURCE_BADGE: Record<ExtractedSkill["source"], { label: string; className: string }> = {
  explicit: { label: "In the description", className: "bg-ok/12 text-ok" },
  inferred: { label: "Inferred", className: "bg-warn/12 text-warn" },
  manual: { label: "Added by you", className: "bg-info/12 text-info" },
};

function Group({
  title,
  note,
  skills,
  onChange,
  onRemove,
}: {
  title: string;
  note: string;
  skills: ExtractedSkill[];
  onChange: (id: string, importance: SkillImportance) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold">
        {title} <span className="tabular font-normal text-faint">({skills.length})</span>
      </h3>
      <p className="mt-0.5 text-xs text-muted">{note}</p>

      {skills.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-edge px-4 py-5 text-center text-xs text-faint">
          Nothing here yet.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-edge">
          {skills.map((skill) => {
            const badge = SOURCE_BADGE[skill.source];
            return (
              <li key={skill.id} className="py-3 first:pt-0">
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                  <div className="min-w-0 flex-1 basis-56">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{skill.label}</span>
                      <span className={`chip ${badge.className}`}>{badge.label}</span>
                    </div>
                    {skill.reason && (
                      <p className="mt-1 text-xs text-warn">{skill.reason}</p>
                    )}
                    {skill.evidence && (
                      /* The line the skill came from. An analysis the reader
                         cannot audit is one they have to take on faith. */
                      <p className="mt-1 truncate text-xs italic text-faint" title={skill.evidence}>
                        “{skill.evidence}”
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <label className="sr-only" htmlFor={`imp-${skill.id}`}>
                      Importance of {skill.label}
                    </label>
                    <select
                      id={`imp-${skill.id}`}
                      className="field w-auto py-1 text-xs"
                      value={skill.importance}
                      onChange={(event) =>
                        onChange(skill.id, event.target.value as SkillImportance)
                      }
                    >
                      <option value="required">Required</option>
                      <option value="preferred">Preferred</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => onRemove(skill.id)}
                      aria-label={`Remove ${skill.label}`}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-faint transition-colors hover:bg-bad/10 hover:text-bad"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function SkillEditor({
  skills,
  onSkills,
}: {
  skills: ExtractedSkill[];
  onSkills: (next: ExtractedSkill[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [draftImportance, setDraftImportance] = useState<SkillImportance>("required");

  const setImportance = (id: string, importance: SkillImportance) =>
    onSkills(skills.map((s) => (s.id === id ? { ...s, importance } : s)));

  const remove = (id: string) => onSkills(skills.filter((s) => s.id !== id));

  function add() {
    const label = draft.trim();
    if (label === "") return;
    const id = `manual:${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    if (skills.some((s) => s.id === id)) {
      setDraft("");
      return;
    }
    onSkills([
      ...skills,
      {
        id,
        label,
        category: "other",
        importance: draftImportance,
        source: "manual",
        evidence: "",
        reason: null,
      },
    ]);
    setDraft("");
  }

  const required = skills.filter((s) => s.importance === "required");
  const preferred = skills.filter((s) => s.importance === "preferred");

  return (
    <div className="space-y-6">
      <Group
        title="Required"
        note="Named as needed for the role, or read that way because no heading said otherwise."
        skills={required}
        onChange={setImportance}
        onRemove={remove}
      />
      <Group
        title="Preferred"
        note="Listed as nice to have, a bonus, or a plus."
        skills={preferred}
        onChange={setImportance}
        onRemove={remove}
      />

      <div className="panel-flush p-3.5">
        <label className="label" htmlFor="newSkill">
          Add a skill the analysis missed
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="newSkill"
            className="field min-w-0 flex-1 basis-48"
            value={draft}
            placeholder="Rust, Figma, GraphQL…"
            onChange={(event) => setDraft(event.target.value)}
            // Enter inside a form would submit it; here it should add the row.
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
          />
          <label className="sr-only" htmlFor="newSkillImportance">
            Importance
          </label>
          <select
            id="newSkillImportance"
            className="field w-auto"
            value={draftImportance}
            onChange={(event) => setDraftImportance(event.target.value as SkillImportance)}
          >
            <option value="required">Required</option>
            <option value="preferred">Preferred</option>
          </select>
          <button type="button" className="btn-ghost" onClick={add} disabled={draft.trim() === ""}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

/** A removable chip list, used for the assessment rounds the notice named. */
export function ChipList({
  items,
  onRemove,
  emptyNote,
}: {
  items: string[];
  onRemove: (index: number) => void;
  emptyNote: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted">{emptyNote}</p>;
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>
          <span className="chip bg-edge/60 text-ink">
            {item}
            <button
              type="button"
              onClick={() => onRemove(index)}
              aria-label={`Remove ${item}`}
              className="-mr-0.5 ml-0.5 rounded text-faint transition-colors hover:text-bad"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}
