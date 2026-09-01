# Student Onboarding & Profile (Phase 2)

A structured student profile, collected through a resumable 5-step wizard.

> No AI, no recommendations — this phase only captures and stores the profile.

## Flow

```
Signup → auth session → /app/onboarding (5 steps) → Complete → /app (dashboard summary)
```

Signup redirects new accounts to `/app/onboarding` (Phase 1). The dashboard shows
a **"Set up / finish your profile"** card until onboarding is complete, and a
**profile summary card** afterwards — it never hard-redirects, so a student who
picked "I'm not sure yet" is never trapped in a loop.

## The 5 steps

| Step | Screen                    | Collects                                                                                                  | Required?       |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------------------- | --------------- |
| 1    | Academic background       | Full name, engineering degree, college/university, country                                             | only full name  |
| 2    | Engineering branch        | branch, free-text specialization                                                                       | optional (Skip) |
| 3    | Current year & graduation | current year, current semester (hidden once "Graduated"), expected graduation year                     | optional (Skip) |
| 4    | Career direction          | career-goal status, target career(s), career-interest areas, experience level, preferred work location, career notes | goal status     |
| 5    | Review                    | read-only summary → **Complete**                                                                       | —               |

The `/app/profile` nav item opens this same wizard (it is the profile editor for a
completed profile). `student_profiles.profile_completion` (0–100) is recomputed by
`src/lib/profile-completion.ts` (pure) after every write and surfaced on the
dashboard card.

Every step has **Back**, **Next**, **Skip** (optional steps), and **Save &
finish later**. Each of those persists the current step server-side before
navigating, so progress is never lost — including across devices, because it
lives in the database, not `localStorage`.

**Resume:** `getOnboardingState` returns `resumeStep` = first unfinished step.
The wizard opens there; the stepper lets you jump back to any completed step.
A completed profile reopens at step 1 in edit mode.

## Branch ≠ career

Branch and career are **independent concepts** and are never mapped to each
other:

- `engineering_branches` and `careers` are separate reference tables.
- The step-4 career picker shows **every** career, grouped by category
  (Software / Data & AI / Hardware & Electronics / Mechanical & Manufacturing /
  Civil & Infrastructure / Core & Cross-disciplinary), regardless of the
  student's branch.
- `onboarding-catalog.ts` contains no `careersByBranch` structure of any kind —
  there's a test asserting this.

So an ECE student can pick Machine Learning Engineer + Backend Developer (the
manual walkthrough does exactly this); a Mechanical student can pick Data
Engineer.

Career-goal status drives the picker:

| Status                                      | Picker                                   |
| ------------------------------------------- | ---------------------------------------- |
| `known` — "I know exactly what I want"      | single select (server trims to 1)        |
| `exploring` — "I have a few career options" | multi-select, up to 5                    |
| `unsure` — "I am not sure yet"              | hidden; any existing targets are cleared |

## Career interests ≠ target career

