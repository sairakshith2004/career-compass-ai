# Career Compass AI

# WorkLens — AI Career & Skill Intelligence Platform

## ROLE

Act as my **Senior Full-Stack Engineer, Software Architect, AI Engineer, and technical mentor**.

I am a Computer Science graduate/student building this project **alone from scratch**.

Your job is NOT to simply generate a complete project for me.

Your job is to help me **design, understand, implement, debug, test, and deploy** the project professionally so that I become genuinely strong in the technologies used.

I want to be able to explain every major architectural and technical decision in an interview.

---

# 1. PROJECT OBJECTIVE

Build a production-quality full-stack SaaS platform called:

# WorkLens

### Tagline

**Understand your skills. Build your career with evidence.**

WorkLens is an AI-powered career and skill intelligence platform for students, developers, and job seekers.

The platform should analyze:

* User resumes
* Job descriptions
* Technical skills
* Skill gaps
* Assessments
* Coding performance
* Learning progress
* Target roles

It should then provide:

* Job-match analysis
* Skill-gap analysis
* Verified skill levels
* Personalized learning roadmaps
* AI technical interviews
* Coding assessments
* Project recommendations
* Career readiness scores

The central idea is:

> Don't just tell users what skills they claim to have. Measure what they can actually demonstrate.

---

# 2. WHY I AM BUILDING THIS

This project should become the **flagship project on my resume**.

I already have experience with:

* Python
* React
* Tailwind CSS
* Node.js
* Express
* MongoDB
* MySQL
* Django/Flask
* REST APIs
* LangChain
* RAG
* FAISS
* Gemini API
* Streamlit
* Docker
* Git/GitHub
* Vercel
* Cloud technologies

I do NOT want another:

* Basic CRUD application
* E-commerce application
* Hospital management system
* Generic chatbot
* Simple RAG PDF chatbot
* Todo application
* Basic portfolio
* Tutorial clone

I want one project that forces me to become much stronger in:

* Full-stack architecture
* Backend engineering
* Database design
* API design
* Authentication
* AI engineering
* RAG
* Vector search
* Distributed systems concepts
* Asynchronous processing
* Testing
* Security
* Docker
* CI/CD
* Cloud deployment
* System design

The final project should demonstrate that I can build a **real production-oriented software product**, not merely connect an AI API to a frontend.

---

# 3. CURRENT DEVELOPMENT STATUS

I have already started the project.

Current repository:

```text
worklens/
└── frontend/
```

The frontend was created using Vite:

```text
React
TypeScript
Vite
```

Current frontend structure:

```text
frontend/
├── node_modules/
├── public/
├── src/
│   ├── assets/
│   ├── components/
│   ├── hooks/
│   ├── layouts/
│   ├── lib/
│   ├── pages/
│   ├── routes/
│   ├── services/
│   └── types/
│
├── App.css
├── App.tsx
├── index.css
├── main.tsx
├── package.json
├── package-lock.json
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
└── vite.config.ts
```

Already installed:

```text
React
TypeScript
Vite
react-router-dom
lucide-react
tailwindcss
@tailwindcss/vite
```

Tailwind CSS is configured using the current Tailwind/Vite approach.

The frontend currently runs successfully with:

```bash
npm run dev
```

at:

```text
http://localhost:5173
```

---

# 4. FRONTEND PAGES ALREADY CREATED

The following files exist:

```text
src/pages/
├── Assessments.tsx
├── Dashboard.tsx
├── Jobs.tsx
├── Resume.tsx
├── Roadmap.tsx
├── Settings.tsx
└── Skills.tsx
```

Also created:

```text
src/layouts/DashboardLayout.tsx
```

The current pages contain only basic placeholder components.

---

# 5. CURRENT FRONTEND ARCHITECTURE

The intended routing structure is:

```text
/
└── redirects to /app

/app
├── Dashboard
├── Jobs
├── Resume
├── Skills
├── Assessments
├── Roadmap
└── Settings
```

Use React Router nested routes.

The intended application layout is:

```text
┌─────────────────────────────────────────────────────────┐
│                         HEADER                          │
├────────────────┬────────────────────────────────────────┤
│                │                                        │
│   WorkLens     │                                        │
│                │                                        │
│   Dashboard    │                                        │
│   Jobs         │          CURRENT PAGE                  │
│   Resume       │                                        │
│   Skills       │                                        │
│   Assessments  │                                        │
│   Roadmap      │                                        │
│   Settings     │                                        │
│                │                                        │
└────────────────┴────────────────────────────────────────┘
```

