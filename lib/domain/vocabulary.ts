/**
 * Canonical domain vocabulary — the SINGLE source of truth for matchable tags.
 *
 * Reused by:
 *  - Wave 2A evidence classification (lib/research/policy.ts → ALLOWED_CATEGORIES)
 *  - Property Intelligence (capabilities / local insights / playbook / constraints)
 *  - the future Feasibility Engine (Wave 2C) for guest ↔ property matching
 *
 * Why this matters: the engine can only match guest interests/preferences to a
 * property's capabilities and local insights if BOTH sides draw from the same,
 * validated token set. Free-form string tags would silently break matching.
 *
 * Two axes:
 *  - TOPIC_CATEGORIES: subject/interest areas ("what it is about")
 *  - CONTEXT_TAGS: preference/suitability qualifiers ("who/when it suits")
 */

// Subject/interest areas. The first 10 are the Wave 2A evidence categories
// (kept identical in meaning so Research Lab behavior is unchanged).
export const TOPIC_CATEGORIES = [
  "architecture",
  "design",
  "craftsmanship",
  "nature",
  "hiking",
  "food",
  "local_culture",
  "creative_projects",
  "professional_projects",
  "travel_preference",
] as const;

// Preference / suitability qualifiers used for suitable-for / unsuitable-for.
export const CONTEXT_TAGS = [
  "quiet",
  "sunrise",
  "celebration",
  "relaxation",
  "adventure",
  "accessibility",
  "no_alcohol",
  "privacy",
] as const;

export const CANONICAL_TAGS = [...TOPIC_CATEGORIES, ...CONTEXT_TAGS] as const;

export type TopicCategory = (typeof TOPIC_CATEGORIES)[number];
export type ContextTag = (typeof CONTEXT_TAGS)[number];
export type CanonicalTag = (typeof CANONICAL_TAGS)[number];

const TOPIC_SET = new Set<string>(TOPIC_CATEGORIES);
const CONTEXT_SET = new Set<string>(CONTEXT_TAGS);
const ALL_SET = new Set<string>(CANONICAL_TAGS);

export function isTopicCategory(v: string): v is TopicCategory {
  return TOPIC_SET.has(v);
}
export function isContextTag(v: string): v is ContextTag {
  return CONTEXT_SET.has(v);
}
export function isCanonicalTag(v: string): v is CanonicalTag {
  return ALL_SET.has(v);
}

/** Keep only valid canonical tags from raw input (drops anything unrecognized). */
export function sanitizeTags(values: string[]): CanonicalTag[] {
  const seen = new Set<string>();
  const out: CanonicalTag[] = [];
  for (const v of values) {
    const t = v.trim();
    if (isCanonicalTag(t) && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/** Human-friendly label for a tag (UI only). */
export function tagLabel(tag: string): string {
  return tag.replace(/_/g, " ");
}

/** Canonical tags present in both sets — the basis for feasibility matching. */
export function overlap(a: unknown, b: unknown): CanonicalTag[] {
  const setB = new Set((Array.isArray(b) ? b : []).map(String));
  const out: CanonicalTag[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(a) ? a : []) {
    const t = String(raw);
    if (isCanonicalTag(t) && setB.has(t) && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}
