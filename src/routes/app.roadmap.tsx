import { createFileRoute } from "@tanstack/react-router";
import { Panel, Badge } from "@/components/worklens/Panel";

export const Route = createFileRoute("/app/roadmap")({
  head: () => ({
    meta: [
      { title: "Learning Roadmap — WorkLens" },
      {
        name: "description",
        content:
          "A personalized, gap-driven weekly roadmap that adapts as your assessment results change.",
      },
      { property: "og:title", content: "Learning Roadmap — WorkLens" },
      {
        property: "og:description",
        content: "Weekly plan generated from your skill gaps and target role.",
      },
    ],
  }),
  component: Roadmap,
});

const WEEKS = [
  { week: 1, topic: "Arrays + Strings", status: "done" },
  { week: 2, topic: "Hashing + Sliding Window", status: "done" },
  { week: 3, topic: "Trees + Graphs", status: "active" },
  { week: 4, topic: "Dynamic Programming", status: "todo" },
  { week: 5, topic: "Linux + Networking", status: "todo" },
  { week: 6, topic: "System Design", status: "todo" },
  { week: 7, topic: "Distributed Systems", status: "todo" },
  { week: 8, topic: "Production Project", status: "todo" },
];

function Roadmap() {
  return (
    <Panel
      title="8-week plan"
      description="Generated from skill gaps and available time. Adaptive regeneration arrives in Phase 12."
      action={<Badge tone="primary">Mock data</Badge>}
    >
      <ol className="relative space-y-4 border-l border-border pl-6">
        {WEEKS.map((w) => (
          <li key={w.week} className="relative">
            <span
              className={
                "absolute -left-[1.9rem] top-1.5 size-3 rounded-full border-2 border-background " +
                (w.status === "done"
                  ? "bg-success"
                  : w.status === "active"
                    ? "bg-primary"
                    : "bg-muted")
              }
            />
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
              <div>
                <p className="text-xs text-muted-foreground">Week {w.week}</p>
                <p className="font-medium">{w.topic}</p>
              </div>
              <Badge
                tone={w.status === "done" ? "success" : w.status === "active" ? "primary" : "muted"}
              >
                {w.status === "done" ? "Completed" : w.status === "active" ? "In progress" : "Upcoming"}
              </Badge>
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
