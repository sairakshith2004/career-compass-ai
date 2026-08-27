import { useState, type FormEvent } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Sparkles } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { getSessionUser } from "@/lib/auth-guard";
import { checkPasswordPolicy, MIN_PASSWORD_LENGTH } from "@/lib/password";

const searchSchema = z.object({
  token: z.string().optional().catch(undefined),
  error: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Set a new password — WorkLens" }] }),
  validateSearch: searchSchema,
  beforeLoad: async () => {
    const user = await getSessionUser();
    if (user) throw redirect({ to: "/app" });
  },
  component: ResetPassword,
});

const inputClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function ResetPassword() {
  const { token, error: linkError } = Route.useSearch();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const tokenMissing = !token || linkError;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!token) return;

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    const policy = checkPasswordPolicy(password);
    if (!policy.ok) {
      setError(policy.reason);
      return;
    }

    setPending(true);
    try {
      const { error: authError } = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (authError) {
        setError(
          authError.code === "INVALID_TOKEN"
            ? "This reset link has expired or already been used. Request a new one."
            : "Couldn't reset your password. Please try again.",
        );
        setPending(false);
        return;
      }
      setDone(true);
      setTimeout(() => void navigate({ to: "/login" }), 1500);
    } catch {
      setError("Network problem — check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="grid size-10 place-items-center rounded-lg bg-primary/15 text-primary">
            <Sparkles className="size-5" />
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Set a new password</h1>
        </div>

        {done ? (
          <div className="rounded-lg border border-border bg-card p-4 text-center text-sm text-muted-foreground">
            Password updated. Redirecting you to sign in…
          </div>
        ) : tokenMissing ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-destructive">This reset link is invalid or has expired.</p>
            <Link
              to="/forgot-password"
              className="inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Request a new link
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3" noValidate>
            <input
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              placeholder={`New password (min. ${MIN_PASSWORD_LENGTH} characters)`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={pending}
              className={inputClass}
            />
            <input
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={pending}
              className={inputClass}
            />
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Updating…" : "Update password"}
            </button>
          </form>
        )}

        {error && (
          <p role="alert" className="mt-4 text-center text-sm text-destructive">
            {error}
          </p>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link to="/login" className="font-medium text-foreground hover:text-primary">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
