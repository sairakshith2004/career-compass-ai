import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as authSchema from "./auth-schema";
import * as appSchema from "./schema";

// libSQL: a local file with zero setup in dev (`file:./dev.db`), and the same
// driver talks to a hosted Turso database in production — just swap DATABASE_URL.
// Turso also needs DATABASE_AUTH_TOKEN; local files don't.
const url = process.env["DATABASE_URL"] ?? "file:./dev.db";
const authToken = process.env["DATABASE_AUTH_TOKEN"];

const client = createClient(authToken ? { url, authToken } : { url });

export const db = drizzle(client, { schema: { ...authSchema, ...appSchema } });
