/**
 * WorkLens engineering + career taxonomy — the single maintainable source of
 * truth. Nothing in here is hard-coded into a React component: the data seeds
 * the `engineering_categories` / `engineering_branches` / `careers` /
 * `branch_career_paths` / `career_skill_requirements` tables (see db/seed.ts),
 * and every screen and service reads it back from there.
 *
 * Design goals:
 *  - **Open, not closed.** Add a category, branch, career or skill link by
 *    editing this file — no application logic changes. `ensure*Seeded` is
 *    additive (`onConflictDoNothing`), so new rows appear on next boot.
 *  - **Branch ≠ career.** Career paths are defined independently of branches;
 *    `branches` on each career expresses *accessibility*, and the same career
 *    is reachable from many branches (e.g. "Software Engineer" from ECE,
 *    Mechanical and CSE alike).
 *  - **Skill slugs** reference `skills-catalog.ts`.
 */

import { SKILLS_CATALOG } from "./skills-catalog";

// --- types -----------------------------------------------------------------

export type EngineeringCategory = {
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
};

export type EngineeringBranch = {
  slug: string;
  name: string;
  /** FK → EngineeringCategory.slug */
  categorySlug: string;
  aliases?: string[];
  description?: string;
};

/** How relevant a career is as an *exit path* from a given branch. */
export type CareerRelevance = "primary" | "common" | "possible";

/** How central a skill is to a career. */
export type SkillImportance = "core" | "important" | "helpful";

export type CareerPathDef = {
  slug: string;
  title: string;
  /** Display grouping in pickers (not a DB relationship). */
  group: string;
  description: string;
  /**
   * Branches this career is reachable from, by relevance. A branch may appear
   * in exactly one bucket. Branches not listed here are linked at
   * `universalRelevance` if that is set, otherwise not linked at all.
   */
  branches?: Partial<Record<CareerRelevance, string[]>>;
  /**
   * Set for genuinely branch-agnostic careers (e.g. Software Engineer): every
   * branch not explicitly listed in `branches` gets a link at this relevance.
   */
  universalRelevance?: CareerRelevance;
  /** Skill requirements by importance. Slugs must exist in skills-catalog.ts. */
  skills: Partial<Record<SkillImportance, string[]>>;
};

// --- engineering categories ------------------------------------------------

export const ENGINEERING_CATEGORIES: EngineeringCategory[] = [
  {
    slug: "computer-science-it",
    name: "Computer Science / IT",
    description: "Software, computing, data and information systems.",
    sortOrder: 1,
  },
  {
    slug: "electronics-communication",
    name: "Electronics / Communication",
    description: "Electronic systems, communication and signal processing.",
    sortOrder: 2,
  },
  {
    slug: "electrical",
    name: "Electrical",
    description: "Power systems, machines, drives and control.",
    sortOrder: 3,
  },
  {
    slug: "mechanical",
    name: "Mechanical",
    description: "Design, thermal, manufacturing and mechanical systems.",
    sortOrder: 4,
  },
  {
    slug: "civil",
    name: "Civil",
    description: "Structures, construction, transportation and water.",
    sortOrder: 5,
  },
  {
    slug: "chemical",
    name: "Chemical",
    description: "Process, reaction, separation and plant engineering.",
    sortOrder: 6,
  },
  {
    slug: "biotechnology",
    name: "Biotechnology",
    description: "Bioprocess, molecular and computational biology.",
    sortOrder: 7,
  },
  {
    slug: "aerospace",
    name: "Aerospace",
    description: "Aircraft, spacecraft, propulsion and avionics.",
    sortOrder: 8,
  },
  {
    slug: "automobile",
    name: "Automobile",
    description: "Vehicle systems, powertrain and mobility.",
    sortOrder: 9,
  },
  {
    slug: "mechatronics",
    name: "Mechatronics",
    description: "Integrated mechanical, electronic and control systems.",
    sortOrder: 10,
  },
  {
    slug: "instrumentation",
    name: "Instrumentation & Control",
    description: "Measurement, sensing and process automation.",
    sortOrder: 11,
  },
  {
    slug: "industrial-production",
    name: "Industrial / Production",
    description: "Operations, manufacturing systems and optimisation.",
    sortOrder: 12,
  },
  {
    slug: "environmental",
    name: "Environmental",
    description: "Pollution control, water and sustainability engineering.",
    sortOrder: 13,
  },
  {
    slug: "petroleum",
    name: "Petroleum",
    description: "Reservoir, drilling and production engineering.",
    sortOrder: 14,
  },
  {
    slug: "biomedical",
    name: "Biomedical",
    description: "Medical devices, imaging and clinical engineering.",
    sortOrder: 15,
  },
  {
    slug: "metallurgy-materials",
    name: "Metallurgy & Materials",
    description: "Materials science, extraction and characterisation.",
    sortOrder: 16,
  },
  {
    slug: "mining",
    name: "Mining",
    description: "Extraction, mine planning and mineral processing.",
    sortOrder: 17,
  },
  {
    slug: "agricultural",
    name: "Agricultural",
    description: "Farm machinery, irrigation and food process engineering.",
    sortOrder: 18,
  },
  {
    slug: "marine",
    name: "Marine",
    description: "Ship systems, naval architecture and ocean engineering.",
    sortOrder: 19,
  },
  {
    slug: "interdisciplinary",
    name: "Interdisciplinary / Other",
    description: "Cross-disciplinary and emerging programmes.",
    sortOrder: 99,
  },
];

// --- engineering branches / specializations -------------------------------

