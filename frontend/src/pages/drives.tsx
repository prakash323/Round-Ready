import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, X } from "lucide-react";
import { DriveCard, Empty, ErrorNote, Loading, PageHeader, Panel } from "../components/ui";
import { useAuth } from "../lib/auth-context";
import { useBoard } from "../lib/use-board";
import { usePageMeta } from "../lib/use-page-meta";
import type { DriveView } from "../lib/types";

/**
 * The full board, grouped by what the student can do about each drive.
 *
 * Groups are ordered by actionability rather than by count, so the drives that
 * need a decision are the first thing on the page. The search box filters
 * within that structure instead of flattening it — a filtered list that loses
 * the "not eligible, and here is why" framing would be a worse answer.
 */
const GROUP_META: {
  key: keyof ReturnType<typeof groupsOf>;
  title: string;
  note: string;
}[] = [
  {
    key: "actionable",
    title: "Open to you",
    note: "You clear every stated criterion and your placement policy allows it. Ranked by priority.",
  },
  {
    key: "unknown",
    title: "Cannot determine",
    note: "These notices ask for something your profile does not have yet.",
  },
  {
    key: "blocked",
    title: "Blocked by your placement policy",
    note: "You are eligible, but an offer you hold closes these.",
  },
  {
    key: "notEligible",
    title: "Not eligible",
    note: "Shown with the specific criteria you fall short on, never hidden.",
  },
  {
    key: "expired",
    title: "Deadline passed",
    note: "No longer applicable — kept so the record is complete.",
  },
  {
    key: "resolved",
    title: "Closed",
    note: "Offers received, rejections and withdrawals.",
  },
];

function groupsOf(board: { groups: Record<string, DriveView[]> }) {
  return board.groups as unknown as {
    actionable: DriveView[];
    unknown: DriveView[];
    blocked: DriveView[];
    notEligible: DriveView[];
    expired: DriveView[];
    resolved: DriveView[];
  };
}

export function DrivesPage() {
  const { board, loading, failure, reload } = useBoard();
  const { isOfficer } = useAuth();
  const [query, setQuery] = useState("");
  usePageMeta("Placement drives");

  const groups = board ? groupsOf(board) : null;

  const filtered = useMemo(() => {
    if (!groups) return null;
    const needle = query.trim().toLowerCase();
    const match = (view: DriveView) =>
      needle === "" ||
      view.drive.company.toLowerCase().includes(needle) ||
      view.drive.role.toLowerCase().includes(needle) ||
      (view.drive.location ?? "").toLowerCase().includes(needle);

    return GROUP_META.map((meta) => ({ ...meta, views: groups[meta.key].filter(match) }));
  }, [groups, query]);

  if (loading) return <Loading label="Loading your drives" rows={3} />;
  if (failure) {
    return (
      <ErrorNote
        message={failure.message}
        action={
          <button type="button" className="btn-ghost btn-sm" onClick={reload}>
            Try again
          </button>
        }
      />
    );
  }
  if (!board || !filtered) return <ErrorNote message="The board could not be loaded." />;

  const shown = filtered.reduce((sum, group) => sum + group.views.length, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Placement drives"
        description={`${board.stats.total} drive${board.stats.total === 1 ? "" : "s"} on your batch's board, grouped by what you can do about them.`}
        actions={
          isOfficer ? (
            <Link to="/drives/new" className="btn-primary">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add a drive
            </Link>
          ) : undefined
        }
      />

      {board.stats.total > 0 && (
        <div className="relative max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
            aria-hidden="true"
          />
          <label htmlFor="drive-search" className="sr-only">
            Filter drives by company, role or location
          </label>
          <input
            id="drive-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by company, role or location"
            className="field pl-9 pr-9"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear filter"
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-faint hover:text-ink"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {board.stats.total === 0 && (
        <Panel>
          {/* The empty state says something different to each role, because
              the next step is different: the officer can post one, the
              student can only wait for one — and telling a student to "add
              the first drive" sends them at a button that is not there. */}
          <Empty
            title="No drives yet"
            action={
              isOfficer ? (
                <Link to="/drives/new" className="btn-primary">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add the first drive
                </Link>
              ) : undefined
            }
          >
            {isOfficer
              ? "Add the first one and everyone in your batch will see it too."
              : "Your placement office has not posted any yet. They will appear here for your whole batch as soon as it does."}
          </Empty>
        </Panel>
      )}

      {board.stats.total > 0 && shown === 0 && (
        <Panel>
          <Empty
            title="Nothing matches that filter"
            action={
              <button type="button" className="btn-ghost" onClick={() => setQuery("")}>
                Clear the filter
              </button>
            }
          >
            No drive on your board mentions “{query.trim()}”.
          </Empty>
        </Panel>
      )}

      <div aria-live="polite" className="sr-only">
        {query.trim() ? `${shown} drives match` : ""}
      </div>

      {filtered
        .filter((group) => group.views.length > 0)
        .map((group) => (
          <section key={group.key} className="space-y-3">
            <header>
              <h2 className="text-sm font-semibold">
                {group.title}{" "}
                <span className="tabular font-normal text-faint">({group.views.length})</span>
              </h2>
              <p className="mt-0.5 text-xs text-muted">{group.note}</p>
            </header>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {group.views.map((view) => (
                <DriveCard key={view.drive.id} view={view} />
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}
