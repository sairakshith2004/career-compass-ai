import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

/**
 * JD Intelligence — AI-powered structured extraction of job description requirements.
 *
 * When a user pastes a job description, this module sends it to Claude for structured
 * extraction. The result is a typed `JDStructuredData` object with skills categorized
 * as mandatory/preferred/optional, education/experience requirements, responsibilities,
 * soft skills, and more.
 *
 * The AI only *classifies* information — it does NOT generate scores. The backend
 * match engine computes scores using transparent, versioned scoring logic.
 *
 * `.server.ts` — server-only. The API key is read from `process.env` only.
 */

const MODEL = process.env["RESUME_AI_MODEL"] ?? "claude-opus-5";
const MAX_JD_CHARS = 30_000;
const REQUEST_TIMEOUT_MS = Number(process.env["RESUME_AI_TIMEOUT_MS"] ?? 60_000);

// --- Structured output schema ------------------------------------------------

const JD_SEVERITY = ["mandatory", "preferred", "optional"] as const;
const JD_CATEGORY = [
  "programming_language",
  "framework",
  "library",
  "database",
  "cloud",
  "devops",
  "tool",
  "concept",
  "soft_skill",
  "other",
] as const;

const JDRequiredSkill = z.object({
  name: z.string().describe("Skill name as commonly understood, e.g. 'React', 'PostgreSQL'"),
  category: z.enum(JD_CATEGORY).describe("Which skill family this belongs to"),
  severity: z
    .enum(JD_SEVERITY)
    .describe(
      "mandatory = explicitly required or deal-breaker; preferred = mentioned as nice-to-have; optional = mentioned but not important",
    ),
});

export const JDExtractionSchema = z.object({
  extractedTitle: z.string().nullable().describe("Job title extracted from the posting"),
  extractedCompany: z.string().nullable().describe("Company name if mentioned"),
  seniority: z
    .enum(["entry", "junior", "mid", "senior", "lead"])
    .nullable()
    .describe("Seniority level inferred from requirements"),
  employmentType: z
    .enum(["full_time", "part_time", "internship", "contract"])
    .nullable()
    .describe("Employment type if mentioned"),
  location: z.string().nullable().describe("Location if mentioned"),
  remote: z.boolean().nullable().describe("Whether remote work is available"),
  requiredSkills: z
    .array(JDRequiredSkill)
    .describe("All skills mentioned, categorized by type and severity"),
  educationRequirements: z
    .array(z.string())
    .describe("Education requirements (e.g. 'BS in CS or equivalent')"),
  experienceRequirements: z
    .array(z.string())
    .describe("Experience requirements (e.g. '3+ years of experience')"),
  responsibilities: z
    .array(z.string())
    .describe("Key responsibilities extracted from the description"),
  softSkills: z.array(z.string()).describe("Soft skills mentioned"),
  certifications: z.array(z.string()).describe("Certifications mentioned"),
  domainKnowledge: z
    .array(z.string())
    .describe("Domain knowledge areas (e.g. 'fintech', 'distributed systems')"),
  summary: z.string().nullable().describe("Brief summary of what the role requires"),
});

export type JDExtraction = z.infer<typeof JDExtractionSchema>;

// --- Errors ----------------------------------------------------------------

export class JDParseError extends Error {
  readonly code: string;
  readonly userMessage: string;
  constructor(code: string, userMessage: string, cause?: unknown) {
    super(`${code}: ${userMessage}`);
    this.name = "JDParseError";
    this.code = code;
    this.userMessage = userMessage;
    if (cause) this.cause = cause;
  }
}

// --- Prompt ----------------------------------------------------------------

const SYSTEM_PROMPT = `You are WorkLens's job description intelligence engine. Your task is to extract structured requirements from a job description posting.

RULES:
1. Extract ONLY what is explicitly stated or strongly implied in the job description.
2. Do NOT invent requirements that aren't mentioned.
3. For skills, classify severity honestly:
   - "mandatory" = explicitly listed as required, must-have, or essential
   - "preferred" = listed as nice-to-have, preferred, or desirable
   - "optional" = mentioned but not weighted (e.g. "familiarity with X is a plus")
4. If a skill is mentioned without explicit priority, classify as "mandatory" for required-sounding language, "preferred" for nice-to-have language.
5. For category, map to: programming_language, framework, library, database, cloud, devops, tool, concept, soft_skill, or other.
6. Extract responsibilities as distinct bullet points.
7. Be thorough — extract every skill mentioned, even if only briefly.
8. Return null/empty when something isn't mentioned — don't guess.`;

