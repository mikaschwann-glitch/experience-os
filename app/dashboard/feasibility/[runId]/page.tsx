import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth/devAuth";
import { getFeasibilityRun } from "@/lib/repositories/feasibility";
import { tagLabel } from "@/lib/domain/vocabulary";
import { Card, C, EmptyState, Icon, PageHeader, SectionTitle, SubmitButton, Tag } from "../../_components/ui";
import {
  acceptProposalAction,
  convertProposalAction,
  notUsefulProposalAction,
  rejectProposalAction,
} from "./actions";

export const dynamic = "force-dynamic";

const REASON_LABEL: Record<string, string> = {
  hard_constraint: "Blocked by a house rule",
  missing_capability: "Required capability not active",
  dynamic_unconfirmed: "Changes too often to confirm",
  weather: "Weather-dependent",
  no_match: "No match",
  soft_constraint: "Soft rule applies",
  verify_before_use: "Verify before use",
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string }> = {
    proposed: { bg: C.clayLight, fg: C.clayDark },
    requires_confirmation: { bg: C.warn, fg: C.clayDark },
    accepted: { bg: C.chip, fg: C.ink },
    converted_to_host_action: { bg: C.clayLight, fg: C.clayDark },
    rejected: { bg: C.soft, fg: C.muted },
    not_useful: { bg: C.soft, fg: C.muted },
    withheld: { bg: C.soft, fg: C.muted },
  };
  const s = map[status] ?? { bg: C.chip, fg: C.muted };
  return (
    <span className="rounded-full px-2.5 py-[2px] text-[11.5px] font-medium" style={{ background: s.bg, color: s.fg }}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

type Proposal = NonNullable<Awaited<ReturnType<typeof getFeasibilityRun>>>["actionable"][number];

function Chips({ values }: { values: unknown }) {
  const arr = Array.isArray(values) ? (values as string[]) : [];
  if (!arr.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {arr.map((t) => (
        <Tag key={t}>{tagLabel(t)}</Tag>
      ))}
    </div>
  );
}

function ProposalCard({ runId, p }: { runId: string; p: Proposal }) {
  const open = p.status === "proposed" || p.status === "requires_confirmation";
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[15px] font-semibold" style={{ color: C.ink }}>
          {p.title}
        </div>
        <StatusBadge status={p.status} />
      </div>
      {p.description ? (
        <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: C.muted }}>
          {p.description}
        </p>
      ) : null}
      {p.rationale ? (
        <div className="mt-3 rounded-lg p-3" style={{ background: C.clayLight, border: `1px solid ${C.soft}` }}>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: C.clayDark }}>
            Why this matches
          </div>
          <p className="text-[13px] leading-relaxed" style={{ color: C.ink }}>
            {p.rationale}
          </p>
        </div>
      ) : null}
      <Chips values={p.matchedTags} />
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]" style={{ color: C.muted }}>
        {p.confirmationRequired ? (
          <span className="flex items-center gap-1" style={{ color: C.clayDark }}>
            <Icon name="clock" size={13} /> Confirm before use
          </span>
        ) : null}
        {p.hostEffort ? <span>effort: {p.hostEffort}</span> : null}
        {p.costLevel ? <span>cost: {p.costLevel}</span> : null}
        {p.leadTime ? <span>lead: {p.leadTime}</span> : null}
        {p.freshness ? <span>freshness: {p.freshness.replace(/_/g, " ")}</span> : null}
      </div>

      {open ? (
        <div className="mt-3 flex flex-wrap gap-2 pt-3" style={{ borderTop: `1px solid ${C.soft}` }}>
          <form action={acceptProposalAction.bind(null, runId, p.id)}>
            <SubmitButton type="submit">
              <Icon name="check" size={15} /> Accept
            </SubmitButton>
          </form>
          <form action={rejectProposalAction.bind(null, runId, p.id)}>
            <SubmitButton type="submit" variant="ghost">Reject</SubmitButton>
          </form>
          <form action={notUsefulProposalAction.bind(null, runId, p.id)}>
            <SubmitButton type="submit" variant="ghost">Not useful</SubmitButton>
          </form>
        </div>
      ) : p.status === "accepted" ? (
        <div className="mt-3 flex items-center gap-3 pt-3" style={{ borderTop: `1px solid ${C.soft}` }}>
          <span className="text-[12.5px]" style={{ color: C.muted }}>
            Recommendation created — nothing is sent to the guest.
          </span>
          <form action={convertProposalAction.bind(null, runId, p.id)}>
            <SubmitButton type="submit">Convert to host action</SubmitButton>
          </form>
        </div>
      ) : p.status === "converted_to_host_action" ? (
        <p className="mt-3 flex items-center gap-1.5 pt-3 text-[12.5px]" style={{ borderTop: `1px solid ${C.soft}`, color: C.muted }}>
          <Icon name="check" size={13} /> Converted into a host action.
        </p>
      ) : null}
    </Card>
  );
}

