import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/worklens/AppShell";
import { getLatestResume } from "@/lib/server-fns";

export const Route = createFileRoute("/app")({
  // Drives the sidebar's lock icons on gated sections (see nav-items.ts) — the actual
  // enforcement is each gated route's own `beforeLoad` (route-guards.ts), this is just
  // the affordance so members see what's locked before they click into it.
  loader: async () => ({ hasResume: Boolean(await getLatestResume()) }),
  component: AppShell,
});
