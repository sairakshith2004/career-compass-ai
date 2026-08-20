import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Local disk in dev — same "swap the env var later" shape as db/client.ts's DATABASE_URL:
// works with zero setup here, and a real deployment can point RESUME_UPLOAD_DIR at a
// mounted volume (or this can be swapped for S3/R2 later without touching callers).
const UPLOAD_ROOT =
  process.env["RESUME_UPLOAD_DIR"] ?? path.join(process.cwd(), "uploads", "resumes");

/** Saves a resume's raw bytes to disk and returns the storageKey to persist on the row. */
export async function saveResumeFile(userId: string, fileName: string, bytes: Uint8Array) {
  const ext = path.extname(fileName);
  const storageKey = `${userId}/${crypto.randomUUID()}${ext}`;
  const fullPath = path.join(UPLOAD_ROOT, storageKey);

  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, bytes);

  return storageKey;
}
