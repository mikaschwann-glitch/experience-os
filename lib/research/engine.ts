/**
 * Pre-Arrival Intelligence — simulation engine (SIMULATION ONLY).
 *
 * Deterministic, fixture-driven. No external/web/LLM calls. Tenant-aware: every
 * read/write is scoped by tenantId. Each run is wrapped in a single transaction
 * so domain writes and their PII-light lifecycle events commit/roll back together
 * (consistent with the Run 1 event system).
 *
 * Hard gates enforced here:
 *  - no active consent            -> no research job (refusal event + incident)
 *  - withdrawn consent            -> abort job + delete generated artifacts + events
 *  - identity not high-confidence -> no brief (medium = uncertain only; low = no-match)
 *  - prohibited/ disallowed/ irrelevant evidence -> never enters a brief; content not retained
 *  - every brief item links to an evidence item; every brief carries a confidence
 */
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  consentGrants,
  evidenceItems,
  guests,
  identityCandidates,
  policyIncidents,
  prearrivalBriefs,
  briefItems,
  researchJobs,
  researchSources,
  stays,
} from "@/db/schema";
import { emitEvent } from "@/lib/events/events";
import { scoreCandidate } from "@/lib/research/identity";
import { classifyEvidence } from "@/lib/research/policy";
import type { SubjectFixture } from "@/lib/research/fixtures";

const PREP_TEXT: Record<string, string> = {
  architecture: "Leave a short note on the cabin's architecture and local timber.",
  design: "Set out a few quiet design-led touches in the cabin.",
  craftsmanship: "Prepare a small handwritten note about a local craftsperson.",
  nature: "Suggest a quiet nature spot away from the busier trails.",
  hiking: "Mark a quiet sunrise hiking/coastal route on the map.",
  food: "Prepare a small local food welcome (check dietary notes first).",
  local_culture: "Leave a short guide to a low-key local cultural spot.",
  creative_project: "Acknowledge their creative work discreetly in the welcome note.",
  professional_project: "Keep the welcome understated and professional.",
  travel_preference: "Honour the stated travel preference in the room setup.",
};

function briefText(category: string, excerpt: string, actionable: boolean): string {
  if (actionable) return PREP_TEXT[category] ?? `Prepare something thoughtful around: ${category}.`;
  return `Context: ${excerpt}`;
}

export interface RunResult {
  guestId: string;
  guestName: string;
  refused: boolean;
  jobId?: string;
  briefId?: string;
  status?: string;
  identityLevel?: "high" | "medium" | "low";
}

export async function getGuestByName(tenantId: string, fullName: string) {
  const db = getDb();
  const [g] = await db
    .select()
    .from(guests)
    .where(and(eq(guests.tenantId, tenantId), eq(guests.fullName, fullName)))
    .limit(1);
  return g ?? null;
}

export async function getActiveConsent(tenantId: string, guestId: string) {
  const db = getDb();
  const [c] = await db
    .select()
    .from(consentGrants)
    .where(and(eq(consentGrants.tenantId, tenantId), eq(consentGrants.guestId, guestId)))
    .orderBy(desc(consentGrants.createdAt))
    .limit(1);
  return c ?? null;
}

