import { useState, type FormEvent } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Sparkles } from "lucide-react";

import { signIn } from "@/lib/auth-client";
import { getSessionUser } from "@/lib/auth-guard";
import { getEnabledProviders } from "@/lib/server-fns";
import {
  OAuthProviders,
  startSocialSignIn,
  type OAuthProviderId,
} from "@/components/worklens/OAuthProviders";

const searchSchema = z.object({
  // Where to send the user after a successful sign-in. Constrained to an app-
  // internal path so it can't be turned into an open redirect.
  redirect: z.string().optional().catch(undefined),
});

function safeRedirect(target: string | undefined): string {
  if (target && target.startsWith("/") && !target.startsWith("//")) return target;
  return "/app";
}

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Sign in — WorkLens" }],
  }),
  validateSearch: searchSchema,
  beforeLoad: async ({ search }) => {
    const user = await getSessionUser();
    if (user) throw redirect({ to: safeRedirect(search.redirect) });
  },
  loader: () => getEnabledProviders(),
  component: Login,
});

const inputClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

/** Maps better-auth error codes to a single generic message (no account enumeration). */
function loginErrorMessage(code: string | undefined, status: number | undefined): string {
  if (status === 429) return "Too many attempts. Please wait a minute and try again.";
  switch (code) {
    case "INVALID_EMAIL_OR_PASSWORD":
    case "USER_NOT_FOUND":
    case "INVALID_PASSWORD":
      return "Incorrect email or password.";
    default:
      return "Couldn't sign you in. Check your details and try again.";
  }
}

function Login() {
  const enabled = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleOAuth(provider: OAuthProviderId) {
    setError(null);
    setPending(provider);
    await startSocialSignIn(provider, (message) => {
      setError(message);
      setPending(null);
    });
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending("email");

    try {
      const { error: authError } = await signIn.email({
        email: email.trim(),
        password,
      });
      if (authError) {
        setError(loginErrorMessage(authError.code, authError.status));
        setPending(null);
        return;
      }
      await navigate({ to: safeRedirect(search.redirect) });
    } catch {
      // Network / unexpected transport failure.
      setError("Network problem — check your connection and try again.");
      setPending(null);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="grid size-10 place-items-center rounded-lg bg-primary/15 text-primary">
            <Sparkles className="size-5" />
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to Work<span className="text-primary">Lens</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending !== null}
            className={inputClass}
          />
          <input
            type="password"
            required
            autoComplete="current-password"
            placeholder="Password"
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
            {pending === "email" ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {error && (
          <p role="alert" className="mt-4 text-center text-sm text-destructive">
            {error}
          </p>
        )}

        <OAuthProviders enabled={enabled} pending={pending} onSelect={handleOAuth} />

        <div className="mt-6 space-y-2 text-center text-xs text-muted-foreground">
          <p>
            <Link to="/forgot-password" className="font-medium text-foreground hover:text-primary">
              Forgot password?
            </Link>
          </p>
          <p>
            Don't have an account?{" "}
            <Link to="/signup" className="font-medium text-foreground hover:text-primary">
              Create account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