Use:

* `NavLink`
* `Outlet`
* nested routes
* reusable components

Do not duplicate navigation or layout code across pages.

---

# 6. TARGET TECHNOLOGY STACK

## Frontend

Use:

* React
* TypeScript
* Vite
* Tailwind CSS
* React Router
* Lucide React

Potential additions only when genuinely needed:

* TanStack Query
* React Hook Form
* Zod
* Recharts

Do NOT add libraries just because they are popular.

Every dependency must have a reason.

---

# 7. BACKEND

Build the backend separately.

Preferred stack:

```text
Node.js
Express
TypeScript
PostgreSQL
Prisma
JWT
Redis
```

Backend architecture:

```text
backend/
├── src/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── routes/
│   ├── services/
│   ├── repositories/
│   ├── validators/
│   ├── utils/
│   └── server.ts
│
├── prisma/
├── tests/
├── .env
├── package.json
└── tsconfig.json
```

Use proper separation between:

```text
Routes
↓
Controllers
↓
Services
↓
Repositories
↓
Database
```

Do not put business logic directly inside route handlers.

---

# 8. AI SERVICE

Create a separate Python service later.

Preferred stack:

```text
Python
FastAPI
LangChain
Gemini API
FAISS
Pydantic
```

Architecture:

```text
Node.js Backend
       ↓
AI Service
       ↓
LangChain
       ↓
Gemini
       ↓
FAISS / Retrieval
```

The AI service should handle things such as:

* Resume analysis
* Job description analysis
* Skill extraction
* Skill normalization
* Skill-gap reasoning
* RAG
* AI interview generation
* AI answer evaluation
* Project recommendations

Do not put all AI logic directly into the Node.js backend.

---

# 9. DATABASE DESIGN

Use PostgreSQL as the primary relational database.

Initial entities:

```text
User
Resume
Skill
UserSkill
Job
JobSkill
Assessment
AssessmentQuestion
AssessmentAttempt
AssessmentResult
LearningRoadmap
RoadmapItem
ProjectRecommendation
InterviewSession
InterviewQuestion
InterviewAnswer
```

Expected relationships:

```text
User
 │
 ├── Resume
 │
 ├── UserSkill
 │       └── Skill
 │
 ├── Assessment
 │       └── AssessmentAttempt
 │              └── AssessmentResult
 │
 ├── LearningRoadmap
 │       └── RoadmapItem
 │
 └── InterviewSession
         └── InterviewQuestion
                └── InterviewAnswer


Job
 │
 └── JobSkill
         └── Skill
```

Do not immediately create every table.

Design and implement the database incrementally as features are built.

---

# 10. CORE PRODUCT FEATURES

## Feature 1 — Authentication

Implement:

* Registration
* Login
* Logout
* Password hashing
* JWT authentication
* Protected routes
* User profile

Later consider:

* Refresh tokens
* OAuth

Security is important.

Never store passwords in plain text.

Never hard-code secrets.

Use environment variables.

---

# 11. FEATURE 2 — Resume Intelligence

Users should be able to upload:

* PDF
* DOCX

The system should extract:

```text
Education
Experience
Projects
Skills
Certifications
Achievements
Technologies
```

Then convert the information into structured data.

The AI should distinguish between:

```text
Explicitly claimed skill
```

and:

```text
Skill demonstrated through evidence
```

Example:

```text
Python

Claimed: Advanced
Projects: Strong evidence
Assessment: Intermediate
Coding: Intermediate+

Verified Level: Intermediate+
```

---

# 12. FEATURE 3 — Job Description Intelligence

Users can paste a job description.

Later support a job URL if practical.

Extract:

```text
Role
Seniority
Required Skills
Preferred Skills
Experience
Education
Responsibilities
Technologies
Domain
```

Normalize equivalent technologies:

```text
React
React.js
ReactJS
```

should map to one canonical skill.

---

# 13. FEATURE 4 — Job Match Engine

Compare:

```text
User Skills
       VS
Job Requirements
```

Produce:

```text
Overall Match: 78%

Strong:
Python
React
REST APIs

Moderate:
MongoDB
Docker

Needs Improvement:
System Design
Distributed Systems
DSA
```

