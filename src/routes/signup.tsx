import { useState, type FormEvent } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

import { signUp } from "@/lib/auth-client";
import { getSessionUser } from "@/lib/auth-guard";
import { getEnabledProviders } from "@/lib/server-fns";
import { checkPasswordPolicy, MIN_PASSWORD_LENGTH } from "@/lib/password";
import {
  OAuthProviders,
  startSocialSignIn,
  type OAuthProviderId,
} from "@/components/worklens/OAuthProviders";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [{ title: "Create your account — WorkLens" }],
  }),
  beforeLoad: async () => {
    const user = await getSessionUser();
    if (user) throw redirect({ to: "/app" });
  },
  loader: () => getEnabledProviders(),
  component: Signup,
});

const inputClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function signupErrorMessage(code: string | undefined, status: number | undefined): string {
  if (status === 429) return "Too many attempts. Please wait a minute and try again.";
  switch (code) {
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "An account with that email already exists. Try signing in instead.";
    case "PASSWORD_TOO_SHORT":
      return `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`;
    case "PASSWORD_TOO_LONG":
      return "That password is too long.";
    case "INVALID_EMAIL":
      return "Enter a valid email address.";
    default:
      return "Couldn't create your account. Please try again.";
  }
}

function Signup() {
  const enabled = Route.useLoaderData();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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

    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setError("Enter your full name.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    const policy = checkPasswordPolicy(password);
    if (!policy.ok) {
      setError(policy.reason);
      return;
    }

    setPending("email");
    try {
      const { error: authError } = await signUp.email({
        name: trimmedName,
        email: email.trim(),
        password,
      });
      if (authError) {
        setError(signupErrorMessage(authError.code, authError.status));
        setPending(null);
        return;
      }
      // New account → onboarding (existing users land on the dashboard).
      await navigate({ to: "/app/onboarding" });
    } catch {
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
          <h1 className="mt-4 text-xl font-semibold tracking-tight">
            Create your Work<span className="text-primary">Lens</span> account
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track job readiness, verified skills and your learning roadmap.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          <input
            type="text"
            required
            autoComplete="name"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={pending !== null}
            className={inputClass}
          />
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
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            placeholder={`Password (min. ${MIN_PASSWORD_LENGTH} characters)`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={pending !== null}
            className={inputClass}
          />
          <input
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={pending !== null}
            className={inputClass}
          />
          <button
            type="submit"
            disabled={pending !== null}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending === "email" ? "Creating account…" : "Create account"}
          </button>
        </form>

        {error && (
          <p role="alert" className="mt-4 text-center text-sm text-destructive">
            {error}
          </p>
        )}

        <OAuthProviders enabled={enabled} pending={pending} onSelect={handleOAuth} />

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-foreground hover:text-primary">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
