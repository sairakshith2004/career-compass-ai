import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { Panel, Badge, EmptyState } from "@/components/worklens/Panel";
import { completeRoadmapWeek, generateRoadmap, getRoadmap } from "@/lib/server-fns";
import { requireResume } from "@/lib/route-guards";

export const Route = createFileRoute("/app/roadmap")({
  head: () => ({
    meta: [
      { title: "Learning Roadmap — WorkLens" },
      {
        name: "description",
        content: "A weekly roadmap generated from your real skill gaps against analyzed jobs.",
      },
      { property: "og:title", content: "Learning Roadmap — WorkLens" },
      {
        property: "og:description",
        content: "Weekly plan generated from your skill gaps.",
      },
    ],
  }),
  // Locked until the member has a parsed resume — see route-guards.ts.
  beforeLoad: () => requireResume(),
  loader: () => getRoadmap(),
  component: Roadmap,
});

function Roadmap() {
  const { roadmap, gapsAvailable } = Route.useLoaderData();
  const router = useRouter();

  const generate = useMutation({
    mutationFn: () => generateRoadmap(),
    onSuccess: async () => {
      toast.success("Roadmap generated from your skill gaps");
      await router.invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Couldn't generate a roadmap — try again");
    },
  });

  const complete = useMutation({
    mutationFn: (itemId: string) => completeRoadmapWeek({ data: { itemId } }),
    onSuccess: async () => {
      await router.invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Couldn't update that week — try again");
    },
  });

  if (!roadmap) {
    if (gapsAvailable === 0) {
      return (
        <Panel title="Learning roadmap">
          <EmptyState
            title="Analyze a job to generate your roadmap"
            description="Your roadmap is built week-by-week from the skills your analyzed jobs require that your resume doesn't show yet."
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
      <Panel title="Learning roadmap">
        <EmptyState
          title={`Generate your ${gapsAvailable}-week roadmap`}
          description="One week per skill gap, highest-impact first — same gaps as your dashboard."
          action={
            <button
              onClick={() => generate.mutate()}
              disabled={generate.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {generate.isPending ? "Generating…" : "Generate roadmap"}
            </button>
          }
        />
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel
        title={`${roadmap.items.length}-week plan`}
        description={
          roadmap.targetRole
            ? `Toward ${roadmap.targetRole}, from your skill gaps.`
            : "Generated from your skill gaps."
        }
        action={
          gapsAvailable > 0 ? (
            <button
              onClick={() => generate.mutate()}
              disabled={generate.isPending}
              className="rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              {generate.isPending ? "Regenerating…" : "Regenerate"}
            </button>
          ) : undefined
        }
      >
        {roadmap.status === "completed" && (
          <div className="mb-4">
            <Badge tone="success">Roadmap complete</Badge>
          </div>
        )}
        <ol className="relative space-y-4 border-l border-border pl-6">
          {roadmap.items.map((w) => (
            <li key={w.id} className="relative">
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
                <div className="flex items-center gap-2">
                  <Badge
                    tone={
                      w.status === "done" ? "success" : w.status === "active" ? "primary" : "muted"
                    }
                  >
                    {w.status === "done"
                      ? "Completed"
                      : w.status === "active"
                        ? "In progress"
                        : "Upcoming"}
                  </Badge>
                  {w.status === "active" && (
                    <button
                      onClick={() => complete.mutate(w.id)}
                      disabled={complete.isPending}
                      className="rounded-md border border-input px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
                    >
                      Mark complete
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