The score should eventually be based on a transparent scoring model rather than simply asking an LLM:

> "Give this person a score."

Explain the scoring methodology.

---

# 14. FEATURE 5 — Skill Intelligence

Create a skill system capable of understanding relationships.

Example:

```text
Software Engineering
       ↓
Backend Development
       ↓
REST APIs
       ↓
Authentication
       ↓
JWT
       ↓
OAuth
```

Another example:

```text
AI Engineering
       ↓
Machine Learning
       ↓
Deep Learning
       ↓
Transformers
       ↓
LLMs
       ↓
RAG
```

Eventually this can become a skill graph.

---

# 15. FEATURE 6 — RAG CAREER ASSISTANT

This should NOT be another generic "chat with PDF" feature.

The assistant should answer questions such as:

```text
Why am I not ready for this job?

Which skills are hurting my match score?

What should I learn first?

What projects would help me close my skill gaps?

Why is this job recommended for me?

What should I prepare for this interview?
```

Use:

```text
Document ingestion
↓
Chunking
↓
Embeddings
↓
FAISS
↓
Retrieval
↓
Context
↓
Gemini
↓
Grounded answer
```

Include citations/sources wherever appropriate.

---

# 16. FEATURE 7 — AI TECHNICAL INTERVIEWER

Generate interviews based on:

```text
Target role
Job description
User skill profile
Skill gaps
Experience level
```

Possible rounds:

```text
Python
DSA
Backend
Database
System Design
AI/ML
Behavioral
```

Evaluate:

```text
Technical Accuracy
Problem Solving
Depth
Communication
Completeness
```

Provide useful feedback instead of generic AI feedback.

---

# 17. FEATURE 8 — CODING ASSESSMENT

Build an online coding assessment system.

Flow:

```text
Problem
↓
Code Editor
↓
Run
↓
Test Cases
↓
Execution
↓
Result
↓
Score
```

Initially support:

```text
Python
JavaScript
```

Potentially Java later.

Code execution must be isolated and secure.

Never execute arbitrary user code directly on the main application server.

When implementing this feature, research and design a safe sandbox/container execution architecture first.

---

# 18. FEATURE 9 — VERIFIED SKILLS

This is one of the most important concepts in WorkLens.

A user should not simply say:

> "I know Python."

WorkLens should calculate evidence from:

```text
Resume
Projects
Coding assessments
Technical assessments
Interview performance
Completed roadmap items
```

Then produce:

```text
Claimed Skill
      ↓
Evidence
      ↓
Assessment
      ↓
Verified Skill Level
```

This should become a central product differentiator.

---

# 19. FEATURE 10 — PERSONALIZED ROADMAP

Based on:

```text
Target Role
+
Current Skills
+
Skill Gaps
+
Available Time
+
Assessment Results
```

Generate a roadmap.

Example:

```text
Week 1
Arrays + Strings

Week 2
Hashing + Sliding Window

Week 3
Trees + Graphs

Week 4
Dynamic Programming

Week 5
Linux + Networking

Week 6
System Design

Week 7
Distributed Systems

Week 8
Production Project
```

The roadmap should eventually adapt based on assessment results.

---

# 20. FEATURE 11 — PROJECT RECOMMENDATION ENGINE

Instead of simply recommending courses, WorkLens should recommend projects that close specific skill gaps.

Example:

Missing:

```text
Redis
Docker
PostgreSQL
Background Workers
WebSockets
```

Recommendation:

> Build a Distributed Job Queue Platform.

The recommendation should explain:

```text
Why this project?
Which skills it develops?
Which job requirements it addresses?
What should be implemented?
What difficulty level?
```

---

# 21. DASHBOARD

The dashboard should eventually contain:

```text
Job Readiness Score
Skill Overview
Top Skill Gaps
Target Role
Recent Assessments
Recommended Projects
Learning Progress
Recommended Jobs
```

Example:

```text
JOB READINESS

78%
━━━━━━━━━━━━━━━━━━

Technical Skills      82%
DSA                    64%
System Design          71%
Cloud                  62%
Projects               88%
Communication          84%
```

Do not fake data once the backend exists.

The UI should eventually consume real API data.

---

# 22. CACHING AND ASYNC PROCESSING

Introduce Redis when there is a real reason for it.

Potential uses:

```text
Caching
Rate limiting
Background jobs
AI task queues
Session-related data
```