export const ENGINEERING_BRANCHES: EngineeringBranch[] = [
  // Computer Science / IT — includes the common CSE specializations
  {
    slug: "computer-science",
    name: "Computer Science Engineering",
    categorySlug: "computer-science-it",
    aliases: ["cse", "cs"],
  },
  {
    slug: "information-technology",
    name: "Information Technology",
    categorySlug: "computer-science-it",
    aliases: ["it"],
  },
  {
    slug: "information-science",
    name: "Information Science & Engineering",
    categorySlug: "computer-science-it",
    aliases: ["ise"],
  },
  {
    slug: "software-engineering",
    name: "Software Engineering",
    categorySlug: "computer-science-it",
  },
  {
    slug: "artificial-intelligence",
    name: "Artificial Intelligence",
    categorySlug: "computer-science-it",
    aliases: ["ai"],
  },
  {
    slug: "machine-learning",
    name: "Machine Learning",
    categorySlug: "computer-science-it",
    aliases: ["ml"],
  },
  {
    slug: "ai-data-science",
    name: "AI & Data Science",
    categorySlug: "computer-science-it",
    aliases: ["aids", "ai and ds"],
  },
  { slug: "data-science", name: "Data Science", categorySlug: "computer-science-it" },
  {
    slug: "cybersecurity",
    name: "Cyber Security",
    categorySlug: "computer-science-it",
    aliases: ["cyber security", "information security"],
  },
  { slug: "cloud-computing", name: "Cloud Computing", categorySlug: "computer-science-it" },
  {
    slug: "iot-branch",
    name: "Internet of Things (IoT)",
    categorySlug: "computer-science-it",
    aliases: ["iot"],
  },
  {
    slug: "blockchain-branch",
    name: "Blockchain Technology",
    categorySlug: "computer-science-it",
    aliases: ["blockchain"],
  },
  { slug: "computer-networks", name: "Computer Networks", categorySlug: "computer-science-it" },
  { slug: "cs-design", name: "Computer Science & Design", categorySlug: "computer-science-it" },
  {
    slug: "cs-business-systems",
    name: "Computer Science & Business Systems",
    categorySlug: "computer-science-it",
  },

  // Electronics / Communication
  {
    slug: "electronics-communication",
    name: "Electronics & Communication Engineering",
    categorySlug: "electronics-communication",
    aliases: ["ece"],
  },
  {
    slug: "electronics-telecommunication",
    name: "Electronics & Telecommunication",
    categorySlug: "electronics-communication",
    aliases: ["extc", "ete"],
  },
  {
    slug: "vlsi-design",
    name: "Electronics Engineering (VLSI Design & Technology)",
    categorySlug: "electronics-communication",
    aliases: ["vlsi"],
  },
  { slug: "embedded-systems", name: "Embedded Systems", categorySlug: "electronics-communication" },
  {
    slug: "electronics-computer",
    name: "Electronics & Computer Engineering",
    categorySlug: "electronics-communication",
  },
  {
    slug: "applied-electronics",
    name: "Applied Electronics & Instrumentation",
    categorySlug: "electronics-communication",
  },

  // Electrical
  {
    slug: "electrical",
    name: "Electrical Engineering",
    categorySlug: "electrical",
    aliases: ["ee"],
  },
  {
    slug: "electrical-electronics",
    name: "Electrical & Electronics Engineering",
    categorySlug: "electrical",
    aliases: ["eee"],
  },
  { slug: "power-engineering", name: "Power Engineering", categorySlug: "electrical" },
  {
    slug: "power-electronics-branch",
    name: "Power Electronics & Drives",
    categorySlug: "electrical",
  },

  // Mechanical
  {
    slug: "mechanical",
    name: "Mechanical Engineering",
    categorySlug: "mechanical",
    aliases: ["mech"],
  },
  {
    slug: "mechanical-automation",
    name: "Mechanical & Automation Engineering",
    categorySlug: "mechanical",
  },
  { slug: "thermal-engineering", name: "Thermal Engineering", categorySlug: "mechanical" },
  { slug: "design-engineering", name: "Machine Design", categorySlug: "mechanical" },
  {
    slug: "manufacturing-engineering",
    name: "Manufacturing Engineering",
    categorySlug: "mechanical",
  },

  // Civil
  { slug: "civil", name: "Civil Engineering", categorySlug: "civil" },
  { slug: "structural-engineering", name: "Structural Engineering", categorySlug: "civil" },
  {
    slug: "construction-engineering",
    name: "Construction Engineering & Management",
    categorySlug: "civil",
  },
  { slug: "transportation-engineering", name: "Transportation Engineering", categorySlug: "civil" },
  { slug: "geotechnical-engineering", name: "Geotechnical Engineering", categorySlug: "civil" },
  { slug: "water-resources", name: "Water Resources Engineering", categorySlug: "civil" },

  // Chemical
  { slug: "chemical", name: "Chemical Engineering", categorySlug: "chemical" },
  { slug: "petrochemical", name: "Petrochemical Engineering", categorySlug: "chemical" },
  { slug: "polymer-engineering", name: "Polymer Engineering", categorySlug: "chemical" },
  { slug: "process-engineering", name: "Process Engineering", categorySlug: "chemical" },

  // Biotechnology
  { slug: "biotechnology", name: "Biotechnology Engineering", categorySlug: "biotechnology" },
  {
    slug: "biochemical-engineering",
    name: "Biochemical Engineering",
    categorySlug: "biotechnology",
  },
  { slug: "bioinformatics-branch", name: "Bioinformatics", categorySlug: "biotechnology" },
  { slug: "genetic-engineering", name: "Genetic Engineering", categorySlug: "biotechnology" },

  // Aerospace
  { slug: "aerospace", name: "Aerospace Engineering", categorySlug: "aerospace" },
  { slug: "aeronautical", name: "Aeronautical Engineering", categorySlug: "aerospace" },
  { slug: "avionics", name: "Avionics Engineering", categorySlug: "aerospace" },

  // Automobile
  { slug: "automobile", name: "Automobile Engineering", categorySlug: "automobile" },
  { slug: "automotive-engineering", name: "Automotive Engineering", categorySlug: "automobile" },

  // Mechatronics
  { slug: "mechatronics", name: "Mechatronics Engineering", categorySlug: "mechatronics" },
  {
    slug: "robotics-engineering-branch",
    name: "Robotics & Automation",
    categorySlug: "mechatronics",
    aliases: ["robotics"],
  },

  // Instrumentation & Control
  { slug: "instrumentation", name: "Instrumentation Engineering", categorySlug: "instrumentation" },
  {
    slug: "instrumentation-control",
    name: "Instrumentation & Control Engineering",
    categorySlug: "instrumentation",
    aliases: ["ice"],
  },
  {
    slug: "electronics-instrumentation",
    name: "Electronics & Instrumentation Engineering",
    categorySlug: "instrumentation",
    aliases: ["eie"],
  },

  // Industrial / Production
  {
    slug: "industrial-engineering",
    name: "Industrial Engineering",
    categorySlug: "industrial-production",
  },
  {
    slug: "production-engineering",
    name: "Production Engineering",
    categorySlug: "industrial-production",
  },
  {
    slug: "industrial-production",
    name: "Industrial & Production Engineering",
    categorySlug: "industrial-production",
  },

  // Environmental
  { slug: "environmental", name: "Environmental Engineering", categorySlug: "environmental" },

  // Petroleum
  { slug: "petroleum", name: "Petroleum Engineering", categorySlug: "petroleum" },

  // Biomedical
  { slug: "biomedical", name: "Biomedical Engineering", categorySlug: "biomedical" },
  { slug: "medical-electronics", name: "Medical Electronics", categorySlug: "biomedical" },

  // Metallurgy & Materials
  {
    slug: "metallurgical-engineering",
    name: "Metallurgical Engineering",
    categorySlug: "metallurgy-materials",
  },
  {
    slug: "materials-science",
    name: "Materials Science & Engineering",
    categorySlug: "metallurgy-materials",
  },
  {
    slug: "ceramic-engineering",
    name: "Ceramic Engineering",
    categorySlug: "metallurgy-materials",
  },

  // Mining
  { slug: "mining", name: "Mining Engineering", categorySlug: "mining" },

  // Agricultural
  { slug: "agricultural", name: "Agricultural Engineering", categorySlug: "agricultural" },
  { slug: "food-technology", name: "Food Technology / Engineering", categorySlug: "agricultural" },

  // Marine
  { slug: "marine", name: "Marine Engineering", categorySlug: "marine" },
  {
    slug: "naval-architecture",
    name: "Naval Architecture & Ocean Engineering",
    categorySlug: "marine",
  },

  // Interdisciplinary / Other
  { slug: "engineering-physics", name: "Engineering Physics", categorySlug: "interdisciplinary" },
  {
    slug: "engineering-mathematics",
    name: "Engineering / Computational Mathematics",
    categorySlug: "interdisciplinary",
  },
  { slug: "other", name: "Other Engineering Discipline", categorySlug: "interdisciplinary" },
];