export async function runSubject(
  tenantId: string,
  userId: string,
  scenarioKey: string,
  subject: SubjectFixture,
): Promise<RunResult> {
  const db = getDb();
  const guest = await getGuestByName(tenantId, subject.profile.fullName);
  if (!guest) {
    return { guestId: "", guestName: subject.profile.fullName, refused: true };
  }

  const consent = await getActiveConsent(tenantId, guest.id);
  const granted = consent?.status === "granted";

  // ---- Gate: no active consent -> no research job ----
  if (!granted) {
    await db.transaction(async (tx) => {
      await tx.insert(policyIncidents).values({
        tenantId,
        jobId: null,
        guestId: guest.id,
        kind: "no_consent_refused",
        detail: consent?.status === "withdrawn" ? "consent withdrawn" : "no consent on record",
      });
      await emitEvent(tx, {
        tenantId,
        actorUserId: userId,
        type: "research.refused",
        entityType: "guest",
        entityId: guest.id,
        payload: { reason: consent?.status === "withdrawn" ? "consent_withdrawn" : "no_consent" },
      });
    });
    return { guestId: guest.id, guestName: guest.fullName, refused: true };
  }

  const [latestStay] = await db
    .select({ id: stays.id })
    .from(stays)
    .where(and(eq(stays.tenantId, tenantId), eq(stays.guestId, guest.id)))
    .orderBy(desc(stays.startDate))
    .limit(1);

  return db.transaction(async (tx) => {
    const [job] = await tx
      .insert(researchJobs)
      .values({
        tenantId,
        guestId: guest.id,
        stayId: latestStay?.id ?? null,
        consentGrantId: consent?.id ?? null,
        scenarioKey,
        status: "running",
        triggeredByUserId: userId,
        startedAt: new Date(),
      })
      .returning();
    const jobId = job.id;

    await emitEvent(tx, {
      tenantId,
      actorUserId: userId,
      type: "research.started",
      entityType: "research_job",
      entityId: jobId,
      correlationId: jobId,
      payload: { scenarioKey },
    });

    // ---- Sources (excerpt omitted for disallowed sources) ----
    const sourceIdByKey = new Map<string, string>();
    for (const s of subject.sources) {
      const [row] = await tx
        .insert(researchSources)
        .values({
          tenantId,
          jobId,
          guestId: guest.id,
          fixtureSourceKey: s.key,
          kind: s.kind,
          title: s.title,
          url: s.url,
          policyStatus: s.policy,
          excerpt: s.policy === "disallowed" ? null : s.excerpt,
        })
        .returning();
      sourceIdByKey.set(s.key, row.id);
      if (s.policy === "disallowed") {
        await tx.insert(policyIncidents).values({
          tenantId,
          jobId,
          guestId: guest.id,
          kind: "disallowed_source_refused",
          detail: s.title,
        });
        await emitEvent(tx, {
          tenantId,
          actorUserId: userId,
          type: "policy.blocked",
          entityType: "research_source",
          entityId: row.id,
          correlationId: jobId,
          payload: { reason: "disallowed_source" },
        });
      }
    }

    // ---- Identity candidates ----
    let best: { id: string; score: number; level: "high" | "medium" | "low" } | null = null;
    for (const c of subject.candidates) {
      const { score, level, signals } = scoreCandidate(subject.profile, c);
      const [row] = await tx
        .insert(identityCandidates)
        .values({
          tenantId,
          jobId,
          guestId: guest.id,
          fixtureCandidateKey: c.key,
          label: c.label,
          score,
          level,
          resolution: "pending",
          signals,
        })
        .returning();
      if (!best || score > best.score) best = { id: row.id, score, level };
    }
    const identityLevel = best?.level ?? "low";

    if (best) {
      // High confidence may proceed (confirmed); medium/low stay pending (never a fact).
      await tx
        .update(identityCandidates)
        .set({ resolution: identityLevel === "high" ? "confirmed" : "pending" })
        .where(and(eq(identityCandidates.tenantId, tenantId), eq(identityCandidates.id, best.id)));
      await tx
        .update(researchJobs)
        .set({ bestCandidateId: best.id })
        .where(and(eq(researchJobs.tenantId, tenantId), eq(researchJobs.id, jobId)));
      await emitEvent(tx, {
        tenantId,
        actorUserId: userId,
        type: "identity.resolved",
        entityType: "research_job",
        entityId: jobId,
        correlationId: jobId,
        payload: { level: identityLevel, score: best.score },
      });
    }

    // ---- Evidence classification (content retained only for allowed items) ----
    const allowedEvidence: { id: string; category: string; excerpt: string; actionable: boolean }[] = [];
    let prohibitedCount = 0;
    for (const e of subject.evidence) {
      const sourceId = sourceIdByKey.get(e.sourceKey) ?? null;
      const sourcePolicy =
        subject.sources.find((s) => s.key === e.sourceKey)?.policy ?? "allowed";
      const classification = classifyEvidence({ category: e.category, sourcePolicy, identityLevel });
      const retain = classification === "allowed";
      const [row] = await tx
        .insert(evidenceItems)
        .values({
          tenantId,
          jobId,
          sourceId,
          candidateId: best?.id ?? null,
          category: e.category,
          excerpt: retain ? e.excerpt : null,
          classification,
          actionable: e.actionable,
          includedInBrief: false,
        })
        .returning();
      if (classification === "allowed") {
        allowedEvidence.push({ id: row.id, category: e.category, excerpt: e.excerpt, actionable: e.actionable });
      } else if (classification === "prohibited_sensitive") {
        prohibitedCount += 1;
        await tx.insert(policyIncidents).values({
          tenantId,
          jobId,
          guestId: guest.id,
          kind: "prohibited_sensitive_blocked",
          detail: e.category,
        });
        await emitEvent(tx, {
          tenantId,
          actorUserId: userId,
          type: "policy.blocked",
          entityType: "evidence_item",
          entityId: row.id,
          correlationId: jobId,
          payload: { reason: "prohibited_sensitive", category: e.category },
        });
      }
    }

    // ---- Brief decision ----
    let briefId: string | undefined;
    let status: "needs_review" | "completed";

    if (identityLevel === "high" && allowedEvidence.length > 0) {
      const [brief] = await tx
        .insert(prearrivalBriefs)
        .values({
          tenantId,
          guestId: guest.id,
          stayId: latestStay?.id ?? null,
          jobId,
          status: "draft",
          confidence: "high",
        })
        .returning();
      briefId = brief.id;
      for (const ev of allowedEvidence) {
        await tx.insert(briefItems).values({
          tenantId,
          briefId: brief.id,
          evidenceItemId: ev.id,
          kind: ev.actionable ? "preparation" : "context",
          text: briefText(ev.category, ev.excerpt, ev.actionable),
        });
        await tx
          .update(evidenceItems)
          .set({ includedInBrief: true })
          .where(and(eq(evidenceItems.tenantId, tenantId), eq(evidenceItems.id, ev.id)));
      }
      status = "needs_review";
      await emitEvent(tx, {
        tenantId,
        actorUserId: userId,
        type: "brief.created",
        entityType: "prearrival_brief",
        entityId: brief.id,
        correlationId: jobId,
        payload: { items: allowedEvidence.length, confidence: "high", blocked: prohibitedCount },
      });
    } else if (identityLevel === "medium") {
      status = "needs_review"; // uncertain candidate surfaced for host review; no brief
      await tx.insert(policyIncidents).values({
        tenantId,
        jobId,
        guestId: guest.id,
        kind: "false_match_uncertain",
        detail: "medium-confidence identity; not treated as fact",
      });
    } else {
      status = "completed"; // low / none / no allowed evidence -> calm no-match
      await tx.insert(policyIncidents).values({
        tenantId,
        jobId,
        guestId: guest.id,
        kind: identityLevel === "low" ? "no_match" : "low_confidence_no_brief",
        detail: "no reliable identity / no usable evidence",
      });
    }

    await tx
      .update(researchJobs)
      .set({ status, briefId: briefId ?? null, finishedAt: new Date() })
      .where(and(eq(researchJobs.tenantId, tenantId), eq(researchJobs.id, jobId)));

    await emitEvent(tx, {
      tenantId,
      actorUserId: userId,
      type: status === "needs_review" ? "research.needs_review" : "research.completed",
      entityType: "research_job",
      entityId: jobId,
      correlationId: jobId,
      payload: { brief: !!briefId, identityLevel },
    });

    return {
      guestId: guest.id,
      guestName: guest.fullName,
      refused: false,
      jobId,
      briefId,
      status,
      identityLevel,
    };
  });
}

