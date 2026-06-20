/**
 * Reproducible verification for the Pre-Arrival Intelligence Simulation Lab.
 * Runs the deterministic engine against the seeded fixtures and asserts the
 * required safety/correctness outcomes. Requires `npm run db:seed` first.
 * Run with: npm run verify:research
 */
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  briefItems,
  evidenceItems,
  events,
  identityCandidates,
  policyIncidents,
  prearrivalBriefs,
  researchJobs,
  researchSources,
} from "@/db/schema";
import { getAuthContext } from "@/lib/auth/devAuth";
import { getScenario } from "@/lib/research/fixtures";
import { getGuestByName, runSubject, withdrawConsent } from "@/lib/research/engine";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* rely on ambient env */
}

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}`);
  }
}

async function main() {
  const { tenantId, userId } = await getAuthContext();
  const db = getDb();

  const latestJob = async (guestId: string) => {
    const [j] = await db
      .select()
      .from(researchJobs)
      .where(and(eq(researchJobs.tenantId, tenantId), eq(researchJobs.guestId, guestId)))
      .orderBy(desc(researchJobs.createdAt))
      .limit(1);
    return j ?? null;
  };
  const evFor = (jobId: string) =>
    db.select().from(evidenceItems).where(and(eq(evidenceItems.tenantId, tenantId), eq(evidenceItems.jobId, jobId)));
  const candFor = (jobId: string) =>
    db.select().from(identityCandidates).where(and(eq(identityCandidates.tenantId, tenantId), eq(identityCandidates.jobId, jobId)));
  const srcFor = (jobId: string) =>
    db.select().from(researchSources).where(and(eq(researchSources.tenantId, tenantId), eq(researchSources.jobId, jobId)));
  const briefFor = async (jobId: string) => {
    const [b] = await db
      .select()
      .from(prearrivalBriefs)
      .where(and(eq(prearrivalBriefs.tenantId, tenantId), eq(prearrivalBriefs.jobId, jobId)))
      .orderBy(desc(prearrivalBriefs.createdAt))
      .limit(1);
    return b ?? null;
  };
  const incFor = (jobId: string) =>
    db.select().from(policyIncidents).where(and(eq(policyIncidents.tenantId, tenantId), eq(policyIncidents.jobId, jobId)));
  const runScenario = async (key: string) => {
    const s = getScenario(key)!;
    for (const subject of s.subjects) await runSubject(tenantId, userId, key, subject);
  };

  // 1 — high-confidence successful brief
  await runScenario("high_confidence_match");
  const elena = (await getGuestByName(tenantId, "Elena Marques"))!;
  const elenaJob = (await latestJob(elena.id))!;
  const elenaBrief = await briefFor(elenaJob.id);
  const elenaItems = elenaBrief
    ? await db.select().from(briefItems).where(and(eq(briefItems.tenantId, tenantId), eq(briefItems.briefId, elenaBrief.id)))
    : [];
  const elenaEv = await evFor(elenaJob.id);
  check("high-confidence: brief draft created (confidence high)", !!elenaBrief && elenaBrief.status === "draft" && elenaBrief.confidence === "high");
  check("high-confidence: >=2 evidence-linked brief items", elenaItems.length >= 2 && elenaItems.every((i) => !!i.evidenceItemId));
  check("high-confidence: irrelevant evidence excluded", elenaEv.some((e) => e.classification === "irrelevant") && elenaEv.filter((e) => e.classification === "irrelevant").every((e) => !e.includedInBrief));

  // 2 — duplicate-name false-match rejection
  await runScenario("same_name_wrong_person");
  const johan = (await getGuestByName(tenantId, "Johan Berg"))!;
  const johanJob = (await latestJob(johan.id))!;
  const johanBrief = await briefFor(johanJob.id);
  const johanCands = await candFor(johanJob.id);
  check("false-match: no brief created", !johanBrief);
  check("false-match: candidate medium and never confirmed", johanCands.some((c) => c.level === "medium" && c.resolution !== "confirmed"));

  // 3 — medium-confidence ambiguous (Aiko) — explicit calibration assertions
  await runScenario("medium_ambiguous");
  const aiko = (await getGuestByName(tenantId, "Aiko Tanaka"))!;
  const aikoJob = (await latestJob(aiko.id))!;
  const aikoCands = await candFor(aikoJob.id);
  const aikoBest = [...aikoCands].sort((x, y) => y.score - x.score)[0];
  const aikoBrief = await briefFor(aikoJob.id);
  const aikoItems = aikoBrief
    ? await db.select().from(briefItems).where(and(eq(briefItems.tenantId, tenantId), eq(briefItems.briefId, aikoBrief.id)))
    : [];
  check("aiko: score within [40,70)", !!aikoBest && aikoBest.score >= 40 && aikoBest.score < 70);
  check("aiko: confidence medium", !!aikoBest && aikoBest.level === "medium");
  check("aiko: no brief created", !aikoBrief);
  check("aiko: no brief items exist", aikoItems.length === 0);
  check("aiko: no confirmed identity emitted", aikoCands.length > 0 && aikoCands.every((c) => c.resolution !== "confirmed"));

  // 4 — no reliable match
  await runScenario("no_reliable_match");
  const marco = (await getGuestByName(tenantId, "Marco Ruiz"))!;
  const marcoJob = (await latestJob(marco.id))!;
  check("no-match: no brief", !(await briefFor(marcoJob.id)));
  check("no-match: job completed calmly", marcoJob.status === "completed");

  // 4 — prohibited-content exclusion
  await runScenario("prohibited_content_trap");
  const sofia = (await getGuestByName(tenantId, "Sofia Lindqvist"))!;
  const sofiaJob = (await latestJob(sofia.id))!;
  const sofiaEv = await evFor(sofiaJob.id);
  const sofiaBrief = await briefFor(sofiaJob.id);
  const prohibited = sofiaEv.filter((e) => e.classification === "prohibited_sensitive");
  check("prohibited: 3 sensitive items blocked", prohibited.length === 3);
  check("prohibited: none included in brief", prohibited.every((e) => !e.includedInBrief));
  check("prohibited: sensitive excerpts not retained", prohibited.every((e) => !e.excerpt));
  check("prohibited: brief still created from allowed evidence", !!sofiaBrief);

  // 5 — disallowed-source refusal
  await runScenario("disallowed_source");
  const liam = (await getGuestByName(tenantId, "Liam O'Connor"))!;
  const liamJob = (await latestJob(liam.id))!;
  const liamSrc = await srcFor(liamJob.id);
  const liamInc = await incFor(liamJob.id);
  check("disallowed: refused source retained no excerpt", liamSrc.filter((s) => s.policyStatus === "disallowed").every((s) => !s.excerpt));
  check("disallowed: refusal incident recorded", liamInc.some((i) => i.kind === "disallowed_source_refused"));
  check("disallowed: allowed evidence still briefed", !!(await briefFor(liamJob.id)));

  // 6 — multi-guest booking with mixed consent
  await runScenario("multi_guest_mixed_consent");
  const clara = (await getGuestByName(tenantId, "Clara Vance"))!;
  const daniel = (await getGuestByName(tenantId, "Daniel Vance"))!;
  const claraJob = (await latestJob(clara.id))!;
  const danielJob = await latestJob(daniel.id);
  check("multi-guest: consenting guest gets a brief", !!(await briefFor(claraJob.id)));
  check("multi-guest: non-consenting guest gets NO job", !danielJob);

  // 7 — withdrawn-consent before run -> refusal
  await runScenario("consent_withdrawn_before");
  const nadia = (await getGuestByName(tenantId, "Nadia Hassan"))!;
  check("withdrawn-before: no research job created", !(await latestJob(nadia.id)));

  // 8 — withdrawal deletion/abort (Elena, who has a brief from step 1)
  await withdrawConsent(tenantId, userId, elena.id);
  const elenaJobAfter = (await latestJob(elena.id))!;
  const evAfter = await evFor(elenaJob.id);
  const candAfter = await candFor(elenaJob.id);
  const srcAfter = await srcFor(elenaJob.id);
  const briefAfter = await briefFor(elenaJob.id);
  const elenaEvents = await db
    .select()
    .from(events)
    .where(and(eq(events.tenantId, tenantId), eq(events.correlationId, elenaJob.id)));
  check("withdrawal: evidence artifacts deleted", evAfter.length === 0);
  check("withdrawal: identity candidates deleted", candAfter.length === 0);
  check("withdrawal: source artifacts deleted", srcAfter.length === 0);
  check("withdrawal: brief revoked", !!briefAfter && briefAfter.status === "revoked");
  check("withdrawal: job aborted", elenaJobAfter.status === "aborted");
  check("withdrawal: abort + delete events emitted", elenaEvents.some((e) => e.type === "research.aborted") && elenaEvents.some((e) => e.type === "research.deleted"));

  console.log(`\nResearch Lab verification: ${pass} passed, ${fail} failed.`);
  if (fail > 0) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Verification crashed:", err);
    process.exit(1);
  });
