# Job Description Analysis & Resume ↔ Job Matching (Phase 7)

## What it does

A member pastes a job description on `/app/jobs`. WorkLens:

1. **Extracts structured requirements** with Claude — `src/lib/jd-intelligence.server.ts`.
   Skills are categorised (`programming_language`, `framework`, `database`, `cloud`,
   `devops`, `tool`, …) and each is tagged `mandatory | preferred | optional`.
   Also pulled: title, company, seniority, employment type, location/remote,
   education & experience requirements, responsibilities, soft skills,
   certifications, domain knowledge, a one-line summary. **The AI only
   classifies — it never produces a score.**
2. **Computes a transparent, versioned match** — `src/lib/match-engine.server.ts`.
   Six numbers, all 0–100:

   | Dimension | How it's computed |
   |---|---|
   | `skillsScore` | % of **mandatory** skills the member has (falls back to preferred, then 100 if none listed) |
   | `toolsScore` | same, restricted to `cloud`/`devops`/`database`/`tool` categories |
   | `experienceScore` | member's experience level (resume analysis → declared profile) vs. JD seniority |
   | `educationScore` | has a degree / JD lists no education requirement / neither |
   | `keywordsScore` | coverage of **every** catalogued skill mentioned anywhere in the JD |
   | `overallScore` | `0.35·skills + 0.15·tools + 0.20·experience + 0.10·education + 0.20·keywords` |

   The weights and every formula are frozen under `SCORING_VERSION`
   (currently `2026-09-02.1`), stored on `jobs.scoring_version`, so any past
   result can be traced to the exact logic that produced it. Bump the constant
   whenever the maths changes.
3. **Persists** — `src/lib/job-analysis.server.ts`:
   - `jobs` row: the structured data (`jobs.structured_data` JSON) + the six scores + `scoring_version`
   - `job_skills`: each JD skill resolved to a catalog slug via `matchSkillSlug`
     (so "Node.js" → `nodejs`, the same mapping the match engine uses)
   - `job_matches`: `matchScore`, `matchingSkills[]`, `missingSkills[]`
   - `ai_runs`: an audit row (`kind: "jd_analysis"`, model, tokens, duration, ok/failed)
   - `activity_events`: a `job_analyzed` entry

## No API key? Keyword fallback

If `ANTHROPIC_API_KEY` is unset (or not an `sk-ant-` key), or the provider call
fails, `analyzeAndPersistJob` falls back to `extractSkillSlugs` keyword scanning.
The member still gets a job row, a `job_matches` row and a `matchScore`
(`matched resume skills / required skills`). `scoring_version` is prefixed
`keyword.` so the two paths are never confused. A failed AI call is still
written to `ai_runs` as `status: "failed"` before the fallback runs — the
member's pasted text is never lost.

## The detail view

`getJobMatchView(userId, jobId)` (RPC: `getJobMatchDetails`) returns the stored
dimension scores **plus a freshly re-derived per-skill list** — `match` /
`partial` / `gap`, with the member's current level for each. "Partial" means the
member has the skill but only from weak resume/AI-inferred evidence (low
confidence, unverified). Because the list is recomputed every call, improving a
skill (e.g. passing an assessment) flips its row here immediately — no
re-analysis needed.

## Ownership

Every read and write is scoped to the authenticated user. `jobs.userId` is
checked in the query for the detail view; a job belonging to another member
returns `null`. Covered by `tests/job-match.test.ts` (IDOR case).

## Files

| File | Role |
|---|---|
| `src/lib/jd-intelligence.server.ts` | Claude structured extraction, Zod double-validation, typed `JDParseError`, DI `parse` hook |
| `src/lib/match-engine.server.ts` | `SCORING_VERSION`, `computeMatch`, `computeSkillMatchDetails`, `loadStudentMatchContext` |
| `src/lib/job-analysis.server.ts` | `analyzeAndPersistJob`, `getJobMatchView` — persistence + fallback + audit |
| `src/lib/server-fns.ts` | thin RPC wrappers `analyzeJob` / `getJobMatchDetails` |
| `src/routes/app.jobs.tsx` | paste form + analyzed-job list + match breakdown panel |

## Tests

- `tests/jd-intelligence.test.ts` — extraction, schema re-check, refusal/malformed/timeout mapping, prompt-injection posture, `isAIConfigured`
- `tests/match-engine.test.ts` — every dimension formula, the weighted blend, catalog slug resolution, sort order
- `tests/job-match.test.ts` — full persistence (job / job_skills / job_matches / ai_runs / activity), failed-run audit + fallback, live re-derivation, IDOR
