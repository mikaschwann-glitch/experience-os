import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth/devAuth";
import { getOtherIdeasConsidered, getPreparationWorkItem } from "@/lib/readmodels/preparations";
import { Card, C, Icon, SubmitButton } from "../../_components/ui";
import { markPreparedAction } from "./actions";
import { createAnotherPreparationAction } from "../../feasibility/[runId]/actions";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  suggested: "Suggested",
  planned: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default async function PreparationDetailPage({
  params,
}: {
  params: Promise<{ preparationId: string }>;
}) {
  const { preparationId } = await params;
  const { tenantId } = await getAuthContext();
  const item = await getPreparationWorkItem(tenantId, preparationId);
  if (!item) notFound();
  const otherIdeas = await getOtherIdeasConsidered(tenantId, preparationId);

  const when = item.dueAt
    ? `Due ${new Date(item.dueAt).toLocaleDateString("en-GB")}`
    : `Before arrival · ${item.stayStart}`;
  const whatToDo = item.description ?? item.title;
  const isActive = item.kind === "planned";

  return (
    <div>
      <div className="mb-4 text-[13px]">
        <Link href="/dashboard/preparations" className="no-underline" style={{ color: C.muted }}>
          ← All preparations
        </Link>
      </div>

      {/* The work comes first: title, who/where/when, and the concrete instruction. */}
      <h1 className="text-[25px] font-semibold tracking-tight" style={{ color: C.ink }}>
        {item.title}
      </h1>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px]" style={{ color: C.muted }}>
        <span className="flex items-center gap-1.5">
          <Icon name="user" size={14} /> For {item.guestName}
        </span>
        <span style={{ color: C.stone }}>·</span>
        <span className="flex items-center gap-1.5">
          <Icon name="bed" size={14} /> {item.unitName ?? "Home TBD"}
        </span>
        <span style={{ color: C.stone }}>·</span>
        <span className="flex items-center gap-1.5">
          <Icon name="calendar" size={14} /> {when}
        </span>
      </div>

      <Card className="mt-5 p-6">
        <div className="text-[11.5px] font-semibold uppercase tracking-[0.06em]" style={{ color: C.clayDark }}>
          What to do
        </div>
        <p className="mt-2 text-[15px] leading-relaxed" style={{ color: C.ink }}>
          {whatToDo}
        </p>

        <div className="mt-5 flex items-center gap-3">
          {isActive ? (
            <form action={markPreparedAction.bind(null, item.id, item.guestId)}>
              <SubmitButton type="submit">
                <Icon name="check" size={16} /> Mark as ready
              </SubmitButton>
            </form>
          ) : (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium"
              style={{ background: C.chip, color: C.muted }}
            >
              <Icon name="check" size={14} /> {KIND_LABEL[item.kind]}
            </span>
          )}
        </div>
      </Card>

      {/* Progressively disclosed context — never in the way of the work. */}
      {item.why ? (
        <div className="mt-5">
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.045em]" style={{ color: C.muted }}>
            Why this matters
          </div>
          <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: C.ink }}>
            {item.why}
          </p>
        </div>
      ) : null}

      <div className="mt-5">
        <div className="text-[11.5px] font-semibold uppercase tracking-[0.045em]" style={{ color: C.muted }}>
          Stay details
        </div>
        <div className="mt-2 text-[13.5px]" style={{ color: C.ink }}>
          <Link
            href={`/dashboard/guests/${item.guestId}`}
            className="font-medium no-underline"
            style={{ color: C.clayDark }}
          >
            {item.guestName}
          </Link>
          <span style={{ color: C.muted }}>
            {" "}· {item.unitName ?? "Home TBD"} · {item.stayStart}
          </span>
        </div>
      </div>

      {/* The alternatives considered for this same request — set aside, not separate
          tasks. Collapsed; an explicit secondary action creates another from one of them
          through the SAME stay-bound idempotent boundary. */}
      {otherIdeas ? (
        <details className="mt-6" data-testid="other-ideas-considered">
          <summary
            className="cursor-pointer text-[12.5px] font-medium [&::-webkit-details-marker]:hidden"
            style={{ listStyleType: "none", color: C.muted }}
          >
            Other ideas considered ({otherIdeas.siblings.length})
          </summary>
          <Card className="mt-3 overflow-hidden">
            {otherIdeas.siblings.map((s, i, arr) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
                style={{ borderBottom: i === arr.length - 1 ? "none" : `1px solid ${C.soft}` }}
              >
                <span className="min-w-0 text-[13px]" style={{ color: C.ink }}>{s.title}</span>
                <form action={createAnotherPreparationAction.bind(null, otherIdeas.runId, s.id, item.guestId)}>
                  <SubmitButton type="submit" variant="ghost">
                    Create preparation
                  </SubmitButton>
                </form>
              </div>
            ))}
          </Card>
        </details>
      ) : null}
    </div>
  );
}
