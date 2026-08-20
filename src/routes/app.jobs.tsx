import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { Briefcase } from "lucide-react";
import { toast } from "sonner";

import { Panel, EmptyState, Badge } from "@/components/worklens/Panel";
import { analyzeJob, listJobs } from "@/lib/server-fns";
import { requireResume } from "@/lib/route-guards";

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
  // Locked until the member has a parsed resume — see route-guards.ts.
  beforeLoad: () => requireResume(),
  loader: () => listJobs(),
  component: Jobs,
});

const inputClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60";

function Jobs() {
  const jobList = Route.useLoaderData();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [description, setDescription] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      analyzeJob({
        data: {
          title: title || undefined,
          company: company || undefined,
          rawDescription: description,
        },
      }),
    onSuccess: async (result) => {
      toast.success(
        result.matchScore === null
          ? `Analyzed — no catalog skills detected in this posting`
          : `Analyzed — ${result.matchScore}% match, ${result.skillsFound} skill${result.skillsFound === 1 ? "" : "s"} required`,
      );
      setTitle("");
      setCompany("");
      setDescription("");
      await router.invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Couldn't analyze that job — try again");
    },
  });

  return (
    <div className="space-y-6">
      <Panel
        title="Analyze a job description"
        description="Paste the full posting — it's scanned for skills and scored against your resume."
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              placeholder="Job title (optional)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={mutation.isPending}
              className={inputClass}
            />
            <input
              placeholder="Company (optional)"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              disabled={mutation.isPending}
              className={inputClass}
            />
          </div>
          <textarea
            rows={7}
            placeholder="Paste a job description here…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={mutation.isPending}
            className="w-full resize-none rounded-lg border border-input bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground disabled:opacity-60"
          />
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || description.trim().length < 30}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mutation.isPending ? "Analyzing…" : "Analyze job"}
          </button>
        </div>
      </Panel>

      <Panel title="Analyzed jobs">
        {jobList.length === 0 ? (
          <EmptyState
            icon={<Briefcase className="size-6" />}
            title="No jobs analyzed yet"
            description="Paste a job description above to see its match score and required skills."
          />
        ) : (
          <ul className="divide-y divide-border">
            {jobList.map((job) => (
              <li key={job.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {job.title || "Untitled role"}
                    {job.company ? ` · ${job.company}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Analyzed {job.analyzedAt ? new Date(job.analyzedAt).toLocaleDateString() : "—"}
                  </p>
                </div>
                {job.matchScore !== null ? (
                  <Badge
                    tone={
                      job.matchScore >= 70 ? "success" : job.matchScore >= 40 ? "warning" : "muted"
                    }
                  >
                    {job.matchScore}% match
                  </Badge>
                ) : (
                  <Badge>No skills detected</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
