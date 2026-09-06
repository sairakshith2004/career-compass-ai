# Tutorials — YouTube courses from resume + job descriptions

The Tutorials feature turns the two signals WorkLens already has about a student
— their **resume** and the **job descriptions** they've analyzed — into a ranked
list of YouTube courses to watch, and drops "watch this" links onto the surfaces
where a skill gap is already visible.

## Why YouTube search links, not video IDs

Every tutorial link is a targeted YouTube **search URL**
(`https://www.youtube.com/results?search_query=React+full+course+for+beginners`),
never a hard-coded `watch?v=…`.

- A curated list of thousands of video IDs rots — channels delete uploads,
  playlists get reordered, "best course 2024" stops being current.
- A search query always resolves, always surfaces today's top-rated results, and
  covers **every** skill in `skills-catalog.ts` (all 160+, including the
  mechanical / civil / electrical / chemical / aerospace engineering skills)
  with zero per-skill data entry.
- `CURATED_QUERIES` in `tutorials-catalog.ts` pins channel-scoped phrases
  (`"… freeCodeCamp"`, `"… lecture series"`) for the ~40 skills where one
  well-known full course is clearly the right first stop.

## Levels

Each skill gets four links: **beginner** (full course), **intermediate**
(project-based), **advanced** (deep dive), **interview prep** (Q&A).

## Files

| File | Role |
| --- | --- |
| `src/lib/tutorials-catalog.ts` | Pure, client-safe. `tutorialsForSkill(slug)` → 4 `Tutorial`s; `tutorialSearchUrl(name, level)` → one URL; `youtubeSearchUrl(query)`. |
| `src/lib/tutorials.server.ts` | `getTutorialRecommendations(userId)` — the ranked buckets. Server-only, scoped to the verified user. |
| `src/lib/tutorials-fns.ts` | `getTutorials` (page loader) + `getSkillTutorials({ slug })` RPC wrappers. |
| `src/routes/app.tutorials.tsx` | `/app/tutorials` page. Gated on a parsed resume (`requireResume`). |

## Ranking (`getTutorialRecommendations`)

Three buckets, in priority order:

1. **`jobGaps`** — skills required by the user's `status = "analyzed"` jobs
   (`job_skills`) that they hold at **below intermediate** (or not at all).
   Ranked by how many analyzed jobs require the skill (`demandCount`) — the same
   "impact" idea the dashboard and roadmap use.
2. **`resumeSkills`** — skills the user lists from their **resume**
   (`user_skills.source` contains `"resume"`) at ≤ intermediate level or < 70
   confidence. Skills already in `jobGaps` are excluded so nothing shows twice.
3. **`targetRole`** — `career_skill_requirements` for the user's **primary**
   target career (`student_target_careers.is_primary`) that they don't hold at
   all. Ordered core → important → helpful.

All three are capped (24 / 18 / 12) and every entry carries the 4 tutorial links.

## Inline surfaces

| Surface | Wiring |
| --- | --- |
| **Skills page** (`app.skills.tsx`) | Each skill card renders `tutorialsForSkill(slug)` — 4 level links. Pure client import, no extra request. |
| **Job match breakdown** (`app.jobs.tsx`) | `SkillMatchDetail.tutorialUrl` (added in `match-engine.server.ts` `buildSkillDetails`) → a "Learn ↗" link next to every `partial` / `gap` skill. Beginner query when the student doesn't hold it, intermediate when they do. |
| **Roadmap** | `generateRoadmap` (Phase-2 `roadmap_items`) and `buildTemplateRoadmap` (career-journey `roadmap_tasks`) fill `resourceUrl` with a `tutorialSearchUrl` for the week's / task's skill. `app.roadmap.tsx` shows "Watch tutorials ↗". |

## No schema change

`roadmap_items.resource_url` and `roadmap_tasks.resource_url` already exist.
`SkillMatchDetail.tutorialUrl` is a runtime type, not a column. No migration.

## Tests

`tests/tutorials.test.ts` — every catalog skill yields 4 well-formed encoded
search URLs; unknown slug → `[]`; job gaps ranked by demand; resume-weak skills
surfaced; resume∩job-gap skills de-duped to the gap bucket.
