# Career Profile & Target Job System (Phase 6)

The persistent answer to four questions, ready for the Phase 7 Skill Gap Engine:

```
WHO THE STUDENT IS  +  WHAT THEY CURRENTLY KNOW  +  WHAT JOB THEY WANT  +  WHAT THAT JOB REQUIRES
   student_profiles         user_skills            student_target_careers    career_skill_requirements
```

> No skill-gap computation, no roadmap here — Phase 6 assembles the inputs and
> `getPhase7Inputs` hands them off.

## What it reuses (no duplicate tables)

| Concept                | Table                                   | Origin              |
| ---------------------- | --------------------------------------- | ------------------- |
| Career profile         | `student_profiles`                      | Phase 2, extended   |
| Target roles catalog   | `careers`                               | Phase 3 taxonomy    |
| A user's target roles  | `student_target_careers` (+ `is_primary`) | Phase 2, extended |
| What a role requires   | `career_skill_requirements`             | Phase 3 taxonomy    |
| Current skills         | `user_skills`                           | Phase 4/5 + assessments |

## Schema — migration `0010_spotty_centennial` (additive)

- `student_profiles`: `preferred_industries` / `preferred_job_types` /
  `preferred_locations` (JSON string arrays) + `work_mode`
  (`remote` | `hybrid` | `onsite` | `flexible`). `preferred_work_location`
  (Phase 2, single string) is kept and mirrors `preferred_locations[0]`.
- `student_target_careers`: `is_primary` (boolean, default false) +
  `(user_id, is_primary)` index. **Exactly one primary per user**, enforced in
  `career-profile.server.ts` (`makePrimary` demotes all others in the same
  statement pair).

Option sets (industries, job types, work modes) live in
`src/lib/career-profile-catalog.ts` — add an entry and the picker + validation
pick it up. **Roles are the taxonomy, so every branch is covered — not just CSE.**

## Service — `src/lib/career-profile.server.ts`

Every function takes a `userId` from the verified session. A role slug from the
client is validated against the taxonomy and used only for reference lookups or
as an owner-scoped filter (`user_id = ? AND career_id = ?`) — never for authz.

| Function                          | Purpose                                                         |
| --------------------------------- | ------------------------------------------------------------- |
| `getCareerProfile(userId)`        | assembled view: identity + preferences + target roles + current skills + **AI-detected suggestions** (from the latest résumé analysis — editable, never applied) + `phase7` readiness |
| `updateCareerProfile(userId, …)`  | one-shot save of the editable fields + preferences + target-role set + primary |
| `addTargetRole` / `removeTargetRole` | granular set edits; removing the primary promotes the next role |
| `setPrimaryTargetRole`            | adds the role if needed, then makes it the sole primary        |
| `searchTargetRoles(q)`            | reference-only role search (no user data)                      |
| `getRoleRequirements(slug)`       | a role's skills grouped core / important / helpful, each with `requiredLevel` |
| `getPhase7Inputs(userId)`         | **the clean handoff** — see below                              |

## Phase 7 handoff — `getPhase7Inputs`

```ts
{
  profile: { branchSlug, specialization, experienceLevel, graduationYear },
  primaryRole: { slug, name, careerId } | null,
  targetRoles: [{ slug, name, isPrimary }],
  requiredSkills: [{ skillSlug, skillName, importance, requiredLevel }],  // primary role's requirements
  currentSkills: [{ skillSlug, skillName, level, source, score }],        // from user_skills
  readiness: {
    ready,                       // hasPrimaryRole && currentSkillCount > 0
    hasPrimaryRole, hasBranch, hasResumeAnalysis,
    currentSkillCount, requiredSkillCount, coveredRequiredSkills,
    missing: string[],           // human-readable "do this first" list
  }
}
```

`recomputeSkillGaps(userId, careerGoalId, careerId)` (Phase 7) consumes exactly
`primaryRole.careerId` + `requiredSkills` + `currentSkills`.

## API — `src/lib/career-profile-fns.ts` (`createServerFn`, all `requireUser()`)

`getCareerProfileData` (profile + catalog) · `saveCareerProfile` ·
`addRole` / `removeRole` / `setPrimaryRole` · `searchRoles` · `roleRequirements` ·
`phase7Inputs`.

## Frontend — `/app/career` ("Career" nav item)

- **Who you are** — branch / specialization / degree / college / graduation year /
  experience level. Each field shows an *"AI: X — use"* button when a résumé
  analysis has a different value; clicking fills the field, it is never
  auto-applied, and nothing persists until **Save**.
- **Target roles** — searchable across all branches, multi-select chips, a ★ to
  set the primary, résumé-suggested roles as one-tap adds.
- **Preferences** — industries / job types / work mode chips + a tag input for
  preferred locations.
- **Career goals** — free text.
- **Skill-gap analysis readiness** — the `phase7` block: green when ready (with
  "covered X of Y required skills"), otherwise a checklist of what's missing.

## Tests — `tests/career-profile.test.ts` (13)

catalog covers many branches + option sets; `searchTargetRoles` is reference-only;
profile CRUD round-trips + updates in place + mirrors `preferred_work_location`;
target-role add / list / remove; **exactly one primary** through switches and
promotions; removing the primary promotes another; invalid role / industry /
job-type / work-mode / graduation-year rejected; `getRoleRequirements` returns
levelled core/important/helpful skills; `getPhase7Inputs` not-ready → ready as a
primary role + skills appear, with `requiredSkills` / `coveredRequiredSkills`
populated; per-user isolation (a role slug can't reach another user's rows); every
RPC rejects with no session.

Full suite: **133 pass**. `npx tsc --noEmit` + `npm run lint` + `npm run build` clean.