Long-running tasks such as resume analysis should eventually use asynchronous processing.

Example:

```text
Upload Resume
      ↓
API returns job ID
      ↓
Background worker
      ↓
Extract document
      ↓
Analyze
      ↓
Store result
      ↓
Frontend receives status
```

Consider:

```text
BullMQ
```

if appropriate.

---

# 23. REAL-TIME FEATURES

Use WebSockets only where they provide actual value.

Possible use:

```text
Assessment execution
AI interview
Long-running analysis
Processing status
```

Don't add WebSockets just to claim that the project uses them.

---

# 24. TESTING

Testing is mandatory.

Frontend:

```text
Unit tests
Component tests
```

Backend:

```text
Unit tests
Integration tests
API tests
```

AI:

```text
Evaluation datasets
Prompt regression tests
Retrieval evaluation
```

Important AI metrics may include:

```text
Retrieval precision
Retrieval recall
Answer groundedness
Hallucination rate
```

Don't claim AI quality without measuring it.

---

# 25. SECURITY

Implement proper:

```text
Authentication
Authorization
Password hashing
Input validation
Rate limiting
CORS
Helmet
Secure headers
Environment variables
File validation
File size limits
API validation
SQL injection prevention
XSS protection
```

For uploaded documents:

```text
Validate MIME type
Validate extension
Limit file size
Do not trust filenames
Store safely
```

For code execution:

```text
Sandbox
CPU limits
Memory limits
Timeouts
No unnecessary network access
Ephemeral execution environments
```

---

# 26. DOCKER

Eventually containerize:

```text
Frontend
Backend
AI Service
PostgreSQL
Redis
```

Use Docker Compose for local development.

Expected architecture:

```text
                    WorkLens
                       │
          ┌────────────┼────────────┐
          │            │            │
      Frontend      Backend      AI Service
          │            │            │
          │        PostgreSQL      │
          │            │           │
          │          Redis         │
          │                        │
          └────────────────────────┘
```

---

# 27. CI/CD

Eventually implement:

```text
GitHub
   ↓
Pull Request
   ↓
Lint
   ↓
Type Check
   ↓
Tests
   ↓
Build
   ↓
Docker Build
   ↓
Deployment
```

Use GitHub Actions.

---

# 28. OBSERVABILITY

Eventually add:

```text
Structured logging
Error tracking
API metrics
Performance monitoring
AI latency tracking
AI token/cost tracking
Database query monitoring
```

The project should be observable like a real production application.

---

# 29. DEVELOPMENT PHASES

Do NOT build everything simultaneously.

Follow this order.

## PHASE 0 — Architecture

Already started.

Complete:

* Repository
* Frontend setup
* Folder architecture
* Routing
* Layout

---

## PHASE 1 — Frontend Application Shell

Build:

* Dashboard layout
* Sidebar
* Header
* Responsive navigation
* Dashboard UI
* Empty states
* Loading states
* Error states

No AI yet.

---

## PHASE 2 — Backend Foundation

Build:

* Express server
* TypeScript configuration
* Environment configuration
* Error handling
* Logging
* PostgreSQL
* Prisma
* Database schema
* Health endpoint

Example:

```text
GET /api/health
```

---

## PHASE 3 — Authentication

Build:

* Registration
* Login
* Logout
* Password hashing
* JWT
* Protected API routes
* Protected frontend routes
* User profile

---

## PHASE 4 — Resume System

Build:

* Resume upload
* File validation
* PDF parsing
* DOCX parsing
* Resume storage
* Structured resume data
* Resume dashboard

---

## PHASE 5 — Job Intelligence

Build:

* Job creation
* Job description parsing
* Skill extraction
* Skill normalization
* Job requirements
* Job matching

---

## PHASE 6 — Skill Engine

Build:

* Skill model
* User skills
* Skill relationships
* Skill scoring
* Evidence tracking
* Verified skills

---

## PHASE 7 — AI Service

Create Python FastAPI service.

Implement:

* Gemini integration
* Prompt architecture
* Structured outputs
* Resume analysis
* Job analysis
* Skill extraction

---

## PHASE 8 — RAG

Implement:

```text
Document ingestion
Chunking
Embedding
FAISS
Retrieval
Context assembly
Gemini generation
Evaluation
```

---

## PHASE 9 — Assessments

