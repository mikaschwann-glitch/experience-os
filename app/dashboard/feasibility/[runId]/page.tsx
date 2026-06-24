import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth/devAuth";
import { getFeasibilityRun } from "@/lib/repositories/feasibility";
import { tagLabel } from "@/lib/domain/vocabulary";
import { groundedClarifications } from "@/lib/domain/conceptMapping";
import { meaningfullyTied } from "@/lib/feasibility/ranking";
import { Card, C, Icon, PageHeader, SubmitButton } from "../../_components/ui";
import {
  confirmProposalAction,
  createFallbackAction,
  notUsefulProposalAction,
} from "./actions";
import { refinePreparationAction } from "../../guests/[guestId]/actions";
import { FallbackForm } from "./FallbackForm";

export const dynamic = "force-dynamic";

const REASON_LABEL: Record<string, string> = {
  hard_constraint: "Blocked by a house rule",
  missing_capability: "Not something this home offers",
  dynamic_unconfirmed: "Changes too often to rely on",
  weather: "Weather-dependent",
  no_match: "No match",
  soft_constraint: "Needs a quick check first",
  verify_before_use: "Needs a quick check first",
};

type Proposal = NonNullable<Awaited<ReturnType<typeof getFeasibilityRun>>>["actionable"][number];
type Withheld = NonNullable<Awaited<ReturnType<typeof getFeasibilityRun>>>["withheld"][number];

/** Optional, collapsed: the ideas the system set aside and why (never prominent). */
function SetAside({ items }: { items: Withheld[] }) {
  if (items.length === 0) return null;
  return (
    <details className="mt-6" data-testid="set-aside">
      <summary
        className="cursor-pointer text-[13px] font-medium [&::-webkit-details-marker]:hidden"
        style={{ listStyleType: "none", color: C.muted }}
      >
        Ideas we set aside ({items.length})
      </summary>
      <Card className="mt-3 overflow-hidden">
        {items.map((p, i, arr) => (
          <div
            key={p.id}
            className="flex items-start justify-between gap-3 px-4 py-3"
            style={{ borderBottom: i === arr.length - 1 ? "none" : `1px solid ${C.soft}` }}
          >
            <div className="min-w-0">
              <div className="text-[13px] font-medium" style={{ color: C.ink }}>{p.title}</div>
              <div className="mt-0.5 text-[12.5px]" style={{ color: C.muted }}>
                {REASON_LABEL[p.reasonCode ?? ""] ?? "Set aside"}
              </div>
            </div>
          </div>
        ))}
      </Card>
    </details>
  );
}

// One short, plain-language reason — never the full matcher rationale by default.
function shortFit(p: Proposal): string {
  const tags = Array.isArray(p.matchedTags) ? (p.matchedTags as string[]) : [];
  if (tags.length === 0) return "A good fit for this guest's stay.";
  return `A good fit for their interest in ${tags.map(tagLabel).join(", ")}.`;
}

/** The dominant, primary suggestion: title, one short reason, one clear action. */
function PrimarySuggestion({
  runId,
  guestId,
  guestName,
  p,
}: {
  runId: string;
  guestId?: string;
  guestName: string;
  p: Proposal;
}) {
  return (
    <Card className="mt-5 p-6" style={{ borderColor: C.clay }}>
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.06em]" style={{ color: C.clayDark }}>
        Suggested preparation for {guestName}
      </div>
      <h2 className="mt-2 text-[20px] font-semibold leading-snug" style={{ color: C.ink }}>
        {p.title}
      </h2>
      <p className="mt-2 text-[14px] leading-relaxed" style={{ color: C.muted }}>
        {shortFit(p)}
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <form action={confirmProposalAction.bind(null, runId, p.id, guestId)}>
          <SubmitButton type="submit">
            <Icon name="check" size={16} /> Create preparation
          </SubmitButton>
        </form>
        <form action={notUsefulProposalAction.bind(null, runId, p.id, guestId)}>
          <SubmitButton type="submit" variant="ghost">Not useful</SubmitButton>
        </form>
        <span className="text-[12px]" style={{ color: C.muted }}>Nothing is sent to the guest.</span>
      </div>

      {/* Deeper reasoning is opt-in only — no host should read a paragraph to decide. */}
      {p.rationale ? (
        <details className="mt-4">
          <summary
            className="cursor-pointer text-[12.5px] font-medium [&::-webkit-details-marker]:hidden"
            style={{ listStyleType: "none", color: C.clay }}
          >
            Why this suggestion?
          </summary>
          <p className="mt-2 text-[13px] leading-relaxed" style={{ color: C.ink }}>
            {p.rationale}
          </p>
        </details>
      ) : null}
    </Card>
  );
}

/**
 * Alternatives, collapsed by default. Opened by default ONLY when ranking is ambiguous
 * (no honest single best), so the host sees the real choice instead of a fake winner.
 */
