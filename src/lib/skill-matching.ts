import { SKILLS_CATALOG } from "./skills-catalog";

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Scans free text (resume or job description) for mentions of catalog skills and counts
 * them. Keyword-based, not AI extraction: a skill counts as "detected" if its name or any
 * alias appears as a whole token — lookaround boundaries so e.g. "java" doesn't false-match
 * inside "javascript". Mention count is what drives resume skill confidence (see
 * `confidenceFromMentions`) — real signal from the text, not a fabricated per-skill number.
 */
export function countSkillMentions(text: string): Map<string, number> {
  const counts = new Map<string, number>();

  for (const skill of SKILLS_CATALOG) {
    const patterns = [skill.name, ...(skill.aliases ?? [])];
    let total = 0;
    for (const pattern of patterns) {
      const escaped = escapeRegex(pattern);
      const matches = text.match(new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "gi"));
      total += matches?.length ?? 0;
    }
    if (total > 0) counts.set(skill.slug, total);
  }

  return counts;
}

/** Slugs of every catalog skill mentioned at least once in the text. */
export function extractSkillSlugs(text: string): string[] {
  return [...countSkillMentions(text).keys()];
}

/** Maps "mentioned N times" to a 0-100 confidence: one mention is a plausible signal on
 * its own, repeated mentions across a resume push confidence up, capped short of 100
 * since keyword matching alone can't fully verify a skill. */
export function confidenceFromMentions(mentions: number): number {
  return Math.min(95, 50 + (mentions - 1) * 15);
}
