/**
 * Wave 2 completion — deterministic primary-proposal ranking within ONE feasibility run.
 *
 * Pure, no LLM, no invented scores: every criterion reads a field that already exists on
 * a proposal/draft. Given the SAME proposals the SAME order is returned every time.
 *
 * Criteria, in priority order:
 *   1. Validity GATE (freshness)              — a "verify before use" proposal NEVER ranks
 *                                               above a fresh/valid one, so it can only
 *                                               become primary when NO fresh alternative
 *                                               exists. (Expired / inactive sources never
 *                                               reach ranking at all — the engine matches
 *                                               only ACTIVE knowledge, and dynamic-freshness
 *                                               knowledge is withheld, so it is never
 *                                               actionable and never primary.)
 *   2. Coverage of the detected guest need    — matchedTags.length (more is better)
 *   3. Match specificity                       — how concrete the grounding source is:
 *                                               a prepared playbook action > a property
 *                                               capability > a local insight
 *   4. Confirmed property feasibility          — a directly-feasible proposal ranks above
 *                                               one that still requires confirmation
 *   5. Preparation burden                      — lower host effort + cost is better
 *   6. Stable deterministic tie-breaker        — title, then id
 *
 * Note on time-to-arrival: every proposal in one run shares the same stay, so arrival
 * timing does NOT differentiate siblings and is deliberately omitted here.
 *
 * `ambiguous` is true when the top two proposals tie on criteria 1–5 (everything except
 * the arbitrary tie-breaker): there is then no honest "best", and the caller should
 * expose the alternatives immediately rather than pretend one is recommended.
 */

export interface RankableProposal {
  title: string;
  id?: string | null;
  matchedTags?: unknown;
  confirmationRequired?: boolean | null;
  freshness?: string | null;
  hostEffort?: string | null;
  costLevel?: string | null;
  linkedPlaybookActionId?: string | null;
  linkedCapabilityId?: string | null;
  linkedLocalInsightId?: string | null;
}

function coverage(p: RankableProposal): number {
  return Array.isArray(p.matchedTags) ? p.matchedTags.length : 0;
}

function specificityRank(p: RankableProposal): number {
  if (p.linkedPlaybookActionId) return 0; // a concrete prepared action
  if (p.linkedCapabilityId) return 1; // a property capability
  return 2; // local-insight grounded
}

function validityRank(p: RankableProposal): number {
  // Validity GATE. 'dynamic' is withheld upstream and never reaches ranking;
  // 'verify_before_use' is fresh-but-soft and must rank below any truly fresh/valid
  // (null/stable) proposal so it is never primary while a fresh alternative exists.
  return p.freshness === "verify_before_use" ? 1 : 0;
}

function feasibilityRank(p: RankableProposal): number {
  return p.confirmationRequired ? 1 : 0;
}

const EFFORT: Record<string, number> = { low: 1, medium: 2, high: 3 };
const COST: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3 };
function burden(p: RankableProposal): number {
  const e = p.hostEffort ? (EFFORT[p.hostEffort] ?? 2) : 2; // unknown ≈ medium
  const c = p.costLevel ? (COST[p.costLevel] ?? 2) : 2;
  return e + c;
}

/** Criteria 1–5 only (excludes the arbitrary tie-breaker) — used for ambiguity. */
function meaningfulKey(p: RankableProposal): number[] {
  return [
    validityRank(p), // 1. validity gate first: fresh/valid before "verify before use"
    -coverage(p), // 2. negated so ascending sort puts more coverage first
    specificityRank(p), // 3.
    feasibilityRank(p), // 4.
    burden(p), // 5.
  ];
}

function compare(a: RankableProposal, b: RankableProposal): number {
  const ka = meaningfulKey(a);
  const kb = meaningfulKey(b);
  for (let i = 0; i < ka.length; i += 1) {
    if (ka[i] !== kb[i]) return ka[i] - kb[i];
  }
  if (a.title !== b.title) return a.title < b.title ? -1 : 1;
  const ai = a.id ?? "";
  const bi = b.id ?? "";
  return ai < bi ? -1 : ai > bi ? 1 : 0;
}

export function meaningfullyTied(a: RankableProposal, b: RankableProposal): boolean {
  return meaningfulKey(a).join("|") === meaningfulKey(b).join("|");
}

/**
 * Deterministically order proposals best-first and report whether the top two are a
 * meaningful tie. Does not mutate the input.
 */
export function rankProposals<T extends RankableProposal>(
  items: T[],
): { ranked: T[]; ambiguous: boolean } {
  const ranked = [...items].sort(compare);
  const ambiguous = ranked.length >= 2 && meaningfullyTied(ranked[0], ranked[1]);
  return { ranked, ambiguous };
}
