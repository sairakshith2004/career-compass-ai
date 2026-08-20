import { useState } from "react";
import { getRouteApi, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Menu, X, Sparkles, Bell, Search, Lock } from "lucide-react";
import { NAV_ITEMS } from "./nav-items";
import { signOut, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

// Component file is separate from the route file (app.tsx) — getRouteApi reads that
// route's loader data without a circular import between the two.
const appRoute = getRouteApi("/app");

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function AccountMenu() {
  const { data, isPending } = useSession();
  const user = data?.user;

  if (isPending) {
    return <span className="size-8 animate-pulse rounded-full bg-muted" />;
  }

  if (!user) {
    return (
      <Link
        to="/login"
        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
      >
        Sign in
      </Link>
    );
  }

  return (
    <button
      onClick={() =>
        signOut({ fetchOptions: { onSuccess: () => window.location.assign("/login") } })
      }
      title={`Signed in as ${user.email} — click to sign out`}
      className="grid size-8 place-items-center overflow-hidden rounded-full bg-primary/15 text-xs font-semibold text-primary hover:opacity-80"
    >
      {user.image ? (
        <img src={user.image} alt={user.name} className="size-full object-cover" />
      ) : (
        initials(user.name)
      )}
    </button>
  );
}

function Brand() {
  return (
    <Link to="/app" className="flex items-center gap-2.5 px-2 py-1">
      <span className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary">
        <Sparkles className="size-4" />
      </span>
      <span className="text-base font-semibold tracking-tight">
        Work<span className="text-primary">Lens</span>
      </span>
    </Link>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { hasResume } = appRoute.useLoaderData();

  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ to, label, icon: Icon, gated }) => {
        const locked = gated && !hasResume;
        return (
          <Link
            key={to}
            to={to}
            // activeOptions.exact keeps "/app" from staying active on child routes.
            activeOptions={{ exact: to === "/app" }}
            onClick={onNavigate}
            title={locked ? "Upload your resume to unlock this section" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              locked && "text-sidebar-foreground/50",
            )}
            activeProps={{
              className:
                "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-[inset_2px_0_0_0_var(--primary)]",
            }}
          >
            <Icon className="size-4 shrink-0" />
            {label}
            {locked && <Lock className="ml-auto size-3.5 shrink-0" />}
          </Link>
        );
      })}
    </nav>
  );
}

function useCurrentTitle() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const match = [...NAV_ITEMS]
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => pathname === item.to || pathname.startsWith(item.to + "/"));
  return match?.label ?? "WorkLens";
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const title = useCurrentTitle();
  const { hasResume } = appRoute.useLoaderData();

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar p-3 lg:flex">
        <Brand />
        <div className="mt-6 flex-1">
          <NavList />
        </div>
        {!hasResume && (
          <div className="rounded-lg border border-sidebar-border p-3 text-xs text-muted-foreground">
            <p className="flex items-center gap-1.5 font-medium text-foreground">
              <Lock className="size-3.5" /> Sections locked
            </p>
            <p className="mt-1">
              Upload your resume to unlock Jobs, Skills, Assessments and Roadmap.
            </p>
          </div>
        )}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-sidebar-border bg-sidebar p-3">
            <div className="flex items-center justify-between">
              <Brand />
              <button
                aria-label="Close navigation"
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-2 text-muted-foreground hover:bg-sidebar-accent"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-6">
              <NavList onNavigate={() => setMobileOpen(false)} />
            </div>
          </aside>
        </div>
      )}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur">
          <button
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted lg:hidden"
          >
            <Menu className="size-4" />
          </button>
          <h1 className="text-sm font-semibold tracking-tight">{title}</h1>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-muted-foreground md:flex">
              <Search className="size-3.5" />
              <span>Search skills, jobs…</span>
            </div>
            <button
              aria-label="Notifications"
              className="rounded-md p-2 text-muted-foreground hover:bg-muted"
            >
              <Bell className="size-4" />
            </button>
            <AccountMenu />
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          {/* Child routes render here */}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
