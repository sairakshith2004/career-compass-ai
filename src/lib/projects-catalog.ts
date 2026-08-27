/**
 * Static portfolio-project catalog. Deterministic seed data (Phase 6) — no fake
 * users, no personal data. Each project links to catalog skill slugs
 * (skills-catalog.ts) and career slugs (taxonomy-catalog.ts) so the roadmap
 * builder and future project recommender can suggest relevant work.
 *
 * Seeded into `projects` / `project_skills` / `project_career_roles` by
 * `ensureCareerFoundationSeeded()` in db/seed.ts.
 */
export type ProjectDef = {
  slug: string;
  title: string;
  description: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  technologies: string[];
  estimatedHours: number;
  skillSlugs: string[];
  careerSlugs: string[];
};

export const PROJECTS_CATALOG: ProjectDef[] = [
  {
    slug: "personal-portfolio-site",
    title: "Personal Portfolio Website",
    description:
      "A responsive personal site with a projects gallery, contact form and a blog, deployed to a public URL.",
    difficulty: "beginner",
    technologies: ["React", "HTML/CSS", "Tailwind CSS"],
    estimatedHours: 20,
    skillSlugs: ["react", "html-css", "tailwind", "git"],
    careerSlugs: ["frontend-developer", "fullstack-developer", "software-engineer"],
  },
  {
    slug: "rest-api-task-manager",
    title: "Task Manager REST API",
    description:
      "A CRUD REST API with authentication, input validation, pagination and automated tests, backed by a relational database.",
    difficulty: "intermediate",
    technologies: ["Node.js", "Express", "PostgreSQL"],
    estimatedHours: 35,
    skillSlugs: ["nodejs", "express", "rest-apis", "postgresql", "testing"],
    careerSlugs: ["backend-developer", "fullstack-developer", "software-engineer"],
  },
  {
    slug: "fullstack-notes-app",
    title: "Full-Stack Notes App",
    description:
      "A full-stack app with user accounts, real-time sync, optimistic UI updates and a deployed backend + frontend.",
    difficulty: "intermediate",
    technologies: ["Next.js", "TypeScript", "PostgreSQL"],
    estimatedHours: 45,
    skillSlugs: ["nextjs", "typescript", "react", "rest-apis", "postgresql"],
    careerSlugs: ["fullstack-developer", "frontend-developer", "software-engineer"],
  },
  {
    slug: "algorithm-visualizer",
    title: "Algorithm Visualizer",
    description:
      "An interactive visualizer for sorting and pathfinding algorithms with step controls and complexity annotations.",
    difficulty: "intermediate",
    technologies: ["JavaScript", "React"],
    estimatedHours: 30,
    skillSlugs: ["data-structures-algorithms", "javascript", "react"],
    careerSlugs: ["software-engineer", "frontend-developer"],
  },
  {
    slug: "url-shortener-service",
    title: "URL Shortener with Analytics",
    description:
      "A scalable URL shortener with custom slugs, click analytics, rate limiting and a Redis cache in front of the database.",
    difficulty: "intermediate",
    technologies: ["Go", "Redis", "PostgreSQL", "Docker"],
    estimatedHours: 40,
    skillSlugs: ["go", "redis", "postgresql", "docker", "system-design"],
    careerSlugs: ["backend-developer", "software-engineer", "devops-engineer"],
  },
  {
    slug: "ci-cd-pipeline",
    title: "CI/CD Pipeline for a Web App",
    description:
      "A complete pipeline: automated tests, container build, image registry push and zero-downtime deploy to a cloud host, all in infrastructure-as-code.",
    difficulty: "advanced",
    technologies: ["Docker", "Kubernetes", "Terraform", "GitHub Actions"],
    estimatedHours: 50,
    skillSlugs: ["ci-cd", "docker", "kubernetes", "terraform", "linux", "aws"],
    careerSlugs: ["devops-engineer", "sre", "cloud-engineer"],
  },
  {
    slug: "data-analysis-dashboard",
    title: "Public Dataset Analysis Dashboard",
    description:
      "An end-to-end analysis of a real public dataset: cleaning, exploratory analysis, statistical tests and an interactive dashboard.",
    difficulty: "intermediate",
    technologies: ["Python", "Pandas", "Power BI"],
    estimatedHours: 35,
    skillSlugs: ["python", "pandas", "data-analysis", "statistics", "data-visualization"],
    careerSlugs: ["data-analyst", "data-scientist"],
  },
  {
    slug: "ml-image-classifier",
    title: "Image Classifier with Transfer Learning",
    description:
      "Train, evaluate and serve an image classifier using transfer learning, with a documented experiment log and a REST inference endpoint.",
    difficulty: "advanced",
    technologies: ["Python", "PyTorch", "Flask"],
    estimatedHours: 50,
    skillSlugs: ["python", "pytorch", "deep-learning", "machine-learning", "computer-vision"],
    careerSlugs: ["ml-engineer", "ai-engineer", "data-scientist"],
  },
  {
    slug: "etl-data-pipeline",
    title: "Batch ETL Data Pipeline",
    description:
      "An orchestrated pipeline that ingests data from multiple sources on a schedule, transforms it and loads it into a warehouse, with monitoring and retries.",
    difficulty: "advanced",
    technologies: ["Python", "Apache Airflow", "Apache Spark"],
    estimatedHours: 55,
    skillSlugs: ["python", "airflow", "spark", "etl", "sql", "data-warehousing"],
    careerSlugs: ["data-engineer", "mlops-engineer"],
  },
  {
    slug: "llm-rag-assistant",
    title: "Retrieval-Augmented Q&A Assistant",
    description:
      "A question-answering assistant over your own documents: chunking, embeddings, a vector store and a grounded generation loop with citations.",
    difficulty: "advanced",
    technologies: ["Python", "LLMs", "FastAPI"],
    estimatedHours: 45,
    skillSlugs: ["python", "llm", "nlp", "machine-learning", "rest-apis"],
    careerSlugs: ["ai-engineer", "ml-engineer"],
  },
  {
    slug: "iot-sensor-monitor",
    title: "IoT Sensor Monitoring System",
    description:
      "A microcontroller reads sensors and publishes readings over MQTT to a dashboard, with local buffering when the network drops.",
    difficulty: "intermediate",
    technologies: ["Embedded C", "Microcontrollers", "MQTT"],
    estimatedHours: 40,
    skillSlugs: ["embedded-c", "microcontrollers", "serial-protocols", "rtos"],
    careerSlugs: ["embedded-engineer", "iot-engineer"],
  },
  {
    slug: "rtos-firmware-project",
    title: "RTOS-Based Firmware Project",
    description:
      "Design firmware on a real-time OS with multiple tasks, inter-task messaging and a watchdog, running on a dev board.",
    difficulty: "advanced",
    technologies: ["Embedded C", "RTOS", "ARM"],
    estimatedHours: 50,
    skillSlugs: ["embedded-c", "rtos", "arm-architecture", "firmware", "microcontrollers"],
    careerSlugs: ["embedded-engineer", "firmware-engineer"],
  },
  {
    slug: "secure-web-app-audit",
    title: "Web App Security Audit",
    description:
      "Assess a deliberately vulnerable web app against the OWASP Top 10, document findings with severity and remediation, and re-test after fixes.",
    difficulty: "intermediate",
    technologies: ["OWASP", "Burp Suite", "Linux"],
    estimatedHours: 35,
    skillSlugs: ["owasp", "penetration-testing", "network-security", "linux"],
    careerSlugs: ["security-engineer"],
  },
  {
    slug: "distributed-chat-service",
    title: "Distributed Chat Service",
    description:
      "A horizontally scalable chat backend with websockets, presence, message history and a load-balanced multi-instance deployment.",
    difficulty: "advanced",
    technologies: ["Go", "Redis", "Docker", "Kubernetes"],
    estimatedHours: 60,
    skillSlugs: ["go", "distributed-systems", "system-design", "redis", "docker", "kubernetes"],
    careerSlugs: ["backend-developer", "software-engineer", "devops-engineer"],
  },
];
