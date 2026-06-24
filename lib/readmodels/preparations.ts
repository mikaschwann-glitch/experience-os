import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  feasibilityProposals,
  feasibilityRuns,
  guests,
  hostActions,
  recommendations,
  stays,
  units,
} from "@/db/schema";

/**
 * Wave 1B — PreparationWorkItem read model.
 *
 * A unified, tenant-safe PROJECTION (never a source-of-truth table) over the three
 * source classes, with explicit source authority so a Suggested item never renders
 * simultaneously with its created Planned item:
 *   - Suggested  ← feasibility_proposals (proposed | requires_confirmation), OR a
 *                  bare stay-bound pending recommendation with no host_action.
 *   - Planned/Prepared/Cancelled ← host_actions (not archived, stay-bound).
 * Authority is enforced by status, not by existence: a confirmed proposal moves to
 * 'converted_to_host_action' (excluded here) and surfaces only as its host_action;
 * a bare pending recommendation is excluded once it has a host_action.
 *
 * Tenant-safe by construction: EVERY branch constrains tenant_id on every joined
 * table — never a post-union filter.
 */

// Host-facing kinds. Wave 2 split: 'prepared' (host marked it ready) AND legacy 'done'
// (outcome-logged) both surface honestly as "Completed" — neither is shown as actionable.
// 'planned' is the only created-and-still-actionable state.
export type PreparationKind = "suggested" | "planned" | "completed" | "cancelled";

export interface PreparationWorkItem {
  /** Host-facing id of THIS projection (proposal/recommendation/host_action id). */
  id: string;
  kind: PreparationKind;
  /** True when it needs the host's decision/action now (suggested or planned). */
  actionable: boolean;
  sourceType: "feasibility_proposal" | "recommendation" | "host_action";
  sourceId: string;
  stayId: string;
  /** Stay arrival date (yyyy-mm-dd) — the deterministic ordering key. */
  stayStart: string;
  guestId: string;
  guestName: string;
  propertyId: string | null;
  /** The home/unit the stay is in (for "what · for whom · where"). */
  unitName: string | null;
  title: string;
  /** The concrete "what to do" line shown on the work page. */
  description: string | null;
  why: string | null;
  /** Explicit due timestamp only; null => "Before arrival" (no fake precision). */
  dueAt: Date | null;
  /** For a Suggested proposal: the feasibility run that is the decision surface. */
  runId: string | null;
}

function fromHostActionStatus(status: string): { kind: PreparationKind; actionable: boolean } {
  if (status === "planned") return { kind: "planned", actionable: true };
  if (status === "cancelled") return { kind: "cancelled", actionable: false };
  // 'prepared' (host marked ready) and 'done' (legacy outcome-logged) are both
  // truthfully "Completed" and no longer need the host's attention.
  return { kind: "completed", actionable: false };
}

