import { and, asc, eq } from "drizzle-orm";

import { db } from "./db/client";
import { careers, skills } from "./db/schema";
import {
  careerRoadmaps,
  projectCareerRoles,
  projects,
  roadmapPhases,
  roadmapTasks,
} from "./db/career-schema";
import { recomputeSkillGaps, type SkillGapRow } from "./skill-gap-engine.server";
import { severityRank } from "./career-levels";
import { recordActivity } from "./activity.server";
import { ensureCareerFoundationSeeded } from "./db/seed";

/**
 * Deterministic template roadmap builder. Given a career goal and its computed
 * skill gaps, it lays out phases → tasks. No AI — `career_roadmaps.source` is
 * `"template"`. AI-generated roadmaps are a later phase and will set
 * `source: "ai_generated"`.
 *
 * `.server.ts` — the caller passes a verified `userId`.
 */

type PhasePlan = { key: string; title: string; description: string; categories: (string | null)[] };

// Skill categories come from skills-catalog.ts. Anything not matched by an
// earlier phase falls through to "Specialization".
const PHASE_PLAN: PhasePlan[] = [
  {
    key: "foundations",
    title: "Foundations",
    description: "Programming languages, core tooling and professional fundamentals.",
    categories: ["Language", "Tools", "Professional", "Emerging Tech"],
  },
  {
    key: "core",
    title: "Core Problem Solving",
    description: "Data structures, algorithms, system design and CS fundamentals.",
    categories: ["Concept"],
  },
];
const SPECIALIZATION: PhasePlan = {
  key: "specialization",
  title: "Specialization",
  description: "The domain skills your target role expects.",
  categories: [], // catch-all
};

const INTERVIEW_TASKS = [
  { title: "Build a study plan for behavioural + technical rounds", minutes: 60 },
  { title: "Practice explaining your projects (STAR method)", minutes: 90 },
  { title: "Do 3 mock interviews and note the feedback", minutes: 180 },
];

function tasksForGap(gap: SkillGapRow, startOrder: number) {
  const out: {
    title: string;
    description: string | null;
    taskType: "learn" | "practice" | "project";
    orderIndex: number;
    estimatedMinutes: number;
    priority: number;
    skillId: string;
  }[] = [];
  out.push({
    title: `Learn ${gap.skillName} fundamentals`,
    description: `Target level: ${gap.requiredLevel}. You're currently ${gap.currentLevel ?? "not started"}.`,
    taskType: "learn",
    orderIndex: startOrder,
    estimatedMinutes: 120,
    priority: gap.priority,
    skillId: gap.skillId,
  });
  out.push({
    title: `Practice ${gap.skillName} with focused exercises`,
    description: null,
    taskType: "practice",
    orderIndex: startOrder + 1,
    estimatedMinutes: 90,
    priority: gap.priority,
    skillId: gap.skillId,
  });
  if (severityRank(gap.severity) >= 3) {
    out.push({
      title: `Build something that uses ${gap.skillName}`,
      description: "A small project or feature that demonstrates the skill in context.",
      taskType: "project",
      orderIndex: startOrder + 2,
      estimatedMinutes: 300,
      priority: gap.priority,
      skillId: gap.skillId,
    });
  }
  return out;
}

/**
 * Create a fresh active roadmap for a career goal. Archives any previous active
 * roadmap for the same goal (history is preserved, never deleted).
 */
