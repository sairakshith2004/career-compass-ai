import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

import { getCurrentUser } from "@/lib/server-fns";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WorkLens — AI Career Intelligence" },
      {
        name: "description",
        content: "Find out if you're actually ready for your target job — and what to do next.",
      },
    ],
  }),
  // Signed-in members skip the landing page entirely — this route is only for
  // unauthenticated visitors choosing between "Get Started" and "Sign In".
  beforeLoad: async () => {
    const user = await getCurrentUser();
    if (user) throw redirect({ to: "/app" });
  },
  component: Landing,
});

function Landing() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <span className="grid size-12 place-items-center rounded-xl bg-primary/15 text-primary">
        <Sparkles className="size-6" />
      </span>
      <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
        Work<span className="text-primary">Lens</span>
      </h1>
      <p className="mt-2 text-base text-muted-foreground">AI Career Intelligence</p>
      <p className="mt-4 max-w-md text-sm text-muted-foreground">
        Find out if you're actually ready for your target job — upload your resume, analyze real
        postings, and see exactly what's missing.
      </p>

      <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
        <Link
          to="/signup"
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
        >
          Get Started
        </Link>
        <Link
          to="/login"
          className="w-full rounded-lg border border-input px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Sign In
        </Link>
      </div>
    </div>
  );
}
