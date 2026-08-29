# WorkLens — AI Career & Skill Intelligence

**Understand your skills. Build your career with evidence.**

WorkLens is a full-stack web app that turns a student's résumé, declared profile
and target job into a single, honest picture of where they stand — and what to do
next. Instead of trusting a skills list, it measures what the résumé actually
*demonstrates*, compares that against what a real role requires, and keeps the
whole picture in a database so it survives reloads and grows over time.

Built for engineering students across **every branch** — not just CSE.

---

## What it does

| Area | What happens |
| --- | --- |
| **Accounts** | Email/password (Argon2id) or Google / GitHub / LinkedIn sign-in. Session cookies, CSRF protection, login rate-limiting, account-status gating. |
| **Student profile** | A resumable onboarding wizard captures branch, specialization, degree, college, year & semester, graduation year, experience level, career interests, target roles and free-text goals. Every field is optional except the career-direction step. Progress is stored server-side, so it resumes across devices. |
| **Engineering & career taxonomy** | ~20 categories, 60+ branches (with aliases), 60+ career roles, and a many-to-many map of *which careers are reachable from which branch* + *which skills each career needs, at what level*. Reference data, seeded from one source file. |
| **Résumé intelligence** | Upload a PDF/DOCX → validate + malware-scan → store privately → extract text → send to Claude for a **structured** analysis → validate the AI output against a schema → persist. Detects engineering branch (with evidence + an uncertainty flag), skills grouped into 12 families with per-skill evidence strength, projects, experience, education, certifications, job-readiness, and recommended roles. Each new upload is a **new version** — old analyses are kept. |
| **Declared vs detected** | The résumé analysis is *never* written onto the declared profile. Disagreements (e.g. "you declared Mechanical, your résumé reads ECE") are surfaced as a review panel that changes nothing. |
| **Career profile & target job** | Pick target roles from any branch, mark one **primary**, set preferred industries / job types / work mode / locations. Produces a clean, self-contained input set (`getPhase7Inputs`) for the skill-gap engine: the primary role, its skill requirements, and your current skills. |
| **Skills / Roadmap / Assessments / Jobs / Projects / Applications** | Additional app sections that consume the data above (skill gap engine, a deterministic learning roadmap, an assessment catalog, job-description analysis, project recommendations). |

The product loop: **Analyze → Measure → Choose a target → Learn → Build → Verify → Re-measure.**

---

## How it works

### One process, no separate API server

