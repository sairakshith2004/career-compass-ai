# Engineering + Career Taxonomy (Phase 3)

The structured taxonomy WorkLens uses to reason about engineering students —
their academic background and the careers open to them. **No AI classification**
in this phase: it's data, a schema, seed content and read services.

## Where the logic lives

**Not in React.** The whole taxonomy is one editable data file —
`src/lib/taxonomy-catalog.ts` — which seeds five DB tables. Screens and services
read it back from the database. Adding a category, branch, career or skill link
is a data edit to that one file; no application code changes, and the seeder is
additive (`onConflictDoNothing`) so new rows appear on the next boot.

```
src/lib/taxonomy-catalog.ts   ── source of truth (categories, branches,
                                  career paths, branch↔career + career↔skill maps)
        │  seeds (db/seed.ts → ensureTaxonomySeeded)
        ▼
5 tables ── read by ──▶  src/lib/taxonomy.server.ts   (services)
                          src/lib/taxonomy-fns.ts     (RPC wrappers)
```

## Data model (migration `0003_smooth_sandman`)

```
engineering_categories 1───N engineering_branches ────┐
                                                       │ branch_career_paths
                                        (M:N, relevance: primary|common|possible)
careers ──┬────────────────────────────────────────────┘
          │ career_skill_requirements
          │ (M:N, importance: core|important|helpful)
          └────────────────────────────────── skills
```

| Table                       | Purpose                                                                                                                                                                                                                                                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `engineering_categories`    | ~20 broad disciplines (CS/IT, Electronics, Mechanical, …), `slug`, `name`, `description`, `sort_order`.                                                                                                                                                                                                                      |
| `engineering_branches`      | ~72 specific branches / specializations, each `category_id` → a category, plus `aliases` (JSON) and `description`. The CS/IT category holds Computer Science, IT, Information Science, Software Engineering, AI, ML, AI & Data Science, Data Science, Cyber Security, Cloud Computing, IoT, Blockchain, Computer Networks, … |
| `careers`                   | ~62 **career paths, defined independently of any branch**. `slug`, `name`, `category` (display group), `description`.                                                                                                                                                                                                        |
| `branch_career_paths`       | **"careers compatible with a branch"** — M:N, `relevance ∈ {primary, common, possible}`. `unique(branch_id, career_id)`.                                                                                                                                                                                                     |
| `career_skill_requirements` | **CareerSkillRequirement** — M:N career ↔ `skills`, `importance ∈ {core, important, helpful}`. `unique(career_id, skill_id)`.                                                                                                                                                                                                |

`skills` (pre-existing) was extended with ~100 domain skills — embedded/VLSI,
mechanical/CAD/CAE, civil, chemical/process, robotics, automotive/aerospace,
biomedical, data/analytics, security, IoT/blockchain — so every career links to
real skills. `tests/taxonomy.test.ts` asserts there are **no dangling skill
slugs**.

Branch `slug`s were canonicalised (`ece` → `electronics-communication`, etc.).
Phase 2's short slugs are kept as `aliases`, and `resolveBranchSlug()` accepts
either form, so existing profiles and callers keep working.

## Branch ≠ career

- Career paths carry **no branch in their identity**. `branch_career_paths` only
  expresses _accessibility_.
- **The same career is reachable from many branches.** `Software Engineer` links
  to **all 72 branches** (`universalRelevance: "possible"`, upgraded to `primary`
  for CS branches and `common` for ECE/EEE/Mech/…). `Data Scientist` reaches
  Mechanical and Chemical. `Machine Learning Engineer` reaches ECE and EEE.
- Seeded exit paths match the spec's examples exactly — ECE → Embedded / VLSI /
  FPGA / Electronics / Software; Mechanical → Design / Automotive / Manufacturing
  / Robotics / Software; CSE → Software / Backend / Frontend / Full-Stack / AI /
  ML / Data / Cybersecurity / Cloud-DevOps. Each is a test.

Totals seeded: **20 categories · 72 branches · 62 careers · 1029 branch↔career
links · 499 career↔skill links**.

## Services — `src/lib/taxonomy.server.ts`

