import { OAUTH_PROVIDERS, type OAuthProviderId } from "./oauth";

/**
 * Shared "or continue with" OAuth block for /login and /signup. Renders nothing if no
 * provider has real credentials configured (see auth.ts's `enabledProviders`) — never
 * shows a button that can't actually work.
 */
export function OAuthProviders({
  enabled,
  pending,
  onSelect,
}: {
  enabled: Record<OAuthProviderId, boolean>;
  pending: string | null;
  onSelect: (provider: OAuthProviderId) => void;
}) {
  const anyConfigured = OAUTH_PROVIDERS.some((p) => enabled[p.id]);
  if (!anyConfigured) return null;

  return (
    <>
      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or continue with
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="space-y-2.5">
        {OAUTH_PROVIDERS.filter((p) => enabled[p.id]).map((p) => (
          <button
            key={p.id}
            disabled={pending !== null}
            onClick={() => onSelect(p.id)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-input bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending === p.id ? "Redirecting…" : p.label}
          </button>
        ))}
      </div>
    </>
  );
}
