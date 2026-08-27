import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Point the app's db client at a throwaway libSQL file and run the real Drizzle
 * migrations against it, then hand back a fully-configured `auth` instance.
 *
 * MUST be called before any test file imports `src/lib/auth` or
 * `src/lib/db/client` — those read `process.env` at module load. Test files call
 * this at top level (`await setupTestAuth()`) prior to importing anything else
 * from `src/`.
 */
export async function setupTestAuth(opts: { rateLimit?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "worklens-auth-"));
  process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
  process.env.BETTER_AUTH_SECRET = "test-secret-value-at-least-32-characters-long";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.AUTH_RATE_LIMIT_DISABLED = opts.rateLimit ? "false" : "true";
  process.env.NODE_ENV = "test";

  const { migrate } = await import("drizzle-orm/libsql/migrator");
  const { db } = await import("../src/lib/db/client");
  await migrate(db, { migrationsFolder: "drizzle" });

  const { auth } = await import("../src/lib/auth");
  return { auth, db };
}

const ORIGIN = "http://localhost:3000";

/** Build request headers that pass better-auth's same-origin check. */
export function originHeaders(extra?: Record<string, string>): Headers {
  return new Headers({ "content-type": "application/json", origin: ORIGIN, ...extra });
}

/** POST helper against `auth.handler` — the real HTTP entrypoint. */
export async function callAuth(
  auth: { handler: (req: Request) => Promise<Response> },
  path: string,
  body: unknown,
  headers?: Headers,
): Promise<{ status: number; json: any; setCookie: string | null }> {
  const res = await auth.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: "POST",
      headers: headers ?? originHeaders(),
      body: JSON.stringify(body),
    }),
  );
  const setCookie = res.headers.get("set-cookie");
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* some endpoints return no body */
  }
  return { status: res.status, json, setCookie };
}

/** Turn a Set-Cookie response header into a Cookie request header value. */
export function cookieHeaderFrom(setCookie: string | null): string {
  if (!setCookie) return "";
  return setCookie
    .split(/,(?=[^;]+?=)/)
    .map((c) => c.split(";")[0]!.trim())
    .join("; ");
}
