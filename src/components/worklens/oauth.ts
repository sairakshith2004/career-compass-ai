import { signIn } from "@/lib/auth-client";

export const OAUTH_PROVIDERS = [
  { id: "google", label: "Continue with Google" },
  { id: "github", label: "Continue with GitHub" },
  { id: "linkedin", label: "Continue with LinkedIn" },
] as const;

export type OAuthProviderId = (typeof OAUTH_PROVIDERS)[number]["id"];

/** Shared social sign-in handler — same behavior /login and /signup both need. */
export async function startSocialSignIn(
  provider: OAuthProviderId,
  onError: (message: string) => void,
) {
  const { error } = await signIn.social({ provider, callbackURL: "/app" });
  if (error) {
    onError(error.message ?? "Sign-in failed. Please try again.");
  }
  // On success better-auth redirects the browser to the provider, then to callbackURL.
}
