import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { DriveForm } from "../components/drive-form";
import { PageHeader, Panel } from "../components/ui";
import { usePageMeta } from "../lib/use-page-meta";

export function DriveNewPage() {
  usePageMeta("Add a drive");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          to="/drives"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          All drives
        </Link>
        <div className="mt-2">
          <PageHeader
            title="Add a drive"
            description="Everyone in your batch will see it. Your eligibility verdict stays yours, because it is computed from your profile rather than stored on the drive."
          />
        </div>
      </div>
      <Panel>
        <DriveForm />
      </Panel>
    </div>
  );
}
