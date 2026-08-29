import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  Sparkles,
  FileText,
  Target,
  Radar,
  ClipboardCheck,
  Route as RouteIcon,
  Briefcase,
  Rocket,
  Shield,
  Brain,
  CheckCircle2,
  ArrowRight,
  GraduationCap,
  BarChart3,
  FolderOpen,
  Zap,
} from "lucide-react";

import { getCurrentUser } from "@/lib/server-fns";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WorkLens — AI Career & Skill Intelligence Platform" },
      {
        name: "description",
        content:
          "Understand your skills. Build your career with evidence. AI-powered resume analysis, skill gap detection, job matching, and personalized learning roadmaps for engineering students.",
      },
      { property: "og:title", content: "WorkLens — AI Career Intelligence" },
      {
        property: "og:description",
        content:
          "Upload your resume, analyze job descriptions, discover skill gaps, and get a personalized roadmap to become job-ready.",
      },
    ],
  }),
  beforeLoad: async () => {
    const user = await getCurrentUser();
    if (user) throw redirect({ to: "/app" });
  },
  component: Landing,
});

/* ── Feature data ─────────────────────────────────────────────────────────── */

const FEATURES = [
  {
    icon: Shield,
    title: "Accounts & Authentication",
    description:
      "Email/password sign-up with Argon2id hashing, or sign in with Google, GitHub, or LinkedIn. Session cookies, CSRF protection, login rate-limiting, and account-status gating keep every account secure.",
  },
  {
    icon: GraduationCap,
    title: "Student Profile & Onboarding",
    description:
      "A 5-step onboarding wizard collects your degree, engineering branch, graduation year, career goals, and interests. WorkLens tailors every recommendation to your background — from 20+ engineering branches across all disciplines.",
  },
  {
    icon: FileText,
    title: "AI Resume Intelligence",
    description:
      "Upload a PDF or DOCX. The system validates the file, extracts text, and runs AI analysis that returns structured data: education, skills with evidence tiers, projects, internships, certifications, career signals, and a job-readiness score. Every skill is classified by evidence strength — demonstrated, project-backed, work-backed, mentioned, or inferred.",
  },
  {
    icon: Target,
    title: "Career Discovery & Target Roles",
    description:
      "Browse 30+ career paths organized by domain — Software, Data & AI, Embedded, VLSI, Robotics, and more. Select target roles, set primary goals, and configure preferences for industry, work mode, and location. Career recommendations are grounded in your actual resume evidence.",
  },
  {
    icon: Briefcase,
    title: "Job Requirement Intelligence",
    description:
      "Paste any job description. WorkLens extracts required and preferred skills, normalizes equivalent technologies (React / React.js / ReactJS → one canonical skill), and scores your match against your resume. Analyze multiple jobs to see patterns in what employers actually need.",
  },
  {
    icon: Radar,
    title: "Skill Intelligence & Verified Skills",
    description:
      "Your skills are tracked across multiple evidence sources: resume detection, assessment scores, project work, and course completion. Each skill shows claimed level, verified level, confidence score, and full evidence trail. Skills are grouped by category with searchable filtering and progression history.",
  },
  {
    icon: Zap,
    title: "Skill Gap Engine",
    description:
      "Compares your current skills against your target career's requirements. Each gap is scored by severity (critical / high / medium / low) and priority, factoring in how many analyzed jobs require that skill. Gaps are career-aware — different target roles produce different gap analyses.",
  },
  {
    icon: RouteIcon,
    title: "Personalized Learning Roadmap",
    description:
      "An N-week roadmap generated from your real skill gaps, ordered by impact. Each week targets one gap with learning objectives, practice tasks, and project recommendations. The roadmap adapts as you complete assessments and improve your skill levels.",
  },
  {
    icon: ClipboardCheck,
    title: "Skill Assessments",
    description:
      "8+ assessments covering Python, JavaScript, React, DSA, SQL, System Design, Git, and REST APIs. Server-side grading — correct answers never reach the client. A scored attempt produces a verified skill level that feeds into your skill profile and closes gaps in your roadmap.",
  },
  {
    icon: Rocket,
    title: "Project Recommendations",
    description:
      "AI-matched project ideas based on your skill gaps — recommending work that develops exactly what you're missing. A catalog of 14+ projects across difficulty levels with estimated hours, technologies, and career alignment. Track projects from start to completion with repo URLs and notes.",
  },
  {
    icon: FolderOpen,
    title: "Job Application Tracker",
    description:
      "Track every application from Saved → Applied → Assessment → Interview → Offer. Add notes, advance status, and see pipeline progress at a glance. Stats show total applications, interview count, and offers received.",
  },
  {
    icon: BarChart3,
    title: "Dashboard & Progress Tracking",
    description:
      "Your career readiness score, skill overview, top skill gaps, recent activity feed, and next actions — all on one screen. The dashboard answers: Where am I now? What should I do today? How close am I to my target job?",
  },
];

