import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  getBranch,
  getBranches,
  getCareerPath,
  getCareerPaths,
  getCareersForBranch,
  getCareersForSkill,
  getEngineeringCategories,
  getSkills,
  getSkillsForCareers,
  getTaxonomyTree,
} from "./taxonomy.server";

/**
 * RPC layer for the engineering + career taxonomy.
 *
 * This is public reference data (no user rows, no secrets), so — unlike the
 * profile RPCs — these do not call `requireUser()`. They're still same-origin
 * protected by the global CSRF middleware. Callers that need it (the onboarding
 * wizard) are behind `/app` auth anyway.
 */

export const listEngineeringCategories = createServerFn({ method: "GET" }).handler(() =>
  getEngineeringCategories(),
);

export const listTaxonomyTree = createServerFn({ method: "GET" }).handler(() => getTaxonomyTree());

export const listBranches = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    const parsed = z
      .object({ categorySlug: z.string().min(1).optional() })
      .optional()
      .parse(input);
    return parsed ?? {};
  })
  .handler(({ data }) => getBranches(data));

export const getBranchDetail = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ slug: z.string().min(1) }).parse(input))
  .handler(({ data }) => getBranch(data.slug));

export const listCareerPaths = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    const parsed = z
      .object({ group: z.string().min(1).optional() })
      .optional()
      .parse(input);
    return parsed ?? {};
  })
  .handler(({ data }) => getCareerPaths(data));

export const getCareerPathDetail = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ slug: z.string().min(1) }).parse(input))
  .handler(({ data }) => getCareerPath(data.slug));

/** Careers compatible with a given branch — ordered primary → common → possible. */
export const listCareersForBranch = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ branchSlug: z.string().min(1) }).parse(input))
  .handler(({ data }) => getCareersForBranch(data.branchSlug));

export const listSkills = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    const parsed = z
      .object({ category: z.string().min(1).optional() })
      .optional()
      .parse(input);
    return parsed ?? {};
  })
  .handler(({ data }) => getSkills(data));

export const listCareersForSkill = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ skillSlug: z.string().min(1) }).parse(input))
  .handler(({ data }) => getCareersForSkill(data.skillSlug));

export const listSkillsForCareers = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    z.object({ careerSlugs: z.array(z.string().min(1)).max(20) }).parse(input),
  )
  .handler(({ data }) => getSkillsForCareers(data.careerSlugs));
