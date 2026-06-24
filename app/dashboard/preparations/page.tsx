import Link from "next/link";
import { getAuthContext } from "@/lib/auth/devAuth";
import {
  listPreparationWorkItems,
  type PreparationWorkItem,
} from "@/lib/readmodels/preparations";
import { Card, C, EmptyState, Icon, PageHeader, SectionTitle } from "../_components/ui";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  suggested: "Suggested",
  planned: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** A Preparation lives in ONE stable place: its detail view once created, or its
 *  decision surface (the feasibility run) while still suggested. */
function decideHref(item: PreparationWorkItem): string {
  if (item.sourceType === "host_action") return `/dashboard/preparations/${item.id}`;
  if (item.runId) return `/dashboard/feasibility/${item.runId}`;
  return `/dashboard/guests/${item.guestId}`;
}

function PrepRow({ item, last }: { item: PreparationWorkItem; last: boolean }) {
  return (
    <Link
      href={decideHref(item)}
      className="flex items-center gap-4 px-5 py-4 no-underline transition-colors hover:bg-[#FBF8F1]"
      style={{ borderBottom: last ? "none" : `1px solid ${C.soft}`, color: C.ink }}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium">{item.title}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px]" style={{ color: C.muted }}>
          <Icon name="user" size={13} /> {item.guestName}
          <span style={{ color: C.stone }}>·</span>
          <Icon name="calendar" size={13} />{" "}
          {item.dueAt
            ? new Date(item.dueAt).toLocaleDateString("en-GB")
            : `Before arrival · ${item.stayStart}`}
        </div>
      </div>
      <span
        className="rounded-full px-2.5 py-1 text-[11.5px] font-medium"
        style={{ background: C.paper, color: C.muted }}
      >
        {KIND_LABEL[item.kind]}
      </span>
    </Link>
  );
}

function PrepSection({ title, items }: { title: string; items: PreparationWorkItem[] }) {
  return (
    <div className="mt-6">
      <SectionTitle>
        {title} ({items.length})
      </SectionTitle>
      <Card className="mt-3 overflow-hidden">
        {items.length === 0 ? (
          <EmptyState>Nothing here yet.</EmptyState>
        ) : (
          items.map((it, i, arr) => (
            <PrepRow key={it.sourceType + it.id} item={it} last={i === arr.length - 1} />
          ))
        )}
      </Card>
    </div>
  );
}

export default async function PreparationsPage() {
  const { tenantId } = await getAuthContext();
  const items = await listPreparationWorkItems(tenantId);
  const suggested = items.filter((i) => i.kind === "suggested");
  const active = items.filter((i) => i.kind === "planned");
  const past = items.filter((i) => i.kind === "completed" || i.kind === "cancelled");

  return (
    <div>
      <PageHeader
        title="Preparations"
        subtitle="Every stay-bound guest preparation — suggested, active, and past."
      />
      <PrepSection title="Suggested" items={suggested} />
      <PrepSection title="Active" items={active} />
      <PrepSection title="Past" items={past} />
    </div>
  );
}
