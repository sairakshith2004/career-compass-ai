import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireUser } from "./session.server";
import {
  addTargetRole,
  careerProfileCatalog,
  careerProfileSchema,
  getCareerProfile,
  getPhase7Inputs,
  getRoleRequirements,
  removeTargetRole,
  searchTargetRoles,
  setPrimaryTargetRole,
  targetRoleSchema,
  updateCareerProfile,
  type CareerProfileCatalog,
  type CareerProfileView,
  type Phase7Inputs,
  type RoleRequirements,
  type TargetRoleRow,
} from "./career-profile.server";

export type {
  CareerProfileCatalog,
  CareerProfileView,
  Phase7Inputs,
  RoleRequirements,
  TargetRoleRow,
} from "./career-profile.server";

/**
 * RPC layer for the Career Profile (Phase 6). Every wrapper resolves the caller
 * from the verified session (`requireUser`) and passes only that id to the
 * scoped service. A role slug from the client is validated against the taxonomy
 * and used only for reference lookups / owner-scoped filters — never for
 * authorization.
 */

export const getCareerProfileData = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ profile: CareerProfileView; catalog: CareerProfileCatalog }> => {
    const { id } = await requireUser();
    return { profile: await getCareerProfile(id), catalog: careerProfileCatalog() };
  },
);

export const saveCareerProfile = createServerFn({ method: "POST" })
  .validator(careerProfileSchema)
  .handler(async ({ data }) => {
    const { id } = await requireUser();
    return updateCareerProfile(id, data);
  });

export const addRole = createServerFn({ method: "POST" })
  .validator(targetRoleSchema)
  .handler(async ({ data }): Promise<TargetRoleRow[]> => {
    const { id } = await requireUser();
    return addTargetRole(id, data.roleSlug);
  });

export const removeRole = createServerFn({ method: "POST" })
  .validator(targetRoleSchema)
  .handler(async ({ data }): Promise<TargetRoleRow[]> => {
    const { id } = await requireUser();
    return removeTargetRole(id, data.roleSlug);
  });

export const setPrimaryRole = createServerFn({ method: "POST" })
  .validator(targetRoleSchema)
  .handler(async ({ data }): Promise<TargetRoleRow[]> => {
    const { id } = await requireUser();
    return setPrimaryTargetRole(id, data.roleSlug);
  });

export const searchRoles = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ q: z.string().max(80).optional() }).parse(input ?? {}))
  .handler(({ data }) => searchTargetRoles(data.q ?? ""));

export const roleRequirements = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ roleSlug: z.string().min(1) }).parse(input))
  .handler(async ({ data }): Promise<RoleRequirements | null> => {
    await requireUser();
    return getRoleRequirements(data.roleSlug);
  });

/** The clean data set Phase 7's Skill Gap Engine will consume. */
export const phase7Inputs = createServerFn({ method: "GET" }).handler(
  async (): Promise<Phase7Inputs> => {
    const { id } = await requireUser();
    return getPhase7Inputs(id);
  },
);