const HOW_IT_WORKS = [
  {
    step: 1,
    title: "Create Your Profile",
    description: "Sign up, complete onboarding — degree, branch, career goals.",
  },
  {
    step: 2,
    title: "Upload Your Resume",
    description: "AI extracts skills, projects, experience, and career signals.",
  },
  {
    step: 3,
    title: "Analyze Job Descriptions",
    description: "Paste postings — see your match score and required skills.",
  },
  {
    step: 4,
    title: "Discover Your Gaps",
    description: "The skill-gap engine compares you against your target role.",
  },
  {
    step: 5,
    title: "Follow Your Roadmap",
    description: "A personalized plan — weekly topics, projects, assessments.",
  },
  {
    step: 6,
    title: "Track & Improve",
    description: "Complete assessments, build projects, close gaps, re-evaluate.",
  },
];

/* ── Page ─────────────────────────────────────────────────────────────────── */

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--primary)_0%,_transparent_60%)] opacity-10" />
        <div className="relative mx-auto max-w-5xl px-4 pb-20 pt-24 text-center sm:px-6">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/15 text-primary">
            <Sparkles className="size-7" />
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            Understand your skills.{" "}
            <span className="text-signal">Build your career</span> with evidence.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
            WorkLens is an AI-powered career intelligence platform for engineering students. It
            analyzes your resume, measures what you can actually demonstrate, and guides you
            step-by-step toward becoming job-ready.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Get Started Free <ArrowRight className="size-4" />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-xl border border-input px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Sign In
            </Link>
          </div>
        </div>
      </header>

      {/* ── What it does ─────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            What it does
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight">
            A complete career intelligence platform
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            Every feature answers one question: <em>What should this student do next to become
            job-ready?</em>
          </p>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="surface-panel rounded-xl border border-border/70 p-6 transition-colors hover:border-primary/30"
            >
              <div className="grid size-10 place-items-center rounded-lg bg-primary/15 text-primary">
                <Icon className="size-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────── */}
      <section className="border-t border-border bg-card/50">
        <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">
              How it works
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">
              From signup to job-ready in six steps
            </h2>
          </div>

          <ol className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {HOW_IT_WORKS.map(({ step, title, description }) => (
              <li key={step} className="relative">
                <span className="grid size-9 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {step}
                </span>
                <h3 className="mt-3 text-base font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── The loop ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">
          The product loop
        </p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight">
          Analyze → Measure → Learn → Practice → Build → Verify → Improve
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
          WorkLens creates a continuous feedback loop. Every assessment you take, every project you
          complete, and every job you analyze feeds back into your skill profile — making your
          roadmap more precise and your readiness score more accurate over time.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3 text-sm font-medium text-muted-foreground">
          {["Analyze", "Measure", "Learn", "Practice", "Build", "Verify", "Improve"].map(
            (item, i) => (
              <span key={item} className="flex items-center gap-2">
                <span className="rounded-full bg-primary/15 px-3 py-1 text-primary">{item}</span>
                {i < 6 && <ArrowRight className="size-3 text-muted-foreground/50" />}
              </span>
            ),
          )}
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight">
            Start building your career with evidence
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
            Upload your resume, analyze real job postings, and see exactly where you stand — and
            what to do next.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Create Free Account <ArrowRight className="size-4" />
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            No credit card required. Free for students.
          </p>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        <p>WorkLens — AI Career & Skill Intelligence Platform</p>
      </footer>
    </div>
  );
}
