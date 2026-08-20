import { useState, type FormEvent } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

import { signIn, signUp } from "@/lib/auth-client";
import { getCurrentUser, getEnabledProviders } from "@/lib/server-fns";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Sign in — WorkLens" }],
  }),
  beforeLoad: async () => {
    const user = await getCurrentUser();
    if (user) throw redirect({ to: "/app" });
  },
  loader: () => getEnabledProviders(),
  component: Login,
});

const PROVIDERS = [
  { id: "google", label: "Continue with Google" },
  { id: "github", label: "Continue with GitHub" },
  { id: "linkedin", label: "Continue with LinkedIn" },
] as const;

const inputClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function Login() {
  const enabled = Route.useLoaderData();
  const navigate = useNavigate();
  const anyConfigured = PROVIDERS.some((p) => enabled[p.id]);

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn(provider: (typeof PROVIDERS)[number]["id"]) {
    setError(null);
    setPending(provider);
    const { error: signInError } = await signIn.social({
      provider,
      callbackURL: "/app",
    });
    if (signInError) {
      setError(signInError.message ?? "Sign-in failed. Please try again.");
      setPending(null);
    }
    // On success better-auth redirects the browser to the provider, then to callbackURL.
  }

  async function handleEmailSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending("email");

    // Same session cookie either way — sign-up logs the new member straight in.
    const { error: authError } =
      mode === "signup"
        ? await signUp.email({ name: name.trim(), email: email.trim(), password })
        : await signIn.email({ email: email.trim(), password });

    if (authError) {
      setError(authError.message ?? "Something went wrong. Please try again.");
      setPending(null);
      return;
    }

    await navigate({ to: "/app" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="grid size-10 place-items-center rounded-lg bg-primary/15 text-primary">
            <Sparkles className="size-5" />
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">
            {mode === "signup" ? "Create your " : "Sign in to "}Work
            <span className="text-primary">Lens</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track job readiness, verified skills and your learning roadmap.
          </p>
        </div>

        {/* Sign in / create account toggle */}
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm font-medium">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={cn(
                "rounded-md py-1.5 transition-colors",
                mode === m
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>

        <form onSubmit={handleEmailSubmit} className="space-y-3">
          {mode === "signup" && (
            <input
              type="text"
              required
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending !== null}
              className={inputClass}
            />
          )}
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending !== null}
            className={inputClass}
          />
          <input
            type="password"
            required
            minLength={8}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            placeholder={mode === "signup" ? "Password (min. 8 characters)" : "Password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={pending !== null}
            className={inputClass}
          />
          <button
            type="submit"
            disabled={pending !== null}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending === "email"
              ? mode === "signup"
                ? "Creating account…"
                : "Signing in…"
              : mode === "signup"
                ? "Create account"
                : "Sign in"}
          </button>
        </form>

        {error && <p className="mt-4 text-center text-sm text-destructive">{error}</p>}

        {anyConfigured && (
          <>
            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or continue with
              <span className="h-px flex-1 bg-border" />
            </div>

            <div className="space-y-2.5">
              {PROVIDERS.filter((p) => enabled[p.id]).map((p) => (
                <button
                  key={p.id}
                  disabled={pending !== null}
                  onClick={() => handleSignIn(p.id)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-input bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending === p.id ? "Redirecting…" : p.label}
                </button>
              ))}
            </div>
          </>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          {mode === "signin" ? (
            <>
              Don't have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setError(null);
                }}
                className="font-medium text-foreground hover:text-primary"
              >
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setError(null);
                }}
                className="font-medium text-foreground hover:text-primary"
              >
                Sign in
              </button>
            </>
          )}
        </p>

        <button
          onClick={() => navigate({ to: "/app" })}
          className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground"
        >
          Continue browsing without an account →
        </button>
      </div>
    </div>
  );
}
