import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { ArrowRight, TrendingUp, Target, AlertTriangle } from "lucide-react";
import { Panel, ScoreBar, Badge } from "@/components/worklens/Panel";

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
  component: Dashboard,
});

// MOCK DATA — Phase 1 only. Replaced by real API reads in Phase 2+.
const READINESS = 78;
const BREAKDOWN = [
  { label: "Technical Skills", value: 82 },
  { label: "DSA", value: 64 },
  { label: "System Design", value: 71 },
  { label: "Cloud", value: 62 },
  { label: "Projects", value: 88 },
  { label: "Communication", value: 84 },
];
const GAPS = [
  { skill: "System Design", impact: "High" },
  { skill: "Distributed Systems", impact: "High" },
  { skill: "Kubernetes", impact: "Medium" },
];

function Dashboard() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Target role</p>
          <h2 className="text-2xl font-semibold tracking-tight">
            Backend / AI Engineer <Badge tone="primary">Mock data</Badge>
          </h2>
        </div>
        <Link
          to="/app/jobs"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Analyze a job <ArrowRight className="size-4" />
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Job readiness" className="lg:col-span-1">
          <div className="flex items-end gap-2">
            <span className="text-signal text-5xl font-semibold">{READINESS}%</span>
            <span className="mb-2 inline-flex items-center gap-1 text-xs text-success">
              <TrendingUp className="size-3" /> +6 this month
            </span>
          </div>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${READINESS}%` }}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Composite of verified skills, assessments and project evidence. Scoring model is
            defined in Phase 6 — this figure is illustrative.
          </p>
        </Panel>

        <Panel title="Readiness breakdown" className="lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            {BREAKDOWN.map((b) => (
              <ScoreBar
                key={b.label}
                label={b.label}
                value={b.value}
                tone={b.value >= 80 ? "success" : b.value >= 70 ? "primary" : "warning"}
              />
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Top skill gaps" description="Ranked by impact on your target role">
          <ul className="divide-y divide-border">
            {GAPS.map((g) => (
              <li key={g.skill} className="flex items-center justify-between py-3 text-sm">
                <span className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-warning" />
                  {g.skill}
                </span>
                <Badge tone={g.impact === "High" ? "warning" : "muted"}>{g.impact} impact</Badge>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Next actions">
          <ul className="space-y-3 text-sm">
            {[
              { to: "/app/resume", text: "Upload a resume to seed your skill profile" },
              { to: "/app/assessments", text: "Take a DSA assessment to verify claimed skills" },
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
