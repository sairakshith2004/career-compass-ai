import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as authSchema from "./auth-schema";
import * as appSchema from "./schema";
import * as careerSchema from "./career-schema";

// libSQL: a local file with zero setup in dev (`file:./dev.db`), and the same
// driver talks to a hosted Turso database in production — just swap DATABASE_URL.
// Turso also needs DATABASE_AUTH_TOKEN; local files don't.
const url = process.env["DATABASE_URL"] ?? "file:./dev.db";
const authToken = process.env["DATABASE_AUTH_TOKEN"];

const client = createClient(authToken ? { url, authToken } : { url });

// For a local file, put SQLite in WAL mode with a generous busy timeout. This
// lets the dev server, drizzle-kit, tests and one-off scripts touch the same
// `dev.db` concurrently without "database is locked" / readonly errors. No-op
// (and harmless if it fails) against a remote Turso URL.
if (url.startsWith("file:")) {
  void client
    .executeMultiple(
      "PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;",
    )
    .catch(() => {
      /* remote client, or a race during startup — not fatal */
    });
}

export const db = drizzle(client, {
  schema: { ...authSchema, ...appSchema, ...careerSchema },
});
