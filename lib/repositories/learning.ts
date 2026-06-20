import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  feasibilityProposals,
  feasibilityRuns,
  hostActions,
  outcomes,
  propertyLearningDrafts,
  recommendations,
  stays,
} from "@/db/schema";
import { emitEvent } from "@/lib/events/events";
import { sanitizeTags } from "@/lib/domain/vocabulary";
import {
  createCapability,
  createConstraint,
  createLocalInsight,
  createPlaybookAction,
} from "@/lib/repositories/propertyIntelligence";

/**
 * Wave 2D — Outcome → Property Learning Loop repository.
 *
 * Tenant-aware throughout. Capture and promotion never trust a client-supplied
 * tenant or property: the property is RESOLVED server-side from the outcome's
 * provenance chain, and promotion always uses the draft row's own property_id.
 */

export type LearningType = "local_insight" | "constraint" | "capability" | "playbook";
const LEARNING_TYPES: ReadonlySet<string> = new Set([
  "local_insight",
  "constraint",
  "capability",
  "playbook",
]);

export interface CaptureLearningInput {
  learningType: LearningType;
  note: string;
  tags?: string[];
}

/**
 * Resolve the provenance chain + authoritative property for an outcome.
 * Property priority: feasibility proposal's property → the recommendation's stay
 * property → the guest's most recent stay property. Returns null property only
 * when nothing ties the outcome to a property (capture is then refused).
 */
async function resolveOutcomeProvenance(tenantId: string, outcomeId: string) {
  const db = getDb();
  const [outcome] = await db
    .select()
    .from(outcomes)
    .where(and(eq(outcomes.tenantId, tenantId), eq(outcomes.id, outcomeId)))
    .limit(1);
  if (!outcome) throw new Error("Outcome not found for this tenant.");

  let hostActionId: string | null = outcome.hostActionId ?? null;
  let recommendationId: string | null = null;
  let stayId: string | null = null;

  if (hostActionId) {
    const [ha] = await db
      .select({ id: hostActions.id, recommendationId: hostActions.recommendationId })
      .from(hostActions)
      .where(and(eq(hostActions.tenantId, tenantId), eq(hostActions.id, hostActionId)))
      .limit(1);
    hostActionId = ha?.id ?? null;
    recommendationId = ha?.recommendationId ?? null;
  }

  if (recommendationId) {
    const [rec] = await db
      .select({ stayId: recommendations.stayId })
      .from(recommendations)
      .where(and(eq(recommendations.tenantId, tenantId), eq(recommendations.id, recommendationId)))
      .limit(1);
    stayId = rec?.stayId ?? null;
  }

  // A feasibility proposal (if this action came from one) is the strongest source
  // of the property: it was evaluated against exactly that property's knowledge.
  let feasibilityProposalId: string | null = null;
  let briefId: string | null = null;
  let propertyId: string | null = null;
  if (recommendationId) {
    const [prop] = await db
      .select({ id: feasibilityProposals.id, runId: feasibilityProposals.runId, propertyId: feasibilityProposals.propertyId })
      .from(feasibilityProposals)
      .where(
        and(
          eq(feasibilityProposals.tenantId, tenantId),
          eq(feasibilityProposals.recommendationId, recommendationId),
        ),
      )
      .orderBy(desc(feasibilityProposals.updatedAt))
      .limit(1);
    if (prop) {
      feasibilityProposalId = prop.id;
      propertyId = prop.propertyId;
      const [run] = await db
        .select({ briefId: feasibilityRuns.briefId, stayId: feasibilityRuns.stayId })
        .from(feasibilityRuns)
        .where(and(eq(feasibilityRuns.tenantId, tenantId), eq(feasibilityRuns.id, prop.runId)))
        .limit(1);
      briefId = run?.briefId ?? null;
      stayId = stayId ?? run?.stayId ?? null;
    }
  }

  // Resolve the property from the CAUSALLY LINKED stay only (recommendation.stayId
  // or feasibility_run.stayId). We deliberately do NOT fall back to the guest's
  // most recent stay: a repeat guest can have stays at multiple properties, so
  // attaching an older outcome's learning to a newer unrelated stay would be a
  // same-tenant property-scope leak. No causal stay → propertyId stays null →
  // capture is refused upstream. An already-resolved proposal property is kept.
  if (stayId && !propertyId) {
    const [stay] = await db
      .select({ propertyId: stays.propertyId })
      .from(stays)
      .where(and(eq(stays.tenantId, tenantId), eq(stays.id, stayId)))
      .limit(1);
    propertyId = propertyId ?? stay?.propertyId ?? null;
  }

  return {
    outcomeId: outcome.id,
    guestId: outcome.guestId,
    hostActionId,
    recommendationId,
    feasibilityProposalId,
    briefId,
    stayId,
    propertyId,
  };
}

