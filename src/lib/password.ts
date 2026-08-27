import { argon2id, argon2Verify } from "hash-wasm";

/**
 * Password hashing for email/password auth.
 *
 * Algorithm: Argon2id — the memory-hard KDF recommended by OWASP for password
 * storage. We use the pure-WASM `hash-wasm` implementation rather than a native
 * addon so the same code runs unchanged in Node, Bun and edge/serverless
 * runtimes (this app deploys to Vercel via Nitro — no native `.node` binaries in
 * the bundle).
 *
 * Parameters follow the OWASP Password Storage Cheat Sheet's Argon2id baseline:
 *   memory = 19 MiB, iterations = 2, parallelism = 1.
 * `hash-wasm` returns the standard PHC string
 * (`$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>`), so every stored hash is
 * self-describing and `argon2Verify` reads its own parameters back — old hashes
 * keep verifying if we raise the cost later.
 */
const ARGON2_MEMORY_KIB = 19_456; // 19 MiB
const ARGON2_ITERATIONS = 2;
const ARGON2_PARALLELISM = 1;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  return argon2id({
    password,
    salt,
    memorySize: ARGON2_MEMORY_KIB,
    iterations: ARGON2_ITERATIONS,
    parallelism: ARGON2_PARALLELISM,
    hashLength: HASH_BYTES,
    outputType: "encoded",
  });
}

export async function verifyPassword(data: { hash: string; password: string }): Promise<boolean> {
  // `argon2Verify` returns false (never throws) for a malformed/foreign hash
  // string, so callers get a plain boolean either way.
  try {
    return await argon2Verify({ password: data.password, hash: data.hash });
  } catch {
    return false;
  }
}

/**
 * A pre-computed hash of a throwaway value, used to keep "user not found" on the
 * same timing path as "wrong password" (see the login server fn). Generated
 * lazily once per process.
 */
let dummyHashPromise: Promise<string> | undefined;
export function getDummyPasswordHash(): Promise<string> {
  dummyHashPromise ??= hashPassword("dummy-password-for-constant-time-compare");
  return dummyHashPromise;
}

/**
 * Server-side password policy, enforced on sign-up and password reset. Kept
 * deliberately small: length is the dominant factor for offline-crack cost, and
 * a short denylist stops the handful of passwords that dominate credential-
 * stuffing lists without pretending to be a full strength meter.
 */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty123",
  "qwertyuiop",
  "letmein1",
  "iloveyou",
  "admin123",
  "welcome1",
  "changeme",
  "passw0rd",
]);

export type PasswordPolicyResult = { ok: true } | { ok: false; reason: string };

export function checkPasswordPolicy(password: string): PasswordPolicyResult {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, reason: `Use ${MAX_PASSWORD_LENGTH} characters or fewer.` };
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { ok: false, reason: "That password is too common — pick something less guessable." };
  }
  if (/^(.)\1+$/.test(password)) {
    return { ok: false, reason: "Pick something less guessable." };
  }
  return { ok: true };
}
