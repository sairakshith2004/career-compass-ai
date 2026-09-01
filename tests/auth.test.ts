import { describe, expect, test, beforeAll } from "vitest";
import { eq } from "drizzle-orm";

import { setupTestAuth, callAuth, originHeaders, cookieHeaderFrom } from "./helpers";

// Must run before any src/ import — see setupTestAuth's doc comment.
const { auth, db } = await setupTestAuth();
const { readSessionUser } = await import("../src/lib/session.server");
const { user, account } = await import("../src/lib/db/auth-schema");
const { hashPassword, verifyPassword, checkPasswordPolicy } = await import("../src/lib/password");

const PASSWORD = "correct-horse-battery-staple";

describe("password hashing", () => {
  test("hashes to an Argon2id PHC string and never stores plaintext", async () => {
    const hash = await hashPassword(PASSWORD);
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(hash).not.toContain(PASSWORD);
  });

  test("verifies the right password and rejects the wrong one", async () => {
    const hash = await hashPassword(PASSWORD);
    expect(await verifyPassword({ hash, password: PASSWORD })).toBe(true);
    expect(await verifyPassword({ hash, password: "not-it" })).toBe(false);
  });

  test("verify returns false (no throw) for a malformed hash", async () => {
    expect(await verifyPassword({ hash: "garbage", password: PASSWORD })).toBe(false);
  });

  test("policy rejects short and common passwords", () => {
    expect(checkPasswordPolicy("short").ok).toBe(false);
    expect(checkPasswordPolicy("password123").ok).toBe(false);
    expect(checkPasswordPolicy(PASSWORD).ok).toBe(true);
  });
});

describe("signup", () => {
  test("creates an account and issues a session", async () => {
    const { status, json, setCookie } = await callAuth(auth, "/sign-up/email", {
      email: "new-user@example.com",
      password: PASSWORD,
      name: "New User",
    });
    expect(status).toBe(200);
    expect(json.user.email).toBe("new-user@example.com");
    expect(setCookie).toBeTruthy();
    // No password material crosses the wire.
    expect(JSON.stringify(json)).not.toContain("password");
    expect(JSON.stringify(json)).not.toContain("$argon2");
  });

  test("stores an Argon2id hash in the account row, not plaintext", async () => {
    await callAuth(auth, "/sign-up/email", {
      email: "hash-check@example.com",
      password: PASSWORD,
      name: "Hash Check",
    });
    const [row] = await db.select().from(user).where(eq(user.email, "hash-check@example.com"));
    const [acct] = await db.select().from(account).where(eq(account.userId, row!.id));
    expect(acct!.password).toBeTruthy();
    expect(acct!.password!.startsWith("$argon2id$")).toBe(true);
    expect(acct!.password).not.toContain(PASSWORD);
  });

  test("rejects a duplicate email", async () => {
    await callAuth(auth, "/sign-up/email", {
      email: "dup@example.com",
      password: PASSWORD,
      name: "First",
    });
    const { status, json } = await callAuth(auth, "/sign-up/email", {
      email: "dup@example.com",
      password: "a-different-password",
      name: "Second",
    });
    expect(status).toBeGreaterThanOrEqual(400);
    expect(json.code).toContain("USER_ALREADY_EXISTS");
  });

  test("rejects invalid input (bad email, short password)", async () => {
    const bad = await callAuth(auth, "/sign-up/email", {
      email: "not-an-email",
      password: PASSWORD,
      name: "X",
    });
    expect(bad.status).toBeGreaterThanOrEqual(400);

    const shortPw = await callAuth(auth, "/sign-up/email", {
      email: "shortpw@example.com",
      password: "abc",
      name: "X",
    });
    expect(shortPw.status).toBeGreaterThanOrEqual(400);
  });
});