/**
 * Optional, explicit host capture of a property learning from a completed
 * outcome. Creates a DRAFT only — never a Property Intelligence record (that
 * needs explicit promotion). Refuses if no property can be tied to the outcome.
 */
export async function captureLearning(
  tenantId: string,
  userId: string,
  outcomeId: string,
  input: CaptureLearningInput,
) {
  const note = input.note.trim();
  if (!note) throw new Error("A learning note is required.");
  if (!LEARNING_TYPES.has(input.learningType)) throw new Error("Invalid learning type.");

  const prov = await resolveOutcomeProvenance(tenantId, outcomeId);
  if (!prov.propertyId) {
    throw new Error("Cannot capture a learning: no property is associated with this outcome.");
  }

  const db = getDb();
  return db.transaction(async (tx) => {
    const [draft] = await tx
      .insert(propertyLearningDrafts)
      .values({
        tenantId,
        propertyId: prov.propertyId!,
        outcomeId: prov.outcomeId,
        hostActionId: prov.hostActionId,
        recommendationId: prov.recommendationId,
        feasibilityProposalId: prov.feasibilityProposalId,
        briefId: prov.briefId,
        stayId: prov.stayId,
        guestId: prov.guestId,
        learningType: input.learningType,
        // Host-authored freetext only; no research evidence is ever copied here.
        note,
        tags: sanitizeTags(input.tags ?? []),
        status: "draft",
      })
      .returning();

    await emitEvent(tx, {
      tenantId,
      actorUserId: userId,
      type: "learning.draft_created",
      entityType: "property_learning_draft",
      entityId: draft.id,
      payload: {
        propertyId: draft.propertyId,
        learningType: draft.learningType,
        outcomeId: draft.outcomeId,
      },
    });
    return draft;
  });
}

/**
 * Whether an outcome has an authoritative, causally-linked property — i.e.
 * whether capture is allowed. Uses the SAME resolver as captureLearning, so the
 * UI gate and the server-side guarantee can never diverge.
 */
export async function canCaptureLearning(tenantId: string, outcomeId: string): Promise<boolean> {
  const prov = await resolveOutcomeProvenance(tenantId, outcomeId);
  return prov.propertyId != null;
}

/** Open (status='draft') learning drafts for one property — for the PI review area. */
export async function listLearningDrafts(tenantId: string, propertyId: string) {
  const db = getDb();
  return db
    .select()
    .from(propertyLearningDrafts)
    .where(
      and(
        eq(propertyLearningDrafts.tenantId, tenantId),
        eq(propertyLearningDrafts.propertyId, propertyId),
        eq(propertyLearningDrafts.status, "draft"),
      ),
    )
    .orderBy(desc(propertyLearningDrafts.createdAt));
}

/** Per-outcome draft state for a guest (so the guest page can show "captured"). */
export async function listDraftStateForGuest(tenantId: string, guestId: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: propertyLearningDrafts.id,
      outcomeId: propertyLearningDrafts.outcomeId,
      status: propertyLearningDrafts.status,
      learningType: propertyLearningDrafts.learningType,
    })
    .from(propertyLearningDrafts)
    .where(and(eq(propertyLearningDrafts.tenantId, tenantId), eq(propertyLearningDrafts.guestId, guestId)));
  const byOutcome = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (r.outcomeId) byOutcome.set(r.outcomeId, r);
  return byOutcome;
}

async function loadDraft(tenantId: string, draftId: string) {
  const db = getDb();
  const [d] = await db
    .select()
    .from(propertyLearningDrafts)
    .where(and(eq(propertyLearningDrafts.tenantId, tenantId), eq(propertyLearningDrafts.id, draftId)))
    .limit(1);
  return d ?? null;
}

