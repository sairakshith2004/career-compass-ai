import { createFileRoute, Link } from "@tanstack/react-router";
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
  // A URL that matches /app but no child route (e.g. /app/typo) renders this
  // inside the shell instead of TanStack's bare, unstyled "Not Found".
  notFoundComponent: AppNotFound,
});

function AppNotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <p className="text-6xl font-bold text-foreground">404</p>
      <h1 className="mt-3 text-xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link
        to="/app"
        className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