**Career-interest areas** are the broad domains a student is drawn to (e.g. "Data &
AI", "Robotics & Automation"). They are the taxonomy's career **groups**, derived
in `taxonomy-catalog.ts` (`CAREER_GROUPS`) — adding a career with a new group adds
the interest area with no code change. Stored M:N in `student_interest_areas`,
replace-all on each save. This is deliberately separate from `student_target_careers`
(a concrete role like "ML Engineer"): interests are exploratory, targets are chosen.

## Database

Migration **`0002_certain_stature`** (base) + **`0006_greedy_venus`**
(`specialization`, `current_semester`, `preferred_work_location`,
`profile_completion`) + **`0008_charming_gambit`** (`career_notes`,
`student_interest_areas`):

### `engineering_branches` / `careers` — reference tables

`id`, `slug` (unique), `name`, (`category` on careers), timestamps. Seeded lazily
from `src/lib/onboarding-catalog.ts` (`ensureOnboardingCatalogSeeded`).

### `student_profiles` — 1:1 with `user`

`user_id` PK/FK (`on delete cascade`). Every answer column is **nullable** so
optional questions can be skipped:

`degree`, `branch_id` (FK → `engineering_branches`, `on delete set null`),
`specialization` (free text), `college_name`, `country_code` (ISO-3166-1 alpha-2),
`current_year` (enum: first…fifth/graduated), `current_semester` (int 1–12, forced
`null` once `current_year = graduated`), `graduation_year`, `experience_level`
(enum: student/internship/junior/mid/senior), `career_goal_status`
(enum: known/exploring/unsure), `preferred_work_location` (free text, distinct from
`country_code`), `career_notes` (free text, ≤ 2000 chars), `profile_completion`
(int 0–100, recomputed on every write), `last_completed_step` (int, default 0,
drives resume), `onboarding_completed_at` (nullable — flips on step-5 confirm),
timestamps.

Indexes: `student_profiles_branch_idx`, `student_profiles_country_idx`.

### `student_interest_areas` — M:N student ↔ career-interest area

`id`, `user_id` (FK cascade), `group_slug` (a `CAREER_GROUPS` slug), timestamps.
`unique(user_id, group_slug)`, index on `user_id`. Replace-all on each step-4 /
profile save.

### `student_target_careers` — M:N student ↔ career

`id`, `user_id` (FK cascade), `career_id` (FK → `careers`, cascade), timestamps.
`unique(user_id, career_id)`, index on `user_id`. One row for `known`, several
for `exploring`, none for `unsure`. Replace-all on each step-4 save.

Small closed sets (degree, current year, experience, goal status, country) are
stored as string enums / codes on the profile row — normalized enough to filter
on, not worth a join table.

## Security — ownership enforced on the backend

- **`src/lib/student-profile.server.ts`** (`.server.ts`, never imported client-side)
  holds all logic. Every function takes an explicit `userId` and scopes every
  read and write to it (`where user_id = <arg>`).
- **`src/lib/onboarding-fns.ts`** — the `createServerFn` RPC wrappers. Each does
  exactly: `const { id } = await requireUser()` (Phase 1 — session cookie +
  active-status gate) → delegate with that id. **No wrapper accepts a user id or
  profile id from the caller.** There is no endpoint that can address another
  user's profile.
  - Retrieval: `getOnboarding` / `getProfile` (state + catalog), `getProfileSummary`.
  - Creation / update: `saveOnboardingStep1‥4` + `finishOnboarding` (step-wise), and
    `updateProfile` — a single-call full-profile patch (`updateProfileSchema`) that
    writes every submitted field, replaces the target-career and interest-area sets,
    recomputes completion, and never touches onboarding progress.
- Route protection (`/app/*` `beforeLoad` → `requireAuth`) is treated as UX
  only; the RPCs enforce auth themselves — tested by calling them with no
  session and asserting they reject.
- All input validated server-side with Zod (`academicBackgroundSchema`,
  `branchSchema`, `graduationSchema`, `careerDirectionSchema`, `updateProfileSchema`);
  branch / career / country / interest-area values are all checked against the
  catalog, string lengths and the semester / graduation-year ranges are bounded.

## Tests

### `tests/student-profile.test.ts` (11 cases, Phase 2 extension)

- **catalog:** interest areas are exposed and every slug is a real `CAREER_GROUPS`
  slug; `maxSemester` is surfaced.
- **new fields:** specialization / current semester / interests / preferred location
  / notes round-trip through the step savers; semester is dropped on "Graduated";
  an unknown interest-area slug is rejected.
- **`updateStudentProfile`:** writes every field, trims `known` to one target,
  replaces the interest set, clears fields on omit, and never flips
  `onboardingCompletedAt`.
- **completion:** `computeProfileCompletion` is monotonic and ≤ 100; the persisted
  `profile_completion` column matches the computed value.
- **ownership:** interest-area rows and summary reads are isolated per user.
- **auth:** `updateProfile` rejects with no session.

### `tests/onboarding.test.ts` (13 cases)

- **catalog:** branch and career are independent; every career offered
  regardless of branch; no branch→career map exists.
- **progress persists & resumes:** fresh user → step 1; each step save persists
  its fields and advances `resumeStep`; re-saving step 1 doesn't clobber steps
  2–3; incomplete profile resumes mid-flow; completed profile reopens at step 1.
- **branch ≠ career:** an `ece` student saves `ml-engineer` + `backend-developer`
  — accepted, no coupling.
- **goal status:** `unsure` clears targets; `known` trimmed to one; complete
  refused until the career step is answered.
- **ownership:** `getOnboardingState` / `getStudentProfileSummary` return only
  the requested user's data (two users, distinct colleges/branches);
  `student_target_careers` rows isolated per user; profiles keyed by `user_id`
  only.
- **auth:** onboarding RPCs reject with no session.

Run: `npm test` (all 30 across Phase 1 + 2).

## Manual testing steps

```bash
npm install && npm run db:migrate && npm run dev   # http://localhost:3000
```

1. **Unauthenticated:** open `/app/onboarding` in a private window →
   redirected to `/login?redirect=%2Fapp%2Fonboarding`.
2. **Sign up** a new account → lands on `/app/onboarding` step 1, name
   pre-filled.
3. **Step 1:** change the name, pick a degree, type a college, pick a country →
   **Next**.
4. **Step 2:** pick **Electronics & Communication Engineering** → **Next**.
5. **Step 3:** pick "3rd year", type `2027` → **Next** (or **Skip**).
6. **Step 4:** choose **"I have a few career options"**, then select
   **Machine Learning Engineer** and **Backend Developer** from the picker
   (note: an ECE student, software/AI careers — no restriction), pick an
   experience level → **Next**.
7. **Progress persistence:** before finishing, reload the page (or click
   **Save & finish later** then reopen `/app/onboarding`) → the wizard resumes
   at step 4/5 with every earlier answer intact.
8. **Step 5:** review the summary → **Complete profile** → redirected to `/app`.
9. **Dashboard:** the **"Your profile"** card shows name, degree, branch,
   college, country, year, graduation, experience, career goal, and the two
   target-career badges. **Edit** reopens the wizard at step 1.
10. **Ownership:** sign up a second account, complete a different profile, then
    switch back to the first — each dashboard shows only its own profile.
    `npm run db:studio` → `student_profiles` has one row per `user_id`.

```

```
