/**
 * Fuzzy mapping from free-text names the AI extracts to WorkLens catalog
 * entries (skills, careers, engineering branches). Deterministic, no AI.
 */

import { SKILLS_CATALOG } from "./skills-catalog";
import { CAREER_PATHS, ENGINEERING_BRANCHES } from "./taxonomy-catalog";

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9+#. ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// --- skills --------------------------------------------------------------

const SKILL_BY_KEY = new Map<string, string>();
for (const s of SKILLS_CATALOG) {
  SKILL_BY_KEY.set(norm(s.name), s.slug);
  SKILL_BY_KEY.set(norm(s.slug), s.slug);
  for (const a of s.aliases ?? []) SKILL_BY_KEY.set(norm(a), s.slug);
}

/** Best-effort catalog skill slug for a free-text skill name, or null. */
export function matchSkillSlug(name: string): string | null {
  const key = norm(name);
  if (!key) return null;
  const exact = SKILL_BY_KEY.get(key);
  if (exact) return exact;
  // Contained-phrase match ("react.js" → "react", "amazon web services (aws)" → "aws").
  for (const [k, slug] of SKILL_BY_KEY) {
    if (k.length >= 3 && (key.includes(k) || k.includes(key))) return slug;
  }
  return null;
}

// --- careers -----------------------------------------------------------

const CAREER_BY_KEY = new Map<string, string>();
for (const c of CAREER_PATHS) {
  CAREER_BY_KEY.set(norm(c.title), c.slug);
  CAREER_BY_KEY.set(norm(c.slug.replace(/-/g, " ")), c.slug);
}
// A few common phrasings the AI uses that don't string-match a title.
const CAREER_ALIASES: Record<string, string> = {
  "embedded engineer": "embedded-engineer",
  "vlsi engineer": "vlsi-engineer",
  "software developer": "software-engineer",
  sde: "software-engineer",
  "backend engineer": "backend-developer",
  "frontend engineer": "frontend-developer",
  "full stack engineer": "fullstack-developer",
  "full-stack engineer": "fullstack-developer",
  "ml engineer": "ml-engineer",
  "ai ml engineer": "ml-engineer",
  "data engineer": "data-engineer",
  "cybersecurity engineer": "security-engineer",
  "cloud devops engineer": "devops-engineer",
  "devops engineer": "devops-engineer",
  "electronics engineer": "electronics-engineer",
};
for (const [k, v] of Object.entries(CAREER_ALIASES)) CAREER_BY_KEY.set(norm(k), v);

export function matchCareerSlug(title: string): string | null {
  const key = norm(title);
  if (!key) return null;
  const exact = CAREER_BY_KEY.get(key);
  if (exact) return exact;
  for (const [k, slug] of CAREER_BY_KEY) {
    if (k.length >= 5 && (key.includes(k) || k.includes(key))) return slug;
  }
  return null;
}

// --- engineering branch ------------------------------------------------

const BRANCH_BY_KEY = new Map<string, string>();
for (const b of ENGINEERING_BRANCHES) {
  BRANCH_BY_KEY.set(norm(b.name), b.slug);
  BRANCH_BY_KEY.set(norm(b.slug.replace(/-/g, " ")), b.slug);
  for (const a of b.aliases ?? []) BRANCH_BY_KEY.set(norm(a), b.slug);
}
const BRANCH_KEYWORDS: [RegExp, string][] = [
  [/electronics.*communication|\bece\b|electronics and comm/, "electronics-communication"],
  [/electronics.*telecomm|\bextc\b/, "electronics-telecommunication"],
  [/\bvlsi\b/, "vlsi-design"],
  [/embedded system/, "embedded-systems"],
  [/electrical.*electronics|\beee\b/, "electrical-electronics"],
  [/\belectrical\b/, "electrical"],
  [/computer science|\bcse\b|\bcs\b/, "computer-science"],
  [/information technology|\bit\b/, "information-technology"],
  [/information science|\bise\b/, "information-science"],
  [/artificial intelligence.*data science|ai.*data science|\baids\b/, "ai-data-science"],
  [/artificial intelligence|\bai\b/, "artificial-intelligence"],
  [/machine learning/, "machine-learning"],
  [/data science/, "data-science"],
  [/cyber ?security|information security/, "cybersecurity"],
  [/mechanical.*automation/, "mechanical-automation"],
  [/\bmechanical\b|\bmech\b/, "mechanical"],
  [/mechatronic/, "mechatronics"],
  [/civil/, "civil"],
  [/chemical/, "chemical"],
  [/aerospace|aeronautical/, "aerospace"],
  [/automobile|automotive/, "automobile"],
  [/instrumentation/, "instrumentation"],
  [/biomedical/, "biomedical"],
  [/biotechnolog/, "biotechnology"],
  [/production|industrial/, "production-engineering"],
  [/metallurg/, "metallurgical-engineering"],
];

/** Map a free-text branch description to a catalog branch slug, or null. */
export function matchBranchSlug(text: string): string | null {
  const key = norm(text);
  if (!key) return null;
  const exact = BRANCH_BY_KEY.get(key);
  if (exact) return exact;
  for (const [re, slug] of BRANCH_KEYWORDS) if (re.test(key)) return slug;
  for (const [k, slug] of BRANCH_BY_KEY) {
    if (k.length >= 6 && key.includes(k)) return slug;
  }
  return null;
}
