/**
 * Small closed option sets for the onboarding wizard (degree, current year,
 * experience level, career-goal status, country). These stay as string
 * enums / codes on the profile row — normalized enough to filter on, not worth
 * a join table.
 *
 * The engineering-branch and career lists live in the taxonomy
 * (`taxonomy-catalog.ts` → `engineering_*` / `careers` tables). This module
 * re-exports the flat {slug,name} views + slug guards the Phase 2 onboarding
 * code already depends on, so branch/career data has one source of truth.
 */

export type CatalogEntry = { slug: string; name: string };

export {
  BRANCH_OPTIONS as ENGINEERING_BRANCHES,
  CAREER_OPTIONS as CAREERS,
  isBranchSlug,
  isCareerSlug,
} from "./taxonomy-catalog";

export const DEGREES = [
  "B.Tech",
  "B.E.",
  "M.Tech",
  "M.E.",
  "Dual Degree (B.Tech + M.Tech)",
  "Diploma",
  "Other",
] as const;
export type Degree = (typeof DEGREES)[number];

export const CURRENT_YEARS = [
  { value: "first", label: "1st year" },
  { value: "second", label: "2nd year" },
  { value: "third", label: "3rd year" },
  { value: "fourth", label: "4th year" },
  { value: "fifth", label: "5th year" },
  { value: "graduated", label: "Graduated" },
] as const;
export type CurrentYear = (typeof CURRENT_YEARS)[number]["value"];

export const EXPERIENCE_LEVELS = [
  { value: "student", label: "Student — no professional experience yet" },
  { value: "internship", label: "Have done an internship" },
  { value: "junior", label: "0–1 years of experience" },
  { value: "mid", label: "1–3 years of experience" },
  { value: "senior", label: "3+ years of experience" },
] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number]["value"];

export const CAREER_GOAL_STATUSES = [
  { value: "known", label: "I know exactly what I want" },
  { value: "exploring", label: "I have a few career options" },
  { value: "unsure", label: "I am not sure yet" },
] as const;
export type CareerGoalStatus = (typeof CAREER_GOAL_STATUSES)[number]["value"];

/** Curated country list (ISO 3166-1 alpha-2). Stored on the profile as the code. */
export const COUNTRIES: CatalogEntry[] = [
  { slug: "IN", name: "India" },
  { slug: "US", name: "United States" },
  { slug: "GB", name: "United Kingdom" },
  { slug: "CA", name: "Canada" },
  { slug: "AU", name: "Australia" },
  { slug: "DE", name: "Germany" },
  { slug: "FR", name: "France" },
  { slug: "NL", name: "Netherlands" },
  { slug: "IE", name: "Ireland" },
  { slug: "SG", name: "Singapore" },
  { slug: "AE", name: "United Arab Emirates" },
  { slug: "SA", name: "Saudi Arabia" },
  { slug: "QA", name: "Qatar" },
  { slug: "JP", name: "Japan" },
  { slug: "KR", name: "South Korea" },
  { slug: "CN", name: "China" },
  { slug: "HK", name: "Hong Kong" },
  { slug: "MY", name: "Malaysia" },
  { slug: "ID", name: "Indonesia" },
  { slug: "PH", name: "Philippines" },
  { slug: "VN", name: "Vietnam" },
  { slug: "BD", name: "Bangladesh" },
  { slug: "PK", name: "Pakistan" },
  { slug: "LK", name: "Sri Lanka" },
  { slug: "NP", name: "Nepal" },
  { slug: "NZ", name: "New Zealand" },
  { slug: "ZA", name: "South Africa" },
  { slug: "NG", name: "Nigeria" },
  { slug: "EG", name: "Egypt" },
  { slug: "KE", name: "Kenya" },
  { slug: "BR", name: "Brazil" },
  { slug: "MX", name: "Mexico" },
  { slug: "AR", name: "Argentina" },
  { slug: "ES", name: "Spain" },
  { slug: "IT", name: "Italy" },
  { slug: "SE", name: "Sweden" },
  { slug: "CH", name: "Switzerland" },
  { slug: "PL", name: "Poland" },
  { slug: "PT", name: "Portugal" },
  { slug: "TR", name: "Turkey" },
  { slug: "IL", name: "Israel" },
  { slug: "OTHER", name: "Other" },
];

const COUNTRY_CODES = new Set(COUNTRIES.map((c) => c.slug));
export const isCountryCode = (v: string) => COUNTRY_CODES.has(v);

export const ONBOARDING_STEP_COUNT = 5;