/**
 * Consent withdrawal: aborts jobs, REVOKES briefs, and DELETES generated content
 * artifacts (sources/candidates/evidence/brief items) for the guest. Leaves
 * tombstones (aborted job, revoked brief) + incidents + events as an audit trail.
 */
export async function withdrawConsent(tenantId: string, userId: string, guestId: string) {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx
      .update(consentGrants)
      .set({ status: "withdrawn", withdrawnAt: new Date(), updatedAt: new Date() })
      .where(and(eq(consentGrants.tenantId, tenantId), eq(consentGrants.guestId, guestId)));

    await emitEvent(tx, {
      tenantId,
      actorUserId: userId,
      type: "consent.withdrawn",
      entityType: "guest",
      entityId: guestId,
      payload: {},
    });

    const jobs = await tx
      .select({ id: researchJobs.id })
      .from(researchJobs)
      .where(and(eq(researchJobs.tenantId, tenantId), eq(researchJobs.guestId, guestId)));

    for (const j of jobs) {
      const briefs = await tx
        .select({ id: prearrivalBriefs.id })
        .from(prearrivalBriefs)
        .where(and(eq(prearrivalBriefs.tenantId, tenantId), eq(prearrivalBriefs.jobId, j.id)));

      for (const b of briefs) {
        await tx
          .delete(briefItems)
          .where(and(eq(briefItems.tenantId, tenantId), eq(briefItems.briefId, b.id)));
        await tx
          .update(prearrivalBriefs)
          .set({ status: "revoked", updatedAt: new Date() })
          .where(and(eq(prearrivalBriefs.tenantId, tenantId), eq(prearrivalBriefs.id, b.id)));
        await emitEvent(tx, {
          tenantId,
          actorUserId: userId,
          type: "brief.revoked",
          entityType: "prearrival_brief",
          entityId: b.id,
          correlationId: j.id,
          payload: {},
        });
      }

      // Delete the retained content artifacts for this job.
      await tx.delete(evidenceItems).where(and(eq(evidenceItems.tenantId, tenantId), eq(evidenceItems.jobId, j.id)));
      await tx.delete(identityCandidates).where(and(eq(identityCandidates.tenantId, tenantId), eq(identityCandidates.jobId, j.id)));
      await tx.delete(researchSources).where(and(eq(researchSources.tenantId, tenantId), eq(researchSources.jobId, j.id)));

      await tx
        .update(researchJobs)
        .set({ status: "aborted", abortReason: "consent_withdrawn", briefId: null, finishedAt: new Date() })
        .where(and(eq(researchJobs.tenantId, tenantId), eq(researchJobs.id, j.id)));

      await tx.insert(policyIncidents).values({
        tenantId,
        jobId: j.id,
        guestId,
        kind: "consent_withdrawn_abort",
        detail: "consent withdrawn — artifacts deleted",
      });

      await emitEvent(tx, {
        tenantId,
        actorUserId: userId,
        type: "research.aborted",
        entityType: "research_job",
        entityId: j.id,
        correlationId: j.id,
        payload: { reason: "consent_withdrawn" },
      });
      await emitEvent(tx, {
        tenantId,
        actorUserId: userId,
        type: "research.deleted",
        entityType: "research_job",
        entityId: j.id,
        correlationId: j.id,
        payload: {},
      });
    }

    return { jobsAborted: jobs.length };
  });
}

const STATUS_EVENT = {
  approved: "brief.approved",
  rejected: "brief.rejected",
  edited: "brief.edited",
  not_useful: "brief.not_useful",
} as const;

export async function reviewBrief(
  tenantId: string,
  userId: string,
  briefId: string,
  status: "approved" | "rejected" | "edited" | "not_useful",
  hostNote?: string | null,
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [brief] = await tx
      .update(prearrivalBriefs)
      .set({ status, hostNote: hostNote ?? null, reviewedByUserId: userId, reviewedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(prearrivalBriefs.tenantId, tenantId), eq(prearrivalBriefs.id, briefId)))
      .returning();
    if (!brief) throw new Error("Brief not found for tenant.");

    await tx
      .update(researchJobs)
      .set({ status: "completed", updatedAt: new Date() })
      .where(and(eq(researchJobs.tenantId, tenantId), eq(researchJobs.id, brief.jobId)));

    await emitEvent(tx, {
      tenantId,
      actorUserId: userId,
      type: STATUS_EVENT[status],
      entityType: "prearrival_brief",
      entityId: brief.id,
      correlationId: brief.jobId,
      payload: { status },
    });
    return brief;
  });
}
