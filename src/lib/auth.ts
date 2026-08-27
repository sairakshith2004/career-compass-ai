import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { eq } from "drizzle-orm";

import { db } from "./db/client";
import { user } from "./db/auth-schema";
import { hashPassword, verifyPassword, MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "./password";

const isProduction = process.env["NODE_ENV"] === "production";

/** Only registers a social provider once its Client ID/Secret are actually set. */
function socialProvider(prefix: "GOOGLE" | "GITHUB" | "LINKEDIN") {
  const clientId = process.env[`${prefix}_CLIENT_ID`];
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];
  return clientId && clientSecret ? { clientId, clientSecret } : undefined;
}

const google = socialProvider("GOOGLE");
const github = socialProvider("GITHUB");
const linkedin = socialProvider("LINKEDIN");

const baseURL = process.env["BETTER_AUTH_URL"] ?? "http://localhost:3000";

if (isProduction && !process.env["BETTER_AUTH_SECRET"]) {
  // In dev better-auth falls back to a random per-process secret (sessions drop
  // on restart, which is fine locally). In production a missing secret is a
  // silent security failure, so fail fast instead.
  throw new Error("BETTER_AUTH_SECRET must be set in production");
}

export const auth = betterAuth({
  baseURL,
  secret: process.env["BETTER_AUTH_SECRET"],
  database: drizzleAdapter(db, { provider: "sqlite" }),
  // Explicit allow-list for the Origin/Referer check better-auth runs on its own
  // endpoints (its CSRF defense). Defaults to `baseURL`; naming it here means a
  // misconfigured BETTER_AUTH_URL fails loudly rather than trusting every origin.
  trustedOrigins: [baseURL],
  socialProviders: {
    ...(google && { google }),
    ...(github && { github }),
    ...(linkedin && { linkedin }),
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    maxPasswordLength: MAX_PASSWORD_LENGTH,
    // Argon2id (see src/lib/password.ts) instead of better-auth's default
    // scrypt. The stored value is a self-describing PHC string kept in the
    // `account.password` column — never on `user`, never sent to the client.
    password: {
      hash: hashPassword,
      verify: verifyPassword,
    },
    // Password-reset link delivery. No transactional-email provider is wired in
    // Phase 1, so in dev the link is logged server-side for manual testing; in
    // production this MUST be replaced with a real send (Resend/SES/Postmark).
    // The request endpoint still always responds identically whether or not the
    // email exists — see the /forgot-password route.
    sendResetPassword: async ({ user: u, url }) => {
      if (isProduction) {
        console.error(
          "[auth] sendResetPassword called but no email provider is configured — " +
            "the user will not receive a reset link. Wire up an email provider.",
        );
        return;
      }
      console.info(`[auth] password reset link for ${u.email}: ${url}`);
    },
    resetPasswordTokenExpiresIn: 60 * 60, // 1 hour
    revokeSessionsOnPasswordReset: true,
  },
  // Extra columns on the `user` table. `input: false` keeps them out of the
  // sign-up payload so a client can't self-assign a status.
  user: {
    additionalFields: {
      status: {
        type: "string",
        required: false,
        defaultValue: "active",
        input: false,
      },
      lastLoginAt: {
        type: "date",
        required: false,
        input: false,
      },
    },
  },
  // Stay-signed-in session: a long-lived cookie that renews itself on activity.
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // re-issued once a day of activity, resetting the 30-day clock
  },
  databaseHooks: {
    session: {
      create: {
        // Fires on genuine sign-in / sign-up (auto-sign-in), not on background
        // session refresh — exactly when "last login" should move.
        after: async (session) => {
          await db.update(user).set({ lastLoginAt: new Date() }).where(eq(user.id, session.userId));
        },
      },
    },
  },
  // Built-in rate limiter. Enabled in every environment (better-auth defaults to
  // production-only) so local testing and the integration suite exercise it.
  // Storage is the database because the deploy target is serverless — an
  // in-memory counter resets on every cold start.
  rateLimit: {
    // On everywhere except when explicitly disabled (the automated auth test
    // suite sets this so unrelated cases aren't throttled; the rate limiter has
    // its own dedicated test).
    enabled: process.env["AUTH_RATE_LIMIT_DISABLED"] !== "true",
    storage: "database",
    window: 60, // default: 100 requests / 60s per IP across all auth endpoints
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 60 * 15, max: 3 },
      "/reset-password": { window: 60 * 15, max: 5 },
    },
  },
  advanced: {
    // Applied to every cookie better-auth sets (session, CSRF, etc.).
    // `httpOnly` keeps the session token unreadable from JS (XSS can't exfiltrate
    // it); `sameSite: "lax"` blocks cross-site POST CSRF while still allowing
    // top-level nav; `secure` is forced on in production and relaxed on
    // http://localhost for dev.
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
    },
    useSecureCookies: isProduction,
  },
  // Never surface an internal error body/stack to the caller of an auth endpoint.
  onAPIError: {
    throw: false,
    onError: (error) => {
      console.error("[auth] endpoint error:", error);
    },
  },
});

/** Which social providers are actually configured — drives which login buttons render. */
export const enabledProviders = {
  google: Boolean(google),
  github: Boolean(github),
  linkedin: Boolean(linkedin),
};
