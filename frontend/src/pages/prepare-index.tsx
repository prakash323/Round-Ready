import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, FileText, Link2, Plus } from "lucide-react";
import { get } from "../lib/api";
import { Empty, ErrorNote, Loading, PageHeader, Panel } from "../components/ui";
import { usePageMeta } from "../lib/use-page-meta";
import { formatIst } from "../lib/format";
import type { JobDescriptionDoc } from "../lib/types";

/**
 * Everything the student has analysed.
 *
 * This page exists because without it a standalone analysis was a dead end:
 * it saved, and then there was no way back to it. A record tied to a drive
 * reopens from the drive; one that is not had nowhere to be reached from.
 */

/** The list endpoint omits the heavy fields, so the rows are a subset. */
type SavedRow = Omit<JobDescriptionDoc, "rawText" | "responsibilities" | "qualifications">;

function linkFor(row: SavedRow): string {
  // A drive-linked analysis opens through its drive, so the workspace keeps
  // the drive's context — the back link, the company, the role.
  return row.driveId ? `/prepare/${row.driveId}` : `/prepare/jd/${row._id}`;
}

export function PrepareIndexPage() {
  const [rows, setRows] = useState<SavedRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  usePageMeta("Preparation");

  const load = useCallback(async () => {
    const { data, failure } = await get<{ jobDescriptions: SavedRow[] }>("/api/jd");
    if (failure || !data) {
      setError(failure?.message ?? "Your saved analyses could not be loaded.");
      return;
    }
    setRows(data.jobDescriptions);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorNote message={error} />;
  if (!rows) return <Loading label="Loading your analyses" rows={2} />;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Preparation"
        description="Job descriptions you have analysed, with the skills each one asks for."
        actions={
          <Link to="/prepare/new" className="btn-primary">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Analyse a description
          </Link>
        }
      />

      {rows.length === 0 ? (
        <Panel>
          <Empty
            title="Nothing analysed yet"
            action={
              <Link to="/prepare/new" className="btn-primary">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Analyse a description
              </Link>
            }
          >
            Paste a job description and the analyser pulls out the skills it asks for, separated
            into required and preferred, with the line each one came from. You can also start from
            a drive — every drive page has an <span className="font-medium">Open preparation</span>{" "}
            button.
          </Empty>
        </Panel>
      ) : (
        <Panel bodyClassName="py-1">
          <ul className="divide-y divide-edge">
            {rows.map((row) => {
              const required = row.skills.filter((s) => s.importance === "required").length;
              const preferred = row.skills.length - required;
              return (
                <li key={row._id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-1 basis-56">
                      <Link
                        to={linkFor(row)}
                        className="inline-flex items-center gap-2 text-sm font-semibold hover:text-accent"
                      >
                        <BookOpen className="h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
                        <span className="truncate">
                          {row.company || row.roleTitle || "Untitled analysis"}
                        </span>
                      </Link>
                      <p className="mt-0.5 truncate pl-6 text-xs text-muted">
                        {row.roleTitle || "No role recorded"}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-2xs text-faint">
                        <span className="inline-flex items-center gap-1">
                          <FileText className="h-3 w-3" aria-hidden="true" />
                          {required} required · {preferred} preferred
                        </span>
                        {row.driveId && (
                          <span className="inline-flex items-center gap-1">
                            <Link2 className="h-3 w-3" aria-hidden="true" />
                            Linked to a drive
                          </span>
                        )}
                        {row.editedAt && <span>Edited by you</span>}
                      </p>
                    </div>
                    <span className="tabular shrink-0 text-xs text-faint">
                      {formatIst(row.updatedAt)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <p className="text-xs leading-relaxed text-faint">
        The analyser only reports what a description actually says. Anything it inferred is
        labelled as inferred, and anything it could not work out is listed rather than guessed.
      </p>
    </div>
  );
}
