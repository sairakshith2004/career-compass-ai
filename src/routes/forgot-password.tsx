import { useState, type FormEvent } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { getSessionUser } from "@/lib/auth-guard";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Reset your password — WorkLens" }] }),
  beforeLoad: async () => {
    const user = await getSessionUser();
    if (user) throw redirect({ to: "/app" });
  },
  component: ForgotPassword,
});

const inputClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const { error: authError } = await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: "/reset-password",
      });
      if (authError && authError.status === 429) {
        setError("Too many requests. Please wait a few minutes and try again.");
        setPending(false);
        return;
      }
      // Any other outcome resolves to the same neutral confirmation — the
      // server already returns an identical body whether or not the email
      // is registered, so we never reveal which.
      setSubmitted(true);
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
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Reset your password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            We'll email you a link to set a new one.
          </p>
        </div>

        {submitted ? (
          <div className="rounded-lg border border-border bg-card p-4 text-center text-sm text-muted-foreground">
            If an account exists for <span className="text-foreground">{email.trim()}</span>, a
            password reset link is on its way. Check your inbox.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3" noValidate>
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={pending}
              className={inputClass}
            />
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Sending…" : "Send reset link"}
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