// --- career paths (defined independently of branches) ---------------------

// Common branch groupings, referenced below to keep the mappings readable.
const CS_CORE = [
  "computer-science",
  "information-technology",
  "information-science",
  "software-engineering",
  "cs-design",
  "cs-business-systems",
];
const CS_AI = ["artificial-intelligence", "machine-learning", "ai-data-science", "data-science"];
const ECE_CORE = [
  "electronics-communication",
  "electronics-telecommunication",
  "electronics-computer",
  "vlsi-design",
  "embedded-systems",
];
const EE_CORE = [
  "electrical",
  "electrical-electronics",
  "power-engineering",
  "power-electronics-branch",
];
const MECH_CORE = [
  "mechanical",
  "mechanical-automation",
  "thermal-engineering",
  "design-engineering",
  "manufacturing-engineering",
];
const CIVIL_CORE = [
  "civil",
  "structural-engineering",
  "construction-engineering",
  "transportation-engineering",
  "geotechnical-engineering",
  "water-resources",
];
const INSTR_CORE = [
  "instrumentation",
  "instrumentation-control",
  "electronics-instrumentation",
  "applied-electronics",
];

export const CAREER_PATHS: CareerPathDef[] = [
  // ---- Software -------------------------------------------------------------
  {
    slug: "software-engineer",
    title: "Software Engineer",
    group: "Software",
    description: "Designs, builds and maintains software systems across the stack.",
    branches: {
      primary: [...CS_CORE],
      common: [...ECE_CORE, ...EE_CORE, "iot-branch", "computer-networks", "mechatronics"],
    },
    universalRelevance: "possible", // reachable from any branch with self-study
    skills: {
      core: ["data-structures-algorithms", "git", "problem-solving"],
      important: ["python", "sql", "rest-apis", "testing", "system-design"],
      helpful: ["docker", "linux", "agile"],
    },
  },
  {
    slug: "backend-developer",
    title: "Backend Engineer",
    group: "Software",
    description: "Builds server-side services, APIs and data layers.",
    branches: {
      primary: [...CS_CORE],
      common: [...ECE_CORE, "computer-networks", "cloud-computing"],
    },
    skills: {
      core: ["rest-apis", "sql", "data-structures-algorithms", "git"],
      important: ["nodejs", "python", "postgresql", "system-design", "docker"],
      helpful: ["redis", "microservices", "graphql", "aws"],
    },
  },
  {
    slug: "frontend-developer",
    title: "Frontend Engineer",
    group: "Software",
    description: "Builds user-facing web interfaces and design systems.",
    branches: { primary: [...CS_CORE, "cs-design"], common: [...ECE_CORE] },
    skills: {
      core: ["javascript", "html-css", "react", "git"],
      important: ["typescript", "tailwind", "rest-apis", "testing"],
      helpful: ["nextjs", "system-design"],
    },
  },
  {
    slug: "fullstack-developer",
    title: "Full-Stack Engineer",
    group: "Software",
    description: "Works across frontend, backend and deployment.",
    branches: { primary: [...CS_CORE], common: [...ECE_CORE] },
    skills: {
      core: ["javascript", "react", "nodejs", "sql", "git"],
      important: ["typescript", "rest-apis", "postgresql", "docker", "system-design"],
      helpful: ["nextjs", "aws", "testing"],
    },
  },
  {
    slug: "mobile-developer",
    title: "Mobile App Developer",
    group: "Software",
    description: "Builds native or cross-platform mobile applications.",
    branches: { primary: [...CS_CORE], common: [...ECE_CORE] },
    skills: {
      core: ["data-structures-algorithms", "git", "rest-apis"],
      important: ["java", "javascript", "react", "testing"],
      helpful: ["typescript", "ci-cd"],
    },
  },
  {
    slug: "game-developer",
    title: "Game Developer",
    group: "Software",
    description: "Builds interactive games and real-time graphics engines.",
    branches: { primary: [...CS_CORE], common: ["cs-design", ...ECE_CORE] },
    skills: {
      core: ["c-plus-plus", "data-structures-algorithms", "git"],
      important: ["c-sharp", "problem-solving"],
      helpful: ["python"],
    },
  },
  {
    slug: "qa-engineer",
    title: "QA / Test Automation Engineer",
    group: "Software",
    description: "Designs test strategies and automated test suites.",
    branches: { primary: [...CS_CORE], common: [...ECE_CORE, ...INSTR_CORE] },
    skills: {
      core: ["testing", "git", "problem-solving"],
      important: ["python", "ci-cd", "rest-apis"],
      helpful: ["docker", "sql"],
    },
  },
  {
    slug: "technical-writer",
    title: "Technical Writer",
    group: "Software",
    description: "Produces developer docs, API references and guides.",
    branches: { common: [...CS_CORE], possible: [...ECE_CORE, ...MECH_CORE] },
    universalRelevance: "possible",
    skills: {
      core: ["technical-writing", "communication"],
      important: ["git", "rest-apis"],
      helpful: ["python"],
    },
  },

  // ---- Cloud / DevOps / Security -----------------------------------------
  {
    slug: "devops-engineer",
    title: "Cloud / DevOps Engineer",
    group: "Cloud & DevOps",
    description: "Automates build, deployment and infrastructure operations.",
    branches: {
      primary: ["cloud-computing", ...CS_CORE],
      common: [...ECE_CORE, "computer-networks", "electrical-electronics"],
    },
    skills: {
      core: ["linux", "docker", "ci-cd", "git"],
      important: ["kubernetes", "aws", "terraform", "python"],
      helpful: ["system-design", "siem"],
    },
  },
  {
    slug: "sre",
    title: "Site Reliability Engineer",
    group: "Cloud & DevOps",
    description: "Keeps large-scale systems reliable, observable and performant.",
    branches: { primary: ["cloud-computing", ...CS_CORE], common: ["computer-networks"] },
    skills: {
      core: ["linux", "system-design", "docker", "git"],
      important: ["kubernetes", "aws", "python", "ci-cd"],
      helpful: ["distributed-systems", "siem"],
    },
  },
  {
    slug: "cloud-engineer",
    title: "Cloud Engineer",
    group: "Cloud & DevOps",
    description: "Designs and runs workloads on cloud platforms.",
    branches: {
      primary: ["cloud-computing", ...CS_CORE],
      common: [...ECE_CORE, "computer-networks"],
    },
    skills: {
      core: ["aws", "linux", "docker", "git"],
      important: ["terraform", "kubernetes", "python", "computer-networks"],
      helpful: ["ci-cd", "system-design"],
    },
  },
  {
    slug: "network-engineer",
    title: "Network Engineer",
    group: "Cloud & DevOps",
    description: "Designs and operates enterprise and carrier networks.",
    branches: {
      primary: ["computer-networks", ...ECE_CORE],
      common: [...CS_CORE, "electrical-electronics"],
    },
    skills: {
      core: ["computer-networks", "linux", "problem-solving"],
      important: ["network-security", "python"],
      helpful: ["aws", "siem"],
    },
  },
  {
    slug: "security-engineer",
    title: "Cybersecurity Engineer",
    group: "Cloud & DevOps",
    description: "Secures systems, networks and applications against attack.",
    branches: {
      primary: ["cybersecurity", ...CS_CORE],
      common: ["computer-networks", ...ECE_CORE],
    },
    skills: {
      core: ["network-security", "linux", "owasp", "problem-solving"],
      important: ["cryptography", "penetration-testing", "python", "siem"],
      helpful: ["incident-response", "computer-networks"],
    },
  },

  // ---- Data & AI ---------------------------------------------------------
  {
    slug: "data-analyst",
    title: "Data Analyst",
    group: "Data & AI",
    description: "Turns data into decisions with SQL, stats and dashboards.",
    branches: {
      primary: [...CS_AI, ...CS_CORE],
      common: [...ECE_CORE, ...EE_CORE, ...MECH_CORE, "industrial-engineering", "chemical"],
    },
    universalRelevance: "possible",
    skills: {
      core: ["sql", "data-analysis", "statistics", "excel"],
      important: ["python", "data-visualization", "pandas"],
      helpful: ["power-bi", "tableau"],
    },
  },
  {
    slug: "data-scientist",
    title: "Data Scientist",
    group: "Data & AI",
    description: "Builds statistical and ML models to answer hard questions.",
    branches: {
      primary: [...CS_AI],
      common: [
        ...CS_CORE,
        ...ECE_CORE,
        ...EE_CORE,
        "engineering-mathematics",
        "engineering-physics",
      ],
      possible: [...MECH_CORE, "chemical", "industrial-engineering"],
    },
    skills: {
      core: ["python", "statistics", "machine-learning", "pandas"],
      important: ["sql", "data-visualization", "deep-learning", "data-analysis"],
      helpful: ["spark", "nlp", "docker"],
    },
  },
  {
    slug: "data-engineer",
    title: "Data Engineer",
    group: "Data & AI",
    description: "Builds the pipelines and warehouses that power analytics and ML.",
    branches: { primary: [...CS_AI, ...CS_CORE], common: [...ECE_CORE, "cloud-computing"] },
    skills: {
      core: ["python", "sql", "etl", "git"],
      important: ["spark", "airflow", "data-warehousing", "docker"],
      helpful: ["aws", "kubernetes"],
    },
  },
  {
    slug: "ml-engineer",
    title: "Machine Learning Engineer",
    group: "Data & AI",
    description: "Ships ML models to production and keeps them healthy.",
    branches: {
      primary: [...CS_AI],
      common: [...CS_CORE, ...ECE_CORE, "engineering-mathematics"],
      possible: [...EE_CORE, ...MECH_CORE],
    },
    skills: {
      core: ["python", "machine-learning", "data-structures-algorithms", "pytorch"],
      important: ["deep-learning", "sql", "mlops", "docker"],
      helpful: ["tensorflow", "aws", "nlp", "computer-vision"],
    },
  },
  {
    slug: "ai-engineer",
    title: "AI Engineer",
    group: "Data & AI",
    description: "Builds applications on top of foundation models and AI APIs.",
    branches: { primary: [...CS_AI, ...CS_CORE], common: [...ECE_CORE] },
    skills: {
      core: ["python", "llm", "rest-apis", "git"],
      important: ["machine-learning", "nlp", "system-design"],
      helpful: ["pytorch", "docker", "aws"],
    },
  },
  {
    slug: "ai-researcher",
    title: "AI / ML Researcher",
    group: "Data & AI",
    description: "Advances the state of the art in learning algorithms.",
    branches: {
      primary: ["artificial-intelligence", "machine-learning"],
      common: ["computer-science", "engineering-mathematics", "engineering-physics"],
    },
    skills: {
      core: ["python", "deep-learning", "statistics", "machine-learning"],
      important: ["pytorch", "nlp", "computer-vision"],
      helpful: ["technical-writing"],
    },
  },
  {
    slug: "mlops-engineer",
    title: "MLOps Engineer",
    group: "Data & AI",
    description: "Operationalises ML — training infra, serving, monitoring.",
    branches: { primary: [...CS_AI, "cloud-computing"], common: [...CS_CORE] },
    skills: {
      core: ["python", "mlops", "docker", "ci-cd"],
      important: ["kubernetes", "aws", "machine-learning"],
      helpful: ["airflow", "terraform"],
    },
  },

  // ---- Embedded & Electronics -----------------------------------------------
  {
    slug: "embedded-engineer",
    title: "Embedded Systems Engineer",
    group: "Embedded & Electronics",
    description: "Writes firmware and builds the software/hardware boundary.",
    branches: {
      primary: [...ECE_CORE, "electrical-electronics"],
      common: ["mechatronics", ...INSTR_CORE, "iot-branch", "medical-electronics", "avionics"],
      possible: ["computer-science", "electrical"],
    },
    skills: {
      core: ["embedded-c", "c-programming", "microcontrollers"],
      important: ["rtos", "serial-protocols", "firmware", "git"],
      helpful: ["embedded-linux", "can-bus", "python"],
    },
  },
  {
    slug: "iot-engineer",
    title: "IoT Engineer",
    group: "Embedded & Electronics",
    description: "Builds connected devices end to end — sensor to cloud.",
    branches: {
      primary: ["iot-branch", ...ECE_CORE],
      common: [...CS_CORE, "electrical-electronics", "mechatronics"],
    },
    skills: {
      core: ["microcontrollers", "embedded-c", "iot", "mqtt"],
      important: ["python", "rest-apis", "serial-protocols"],
      helpful: ["aws", "linux"],
    },
  },
  {
    slug: "vlsi-engineer",
    title: "VLSI Design Engineer",
    group: "Embedded & Electronics",
    description: "Designs and verifies digital integrated circuits.",
    branches: {
      primary: ["vlsi-design", "electronics-communication", "electronics-telecommunication"],
      common: ["electrical-electronics", "embedded-systems"],
    },
    skills: {
      core: ["verilog", "digital-design", "vlsi"],
      important: ["systemverilog", "static-timing-analysis", "semiconductor-physics"],
      helpful: ["python", "c-programming"],
    },
  },
  {
    slug: "fpga-engineer",
    title: "FPGA Engineer",
    group: "Embedded & Electronics",
    description: "Implements accelerated logic on reconfigurable hardware.",
    branches: {
      primary: ["vlsi-design", "electronics-communication"],
      common: ["electrical-electronics", "embedded-systems"],
    },
    skills: {
      core: ["verilog", "vhdl", "fpga", "digital-design"],
      important: ["systemverilog", "dsp"],
      helpful: ["c-programming", "python"],
    },
  },
  {
    slug: "electronics-engineer",
    title: "Electronics Engineer",
    group: "Embedded & Electronics",
    description: "Designs analog/mixed-signal circuits and electronic products.",
    branches: {
      primary: [...ECE_CORE, "electrical-electronics"],
      common: [...INSTR_CORE, "medical-electronics", "avionics"],
    },
    skills: {
      core: ["analog-design", "digital-design", "pcb-design"],
      important: ["spice-simulation", "microcontrollers", "dsp"],
      helpful: ["matlab", "embedded-c"],
    },
  },
  {
    slug: "hardware-design-engineer",
    title: "Hardware Design Engineer",
    group: "Embedded & Electronics",
    description: "Owns board-level design from schematic to bring-up.",
    branches: {
      primary: [...ECE_CORE, "electrical-electronics"],
      common: ["mechatronics", "embedded-systems"],
    },
    skills: {
      core: ["pcb-design", "analog-design", "digital-design"],
      important: ["spice-simulation", "serial-protocols"],
      helpful: ["microcontrollers", "matlab"],
    },
  },
  {
    slug: "pcb-design-engineer",
    title: "PCB Design Engineer",
    group: "Embedded & Electronics",
    description: "Lays out manufacturable, signal-integrity-clean boards.",
    branches: { primary: [...ECE_CORE], common: ["electrical-electronics", "embedded-systems"] },
    skills: {
      core: ["pcb-design", "digital-design"],
      important: ["analog-design", "spice-simulation"],
      helpful: ["serial-protocols"],
    },
  },
  {
    slug: "rf-engineer",
    title: "RF / Microwave Engineer",
    group: "Embedded & Electronics",
    description: "Designs antennas, transceivers and wireless links.",
    branches: {
      primary: ["electronics-communication", "electronics-telecommunication"],
      common: ["avionics", "electrical-electronics"],
    },
    skills: {
      core: ["rf-engineering", "analog-design", "dsp"],
      important: ["spice-simulation", "matlab"],
      helpful: ["python"],
    },
  },
  {
    slug: "semiconductor-process-engineer",
    title: "Semiconductor Process Engineer",
    group: "Embedded & Electronics",
    description: "Runs and improves fab processes for chip manufacturing.",
    branches: {
      primary: ["vlsi-design", "electronics-communication"],
      common: ["metallurgical-engineering", "materials-science", "chemical", "ceramic-engineering"],
    },
    skills: {
      core: ["semiconductor-physics", "materials-characterization"],
      important: ["process-control", "statistics"],
      helpful: ["python", "lean-six-sigma"],
    },
  },

  // ---- Electrical & Power ------------------------------------------------
  {
    slug: "power-systems-engineer",
    title: "Power Systems Engineer",
    group: "Electrical & Power",
    description: "Plans, protects and operates electrical grids and plants.",
    branches: { primary: [...EE_CORE], common: ["instrumentation-control", "petroleum", "mining"] },
    skills: {
      core: ["power-systems", "electrical-machines", "problem-solving"],
      important: ["power-electronics", "matlab", "control-systems"],
      helpful: ["plc-scada", "python"],
    },
  },
  {
    slug: "control-systems-engineer",
    title: "Control Systems Engineer",
    group: "Electrical & Power",
    description: "Designs feedback controllers for physical processes.",
    branches: {
      primary: [...INSTR_CORE, "electrical", "electrical-electronics"],
      common: ["mechatronics", "aerospace", "chemical", ...ECE_CORE],
    },
    skills: {
      core: ["control-systems", "matlab", "simulink"],
      important: ["plc-scada", "process-instrumentation", "sensors-transducers"],
      helpful: ["python", "embedded-c"],
    },
  },
  {
    slug: "automation-engineer",
    title: "Industrial Automation Engineer",
    group: "Electrical & Power",
    description: "Builds PLC/SCADA automation for factories and plants.",
    branches: {
      primary: [...INSTR_CORE, "electrical-electronics"],
      common: ["mechatronics", "production-engineering", "chemical", "mechanical"],
    },
    skills: {
      core: ["plc-scada", "industrial-automation", "control-systems"],
      important: ["sensors-transducers", "process-instrumentation"],
      helpful: ["ros", "python"],
    },
  },

  // ---- Mechanical & Manufacturing --------------------------------------
  {
    slug: "mechanical-design-engineer",
    title: "Mechanical Design Engineer",
    group: "Mechanical & Manufacturing",
    description: "Designs mechanical parts and assemblies from concept to drawing.",
    branches: {
      primary: [...MECH_CORE],
      common: [
        "automobile",
        "automotive-engineering",
        "aerospace",
        "aeronautical",
        "mechatronics",
        "marine",
      ],
    },
    skills: {
      core: ["cad", "solidworks", "machine-design", "gd-and-t"],
      important: ["fea", "ansys", "manufacturing-processes"],
      helpful: ["catia", "matlab"],
    },
  },
  {
    slug: "simulation-engineer",
    title: "CAE / Simulation Engineer",
    group: "Mechanical & Manufacturing",
    description: "Predicts structural, thermal and fluid behaviour with FEA/CFD.",
    branches: {
      primary: ["design-engineering", "thermal-engineering", "mechanical"],
      common: ["aerospace", "automotive-engineering", "civil", "structural-engineering"],
    },
    skills: {
      core: ["fea", "cfd", "ansys"],
      important: ["thermodynamics", "matlab", "machine-design"],
      helpful: ["python", "composite-materials"],
    },
  },
  {
    slug: "automotive-engineer",
    title: "Automotive Engineer",
    group: "Mechanical & Manufacturing",
    description: "Develops vehicle systems — chassis, powertrain, electronics.",
    branches: {
      primary: ["automobile", "automotive-engineering"],
      common: [...MECH_CORE, "mechatronics", "electrical-electronics", ...ECE_CORE],
    },
    skills: {
      core: ["vehicle-dynamics", "cad", "machine-design"],
      important: ["powertrain", "fea", "gd-and-t"],
      helpful: ["adas", "autosar", "matlab"],
    },
  },
  {
    slug: "manufacturing-engineer",
    title: "Manufacturing Engineer",
    group: "Mechanical & Manufacturing",
    description: "Designs and improves how products are made at scale.",
    branches: {
      primary: [
        "manufacturing-engineering",
        "production-engineering",
        "industrial-production",
        "mechanical",
      ],
      common: ["industrial-engineering", "mechanical-automation", "automobile"],
    },
    skills: {
      core: ["manufacturing-processes", "cnc-machining", "gd-and-t"],
      important: ["lean-six-sigma", "cad", "gd-quality"],
      helpful: ["additive-manufacturing", "plc-scada"],
    },
  },
  {
    slug: "product-design-engineer",
    title: "Product Design Engineer",
    group: "Mechanical & Manufacturing",
    description: "Owns a physical product's design, prototyping and DFM.",
    branches: {
      primary: ["design-engineering", "mechanical", "mechanical-automation"],
      common: ["mechatronics", "automobile", "cs-design"],
    },
    skills: {
      core: ["cad", "solidworks", "machine-design"],
      important: ["additive-manufacturing", "gd-and-t", "manufacturing-processes"],
      helpful: ["fea"],
    },
  },
  {
    slug: "quality-engineer",
    title: "Quality Engineer",
    group: "Mechanical & Manufacturing",
    description: "Owns inspection, SPC and continuous-improvement systems.",
    branches: {
      primary: ["production-engineering", "industrial-engineering", "manufacturing-engineering"],
      common: [...MECH_CORE, "automobile", "metallurgical-engineering", "chemical"],
    },
    skills: {
      core: ["gd-quality", "lean-six-sigma", "statistics"],
      important: ["gd-and-t", "manufacturing-processes"],
      helpful: ["excel", "problem-solving"],
    },
  },
  {
    slug: "hvac-engineer",
    title: "HVAC Engineer",
    group: "Mechanical & Manufacturing",
    description: "Designs heating, ventilation and air-conditioning systems.",
    branches: {
      primary: ["thermal-engineering", "mechanical"],
      common: ["civil", "construction-engineering"],
    },
    skills: {
      core: ["thermodynamics", "heat-mass-transfer", "cad"],
      important: ["cfd", "autocad"],
      helpful: ["revit-bim"],
    },
  },
  {
    slug: "industrial-engineer",
    title: "Industrial Engineer",
    group: "Mechanical & Manufacturing",
    description: "Optimises people, process and material flow in operations.",
    branches: {
      primary: ["industrial-engineering", "production-engineering", "industrial-production"],
      common: [...MECH_CORE, "manufacturing-engineering"],
    },
    skills: {
      core: ["lean-six-sigma", "statistics", "problem-solving"],
      important: ["data-analysis", "excel", "project-management"],
      helpful: ["python", "power-bi"],
    },
  },

  // ---- Robotics -------------------------------------------------------
  {
    slug: "robotics-engineer",
    title: "Robotics Engineer",
    group: "Robotics & Automation",
    description: "Builds robots — mechatronics, perception, control and planning.",
    branches: {
      primary: ["mechatronics", "robotics-engineering-branch"],
      common: [
        ...MECH_CORE,
        ...ECE_CORE,
        ...EE_CORE,
        "artificial-intelligence",
        "computer-science",
      ],
    },
    skills: {
      core: ["ros", "robot-kinematics", "control-systems", "c-plus-plus"],
      important: ["python", "motion-planning", "embedded-c"],
      helpful: ["computer-vision", "machine-learning", "cad"],
    },
  },

  // ---- Civil & Infrastructure ----------------------------------------
  {
    slug: "structural-engineer",
    title: "Structural Engineer",
    group: "Civil & Infrastructure",
    description: "Designs buildings and structures to carry load safely.",
    branches: {
      primary: ["structural-engineering", "civil"],
      common: ["construction-engineering"],
    },
    skills: {
      core: ["structural-analysis", "concrete-design", "staad-pro"],
      important: ["steel-design", "etabs", "autocad"],
      helpful: ["revit-bim"],
    },
  },
  {
    slug: "construction-manager",
    title: "Construction Manager",
    group: "Civil & Infrastructure",
    description: "Plans and runs construction projects on cost and schedule.",
    branches: {
      primary: ["construction-engineering", "civil"],
      common: ["structural-engineering", "industrial-engineering"],
    },
    skills: {
      core: ["construction-management", "project-management", "primavera"],
      important: ["autocad", "communication"],
      helpful: ["revit-bim", "structural-analysis"],
    },
  },
  {
    slug: "transportation-engineer",
    title: "Transportation Engineer",
    group: "Civil & Infrastructure",
    description: "Designs roads, transit and traffic systems.",
    branches: {
      primary: ["transportation-engineering", "civil"],
      common: ["structural-engineering"],
    },
    skills: {
      core: ["transportation-planning", "structural-analysis"],
      important: ["autocad", "surveying", "data-analysis"],
      helpful: ["revit-bim"],
    },
  },
  {
    slug: "geotechnical-engineer",
    title: "Geotechnical Engineer",
    group: "Civil & Infrastructure",
    description: "Analyses soil and rock behaviour for foundations and slopes.",
    branches: {
      primary: ["geotechnical-engineering", "civil"],
      common: ["mining", "petroleum", "structural-engineering"],
    },
    skills: {
      core: ["geotechnical", "structural-analysis"],
      important: ["surveying", "staad-pro"],
      helpful: ["autocad"],
    },
  },
  {
    slug: "environmental-engineer",
    title: "Environmental Engineer",
    group: "Civil & Infrastructure",
    description: "Designs systems for clean water, air and waste management.",
    branches: {
      primary: ["environmental", "water-resources"],
      common: ["civil", "chemical", "biotechnology", "agricultural"],
    },
    skills: {
      core: ["water-treatment", "environmental-impact-assessment"],
      important: ["hydraulics", "process-control", "data-analysis"],
      helpful: ["autocad", "gis"],
    },
  },

  // ---- Process, Energy & Materials ----------------------------------
  {
    slug: "chemical-process-engineer",
    title: "Chemical / Process Engineer",
    group: "Process & Energy",
    description: "Designs and optimises chemical process plants and units.",
    branches: {
      primary: ["chemical", "process-engineering", "petrochemical"],
      common: ["polymer-engineering", "biochemical-engineering", "environmental", "petroleum"],
    },
    skills: {
      core: ["heat-mass-transfer", "reaction-engineering", "process-simulation"],
      important: ["process-control", "piping-design", "hazop"],
      helpful: ["python", "statistics"],
    },
  },
  {
    slug: "process-safety-engineer",
    title: "Process Safety Engineer",
    group: "Process & Energy",
    description: "Prevents and mitigates major process hazards.",
    branches: {
      primary: ["chemical", "petrochemical", "petroleum"],
      common: ["process-engineering", "environmental"],
    },
    skills: {
      core: ["hazop", "process-control", "piping-design"],
      important: ["reaction-engineering", "communication"],
      helpful: ["data-analysis"],
    },
  },
  {
    slug: "petroleum-engineer",
    title: "Petroleum Engineer",
    group: "Process & Energy",
    description: "Maximises safe, economic recovery from oil and gas reservoirs.",
    branches: {
      primary: ["petroleum"],
      common: ["chemical", "geotechnical-engineering", "mining"],
    },
    skills: {
      core: ["reservoir-engineering", "drilling-engineering"],
      important: ["process-simulation", "data-analysis"],
      helpful: ["python", "statistics"],
    },
  },
  {
    slug: "materials-engineer",
    title: "Materials Engineer",
    group: "Process & Energy",
    description: "Selects, develops and tests materials for performance.",
    branches: {
      primary: ["materials-science", "metallurgical-engineering", "ceramic-engineering"],
      common: ["mechanical", "aerospace", "chemical", "polymer-engineering", "biomedical"],
    },
    skills: {
      core: ["materials-characterization", "problem-solving"],
      important: ["composite-materials", "statistics"],
      helpful: ["fea", "python"],
    },
  },
  {
    slug: "mining-engineer",
    title: "Mining Engineer",
    group: "Process & Energy",
    description: "Plans and manages safe, efficient mineral extraction.",
    branches: {
      primary: ["mining"],
      common: ["geotechnical-engineering", "metallurgical-engineering", "petroleum"],
    },
    skills: {
      core: ["geotechnical", "surveying", "project-management"],
      important: ["data-analysis", "autocad"],
      helpful: ["python"],
    },
  },

  // ---- Aerospace ---------------------------------------------------
  {
    slug: "aerospace-engineer",
    title: "Aerospace Engineer",
    group: "Aerospace & Defence",
    description: "Designs aircraft, spacecraft and their subsystems.",
    branches: {
      primary: ["aerospace", "aeronautical"],
      common: ["mechanical", "design-engineering", "avionics", "materials-science"],
    },
    skills: {
      core: ["aerodynamics", "flight-mechanics", "cad"],
      important: ["fea", "cfd", "propulsion", "composite-materials"],
      helpful: ["matlab", "ansys"],
    },
  },
  {
    slug: "avionics-engineer",
    title: "Avionics Engineer",
    group: "Aerospace & Defence",
    description: "Builds aircraft electronic systems — navigation, control, comms.",
    branches: {
      primary: ["avionics", "aerospace"],
      common: [...ECE_CORE, "embedded-systems", ...INSTR_CORE],
    },
    skills: {
      core: ["embedded-c", "control-systems", "serial-protocols"],
      important: ["dsp", "rf-engineering", "rtos"],
      helpful: ["matlab", "can-bus"],
    },
  },

  // ---- Biomedical & Bio ------------------------------------------
  {
    slug: "biomedical-engineer",
    title: "Biomedical Engineer",
    group: "Biomedical & Bio",
    description: "Designs medical devices, instrumentation and diagnostics.",
    branches: {
      primary: ["biomedical", "medical-electronics"],
      common: [...ECE_CORE, "instrumentation", "mechanical", "materials-science", "biotechnology"],
    },
    skills: {
      core: ["medical-devices", "biomechanics", "sensors-transducers"],
      important: ["dsp", "embedded-c", "matlab"],
      helpful: ["cad", "machine-learning"],
    },
  },
  {
    slug: "bioinformatics-scientist",
    title: "Bioinformatics Scientist",
    group: "Biomedical & Bio",
    description: "Analyses biological data — genomics, proteomics, structures.",
    branches: {
      primary: ["bioinformatics-branch", "biotechnology"],
      common: [
        "genetic-engineering",
        "computer-science",
        "data-science",
        "engineering-mathematics",
      ],
    },
    skills: {
      core: ["bioinformatics", "python", "statistics"],
      important: ["molecular-biology", "data-analysis", "machine-learning"],
      helpful: ["r", "linux"],
    },
  },
  {
    slug: "bioprocess-engineer",
    title: "Bioprocess Engineer",
    group: "Biomedical & Bio",
    description: "Scales up fermentation and downstream bio-manufacturing.",
    branches: {
      primary: ["biochemical-engineering", "biotechnology"],
      common: ["chemical", "process-engineering"],
    },
    skills: {
      core: ["bioprocess-engineering", "heat-mass-transfer", "process-control"],
      important: ["reaction-engineering", "statistics"],
      helpful: ["process-simulation"],
    },
  },

  // ---- Marine ---------------------------------------------------
  {
    slug: "marine-engineer",
    title: "Marine Engineer",
    group: "Aerospace & Defence",
    description: "Designs and maintains ship propulsion and onboard systems.",
    branches: {
      primary: ["marine", "naval-architecture"],
      common: ["mechanical", "thermal-engineering"],
    },
    skills: {
      core: ["thermodynamics", "machine-design", "cad"],
      important: ["heat-mass-transfer", "fea"],
      helpful: ["matlab", "control-systems"],
    },
  },

  // ---- Cross-disciplinary ----------------------------------------
  {
    slug: "blockchain-developer",
    title: "Blockchain Developer",
    group: "Cross-disciplinary",
    description: "Builds decentralised applications and smart contracts.",
    branches: { primary: ["blockchain-branch", ...CS_CORE], common: [...ECE_CORE] },
    skills: {
      core: ["blockchain", "solidity", "data-structures-algorithms", "git"],
      important: ["javascript", "cryptography", "rest-apis"],
      helpful: ["typescript", "system-design"],
    },
  },
  {
    slug: "systems-engineer",
    title: "Systems Engineer",
    group: "Cross-disciplinary",
    description: "Owns requirements, integration and V&V of complex systems.",
    branches: {
      common: [...ECE_CORE, ...MECH_CORE, ...EE_CORE, "aerospace", "automobile", "mechatronics"],
    },
    universalRelevance: "possible",
    skills: {
      core: ["problem-solving", "communication", "project-management"],
      important: ["control-systems", "matlab", "technical-writing"],
      helpful: ["python"],
    },
  },
  {
    slug: "technical-product-manager",
    title: "Technical Product Manager",
    group: "Cross-disciplinary",
    description: "Owns the what and why of a technical product.",
    branches: { common: [...CS_CORE, ...CS_AI, ...ECE_CORE, ...MECH_CORE] },
    universalRelevance: "possible",
    skills: {
      core: ["communication", "problem-solving", "project-management"],
      important: ["data-analysis", "system-design", "agile"],
      helpful: ["sql", "technical-writing"],
    },
  },
  {
    slug: "research-scientist",
    title: "Research Scientist / Engineer",
    group: "Cross-disciplinary",
    description: "Pursues open technical problems in academia or industry R&D.",
    branches: {
      common: ["engineering-physics", "engineering-mathematics", "materials-science", ...CS_AI],
    },
    universalRelevance: "possible",
    skills: {
      core: ["problem-solving", "statistics", "technical-writing"],
      important: ["python", "matlab"],
      helpful: ["machine-learning"],
    },
  },
  {
    slug: "engineering-consultant",
    title: "Engineering Consultant",
    group: "Cross-disciplinary",
    description: "Advises clients on technical strategy and delivery.",
    branches: {},
    universalRelevance: "possible",
    skills: {
      core: ["communication", "problem-solving", "project-management"],
      important: ["data-analysis", "technical-writing"],
      helpful: ["excel"],
    },
  },
];

