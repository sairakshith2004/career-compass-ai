import { createFileRoute } from "@tanstack/react-router";
import { ClipboardCheck } from "lucide-react";
import { Panel, EmptyState, Badge } from "@/components/worklens/Panel";

export const Route = createFileRoute("/app/assessments")({
  head: () => ({
    meta: [
      { title: "Skill Assessments — WorkLens" },
      {
        name: "description",
        content:
          "Take technical and coding assessments that turn claimed skills into verified skill levels.",
      },
      { property: "og:title", content: "Skill Assessments — WorkLens" },
      {
        property: "og:description",
        content: "Technical and coding assessments that produce verified skill evidence.",
      },
    ],
  }),
  component: Assessments,
});

const CATALOG = [
  { name: "Python Fundamentals", type: "MCQ", minutes: 20 },
  { name: "DSA — Arrays & Strings", type: "Coding", minutes: 45 },
  { name: "SQL & Data Modeling", type: "MCQ", minutes: 25 },
  { name: "Backend System Design", type: "Written", minutes: 40 },
];

function Assessments() {
  return (
    <div className="space-y-6">
      <Panel title="Available assessments" action={<Badge>Catalog preview</Badge>}>
        <ul className="grid gap-3 sm:grid-cols-2">
          {CATALOG.map((a) => (
            <li
              key={a.name}
              className="rounded-lg border border-border p-4 transition-colors hover:border-primary/50"
            >
              <p className="font-medium">{a.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {a.type} · {a.minutes} min
              </p>
              <button
                disabled
                className="mt-3 rounded-md border border-input px-3 py-1.5 text-xs text-muted-foreground disabled:opacity-60"
              >
                Start (Phase 9)
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Your attempts">
        <EmptyState
          icon={<ClipboardCheck className="size-6" />}
          title="No attempts recorded"
          description="Scores, per-skill breakdowns and verification deltas will show up here."
        />
      </Panel>
    </div>
  );
}
