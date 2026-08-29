/**
 * Small closed option sets for the Career Profile (Phase 6): preferred
 * industries, job types and work-mode. These stay as slug arrays / codes on the
 * `student_profiles` row — enumerable enough to filter on, not worth join
 * tables.
 *
 * Target ROLES are NOT here — they are the engineering + career taxonomy
 * (`careers` table, seeded from `taxonomy-catalog.ts`), which already covers
 * every branch, not just CSE.
 *
 * Open, not closed: add an entry here and the picker + validation pick it up —
 * no application-logic change.
 */

export type CatalogEntry = { slug: string; name: string };
export type Option = { value: string; label: string };

/** Industries an engineering graduate might target. Broad on purpose. */
export const INDUSTRIES: CatalogEntry[] = [
  { slug: "software-products", name: "Software Products / SaaS" },
  { slug: "it-services", name: "IT Services & Consulting" },
  { slug: "fintech", name: "Fintech & Banking" },
  { slug: "ecommerce", name: "E-commerce & Retail" },
  { slug: "healthtech", name: "Healthcare & HealthTech" },
  { slug: "edtech", name: "Education & EdTech" },
  { slug: "gaming", name: "Gaming & Interactive Media" },
  { slug: "semiconductors", name: "Semiconductors & VLSI" },
  { slug: "electronics-hardware", name: "Electronics & Hardware" },
  { slug: "telecom", name: "Telecom & Networking" },
  { slug: "automotive", name: "Automotive & Mobility" },
  { slug: "aerospace-defence", name: "Aerospace & Defence" },
  { slug: "robotics-automation", name: "Robotics & Industrial Automation" },
  { slug: "manufacturing", name: "Manufacturing & Industrial" },
  { slug: "energy-utilities", name: "Energy, Power & Utilities" },
  { slug: "oil-gas", name: "Oil, Gas & Petrochemicals" },
  { slug: "construction-infra", name: "Construction & Infrastructure" },
  { slug: "biotech-pharma", name: "Biotech & Pharmaceuticals" },
  { slug: "chemicals", name: "Chemicals & Process" },
  { slug: "consulting", name: "Management & Engineering Consulting" },
  { slug: "government-psu", name: "Government / PSU / Defence Labs" },
  { slug: "research-academia", name: "Research & Academia" },
  { slug: "agritech", name: "Agriculture & AgriTech" },
  { slug: "logistics", name: "Logistics & Supply Chain" },
  { slug: "other", name: "Other" },
];

/** Employment types a student would consider. */
export const JOB_TYPES: Option[] = [
  { value: "full_time", label: "Full-time" },
  { value: "internship", label: "Internship" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "freelance", label: "Freelance / Project work" },
  { value: "apprenticeship", label: "Apprenticeship / Trainee" },
];

/** Where the work happens. Stored as `student_profiles.work_mode`. */
export const WORK_MODES: Option[] = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
  { value: "flexible", label: "No strong preference" },
];

const INDUSTRY_SLUGS = new Set(INDUSTRIES.map((i) => i.slug));
const JOB_TYPE_VALUES = new Set(JOB_TYPES.map((j) => j.value));
const WORK_MODE_VALUES = new Set(WORK_MODES.map((w) => w.value));

export const isIndustrySlug = (v: string) => INDUSTRY_SLUGS.has(v);
export const isJobTypeValue = (v: string) => JOB_TYPE_VALUES.has(v);
export const isWorkMode = (v: string): v is "remote" | "hybrid" | "onsite" | "flexible" =>
  WORK_MODE_VALUES.has(v);

export const industryName = (slug: string) => INDUSTRIES.find((i) => i.slug === slug)?.name ?? null;
export const jobTypeLabel = (value: string) =>
  JOB_TYPES.find((j) => j.value === value)?.label ?? null;
export const workModeLabel = (value: string) =>
  WORK_MODES.find((w) => w.value === value)?.label ?? null;

/** Max number of free-text preferred locations we store. */
export const MAX_PREFERRED_LOCATIONS = 8;
