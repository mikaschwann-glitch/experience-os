/**
 * Wave 2 — deterministic free-text → canonical concept mapping.
 *
 * The host writes plain English ("a quiet beach walk away from the crowds"); we map
 * it to the shared canonical vocabulary by keyword / synonym, word-boundary matched.
 * The result feeds the EXISTING grounded matcher unchanged (lib/feasibility/engine.ts).
 *
 * Hard rules (frozen safe model):
 *   - NO LLM classification. Pure, auditable keyword → concept rules.
 *   - We never invent a recommendation: if nothing maps, the host is offered grounded
 *     clarification directions or an immediate custom preparation.
 *   - The host's free text is never stored in events; only concept ids / outcome are
 *     logged so the map's quality can be evaluated later.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  localInsights,
  preparationPlaybookActions,
  propertyCapabilities,
} from "@/db/schema";
import { emitEvent } from "@/lib/events/events";
import type { CanonicalTag } from "@/lib/domain/vocabulary";

// Ordered most-specific-first only matters within a tag; across tags the PRIMARY
// concept is decided by first appearance in the host's text (see mapTextToConcepts).
const SYNONYMS: { tag: CanonicalTag; words: string[] }[] = [
  {
    tag: "quiet",
    words: [
      "quiet", "peaceful", "calm", "tranquil", "serene", "secluded",
      "away from crowds", "away from the crowds", "avoid crowds", "avoid the crowds",
      "crowd-free", "crowded", "crowds", "not busy", "less busy", "off the beaten",
    ],
  },
  {
    tag: "hiking",
    words: [
      "hike", "hiking", "walk", "walks", "walking", "trail", "trails",
      "trek", "trekking", "stroll", "ramble", "footpath", "hillwalking",
    ],
  },
  {
    tag: "nature",
    words: [
      "nature", "outdoors", "outdoor", "scenery", "scenic", "landscape", "park",
      "garden", "wildlife", "forest", "woods", "coast", "coastal", "beach",
      "seaside", "sea", "ocean", "lake", "river", "waterfall", "viewpoint",
    ],
  },
  {
    tag: "food",
    words: [
      "food", "eat", "eating", "dinner", "lunch", "breakfast", "brunch",
      "restaurant", "meal", "meals", "cuisine", "dining", "snack", "treat",
      "welcome basket", "welcome gift", "welcome hamper", "wine", "wine tasting",
      "tasting", "cafe", "coffee", "bakery", "local produce", "picnic",
    ],
  },
  {
    tag: "architecture",
    words: [
      "architecture", "architectural", "historic building", "historical building",
      "historic buildings", "historical buildings", "old town", "buildings",
      "cathedral", "monument", "monuments", "landmark", "landmarks", "ruins",
    ],
  },
  {
    tag: "local_culture",
    words: [
      "culture", "cultural", "local culture", "museum", "museums", "gallery",
      "galleries", "history", "heritage", "tradition", "traditional", "festival",
      "market", "markets", "local life",
    ],
  },
  {
    tag: "design",
    words: ["design", "designer", "interior", "interiors", "aesthetic", "modern design"],
  },
  {
    tag: "craftsmanship",
    words: [
      "craft", "crafts", "craftsmanship", "handmade", "artisan", "pottery",
      "woodwork", "woodcraft", "ceramics", "workshop",
    ],
  },
  {
    tag: "creative_projects",
    words: ["painting", "photography", "photo walk", "sketching", "drawing", "music"],
  },
  {
    tag: "professional_projects",
    words: ["remote work", "co-working", "coworking", "meeting room", "conference", "office space"],
  },
  {
    tag: "travel_preference",
    words: ["day trip", "excursion", "sightseeing", "tour", "guided tour", "itinerary"],
  },
  {
    tag: "sunrise",
    words: ["sunrise", "sunset", "early morning", "dawn", "golden hour"],
  },
  {
    tag: "celebration",
    words: ["celebration", "celebrate", "anniversary", "birthday", "honeymoon", "special occasion", "proposal"],
  },
  {
    tag: "relaxation",
    words: ["relax", "relaxing", "relaxation", "unwind", "spa", "wellness", "rest", "slow down"],
  },
  {
    tag: "adventure",
    words: ["adventure", "adventurous", "thrill", "climbing", "kayak", "kayaking", "cycling", "biking", "surf", "surfing", "zip line"],
  },
  {
    tag: "accessibility",
    words: ["accessible", "accessibility", "wheelchair", "step-free", "step free", "limited mobility", "mobility"],
  },
  {
    tag: "no_alcohol",
    words: ["no alcohol", "alcohol-free", "alcohol free", "non-alcoholic", "without alcohol", "sober"],
  },
  {
    tag: "privacy",
    words: ["privacy", "private", "just us", "just the two of us", "on our own"],
  },
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface ConceptMapping {
  /** Canonical concepts, deduped, ordered by first appearance in the text. */
  concepts: CanonicalTag[];
  /** Every (tag, keyword) hit — for auditing the map's coverage. */
  matched: { tag: CanonicalTag; keyword: string }[];
  /** True when at least one canonical concept was found. */
  confident: boolean;
}

