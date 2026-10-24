import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { get } from "../lib/api";
import { DriveForm } from "../components/drive-form";
import type { DriveFormValues } from "../components/drive-form";
import { Empty, ErrorNote, Loading, PageHeader, Panel } from "../components/ui";
import { usePageMeta } from "../lib/use-page-meta";
import type { DriveDoc } from "../lib/types";

export function DriveEditPage() {
  const { id } = useParams<{ id: string }>();
  const [initial, setInitial] = useState<DriveFormValues | null>(null);
  const [company, setCompany] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  usePageMeta(company ? `Edit ${company}` : "Edit drive");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, failure } = await get<{ drive: DriveDoc }>(`/api/drives/${id}`);
      if (cancelled) return;
      if (failure || !data) {
        setError(failure?.message ?? "No such drive");
        setLoading(false);
        return;
      }
      const doc = data.drive;
      setCompany(doc.company);
      setInitial({
        company: doc.company,
        role: doc.role,
        ctcLpa: doc.ctcLpa,
        location: doc.location ?? "",
        applicationDeadline: doc.applicationDeadline ?? "",
        criteria: doc.criteria,
        rounds: doc.rounds.map((r) => ({
          name: r.name,
          type: r.type,
          startAt: r.startAt,
          endAt: r.endAt,
        })),
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) return <Loading label="Loading this drive" rows={2} />;
  if (error) return <ErrorNote message={error} />;
  if (!initial) {
    return (
      <div className="py-10">
        <Empty
          title="That drive is not on your board"
          action={
            <Link to="/drives" className="btn-primary">
              Back to your drives
            </Link>
          }
        >
          It may have been removed by someone else in your batch.
        </Empty>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          to={`/drives/${id}`}
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {company}
        </Link>
        <div className="mt-2">
          <PageHeader
            title="Edit drive"
            description="Changes are visible to your whole batch. Correcting a cutoff here re-evaluates everyone against it on their next page load."
          />
        </div>
      </div>
      <Panel>
        <DriveForm initial={initial} driveId={id} />
      </Panel>
    </div>
  );
}
