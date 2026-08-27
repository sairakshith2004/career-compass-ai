import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, FileText, Sparkles } from "lucide-react";

import { Panel } from "@/components/worklens/Panel";
import { getSessionUser } from "@/lib/auth-guard";

export const Route = createFileRoute("/app/onboarding")({
  head: () => ({ meta: [{ title: "Welcome to WorkLens" }] }),
  loader: () => getSessionUser(),
  component: Onboarding,
});

function Onboarding() {
  const user = Route.useLoaderData();
  const firstName = user?.name?.trim().split(/\s+/)[0] ?? "there";

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex flex-col items-center text-center">
        <span className="grid size-12 place-items-center rounded-xl bg-primary/15 text-primary">
          <Sparkles className="size-6" />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Welcome, {firstName}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account is ready. Here's how WorkLens works.
        </p>
      </div>

      <Panel title="How it works">
        <ol className="space-y-3 text-sm">
          <li className="flex gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
              1
            </span>
            Upload your resume — we detect the skills you can already evidence.
          </li>
          <li className="flex gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
              2
            </span>
            Paste a job description — see your readiness score and the gaps.
          </li>
          <li className="flex gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
              3
            </span>
            Get a focused learning roadmap built from those gaps.
          </li>
        </ol>
      </Panel>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          to="/app/resume"
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <FileText className="size-4" />
          Upload your resume
        </Link>
        <Link
          to="/app"
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-input px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Go to dashboard
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}
