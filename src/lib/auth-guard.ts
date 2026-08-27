import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";

import { readCurrentSessionUser, type SessionUser } from "./session.server";

export type { SessionUser } from "./session.server";

/** Current member or null — the client-safe session read used by route loaders. */
export const getSessionUser = createServerFn({ method: "GET" }).handler(
  (): Promise<SessionUser | null> => readCurrentSessionUser(),
);

/**
 * Route-guard helper for `beforeLoad` on authenticated routes. Redirects to
 * `/login` (remembering where the user was headed) when there is no active
 * session. This is UX only — every server function behind these routes must
 * still enforce auth itself (see `requireUser` in session.server.ts).
 */
export const requireAuth = createServerFn({ method: "GET" })
  .validator((redirectTo: unknown): { redirectTo: string } => {
    return { redirectTo: typeof redirectTo === "string" ? redirectTo : "/app" };
  })
  .handler(async ({ data }) => {
    const user = await readCurrentSessionUser();
    if (!user) {
      throw redirect({ to: "/login", search: { redirect: data.redirectTo } });
    }
    return user;
  });
