import Link from "next/link";
import { getAuthContext } from "@/lib/auth/devAuth";
import { getTodaySnapshot } from "@/lib/repositories/dashboard";
import {
  listPreparationWorkItems,
  type PreparationWorkItem,
} from "@/lib/readmodels/preparations";
import {
  Avatar,
  Card,
  C,
  EmptyState,
  Icon,
  type IconName,
  PageHeader,
  SectionTitle,
  StatCard,
  StatusBadge,
} from "./_components/ui";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  suggested: "Suggested",
  planned: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

const EVENT_LABEL: Record<string, string> = {
  "guest.created": "Guest added",
  "stay.created": "Stay created",
  "signal.created": "Signal captured",
  "insight.created": "Insight created",
  "recommendation.created": "Recommendation created",
  "recommendation.accepted": "Recommendation approved",
  "recommendation.dismissed": "Recommendation dismissed",
  "host_action.created": "Preparation planned",
  "host_action.updated": "Preparation updated",
  "outcome.created": "Outcome logged",
  "preparation.created": "Preparation created",
};

const EVENT_ICON: Record<string, IconName> = {
  "guest.created": "user",
  "stay.created": "bed",
  "signal.created": "note",
  "insight.created": "recommend",
  "recommendation.created": "recommend",
  "recommendation.accepted": "check",
  "recommendation.dismissed": "circle",
  "host_action.created": "clipboard",
  "host_action.updated": "clipboard",
  "outcome.created": "check",
  "preparation.created": "clipboard",
};

function fmtTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function actionableHref(it: PreparationWorkItem): string {
  if (it.sourceType === "host_action") return `/dashboard/preparations/${it.id}`;
  if (it.runId) return `/dashboard/feasibility/${it.runId}`;
  return `/dashboard/guests/${it.guestId}`;
}

export default async function TodayPage() {
  const { tenantId, userName } = await getAuthContext();
  const [snapshot, workItems] = await Promise.all([
    getTodaySnapshot(tenantId),
    listPreparationWorkItems(tenantId),
  ]);
  const firstName = userName.split(" ")[0];
  // Badge = actionable PreparationWorkItems ONLY. Arrivals/departures are context
  // and never inflate the count.
  const actionable = workItems.filter((i) => i.actionable);
  const needsAttention = actionable.length;

  return (
    <div>
      <PageHeader
        title={`Good morning, ${firstName}`}
        subtitle="What needs your attention for guests today."
      />

      {needsAttention > 0 ? (
        <Link href="/dashboard/preparations" className="mt-5 block no-underline">
          <div
            className="flex items-center gap-3 rounded-xl px-4 py-3"
            style={{ background: C.clayLight, border: `1px solid ${C.soft}` }}
          >
            <span style={{ color: C.clayDark }}>
              <Icon name="clipboard" size={18} />
            </span>
            <span className="text-[13.5px] font-medium" style={{ color: C.ink }}>
              Needs attention: {needsAttention} preparation{needsAttention > 1 ? "s" : ""}
            </span>
            <span className="ml-auto flex items-center gap-1 text-[13px] font-medium" style={{ color: C.clayDark }}>
              Open <Icon name="arrowRight" size={15} />
            </span>
          </div>
        </Link>
      ) : null}

      <div className="mt-6 grid grid-cols-3 gap-4">
        <StatCard icon="user" value={snapshot.counts.arrivingToday} label="Arriving today" />
        <StatCard icon="bed" value={snapshot.counts.inResidence} label="In residence" />
        <StatCard
          icon="clipboard"
          value={needsAttention}
          label="Needs attention"
          alert={needsAttention > 0}
          href="/dashboard/preparations"
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-7 lg:grid-cols-[1fr_330px]">
        <div>
          <SectionTitle>Needs attention</SectionTitle>
          <Card className="mt-3 overflow-hidden">
            {actionable.length === 0 ? (
              <EmptyState>Nothing needs your decision right now.</EmptyState>
            ) : (
              actionable.map((it, i, arr) => (
                <Link
                  key={it.sourceType + it.id}
                  href={actionableHref(it)}
                  className="flex items-center gap-4 px-5 py-4 no-underline transition-colors hover:bg-[#FBF8F1]"
                  style={{
                    borderBottom: i === arr.length - 1 ? "none" : `1px solid ${C.soft}`,
                    color: C.ink,
                  }}
                >
                  <Avatar name={it.guestName} tone="clay" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-medium">{it.title}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px]" style={{ color: C.muted }}>
                      <Icon name="user" size={13} /> {it.guestName}
                      <span style={{ color: C.stone }}>·</span>
                      <Icon name="calendar" size={13} /> Before arrival · {it.stayStart}
                    </div>
                  </div>
                  <span
                    className="rounded-full px-2.5 py-1 text-[11.5px] font-medium"
                    style={{ background: C.paper, color: C.muted }}
                  >
                    {KIND_LABEL[it.kind]}
                  </span>
                </Link>
              ))
            )}
          </Card>

          <div className="mt-7">
            <SectionTitle>Arrivals &amp; departures</SectionTitle>
            <Card className="mt-3 overflow-hidden">
              {snapshot.arrivals.length === 0 ? (
                <EmptyState>No upcoming arrivals on the books.</EmptyState>
              ) : (
                snapshot.arrivals.map((s, i, arr) => (
                  <Link
                    key={s.id}
                    href={`/dashboard/guests/${s.guestId}`}
                    className="flex items-center gap-4 px-5 py-4 no-underline transition-colors hover:bg-[#FBF8F1]"
                    style={{
                      borderBottom: i === arr.length - 1 ? "none" : `1px solid ${C.soft}`,
                      color: C.ink,
                    }}
                  >
                    <Avatar name={s.guestName} tone="clay" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-medium">{s.guestName}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px]" style={{ color: C.muted }}>
                        <Icon name="bed" size={13} /> {s.unitName ?? "Unit TBD"}
                        <span style={{ color: C.stone }}>·</span>
                        <Icon name="calendar" size={13} /> {s.startDate} – {s.endDate}
                      </div>
                    </div>
                    <StatusBadge status={s.status} />
                  </Link>
                ))
              )}
            </Card>
          </div>
        </div>

        <div>
          <SectionTitle>Recent activity</SectionTitle>
          <Card className="mt-3 p-4">
            {snapshot.recentEvents.length === 0 ? (
              <div className="text-[13px]" style={{ color: C.muted }}>
                No activity yet.
              </div>
            ) : (
              <ul className="space-y-0">
                {snapshot.recentEvents.map((e, i, arr) => (
                  <li key={e.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className="flex h-7 w-7 items-center justify-center rounded-full"
                        style={{ background: C.paper, color: C.clay }}
                      >
                        <Icon name={EVENT_ICON[e.type] ?? "circle"} size={14} />
                      </span>
                      {i < arr.length - 1 ? (
                        <span className="my-0.5 w-px flex-1" style={{ background: C.soft }} />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1 pb-4">
                      <div className="text-[13px]" style={{ color: C.ink }}>
                        {EVENT_LABEL[e.type] ?? e.type}
                      </div>
                      <div className="text-[11.5px]" style={{ color: C.muted }}>
                        {fmtTime(e.occurredAt)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
