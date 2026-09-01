import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Award,
  BookOpen,
  Filter,
  TrendingUp,
  X,
} from "lucide-react";

import { Panel, ScoreBar, Badge, EmptyState, Skeleton } from "@/components/worklens/Panel";
import { getUserSkills, getSkillCategories, getSkillHistory } from "@/lib/server-fns";
import { requireResume } from "@/lib/route-guards";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/skills")({
  head: () => ({
    meta: [
      { title: "Skills — WorkLens" },
      {
        name: "description",
        content:
          "Skills detected in your resume, plus verified levels from assessments you've taken.",
      },
      { property: "og:title", content: "Skills — WorkLens" },
      {
        property: "og:description",
        content: "Resume-detected skills next to assessment-verified levels.",
      },
    ],
  }),
  beforeLoad: () => requireResume(),
  loader: async () => {
    const [skills, categories] = await Promise.all([getUserSkills(), getSkillCategories()]);
    return { skills, categories };
  },
  component: Skills,
});

const LEVEL_ORDER = ["beginner", "intermediate", "advanced", "expert"] as const;
const LEVEL_COLORS: Record<string, string> = {
  beginner: "text-warning",
  intermediate: "text-primary",
  advanced: "text-success",
  expert: "text-signal",
};

function levelRank(level: string | null): number {
  if (!level) return -1;
  return LEVEL_ORDER.indexOf(level as (typeof LEVEL_ORDER)[number]);
}

function levelLabel(level: string | null): string {
  if (!level) return "—";
  return level.charAt(0).toUpperCase() + level.slice(1);
}

function toneFor(confidence: number) {
  return confidence >= 80 ? "success" : confidence >= 60 ? "primary" : "warning";
}