// --- derived, flat link lists (what the seeder writes) -------------------

const KNOWN_SKILL_SLUGS = new Set(SKILLS_CATALOG.map((s) => s.slug));
const ALL_BRANCH_SLUGS = ENGINEERING_BRANCHES.map((b) => b.slug);

export type BranchCareerLink = {
  branchSlug: string;
  careerSlug: string;
  relevance: CareerRelevance;
};

export type CareerSkillLink = {
  careerSlug: string;
  skillSlug: string;
  importance: SkillImportance;
};

/** Expand each career's `branches` + `universalRelevance` into flat links. */
export function branchCareerLinks(): BranchCareerLink[] {
  const links: BranchCareerLink[] = [];
  for (const c of CAREER_PATHS) {
    const assigned = new Map<string, CareerRelevance>();
    for (const rel of ["primary", "common", "possible"] as const) {
      for (const b of c.branches?.[rel] ?? []) {
        // First (strongest) assignment wins — order above is strongest-first.
        if (!assigned.has(b)) assigned.set(b, rel);
      }
    }
    if (c.universalRelevance) {
      for (const b of ALL_BRANCH_SLUGS) {
        if (!assigned.has(b)) assigned.set(b, c.universalRelevance);
      }
    }
    for (const [branchSlug, relevance] of assigned) {
      links.push({ branchSlug, careerSlug: c.slug, relevance });
    }
  }
  return links;
}

