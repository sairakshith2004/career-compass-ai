# Career Journey — Persistent Backend & Database Foundation (Phase 6)

The persistent state of a student's career journey: their active career goal,
the skill gaps between where they are and where they want to be, a roadmap of
phases and tasks, per-task progress, and the full activity history that powers
**"continue where you left off"**.

**The database is the source of truth.** The frontend is presentation only — it
never remembers which task you were on. Every user-owned row is scoped to the
authenticated user and is only ever read or written through a `.server.ts`
service that takes an explicit `userId` from the verified session.

## Where the logic lives

```
src/lib/career-levels.ts          pure helpers: level ranks, gap severity/priority (client-safe)
src/lib/skill-gap-engine.server.ts recompute + persist skill_gaps for a career goal
src/lib/roadmap-builder.server.ts  deterministic template roadmap (phases → tasks) from the gaps
src/lib/student-skills.server.ts   single writer for user_skills + append-only user_skill_history
src/lib/activity.server.ts         append-only activity_events log
src/lib/career.server.ts           goals, roadmap read, task mutations, getContinueState()
src/lib/career-fns.ts              RPC wrappers — requireUser() then delegate
src/lib/projects-catalog.ts        deterministic portfolio-project seed data
```

Seeding is lazy and additive (`onConflictDoNothing`), same pattern as the rest
of the app: `ensureTaxonomySeeded()` (branches/careers/skills/requirements) and
`ensureCareerFoundationSeeded()` (projects + `assessment_questions`) top the
tables up on first use. **No fake users or personal data are ever seeded.**

## Data model (migrations `0006_greedy_venus`, `0007_massive_nextwave`)

New tables live in `src/lib/db/career-schema.ts` (a one-way import from
`schema.ts` — no cycle). Existing tables were extended additively.

| Table | Purpose |
| --- | --- |
| `career_goals` | A student's career goals over time; history preserved, exactly one `is_primary` + `active` at a time (enforced in the service). |
| `skill_gaps` | One row per (goal, required skill): `current_level`, `required_level`, `severity`, `priority`, `status`. Unique on `(career_goal_id, skill_id)`. |
| `career_roadmaps` | One active roadmap per goal; `source` = `template` \| `ai_generated` \| `manual`; `progress_percent`. |
| `roadmap_phases` | Ordered phases within a roadmap; `status`, `progress_percent`. Unique on `(roadmap_id, order_index)`. |
| `roadmap_tasks` | Ordered tasks within a phase. **`status` here is canonical** (`not_started` \| `in_progress` \| `completed` \| `skipped`). Denormalised `roadmap_id` / `user_id` for cheap scoping. |
| `task_progress` | Per-task timing/analytics (time spent, attempts, timestamps). One row per task. Never stores a competing status. |
| `user_skill_history` | Append-only skill-level progression: `previous_level` → `new_level`, `source`, `reason`. |
| `activity_events` | Append-only journey log (20 event types). Small non-sensitive descriptors only — never résumé text. |
| `ai_runs` | Audit of AI calls (model, prompt version, tokens, status). |
| `career_recommendations` | Deduped, user-scoped career recommendation records; unique on `(user_id, career_title_raw, source)`. |
| `assessment_questions` / `assessment_answers` | Question bank (server-only `correct_index`) + per-attempt answers. |
| `projects` / `project_skills` / `project_career_roles` / `student_projects` | Portfolio-project catalog, its skill/career links, and per-student progress. |
| `job_matches` / `job_applications` / `interview_prep` | Job match scores, application pipeline, interview-prep records. |
| `notifications` | Per-user reminders. |

Extended: `student_profiles` (+specialization, semester, work location, profile
completion, detected-branch fields), `careers` (+`typical_experience_level`),
`career_skill_requirements` (+`required_level`), `user_skills` (+`current_level`,
`score`, widened `source` to 8 values incl. `ai_inference`, `evidence`,
`last_assessed_at`; unique on `(user_id, skill_id)`), `assessments`
(+`category`), `jobs` (+catalog fields, all nullable).

## Skill sources — AI inference is distinct from verified evidence

`user_skills.source` has 8 values. An `assessment` / `project` / `interview` /
`coding_practice` signal is **verified** and can raise `verified_level`. A
`resume` / `ai_inference` / `user_input` signal only sets `claimed_level` /
`current_level` — it never raises `verified_level`. `student-skills.server.ts`
is the only writer and enforces this; every level change is appended to
`user_skill_history`.

## The Skill Gap Engine

`recomputeSkillGaps(userId, careerGoalId, careerId)` joins the career's
`career_skill_requirements` against the student's effective skill levels
(`max(verified, current, claimed)`), computes `severity` and `priority` per
`career-levels.ts`, upserts `skill_gaps`, removes gaps for requirements that no
longer apply, and records a `skill_gaps_identified` event. Idempotent — safe to
call after every résumé analysis or assessment.

## The roadmap builder

`buildTemplateRoadmap(userId, careerGoalId, careerId)` is deterministic (no AI,
`source: "template"`). It recomputes gaps, buckets the open ones into
**Foundations** / **Core Problem Solving** / **Specialization** phases (by skill
category), emits *Learn → Practice → (Build, if severe)* tasks per gap, then
appends a **Build Projects** phase (from `projects` linked to the career) and an
**Interview Preparation** phase. Archives any prior active roadmap for the goal.

## "Continue where you left off"

`getContinueState(userId)` computes, entirely from the database:

1. authenticated user → 2. active (primary) career goal → 3. active roadmap →
4. current phase → 5. current task (the in-progress task, else the first
`not_started` in phase+order) → 6. last completed task → 7. overall roadmap
progress → 8. last activity → 9. recommended next action.

```jsonc
{
  "hasJourney": true,
  "career": "Software Engineer",
  "roadmapProgress": 42,
  "currentPhase": { "id": "...", "title": "Core Problem Solving" },
  "currentTask": { "id": "...", "title": "Practice Binary Search with focused exercises", "status": "in_progress" },
  "lastCompletedTask": { "id": "...", "title": "Learn Sorting Algorithms fundamentals" },
  "recommendedNextAction": "Finish \"Practice Binary Search with focused exercises\""
}
```

Because it is recomputed from `roadmap_tasks.status` + `activity_events` on every
call, closing the app and signing back in later returns the exact same task.

## RPC surface (`career-fns.ts`)

`setCareerGoal`, `listCareerGoals`, `getRoadmap`, `rebuildRoadmap`,
`getContinue`, `getCareerSkillGaps`, `getCareerActivity`, `beginTask`,
`finishTask`, `passTask`, `undoTask`. Each calls `requireUser()` and passes that
id down; the client never supplies a user id or any authorization input.
Ownership is checked in the service (`ownedTask` asserts `user_id` match — a
cross-user task id resolves to "Task not found").

## Tests

- `tests/career-journey.test.ts` — end-to-end persistence: create student → set
  goal → roadmap+phases+tasks auto-created → start/complete tasks → re-query
  from the DB → `getContinueState` returns the exact next unfinished task;
  goal-switch preserves history; a verified assessment closes a gap and writes
  history.
- `tests/career-authz.test.ts` — a second user cannot read or mutate the first
  user's goal, roadmap, tasks, or skill gaps.
