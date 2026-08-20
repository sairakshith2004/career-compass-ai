/**
 * Static assessment question bank — real MCQ content with real correct answers, not
 * AI-generated. Server-only: this file (and its `correctIndex` fields) must never be
 * imported from a route/component file, or the answers ship in the client JS bundle.
 * `server-fns.ts` is the only importer — it strips `correctIndex` before returning
 * questions to the client and only compares against it inside the grading handler.
 */
export type AssessmentQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
};

export type AssessmentDef = {
  slug: string;
  name: string;
  /** Must match a slug in skills-catalog.ts — ties a scored attempt to a verified skill. */
  skillSlug: string;
  type: "mcq" | "coding" | "written";
  durationMinutes: number;
  description: string;
  questions: AssessmentQuestion[];
};

export const ASSESSMENTS_CATALOG: AssessmentDef[] = [
  {
    slug: "python-fundamentals",
    name: "Python Fundamentals",
    skillSlug: "python",
    type: "mcq",
    durationMinutes: 10,
    description: "Core language behavior: integer division, functions, data types.",
    questions: [
      {
        id: "py-1",
        prompt: "What does `print(3 // 2)` output in Python?",
        options: ["1", "1.5", "2", "Error"],
        correctIndex: 0,
      },
      {
        id: "py-2",
        prompt: "Which keyword defines a function in Python?",
        options: ["func", "def", "function", "lambda"],
        correctIndex: 1,
      },
      {
        id: "py-3",
        prompt: "Which of these built-in types is immutable?",
        options: ["list", "dict", "tuple", "set"],
        correctIndex: 2,
      },
      {
        id: "py-4",
        prompt: "What does `len([1, 2, 3])` return?",
        options: ["2", "3", "4", "Error"],
        correctIndex: 1,
      },
    ],
  },
  {
    slug: "dsa-basics",
    name: "Data Structures & Algorithms",
    skillSlug: "data-structures-algorithms",
    type: "mcq",
    durationMinutes: 15,
    description: "Time complexity and the right structure for the job.",
    questions: [
      {
        id: "dsa-1",
        prompt: "What's the time complexity of binary search on a sorted array?",
        options: ["O(n)", "O(log n)", "O(n log n)", "O(1)"],
        correctIndex: 1,
      },
      {
        id: "dsa-2",
        prompt: "Which data structure processes elements in LIFO order?",
        options: ["Queue", "Stack", "Heap", "Array"],
        correctIndex: 1,
      },
      {
        id: "dsa-3",
        prompt: "What's the worst-case time complexity of quicksort?",
        options: ["O(n log n)", "O(n)", "O(n²)", "O(log n)"],
        correctIndex: 2,
      },
      {
        id: "dsa-4",
        prompt: "Which structure gives average constant-time lookups by key?",
        options: ["Array", "Linked list", "Hash map", "Stack"],
        correctIndex: 2,
      },
    ],
  },
  {
    slug: "sql-data-modeling",
    name: "SQL & Data Modeling",
    skillSlug: "sql",
    type: "mcq",
    durationMinutes: 10,
    description: "Query clauses, joins and normalization fundamentals.",
    questions: [
      {
        id: "sql-1",
        prompt: "Which clause filters rows before they're grouped?",
        options: ["HAVING", "WHERE", "GROUP BY", "ORDER BY"],
        correctIndex: 1,
      },
      {
        id: "sql-2",
        prompt: "What does a PRIMARY KEY constraint guarantee?",
        options: [
          "Uniqueness only",
          "NOT NULL only",
          "Uniqueness and NOT NULL",
          "Nothing enforced",
        ],
        correctIndex: 2,
      },
      {
        id: "sql-3",
        prompt: "Which join returns every row from the left table, matched or not?",
        options: ["INNER JOIN", "LEFT JOIN", "RIGHT JOIN", "CROSS JOIN"],
        correctIndex: 1,
      },
      {
        id: "sql-4",
        prompt: "Which normal form eliminates transitive dependencies?",
        options: ["1NF", "2NF", "3NF", "0NF"],
        correctIndex: 2,
      },
    ],
  },
  {
    slug: "system-design-basics",
    name: "System Design Basics",
    skillSlug: "system-design",
    type: "mcq",
    durationMinutes: 15,
    description: "Load balancing, caching and the CAP theorem.",
    questions: [
      {
        id: "sd-1",
        prompt: "What's the primary purpose of a load balancer?",
        options: [
          "Store data persistently",
          "Distribute traffic across servers",
          "Cache responses",
          "Encrypt traffic",
        ],
        correctIndex: 1,
      },
      {
        id: "sd-2",
        prompt:
          "Per the CAP theorem, which three can a distributed system NOT fully guarantee at once?",
        options: [
          "Consistency",
          "Availability",
          "Partition tolerance",
          "All three, simultaneously",
        ],
        correctIndex: 3,
      },
      {
        id: "sd-3",
        prompt: "Which caching strategy writes to the cache and the database at the same time?",
        options: ["Write-through", "Write-back", "Write-around", "Read-through"],
        correctIndex: 0,
      },
      {
        id: "sd-4",
        prompt: "What's a common way to scale reads on a relational database?",
        options: [
          "Vertical partitioning only",
          "Read replicas",
          "Deleting old rows",
          "Disabling indexes",
        ],
        correctIndex: 1,
      },
    ],
  },
];

export function getAssessmentDef(slug: string): AssessmentDef | undefined {
  return ASSESSMENTS_CATALOG.find((a) => a.slug === slug);
}