Read-only, no per-user scoping (public reference data). `.server.ts` only
because they touch the DB. All lazily call `ensureTaxonomySeeded()`.

| Function                           | Returns                                                                                      |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| `getEngineeringCategories()`       | categories, ordered, each with a branch count                                                |
| `getBranches({ categorySlug? })`   | branches, optionally scoped to a category                                                    |
| `getSpecializations(categorySlug)` | alias for the scoped call — the "specializations" retrieval                                  |
| `getTaxonomyTree()`                | categories with their branches nested (one call for a grouped picker)                        |
| `getBranch(slug)`                  | one branch + its category + its top 8 careers                                                |
| `getCareerPaths({ group? })`       | all career paths, optional display-group filter                                              |
| `getCareersForBranch(branchSlug)`  | **careers compatible with a branch**, ordered primary → common → possible                    |
| `getCareerPath(slug)`              | one career + skills grouped by importance + every branch it's reachable from                 |
| `getSkills({ category? })`         | the skill catalog                                                                            |
| `getCareersForSkill(skillSlug)`    | careers that require a skill, with importance                                                |
| `getSkillsForCareers(slugs[])`     | union of skill requirements across careers, with a per-skill career count (for later phases) |

## RPC layer — `src/lib/taxonomy-fns.ts`

`createServerFn` wrappers: `listEngineeringCategories`, `listTaxonomyTree`,
`listBranches`, `getBranchDetail`, `listCareerPaths`, `getCareerPathDetail`,
`listCareersForBranch`, `listSkills`, `listCareersForSkill`,
`listSkillsForCareers`. Inputs validated with Zod. No `requireUser()` — this is
public reference data, still same-origin-protected by the global CSRF
middleware. (The onboarding wizard, which consumes the grouped branch list, is
behind `/app` auth regardless.)

## Onboarding integration

The step-2 branch picker now renders the 72 branches grouped by category
(`<optgroup>` per discipline), fed by `onboardingCatalog().branchGroups`, which
is built from the taxonomy catalog. Career selection in step 4 is unchanged —
still the full, branch-agnostic career list.

## Tests — `tests/taxonomy.test.ts` (19 cases)

- **catalog integrity:** no dangling skill slugs; every career-referenced branch
  exists; every branch has a real category; the spec's categories and CS
  specializations are all present.
- **categories & branches:** ordered, branch counts; `getSpecializations` scopes
  correctly (a Mechanical branch never appears under CS/IT); the tree nests all
  72 branches.
- **branch ≠ career:** the whole career catalog is returned regardless of branch;
  Software Engineer is reachable from ECE **and** Mechanical **and** CSE; Data
  Scientist reaches Mechanical; the spec's ECE / Mechanical / CSE exit-path
  examples each pass; `getCareersForBranch` is ordered by relevance; unknown
  branch → `[]`.
- **career ↔ skills:** `getCareerPath` groups skills by importance and lists
  reachable branches; `getCareersForSkill` and `getSkillsForCareers` work;
  unknown career → `null`.
- **extensibility:** re-running the seed twice adds no duplicate rows.

`bun test` — 49/49 across phases 1–3.

## Manual checks

```bash
bun run db:migrate && bun test
bun dev   # http://localhost:3000
```

1. Sign up → onboarding → **step 2**: the branch dropdown is grouped —
   "Computer Science / IT" (15 options incl. AI, ML, Data Science,
   Cyber Security, Cloud Computing, IoT, Blockchain), "Electronics /
   Communication" (6), … through "Marine" and "Interdisciplinary / Other".
2. Pick **Electronics & Communication Engineering**, continue to **step 4**,
   choose "I have a few career options" → the career picker still offers the
   **full** list (Software, Data & AI, Hardware, Mechanical, Civil, …) — branch
   does not filter it.
3. `bun run db:studio` → `branch_career_paths` has ~1029 rows;
   `select count(*) from branch_career_paths bcp join engineering_branches b on
b.id = bcp.branch_id join careers c on c.id = bcp.career_id where c.slug =
'software-engineer'` → 72 (reachable from every branch).
4. `career_skill_requirements` → ~499 rows; every `skill_id` resolves in `skills`.