/**
 * Deterministic keyword scan. Word-boundary matched so "walk" never fires on
 * "boardwalk"/"walkway". The first canonical concept to appear in the text wins the
 * primary slot; all matched concepts are passed to the grounded matcher.
 */
export function mapTextToConcepts(text: string): ConceptMapping {
  const hay = (text ?? "").toLowerCase();
  const matched: { tag: CanonicalTag; keyword: string }[] = [];
  const firstIdx = new Map<CanonicalTag, number>();
  for (const { tag, words } of SYNONYMS) {
    for (const w of words) {
      const re = new RegExp(`\\b${escapeRegExp(w.toLowerCase())}\\b`);
      const m = re.exec(hay);
      if (m) {
        if (!firstIdx.has(tag)) firstIdx.set(tag, m.index);
        matched.push({ tag, keyword: w });
      }
    }
  }
  const concepts = [...firstIdx.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([tag]) => tag);
  return { concepts, matched, confident: concepts.length > 0 };
}

// Plain-language directions a host actually understands. Each is offered ONLY when the
// property's active knowledge can support it (see groundedClarifications) — never an
// internal taxonomy grid. "Something else" (custom) is always available in the UI.
const CLARIFICATION_BUCKETS: { label: string; concepts: CanonicalTag[] }[] = [
  { label: "A local outdoor idea", concepts: ["nature", "hiking", "adventure", "sunrise"] },
  { label: "A food or welcome gesture", concepts: ["food", "celebration"] },
  { label: "A cultural or local highlight", concepts: ["local_culture", "architecture", "design", "craftsmanship"] },
  { label: "A calm, relaxing option", concepts: ["quiet", "relaxation", "privacy"] },
];

/**
 * Up to three clarification directions DERIVED FROM REAL grounded data: a bucket is
 * offered only if this property has active knowledge tagged with one of its concepts.
 * Returns [] when nothing is grounded → the UI should allow a custom preparation now.
 */
export async function groundedClarifications(
  tenantId: string,
  propertyId: string,
): Promise<{ label: string; concepts: CanonicalTag[] }[]> {
  const db = getDb();
  const [caps, inss, plays] = await Promise.all([
    db
      .select({ status: propertyCapabilities.status, categoryTags: propertyCapabilities.categoryTags, suitableFor: propertyCapabilities.suitableFor })
      .from(propertyCapabilities)
      .where(and(eq(propertyCapabilities.tenantId, tenantId), eq(propertyCapabilities.propertyId, propertyId))),
    db
      .select({ status: localInsights.status, categoryTags: localInsights.categoryTags, suitableFor: localInsights.suitableFor })
      .from(localInsights)
      .where(and(eq(localInsights.tenantId, tenantId), eq(localInsights.propertyId, propertyId))),
    db
      .select({ status: preparationPlaybookActions.status, suitableFor: preparationPlaybookActions.suitableFor })
      .from(preparationPlaybookActions)
      .where(and(eq(preparationPlaybookActions.tenantId, tenantId), eq(preparationPlaybookActions.propertyId, propertyId))),
  ]);

  const grounded = new Set<string>();
  const add = (v: unknown) => {
    if (Array.isArray(v)) for (const t of v) grounded.add(String(t));
  };
  for (const c of caps) if (c.status === "active") { add(c.categoryTags); add(c.suitableFor); }
  for (const i of inss) if (i.status === "active") { add(i.categoryTags); add(i.suitableFor); }
  for (const p of plays) if (p.status === "active") add(p.suitableFor);

  const out: { label: string; concepts: CanonicalTag[] }[] = [];
  for (const b of CLARIFICATION_BUCKETS) {
    if (b.concepts.some((c) => grounded.has(c))) out.push(b);
    if (out.length >= 3) break;
  }
  return out;
}

/**
 * PII-light audit of mapping quality. Stores concept ids + outcome ONLY — never the
 * host's free text — so the deterministic map can be evaluated and improved later.
 */
export async function logConceptMapping(
  tenantId: string,
  userId: string,
  input: {
    stayId: string;
    concepts: CanonicalTag[];
    outcome: "matched" | "needs_clarification" | "custom";
  },
): Promise<void> {
  await emitEvent(getDb(), {
    tenantId,
    actorUserId: userId,
    type: "concept_mapping.evaluated",
    entityType: "stay",
    entityId: input.stayId,
    payload: {
      outcome: input.outcome,
      conceptCount: input.concepts.length,
      concepts: input.concepts,
    },
  });
}
