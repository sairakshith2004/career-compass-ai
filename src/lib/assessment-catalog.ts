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
  {
    slug: "javascript-fundamentals",
    name: "JavaScript Fundamentals",
    skillSlug: "javascript",
    type: "mcq",
    durationMinutes: 10,
    description: "Closures, promises, and core JS behavior.",
    questions: [
      {
        id: "js-1",
        prompt: "What is the output of `typeof null` in JavaScript?",
        options: ["null", "undefined", "object", "boolean"],
        correctIndex: 2,
      },
      {
        id: "js-2",
        prompt: "Which method creates a new array with elements that pass a test?",
        options: ["map", "filter", "reduce", "forEach"],
        correctIndex: 1,
      },
      {
        id: "js-3",
        prompt: "What does the `===` operator check?",
        options: [
          "Value equality only",
          "Value and type equality",
          "Reference equality only",
          "None of the above",
        ],
        correctIndex: 1,
      },
      {
        id: "js-4",
        prompt: "What is a closure in JavaScript?",
        options: [
          "A function that returns undefined",
          "A function that has access to its outer scope's variables",
          "A way to close browser windows",
          "A loop termination statement",
        ],
        correctIndex: 1,
      },
    ],
  },
  {
    slug: "react-fundamentals",
    name: "React Fundamentals",
    skillSlug: "react",
    type: "mcq",
    durationMinutes: 10,
    description: "Components, hooks, and the React rendering model.",
    questions: [
      {
        id: "react-1",
        prompt: "What hook is used for side effects in functional components?",
        options: ["useState", "useEffect", "useContext", "useReducer"],
        correctIndex: 1,
      },
      {
        id: "react-2",
        prompt: "What should a React component return?",
        options: ["HTML strings", "React elements (JSX)", "DOM nodes directly", "CSS styles"],
        correctIndex: 1,
      },
      {
        id: "react-3",
        prompt: "Why are keys important in React lists?",
        options: [
          "For styling",
          "To help React identify which items changed",
          "For accessibility",
          "They are not important",
        ],
        correctIndex: 1,
      },
      {
        id: "react-4",
        prompt: "What is prop drilling?",
        options: [
          "Passing props through many component layers",
          "Creating new props dynamically",
          "Using context instead of props",
          "A testing technique",
        ],
        correctIndex: 0,
      },
    ],
  },
  {
    slug: "git-fundamentals",
    name: "Git Fundamentals",
    skillSlug: "git",
    type: "mcq",
    durationMinutes: 8,
    description: "Branching, merging, and version control workflows.",
    questions: [
      {
        id: "git-1",
        prompt: "What does `git stash` do?",
        options: [
          "Deletes uncommitted changes",
          "Temporarily saves uncommitted changes",
          "Merges all branches",
          "Creates a new branch",
        ],
        correctIndex: 1,
      },
      {
        id: "git-2",
        prompt: "What's the difference between `git merge` and `git rebase`?",
        options: [
          "They are identical",
          "Rebase rewrites commit history; merge creates a merge commit",
          "Merge is faster",
          "Rebase creates merge commits",
        ],
        correctIndex: 1,
      },
      {
        id: "git-3",
        prompt: "What does `git reset --hard HEAD~1` do?",
        options: [
          "Undoes the last commit and discards changes",
          "Creates a new branch",
          "Pushes to remote",
          "Shows the diff",
        ],
        correctIndex: 0,
      },
      {
        id: "git-4",
        prompt: "What is a pull request?",
        options: [
          "A request to delete a branch",
          "A proposal to merge changes from one branch into another",
          "A way to pull files from the internet",
          "A git command to fetch data",
        ],
        correctIndex: 1,
      },
    ],
  },
  {
    slug: "rest-api-basics",
    name: "REST API Design",
    skillSlug: "rest-apis",
    type: "mcq",
    durationMinutes: 10,
    description: "HTTP methods, status codes, and RESTful design principles.",
    questions: [
      {
        id: "rest-1",
        prompt: "Which HTTP method is used to create a new resource?",
        options: ["GET", "POST", "PUT", "DELETE"],
        correctIndex: 1,
      },
      {
        id: "rest-2",
        prompt: "What does HTTP status code 404 indicate?",
        options: ["Server error", "Unauthorized", "Not found", "Bad request"],
        correctIndex: 2,
      },
      {
        id: "rest-3",
        prompt: "What is the difference between PUT and PATCH?",
        options: [
          "They are the same",
          "PUT replaces the entire resource; PATCH updates partial fields",
          "PATCH is deprecated",
          "PUT is only for creating resources",
        ],
        correctIndex: 1,
      },
      {
        id: "rest-4",
        prompt: 'What makes an API "RESTful"?',
        options: [
          "It uses JSON",
          "It follows REST architectural constraints (stateless, resource-based URLs, etc.)",
          "It runs on port 80",
          "It uses GraphQL",
        ],
        correctIndex: 1,
      },
    ],
  },
];

export function getAssessmentDef(slug: string): AssessmentDef | undefined {
  return ASSESSMENTS_CATALOG.find((a) => a.slug === slug);
}
