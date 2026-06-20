/**
 * Deterministic policy classification (SIMULATION).
 *
 * Every candidate evidence item is classified into exactly one bucket. Only
 * `allowed` items from a high-confidence (confirmed) identity may ever enter a
 * brief. Everything else is recorded for auditability but never shown in a brief.
 *
 * Classification precedence (first match wins):
 *   1. disallowed_source        — source marked disallowed by simulated robots/terms policy → no extraction
 *   2. insufficient_confidence  — identity is not high-confidence → nothing is usable
 *   3. prohibited_sensitive     — category is a blocked/sensitive category
 *   4. allowed                  — category is an explicitly allowed hospitality category
 *   5. irrelevant               — anything else
 */
import type { ConfidenceLevel } from "./identity";
import { TOPIC_CATEGORIES } from "@/lib/domain/vocabulary";

// Evidence is "allowed" when its topic is in the shared canonical vocabulary.
// Sourced from lib/domain/vocabulary.ts so guest evidence, property knowledge,
// and the future feasibility engine all match on the same token set.
export const ALLOWED_CATEGORIES = TOPIC_CATEGORIES;

export const BLOCKED_CATEGORIES = [
  "health",
  "religion",
  "politics",
  "sexuality",
  "finances",
  "family",
  "relationship",
  "personality",
  "private_social",
] as const;

export type EvidenceClassification =
  | "allowed"
  | "prohibited_sensitive"
  | "irrelevant"
  | "disallowed_source"
  | "insufficient_confidence";

export function classifyEvidence(input: {
  category: string;
  sourcePolicy: "allowed" | "disallowed";
  identityLevel: ConfidenceLevel;
}): EvidenceClassification {
  if (input.sourcePolicy === "disallowed") return "disallowed_source";
  if (input.identityLevel !== "high") return "insufficient_confidence";
  if ((BLOCKED_CATEGORIES as readonly string[]).includes(input.category))
    return "prohibited_sensitive";
  if ((ALLOWED_CATEGORIES as readonly string[]).includes(input.category)) return "allowed";
  return "irrelevant";
}

/** Only `allowed` evidence may appear in a brief. */
export function isBriefEligible(classification: EvidenceClassification): boolean {
  return classification === "allowed";
}
