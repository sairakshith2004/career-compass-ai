import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import { toast } from "sonner";

import { Panel, EmptyState, Badge } from "@/components/worklens/Panel";
import { getAssessmentQuestions, listAssessments, submitAssessment } from "@/lib/server-fns";
import { requireResume } from "@/lib/route-guards";

export const Route = createFileRoute("/app/assessments")({
  head: () => ({
    meta: [
      { title: "Skill Assessments — WorkLens" },
      {
        name: "description",
        content: "Take technical assessments that turn claimed skills into verified skill levels.",
      },
      { property: "og:title", content: "Skill Assessments — WorkLens" },
      {
        property: "og:description",
        content: "Short technical assessments that produce verified skill evidence.",
      },
    ],
  }),
  // Locked until the member has a parsed resume — see route-guards.ts.
  beforeLoad: () => requireResume(),
  loader: () => listAssessments(),
  component: Assessments,
});

function Quiz({ slug, onDone }: { slug: string; onDone: () => void }) {
  const router = useRouter();
  const query = useQuery({
    queryKey: ["assessment-questions", slug],
    queryFn: () => getAssessmentQuestions({ data: { slug } }),
  });
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<{ score: number; correct: number; total: number } | null>(
    null,
  );

  const mutation = useMutation({
    mutationFn: () => submitAssessment({ data: { slug, answers } }),
    onSuccess: async (res) => {
      setResult(res);
      toast.success(`Scored ${res.score}% — verified level: ${res.verifiedLevel}`);
      await router.invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Couldn't submit that attempt — try again");
    },
  });

  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading questions…</p>;
  }
  if (query.isError || !query.data) {
    return <p className="text-sm text-destructive">Couldn't load this assessment.</p>;
  }

  const { name, questions } = query.data;
  const allAnswered = questions.every((q) => answers[q.id] !== undefined);

  if (result) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-border p-4 text-center">
          <p className="text-3xl font-semibold text-signal">{result.score}%</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.correct} of {result.total} correct
          </p>
        </div>
        <button
          onClick={onDone}
          className="w-full rounded-lg border border-input px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Back to assessments
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm font-medium">{name}</p>
      {questions.map((q, i) => (
        <div key={q.id}>
          <p className="text-sm">
            {i + 1}. {q.prompt}
          </p>
          <div className="mt-2 space-y-1.5">
            {q.options.map((option, optionIndex) => (
              <label
                key={optionIndex}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
              >
                <input
                  type="radio"
                  name={q.id}
                  checked={answers[q.id] === optionIndex}
                  onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: optionIndex }))}
                  className="accent-primary"
                />
                {option}
              </label>
            ))}
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <button
          onClick={() => mutation.mutate()}
          disabled={!allAnswered || mutation.isPending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {mutation.isPending ? "Submitting…" : "Submit answers"}
        </button>
        <button
          onClick={onDone}
          className="rounded-lg border border-input px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Assessments() {
  const catalog = Route.useLoaderData();
  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  if (activeSlug) {
    return (
      <div className="space-y-6">
        <Panel title="Assessment">
          <Quiz slug={activeSlug} onDone={() => setActiveSlug(null)} />
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Panel title="Available assessments" description="Each one verifies a single skill.">
        <ul className="grid gap-3 sm:grid-cols-2">
          {catalog.map((a) => (
            <li
              key={a.slug}
              className="rounded-lg border border-border p-4 transition-colors hover:border-primary/50"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{a.name}</p>
                {a.bestScore !== null && <Badge tone="success">{a.bestScore}%</Badge>}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {a.type.toUpperCase()} · {a.durationMinutes} min
                {a.skillName ? ` · verifies ${a.skillName}` : ""}
              </p>
              {a.description && (
                <p className="mt-2 text-xs text-muted-foreground">{a.description}</p>
              )}
              <button
                onClick={() => setActiveSlug(a.slug)}
                className="mt-3 rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                {a.bestScore !== null ? "Retake" : "Start"}
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      {catalog.every((a) => a.bestScore === null) && (
        <Panel title="Your attempts">
          <EmptyState
            icon={<ClipboardCheck className="size-6" />}
            title="No attempts yet"
            description="Take an assessment above — a scored attempt shows up as a verified level on your Skills page."
          />
        </Panel>
      )}
    </div>
  );
}
