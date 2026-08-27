import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireUser } from "./session.server";
import {
  getResumeView,
  ingestResumeUpload,
  runResumeAnalysis,
  ResumeAIError,
  ResumeUploadError,
  type ResumeView,
} from "./resume.server";

export type { ResumeView } from "./resume.server";

/**
 * RPC layer for resume intelligence. Every wrapper resolves the caller from the
 * verified session (`requireUser`) and passes only that id to the scoped logic
 * in resume.server.ts — no user/resume id is ever taken from the client for
 * authorization.
 */

/** Step 1 — validate + scan + store + extract text. Fast. */
export const uploadResume = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("Expected form data");
    const file = data.get("file");
    if (!(file instanceof File)) throw new Error("A resume file is required");
    return { file };
  })
  .handler(async ({ data }): Promise<{ resumeId: string }> => {
    const { id } = await requireUser();
    try {
      return await ingestResumeUpload(id, data.file);
    } catch (err) {
      if (err instanceof ResumeUploadError) throw new Error(err.message);
      throw err;
    }
  });

/** Step 2 — run the AI analysis. Slow (seconds). Re-call to retry. */
export const analyzeResume = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ resumeId: z.string().min(1) }).parse(data))
  .handler(async ({ data }): Promise<{ status: "complete" }> => {
    const { id } = await requireUser();
    try {
      return await runResumeAnalysis(id, data.resumeId);
    } catch (err) {
      // Surface a user-safe message; the row is already marked `failed`.
      if (err instanceof ResumeAIError) throw new Error(err.userMessage);
      throw err;
    }
  });

/** Latest resume + analysis + declared-vs-detected discrepancies. */
export const getResume = createServerFn({ method: "GET" }).handler(
  async (): Promise<ResumeView> => {
    const { id } = await requireUser();
    return getResumeView(id);
  },
);