WorkLens is a **[TanStack Start](https://tanstack.com/start)** app. There is no
Express server and no REST layer — the browser calls typed **server functions**
(`createServerFn`) directly, and TanStack Start runs them on the server:

```
Browser (React 19)
   │  typed RPC call  (createServerFn — not fetch/REST)
   ▼
*-fns.ts        thin RPC wrapper: requireUser() → delegate
   ▼
*.server.ts     all business logic; takes an explicit userId; never imported by client code
   ▼
Drizzle ORM  →  libSQL / SQLite   (dev: local dev.db file · prod: Turso)
```

Three rules keep this honest:

1. **The database is the source of truth.** The frontend is presentation only —
   it never "remembers" state that matters. "Resume where you left off",
   profile completeness, résumé status, skill gaps: all recomputed from rows.
2. **Every user-owned record is scoped to the authenticated user on the
   server.** A `*.server.ts` function takes a `userId` from the verified session;
   no function accepts a user / profile / résumé id from the client for
   authorization. Route guards are treated as UX only.
3. **AI output is validated before it touches the DB.** The model is asked for
   structured output constrained to a Zod schema, then the parsed result is run
   through Zod *again*. Arbitrary model text can never reach a table.

### The résumé pipeline in detail

```
Upload (PDF/DOCX)
  → validate: size, extension, real file signature, malware heuristics (+ optional external AV)
  → store: uploads/resumes/<userId>/<uuid>.<ext>  — not under public/, path-traversal guarded
  → extract text: pdf-parse (PDF) / mammoth (DOCX); image-only PDFs are detected, not faked
  → analyze: server-side Claude call, structured output (Zod schema)
  → re-validate the AI JSON with Zod
  → persist: resume_analyses (queryable columns + a validated JSON payload),
             resume_skills (with evidence), resume_career_signals, career_recommendations, ai_runs
  → feed matched skills into user_skills as source="resume" (never marked "verified")
```

Status is a small state machine (`uploaded → processing → analyzing → complete | failed`);
a failed analysis keeps the résumé and offers a retry; a concurrent double-retry
is blocked by a conditional update. Every lifecycle step logs **safe metadata
only** (never résumé text or secrets).

---

## Tech stack — the tools & software

### Language & runtime

| Tool | Version | Why |
| --- | --- | --- |
| **TypeScript** | 5.8, `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` | end-to-end type safety, client ↔ server ↔ DB |
| **Bun** | 1.4 | package manager, script runner **and** test runner — one tool, fast |
| **Node** | 24 (compatible) | Bun is primary; the build output runs on standard Node/serverless |

### Frontend

| Tool | Purpose |
| --- | --- |
| **React 19** | UI |
| **[TanStack Router](https://tanstack.com/router)** | file-based routing (`src/routes/*`), typed search params, route loaders |
| **[TanStack Start](https://tanstack.com/start)** | SSR + the `createServerFn` RPC boundary |
| **[TanStack Query](https://tanstack.com/query)** | client-side mutation/query state |
| **[Vite 8](https://vite.dev)** | dev server + bundler |
| **[Tailwind CSS v4](https://tailwindcss.com)** | styling (via `@tailwindcss/vite`) |
| **shadcn/ui + Radix UI** | accessible component primitives (`src/components/ui/*`) |
| **lucide-react** / **sonner** / **cmdk** / **recharts** | icons / toasts / command menu / charts |
| **react-hook-form** + **Zod** resolver | forms + validation |

### Backend & data

| Tool | Purpose |
| --- | --- |
| **[Drizzle ORM](https://orm.drizzle.team)** | schema-as-TypeScript, type-safe queries |
| **drizzle-kit** | generates & applies SQL migrations (`drizzle/*.sql`) |
| **[libSQL](https://github.com/tursodatabase/libsql)** (`@libsql/client`) | SQLite-compatible driver. Dev = a local `dev.db` file in WAL mode (zero setup); prod = [Turso](https://turso.tech) over the same driver, no code change |
| **[better-auth](https://better-auth.com)** | sessions, OAuth (Google/GitHub/LinkedIn), CSRF, rate limiting |
| **hash-wasm** | Argon2id password hashing (pure WASM — runs on any runtime, no native addon) |
| **Nitro** | builds a portable server; auto-targets Vercel Functions |
| **[Zod](https://zod.dev)** | every server-function input + every AI output is Zod-validated |

### AI

| Tool | Purpose |
| --- | --- |
| **[Anthropic Claude](https://docs.anthropic.com)** (`@anthropic-ai/sdk`) | résumé analysis. Default model `claude-opus-5` (override with `RESUME_AI_MODEL`) |
| **`messages.parse` + `zodOutputFormat`** | structured output constrained to a schema |
| **pdf-parse** / **mammoth** | server-side PDF / DOCX text extraction |

The Anthropic key is read from `process.env` on the server only — it is never
sent to the browser, never logged, and never stored (only `model` /
`promptVersion` / token counts are persisted, for auditing).

### Tooling

ESLint 9 + `typescript-eslint` + `eslint-plugin-prettier` · Prettier ·
`bun test` (the pipeline runs `tsc --noEmit`, `eslint`, `bun test`, `vite build`
after every phase).

### Deliberately **not** used

No separate Node/Express service, no Python/FastAPI service, no Postgres, no
Redis, no vector DB, no Docker — none are needed yet, and each would be a real
operational cost. The architecture leaves room for them (e.g. an async résumé
worker) without a rewrite.

---

## How it was built — phased & incremental

Development runs in numbered phases. Each phase is a self-contained spec that
ends by running **typecheck → lint → tests → build**, then a commit. Nothing
moves forward on a broken phase, and existing functionality is never rebuilt —
each phase inspects what's there and extends it.

| Phase | What landed |
| --- | --- |
| **1 — Auth & security foundation** | email/password + OAuth, session gating, rate limiting, secure headers / CSP / HSTS in production |
| **2 — Student profile** | onboarding wizard, `student_profiles`, career-interest areas, profile-completion score, one-shot update API |
| **3 — Engineering & career taxonomy** | `engineering_categories` / `engineering_branches` / `careers` / `branch_career_paths` / `career_skill_requirements`, all seeded from `taxonomy-catalog.ts` |
| **4/5 — Résumé intelligence** | upload → validate/scan → extract → **structured Claude analysis** → persist; evidence-based skills; declared-vs-detected discrepancies; **résumé versioning** (history preserved) |
| **6 — Career profile & target job** | preferred industries / job types / work mode / locations; **primary target role**; `getPhase7Inputs` — the clean hand-off to the skill-gap engine |
| **(next)** | skill-gap engine + adaptive roadmap wired to the primary target role |

`docs/` holds a one-file write-up per area
(`authentication.md`, `student-profile.md`, `taxonomy.md`,
`resume-intelligence.md`, `career-journey.md`, `career-profile.md`).

---

## Project structure

```
src/
├── routes/                 file-based routes (TanStack Router)
│   ├── __root.tsx          root layout + error boundary
│   ├── index.tsx           landing page
│   ├── login/signup/…      auth pages
│   ├── app.tsx             /app shell (auth gate, sidebar)
│   └── app.*.tsx           dashboard, onboarding, career, resume, skills,
│                           roadmap, jobs, assessments, projects, applications, settings
│
├── lib/
│   ├── *-fns.ts            RPC wrappers — requireUser() → delegate
│   ├── *.server.ts         business logic — explicit userId, DB access, never client-imported
│   ├── *-catalog.ts        reference data (skills, taxonomy, industries, degrees, …)
│   ├── auth.ts / session.server.ts   better-auth config + "who is the caller"
│   └── db/
│       ├── schema.ts           app tables
│       ├── career-schema.ts    career-journey tables (goals, roadmaps, gaps, activity)
│       ├── auth-schema.ts      better-auth tables
│       ├── client.ts           the libSQL/Drizzle client
│       └── seed.ts             idempotent, lazy catalog seeding
│
├── components/
│   ├── ui/                 shadcn/ui primitives
│   └── worklens/           app-specific components (AppShell, Panel, nav-items)
│
drizzle/                    generated SQL migrations + snapshots
docs/                       per-feature design write-ups
tests/                      bun test suites (auth, profile, taxonomy, resume, career, …)
```

---

## Running it locally

You need **[Bun](https://bun.sh)** (`curl -fsSL https://bun.sh/install | bash`).

```sh
git clone <this-repo-url>
cd career-compass-ai
bun install
cp .env.example .env       # optional — the app runs with none of it set
bun run db:migrate         # creates dev.db with every table
bun run dev                # http://localhost:3000
```

With an empty `.env`: sign-up/login with email+password works, the whole app
works, OAuth buttons show as "not configured", and résumé **upload + text
extraction** work — only the AI **analysis** step reports "not available" until
you add `ANTHROPIC_API_KEY=sk-ant-…`.

### Scripts

```sh
bun run dev          # dev server
bun run build        # production build (Nitro output)
bun run preview      # serve the production build locally
bun test             # run the full test suite
bun run lint         # eslint
bun run format       # prettier --write
bun run db:generate  # generate a migration from schema changes
bun run db:migrate   # apply pending migrations
bun run db:studio    # browse the DB in Drizzle Studio
```

### Environment variables

All optional for local dev; see `.env.example` for where to get each one.

| Var | For |
| --- | --- |
| `DATABASE_URL` / `DATABASE_AUTH_TOKEN` | production DB (Turso). Local dev uses `dev.db`. |
| `BETTER_AUTH_SECRET` | signs session cookies & reset tokens. **Required in production.** |
| `BETTER_AUTH_URL` | public origin (cookie domain + CSRF allowed-origin) |
| `ANTHROPIC_API_KEY` | résumé AI analysis (`RESUME_AI_MODEL`, `RESUME_AI_TIMEOUT_MS`, `RESUME_MAX_BYTES`, `RESUME_UPLOAD_DIR`, `RESUME_MALWARE_SCAN_CMD` are optional overrides) |
| `GOOGLE_/GITHUB_/LINKEDIN_CLIENT_ID` + `_SECRET` | each OAuth provider (a provider only appears once its keys are set) |

---

## Security

- **Passwords** — Argon2id (OWASP baseline: 19 MiB / t=2 / p=1), PHC-string hashes.
- **Sessions** — HttpOnly cookies; suspended/deleted accounts are treated as
  signed-out even with a valid cookie; login is rate-limited.
- **Production hardening** — `Secure` cookies, HSTS, a strict Content-Security-Policy.
- **Uploads** — size + extension + **real file-signature** check (a PDF renamed
  `.docx` is rejected), macro/embedded-executable/auto-run heuristics, an
  optional external AV hook, sanitized display names, server-generated storage
  keys, path-traversal guards. Résumé files are **never** served from a public route.
- **Authorization** — enforced in `*.server.ts` on an explicit session `userId`;
  cross-user access is covered by tests in every domain.
- **AI** — key server-side only; résumé text is passed to the model as delimited
  *untrusted data* with an anti-injection system prompt; output is schema-validated twice.

---

## Testing

`bun test` runs the full suite against a throwaway database that every migration
is applied to from scratch — so a green run also proves the migration chain.
Coverage spans auth & rate-limiting, onboarding & profile, taxonomy, the résumé
pipeline (validation, extraction, AI success/failure/retry, versioning,
ownership, prompt-injection posture), and the career profile (CRUD, the
single-primary invariant, invalid input, per-user isolation, the Phase-7 input
shape).

---

## Deployment

Builds to a portable server via the **Nitro** Vite plugin and deploys to
**[Vercel](https://vercel.com)** with zero extra config — push to the connected
branch, or `vercel deploy`. Set the `.env.example` variables in the project
settings, point `DATABASE_URL` / `DATABASE_AUTH_TOKEN` at a hosted **Turso**
database (a local file won't survive serverless), and register each OAuth app's
redirect URL at the production domain (`https://<domain>/api/auth/callback/<provider>`).
