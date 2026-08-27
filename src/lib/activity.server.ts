import { desc, eq } from "drizzle-orm";

import { db } from "./db/client";
import { activityEvents, type ActivityType } from "./db/career-schema";

/** A flat, JSON-serializable bag of descriptors (titles, counts). */
export type ActivityMetadata = Record<string, string | number | boolean | null>;

/**
 * Append-only student activity / journey log. Every meaningful action a student
 * takes is recorded here (scoped to their user id) so the app — and later, AI —
 * can understand their career journey and drive "continue where you left off".
 *
 * `.server.ts` — server-only. Store only small, non-sensitive descriptors
 * (titles, counts); never résumé text or secrets.
 */

export async function recordActivity(
  userId: string,
  type: ActivityType,
  opts: {
    entityType?: string;
    entityId?: string;
    metadata?: ActivityMetadata;
  } = {},
): Promise<void> {
  try {
    await db.insert(activityEvents).values({
      userId,
      type,
      entityType: opts.entityType ?? null,
      entityId: opts.entityId ?? null,
      metadata: opts.metadata ?? null,
    });
  } catch (err) {
    // Activity logging must never break the action it describes.
    console.error("[activity] failed to record", type, (err as Error).message);
  }
}

export type ActivityEntry = {
  id: string;
  type: ActivityType;
  entityType: string | null;
  entityId: string | null;
  metadata: ActivityMetadata | null;
  createdAt: Date;
};

/** The caller's own recent activity, newest first. */
export async function getActivity(userId: string, limit = 50): Promise<ActivityEntry[]> {
  const rows = await db
    .select()
    .from(activityEvents)
    .where(eq(activityEvents.userId, userId))
    .orderBy(desc(activityEvents.createdAt))
    .limit(Math.min(Math.max(limit, 1), 200));
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    entityType: r.entityType,
    entityId: r.entityId,
    metadata: r.metadata,
    createdAt: r.createdAt,
  }));
}

/** The caller's single most recent activity event, or null. */
export async function getLastActivity(userId: string): Promise<ActivityEntry | null> {
  const [entry] = await getActivity(userId, 1);
  return entry ?? null;
}
