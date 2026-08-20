import { createFileRoute, Link } from "@tanstack/react-router";
import { Panel, ScoreBar, Badge, EmptyState } from "@/components/worklens/Panel";
import { getUserSkills } from "@/lib/server-fns";
import { requireResume } from "@/lib/route-guards";

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
  // Locked until the member has a parsed resume — see route-guards.ts.
  beforeLoad: () => requireResume(),
  loader: () => getUserSkills(),
  component: Skills,
});

function toneFor(confidence: number) {
  return confidence >= 80 ? "success" : confidence >= 60 ? "primary" : "warning";
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function Skills() {
  const userSkills = Route.useLoaderData();

  return (
    <div className="space-y-6">
      <Panel
        title="Your skills"
        description="Resume confidence reflects how often a skill was mentioned. Verified levels come from assessments you've taken."
        action={
          <Link to="/app/assessments" className="text-xs text-primary hover:underline">
            Take an assessment →
          </Link>
        }
      >
        {userSkills.length === 0 ? (
          <EmptyState
            title="No skills detected"
            description="Your resume didn't mention any skills from our catalog by name — try re-uploading a more detailed resume."
          />
        ) : (
          <div className="space-y-5">
            {userSkills.map((s) => (
              <div key={s.slug} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{s.name}</span>
                  <div className="flex items-center gap-2">
                    {s.category && <Badge>{s.category}</Badge>}
                    {s.verifiedLevel && (
                      <Badge tone="success">Verified: {capitalize(s.verifiedLevel)}</Badge>
                    )}
                  </div>
                </div>
                <div className="mt-3 space-y-3">
                  {s.resumeConfidence !== null && (
                    <ScoreBar
                      label="Resume confidence"
                      value={s.resumeConfidence}
                      tone={toneFor(s.resumeConfidence)}
                    />
                  )}
                  {s.verifiedConfidence !== null && (
                    <ScoreBar
                      label="Assessment score"
                      value={s.verifiedConfidence}
                      tone={toneFor(s.verifiedConfidence)}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
