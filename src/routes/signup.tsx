import { useState, type FormEvent } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

import { signUp } from "@/lib/auth-client";
import { getCurrentUser, getEnabledProviders } from "@/lib/server-fns";
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
    const user = await getCurrentUser();
    if (user) throw redirect({ to: "/app" });
  },
  loader: () => getEnabledProviders(),
  component: Signup,
});

const inputClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

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

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setPending("email");
    const { error: authError } = await signUp.email({
      name: name.trim(),
      email: email.trim(),
      password,
    });
    if (authError) {
      setError(authError.message ?? "Couldn't create your account. Please try again.");
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
            Create your Work<span className="text-primary">Lens</span> account
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track job readiness, verified skills and your learning roadmap.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
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
            minLength={8}
            autoComplete="new-password"
            placeholder="Password (min. 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={pending !== null}
            className={inputClass}
          />
          <input
            type="password"
            required
            minLength={8}
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

        {error && <p className="mt-4 text-center text-sm text-destructive">{error}</p>}

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
