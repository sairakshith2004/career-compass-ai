import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, ExternalLink, Filter, GraduationCap, Search, Target, X } from "lucide-react";

import { Panel, Badge, EmptyState } from "@/components/worklens/Panel";
import { getTutorials } from "@/lib/tutorials-fns";
import { LEVEL_META, type Tutorial } from "@/lib/tutorials-catalog";
import type { TutorialRecommendation } from "@/lib/tutorials.server";
import { requireResume } from "@/lib/route-guards";

export const Route = createFileRoute("/app/tutorials")({
  head: () => ({
    meta: [
      { title: "Tutorials — WorkLens" },
      {
        name: "description",
        content:
          "YouTube tutorial courses picked from your resume skills and the jobs you've analyzed.",
      },
      { property: "og:title", content: "Tutorials — WorkLens" },
      {
        property: "og:description",
        content: "Curated learning videos for the exact skills your target jobs want.",
      },
    ],
  }),
  // Locked until the member has a parsed resume — see route-guards.ts.
  beforeLoad: () => requireResume(),
  loader: () => getTutorials(),
  component: Tutorials,
});

const LEVEL_TONE: Record<Tutorial["level"], string> = {
  beginner: "border-success/40 text-success hover:bg-success/10",
  intermediate: "border-primary/40 text-primary hover:bg-primary/10",
  advanced: "border-warning/40 text-warning hover:bg-warning/10",
  interview: "border-border text-muted-foreground hover:bg-muted",
};

function TutorialCard({ rec }: { rec: TutorialRecommendation }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{rec.skillName}</span>
            {rec.category && <Badge>{rec.category}</Badge>}
            {rec.currentLevel && <Badge tone="primary">you: {rec.currentLevel}</Badge>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{rec.reasonLabel}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {rec.tutorials.map((t) => (
          <a
            key={t.level}
            href={t.url}
            target="_blank"
            rel="noopener noreferrer"
            title={`Search YouTube: ${t.query}`}
            className={
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors " +
              LEVEL_TONE[t.level]
            }
          >
            {LEVEL_META[t.level].label}
            <ExternalLink className="size-3" />
          </a>
        ))}
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  icon,
  recs,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  recs: TutorialRecommendation[];
}) {
  if (recs.length === 0) return null;
  return (
    <Panel title={title} description={description}>
      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{recs.length} skills</span>
      </div>
      <div className="space-y-3">
        {recs.map((r) => (
          <TutorialCard key={`${r.reason}-${r.skillSlug}`} rec={r} />
        ))}
      </div>
    </Panel>
  );
}

function Tutorials() {
  const data = Route.useLoaderData();
  const [search, setSearch] = useState("");

  const { jobGaps, resumeSkills, targetRole } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const match = (r: TutorialRecommendation) =>
      !q ||
      r.skillName.toLowerCase().includes(q) ||
      Boolean(r.category && r.category.toLowerCase().includes(q));
    return {
      jobGaps: data.jobGaps.filter(match),
      resumeSkills: data.resumeSkills.filter(match),
      targetRole: data.targetRole.filter(match),
    };
  }, [data, search]);

  const totalRecs = data.jobGaps.length + data.resumeSkills.length + data.targetRole.length;
  const visible = jobGaps.length + resumeSkills.length + targetRole.length;

  if (totalRecs === 0) {
    return (
      <Panel title="Tutorials">
        <EmptyState
          icon={<GraduationCap className="size-6" />}
          title="No tutorial picks yet"
          description={
            data.analyzedJobCount === 0
              ? "Analyze a job description — we'll pull YouTube courses for every skill it needs that your resume doesn't show yet."
              : "Your resume already covers the skills your analyzed jobs want. Analyze another job or add a target role to get fresh picks."
          }
          action={
            <Link
              to="/app/jobs"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Analyze a job
            </Link>
          }
        />
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel
        title="Your tutorial plan"
        description="Every link opens a YouTube search for a current, top-rated course — no dead videos."
      >
        <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm">
          <Search className="size-4 text-muted-foreground" />
          <input
            className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
            placeholder="Filter skills…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        {search && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Filter className="size-3" />
            {visible} of {totalRecs} skills match
          </p>
        )}
      </Panel>

      <Section
        title="From your job descriptions"
        description="Skills the roles you analyzed require that your resume doesn't show yet — most-wanted first."
        icon={<BookOpen className="size-3.5" />}
        recs={jobGaps}
      />
      <Section
        title="Strengthen your resume skills"
        description="You already list these — level them up from beginner to job-ready."
        icon={<GraduationCap className="size-3.5" />}
        recs={resumeSkills}
      />
      <Section
        title={
          data.primaryRoleName
            ? `For your target role: ${data.primaryRoleName}`
            : "For your target role"
        }
        description="Core skills your primary target role expects that you don't hold yet."
        icon={<Target className="size-3.5" />}
        recs={targetRole}
      />

      <Panel title="Keep going">
        <div className="flex flex-wrap gap-3">
          <Link
            to="/app/roadmap"
            className="inline-flex items-center gap-2 rounded-lg border border-input px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            See your roadmap
          </Link>
          <Link
            to="/app/jobs"
            className="inline-flex items-center gap-2 rounded-lg border border-input px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Analyze another job
          </Link>
        </div>
      </Panel>
    </div>
  );
}
