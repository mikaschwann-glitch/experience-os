/**
 * Wave 2C — Capability-First Feasibility Engine (deterministic, SIMULATION).
 *
 * Given an APPROVED, high-confidence pre-arrival brief + this property's active
 * private knowledge + simulated stay context, it produces 0–3 concrete host
 * preparations — or deliberately withholds. "withhold rather than guess": a
 * clean "no safe recommendation" is a success.
 *
 * Matching uses ONLY the shared canonical vocabulary. Blocked/sensitive evidence
 * never reaches here (the engine reads only allowed, brief-included evidence).
 * No LLM, no live data.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  evidenceItems,
  feasibilityProposalEvidence,
  feasibilityProposals,
  feasibilityRuns,
  guests,
  localInsights,
  prearrivalBriefs,
  preparationPlaybookActions,
  properties,
  propertyCapabilities,
  propertyConstraints,
} from "@/db/schema";
import { emitEvent } from "@/lib/events/events";
import { overlap, tagLabel } from "@/lib/domain/vocabulary";
import { resolveSimContext, type SimContext } from "@/lib/feasibility/context";

const MAX_ACTIONABLE = 3;

type ProposalStatus =
  | "proposed"
  | "requires_confirmation"
  | "withheld";

interface ConstraintCheck {
  constraintId: string;
  title: string;
  severity: "soft" | "hard";
  verdict: "blocked" | "warn";
}

interface Draft {
  title: string;
  description: string | null;
  rationale: string;
  status: ProposalStatus;
  reasonCode: string | null;
  withheldReason: string | null;
  confirmationRequired: boolean;
  freshness: string | null;
  leadTime: string | null;
  hostEffort: "low" | "medium" | "high" | null;
  costLevel: "none" | "low" | "medium" | "high" | null;
  linkedLocalInsightId: string | null;
  linkedCapabilityId: string | null;
  linkedPlaybookActionId: string | null;
  matchedTags: string[];
  constraintsChecked: ConstraintCheck[];
}

export interface EvaluateResult {
  runId: string;
  status: "completed" | "refused";
  refusedReason?: string;
  actionable: number;
  withheld: number;
}

function evaluateConstraints(
  constraints: { id: string; title: string; ruleType: string; severity: "soft" | "hard"; applicabilityTags: unknown }[],
  candidateTags: string[],
  ctx: SimContext,
): { checked: ConstraintCheck[]; hardBlock: ConstraintCheck | undefined; softWarn: boolean } {
  const checked: ConstraintCheck[] = [];
  for (const con of constraints) {
    const tags = Array.isArray(con.applicabilityTags) ? (con.applicabilityTags as string[]) : [];
    const appliesByTag = tags.length === 0 || overlap(tags, candidateTags).length > 0;
    let triggered: boolean;
    if (con.ruleType === "mobility") triggered = ctx.transport === "no_transport";
    else if (con.ruleType === "weather")
      triggered = ctx.weather === "poor" || (con.severity === "soft" && ctx.weather === "uncertain");
    else triggered = true; // timing / exclusion / suitability / partner / other
    if (!appliesByTag || !triggered) continue;
    checked.push({
      constraintId: con.id,
      title: con.title,
      severity: con.severity,
      verdict: con.severity === "hard" ? "blocked" : "warn",
    });
  }
  return {
    checked,
    hardBlock: checked.find((c) => c.verdict === "blocked"),
    softWarn: checked.some((c) => c.verdict === "warn"),
  };
}

function resolveStatus(input: {
  missingCapability?: boolean;
  hardBlock?: ConstraintCheck;
  weatherBlock?: boolean;
  freshness?: string | null;
  softWarn?: boolean;
}): { status: ProposalStatus; reasonCode: string | null; withheldReason: string | null; confirmationRequired: boolean } {
  if (input.missingCapability)
    return { status: "withheld", reasonCode: "missing_capability", withheldReason: "A required capability is not active.", confirmationRequired: false };
  if (input.hardBlock)
    return { status: "withheld", reasonCode: "hard_constraint", withheldReason: `Blocked by rule: ${input.hardBlock.title}.`, confirmationRequired: false };
  if (input.weatherBlock)
    return { status: "withheld", reasonCode: "weather", withheldReason: "Depends on good weather; the simulated weather is not good.", confirmationRequired: false };
  if (input.freshness === "dynamic")
    return { status: "withheld", reasonCode: "dynamic_unconfirmed", withheldReason: "This local knowledge changes often and cannot be confirmed without live data.", confirmationRequired: false };
  if (input.freshness === "verify_before_use" || input.softWarn)
    return { status: "requires_confirmation", reasonCode: input.freshness === "verify_before_use" ? "verify_before_use" : "soft_constraint", withheldReason: null, confirmationRequired: true };
  return { status: "proposed", reasonCode: null, withheldReason: null, confirmationRequired: false };
}

function rationale(matched: string[], insightTitle: string | null, capabilityTitle: string | null, softWarn: boolean): string {
  const parts = [`Matches the guest's interest in ${matched.map(tagLabel).join(", ")}.`];
  if (insightTitle) parts.push(`Grounded in your local note "${insightTitle}".`);
  if (capabilityTitle) parts.push(`Uses your capability "${capabilityTitle}".`);
  if (softWarn) parts.push("A soft house rule applies — confirm before proceeding.");
  return parts.join(" ");
}

export async function evaluateFeasibility(
  tenantId: string,
  userId: string,
  briefId: string,
  propertyId: string,
  override?: Partial<SimContext>,
): Promise<EvaluateResult> {
  const db = getDb();

  const [brief] = await db
    .select()
    .from(prearrivalBriefs)
    .where(and(eq(prearrivalBriefs.tenantId, tenantId), eq(prearrivalBriefs.id, briefId)))
    .limit(1);
  if (!brief) throw new Error("Brief not found for this tenant.");

  // The host evaluates a brief against a chosen property's knowledge. Never trust
  // a client property id: verify it belongs to this tenant.
  const [prop] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.tenantId, tenantId), eq(properties.id, propertyId)))
    .limit(1);
  if (!prop) throw new Error("Property not found for this tenant.");

  const [guest] = await db
    .select()
    .from(guests)
    .where(and(eq(guests.tenantId, tenantId), eq(guests.id, brief.guestId)))
    .limit(1);

  const stayId: string | null = brief.stayId ?? null;
  const ctx = resolveSimContext(guest?.fullName ?? "", override);

  // ---- Preconditions: refuse (record an auditable run) rather than guess ----
  async function refuse(reason: string): Promise<EvaluateResult> {
    const runId = await db.transaction(async (tx) => {
      const [run] = await tx
        .insert(feasibilityRuns)
        .values({
          tenantId,
          propertyId: propertyId,
          guestId: brief.guestId,
          briefId: brief.id,
          jobId: brief.jobId,
          stayId,
          status: "refused",
          refusedReason: reason,
          simContext: ctx,
          triggeredByUserId: userId,
        })
        .returning();
      await emitEvent(tx, {
        tenantId,
        actorUserId: userId,
        type: "feasibility.refused",
        entityType: "feasibility_run",
        entityId: run.id,
        payload: { reason },
      });
      return run.id;
    });
    return { runId, status: "refused", refusedReason: reason, actionable: 0, withheld: 0 };
  }

  if (brief.status !== "approved") return refuse("brief_not_approved");
  if (brief.confidence !== "high") return refuse("low_confidence");

  // ---- Guest topics: ONLY allowed, brief-included evidence (no sensitive leakage) ----
  const evid = await db
    .select()
    .from(evidenceItems)
    .where(and(eq(evidenceItems.tenantId, tenantId), eq(evidenceItems.jobId, brief.jobId)));
  const allowedEvid = evid.filter((e) => e.classification === "allowed" && e.includedInBrief);
  const guestTopics = Array.from(new Set(allowedEvid.map((e) => e.category)));
  const evidenceIdByCategory = new Map<string, string>();
  for (const e of allowedEvid) if (!evidenceIdByCategory.has(e.category)) evidenceIdByCategory.set(e.category, e.id);

  // ---- Active property knowledge ----
  const [caps, insights, playbooks, constraints] = await Promise.all([
    db.select().from(propertyCapabilities).where(and(eq(propertyCapabilities.tenantId, tenantId), eq(propertyCapabilities.propertyId, propertyId))),
    db.select().from(localInsights).where(and(eq(localInsights.tenantId, tenantId), eq(localInsights.propertyId, propertyId))),
    db.select().from(preparationPlaybookActions).where(and(eq(preparationPlaybookActions.tenantId, tenantId), eq(preparationPlaybookActions.propertyId, propertyId))),
    db.select().from(propertyConstraints).where(and(eq(propertyConstraints.tenantId, tenantId), eq(propertyConstraints.propertyId, propertyId), eq(propertyConstraints.active, true))),
  ]);
  const capById = new Map(caps.map((c) => [c.id, c]));
  const activeCaps = caps.filter((c) => c.status === "active");
  const activeInsights = insights.filter((i) => i.status === "active");
  const activePlaybooks = playbooks.filter((p) => p.status === "active");

  const drafts: Draft[] = [];
  const capsUsedByPlaybook = new Set<string>();

  // ---- Generator B: playbooks with a linked capability (also yields missing_capability) ----
  for (const p of activePlaybooks) {
    if (!p.linkedCapabilityId) continue; // playbook suitability is context-only; needs a capability anchor
    const cap = capById.get(p.linkedCapabilityId);
    const capTags = cap ? ((cap.categoryTags as string[]) ?? []) : [];
    const matched = overlap(capTags, guestTopics);
    if (matched.length === 0) continue;
    capsUsedByPlaybook.add(p.linkedCapabilityId);
    const tags = [...capTags, ...((p.suitableFor as string[]) ?? [])];
    const cc = evaluateConstraints(constraints, tags, ctx);
    const missingCapability = !cap || cap.status !== "active";
    const res = resolveStatus({ missingCapability, hardBlock: cc.hardBlock, softWarn: cc.softWarn });
    drafts.push({
      title: `Prepare: ${p.title}`,
      description: p.description,
      rationale: rationale(matched, null, cap?.title ?? null, cc.softWarn),
      status: res.status,
      reasonCode: res.reasonCode,
      withheldReason: res.withheldReason,
      confirmationRequired: res.confirmationRequired,
      freshness: null,
      leadTime: p.leadTime,
      hostEffort: p.hostEffort,
      costLevel: p.costLevel,
      linkedLocalInsightId: null,
      linkedCapabilityId: cap?.id ?? null,
      linkedPlaybookActionId: p.id,
      matchedTags: matched,
      constraintsChecked: cc.checked,
    });
  }

  // ---- Generator A: capability-direct (capability-first core) ----
  for (const c of activeCaps) {
    if (capsUsedByPlaybook.has(c.id)) continue;
    const tags = [...((c.categoryTags as string[]) ?? []), ...((c.suitableFor as string[]) ?? [])];
    const matched = overlap(tags, guestTopics);
    if (matched.length === 0) continue;
    const cc = evaluateConstraints(constraints, tags, ctx);
    const res = resolveStatus({ hardBlock: cc.hardBlock, softWarn: cc.softWarn }); // capabilities: no freshness/weather
    drafts.push({
      title: `Prepare: ${c.title}`,
      description: c.description,
      rationale: rationale(matched, null, c.title, cc.softWarn),
      status: res.status,
      reasonCode: res.reasonCode,
      withheldReason: res.withheldReason,
      confirmationRequired: res.confirmationRequired,
      freshness: null,
      leadTime: c.leadTime,
      hostEffort: c.hostEffort,
      costLevel: c.costLevel,
      linkedLocalInsightId: null,
      linkedCapabilityId: c.id,
      linkedPlaybookActionId: null,
      matchedTags: matched,
      constraintsChecked: cc.checked,
    });
  }

  // ---- Generator C: insight-grounded (the private-knowledge differentiator) ----
  for (const i of activeInsights) {
    const tags = [...((i.categoryTags as string[]) ?? []), ...((i.suitableFor as string[]) ?? [])];
    const matched = overlap(tags, guestTopics);
    if (matched.length === 0) continue;
    const cc = evaluateConstraints(constraints, tags, ctx);
    const weatherBlock =
      typeof i.weatherDependency === "string" && /good/i.test(i.weatherDependency) && ctx.weather !== "good";
    const enabler = activeCaps.find((c) => overlap((c.categoryTags as string[]) ?? [], (i.categoryTags as string[]) ?? []).length > 0);
    const res = resolveStatus({ hardBlock: cc.hardBlock, weatherBlock, freshness: i.freshness, softWarn: cc.softWarn });
    drafts.push({
      title: `Prepare around: ${i.title}`,
      description: i.description,
      rationale: rationale(matched, i.title, enabler?.title ?? null, cc.softWarn),
      status: res.status,
      reasonCode: res.reasonCode,
      withheldReason: res.withheldReason,
      confirmationRequired: res.confirmationRequired,
      freshness: i.freshness,
      leadTime: enabler?.leadTime ?? null,
      hostEffort: i.hostEffort,
      costLevel: enabler?.costLevel ?? null,
      linkedLocalInsightId: i.id,
      linkedCapabilityId: enabler?.id ?? null,
      linkedPlaybookActionId: null,
      matchedTags: matched,
      constraintsChecked: cc.checked,
    });
  }

  // ---- Rank: actionable (proposed before requires_confirmation), cap at 3; keep all withheld ----
  const rank = (d: Draft) => (d.status === "proposed" ? 0 : d.status === "requires_confirmation" ? 1 : 2);
  const actionable = drafts.filter((d) => d.status !== "withheld").sort((a, b) => rank(a) - rank(b)).slice(0, MAX_ACTIONABLE);
  const withheld = drafts.filter((d) => d.status === "withheld");
  const kept = [...actionable, ...withheld];

  const runId = await db.transaction(async (tx) => {
    const [run] = await tx
      .insert(feasibilityRuns)
      .values({
        tenantId,
        propertyId: propertyId,
        guestId: brief.guestId,
        briefId: brief.id,
        jobId: brief.jobId,
        stayId,
        status: "completed",
        simContext: ctx,
        proposalCount: kept.length,
        actionableCount: actionable.length,
        triggeredByUserId: userId,
      })
      .returning();

    for (const d of kept) {
      const [prop] = await tx
        .insert(feasibilityProposals)
        .values({
          tenantId,
          runId: run.id,
          propertyId: propertyId,
          guestId: brief.guestId,
          title: d.title,
          description: d.description,
          rationale: d.rationale,
          status: d.status,
          reasonCode: d.reasonCode,
          withheldReason: d.withheldReason,
          confirmationRequired: d.confirmationRequired,
          freshness: d.freshness,
          priority: rank(d),
          leadTime: d.leadTime,
          hostEffort: d.hostEffort,
          costLevel: d.costLevel,
          linkedLocalInsightId: d.linkedLocalInsightId,
          linkedCapabilityId: d.linkedCapabilityId,
          linkedPlaybookActionId: d.linkedPlaybookActionId,
          matchedTags: d.matchedTags,
          constraintsChecked: d.constraintsChecked,
        })
        .returning();
      // Provenance: link the guest evidence (by matched category) that justified it.
      for (const cat of d.matchedTags) {
        const evId = evidenceIdByCategory.get(cat);
        await tx.insert(feasibilityProposalEvidence).values({
          tenantId,
          proposalId: prop.id,
          evidenceItemId: evId ?? null,
          category: cat,
        });
      }
    }

    await emitEvent(tx, {
      tenantId,
      actorUserId: userId,
      type: "feasibility.evaluated",
      entityType: "feasibility_run",
      entityId: run.id,
      payload: { actionable: actionable.length, withheld: withheld.length, propertyId: propertyId },
    });
    return run.id;
  });

  return { runId, status: "completed", actionable: actionable.length, withheld: withheld.length };
}