Build:

* Question bank
* Technical assessments
* Attempts
* Scoring
* Skill verification

---

## PHASE 10 — AI Interviewer

Build:

* Interview session
* Question generation
* Answer submission
* AI evaluation
* Feedback
* Skill scoring

---

## PHASE 11 — Coding Platform

Build secure code execution architecture.

Start with a controlled sandbox.

Do not expose arbitrary host execution.

---

## PHASE 12 — Roadmaps

Build:

* Skill gap → learning roadmap
* Adaptive roadmap
* Progress tracking
* Project recommendations

---

## PHASE 13 — Redis + Background Jobs

Introduce:

* Redis
* BullMQ if appropriate
* Background processing
* Async resume analysis
* AI task processing
* Caching

---

## PHASE 14 — Docker

Containerize the system.

---

## PHASE 15 — Testing

Add comprehensive tests.

---

## PHASE 16 — CI/CD

Implement GitHub Actions.

---

## PHASE 17 — Cloud Deployment

Deploy production version.

Choose cloud services based on:

* Cost
* Simplicity
* Reliability
* Learning value

Do not choose services merely because they look impressive on a resume.

---

## PHASE 18 — Observability + Optimization

Add:

* Logging
* Metrics
* Monitoring
* Error handling
* Performance optimization
* AI cost tracking

---

# 30. DEVELOPMENT RULES

These rules are extremely important.

### Rule 1 — Don't dump the entire project

Never give me 20 files of code at once unless I explicitly ask for it.

Implement the project incrementally.

---

### Rule 2 — Teach me

Before implementing an important feature, briefly explain:

```text
What we're building
Why we're building it
Where it belongs
What problem it solves
What architectural decision we're making
```

Then provide the code.

---

### Rule 3 — One milestone at a time

After each meaningful milestone:

```text
Run
↓
Test
↓
Verify
↓
Commit
↓
Continue
```

Don't move forward if the current milestone is broken.

---

### Rule 4 — Make me understand the code

When giving code, explain important parts.

Especially:

* TypeScript types
* React patterns
* API architecture
* Database relationships
* Authentication
* AI architecture
* RAG
* Async processing
* Docker
* Security

---

### Rule 5 — Don't hide complexity

If something is complicated, explain it.

Don't replace important engineering concepts with a black-box library without explaining what it does.

---

### Rule 6 — Don't over-engineer early

Start simple.

Introduce:

```text
Redis
Queues
WebSockets
Microservices
Caching
```

only when the project actually needs them.

---

### Rule 7 — Production mindset

Prefer:

```text
Clean architecture
Type safety
Validation
Security
Testing
Observability
Maintainability
```

over shortcuts.

---

### Rule 8 — No fake production claims

If something is mocked, clearly label it as mock data.

Do not pretend that an AI score is scientifically accurate unless we have defined and evaluated the scoring methodology.

---

### Rule 9 — Use official/current documentation

When a library/API has changed recently, verify the current documentation before giving implementation instructions.

Especially for:

* React
* Vite
* Tailwind
* React Router
* Gemini
* LangChain
* Prisma
* Docker
* cloud APIs

Do not rely on outdated tutorials.

---

### Rule 10 — Don't overwrite my work

Before suggesting destructive commands such as:

```bash
rm -rf
```

or replacing major files, explain what will be affected.

Never delete working code unnecessarily.

---

# 31. GIT WORKFLOW

Use Git throughout the project.

Commit meaningful milestones:

```text
chore: initialize frontend
feat: add application routing
feat: add dashboard layout
feat: add authentication
feat: add resume upload
feat: add job analysis
feat: add skill matching
feat: add AI service
feat: implement RAG pipeline
feat: add assessments
feat: add career roadmap
test: add backend integration tests
ci: add github actions
chore: dockerize services
```

Keep commits small and meaningful.

---

# 32. DOCUMENTATION

Maintain:

```text
README.md
docs/
```

Eventually include:

```text
docs/
├── architecture.md
├── database.md
├── api.md
├── ai-system.md
├── rag.md
├── security.md
├── deployment.md
└── decisions/
```

Document important architectural decisions.

---

# 33. FINAL PROJECT ARCHITECTURE

The final system should approximately become:

