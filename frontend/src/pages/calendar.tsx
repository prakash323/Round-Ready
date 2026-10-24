import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Download, Loader2 } from "lucide-react";
import { downloadCalendar, get } from "../lib/api";
import { Empty, ErrorNote, Loading, PageHeader, Panel } from "../components/ui";
import { usePageMeta } from "../lib/use-page-meta";
import { formatIstDate, formatIstTime, formatLpa, istDayKey, relativeToNow } from "../lib/format";
import type { AgendaItem } from "../lib/types";

/** Six weeks is about the length of a placement season's active phase. */
const HORIZON_DAYS = 42;

export function CalendarPage() {
  const [items, setItems] = useState<AgendaItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  usePageMeta("Calendar");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, failure } = await get<{ agenda: AgendaItem[] }>(
        `/api/board/agenda?days=${HORIZON_DAYS}`,
      );
      if (cancelled) return;
      if (failure || !data) {
        setError(failure?.message ?? "The calendar could not be loaded.");
        return;
      }
      setItems(data.agenda);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <ErrorNote message={error} />;
  if (!items) return <Loading label="Loading your calendar" rows={3} />;

  // Grouped by IST calendar day, not by UTC day — a 23:30 IST round belongs to
  // the evening the student will actually sit it.
  const byDay = new Map<string, AgendaItem[]>();
  for (const item of items) {
    const key = istDayKey(item.at);
    const list = byDay.get(key);
    if (list) list.push(item);
    else byDay.set(key, [item]);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendar"
        description="The next six weeks of rounds and deadlines, for drives you can still act on. All times IST."
        actions={
          /* The export is an authenticated fetch handed to the browser as a
             blob — a plain link cannot carry the session cookie across
             origins in production. */
          <button
            type="button"
            className="btn-ghost"
            disabled={downloading}
            onClick={async () => {
              setDownloading(true);
              setDownloadError(null);
              const ok = await downloadCalendar();
              setDownloading(false);
              if (!ok) setDownloadError("The export could not be generated.");
            }}
          >
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="h-4 w-4" aria-hidden="true" />
            )}
            {downloading ? "Preparing…" : "Export .ics"}
          </button>
        }
      />

      <div aria-live="polite">
        {downloadError && <ErrorNote message={downloadError} />}
      </div>

      {items.length === 0 ? (
        <Panel>
          <Empty title="Nothing scheduled">
            Add rounds to your drives and they will appear here — and in your own calendar, via the
            export.
          </Empty>
        </Panel>
      ) : (
        <div className="space-y-4">
          {[...byDay.entries()].map(([day, dayItems]) => (
            <Panel
              key={day}
              title={formatIstDate(dayItems[0].at)}
              subtitle={relativeToNow(dayItems[0].at)}
              bodyClassName="py-1"
            >
              <ul className="divide-y divide-edge">
                {dayItems.map((item, i) => (
                  <li
                    key={`${item.driveId}-${item.label}-${i}`}
                    className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1.5 py-3 sm:grid-cols-[3.25rem_minmax(0,1fr)_auto]"
                  >
                    <span className="tabular pt-px text-sm font-medium text-muted">
                      {formatIstTime(item.at)}
                    </span>

                    <div className="min-w-0">
                      <Link
                        to={`/drives/${item.driveId}`}
                        className="text-sm font-medium hover:text-accent"
                      >
                        {item.company}
                      </Link>
                      <span className="ml-2 text-xs text-muted">{item.label}</span>
                    </div>

                    {/* Wraps under the content on narrow screens rather than
                        squeezing the company name. */}
                    <div className="col-start-2 flex flex-wrap items-center gap-2 sm:col-start-3 sm:justify-end">
                      {item.clashing && (
                        <span className="chip bg-warn/12 text-warn">
                          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                          Clash
                        </span>
                      )}
                      {item.kind === "deadline" && (
                        <span className="chip bg-info/12 text-info">Deadline</span>
                      )}
                      <span className="tabular text-xs text-faint">{formatLpa(item.ctcLpa)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      )}

      <p className="text-xs leading-relaxed text-faint">
        The export is an authenticated download rather than a subscription URL. A feed would need a
        token in the query string, which then lives in your calendar app&rsquo;s config and in
        server logs indefinitely.
      </p>
    </div>
  );
}