export async function listPreparationWorkItems(
  tenantId: string,
  filter: { guestId?: string } = {},
): Promise<PreparationWorkItem[]> {
  const db = getDb();
  const items: PreparationWorkItem[] = [];

  // --- Created: host_actions (not archived, stay-bound) ---
  const created = await db
    .select({
      id: hostActions.id,
      status: hostActions.status,
      title: hostActions.title,
      description: hostActions.description,
      dueAt: hostActions.dueAt,
      stayId: hostActions.stayId,
      guestId: hostActions.guestId,
      guestName: guests.fullName,
      stayStart: stays.startDate,
      propertyId: stays.propertyId,
      unitName: units.name,
      why: recommendations.rationale,
    })
    .from(hostActions)
    .innerJoin(recommendations, eq(recommendations.id, hostActions.recommendationId))
    .innerJoin(stays, eq(stays.id, hostActions.stayId))
    .leftJoin(units, eq(units.id, stays.unitId))
    .innerJoin(guests, eq(guests.id, hostActions.guestId))
    .where(
      and(
        eq(hostActions.tenantId, tenantId),
        eq(recommendations.tenantId, tenantId),
        eq(stays.tenantId, tenantId),
        eq(guests.tenantId, tenantId),
        isNull(hostActions.archivedAt),
        isNotNull(hostActions.stayId),
        filter.guestId ? eq(hostActions.guestId, filter.guestId) : undefined,
      ),
    );
  for (const r of created) {
    const { kind, actionable } = fromHostActionStatus(r.status);
    items.push({
      id: r.id,
      kind,
      actionable,
      sourceType: "host_action",
      sourceId: r.id,
      stayId: r.stayId as string,
      stayStart: r.stayStart,
      guestId: r.guestId,
      guestName: r.guestName,
      propertyId: r.propertyId,
      unitName: r.unitName,
      title: r.title,
      description: r.description,
      why: r.why,
      dueAt: r.dueAt,
      runId: null,
    });
  }

  // --- Suggested: feasibility proposals not yet converted, not withheld ---
  const suggested = await db
    .select({
      id: feasibilityProposals.id,
      title: feasibilityProposals.title,
      description: feasibilityProposals.description,
      why: feasibilityProposals.rationale,
      guestId: feasibilityProposals.guestId,
      guestName: guests.fullName,
      stayId: feasibilityRuns.stayId,
      stayStart: stays.startDate,
      propertyId: stays.propertyId,
      unitName: units.name,
      runId: feasibilityRuns.id,
    })
    .from(feasibilityProposals)
    .innerJoin(feasibilityRuns, eq(feasibilityRuns.id, feasibilityProposals.runId))
    .innerJoin(stays, eq(stays.id, feasibilityRuns.stayId))
    .leftJoin(units, eq(units.id, stays.unitId))
    .innerJoin(guests, eq(guests.id, feasibilityProposals.guestId))
    .where(
      and(
        eq(feasibilityProposals.tenantId, tenantId),
        eq(feasibilityRuns.tenantId, tenantId),
        eq(stays.tenantId, tenantId),
        eq(guests.tenantId, tenantId),
        inArray(feasibilityProposals.status, ["proposed", "requires_confirmation"]),
        isNotNull(feasibilityRuns.stayId),
        filter.guestId ? eq(feasibilityProposals.guestId, filter.guestId) : undefined,
      ),
    );
  for (const r of suggested) {
    items.push({
      id: r.id,
      kind: "suggested",
      actionable: true,
      sourceType: "feasibility_proposal",
      sourceId: r.id,
      stayId: r.stayId as string,
      stayStart: r.stayStart,
      guestId: r.guestId,
      guestName: r.guestName,
      propertyId: r.propertyId,
      unitName: r.unitName,
      title: r.title,
      description: r.description,
      why: r.why,
      dueAt: null,
      runId: r.runId,
    });
  }

  // --- Suggested: bare stay-bound pending recommendations with no host_action ---
  const bare = await db
    .select({
      id: recommendations.id,
      title: recommendations.title,
      description: recommendations.description,
      why: recommendations.rationale,
      guestId: recommendations.guestId,
      guestName: guests.fullName,
      stayId: recommendations.stayId,
      stayStart: stays.startDate,
      propertyId: stays.propertyId,
      unitName: units.name,
    })
    .from(recommendations)
    .innerJoin(stays, eq(stays.id, recommendations.stayId))
    .leftJoin(units, eq(units.id, stays.unitId))
    .innerJoin(guests, eq(guests.id, recommendations.guestId))
    // Tenant_id explicit on the LEFT JOIN too (safe by FK uniqueness, but the union's
    // invariant is: EVERY joined table is tenant-constrained, never by transitivity).
    .leftJoin(
      hostActions,
      and(eq(hostActions.recommendationId, recommendations.id), eq(hostActions.tenantId, tenantId)),
    )
    .where(
      and(
        eq(recommendations.tenantId, tenantId),
        eq(stays.tenantId, tenantId),
        eq(guests.tenantId, tenantId),
        eq(recommendations.status, "pending"),
        isNotNull(recommendations.stayId),
        isNull(hostActions.id),
        filter.guestId ? eq(recommendations.guestId, filter.guestId) : undefined,
      ),
    );
  for (const r of bare) {
    items.push({
      id: r.id,
      kind: "suggested",
      actionable: true,
      sourceType: "recommendation",
      sourceId: r.id,
      stayId: r.stayId as string,
      stayStart: r.stayStart,
      guestId: r.guestId,
      guestName: r.guestName,
      propertyId: r.propertyId,
      unitName: r.unitName,
      title: r.title,
      description: r.description,
      why: r.why,
      dueAt: null,
      runId: null,
    });
  }

  // Deterministic order: time-to-stay (arrival date) ascending.
  items.sort((a, b) => (a.stayStart < b.stayStart ? -1 : a.stayStart > b.stayStart ? 1 : 0));
  return items;
}

/** A single Preparation by host_action id (the detail surface). */
export async function getPreparationWorkItem(
  tenantId: string,
  preparationId: string,
): Promise<PreparationWorkItem | null> {
  const all = await listPreparationWorkItems(tenantId);
  return all.find((i) => i.sourceType === "host_action" && i.id === preparationId) ?? null;
}

/**
 * Wave 2 completion — the alternatives considered for THIS preparation's request: the
 * sibling proposals from the same feasibility run that were set aside when this one was
 * chosen. Auditable + non-actionable; surfaced only here (never on Today / Suggested).
 * Returns null for fallback-originated or unrelated preparations.
 */
export async function getOtherIdeasConsidered(
  tenantId: string,
  preparationId: string,
): Promise<{ runId: string; siblings: { id: string; title: string }[] } | null> {
  const db = getDb();
  const [ha] = await db
    .select({ recommendationId: hostActions.recommendationId })
    .from(hostActions)
    .where(and(eq(hostActions.tenantId, tenantId), eq(hostActions.id, preparationId)))
    .limit(1);
  if (!ha?.recommendationId) return null;

  const [chosen] = await db
    .select({ runId: feasibilityProposals.runId })
    .from(feasibilityProposals)
    .where(
      and(
        eq(feasibilityProposals.tenantId, tenantId),
        eq(feasibilityProposals.recommendationId, ha.recommendationId),
      ),
    )
    .limit(1);
  if (!chosen) return null;

  const siblings = await db
    .select({ id: feasibilityProposals.id, title: feasibilityProposals.title })
    .from(feasibilityProposals)
    .where(
      and(
        eq(feasibilityProposals.tenantId, tenantId),
        eq(feasibilityProposals.runId, chosen.runId),
        eq(feasibilityProposals.status, "superseded"),
      ),
    );
  if (siblings.length === 0) return null;
  return { runId: chosen.runId, siblings };
}

/** Needs-attention = actionable PreparationWorkItems only (never stay context). */
export function needsAttentionCount(items: PreparationWorkItem[]): number {
  return items.filter((i) => i.actionable).length;
}