export async function buildTemplateRoadmap(
  userId: string,
  careerGoalId: string,
  careerId: string,
): Promise<{ roadmapId: string; phaseCount: number; taskCount: number }> {
  await ensureCareerFoundationSeeded();
  const [career] = await db.select().from(careers).where(eq(careers.id, careerId)).limit(1);
  const gaps = await recomputeSkillGaps(userId, careerGoalId, careerId);
  const openGaps = gaps
    .filter((g) => g.severity !== "none")
    .sort((a, b) => a.priority - b.priority);

  // Archive prior active roadmaps for this goal.
  await db
    .update(careerRoadmaps)
    .set({ status: "archived", updatedAt: new Date() })
    .where(
      and(
        eq(careerRoadmaps.userId, userId),
        eq(careerRoadmaps.careerGoalId, careerGoalId),
        eq(careerRoadmaps.status, "active"),
      ),
    );

  const [roadmap] = await db
    .insert(careerRoadmaps)
    .values({
      userId,
      careerGoalId,
      title: `${career?.name ?? "Career"} roadmap`,
      description: `A step-by-step plan from your current skills to ${career?.name ?? "your target role"}.`,
      source: "template",
      status: "active",
    })
    .returning();
  const roadmapId = roadmap!.id;

  // Bucket the open gaps into phases.
  const matchedByPhase = new Map<string, SkillGapRow[]>();
  const specialization: SkillGapRow[] = [];
  for (const gap of openGaps) {
    const phase = PHASE_PLAN.find((p) => p.categories.includes(gap.category));
    if (phase) {
      matchedByPhase.set(phase.key, [...(matchedByPhase.get(phase.key) ?? []), gap]);
    } else {
      specialization.push(gap);
    }
  }

  const skillPhases: (PhasePlan & { gaps: SkillGapRow[] })[] = [];
  for (const p of PHASE_PLAN) {
    const g = matchedByPhase.get(p.key) ?? [];
    if (g.length > 0) skillPhases.push({ ...p, gaps: g });
  }
  if (specialization.length > 0) skillPhases.push({ ...SPECIALIZATION, gaps: specialization });

  // --- write phases + tasks -------------------------------------------------
  let phaseOrder = 0;
  let taskCount = 0;

  for (const p of skillPhases) {
    const [phaseRow] = await db
      .insert(roadmapPhases)
      .values({
        roadmapId,
        userId,
        title: p.title,
        description: p.description,
        orderIndex: phaseOrder++,
      })
      .returning();
    let taskOrder = 0;
    for (const gap of p.gaps) {
      const tasks = tasksForGap(gap, taskOrder);
      taskOrder += tasks.length;
      for (const t of tasks) {
        await db.insert(roadmapTasks).values({
          phaseId: phaseRow!.id,
          roadmapId,
          userId,
          title: t.title,
          description: t.description,
          taskType: t.taskType,
          orderIndex: t.orderIndex,
          estimatedMinutes: t.estimatedMinutes,
          priority: t.priority,
          skillId: t.skillId,
        });
        taskCount++;
      }
    }
  }

  // --- projects phase -----------------------------------------------------
  const catalogProjects = await db
    .select({ title: projects.title, description: projects.description })
    .from(projects)
    .innerJoin(projectCareerRoles, eq(projectCareerRoles.projectId, projects.id))
    .where(eq(projectCareerRoles.careerId, careerId))
    .orderBy(asc(projects.difficulty))
    .limit(3);

  const [projectPhase] = await db
    .insert(roadmapPhases)
    .values({
      roadmapId,
      userId,
      title: "Build Projects",
      description: "Portfolio projects that show you can apply the skills above.",
      orderIndex: phaseOrder++,
    })
    .returning();
  const projectTasks =
    catalogProjects.length > 0
      ? catalogProjects.map((p, i) => ({
          title: `Build: ${p.title}`,
          description: p.description,
          order: i,
        }))
      : [
          { title: "Design and ship a portfolio project", description: null, order: 0 },
          { title: "Write a clear README and deploy it", description: null, order: 1 },
        ];
  for (const t of projectTasks) {
    await db.insert(roadmapTasks).values({
      phaseId: projectPhase!.id,
      roadmapId,
      userId,
      title: t.title,
      description: t.description,
      taskType: "project",
      orderIndex: t.order,
      estimatedMinutes: 600,
      priority: 8,
    });
    taskCount++;
  }

  // --- interview prep phase --------------------------------------------
  const [interviewPhase] = await db
    .insert(roadmapPhases)
    .values({
      roadmapId,
      userId,
      title: "Interview Preparation",
      description: "Get ready for applications and interview rounds.",
      orderIndex: phaseOrder++,
    })
    .returning();
  await db.insert(roadmapTasks).values(
    INTERVIEW_TASKS.map((t, i) => ({
      phaseId: interviewPhase!.id,
      roadmapId,
      userId,
      title: t.title,
      description: null as string | null,
      taskType: (i === INTERVIEW_TASKS.length - 1 ? "milestone" : "practice") as
        "milestone" | "practice",
      orderIndex: i,
      estimatedMinutes: t.minutes,
      priority: 9,
    })),
  );
  taskCount += INTERVIEW_TASKS.length;

  const estimatedWeeks = Math.max(4, Math.ceil(taskCount / 4));
  await db
    .update(careerRoadmaps)
    .set({ estimatedWeeks, updatedAt: new Date() })
    .where(eq(careerRoadmaps.id, roadmapId));

  await recordActivity(userId, "roadmap_created", {
    entityType: "career_roadmap",
    entityId: roadmapId,
    metadata: { phases: phaseOrder, tasks: taskCount, career: career?.name ?? null },
  });

  return { roadmapId, phaseCount: phaseOrder, taskCount };
}
