import { createServerFn } from "@tanstack/react-start";

import { requireUser } from "./session.server";
import {
  academicBackgroundSchema,
  branchSchema,
  careerDirectionSchema,
  completeOnboarding,
  getOnboardingState,
  getStudentProfileSummary,
  graduationSchema,
  onboardingCatalog,
  saveAcademicBackground,
  saveBranch,
  saveCareerDirection,
  saveGraduation,
  type OnboardingCatalog,
  type OnboardingState,
  type StudentProfileSummary,
} from "./student-profile.server";

export type { OnboardingCatalog, OnboardingState, StudentProfileSummary };

/**
 * RPC layer for the onboarding wizard. Each wrapper does exactly two things:
 * resolve the caller from the verified session (`requireUser`), then delegate
 * to the scoped logic in student-profile.server.ts with that user id. The
 * client never supplies a user/profile id.
 */

export const getOnboarding = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ state: OnboardingState; catalog: OnboardingCatalog }> => {
    const { id } = await requireUser();
    return { state: await getOnboardingState(id), catalog: onboardingCatalog() };
  },
);

export const getProfileSummary = createServerFn({ method: "GET" }).handler(
  async (): Promise<StudentProfileSummary | null> => {
    const { id } = await requireUser();
    return getStudentProfileSummary(id);
  },
);

export const saveOnboardingStep1 = createServerFn({ method: "POST" })
  .validator(academicBackgroundSchema)
  .handler(async ({ data }) => {
    const { id } = await requireUser();
    return saveAcademicBackground(id, data);
  });

export const saveOnboardingStep2 = createServerFn({ method: "POST" })
  .validator(branchSchema)
  .handler(async ({ data }) => {
    const { id } = await requireUser();
    return saveBranch(id, data);
  });

export const saveOnboardingStep3 = createServerFn({ method: "POST" })
  .validator(graduationSchema)
  .handler(async ({ data }) => {
    const { id } = await requireUser();
    return saveGraduation(id, data);
  });

export const saveOnboardingStep4 = createServerFn({ method: "POST" })
  .validator(careerDirectionSchema)
  .handler(async ({ data }) => {
    const { id } = await requireUser();
    return saveCareerDirection(id, data);
  });

export const finishOnboarding = createServerFn({ method: "POST" }).handler(async () => {
  const { id } = await requireUser();
  return completeOnboarding(id);
});
