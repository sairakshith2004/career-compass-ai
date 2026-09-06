/**
 * Tutorial-video catalog. Pure, deterministic, client-safe — no DB, no AI, no
 * secrets. Imported by both the server recommendation service
 * (`tutorials.server.ts`) and the React routes directly.
 *
 * Every link is a YouTube **search** URL, not a hard-coded video id. Rationale:
 * a curated list of thousands of video ids rots — channels delete videos,
 * playlists get reordered, "best React course 2024" stops being the best one.
 * A targeted search query ("React full course for beginners") always resolves,
 * always surfaces current top results, and covers *every* skill in
 * `skills-catalog.ts` (all 160+ — software, data, cloud, and the mechanical /
 * civil / electrical / chemical / aerospace engineering skills too) without a
 * per-skill data entry.
 *
 * A small `CURATED_QUERIES` map pins channel-scoped queries for the handful of
 * skills where a specific well-known full course is clearly the right starting
 * point (freeCodeCamp, NPTEL, etc.). Everything else falls back to the level
 * templates below.
 */

import { SKILLS_CATALOG, type CatalogSkill } from "./skills-catalog";

export type TutorialLevel = "beginner" | "intermediate" | "advanced" | "interview";

export type Tutorial = {
  skillSlug: string;
  skillName: string;
  level: TutorialLevel;
  /** Human label for the card, e.g. "React — Full beginner course". */
  title: string;
  /** The search phrase sent to YouTube. */
  query: string;
  /** `https://www.youtube.com/results?search_query=…` — opens in a new tab. */
  url: string;
};

export const TUTORIAL_LEVELS: TutorialLevel[] = [
  "beginner",
  "intermediate",
  "advanced",
  "interview",
];

export const LEVEL_META: Record<TutorialLevel, { label: string; blurb: string }> = {
  beginner: { label: "Beginner", blurb: "Full course from zero" },
  intermediate: { label: "Intermediate", blurb: "Project-based, hands on" },
  advanced: { label: "Advanced", blurb: "Deep dives & internals" },
  interview: { label: "Interview prep", blurb: "Common questions & answers" },
};

/** Query template per level. `{name}` is the catalog skill's display name. */
const LEVEL_QUERY: Record<TutorialLevel, (name: string) => string> = {
  beginner: (name) => `${name} full course for beginners`,
  intermediate: (name) => `${name} intermediate tutorial project based`,
  advanced: (name) => `${name} advanced concepts deep dive`,
  interview: (name) => `${name} interview questions and answers`,
};

/**
 * Overrides for skills where a specific, stable full course from a known
 * channel is the obvious first stop. Only `beginner` / `intermediate` are worth
 * pinning — advanced and interview content churns too fast to name a channel.
 */
const CURATED_QUERIES: Record<string, Partial<Record<TutorialLevel, string>>> = {
  python: { beginner: "Python full course for beginners freeCodeCamp" },
  javascript: { beginner: "JavaScript full course freeCodeCamp" },
  typescript: { beginner: "TypeScript full course for beginners" },
  java: { beginner: "Java full course freeCodeCamp" },
  "c-plus-plus": { beginner: "C++ full course freeCodeCamp" },
  go: { beginner: "Go programming full course freeCodeCamp" },
  rust: { beginner: "Rust programming full course" },
  sql: { beginner: "SQL full course for beginners freeCodeCamp" },
  react: { beginner: "React full course freeCodeCamp" },
  nextjs: { beginner: "Next.js full course for beginners" },
  nodejs: { beginner: "Node.js full course freeCodeCamp" },
  "html-css": { beginner: "HTML and CSS full course for beginners" },
  tailwind: { beginner: "Tailwind CSS full course" },
  django: { beginner: "Django full course freeCodeCamp" },
  flask: { beginner: "Flask full course for beginners" },
  "spring-boot": { beginner: "Spring Boot full course" },
  docker: { beginner: "Docker full course for beginners" },
  kubernetes: { beginner: "Kubernetes full course for beginners" },
  aws: { beginner: "AWS full course for beginners" },
  git: { beginner: "Git and GitHub full course for beginners" },
  "machine-learning": { beginner: "Machine learning full course freeCodeCamp" },
  "deep-learning": { beginner: "Deep learning full course" },
  pytorch: { beginner: "PyTorch full course for beginners" },
  tensorflow: { beginner: "TensorFlow full course" },
  pandas: { beginner: "Pandas full course for beginners" },
  "data-structures": { beginner: "Data structures and algorithms full course" },
  algorithms: { beginner: "Algorithms full course" },
  "system-design": { beginner: "System design full course for beginners" },
  postgresql: { beginner: "PostgreSQL full course freeCodeCamp" },
  mongodb: { beginner: "MongoDB full course for beginners" },
  linux: { beginner: "Linux full course for beginners" },
  // Core engineering — university-style lectures travel better than "courses".
  matlab: { beginner: "MATLAB tutorial for beginners full course" },
  "finite-element-analysis": { beginner: "Finite element analysis lecture series" },
  thermodynamics: { beginner: "Thermodynamics full course lectures" },
  "fluid-mechanics": { beginner: "Fluid mechanics full course lectures" },
  autocad: { beginner: "AutoCAD full course for beginners" },
  solidworks: { beginner: "SolidWorks tutorial for beginners full course" },
  "control-systems": { beginner: "Control systems engineering full course" },
  vhdl: { beginner: "VHDL tutorial for beginners full course" },
  verilog: { beginner: "Verilog tutorial for beginners full course" },
};

const YT_SEARCH = "https://www.youtube.com/results?search_query=";

/** A YouTube search URL for an arbitrary phrase. */
export function youtubeSearchUrl(query: string): string {
  return YT_SEARCH + encodeURIComponent(query.trim());
}

const TITLE_SUFFIX: Record<TutorialLevel, string> = {
  beginner: "Full beginner course",
  intermediate: "Hands-on project tutorial",
  advanced: "Advanced deep dive",
  interview: "Interview questions",
};

function tutorialFor(skill: CatalogSkill, level: TutorialLevel): Tutorial {
  const query = CURATED_QUERIES[skill.slug]?.[level] ?? LEVEL_QUERY[level](skill.name);
  return {
    skillSlug: skill.slug,
    skillName: skill.name,
    level,
    title: `${skill.name} — ${TITLE_SUFFIX[level]}`,
    query,
    url: youtubeSearchUrl(query),
  };
}

const BY_SLUG = new Map<string, CatalogSkill>(SKILLS_CATALOG.map((s) => [s.slug, s]));

/**
 * All four tutorial levels for one catalog skill, or `[]` if the slug isn't in
 * the catalog. Order: beginner → intermediate → advanced → interview.
 */
export function tutorialsForSkill(slug: string): Tutorial[] {
  const skill = BY_SLUG.get(slug);
  if (!skill) return [];
  return TUTORIAL_LEVELS.map((level) => tutorialFor(skill, level));
}

/**
 * Direct search URL for a skill *name* at a given level, without a catalog
 * lookup — used by the roadmap builder, which already has the skill name and
 * just needs a "watch this" link to hang on a task.
 */
export function tutorialSearchUrl(skillName: string, level: TutorialLevel): string {
  return youtubeSearchUrl(LEVEL_QUERY[level](skillName));
}

/** Every tutorial for every catalog skill — used by tests and coverage checks. */
export function allTutorials(): Tutorial[] {
  return SKILLS_CATALOG.flatMap((s) => TUTORIAL_LEVELS.map((l) => tutorialFor(s, l)));
}
