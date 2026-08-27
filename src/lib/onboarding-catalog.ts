/**
 * Static reference data for the student onboarding flow.
 *
 * `ENGINEERING_BRANCHES` and `CAREERS` seed the `engineering_branches` /
 * `careers` tables (see db/seed.ts) — they're normalized into their own tables
 * because a student profile references them by id and we'll want to query
 * "students by branch" / "students targeting career X" later.
 *
 * The small closed sets (degree, current year, experience, goal status,
 * country) stay as string enums / codes on the profile row — normalized enough
 * to filter on, not worth a join table.
 *
 * IMPORTANT: branch and career are independent. The career picker shows every
 * career regardless of branch — an ECE student can target Software or AI/ML, a
 * Mechanical student can target Data. Nothing here maps one to the other.
 */

export type CatalogEntry = { slug: string; name: string };
export type CareerEntry = CatalogEntry & { category: string };

export const ENGINEERING_BRANCHES: CatalogEntry[] = [
  { slug: "cse", name: "Computer Science & Engineering" },
  { slug: "it", name: "Information Technology" },
  { slug: "ece", name: "Electronics & Communication Engineering" },
  { slug: "eee", name: "Electrical & Electronics Engineering" },
  { slug: "eu", name: "Electrical Engineering" },
  { slug: "mech", name: "Mechanical Engineering" },
  { slug: "civil", name: "Civil Engineering" },
  { slug: "chem", name: "Chemical Engineering" },
  { slug: "aero", name: "Aerospace / Aeronautical Engineering" },
  { slug: "biotech", name: "Biotechnology Engineering" },
  { slug: "biomed", name: "Biomedical Engineering" },
  { slug: "meta", name: "Metallurgical & Materials Engineering" },
  { slug: "prod", name: "Industrial / Production Engineering" },
  { slug: "ei", name: "Electronics & Instrumentation Engineering" },
  { slug: "mechatronics", name: "Mechatronics Engineering" },
  { slug: "auto", name: "Automobile Engineering" },
  { slug: "mining", name: "Mining Engineering" },
  { slug: "marine", name: "Marine Engineering" },
  { slug: "agri", name: "Agricultural Engineering" },
  { slug: "petro", name: "Petroleum Engineering" },
  { slug: "other", name: "Other" },
];

export const CAREERS: CareerEntry[] = [
  // Software
  { slug: "backend-developer", name: "Backend Developer", category: "Software" },
  { slug: "frontend-developer", name: "Frontend Developer", category: "Software" },
  { slug: "fullstack-developer", name: "Full-Stack Developer", category: "Software" },
  { slug: "mobile-developer", name: "Mobile App Developer", category: "Software" },
  { slug: "devops-engineer", name: "DevOps Engineer", category: "Software" },
  { slug: "sre", name: "Site Reliability Engineer", category: "Software" },
  { slug: "cloud-engineer", name: "Cloud Engineer", category: "Software" },
  { slug: "security-engineer", name: "Security Engineer", category: "Software" },
  { slug: "qa-engineer", name: "QA / Test Automation Engineer", category: "Software" },
  { slug: "game-developer", name: "Game Developer", category: "Software" },

  // Data & AI
  { slug: "data-scientist", name: "Data Scientist", category: "Data & AI" },
  { slug: "data-analyst", name: "Data Analyst", category: "Data & AI" },
  { slug: "data-engineer", name: "Data Engineer", category: "Data & AI" },
  { slug: "ml-engineer", name: "Machine Learning Engineer", category: "Data & AI" },
  { slug: "ai-researcher", name: "AI Researcher", category: "Data & AI" },
  { slug: "mlops-engineer", name: "MLOps Engineer", category: "Data & AI" },

  // Hardware & Electronics
  {
    slug: "embedded-engineer",
    name: "Embedded Systems Engineer",
    category: "Hardware & Electronics",
  },
  { slug: "vlsi-engineer", name: "VLSI Design Engineer", category: "Hardware & Electronics" },
  { slug: "fpga-engineer", name: "FPGA Engineer", category: "Hardware & Electronics" },
  {
    slug: "hardware-design-engineer",
    name: "Hardware Design Engineer",
    category: "Hardware & Electronics",
  },
  { slug: "pcb-design-engineer", name: "PCB Design Engineer", category: "Hardware & Electronics" },
  { slug: "rf-engineer", name: "RF Engineer", category: "Hardware & Electronics" },
  {
    slug: "semiconductor-process-engineer",
    name: "Semiconductor Process Engineer",
    category: "Hardware & Electronics",
  },

  // Mechanical & Manufacturing
  {
    slug: "mechanical-design-engineer",
    name: "Mechanical Design Engineer",
    category: "Mechanical & Manufacturing",
  },
  {
    slug: "automotive-engineer",
    name: "Automotive Engineer",
    category: "Mechanical & Manufacturing",
  },
  {
    slug: "manufacturing-engineer",
    name: "Manufacturing Engineer",
    category: "Mechanical & Manufacturing",
  },
  { slug: "robotics-engineer", name: "Robotics Engineer", category: "Mechanical & Manufacturing" },
  {
    slug: "product-design-engineer",
    name: "Product Design Engineer",
    category: "Mechanical & Manufacturing",
  },
  { slug: "quality-engineer", name: "Quality Engineer", category: "Mechanical & Manufacturing" },
  { slug: "hvac-engineer", name: "HVAC Engineer", category: "Mechanical & Manufacturing" },

  // Civil & Infrastructure
  { slug: "structural-engineer", name: "Structural Engineer", category: "Civil & Infrastructure" },
  {
    slug: "construction-manager",
    name: "Construction Manager",
    category: "Civil & Infrastructure",
  },
  {
    slug: "transportation-engineer",
    name: "Transportation Engineer",
    category: "Civil & Infrastructure",
  },
  {
    slug: "geotechnical-engineer",
    name: "Geotechnical Engineer",
    category: "Civil & Infrastructure",
  },
  {
    slug: "environmental-engineer",
    name: "Environmental Engineer",
    category: "Civil & Infrastructure",
  },

  // Core & Cross-disciplinary
  {
    slug: "chemical-process-engineer",
    name: "Chemical Process Engineer",
    category: "Core & Cross-disciplinary",
  },
  { slug: "aerospace-engineer", name: "Aerospace Engineer", category: "Core & Cross-disciplinary" },
  { slug: "systems-engineer", name: "Systems Engineer", category: "Core & Cross-disciplinary" },
  { slug: "research-scientist", name: "Research Scientist", category: "Core & Cross-disciplinary" },
  {
    slug: "technical-product-manager",
    name: "Technical Product Manager",
    category: "Core & Cross-disciplinary",
  },
  {
    slug: "engineering-consultant",
    name: "Engineering Consultant",
    category: "Core & Cross-disciplinary",
  },
];

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

const BRANCH_SLUGS = new Set(ENGINEERING_BRANCHES.map((b) => b.slug));
const CAREER_SLUGS = new Set(CAREERS.map((c) => c.slug));
const COUNTRY_CODES = new Set(COUNTRIES.map((c) => c.slug));

export const isBranchSlug = (v: string) => BRANCH_SLUGS.has(v);
export const isCareerSlug = (v: string) => CAREER_SLUGS.has(v);
export const isCountryCode = (v: string) => COUNTRY_CODES.has(v);

export const ONBOARDING_STEP_COUNT = 5;
