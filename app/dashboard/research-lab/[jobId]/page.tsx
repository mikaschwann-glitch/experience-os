import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth/devAuth";
import { getJobDetail } from "@/lib/repositories/research";
import {
  Card,
  C,
  Field,
  Icon,
  SectionTitle,
  SubmitButton,
  TextInput,
} from "../../_components/ui";
import { reviewBriefAction } from "../actions";

export const dynamic = "force-dynamic";

const EVENT_LABEL: Record<string, string> = {
  "research.refused": "Research refused",
  "research.started": "Research started",
  "research.needs_review": "Awaiting host review",
  "research.completed": "Research completed",
  "research.aborted": "Research aborted",
  "research.deleted": "Artifacts deleted",
  "identity.resolved": "Identity resolved",
  "policy.blocked": "Policy block",
  "brief.created": "Brief draft created",
  "brief.approved": "Brief approved",
  "brief.rejected": "Brief rejected",
  "brief.edited": "Brief edited",
  "brief.not_useful": "Marked not useful",
  "brief.revoked": "Brief revoked",
  "consent.withdrawn": "Consent withdrawn",
};

function fmt(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function levelColor(level: string) {
  if (level === "high") return { bg: C.clayLight, fg: C.clayDark };
  if (level === "medium") return { bg: C.chip, fg: C.ink };
  return { bg: C.soft, fg: C.muted };
}

const CLASS_LABEL: Record<string, string> = {
  allowed: "Allowed",
  prohibited_sensitive: "Blocked — sensitive",
  irrelevant: "Irrelevant",
  disallowed_source: "Source refused",
  insufficient_confidence: "Low confidence",
};

export default async function JobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const { tenantId } = await getAuthContext();
  const detail = await getJobDetail(tenantId, jobId);
  if (!detail) notFound();

  const { job, guest, sources, candidates, evidence, brief, briefItems, incidents, timeline } = detail;
  const draft = brief && brief.status === "draft";

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-[13px]" style={{ color: C.muted }}>
        <Link href="/dashboard/research-lab" className="no-underline" style={{ color: C.muted }}>
          Research Lab
        </Link>
        <span style={{ color: C.stone }}>/</span>
        <span style={{ color: C.ink }}>{guest?.fullName ?? "Job"}</span>
      </div>

      <div
        className="mb-5 flex items-center gap-3 rounded-xl px-4 py-2.5"
        style={{ background: C.warn, border: `1px solid ${C.soft}` }}
      >
        <span style={{ color: C.clayDark }}>
          <Icon name="clipboard" size={16} />
        </span>
        <span className="text-[12.5px] font-medium" style={{ color: C.ink }}>
          Simulation only — fictional identities and controlled source fixtures.
        </span>
      </div>

      <h1 className="text-[22px] font-semibold tracking-tight" style={{ color: C.ink }}>
        {guest?.fullName ?? "Research job"}
      </h1>
      <div className="mt-1 text-[13px] capitalize" style={{ color: C.muted }}>
        Job status: {job.status.replace("_", " ")}
        {job.abortReason ? ` · ${job.abortReason.replace("_", " ")}` : ""}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-7 lg:grid-cols-[1fr_320px]">
        <div className="space-y-7">
          {/* Identity candidates */}
          <section>
            <SectionTitle>Identity candidates</SectionTitle>
            <div className="mt-3 space-y-2">
              {candidates.length === 0 ? (
                <Card className="p-4 text-[13px]" style={{ color: C.muted }}>
                  No candidates (artifacts may have been deleted on consent withdrawal).
                </Card>
              ) : (
                candidates.map((c) => {
                  const lc = levelColor(c.level);
                  return (
                    <Card key={c.id} className="p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[14px] font-medium" style={{ color: C.ink }}>
                          {c.label}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="text-[12px]" style={{ color: C.muted }}>
                            score {c.score}
                          </span>
                          <span
                            className="rounded-full px-2.5 py-[2px] text-[11.5px] font-medium capitalize"
                            style={{ background: lc.bg, color: lc.fg }}
                          >
                            {c.level} · {c.resolution}
                          </span>
                        </span>
                      </div>
                      {c.level !== "high" ? (
                        <div className="mt-1.5 text-[12px]" style={{ color: C.muted }}>
                          Not treated as fact — {c.level === "medium" ? "uncertain candidate for host review" : "no brief created"}.
                        </div>
                      ) : null}
                    </Card>
                  );
                })
              )}
            </div>
          </section>

          {/* Evidence ledger */}
          <section>
            <SectionTitle>Evidence ledger</SectionTitle>
            <Card className="mt-3 overflow-hidden">
              {evidence.length === 0 ? (
                <div className="px-4 py-4 text-[13px]" style={{ color: C.muted }}>
                  No evidence retained.
                </div>
              ) : (
                evidence.map((e, i, arr) => {
                  const blocked = e.classification !== "allowed";
                  return (
                    <div
                      key={e.id}
                      className="flex items-start justify-between gap-3 px-4 py-3"
                      style={{ borderBottom: i === arr.length - 1 ? "none" : `1px solid ${C.soft}` }}
                    >
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium capitalize" style={{ color: C.ink }}>
                          {e.category.replace("_", " ")}
                        </div>
                        <div className="mt-0.5 text-[12.5px]" style={{ color: C.muted }}>
                          {e.classification === "allowed"
                            ? e.excerpt
                            : e.classification === "prohibited_sensitive"
                              ? "[blocked — sensitive content not retained]"
                              : e.classification === "disallowed_source"
                                ? "[source refused — not extracted]"
                                : e.classification === "insufficient_confidence"
                                  ? "[identity not high-confidence — not used]"
                                  : "[not relevant]"}
                        </div>
                      </div>
                      <span
                        className="shrink-0 rounded-full px-2.5 py-[2px] text-[11px] font-medium"
                        style={{
                          background: blocked ? C.soft : C.clayLight,
                          color: blocked ? C.muted : C.clayDark,
                        }}
                      >
                        {CLASS_LABEL[e.classification]}
                      </span>
                    </div>
                  );
                })
              )}
            </Card>
          </section>

          {/* Brief draft + host review */}
          <section>
            <SectionTitle>Pre-arrival brief</SectionTitle>
            {!brief ? (
              <Card className="mt-3 p-4 text-[13px]" style={{ color: C.muted }}>
                No brief generated. {job.status === "needs_review"
                  ? "Identity is uncertain — host review of the candidate is required before anything is prepared."
                  : "No reliable identity / no usable allowed evidence (a calm no-match)."}
              </Card>
            ) : brief.status === "revoked" ? (
              <Card className="mt-3 p-4 text-[13px]" style={{ color: C.muted }}>
                Brief revoked and its artifacts deleted (consent withdrawn).
              </Card>
            ) : (
              <Card className="mt-3 p-4">
                <div className="flex items-center justify-between">
                  <span
                    className="rounded-full px-2.5 py-[2px] text-[11.5px] font-medium capitalize"
                    style={{ background: C.clayLight, color: C.clayDark }}
                  >
                    confidence: {brief.confidence}
                  </span>
                  <span className="text-[12px] capitalize" style={{ color: C.muted }}>
                    {brief.status}
                  </span>
                </div>
                <ul className="mt-3 space-y-2">
                  {briefItems.map((it) => (
                    <li key={it.id} className="flex items-start gap-2.5">
                      <span className="mt-0.5 shrink-0" style={{ color: C.clay }}>
                        <Icon name={it.kind === "preparation" ? "check" : "note"} size={15} />
                      </span>
                      <div>
                        <div className="text-[13.5px]" style={{ color: C.ink }}>
                          {it.text}
                        </div>
                        <div className="text-[11px] uppercase tracking-[0.05em]" style={{ color: C.muted }}>
                          {it.kind} · evidence-linked
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>

                <p className="mt-3 flex items-center gap-1.5 text-[12px]" style={{ color: C.muted }}>
                  <Icon name="clipboard" size={13} /> Host review required — nothing is sent to the guest.
                </p>

                {draft ? (
                  <div className="mt-3 flex flex-wrap items-end gap-2 pt-3" style={{ borderTop: `1px solid ${C.soft}` }}>
                    <form action={reviewBriefAction.bind(null, brief.id, "approved")}>
                      <SubmitButton type="submit">
                        <Icon name="check" size={15} /> Approve
                      </SubmitButton>
                    </form>
                    <form action={reviewBriefAction.bind(null, brief.id, "edited")} className="flex items-end gap-2">
                      <Field label="Edit note">
                        <TextInput name="hostNote" placeholder="Host edit…" style={{ width: 200 }} />
                      </Field>
                      <SubmitButton type="submit" variant="ghost">Save edit</SubmitButton>
                    </form>
                    <form action={reviewBriefAction.bind(null, brief.id, "rejected")}>
                      <SubmitButton type="submit" variant="ghost">Reject</SubmitButton>
                    </form>
                    <form action={reviewBriefAction.bind(null, brief.id, "not_useful")}>
                      <SubmitButton type="submit" variant="ghost">Not useful</SubmitButton>
                    </form>
                  </div>
                ) : brief.hostNote ? (
                  <div className="mt-3 text-[12.5px]" style={{ color: C.muted }}>
                    Host note: {brief.hostNote}
                  </div>
                ) : null}
              </Card>
            )}
          </section>
        </div>

        {/* Right: sources, incidents, audit timeline */}
        <div className="space-y-5">
          <section>
            <SectionTitle>Sources considered</SectionTitle>
            <Card className="mt-3 p-4">
              {sources.length === 0 ? (
                <div className="text-[13px]" style={{ color: C.muted }}>No sources retained.</div>
              ) : (
                <ul className="space-y-2.5">
                  {sources.map((s) => (
                    <li key={s.id} className="text-[12.5px]">
                      <div className="font-medium" style={{ color: C.ink }}>{s.title}</div>
                      <div style={{ color: s.policyStatus === "disallowed" ? C.muted : C.muted }}>
                        {s.kind.replace("_", " ")} · {s.policyStatus === "disallowed" ? "refused (policy)" : "allowed"}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>

          {incidents.length > 0 ? (
            <section>
              <SectionTitle>Policy incidents</SectionTitle>
              <Card className="mt-3 p-4">
                <ul className="space-y-2 text-[12.5px]">
                  {incidents.map((inc) => (
                    <li key={inc.id} className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0" style={{ color: C.clay }}>
                        <Icon name="circle" size={13} />
                      </span>
                      <span style={{ color: C.ink }}>
                        <span className="capitalize">{inc.kind.replace(/_/g, " ")}</span>
                        {inc.detail ? <span style={{ color: C.muted }}> — {inc.detail}</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ) : null}

          <section>
            <SectionTitle>Event timeline</SectionTitle>
            <Card className="mt-3 p-4">
              {timeline.length === 0 ? (
                <div className="text-[13px]" style={{ color: C.muted }}>No events.</div>
              ) : (
                <ul className="space-y-0">
                  {timeline.map((e, i, arr) => (
                    <li key={e.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: C.paper, color: C.clay }}>
                          <Icon name="circle" size={12} />
                        </span>
                        {i < arr.length - 1 ? <span className="my-0.5 w-px flex-1" style={{ background: C.soft }} /> : null}
                      </div>
                      <div className="min-w-0 flex-1 pb-3.5">
                        <div className="text-[12.5px]" style={{ color: C.ink }}>
                          {EVENT_LABEL[e.type] ?? e.type}
                        </div>
                        <div className="text-[11px]" style={{ color: C.muted }}>{fmt(e.occurredAt)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
