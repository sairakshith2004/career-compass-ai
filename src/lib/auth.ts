import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { db } from "./db/client";

/** Only registers a social provider once its Client ID/Secret are actually set. */
function socialProvider(prefix: "GOOGLE" | "GITHUB" | "LINKEDIN") {
  const clientId = process.env[`${prefix}_CLIENT_ID`];
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];
  return clientId && clientSecret ? { clientId, clientSecret } : undefined;
}

const google = socialProvider("GOOGLE");
const github = socialProvider("GITHUB");
const linkedin = socialProvider("LINKEDIN");

export const auth = betterAuth({
  baseURL: process.env["BETTER_AUTH_URL"] ?? "http://localhost:3000",
  secret: process.env["BETTER_AUTH_SECRET"],
  database: drizzleAdapter(db, { provider: "sqlite" }),
  socialProviders: {
    ...(google && { google }),
    ...(github && { github }),
    ...(linkedin && { linkedin }),
  },
  // Email + password always works, even with no OAuth app configured — it's the fallback
  // that makes login usable out of the box (Google/GitHub/LinkedIn are optional extras).
  emailAndPassword: { enabled: true, autoSignIn: true, minPasswordLength: 8 },
  // Stay-signed-in session, same idea as Google/ChatGPT: a long-lived cookie that quietly
  // renews itself on activity, so members don't get logged out just by closing the tab.
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // re-issued once a day of activity, resetting the 30-day clock
  },
  // Must be last: makes signInEmail/signInSocial set cookies correctly under TanStack Start's SSR.
  plugins: [tanstackStartCookies()],
});

/** Which social providers are actually configured — drives which login buttons render. */
export const enabledProviders = {
  google: Boolean(google),
  github: Boolean(github),
  linkedin: Boolean(linkedin),
};
