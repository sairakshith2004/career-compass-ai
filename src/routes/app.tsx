import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/worklens/AppShell";
import { requireAuth } from "@/lib/auth-guard";
import { getLatestResume } from "@/lib/server-fns";

export const Route = createFileRoute("/app")({
  // Auth gate for the whole /app subtree. This is the routing-side guard (UX);
  // every server function under /app still enforces auth itself — see
  // requireUser in src/lib/auth-guard.ts.
  beforeLoad: ({ location }) => requireAuth({ data: location.href }),
  // Drives the sidebar's lock icons on gated sections (see nav-items.ts) — the
  // actual enforcement is each gated route's own `beforeLoad` (route-guards.ts).
  loader: async () => ({ hasResume: Boolean(await getLatestResume()) }),
  component: AppShell,
});
