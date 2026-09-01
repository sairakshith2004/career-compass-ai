import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import {
  Briefcase,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronRight,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";

import { Panel, EmptyState, Badge } from "@/components/worklens/Panel";
import { analyzeJob, listJobs, getJobMatchDetails } from "@/lib/server-fns";
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
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

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
        result.aiPowered
          ? `AI analysis complete — ${result.matchScore}% match, ${result.skillsFound} skill${result.skillsFound === 1 ? "" : "s"} extracted`
          : result.matchScore === null
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
        description="Paste the full posting — AI extracts structured requirements and scores them against your resume."
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

      {selectedJobId && (
        <JobMatchDetail jobId={selectedJobId} onClose={() => setSelectedJobId(null)} />
      )}

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
              <li
                key={job.id}
                className="flex items-center justify-between gap-3 py-3 text-sm cursor-pointer hover:bg-muted/50 rounded-lg px-2 -mx-2 transition-colors"
                onClick={() => setSelectedJobId(job.id)}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {job.title || "Untitled role"}
                    {job.company ? ` · ${job.company}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Analyzed {job.analyzedAt ? new Date(job.analyzedAt).toLocaleDateString() : "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {job.matchScore !== null ? (
                    <Badge
                      tone={
                        job.matchScore >= 70
                          ? "success"
                          : job.matchScore >= 40
                            ? "warning"
                            : "muted"
                      }
                    >
                      {job.matchScore}% match
                    </Badge>
                  ) : (
                    <Badge>No skills detected</Badge>
                  )}
                  <ChevronRight className="size-4 text-muted-foreground" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

// --- Job Match Detail Component ---

type JobMatchData = Awaited<ReturnType<typeof getJobMatchDetails>>;

function JobMatchDetail({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const [data, setData] = useState<JobMatchData>(null);
  const [loading, setLoading] = useState(true);

  // Fetch on mount.
  useState(() => {
    getJobMatchDetails({ data: { jobId } }).then((result) => {
      setData(result);
      setLoading(false);
    });
  });

  if (loading) {
    return (
      <Panel title="Loading match details…">
        <div className="flex items-center justify-center py-8">
          <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </Panel>
    );
  }

  if (!data) return null;

  const structured = data.structuredData as Record<string, unknown> | null;
  const requiredSkills =
    (structured?.["requiredSkills"] as Array<{
      name: string;
      category: string;
      severity: string;
    }>) ?? [];
  const responsibilities = (structured?.["responsibilities"] as string[]) ?? [];
  const educationReqs = (structured?.["educationRequirements"] as string[]) ?? [];
  const experienceReqs = (structured?.["experienceRequirements"] as string[]) ?? [];
  const softSkills = (structured?.["softSkills"] as string[]) ?? [];
  const summary = (structured?.["summary"] as string) ?? null;

  const scoreDimensions = [
    {
      label: "Skills Match",
      score: data.matchSkillsScore,
      description: "Mandatory skills you have",
    },
    { label: "Experience", score: data.matchExperienceScore, description: "Experience level fit" },
    {
      label: "Education",
      score: data.matchEducationScore,
      description: "Education requirement fit",
    },
    {
      label: "Tools & Tech",
      score: data.matchToolsScore,
      description: "Cloud, DevOps, databases, tools",
    },
    {
      label: "Keyword Coverage",
      score: data.matchKeywordsScore,
      description: "Overall JD keyword coverage",
    },
  ];

  return (
    <Panel
      title="Match Analysis"
      description={
        data.title || data.company
          ? `${data.title || "Untitled"}${data.company ? ` at ${data.company}` : ""}`
          : "Detailed breakdown of your match"
      }
      action={
        <button
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Close
        </button>
      }
    >
      {/* Overall Score */}
      <div className="mb-6">
        <div className="flex items-end gap-2">
          <span className="text-signal text-5xl font-semibold">{data.matchScore ?? 0}%</span>
          <span className="mb-1 text-sm text-muted-foreground">overall match</span>
        </div>
        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${data.matchScore ?? 0}%` }}
          />
        </div>
      </div>

      {/* Dimension Scores */}
      <div className="mb-6">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <BarChart3 className="size-4" />
          Score Breakdown
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {scoreDimensions.map((dim) => (
            <div key={dim.label} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{dim.label}</span>
                <span
                  className={`text-sm font-semibold ${
                    (dim.score ?? 0) >= 70
                      ? "text-green-600"
                      : (dim.score ?? 0) >= 40
                        ? "text-amber-600"
                        : "text-red-600"
                  }`}
                >
                  {dim.score ?? "—"}%
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${dim.score ?? 0}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">{dim.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* AI Summary */}
      {summary && (
        <div className="mb-6 rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-sm text-muted-foreground">{summary}</p>
        </div>
      )}

      {/* Skills by Severity */}
      {requiredSkills.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            Required Skills ({requiredSkills.length})
          </h3>
          <div className="space-y-2">
            {(["mandatory", "preferred"] as const).map((severity) => {
              const skills = requiredSkills.filter((s) => s.severity === severity);
              if (skills.length === 0) return null;
              return (
                <div key={severity}>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {severity === "mandatory" ? "Must Have" : "Nice to Have"}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {skills.map((s) => (
                      <Badge key={s.name} tone={severity === "mandatory" ? "primary" : "muted"}>
                        {s.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Responsibilities */}
      {responsibilities.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-2 text-sm font-semibold text-foreground">Key Responsibilities</h3>
          <ul className="space-y-1">
            {responsibilities.slice(0, 8).map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Requirements Grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {educationReqs.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-sm font-semibold text-foreground">Education</h3>
            <ul className="space-y-1">
              {educationReqs.map((r, i) => (
                <li key={i} className="text-sm text-muted-foreground">
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}
        {experienceReqs.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-sm font-semibold text-foreground">Experience</h3>
            <ul className="space-y-1">
              {experienceReqs.map((r, i) => (
                <li key={i} className="text-sm text-muted-foreground">
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}
        {softSkills.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-sm font-semibold text-foreground">Soft Skills</h3>
            <div className="flex flex-wrap gap-1.5">
              {softSkills.map((s) => (
                <Badge key={s} tone="muted">
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      {data.scoringVersion && (
        <p className="mt-4 text-[10px] text-muted-foreground">
          Scoring model: {data.scoringVersion}
        </p>
      )}
    </Panel>
  );
}
