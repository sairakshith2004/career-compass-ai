import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "./db/client";
import { jobs } from "./db/schema";
import { jobApplications, JOB_APPLICATION_STATUSES } from "./db/career-schema";
import { readSessionUser } from "./session.server";

/**
 * List the user's job applications with joined job data.
 */
export const listJobApplications = createServerFn({ method: "GET" }).handler(async () => {
  const session = await readSessionUser(getRequestHeaders());
  if (!session) return [];

  return db
    .select({
      id: jobApplications.id,
      status: jobApplications.status,
      appliedAt: jobApplications.appliedAt,
      interviewStage: jobApplications.interviewStage,
      notes: jobApplications.notes,
      createdAt: jobApplications.createdAt,
      jobTitle: jobs.title,
      jobCompany: jobs.company,
      jobLocation: jobs.location,
      jobId: jobs.id,
      matchScore: jobs.matchScore,
    })
    .from(jobApplications)
    .innerJoin(jobs, eq(jobs.id, jobApplications.jobId))
    .where(eq(jobApplications.userId, session.id))
    .orderBy(desc(jobApplications.createdAt));
});

/**
 * Create a job application from an existing analyzed job.
 */
export const createJobApplication = createServerFn({ method: "POST" })
  .validator(
    z.object({
      jobId: z.string().min(1),
      notes: z.string().max(1000).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const session = await readSessionUser(getRequestHeaders());
    if (!session) throw new Error("Not signed in");

    const [job] = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, data.jobId), eq(jobs.userId, session.id)))
      .limit(1);
    if (!job) throw new Error("Job not found");

    const [existing] = await db
      .select({ id: jobApplications.id })
      .from(jobApplications)
      .where(and(eq(jobApplications.jobId, data.jobId), eq(jobApplications.userId, session.id)))
      .limit(1);
    if (existing) throw new Error("Already tracking this job");

    const [row] = await db
      .insert(jobApplications)
      .values({
        userId: session.id,
        jobId: data.jobId,
        status: "saved",
        notes: data.notes,
      })
      .returning();

    return { id: row!.id };
  });

/**
 * Update a job application's status.
 */
export const updateJobApplication = createServerFn({ method: "POST" })
  .validator(
    z.object({
      applicationId: z.string().min(1),
      status: z.enum(JOB_APPLICATION_STATUSES).optional(),
      interviewStage: z.string().max(100).optional(),
      notes: z.string().max(1000).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const session = await readSessionUser(getRequestHeaders());
    if (!session) throw new Error("Not signed in");

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (data.status) {
      updates["status"] = data.status;
      if (data.status === "applied" && !updates["appliedAt"]) updates["appliedAt"] = new Date();
    }
    if (data.interviewStage !== undefined) updates["interviewStage"] = data.interviewStage;
    if (data.notes !== undefined) updates["notes"] = data.notes;

    await db
      .update(jobApplications)
      .set(updates)
      .where(
        and(eq(jobApplications.id, data.applicationId), eq(jobApplications.userId, session.id)),
      );
  });

/**
 * Delete a job application.
 */
export const deleteJobApplication = createServerFn({ method: "POST" })
  .validator(z.object({ applicationId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const session = await readSessionUser(getRequestHeaders());
    if (!session) throw new Error("Not signed in");

    await db
      .delete(jobApplications)
      .where(
        and(eq(jobApplications.id, data.applicationId), eq(jobApplications.userId, session.id)),
      );
  });

/**
 * Get application stats.
 */
export const getApplicationStats = createServerFn({ method: "GET" }).handler(async () => {
  const session = await readSessionUser(getRequestHeaders());
  if (!session) return { total: 0, byStatus: {} };

  const rows = await db
    .select({ status: jobApplications.status })
    .from(jobApplications)
    .where(eq(jobApplications.userId, session.id));

  const byStatus: Record<string, number> = {};
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  }

  return { total: rows.length, byStatus };
});
