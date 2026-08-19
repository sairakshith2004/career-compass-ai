import { createFileRoute } from "@tanstack/react-router";
import { Briefcase } from "lucide-react";
import { Panel, EmptyState } from "@/components/worklens/Panel";

export const Route = createFileRoute("/app/jobs")({
  head: () => ({
    meta: [
      { title: "Job Match Analysis — WorkLens" },
      {
        name: "description",
        content:
          "Paste a job description and see extracted requirements, skill gaps and your match score.",
      },
      { property: "og:title", content: "Job Match Analysis — WorkLens" },
      {
        property: "og:description",
        content: "Extract requirements from any job description and compare them to your skills.",
      },
    ],
  }),
  component: Jobs,
});

function Jobs() {
  return (
    <div className="space-y-6">
      <Panel
        title="Analyze a job description"
        description="Paste the full posting. Parsing and skill normalization arrive in Phase 5."
      >
        <textarea
          disabled
          rows={7}
          placeholder="Paste a job description here…"
          className="w-full resize-none rounded-lg border border-input bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground disabled:opacity-60"
        />
        <button
          disabled
          className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Analyze job (backend pending)
        </button>
      </Panel>

      <Panel title="Analyzed jobs">
        <EmptyState
          icon={<Briefcase className="size-6" />}
          title="No jobs analyzed yet"
          description="Once the job intelligence API exists, every analyzed posting and its match score will be listed here."
        />
      </Panel>
    </div>
  );
}
