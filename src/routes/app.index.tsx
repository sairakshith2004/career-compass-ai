import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, FileText, Target, AlertTriangle, XCircle } from "lucide-react";
import { Panel, Badge, EmptyState } from "@/components/worklens/Panel";
import { getDashboardData } from "@/lib/server-fns";

export const Route = createFileRoute("/app/")({
  head: () => ({
    meta: [
      { title: "Dashboard — WorkLens Career Intelligence" },
      {
        name: "description",
        content:
          "Track job readiness, verified skills, skill gaps and learning progress in one WorkLens dashboard.",
      },
      { property: "og:title", content: "Dashboard — WorkLens" },
      {
        property: "og:description",
        content: "Job readiness score, verified skills and skill gaps at a glance.",
      },
    ],
  }),
  loader: () => getDashboardData(),
  component: Dashboard,
});

function Dashboard() {
  const data = Route.useLoaderData();

  if (!data.signedIn) {
    return (
      <Panel title="Dashboard">
        <EmptyState
          icon={<Target className="size-6" />}
          title="Sign in to see your dashboard"
          description="Your job readiness score is computed from your resume and the jobs you analyze — sign in to get started."
          action={
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Sign in
            </Link>
          }
        />
      </Panel>
    );
  }

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-sm text-muted-foreground">Target role</p>
        <h2 className="text-2xl font-semibold tracking-tight">
          {data.targetRole ?? (
            <span className="text-muted-foreground">
              Not set —{" "}
              <Link to="/app/settings" className="text-primary hover:underline">
                configure in Settings
              </Link>
            </span>
          )}
        </h2>
      </div>
      <Link
        to="/app/jobs"
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        Analyze a job <ArrowRight className="size-4" />
      </Link>
    </div>
  );

  if (!data.hasResume) {
    return (
      <div className="space-y-6">
        {header}
        <Panel title="Get started">
          <EmptyState
            icon={<FileText className="size-6" />}
            title="Upload your resume to get started"
            description="Once it's parsed, we'll detect your skills and — after you analyze a job — show your readiness score and gaps here."
            action={
              <Link
                to="/app/resume"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Upload resume <ArrowRight className="size-4" />
              </Link>
            }
          />
        </Panel>
      </div>
    );
  }

  if (!data.hasJobs) {
    return (
      <div className="space-y-6">
        {header}
        <Panel
          title="Skills detected in your resume"
          description="Analyze a job description to see your readiness score against it."
        >
          {data.resumeSkills.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {data.resumeSkills.map((s) => (
                <Badge key={s.slug} tone="primary">
                  {s.name}
                </Badge>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No recognizable skills found"
              description="Your resume didn't mention any catalog skills by name. You can still analyze a job — just re-upload a more detailed resume for a real match score."
            />
          )}
        </Panel>
        <Panel title="Next action">
          <Link
            to="/app/jobs"
            className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm transition-colors hover:border-primary/50 hover:bg-muted"
          >
            <span className="flex items-center gap-2">
              <Target className="size-4 text-primary" />
              Analyze a job to see your readiness score
            </span>
            <ArrowRight className="size-4 text-muted-foreground" />
          </Link>
        </Panel>
      </div>
    );
  }

  const { latestJob, gaps, jobsAnalyzedCount } = data;

  return (
    <div className="space-y-6">
      {header}

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Job readiness" className="lg:col-span-1">
          <div className="flex items-end gap-2">
            <span className="text-signal text-5xl font-semibold">{latestJob.matchScore ?? 0}%</span>
          </div>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${latestJob.matchScore ?? 0}%` }}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Skills your resume matches, out of the skills detected in{" "}
            {latestJob.title || "your most recently analyzed job"}
            {latestJob.company ? ` at ${latestJob.company}` : ""}. Based on {jobsAnalyzedCount} job
            {jobsAnalyzedCount === 1 ? "" : "s"} analyzed.
          </p>
        </Panel>

        <Panel title="Required skills for this role" className="lg:col-span-2">
          {latestJob.requiredSkills.length === 0 ? (
            <EmptyState
              title="No catalog skills detected"
              description="This job description didn't mention any skills we recognize."
            />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {latestJob.requiredSkills.map((s) => (
                <li key={s.name} className="flex items-center gap-2 text-sm">
                  {s.matched ? (
                    <CheckCircle2 className="size-4 shrink-0 text-success" />
                  ) : (
                    <XCircle className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className={s.matched ? "" : "text-muted-foreground"}>{s.name}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Top skill gaps"
          description="Missing skills, ranked by how many of your analyzed jobs require them"
        >
          {gaps.length === 0 ? (
            <EmptyState
              title="No gaps found"
              description="Your resume covers every catalog skill mentioned across your analyzed jobs."
            />
          ) : (
            <ul className="divide-y divide-border">
              {gaps.map((g) => (
                <li key={g.name} className="flex items-center justify-between py-3 text-sm">
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="size-4 text-warning" />
                    {g.name}
                  </span>
                  <Badge tone={g.impact === "High" ? "warning" : "muted"}>{g.impact} impact</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Next actions">
          <ul className="space-y-3 text-sm">
            {[
              { to: "/app/jobs", text: "Analyze another job to widen your readiness picture" },
              { to: "/app/resume", text: "Re-upload your resume after adding new skills" },
              { to: "/app/roadmap", text: "Generate an 8-week roadmap from your gaps" },
            ].map((a) => (
              <li key={a.to}>
                <Link
                  to={a.to}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 transition-colors hover:border-primary/50 hover:bg-muted"
                >
                  <span className="flex items-center gap-2">
                    <Target className="size-4 text-primary" />
                    {a.text}
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
