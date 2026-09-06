import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireUser } from "./session.server";
import {
  getTutorialRecommendations,
  type TutorialRecommendation,
  type TutorialRecommendations,
} from "./tutorials.server";
import { tutorialsForSkill, type Tutorial } from "./tutorials-catalog";

export type { Tutorial, TutorialRecommendation, TutorialRecommendations };

/**
 * RPC layer for tutorial recommendations. Every wrapper resolves the caller
 * from the verified session; the client never supplies a user id.
 */

/** Full recommendation set for the /app/tutorials page. */
export const getTutorials = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  return getTutorialRecommendations(user.id);
});

/** The four YouTube tutorial links for one catalog skill (per-skill surfaces). */
export const getSkillTutorials = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ slug: z.string().min(1).max(120) }).parse(input))
  .handler(async ({ data }) => {
    await requireUser();
    return tutorialsForSkill(data.slug);
  });
