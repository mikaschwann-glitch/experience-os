import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  consentGrants,
  evidenceItems,
  events,
  guests,
  identityCandidates,
  policyIncidents,
  prearrivalBriefs,
  briefItems,
  researchJobs,
  researchSources,
} from "@/db/schema";
import { SCENARIOS } from "@/lib/research/fixtures";

/** Tenant-aware reads for the simulation lab. Pages never touch Drizzle directly. */

export async function listLabScenarios(tenantId: string) {
  const db = getDb();
  const [guestRows, consentRows, jobRows] = await Promise.all([
    db.select().from(guests).where(eq(guests.tenantId, tenantId)),
    db
      .select()
      .from(consentGrants)
      .where(eq(consentGrants.tenantId, tenantId))
      .orderBy(desc(consentGrants.createdAt)),
    db
      .select()
      .from(researchJobs)
      .where(eq(researchJobs.tenantId, tenantId))
      .orderBy(desc(researchJobs.createdAt)),
  ]);

  const guestByName = new Map(guestRows.map((g) => [g.fullName, g]));
  const consentByGuest = new Map<string, (typeof consentRows)[number]>();
  for (const c of consentRows) if (!consentByGuest.has(c.guestId)) consentByGuest.set(c.guestId, c);
  const latestJobByGuest = new Map<string, (typeof jobRows)[number]>();
  for (const j of jobRows) if (!latestJobByGuest.has(j.guestId)) latestJobByGuest.set(j.guestId, j);

  return SCENARIOS.map((s) => ({
    key: s.key,
    title: s.title,
    description: s.description,
    subjects: s.subjects.map((subject) => {
      const guest = guestByName.get(subject.profile.fullName) ?? null;
      const consent = guest ? consentByGuest.get(guest.id) ?? null : null;
      const latestJob = guest ? latestJobByGuest.get(guest.id) ?? null : null;
      return {
        fullName: subject.profile.fullName,
        guestId: guest?.id ?? null,
        consentStatus: consent ? consent.status : "none",
        latestJob: latestJob
          ? { id: latestJob.id, status: latestJob.status, briefId: latestJob.briefId }
          : null,
      };
    }),
  }));
}

export async function getJobDetail(tenantId: string, jobId: string) {
  const db = getDb();
  const [job] = await db
    .select()
    .from(researchJobs)
    .where(and(eq(researchJobs.tenantId, tenantId), eq(researchJobs.id, jobId)))
    .limit(1);
  if (!job) return null;

  const [[guest], sources, candidates, evidence, briefRows, incidents, timeline] =
    await Promise.all([
      db.select().from(guests).where(and(eq(guests.tenantId, tenantId), eq(guests.id, job.guestId))).limit(1),
      db.select().from(researchSources).where(and(eq(researchSources.tenantId, tenantId), eq(researchSources.jobId, jobId))),
      db
        .select()
        .from(identityCandidates)
        .where(and(eq(identityCandidates.tenantId, tenantId), eq(identityCandidates.jobId, jobId)))
        .orderBy(desc(identityCandidates.score)),
      db.select().from(evidenceItems).where(and(eq(evidenceItems.tenantId, tenantId), eq(evidenceItems.jobId, jobId))),
      db
        .select()
        .from(prearrivalBriefs)
        .where(and(eq(prearrivalBriefs.tenantId, tenantId), eq(prearrivalBriefs.jobId, jobId)))
        .orderBy(desc(prearrivalBriefs.createdAt)),
      db.select().from(policyIncidents).where(and(eq(policyIncidents.tenantId, tenantId), eq(policyIncidents.jobId, jobId))),
      db
        .select()
        .from(events)
        .where(and(eq(events.tenantId, tenantId), eq(events.correlationId, jobId)))
        .orderBy(desc(events.occurredAt)),
    ]);

  const brief = briefRows[0] ?? null;
  const items = brief
    ? await db
        .select()
        .from(briefItems)
        .where(and(eq(briefItems.tenantId, tenantId), eq(briefItems.briefId, brief.id)))
        .orderBy(briefItems.createdAt)
    : [];

  return { job, guest: guest ?? null, sources, candidates, evidence, brief, briefItems: items, incidents, timeline };
}
