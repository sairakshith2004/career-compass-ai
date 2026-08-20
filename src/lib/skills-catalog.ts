/**
 * Canonical skills catalog. This is the single source of truth for both the DB
 * `skills` table (seeded from here — see `db/seed.ts`) and the keyword matcher
 * (`skill-matching.ts`) that scans resume/job text against it.
 */
export type CatalogSkill = {
  slug: string;
  name: string;
  category: string;
  /** Extra surface forms to match in free text, beyond `name` itself. */
  aliases?: string[];
};

export const SKILLS_CATALOG: CatalogSkill[] = [
  // Languages
  { slug: "python", name: "Python", category: "Language" },
  { slug: "javascript", name: "JavaScript", category: "Language", aliases: ["js"] },
  { slug: "typescript", name: "TypeScript", category: "Language", aliases: ["ts"] },
  { slug: "java", name: "Java", category: "Language" },
  { slug: "go", name: "Go", category: "Language", aliases: ["golang"] },
  { slug: "rust", name: "Rust", category: "Language" },
  { slug: "c-plus-plus", name: "C++", category: "Language" },
  { slug: "c-sharp", name: "C#", category: "Language" },
  { slug: "sql", name: "SQL", category: "Language" },

  // Frontend
  { slug: "react", name: "React", category: "Frontend" },
  { slug: "vue", name: "Vue", category: "Frontend" },
  { slug: "angular", name: "Angular", category: "Frontend" },
  { slug: "nextjs", name: "Next.js", category: "Frontend", aliases: ["next.js", "next js"] },
  { slug: "html-css", name: "HTML/CSS", category: "Frontend", aliases: ["html", "css"] },
  { slug: "tailwind", name: "Tailwind CSS", category: "Frontend", aliases: ["tailwindcss"] },

  // Backend
  { slug: "nodejs", name: "Node.js", category: "Backend", aliases: ["node.js", "node js"] },
  { slug: "express", name: "Express", category: "Backend" },
  { slug: "django", name: "Django", category: "Backend" },
  { slug: "flask", name: "Flask", category: "Backend" },
  { slug: "spring-boot", name: "Spring Boot", category: "Backend", aliases: ["spring"] },
  { slug: "graphql", name: "GraphQL", category: "Backend" },
  { slug: "rest-apis", name: "REST APIs", category: "Backend", aliases: ["rest api", "restful"] },
  { slug: "microservices", name: "Microservices", category: "Backend" },

  // Data / ML
  { slug: "machine-learning", name: "Machine Learning", category: "Data/ML", aliases: ["ml"] },
  { slug: "deep-learning", name: "Deep Learning", category: "Data/ML" },
  { slug: "pytorch", name: "PyTorch", category: "Data/ML" },
  { slug: "tensorflow", name: "TensorFlow", category: "Data/ML" },
  { slug: "pandas", name: "Pandas", category: "Data/ML" },
  { slug: "nlp", name: "NLP", category: "Data/ML", aliases: ["natural language processing"] },
  { slug: "llm", name: "LLMs", category: "Data/ML", aliases: ["large language models"] },

  // Databases
  { slug: "postgresql", name: "PostgreSQL", category: "Database", aliases: ["postgres"] },
  { slug: "mysql", name: "MySQL", category: "Database" },
  { slug: "mongodb", name: "MongoDB", category: "Database", aliases: ["mongo"] },
  { slug: "redis", name: "Redis", category: "Database" },
  { slug: "sqlite", name: "SQLite", category: "Database" },

  // Cloud / DevOps
  { slug: "aws", name: "AWS", category: "Cloud", aliases: ["amazon web services"] },
  { slug: "gcp", name: "GCP", category: "Cloud", aliases: ["google cloud"] },
  { slug: "azure", name: "Azure", category: "Cloud" },
  { slug: "docker", name: "Docker", category: "Cloud" },
  { slug: "kubernetes", name: "Kubernetes", category: "Cloud", aliases: ["k8s"] },
  { slug: "terraform", name: "Terraform", category: "Cloud" },
  {
    slug: "ci-cd",
    name: "CI/CD",
    category: "Cloud",
    aliases: ["continuous integration", "continuous deployment"],
  },
  { slug: "linux", name: "Linux", category: "Cloud" },

  // Concepts
  { slug: "system-design", name: "System Design", category: "Concept" },
  { slug: "distributed-systems", name: "Distributed Systems", category: "Concept" },
  {
    slug: "data-structures-algorithms",
    name: "Data Structures & Algorithms",
    category: "Concept",
    aliases: ["dsa", "algorithms", "data structures"],
  },
  {
    slug: "testing",
    name: "Testing",
    category: "Concept",
    aliases: ["unit testing", "test-driven development", "tdd"],
  },
  { slug: "agile", name: "Agile", category: "Concept", aliases: ["scrum"] },
  { slug: "git", name: "Git", category: "Tools" },
];