function OtherIdeas({
  runId,
  guestId,
  items,
  open,
}: {
  runId: string;
  guestId?: string;
  items: Proposal[];
  open?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <details className="mt-4" open={open}>
      <summary
        className="cursor-pointer text-[13.5px] font-medium [&::-webkit-details-marker]:hidden"
        style={{ listStyleType: "none", color: C.clayDark }}
      >
        Other ideas ({items.length})
      </summary>
      <div className="mt-3 space-y-3">
        {items.map((p) => (
          <Card key={p.id} className="p-4">
            <div className="text-[14.5px] font-medium" style={{ color: C.ink }}>{p.title}</div>
            <p className="mt-1 text-[13px] leading-relaxed" style={{ color: C.muted }}>{shortFit(p)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <form action={confirmProposalAction.bind(null, runId, p.id, guestId)}>
                <SubmitButton type="submit">
                  <Icon name="check" size={15} /> Create preparation
                </SubmitButton>
              </form>
              <form action={notUsefulProposalAction.bind(null, runId, p.id, guestId)}>
                <SubmitButton type="submit" variant="ghost">Not useful</SubmitButton>
              </form>
            </div>
          </Card>
        ))}
      </div>
    </details>
  );
}

export default async function FeasibilityRunPage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string }>;
  searchParams: Promise<{ retry?: string }>;
}) {
  const { runId } = await params;
  const { retry } = await searchParams;
  const { tenantId } = await getAuthContext();
  const detail = await getFeasibilityRun(tenantId, runId);
  if (!detail) notFound();
  const { run, guest, sourceSignal, actionable, withheld, converted, createdPreparationId } = detail;
  const guestId = guest?.id;
  const guestName = guest?.fullName ?? "this guest";

  // Trust the engine's PERSISTED ranked order (feasibility_proposals.priority, set by
  // lib/feasibility/ranking at creation): actionable already arrives best-first, so we do
  // not re-rank here (no divergence if the policy later changes). Ambiguity is derived
  // deterministically from the persisted top two — when there is no honest single best we
  // do NOT pretend one is, and the alternatives open by default.
  const primary = actionable[0];
  const others = actionable.slice(1);
  const ambiguous = actionable.length >= 2 && meaningfullyTied(actionable[0], actionable[1]);
  // When nothing safe matched, offer grounded directions the property can actually
  // support (never an internal taxonomy grid) + an immediate custom preparation.
  const clarifications =
    !converted && !primary && run.propertyId
      ? await groundedClarifications(tenantId, run.propertyId)
      : [];

  return (
    <div>
      {retry === "conflict" ? (
        <div
          className="mb-4 rounded-lg px-4 py-3 text-[13px]"
          style={{ background: C.warn, color: C.clayDark, border: `1px solid ${C.soft}` }}
          data-testid="fallback-conflict"
        >
          Your preparation changed since the last attempt — please review the text and submit it again.
        </div>
      ) : null}

      <PageHeader
        title={converted ? "Preparation created" : primary ? "Suggested preparation" : "Prepare for this stay"}
        subtitle={`For ${guestName}`}
      />

      {/* The original request, in the host's own words. */}
      {sourceSignal?.body ? (
        <div className="mt-4 rounded-lg p-3" style={{ background: C.chip, border: `1px solid ${C.soft}` }}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: C.muted }}>
            What you asked for
          </div>
          <p className="mt-0.5 text-[13px]" style={{ color: C.ink }}>{sourceSignal.body}</p>
        </div>
      ) : null}

      {converted ? (
        // The run is resolved: ONE choice was made for this need. The set-aside
        // alternatives live on the created Preparation, never re-offered here.
        <div data-testid="run-resolved">
          <Card className="mt-5 p-6" style={{ borderColor: C.clay }}>
            <div className="flex items-center gap-2 text-[14px] font-semibold" style={{ color: C.ink }}>
              <Icon name="check" size={16} /> You created a preparation from this request.
            </div>
            <p className="mt-1.5 text-[13px]" style={{ color: C.muted }}>
              {converted.title}
            </p>
            {createdPreparationId ? (
              <Link
                href={`/dashboard/preparations/${createdPreparationId}`}
                className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium no-underline"
                style={{ color: C.clay }}
              >
                Open the preparation <Icon name="arrowRight" size={15} />
              </Link>
            ) : null}
          </Card>
        </div>
      ) : primary ? (
        <>
          <PrimarySuggestion runId={run.id} guestId={guestId} guestName={guestName} p={primary} />
          <OtherIdeas runId={run.id} guestId={guestId} items={others} open={ambiguous} />
        </>
      ) : (
        <Card className="mt-5 p-6">
          <h2 className="text-[17px] font-semibold" style={{ color: C.ink }}>
            We don&apos;t have a reliable idea for this request yet.
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: C.muted }}>
            You can still create a preparation for this stay.
          </p>

          {clarifications.length > 0 && run.stayId && guestId ? (
            <div className="mt-5">
              <div className="text-[12.5px] font-medium" style={{ color: C.ink }}>
                Or start from one of these:
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {clarifications.map((c) => (
                  <form
                    key={c.label}
                    action={refinePreparationAction.bind(null, guestId, run.stayId as string, c.concepts.join(","))}
                  >
                    <button
                      type="submit"
                      className="rounded-full px-3.5 py-1.5 text-[12.5px] font-medium"
                      style={{ background: C.chip, color: C.ink, border: `1px solid ${C.soft}` }}
                    >
                      {c.label}
                    </button>
                  </form>
                ))}
              </div>
            </div>
          ) : null}

          {run.stayId && guestId ? (
            <div className="mt-6 pt-5" style={{ borderTop: `1px solid ${C.soft}` }}>
              <div className="text-[13px] font-medium" style={{ color: C.ink }}>
                What would you like to prepare?
              </div>
              <FallbackForm action={createFallbackAction.bind(null, run.id, guestId)} />
            </div>
          ) : null}
        </Card>
      )}

      <SetAside items={withheld} />
    </div>
  );
}
