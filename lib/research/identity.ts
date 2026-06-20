/**
 * Deterministic identity-confidence model (SIMULATION).
 *
 * Pure, fixture-driven scoring — no external calls, no randomness. Confidence is
 * computed only from simulated metadata signals. Thresholds are explicit so the
 * behavior is reproducible and testable.
 *
 * Scoring (max 100):
 *   full name match        +40   (partial/token overlap +10)
 *   location match         +20
 *   language match         +10
 *   profession/company     +20
 *   explicit identity marker +30  (source explicitly ties to the booking subject)
 *
 * Levels:
 *   high   >= 70  -> may proceed to evidence review / brief
 *   medium 40-69  -> surfaced only as an "uncertain candidate" for host review (NO brief)
 *   low    < 40   -> must NOT create a brief (no-match is a calm, successful outcome)
 *
 * A medium or low match is NEVER treated as a fact.
 */
export const IDENTITY_THRESHOLDS = { high: 70, medium: 40 } as const;

export type ConfidenceLevel = "high" | "medium" | "low";

export interface GuestProfile {
  fullName: string;
  location?: string | null;
  language?: string | null;
  profession?: string | null;
}

export interface CandidateMeta {
  key: string;
  label: string;
  name: string;
  location?: string | null;
  language?: string | null;
  profession?: string | null;
  explicitMarker?: boolean;
}

export interface IdentitySignals {
  nameMatch: "full" | "partial" | "none";
  locationMatch: boolean;
  languageMatch: boolean;
  professionMatch: boolean;
  explicitMarker: boolean;
}

function norm(s?: string | null): string {
  return (s ?? "").trim().toLowerCase();
}

function tokens(s?: string | null): string[] {
  return norm(s).split(/\s+/).filter(Boolean);
}

export function scoreCandidate(
  guest: GuestProfile,
  cand: CandidateMeta,
): { score: number; level: ConfidenceLevel; signals: IdentitySignals } {
  const gName = norm(guest.fullName);
  const cName = norm(cand.name);
  let nameMatch: IdentitySignals["nameMatch"] = "none";
  if (gName && gName === cName) nameMatch = "full";
  else if (tokens(gName).some((t) => tokens(cName).includes(t))) nameMatch = "partial";

  const locationMatch = !!guest.location && norm(guest.location) === norm(cand.location);
  const languageMatch = !!guest.language && norm(guest.language) === norm(cand.language);
  const professionMatch =
    !!guest.profession && norm(guest.profession) === norm(cand.profession);
  const explicitMarker = !!cand.explicitMarker;

  let score = 0;
  if (nameMatch === "full") score += 40;
  else if (nameMatch === "partial") score += 10;
  if (locationMatch) score += 20;
  if (languageMatch) score += 10;
  if (professionMatch) score += 20;
  if (explicitMarker) score += 30;
  score = Math.min(score, 100);

  const level: ConfidenceLevel =
    score >= IDENTITY_THRESHOLDS.high
      ? "high"
      : score >= IDENTITY_THRESHOLDS.medium
        ? "medium"
        : "low";

  return {
    score,
    level,
    signals: { nameMatch, locationMatch, languageMatch, professionMatch, explicitMarker },
  };
}