// --- The call ----------------------------------------------------------------

export type AnalyzeDeps = {
  parse?: (text: string) => Promise<{
    extraction: JDExtraction | null;
    stopReason: string | null;
    model: string;
    usage: { input: number; output: number } | null;
  }>;
};

export type JDAnalyzeResult = {
  extraction: JDExtraction;
  model: string;
  usage: { input: number; output: number } | null;
};

async function realParse(text: string) {
  const key = process.env["ANTHROPIC_API_KEY"];
  if (!key && !process.env["ANTHROPIC_AUTH_TOKEN"]) {
    throw new JDParseError("not_configured", "AI analysis is not configured.");
  }
  const client = new Anthropic();

  let message;
  try {
    message = await client.messages.parse(
      {
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze the job description below and extract all structured requirements.",
              },
              { type: "text", text: `<job_description>\n${text}\n</job_description>` },
            ],
          },
        ],
        output_config: { format: zodOutputFormat(JDExtractionSchema) },
      },
      { timeout: REQUEST_TIMEOUT_MS },
    );
  } catch (err) {
    if (
      err instanceof Anthropic.APIConnectionTimeoutError ||
      err instanceof Anthropic.APIUserAbortError
    ) {
      throw new JDParseError("timeout", "The analysis took too long. Please try again.", err);
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new JDParseError(
        "rate_limited",
        "The analysis service is busy. Please try again in a minute.",
        err,
      );
    }
    throw new JDParseError(
      "provider_error",
      "The analysis service had a problem. Please try again.",
      err,
    );
  }

  return {
    extraction: message.parsed_output,
    stopReason: message.stop_reason ?? null,
    model: message.model ?? MODEL,
    usage: message.usage
      ? { input: message.usage.input_tokens, output: message.usage.output_tokens }
      : null,
  };
}

/**
 * Analyze a job description text. Throws `JDParseError` on failure.
 * Returns a validated `JDExtraction` with structured requirements.
 */
export async function analyzeJobDescription(
  rawText: string,
  deps: AnalyzeDeps = {},
): Promise<JDAnalyzeResult> {
  const text = rawText.trim().slice(0, MAX_JD_CHARS);
  if (text.length < 30) {
    throw new JDParseError(
      "too_short",
      "Job description is too short. Please paste the full posting.",
    );
  }

  const parse = deps.parse ?? realParse;
  const startedAt = Date.now();

  let parsed: Awaited<ReturnType<NonNullable<AnalyzeDeps["parse"]>>>;
  try {
    parsed = await parse(text);
  } catch (err) {
    if (err instanceof JDParseError) throw err;
    throw new JDParseError(
      "provider_error",
      "The analysis service had a problem. Please try again.",
      err,
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new JDParseError(
      "malformed",
      "The analysis came back in an unexpected shape. Please try again.",
    );
  }

  const { extraction, stopReason, model, usage } = parsed;

  if (stopReason === "refusal") {
    throw new JDParseError(
      "refused",
      "We couldn't analyze that job description. Please try a different one.",
    );
  }
  if (extraction === null) {
    throw new JDParseError(
      "malformed",
      "The analysis came back in an unexpected shape. Please try again.",
    );
  }

  // Second-line validation: even structured output goes through Zod here.
  const validated = JDExtractionSchema.safeParse(extraction);
  if (!validated.success) {
    console.error(
      "[jd-intelligence] schema validation failed:",
      validated.error.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), code: i.code })),
    );
    throw new JDParseError(
      "malformed",
      "The analysis came back in an unexpected shape. Please try again.",
    );
  }

  console.info("[jd-intelligence] extraction ok", {
    chars: text.length,
    durationMs: Date.now() - startedAt,
    model,
    usage,
    skillsExtracted: validated.data.requiredSkills.length,
  });

  return { extraction: validated.data, model, usage };
}

/**
 * Check if the AI provider is actually configured with a usable key.
 */
export function isAIConfigured(): boolean {
  const key = process.env["ANTHROPIC_API_KEY"];
  if (!key && !process.env["ANTHROPIC_AUTH_TOKEN"]) return false;
  if (key && !key.startsWith("sk-ant-")) return false;
  return true;
}