function SkillDetail({
  skill,
  onHistoryToggle,
  showHistory,
}: {
  skill: (typeof getUserSkills extends () => Promise<infer R> ? R : never)[number];
  onHistoryToggle: () => void;
  showHistory: boolean;
}) {
  const historyQuery = useQuery({
    queryKey: ["skill-history", skill.slug],
    queryFn: () => getSkillHistory({ data: { slug: skill.slug } }),
    enabled: showHistory,
  });

  const hasResume = skill.resumeConfidence !== null;
  const hasVerified = skill.verifiedLevel !== null;
  const currentLevel = skill.currentLevel;
  const claimedLevel = skill.claimedLevel;

  return (
    <div className="rounded-lg border border-border p-4 transition-colors hover:border-primary/30">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium">{skill.name}</span>
          {skill.category && <Badge>{skill.category}</Badge>}
        </div>
        <div className="flex items-center gap-2">
          {hasVerified && (
            <Badge tone="success">
              <CheckCircle2 className="mr-1 size-3" />
              Verified: {levelLabel(skill.verifiedLevel)}
            </Badge>
          )}
          {!hasVerified && currentLevel && <Badge tone="primary">{levelLabel(currentLevel)}</Badge>}
        </div>
      </div>

      {/* Evidence bars */}
      <div className="mt-3 space-y-3">
        {hasResume && (
          <ScoreBar
            label="Resume confidence"
            value={skill.resumeConfidence!}
            tone={toneFor(skill.resumeConfidence!)}
          />
        )}
        {hasVerified && skill.verifiedConfidence !== null && (
          <ScoreBar
            label="Assessment score"
            value={skill.verifiedConfidence}
            tone={toneFor(skill.verifiedConfidence)}
          />
        )}
      </div>

      {/* Claimed vs Verified comparison */}
      {(claimedLevel || hasVerified) && (
        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
          {claimedLevel && (
            <span className="flex items-center gap-1">
              <BookOpen className="size-3" />
              Claimed: {levelLabel(claimedLevel)}
            </span>
          )}
          {hasVerified && (
            <span className="flex items-center gap-1">
              <Award className="size-3" />
              Verified: {levelLabel(skill.verifiedLevel)}
            </span>
          )}
          {claimedLevel &&
            hasVerified &&
            levelRank(skill.verifiedLevel) > levelRank(claimedLevel) && (
              <span className="flex items-center gap-1 text-success">
                <TrendingUp className="size-3" />
                Assessment raised level
              </span>
            )}
        </div>
      )}

      {/* Evidence details */}
      {skill.evidence && skill.evidence.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-muted-foreground">Evidence</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {skill.evidence.map((e, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs"
              >
                <span className="text-muted-foreground">{e.kind}:</span> {e.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* History toggle */}
      <button
        onClick={onHistoryToggle}
        className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Clock className="size-3" />
        {showHistory ? "Hide" : "Show"} history
        {showHistory ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
      </button>

      {/* History */}
      {showHistory && (
        <div className="mt-2 rounded-md bg-muted/50 p-3">
          {historyQuery.isLoading && <Skeleton className="h-8 w-full" />}
          {historyQuery.isError && (
            <p className="text-xs text-destructive">Couldn't load history.</p>
          )}
          {historyQuery.data && historyQuery.data.length === 0 && (
            <p className="text-xs text-muted-foreground">No level changes recorded yet.</p>
          )}
          {historyQuery.data && historyQuery.data.length > 0 && (
            <ol className="space-y-2">
              {historyQuery.data.map((h, i) => (
                <li key={i} className="flex items-center gap-2 text-xs">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      h.newLevel && levelRank(h.newLevel) > levelRank(h.previousLevel)
                        ? "bg-success"
                        : "bg-muted-foreground",
                    )}
                  />
                  <span className="text-muted-foreground">
                    {h.previousLevel ? levelLabel(h.previousLevel) : "—"} →{" "}
                    <span className="font-medium text-foreground">{levelLabel(h.newLevel)}</span>
                  </span>
                  <span className="text-muted-foreground">({h.source})</span>
                  {h.reason && <span className="text-muted-foreground">— {h.reason}</span>}
                  <span className="ml-auto text-muted-foreground">
                    {h.createdAt ? new Date(h.createdAt).toLocaleDateString() : ""}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

function Skills() {
  const { skills, categories } = Route.useLoaderData();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());

  const categoryNames = useMemo(() => categories.map((c) => c.name).sort(), [categories]);

  const filteredSkills = useMemo(() => {
    let result = skills;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) || (s.category && s.category.toLowerCase().includes(q)),
      );
    }
    if (categoryFilter) {
      result = result.filter((s) => s.category === categoryFilter);
    }
    return result;
  }, [skills, search, categoryFilter]);

  const stats = useMemo(() => {
    const total = skills.length;
    const verified = skills.filter((s) => s.verifiedLevel != null).length;
    const resumeBased = skills.filter((s) => s.resumeConfidence != null).length;
    const avgConfidence =
      skills.length > 0
        ? Math.round(
            skills
              .map((s) => s.resumeConfidence ?? s.verifiedConfidence ?? 0)
              .reduce((a, b) => a + b, 0) / skills.length,
          )
        : 0;
    return { total, verified, resumeBased, avgConfidence };
  }, [skills]);

  function toggleHistory(slug: string) {
    setExpandedHistory((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {/* Stats overview */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Panel title="Total skills">
          <p className="text-3xl font-semibold tracking-tight">{stats.total}</p>
          <p className="mt-1 text-xs text-muted-foreground">Detected across all sources</p>
        </Panel>
        <Panel title="Verified">
          <p className="text-3xl font-semibold tracking-tight text-success">{stats.verified}</p>
          <p className="mt-1 text-xs text-muted-foreground">Confirmed by assessments</p>
        </Panel>
        <Panel title="Resume-based">
          <p className="text-3xl font-semibold tracking-tight text-primary">{stats.resumeBased}</p>
          <p className="mt-1 text-xs text-muted-foreground">Detected from your resume</p>
        </Panel>
        <Panel title="Avg confidence">
          <p className="text-3xl font-semibold tracking-tight">{stats.avgConfidence}%</p>
          <p className="mt-1 text-xs text-muted-foreground">Across all skills</p>
        </Panel>
      </div>

      {/* Search and filter */}
      <Panel title="Your skills">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm flex-1 min-w-[200px]">
            <Search className="size-4 text-muted-foreground" />
            <input
              className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
              placeholder="Search skills…"
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
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-muted-foreground" />
            <select
              value={categoryFilter ?? ""}
              onChange={(e) => setCategoryFilter(e.target.value || null)}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">All categories</option>
              {categoryNames.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filteredSkills.length === 0 ? (
          <EmptyState
            title={search || categoryFilter ? "No skills match your filter" : "No skills detected"}
            description={
              search || categoryFilter
                ? "Try adjusting your search or filter."
                : "Your resume didn't mention any skills from our catalog by name — try re-uploading a more detailed resume."
            }
          />
        ) : (
          <div className="space-y-3">
            {filteredSkills.map((s) => (
              <SkillDetail
                key={s.slug}
                skill={s}
                onHistoryToggle={() => toggleHistory(s.slug)}
                showHistory={expandedHistory.has(s.slug)}
              />
            ))}
          </div>
        )}
      </Panel>

      {/* Category breakdown */}
      {categories.length > 0 && (
        <Panel
          title="Category breakdown"
          description="How your skills are distributed across domains."
        >
          <div className="space-y-3">
            {categories.map((cat) => (
              <div key={cat.name} className="flex items-center gap-3">
                <div className="min-w-[120px] text-sm font-medium">{cat.name}</div>
                <div className="flex-1">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${Math.round((cat.skills.length / Math.max(...categories.map((c) => c.skills.length))) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{cat.skills.length} skills</span>
                  {cat.verifiedCount > 0 && (
                    <Badge tone="success">{cat.verifiedCount} verified</Badge>
                  )}
                  <span>{cat.avgConfidence}% avg</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* CTA */}
      <Panel title="Improve your skill evidence">
        <div className="flex flex-wrap gap-3">
          <Link
            to="/app/assessments"
            className="inline-flex items-center gap-2 rounded-lg border border-input px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Take an assessment
          </Link>
          <Link
            to="/app/resume"
            className="inline-flex items-center gap-2 rounded-lg border border-input px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Re-upload resume
          </Link>
        </div>
      </Panel>
    </div>
  );
}
