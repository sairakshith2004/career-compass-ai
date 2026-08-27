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
  { slug: "r", name: "R", category: "Language", aliases: ["r language", "r-lang"] },

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

  // Security
  { slug: "network-security", name: "Network Security", category: "Security" },
  {
    slug: "penetration-testing",
    name: "Penetration Testing",
    category: "Security",
    aliases: ["pentesting", "ethical hacking"],
  },
  { slug: "cryptography", name: "Cryptography", category: "Security" },
  {
    slug: "owasp",
    name: "OWASP / AppSec",
    category: "Security",
    aliases: ["application security"],
  },
  { slug: "siem", name: "SIEM & Monitoring", category: "Security" },
  { slug: "incident-response", name: "Incident Response", category: "Security" },

  // Data & Analytics
  { slug: "data-analysis", name: "Data Analysis", category: "Data/ML" },
  { slug: "statistics", name: "Statistics", category: "Data/ML" },
  {
    slug: "data-visualization",
    name: "Data Visualization",
    category: "Data/ML",
    aliases: ["dataviz"],
  },
  { slug: "power-bi", name: "Power BI", category: "Data/ML" },
  { slug: "tableau", name: "Tableau", category: "Data/ML" },
  { slug: "excel", name: "Excel / Spreadsheets", category: "Data/ML" },
  { slug: "spark", name: "Apache Spark", category: "Data/ML", aliases: ["pyspark"] },
  { slug: "airflow", name: "Apache Airflow", category: "Data/ML" },
  { slug: "etl", name: "ETL / Data Pipelines", category: "Data/ML", aliases: ["data pipelines"] },
  { slug: "data-warehousing", name: "Data Warehousing", category: "Data/ML" },
  { slug: "mlops", name: "MLOps", category: "Data/ML" },
  { slug: "computer-vision", name: "Computer Vision", category: "Data/ML", aliases: ["cv"] },

  // Embedded / Hardware
  { slug: "c-programming", name: "C", category: "Embedded", aliases: ["c language"] },
  { slug: "embedded-c", name: "Embedded C", category: "Embedded" },
  {
    slug: "microcontrollers",
    name: "Microcontrollers",
    category: "Embedded",
    aliases: ["mcu", "arduino", "stm32"],
  },
  { slug: "rtos", name: "RTOS", category: "Embedded", aliases: ["freertos", "real-time os"] },
  {
    slug: "serial-protocols",
    name: "I2C / SPI / UART",
    category: "Embedded",
    aliases: ["i2c", "spi", "uart"],
  },
  { slug: "can-bus", name: "CAN Bus", category: "Embedded" },
  { slug: "embedded-linux", name: "Embedded Linux", category: "Embedded" },
  { slug: "firmware", name: "Firmware Development", category: "Embedded" },
  { slug: "arm-architecture", name: "ARM Architecture", category: "Embedded", aliases: ["arm"] },

  // Electronics / VLSI
  { slug: "verilog", name: "Verilog", category: "Electronics" },
  { slug: "vhdl", name: "VHDL", category: "Electronics" },
  { slug: "systemverilog", name: "SystemVerilog", category: "Electronics" },
  {
    slug: "digital-design",
    name: "Digital Design",
    category: "Electronics",
    aliases: ["rtl design"],
  },
  { slug: "analog-design", name: "Analog Circuit Design", category: "Electronics" },
  { slug: "vlsi", name: "VLSI Design", category: "Electronics" },
  { slug: "fpga", name: "FPGA", category: "Electronics" },
  {
    slug: "static-timing-analysis",
    name: "Static Timing Analysis",
    category: "Electronics",
    aliases: ["sta"],
  },
  { slug: "pcb-design", name: "PCB Design", category: "Electronics", aliases: ["altium", "kicad"] },
  {
    slug: "spice-simulation",
    name: "SPICE Simulation",
    category: "Electronics",
    aliases: ["spice"],
  },
  {
    slug: "dsp",
    name: "Digital Signal Processing",
    category: "Electronics",
    aliases: ["signal processing"],
  },
  {
    slug: "rf-engineering",
    name: "RF & Microwave Engineering",
    category: "Electronics",
    aliases: ["rf"],
  },
  { slug: "semiconductor-physics", name: "Semiconductor Device Physics", category: "Electronics" },

  // Electrical / Power / Control
  { slug: "power-systems", name: "Power Systems", category: "Electrical" },
  { slug: "power-electronics", name: "Power Electronics", category: "Electrical" },
  { slug: "electrical-machines", name: "Electrical Machines", category: "Electrical" },
  { slug: "control-systems", name: "Control Systems", category: "Electrical" },
  { slug: "plc-scada", name: "PLC & SCADA", category: "Electrical", aliases: ["plc", "scada"] },
  { slug: "matlab", name: "MATLAB", category: "Engineering Tools" },
  { slug: "simulink", name: "Simulink", category: "Engineering Tools" },

  // Mechanical / Design / Manufacturing
  { slug: "cad", name: "CAD", category: "Mechanical", aliases: ["computer-aided design"] },
  { slug: "solidworks", name: "SolidWorks", category: "Mechanical" },
  { slug: "autocad", name: "AutoCAD", category: "Mechanical" },
  { slug: "catia", name: "CATIA", category: "Mechanical" },
  { slug: "creo", name: "Creo / Pro-E", category: "Mechanical", aliases: ["creo", "pro-e"] },
  { slug: "fea", name: "Finite Element Analysis", category: "Mechanical", aliases: ["fea", "fem"] },
  { slug: "ansys", name: "ANSYS", category: "Mechanical" },
  { slug: "cfd", name: "Computational Fluid Dynamics", category: "Mechanical", aliases: ["cfd"] },
  { slug: "gd-and-t", name: "GD&T", category: "Mechanical", aliases: ["geometric dimensioning"] },
  { slug: "machine-design", name: "Machine Design", category: "Mechanical" },
  { slug: "thermodynamics", name: "Thermodynamics", category: "Mechanical" },
  { slug: "manufacturing-processes", name: "Manufacturing Processes", category: "Mechanical" },
  { slug: "cnc-machining", name: "CNC Machining", category: "Mechanical", aliases: ["cnc"] },
  {
    slug: "additive-manufacturing",
    name: "3D Printing / Additive Manufacturing",
    category: "Mechanical",
  },
  {
    slug: "lean-six-sigma",
    name: "Lean / Six Sigma",
    category: "Mechanical",
    aliases: ["six sigma"],
  },
  { slug: "gd-quality", name: "Quality Control & Inspection", category: "Mechanical" },

  // Robotics / Automation
  { slug: "ros", name: "ROS (Robot Operating System)", category: "Robotics", aliases: ["ros2"] },
  { slug: "robot-kinematics", name: "Robot Kinematics & Dynamics", category: "Robotics" },
  { slug: "motion-planning", name: "Motion Planning", category: "Robotics" },
  { slug: "industrial-automation", name: "Industrial Automation", category: "Robotics" },

  // Automotive / Aerospace
  { slug: "vehicle-dynamics", name: "Vehicle Dynamics", category: "Automotive" },
  { slug: "powertrain", name: "Powertrain Engineering", category: "Automotive" },
  { slug: "adas", name: "ADAS / Autonomous Systems", category: "Automotive" },
  { slug: "autosar", name: "AUTOSAR", category: "Automotive" },
  { slug: "aerodynamics", name: "Aerodynamics", category: "Aerospace" },
  { slug: "propulsion", name: "Propulsion Systems", category: "Aerospace" },
  { slug: "flight-mechanics", name: "Flight Mechanics", category: "Aerospace" },
  { slug: "composite-materials", name: "Composite Materials", category: "Aerospace" },

  // Civil
  { slug: "structural-analysis", name: "Structural Analysis", category: "Civil" },
  { slug: "concrete-design", name: "Reinforced Concrete Design", category: "Civil" },
  { slug: "steel-design", name: "Steel Structure Design", category: "Civil" },
  { slug: "staad-pro", name: "STAAD.Pro", category: "Civil" },
  { slug: "etabs", name: "ETABS", category: "Civil" },
  { slug: "revit-bim", name: "Revit / BIM", category: "Civil", aliases: ["bim", "revit"] },
  { slug: "surveying", name: "Surveying", category: "Civil" },
  { slug: "geotechnical", name: "Geotechnical Engineering", category: "Civil" },
  { slug: "construction-management", name: "Construction Management", category: "Civil" },
  { slug: "primavera", name: "Primavera P6", category: "Civil", aliases: ["primavera"] },
  { slug: "transportation-planning", name: "Transportation Planning", category: "Civil" },
  { slug: "hydraulics", name: "Hydraulics & Water Resources", category: "Civil" },

  // Chemical / Process / Energy
  {
    slug: "process-simulation",
    name: "Process Simulation",
    category: "Chemical",
    aliases: ["aspen", "hysys"],
  },
  { slug: "process-control", name: "Process Control", category: "Chemical" },
  { slug: "reaction-engineering", name: "Chemical Reaction Engineering", category: "Chemical" },
  { slug: "heat-mass-transfer", name: "Heat & Mass Transfer", category: "Chemical" },
  {
    slug: "piping-design",
    name: "Piping & Instrumentation Design",
    category: "Chemical",
    aliases: ["p&id"],
  },
  { slug: "hazop", name: "HAZOP / Process Safety", category: "Chemical" },
  { slug: "reservoir-engineering", name: "Reservoir Engineering", category: "Petroleum" },
  { slug: "drilling-engineering", name: "Drilling Engineering", category: "Petroleum" },

  // Instrumentation
  { slug: "process-instrumentation", name: "Process Instrumentation", category: "Instrumentation" },
  { slug: "sensors-transducers", name: "Sensors & Transducers", category: "Instrumentation" },

  // Bio / Environmental / Materials
  { slug: "bioinformatics", name: "Bioinformatics", category: "Biotechnology" },
  { slug: "molecular-biology", name: "Molecular Biology Techniques", category: "Biotechnology" },
  { slug: "bioprocess-engineering", name: "Bioprocess Engineering", category: "Biotechnology" },
  { slug: "medical-devices", name: "Medical Device Design", category: "Biomedical" },
  { slug: "biomechanics", name: "Biomechanics", category: "Biomedical" },
  {
    slug: "environmental-impact-assessment",
    name: "Environmental Impact Assessment",
    category: "Environmental",
  },
  { slug: "water-treatment", name: "Water & Wastewater Treatment", category: "Environmental" },
  { slug: "materials-characterization", name: "Materials Characterization", category: "Materials" },
  {
    slug: "gis",
    name: "GIS",
    category: "Civil",
    aliases: ["geographic information systems", "arcgis", "qgis"],
  },

  // IoT / Blockchain / Networks
  { slug: "iot", name: "IoT Systems", category: "Emerging Tech", aliases: ["internet of things"] },
  { slug: "mqtt", name: "MQTT / IoT Protocols", category: "Emerging Tech" },
  { slug: "blockchain", name: "Blockchain", category: "Emerging Tech" },
  {
    slug: "solidity",
    name: "Solidity / Smart Contracts",
    category: "Emerging Tech",
    aliases: ["smart contracts"],
  },
  {
    slug: "computer-networks",
    name: "Computer Networks",
    category: "Concept",
    aliases: ["networking", "tcp/ip"],
  },

  // Professional
  { slug: "communication", name: "Communication", category: "Professional" },
  { slug: "problem-solving", name: "Problem Solving", category: "Professional" },
  { slug: "project-management", name: "Project Management", category: "Professional" },
  { slug: "technical-writing", name: "Technical Writing", category: "Professional" },
];