export default async function FeasibilityRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const { tenantId } = await getAuthContext();
  const detail = await getFeasibilityRun(tenantId, runId);
  if (!detail) notFound();
  const { run, guest, property, actionable, withheld } = detail;
  const ctx = (run.simContext ?? {}) as { weather?: string; transport?: string };

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-[13px]" style={{ color: C.muted }}>
        <Link href="/dashboard/research-lab" className="no-underline" style={{ color: C.muted }}>
          Research Lab
        </Link>
        <span style={{ color: C.stone }}>/</span>
        <span style={{ color: C.ink }}>Feasibility</span>
      </div>

      <PageHeader
        title={`Feasible preparations — ${guest?.fullName ?? "guest"}`}
        subtitle={`Property: ${property?.name ?? "—"} · Simulated context: weather ${ctx.weather ?? "?"}, transport ${(ctx.transport ?? "?").toString().replace(/_/g, " ")}.`}
      />

      {run.status === "refused" ? (
        <Card className="mt-5 p-5">
          <div className="text-[14px] font-semibold" style={{ color: C.ink }}>No evaluation</div>
          <p className="mt-1 text-[13px]" style={{ color: C.muted }}>
            Refused: {(run.refusedReason ?? "").replace(/_/g, " ")}. A brief must be host-approved and
            high-confidence before feasible preparations can be evaluated.
          </p>
        </Card>
      ) : (
        <>
          <div className="mt-6">
            <SectionTitle>Proposed preparations</SectionTitle>
            <div className="mt-3 space-y-3">
              {actionable.length === 0 ? (
                <Card>
                  <EmptyState>
                    No safe, feasible preparation available — this is a valid outcome (withhold rather than guess).
                  </EmptyState>
                </Card>
              ) : (
                actionable.map((p) => <ProposalCard key={p.id} runId={run.id} p={p} />)
              )}
            </div>
          </div>

          {withheld.length > 0 ? (
            <div className="mt-8">
              <SectionTitle>Not proposed — and why</SectionTitle>
              <Card className="mt-3 overflow-hidden">
                {withheld.map((p, i, arr) => (
                  <div
                    key={p.id}
                    className="flex items-start justify-between gap-3 px-4 py-3"
                    style={{ borderBottom: i === arr.length - 1 ? "none" : `1px solid ${C.soft}` }}
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium" style={{ color: C.ink }}>
                        {p.title}
                      </div>
                      <div className="mt-0.5 text-[12.5px]" style={{ color: C.muted }}>
                        {p.withheldReason ?? REASON_LABEL[p.reasonCode ?? ""] ?? "Withheld"}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full px-2.5 py-[2px] text-[11px] font-medium" style={{ background: C.soft, color: C.muted }}>
                      {REASON_LABEL[p.reasonCode ?? ""] ?? "withheld"}
                    </span>
                  </div>
                ))}
              </Card>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
