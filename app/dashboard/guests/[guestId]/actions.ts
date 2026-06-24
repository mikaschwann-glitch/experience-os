"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { stays } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/devAuth";
import {
  createInsightFromSignal,
  createSignal,
  logOutcome,
  setRecommendationStatus,
} from "@/lib/repositories/slice";
import { evaluateFirstPartyFeasibility } from "@/lib/feasibility/engine";
import { captureLearning, type LearningType } from "@/lib/repositories/learning";
import { logConceptMapping, mapTextToConcepts } from "@/lib/domain/conceptMapping";
import { sanitizeTags } from "@/lib/domain/vocabulary";

/**
 * Server actions for the manual vertical slice. Each one resolves tenant/user
 * from the server-side dev-auth stub (never trusts the client) and delegates to
 * the tenant-aware repository, then revalidates the affected views.
 */
function revalidateGuest(guestId: string) {
  revalidatePath(`/dashboard/guests/${guestId}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/recommendations");
}

export async function createSignalAction(guestId: string, formData: FormData) {
  const { tenantId, userId } = await getAuthContext();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;
  await createSignal(tenantId, userId, { guestId, body });
  revalidateGuest(guestId);
}

export async function createInsightAction(
  signalId: string,
  guestId: string,
  formData: FormData,
) {
  const { tenantId, userId } = await getAuthContext();
  const summary = String(formData.get("summary") ?? "").trim();
  if (!summary) return;
  await createInsightFromSignal(tenantId, userId, signalId, { summary });
  revalidateGuest(guestId);
}

export async function acceptRecommendationAction(
  recommendationId: string,
  guestId: string,
) {
  const { tenantId, userId } = await getAuthContext();
  await setRecommendationStatus(tenantId, userId, recommendationId, "accepted");
  revalidateGuest(guestId);
}

export async function dismissRecommendationAction(
  recommendationId: string,
  guestId: string,
) {
  const { tenantId, userId } = await getAuthContext();
  await setRecommendationStatus(tenantId, userId, recommendationId, "dismissed");
  revalidateGuest(guestId);
}

export async function logOutcomeAction(
  hostActionId: string,
  guestId: string,
  formData: FormData,
) {
  const { tenantId, userId } = await getAuthContext();
  const result = String(formData.get("result") ?? "unknown") as
    | "positive"
    | "neutral"
    | "negative"
    | "unknown";
  const notes = String(formData.get("notes") ?? "").trim();
  await logOutcome(tenantId, userId, hostActionId, { result, notes: notes || null });
  revalidateGuest(guestId);
}

/**
 * Wave 2D — optional property-learning capture from a completed outcome.
 * The no-learning path is simply an empty note: no draft is created. Property is
 * resolved server-side from the outcome's provenance (never sent by the client);
 * this only ever creates a DRAFT, never a Property Intelligence record.
 */
const LEARNING_TYPES = ["local_insight", "constraint", "capability", "playbook"] as const;
export async function captureLearningAction(
  outcomeId: string,
  guestId: string,
  formData: FormData,
) {
  const { tenantId, userId } = await getAuthContext();
  const note = String(formData.get("note") ?? "").trim();
  if (!note) return; // no-learning path → nothing is stored
  const raw = String(formData.get("learningType") ?? "local_insight");
  const learningType = (LEARNING_TYPES as readonly string[]).includes(raw)
    ? (raw as LearningType)
    : "local_insight";
  const tags = formData.getAll("tags").map(String);
  await captureLearning(tenantId, userId, outcomeId, { learningType, note, tags });
  revalidateGuest(guestId);
  revalidatePath("/dashboard/property-intelligence");
}

/**
 * Wave 2 — "Prepare for this stay". The host writes plain English describing what
 * would help the guest; we map it DETERMINISTICALLY to canonical concepts (no LLM,
 * no taxonomy grid) and run the existing grounded matcher. Tenant/guest/stay/property
 * are resolved + checked server-side; the free text is stored as the source signal
 * (never classified, never sent to an LLM). No external research, no consent gate.
 */
export async function planPreparationAction(guestId: string, formData: FormData) {
  const { tenantId, userId } = await getAuthContext();
  const stayId = String(formData.get("stayId") ?? "").trim();
  if (!stayId) return;
  const triggerSource =
    String(formData.get("triggerSource") ?? "host_noted") === "guest_stated"
      ? "guest_stated"
      : "host_noted";
  const note = String(formData.get("note") ?? "").trim();
  if (!note) return;

  // Reject cross-tenant / mismatched guest·stay·property before recording anything.
  const db = getDb();
  const [stay] = await db
    .select({ id: stays.id, guestId: stays.guestId, propertyId: stays.propertyId })
    .from(stays)
    .where(and(eq(stays.tenantId, tenantId), eq(stays.id, stayId)))
    .limit(1);
  if (!stay || stay.guestId !== guestId || !stay.propertyId) return;

  // Store the host note / guest request as the source signal (first-party, unparsed).
  const sig = await createSignal(tenantId, userId, { guestId, stayId, body: note });

  // Deterministic free text -> canonical concepts. We NEVER invent a recommendation:
  // an empty mapping yields a withholding run, where the host gets grounded directions
  // or an immediate custom preparation. PII-light: only concept ids / outcome logged.
  const { concepts, confident } = mapTextToConcepts(note);
  await logConceptMapping(tenantId, userId, {
    stayId,
    concepts,
    outcome: confident ? "matched" : "needs_clarification",
  });

  const result = await evaluateFirstPartyFeasibility(tenantId, userId, {
    stayId,
    topics: concepts,
    triggerSource,
    sourceSignalId: sig.id,
    guestId,
  });
  redirect(`/dashboard/feasibility/${result.runId}`);
}

/**
 * Wave 2 — pick a grounded clarification direction. Re-runs the matcher for the SAME
 * stay with the chosen bucket's canonical concepts (sanitised server-side). Used when
 * the first attempt withheld and the host nudges toward what the property can support.
 */
export async function refinePreparationAction(
  guestId: string,
  stayId: string,
  conceptsCsv: string,
) {
  const { tenantId, userId } = await getAuthContext();
  const concepts = sanitizeTags(conceptsCsv.split(","));
  if (concepts.length === 0) return;

  const db = getDb();
  const [stay] = await db
    .select({ id: stays.id, guestId: stays.guestId, propertyId: stays.propertyId })
    .from(stays)
    .where(and(eq(stays.tenantId, tenantId), eq(stays.id, stayId)))
    .limit(1);
  if (!stay || stay.guestId !== guestId || !stay.propertyId) return;

  await logConceptMapping(tenantId, userId, { stayId, concepts, outcome: "matched" });
  const result = await evaluateFirstPartyFeasibility(tenantId, userId, {
    stayId,
    topics: concepts,
    triggerSource: "host_noted",
    sourceSignalId: null,
    guestId,
  });
  redirect(`/dashboard/feasibility/${result.runId}`);
}