describe("login / logout", () => {
  beforeAll(async () => {
    await callAuth(auth, "/sign-up/email", {
      email: "member@example.com",
      password: PASSWORD,
      name: "Member",
    });
  });

  test("logs in with the correct password", async () => {
    const { status, json, setCookie } = await callAuth(auth, "/sign-in/email", {
      email: "member@example.com",
      password: PASSWORD,
    });
    expect(status).toBe(200);
    expect(json.user.email).toBe("member@example.com");
    expect(setCookie).toBeTruthy();
  });

  test("rejects a wrong password with a generic message (no enumeration)", async () => {
    const wrong = await callAuth(auth, "/sign-in/email", {
      email: "member@example.com",
      password: "wrong-password",
    });
    const unknown = await callAuth(auth, "/sign-in/email", {
      email: "ghost@example.com",
      password: "wrong-password",
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    // Identical response shape for "wrong password" and "no such user".
    expect(wrong.json.message).toBe(unknown.json.message);
    expect(wrong.json.code).toBe(unknown.json.code);
  });

  test("logout clears the session", async () => {
    const login = await callAuth(auth, "/sign-in/email", {
      email: "member@example.com",
      password: PASSWORD,
    });
    const cookie = cookieHeaderFrom(login.setCookie);

    const before = await readSessionUser(new Headers({ cookie }));
    expect(before?.email).toBe("member@example.com");

    const out = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-out", {
        method: "POST",
        headers: originHeaders({ cookie }),
      }),
    );
    expect(out.status).toBe(200);
    const clearedCookie = cookieHeaderFrom(out.headers.get("set-cookie"));
    const after = await readSessionUser(new Headers({ cookie: clearedCookie }));
    expect(after).toBeNull();
  });
});

describe("server-side authorization (readSessionUser)", () => {
  test("unauthenticated request resolves to null", async () => {
    expect(await readSessionUser(new Headers())).toBeNull();
    expect(
      await readSessionUser(new Headers({ cookie: "better-auth.session_token=forged" })),
    ).toBeNull();
  });

  test("a valid session resolves to the caller", async () => {
    const login = await callAuth(auth, "/sign-up/email", {
      email: "authz-ok@example.com",
      password: PASSWORD,
      name: "Authz Ok",
    });
    const me = await readSessionUser(new Headers({ cookie: cookieHeaderFrom(login.setCookie) }));
    expect(me?.email).toBe("authz-ok@example.com");
    expect(me?.status).toBe("active");
  });

  test("a suspended account is denied even with a valid session cookie", async () => {
    const login = await callAuth(auth, "/sign-up/email", {
      email: "suspended@example.com",
      password: PASSWORD,
      name: "Suspended",
    });
    const cookie = cookieHeaderFrom(login.setCookie);
    expect((await readSessionUser(new Headers({ cookie })))?.email).toBe("suspended@example.com");

    await db
      .update(user)
      .set({ status: "suspended" })
      .where(eq(user.email, "suspended@example.com"));

    expect(await readSessionUser(new Headers({ cookie }))).toBeNull();
  });

  test("lastLoginAt is stamped on sign-in", async () => {
    await callAuth(auth, "/sign-up/email", {
      email: "lastlogin@example.com",
      password: PASSWORD,
      name: "Last Login",
    });
    await callAuth(auth, "/sign-in/email", {
      email: "lastlogin@example.com",
      password: PASSWORD,
    });
    const [row] = await db.select().from(user).where(eq(user.email, "lastlogin@example.com"));
    expect(row!.lastLoginAt).toBeInstanceOf(Date);
  });
});

describe("password reset", () => {
  test("request responds identically for known and unknown emails", async () => {
    await callAuth(auth, "/sign-up/email", {
      email: "resettable@example.com",
      password: PASSWORD,
      name: "Resettable",
    });
    const known = await callAuth(auth, "/request-password-reset", {
      email: "resettable@example.com",
      redirectTo: "/reset-password",
    });
    const unknown = await callAuth(auth, "/request-password-reset", {
      email: "does-not-exist@example.com",
      redirectTo: "/reset-password",
    });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.json).toEqual(unknown.json);
  });
});
