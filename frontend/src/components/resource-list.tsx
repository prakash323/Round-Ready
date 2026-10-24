import { useCallback, useEffect, useState } from "react";
import { BookmarkPlus, ExternalLink, Loader2, Plus, Trash2 } from "lucide-react";
import { get, send } from "../lib/api";
import { FormStatus } from "./field";
import type { LearningResource, SavedResource, SkillResources } from "../lib/types";

/**
 * Where to actually learn one skill.
 *
 * Curated guidance and the student's own saved links are shown separately and
 * never merged: a link the tool suggested and a link the student chose are not
 * the same recommendation, and flattening them would quietly claim credit for
 * the first or authority for the second.
 *
 * Every external link opens in a new tab with `rel="noreferrer"`, and the host
 * is shown beside the title so the student can see where they are going before
 * they go.
 */

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const KIND_LABEL: Record<LearningResource["kind"], { label: string; className: string }> = {
  official: { label: "Official docs", className: "bg-ok/12 text-ok" },
  reference: { label: "Reference", className: "bg-info/12 text-info" },
  practice: { label: "Practice", className: "bg-accent/12 text-accent" },
};

export function ResourceList({ skillId, label }: { skillId: string; label: string }) {
  const [data, setData] = useState<SkillResources | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftUrl, setDraftUrl] = useState("");

  const load = useCallback(async () => {
    const { data: result, failure } = await get<SkillResources>(`/api/resources/skill/${skillId}`);
    if (failure || !result) {
      setError(failure?.message ?? "Resources could not be loaded.");
      return;
    }
    setData(result);
  }, [skillId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(resource: { title: string; url: string; note?: string; curated: boolean }) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const { failure } = await send("/api/resources", "POST", { ...resource, skillId });
    setBusy(false);
    if (failure) {
      setError(failure.message);
      return;
    }
    await load();
  }

  async function remove(id: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const { failure } = await send(`/api/resources/${id}`, "DELETE");
    setBusy(false);
    if (failure) {
      setError(failure.message);
      return;
    }
    await load();
  }

  if (!data) {
    return (
      <div className="skeleton h-16 w-full" role="status" aria-busy="true">
        <span className="sr-only">Loading resources for {label}</span>
      </div>
    );
  }

  const savedUrls = new Set(data.saved.map((s) => s.url));

  return (
    <div className="space-y-4">
      {/* What to cover. Original guidance, not extracted from anywhere. */}
      {data.guide && data.guide.focus.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
            What to cover
          </h4>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm leading-relaxed text-muted">
            {data.guide.focus.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {data.guide && data.guide.resources.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Suggested</h4>
          <ul className="mt-2 space-y-2">
            {data.guide.resources.map((resource) => {
              const kind = KIND_LABEL[resource.kind];
              const already = savedUrls.has(resource.url);
              return (
                <li key={resource.url} className="panel-flush px-3 py-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                    <div className="min-w-0 flex-1 basis-56">
                      <a
                        href={resource.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-medium hover:text-accent"
                      >
                        {resource.title}
                        <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                      </a>
                      <span className={`chip ml-2 ${kind.className}`}>{kind.label}</span>
                      <p className="mt-0.5 text-xs text-muted">{resource.note}</p>
                      <p className="mt-0.5 font-mono text-2xs text-faint">{hostOf(resource.url)}</p>
                    </div>
                    <button
                      type="button"
                      disabled={busy || already}
                      onClick={() =>
                        void save({
                          title: resource.title,
                          url: resource.url,
                          note: resource.note,
                          curated: true,
                        })
                      }
                      className="btn-ghost btn-sm shrink-0"
                    >
                      <BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" />
                      {already ? "Saved" : "Save"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!data.guide && (
        <p className="text-sm text-muted">
          Nothing curated for {label} yet. Rather than pad this out with “read the documentation
          and practise”, it is left empty — add the links you find useful below.
        </p>
      )}

      {data.saved.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Your library
          </h4>
          <ul className="mt-2 divide-y divide-edge">
            {data.saved.map((item: SavedResource) => (
              <li key={item._id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium hover:text-accent"
                  >
                    {item.title}
                    <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                  </a>
                  {!item.curated && (
                    <span className="chip ml-2 bg-edge/60 text-muted">Yours</span>
                  )}
                  <p className="mt-0.5 font-mono text-2xs text-faint">{hostOf(item.url)}</p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove(item._id)}
                  aria-label={`Remove ${item.title} from your library`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-faint transition-colors hover:bg-bad/10 hover:text-bad"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {adding ? (
        <div className="panel-flush space-y-3 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor={`title-${skillId}`}>
                Title
              </label>
              <input
                id={`title-${skillId}`}
                className="field"
                value={draftTitle}
                placeholder="The thing that finally made it click"
                onChange={(event) => setDraftTitle(event.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor={`url-${skillId}`}>
                Link
              </label>
              <input
                id={`url-${skillId}`}
                className="field"
                type="url"
                inputMode="url"
                value={draftUrl}
                placeholder="https://"
                onChange={(event) => setDraftUrl(event.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary btn-sm"
              disabled={busy || draftTitle.trim() === "" || draftUrl.trim() === ""}
              onClick={async () => {
                await save({ title: draftTitle.trim(), url: draftUrl.trim(), curated: false });
                setDraftTitle("");
                setDraftUrl("");
                setAdding(false);
              }}
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              Save to library
            </button>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
          <FormStatus error={error} />
        </div>
      ) : (
        <div>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add your own link
          </button>
          <FormStatus error={error} />
        </div>
      )}
    </div>
  );
}
