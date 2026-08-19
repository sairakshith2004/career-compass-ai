import { createFileRoute } from "@tanstack/react-router";
import { Panel, ScoreBar, Badge } from "@/components/worklens/Panel";

export const Route = createFileRoute("/app/skills")({
  head: () => ({
    meta: [
      { title: "Verified Skills — WorkLens" },
      {
        name: "description",
        content:
          "See claimed skills next to verified levels backed by projects, assessments and interviews.",
      },
      { property: "og:title", content: "Verified Skills — WorkLens" },
      {
        property: "og:description",
        content: "Claimed vs verified skill levels, backed by measurable evidence.",
      },
    ],
  }),
  component: Skills,
});

// MOCK DATA — Phase 1 only.
const SKILLS = [
  { name: "Python", claimed: "Advanced", verified: "Intermediate+", confidence: 74 },
  { name: "React", claimed: "Advanced", verified: "Advanced", confidence: 88 },
  { name: "PostgreSQL", claimed: "Intermediate", verified: "Beginner+", confidence: 46 },
  { name: "Docker", claimed: "Intermediate", verified: "Intermediate", confidence: 68 },
  { name: "System Design", claimed: "Beginner", verified: "Beginner", confidence: 31 },
];

function Skills() {
  return (
    <div className="space-y-6">
      <Panel
        title="Claimed vs verified"
        description="Verified levels combine resume evidence, assessments and interview performance."
        action={<Badge tone="primary">Mock data</Badge>}
      >
        <div className="space-y-5">
          {SKILLS.map((s) => (
            <div key={s.name} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{s.name}</span>
                <div className="flex items-center gap-2 text-xs">
                  <Badge>Claimed: {s.claimed}</Badge>
                  <Badge tone={s.confidence >= 70 ? "success" : "warning"}>
                    Verified: {s.verified}
                  </Badge>
                </div>
              </div>
              <div className="mt-3">
                <ScoreBar
                  label="Evidence confidence"
                  value={s.confidence}
                  tone={s.confidence >= 70 ? "success" : s.confidence >= 50 ? "primary" : "warning"}
                />
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
