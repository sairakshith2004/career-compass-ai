import { createFileRoute } from "@tanstack/react-router";
import { UploadCloud } from "lucide-react";
import { Panel, EmptyState, Skeleton } from "@/components/worklens/Panel";

export const Route = createFileRoute("/app/resume")({
  head: () => ({
    meta: [
      { title: "Resume Intelligence — WorkLens" },
      {
        name: "description",
        content:
          "Upload a PDF or DOCX resume and turn it into structured, evidence-backed skill data.",
      },
      { property: "og:title", content: "Resume Intelligence — WorkLens" },
      {
        property: "og:description",
        content: "Structured extraction of education, projects, experience and demonstrated skills.",
      },
    ],
  }),
  component: Resume,
});

function Resume() {
  return (
    <div className="space-y-6">
      <Panel title="Upload resume" description="PDF or DOCX, max 5 MB. Parsing lands in Phase 4.">
        <div className="flex flex-col items-center rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <UploadCloud className="size-6 text-primary" />
          <p className="mt-3 text-sm font-medium">Drag and drop your resume</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Upload is disabled until the storage and validation API exists.
          </p>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Structured extract">
          <EmptyState
            title="Nothing parsed yet"
            description="Education, experience, projects, certifications and technologies will appear here."
          />
        </Panel>
        <Panel title="Evidence signals (loading example)">
          <div className="space-y-3">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </Panel>
      </div>
    </div>
  );
}
