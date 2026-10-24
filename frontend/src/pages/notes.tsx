import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Eye,
  Loader2,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { get, send } from "../lib/api";
import { Markdown } from "../components/markdown";
import { Empty, ErrorNote, Loading, PageHeader, Panel } from "../components/ui";
import { usePageMeta } from "../lib/use-page-meta";
import type { NoteDoc, NoteRow } from "../lib/types";

/**
 * My Notes.
 *
 * A list beside an editor, the shape every notes app has settled on because
 * it is the one that lets you find a note and read it without losing your
 * place.
 *
 * The save status is the part that matters most. A note is the one thing in
 * RoundReady that cannot be recomputed if lost, so the editor never claims a
 * note is saved until the server has said so — "Saving…" while the request is
 * in flight, "Saved" only on a 200, and a visible failure otherwise. Showing
 * a tick optimistically would be the single worst lie this app could tell.
 */

/** Long enough not to send a request per keystroke; short enough to feel safe. */
const AUTOSAVE_MS = 900;

type SaveState = "idle" | "dirty" | "saving" | "saved" | "failed";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function NotesPage() {
  usePageMeta("My notes", "Everything you have written down, in one place.");

  const [rows, setRows] = useState<NoteRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [note, setNote] = useState<NoteDoc | null>(null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tagText, setTagText] = useState("");
  const [pinned, setPinned] = useState(false);

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [failure, setFailure] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Holds the pending autosave so a new keystroke replaces it rather than
  // queuing a second request behind the first.
  const timer = useRef<number | null>(null);
  // Guards the first render after loading a note, which would otherwise look
  // like an edit and fire a pointless save.
  const hydrating = useRef(false);

  const loadList = useCallback(async () => {
    const { data, failure: f } = await get<{ notes: NoteRow[] }>(
      `/api/notes${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`,
    );
    if (f || !data) {
      setFailure(f?.message ?? "Your notes could not be loaded.");
      return;
    }
    setRows(data.notes);
  }, [query]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  // Open a note.
  useEffect(() => {
    if (activeId === null) {
      setNote(null);
      return;
    }
    void (async () => {
      const { data, failure: f } = await get<{ note: NoteDoc }>(`/api/notes/${activeId}`);
      if (f || !data) {
        setFailure(f?.message ?? "That note could not be opened.");
        return;
      }
      hydrating.current = true;
      setNote(data.note);
      setTitle(data.note.title);
      setBody(data.note.body);
      setTagText(data.note.tags.join(", "));
      setPinned(data.note.pinned);
      setSaveState("idle");
      setPreview(false);
      setConfirmDelete(false);
    })();
  }, [activeId]);

  const save = useCallback(
    async (next: { title: string; body: string; tags: string[]; pinned: boolean }) => {
      if (!activeId) return;
      setSaveState("saving");
      const { data, failure: f } = await send<{ note: NoteDoc }>(
        `/api/notes/${activeId}`,
        "PUT",
        next,
      );
      if (f || !data) {
        // Never a tick on failure. The student must know the words they just
        // typed are not anywhere yet.
        setSaveState("failed");
        setFailure(f?.message ?? "That note could not be saved.");
        return;
      }
      setFailure(null);
      setSaveState("saved");
      setNote(data.note);
      await loadList();
    },
    [activeId, loadList],
  );

  // Autosave: debounce, then save. Runs only on a real edit.
  useEffect(() => {
    if (!activeId) return;
    if (hydrating.current) {
      hydrating.current = false;
      return;
    }
    setSaveState("dirty");
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void save({
        title: title.trim() || "Untitled note",
        body,
        tags: tagText.split(",").map((t) => t.trim()).filter(Boolean),
        pinned,
      });
    }, AUTOSAVE_MS);

    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [title, body, tagText, pinned, activeId, save]);

  async function createNote() {
    const { data, failure: f } = await send<{ note: NoteDoc }>("/api/notes", "POST", {
      title: "Untitled note",
      body: "",
    });
    if (f || !data) {
      setFailure(f?.message ?? "A note could not be created.");
      return;
    }
    await loadList();
    setActiveId(data.note._id);
  }

  async function remove() {
    if (!activeId) return;
    const { failure: f } = await send(`/api/notes/${activeId}`, "DELETE");
    if (f) {
      setFailure(f.message);
      return;
    }
    setConfirmDelete(false);
    setActiveId(null);
    await loadList();
  }

  if (rows === null) return <Loading label="Loading your notes" rows={3} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="My notes"
        description="Everything you have written down, in one place."
        actions={
          <button type="button" className="btn-primary" onClick={() => void createNote()}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New note
          </button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        {/* --- The list -------------------------------------------------

            `min-w-0` is load-bearing: a grid item defaults to `min-width:
            auto`, so a long note title or a tag that will not wrap widens
            the whole track past the viewport and pushes the page sideways.
            The same trap as a flex child, and the same one-property fix. */}
        <div className="min-w-0 space-y-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
              aria-hidden="true"
            />
            <label htmlFor="note-search" className="sr-only">
              Search your notes
            </label>
            <input
              id="note-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search notes"
              className="field pl-9"
            />
          </div>

          {rows.length === 0 ? (
            <Panel>
              <Empty title={query ? "Nothing matches that" : "No notes yet"}>
                {query
                  ? "Try fewer words, or clear the search."
                  : "Write down what you worked out, so you are not working it out again in three weeks."}
              </Empty>
            </Panel>
          ) : (
            <ul className="max-h-[32rem] space-y-1.5 overflow-y-auto pr-1">
              {rows.map((row) => (
                <li key={row._id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(row._id)}
                    aria-current={row._id === activeId ? "true" : undefined}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
                      row._id === activeId
                        ? "border-accent bg-accent/10"
                        : "border-edge bg-card hover:bg-edge/30"
                    }`}
                  >
                    <div className="flex items-start gap-1.5">
                      {row.pinned && (
                        <Pin className="mt-0.5 h-3 w-3 shrink-0 text-accent" aria-label="Pinned" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {row.title}
                      </span>
                    </div>
                    {row.excerpt && (
                      <p className="mt-0.5 truncate text-2xs text-muted">{row.excerpt}</p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <span className="text-2xs text-faint">{relativeTime(row.updatedAt)}</span>
                      {row.tags.slice(0, 2).map((tag) => (
                        <span key={tag} className="chip bg-edge/50 text-faint">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* --- The editor ----------------------------------------------- */}
        {note === null ? (
          <Panel className="min-w-0">
            <Empty title="Nothing open">
              Pick a note from the list, or start a new one.
            </Empty>
          </Panel>
        ) : (
          <Panel className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge pb-3">
              <SaveBadge state={saveState} savedAt={note.updatedAt} />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPinned((v) => !v)}
                  aria-pressed={pinned}
                  className="btn-quiet btn-sm"
                >
                  {pinned ? (
                    <PinOff className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Pin className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {pinned ? "Unpin" : "Pin"}
                </button>
                <button
                  type="button"
                  onClick={() => setPreview((v) => !v)}
                  aria-pressed={preview}
                  className="btn-quiet btn-sm"
                >
                  {preview ? (
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {preview ? "Edit" : "Preview"}
                </button>

                {confirmDelete ? (
                  <>
                    <button type="button" className="btn-danger btn-sm" onClick={() => void remove()}>
                      Delete note
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      aria-label="Keep this note"
                      className="flex h-8 w-8 items-center justify-center rounded-md text-faint hover:text-ink"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    aria-label="Delete this note"
                    className="flex h-8 w-8 items-center justify-center rounded-md text-faint transition-colors hover:bg-bad/10 hover:text-bad"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>

            <label className="sr-only" htmlFor="note-title">
              Note title
            </label>
            <input
              id="note-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Untitled note"
              className="mt-3 w-full border-0 bg-transparent px-0 text-lg font-semibold text-ink outline-none placeholder:text-faint focus:ring-0"
            />

            <label className="sr-only" htmlFor="note-tags">
              Tags, separated by commas
            </label>
            <input
              id="note-tags"
              value={tagText}
              onChange={(event) => setTagText(event.target.value)}
              placeholder="Tags, separated by commas"
              className="mt-1 w-full border-0 bg-transparent px-0 text-xs text-muted outline-none placeholder:text-faint focus:ring-0"
            />

            <div className="mt-3 border-t border-edge pt-3">
              {preview ? (
                <div className="min-h-[18rem]">
                  <Markdown source={body} />
                </div>
              ) : (
                <>
                  <label className="sr-only" htmlFor="note-body">
                    Note body
                  </label>
                  <textarea
                    id="note-body"
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder={"Markdown works here.\n\n## A heading\n- a list item\n`inline code`"}
                    className="min-h-[18rem] w-full resize-y border-0 bg-transparent px-0 font-mono text-sm leading-relaxed text-ink outline-none placeholder:text-faint focus:ring-0"
                  />
                  <p className="text-2xs text-faint">
                    Markdown: <code className="font-mono">##</code> headings,{" "}
                    <code className="font-mono">-</code> lists,{" "}
                    <code className="font-mono">**bold**</code>,{" "}
                    <code className="font-mono">`code`</code>, and ``` for a code block.
                  </p>
                </>
              )}
            </div>
          </Panel>
        )}
      </div>

      {failure && <ErrorNote message={failure} />}
    </div>
  );
}

/**
 * What the server has actually confirmed.
 *
 * Deliberately not optimistic. A tick that appears before the request lands
 * would tell a student their work is safe at the exact moment it is not.
 */
function SaveBadge({ state, savedAt }: { state: SaveState; savedAt: string }) {
  if (state === "saving") {
    return (
      <span className="flex items-center gap-1.5 text-2xs text-muted" role="status">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        Saving…
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className="flex items-center gap-1.5 text-2xs font-medium text-bad" role="status">
        <AlertCircle className="h-3 w-3" aria-hidden="true" />
        Not saved — your changes are still only in this tab
      </span>
    );
  }
  if (state === "dirty") {
    return (
      <span className="text-2xs text-faint" role="status">
        Unsaved changes
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-2xs text-ok" role="status">
      <Check className="h-3 w-3" aria-hidden="true" />
      Saved {relativeTime(savedAt)}
    </span>
  );
}