export interface PromoteLearningInput {
  title?: string | null;
  severity?: "soft" | "hard"; // only used when learningType === "constraint"
  ruleType?: "exclusion" | "timing" | "weather" | "mobility" | "suitability" | "partner" | "other";
}

/**
 * Explicitly promote a draft into a property-private Property Intelligence item.
 * Always INSERTS a new PI row (never overwrites/auto-merges an existing one) and
 * uses the draft's own property_id (server-trusted). Idempotent: a non-draft
 * row is refused. Provenance is preserved on the draft (promoted_item_type/id).
 */
export async function promoteLearningDraft(
  tenantId: string,
  userId: string,
  draftId: string,
  input: PromoteLearningInput = {},
) {
  const draft = await loadDraft(tenantId, draftId);
  if (!draft) throw new Error("Learning draft not found for this tenant.");
  if (draft.status !== "draft") throw new Error("Only an open draft can be promoted.");

  const title = (input.title ?? "").trim() || deriveTitle(draft.note);
  const tags = Array.isArray(draft.tags) ? (draft.tags as string[]) : [];

  // Create the intended PI item. Each create fn re-asserts property-in-tenant and
  // sanitizes tags, so a stale/foreign property can never be written.
  let itemId: string;
  let promotedItemType: string;
  switch (draft.learningType as LearningType) {
    case "capability": {
      const row = await createCapability(tenantId, userId, draft.propertyId, {
        title,
        description: draft.note,
        categoryTags: tags,
      });
      itemId = row.id;
      promotedItemType = "capability";
      break;
    }
    case "local_insight": {
      const row = await createLocalInsight(tenantId, userId, draft.propertyId, {
        title,
        description: draft.note,
        categoryTags: tags,
        freshness: "stable",
      });
      itemId = row.id;
      promotedItemType = "local_insight";
      break;
    }
    case "constraint": {
      const row = await createConstraint(tenantId, userId, draft.propertyId, {
        title,
        description: draft.note,
        ruleType: input.ruleType ?? "exclusion",
        severity: input.severity ?? "soft",
        applicabilityTags: tags,
      });
      itemId = row.id;
      promotedItemType = "constraint";
      break;
    }
    case "playbook": {
      const row = await createPlaybookAction(tenantId, userId, draft.propertyId, {
        title,
        description: draft.note,
        suitableFor: tags,
      });
      itemId = row.id;
      promotedItemType = "playbook";
      break;
    }
    default:
      throw new Error("Invalid learning type on draft.");
  }

  const db = getDb();
  const [updated] = await db.transaction(async (tx) => {
    const rows = await tx
      .update(propertyLearningDrafts)
      .set({
        status: "promoted",
        promotedItemType,
        promotedItemId: itemId,
        reviewedByUserId: userId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(propertyLearningDrafts.tenantId, tenantId),
          eq(propertyLearningDrafts.id, draftId),
          eq(propertyLearningDrafts.status, "draft"),
        ),
      )
      .returning();
    await emitEvent(tx, {
      tenantId,
      actorUserId: userId,
      type: "learning.draft_promoted",
      entityType: "property_learning_draft",
      entityId: draftId,
      payload: { propertyId: draft.propertyId, promotedItemType, promotedItemId: itemId },
    });
    return rows;
  });

  return { draft: updated, itemId, promotedItemType };
}

/** Discard a draft — it never becomes Property Intelligence knowledge. */
export async function discardLearningDraft(tenantId: string, userId: string, draftId: string) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(propertyLearningDrafts)
      .set({ status: "discarded", reviewedByUserId: userId, reviewedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(propertyLearningDrafts.tenantId, tenantId),
          eq(propertyLearningDrafts.id, draftId),
          eq(propertyLearningDrafts.status, "draft"),
        ),
      )
      .returning();
    if (!row) throw new Error("Open learning draft not found for this tenant.");
    await emitEvent(tx, {
      tenantId,
      actorUserId: userId,
      type: "learning.draft_discarded",
      entityType: "property_learning_draft",
      entityId: draftId,
      payload: { propertyId: row.propertyId },
    });
    return row;
  });
}

function deriveTitle(note: string): string {
  const oneLine = note.replace(/\s+/g, " ").trim();
  if (oneLine.length <= 72) return oneLine;
  return oneLine.slice(0, 69).trimEnd() + "…";
}
