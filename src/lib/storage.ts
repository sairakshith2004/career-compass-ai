import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

// Local disk in dev — same "swap the env var later" shape as db/client.ts's DATABASE_URL:
// works with zero setup here, and a real deployment can point RESUME_UPLOAD_DIR at a
// mounted volume (or this can be swapped for S3/R2 later without touching callers).
//
// This directory is NOT under `public/` and is never served by a route — resume
// bytes are only ever read back through `readResumeFile`, which the caller must
// gate on ownership.
const UPLOAD_ROOT =
  process.env["RESUME_UPLOAD_DIR"] ?? path.join(process.cwd(), "uploads", "resumes");

/** Saves a resume's raw bytes to disk and returns the storageKey to persist on the row. */
export async function saveResumeFile(userId: string, kindExt: string, bytes: Uint8Array) {
  // storageKey is fully server-generated: `<userId>/<uuid>.<ext>`. No part of it
  // comes from the client filename, so it can't be a traversal payload.
  const ext = kindExt.replace(/[^a-z0-9]/gi, "").slice(0, 5) || "bin";
  const storageKey = `${userId}/${crypto.randomUUID()}.${ext}`;
  const fullPath = resolveWithinRoot(storageKey);

  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, bytes);

  return storageKey;
}

/**
 * Reads a stored resume back. The caller is responsible for verifying the
 * requesting user owns the row this `storageKey` belongs to; as defense in
 * depth this also refuses any key that would escape the upload root or whose
 * first path segment isn't `expectUserId`.
 */
export async function readResumeFile(storageKey: string, expectUserId: string): Promise<Buffer> {
  if (storageKey.split("/")[0] !== expectUserId) {
    throw new Error("storageKey does not belong to this user");
  }
  return readFile(resolveWithinRoot(storageKey));
}

export async function deleteResumeFile(storageKey: string): Promise<void> {
  try {
    await rm(resolveWithinRoot(storageKey), { force: true });
  } catch {
    /* already gone — fine */
  }
}

function resolveWithinRoot(storageKey: string): string {
  const full = path.resolve(UPLOAD_ROOT, storageKey);
  const root = path.resolve(UPLOAD_ROOT);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error("path escapes upload root");
  }
  return full;
}
