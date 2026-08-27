import { getRequestHeaders } from "@tanstack/react-start/server";

import { auth } from "./auth";

/**
 * The trimmed user shape the client is allowed to see. Deliberately excludes
 * anything sensitive — there is no password material on the better-auth `user`
 * row to begin with (it lives on `account.password`), but this keeps the
 * server→client contract explicit.
 */
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  status: "active" | "suspended" | "deleted";
  createdAt: Date;
  lastLoginAt: Date | null;
};

/**
 * Single source of truth for "who is the caller". Reads the session from the
 * HttpOnly cookie server-side, then applies the account-status gate: a
 * suspended or deleted account is treated as signed-out even while it still
 * holds a valid session cookie.
 *
 * Plain async function (not a server fn) so it can be called from server fns,
 * route `beforeLoad`, and middleware without an extra RPC hop. Server-only —
 * this module must never be imported into client code (`.server.ts`).
 */
export async function readSessionUser(headers: Headers): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers });
  const u = session?.user;
  if (!u) return null;

  const status = (u as { status?: string }).status ?? "active";
  if (status !== "active") {
    // Best-effort: tear down the now-invalid session so the cookie stops working.
    try {
      await auth.api.signOut({ headers });
    } catch {
      /* ignore — the status check below is what actually protects the request */
    }
    return null;
  }

  return {
    id: u.id,
    name: u.name,
    email: u.email,
    emailVerified: u.emailVerified,
    image: u.image ?? null,
    status: "active",
    createdAt: u.createdAt,
    lastLoginAt: (u as { lastLoginAt?: Date | null }).lastLoginAt ?? null,
  };
}

/** `readSessionUser` for the current request. */
export function readCurrentSessionUser(): Promise<SessionUser | null> {
  return readSessionUser(getRequestHeaders());
}

/**
 * Enforcement helper for the data boundary: call at the top of any server
 * function that touches private data. Throws (caller gets a generic failure,
 * never data) when there is no active session.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await readCurrentSessionUser();
  if (!user) throw new Error("Authentication required");
  return user;
}