/** Expand each career's `skills` into flat links, dropping unknown skill slugs. */
export function careerSkillLinks(): CareerSkillLink[] {
  const links: CareerSkillLink[] = [];
  for (const c of CAREER_PATHS) {
    for (const imp of ["core", "important", "helpful"] as const) {
      for (const skillSlug of c.skills[imp] ?? []) {
        if (KNOWN_SKILL_SLUGS.has(skillSlug)) {
          links.push({ careerSlug: c.slug, skillSlug, importance: imp });
        }
      }
    }
  }
  return links;
}

/** Skill slugs referenced by careers that are missing from skills-catalog. */
export function unknownCareerSkillSlugs(): string[] {
  const missing = new Set<string>();
  for (const c of CAREER_PATHS) {
    for (const imp of ["core", "important", "helpful"] as const) {
      for (const s of c.skills[imp] ?? []) {
        if (!KNOWN_SKILL_SLUGS.has(s)) missing.add(s);
      }
    }
  }
  return [...missing];
}

// --- back-compat exports for Phase 2 (onboarding) -----------------------

/** Flat {slug,name} branch list — the shape Phase 2's onboarding-catalog used. */
export const BRANCH_OPTIONS = ENGINEERING_BRANCHES.map((b) => ({ slug: b.slug, name: b.name }));
/** Flat career list in Phase 2's {slug,name,category} shape. */
export const CAREER_OPTIONS = CAREER_PATHS.map((c) => ({
  slug: c.slug,
  name: c.title,
  category: c.group,
}));

const CAREER_SLUG_SET = new Set(CAREER_PATHS.map((c) => c.slug));

// Canonical slug ← (canonical slug | alias). Lets callers pass "ece" or
// "electronics-communication" interchangeably, and keeps profiles written
// against Phase 2's shorter slugs resolvable.
const BRANCH_SLUG_BY_KEY = new Map<string, string>();
for (const b of ENGINEERING_BRANCHES) {
  BRANCH_SLUG_BY_KEY.set(b.slug, b.slug);
  for (const a of b.aliases ?? []) BRANCH_SLUG_BY_KEY.set(a, b.slug);
}

/** Resolve a branch slug or alias to its canonical slug, or null if unknown. */
export const resolveBranchSlug = (v: string): string | null => BRANCH_SLUG_BY_KEY.get(v) ?? null;

export const isBranchSlug = (v: string) => BRANCH_SLUG_BY_KEY.has(v);
export const isCareerSlug = (v: string) => CAREER_SLUG_SET.has(v);
