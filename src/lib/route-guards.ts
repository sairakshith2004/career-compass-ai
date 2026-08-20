import { redirect } from "@tanstack/react-router";

import { getLatestResume } from "./server-fns";

/**
 * Gate for routes whose content is derived from the resume (Jobs, Skills, Assessments,
 * Roadmap): redirects to the resume uploader until one exists, covering both "signed out"
 * and "signed in but hasn't uploaded yet" — `getLatestResume` returns null for both.
 * Dashboard, Resume and Settings stay reachable without a resume — Dashboard shows its own
 * upload prompt, Resume is the escape hatch, Settings is account config, not resume-derived.
 */
export async function requireResume() {
  const resume = await getLatestResume();
  if (!resume) {
    throw redirect({ to: "/app/resume" });
  }
}
