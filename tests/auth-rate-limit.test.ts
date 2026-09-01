import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { migrate } from "drizzle-orm/libsql/migrator";

import * as authSchema from "../src/lib/db/auth-schema";
import { hashPassword, verifyPassword } from "../src/lib/password";

/**
 * The rate limiter is disabled in the main auth suite (so unrelated cases aren't
 * throttled), so it gets its own purpose-built instance here — same Argon2id +
 * database-backed rate-limit config as src/lib/auth.ts, with a low sign-in cap.
 */
const dir = mkdtempSync(join(tmpdir(), "worklens-rl-"));
const client = createClient({ url: `file:${join(dir, "rl.db")}` });
const db = drizzle(client, { schema: authSchema });
await migrate(db, { migrationsFolder: "drizzle" });

const auth = betterAuth({
  baseURL: "http://localhost:3000",
  secret: "test-secret-value-at-least-32-characters-long",
  database: drizzleAdapter(db, { provider: "sqlite" }),
  emailAndPassword: {
    enabled: true,
    password: { hash: hashPassword, verify: verifyPassword },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: { "/sign-in/email": { window: 60, max: 3 } },
  },
});

function req(path: string, body: unknown) {
  return auth.handler(
    new Request(`http://localhost:3000/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify(body),
    }),
  );
}

test("sign-in is throttled after the per-route limit and returns 429", async () => {
  await req("/sign-up/email", {
    email: "rl@example.com",
    password: "correct-horse-battery-staple",
    name: "RL",
  });

  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) {
    const res = await req("/sign-in/email", { email: "rl@example.com", password: "wrong" });
    statuses.push(res.status);
  }

  // First few attempts get through to a normal auth failure; then the limiter
  // takes over with 429s.
  expect(statuses).toContain(401);
  expect(statuses).toContain(429);
  expect(statuses[statuses.length - 1]).toBe(429);
});