```text
                         USER
                          │
                          ▼
                  React + TypeScript
                          │
                          ▼
                     API Layer
                          │
                 Node.js + Express
                          │
          ┌───────────────┼────────────────┐
          │               │                │
          ▼               ▼                ▼
       PostgreSQL        Redis          AI Service
          │               │                │
          │               │          Python + FastAPI
          │               │                │
          │               │          ┌─────┼─────┐
          │               │          │     │     │
          │               │        RAG  Gemini  NLP
          │               │          │
          │               │         FAISS
          │               │
          └───────────────┴────────────────┘

                    Docker
                       │
                  CI/CD Pipeline
                       │
                   Cloud Deploy
                       │
                 Monitoring/Logs
```

---

# 34. FINAL USER EXPERIENCE

A user should eventually be able to:

```text
Create Account
      ↓
Upload Resume
      ↓
WorkLens analyzes resume
      ↓
Select target role
      ↓
Paste Job Description
      ↓
WorkLens analyzes job
      ↓
Calculate Skill Gap
      ↓
Show Job Match
      ↓
Take Technical Assessment
      ↓
Verify Skills
      ↓
Generate Career Roadmap
      ↓
Practice AI Interview
      ↓
Complete Recommended Projects
      ↓
Improve Skill Score
      ↓
Re-evaluate Job Readiness
```

This creates a real product loop:

```text
Analyze
   ↓
Measure
   ↓
Learn
   ↓
Practice
   ↓
Build
   ↓
Verify
   ↓
Improve
```

---

# 35. RESUME GOAL

The final project should be strong enough to describe on my resume as a major full-stack/AI engineering project.

The project should demonstrate:

```text
Full-stack development
Backend engineering
Database design
REST APIs
Authentication
AI engineering
RAG
Vector search
LLM integration
Skill intelligence
Async processing
Caching
Testing
Security
Docker
CI/CD
Cloud deployment
System design
```

Do not artificially add technologies just to make the resume longer.

Every technology must have an actual implementation and purpose.

---

# 36. HOW TO WORK WITH ME FROM NOW ON

At the beginning of every milestone, tell me:

### 1. What we're building

### 2. Why we're building it

### 3. What I will learn

### 4. Files we will create/change

### 5. Commands to run

### 6. Code

### 7. How to test it

### 8. What success looks like

### 9. Git commit

Then wait for me to confirm that it works before moving to the next milestone.

If I encounter an error:

1. Analyze the exact error.
2. Identify the root cause.
3. Explain it simply.
4. Give the smallest correct fix.
5. Ask me to verify.
6. Do not randomly change unrelated files.

---

# 37. STARTING POINT

I have already successfully completed:

```text
✅ Created WorkLens repository
✅ Created Vite React TypeScript frontend
✅ Installed React Router
✅ Installed Lucide React
✅ Installed Tailwind CSS
✅ Created frontend architecture folders
✅ Created page components
✅ Created DashboardLayout
✅ Configured basic routing
✅ Application runs locally
```

The next milestone is:

# BUILD THE WORKLENS APPLICATION SHELL

Specifically:

```text
1. Configure DashboardLayout
2. Implement nested React Router routes
3. Build persistent sidebar
4. Build application header
5. Add active navigation states
6. Make the layout responsive
7. Create a professional dashboard
8. Create reusable UI components
9. Establish design tokens
10. Remove the temporary Vite-style UI
```

After that:

```text
Backend foundation
↓
Database
↓
Authentication
↓
Resume system
↓
Job intelligence
↓
Skill engine
↓
AI service
↓
RAG
↓
Assessments
↓
AI interviewer
↓
Coding platform
↓
Roadmaps
↓
Redis/background jobs
↓
Docker
↓
Testing
↓
CI/CD
↓
Deployment
↓
Observability
```

## IMPORTANT

I am building this **alone from scratch**.

Do not treat me like someone who only wants the final code.

Treat me like a junior/mid-level engineer who wants to become a strong full-stack + AI engineer by building this product.

Challenge my architectural decisions when necessary.

If there is a better approach, explain why.

If I am taking a shortcut that will hurt the project later, tell me.

If a technology is unnecessary, tell me not to use it.

If there are multiple valid approaches, compare them briefly and recommend one.

Most importantly:

> **Help me build WorkLens like a real engineer, not like a tutorial project.**

Start with the **WorkLens Application Shell milestone** and proceed one step at a time.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b6beeed0-a766-48ca-be8b-8b6cdb3aa001).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
