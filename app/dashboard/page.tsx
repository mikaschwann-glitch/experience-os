import Link from "next/link";
import { getAuthContext } from "@/lib/auth/devAuth";
import { getTodaySnapshot } from "@/lib/repositories/dashboard";
import { Card, C, SectionTitle, StatCard } from "./_components/ui";

export const dynamic = "force-dynamic";

const EVENT_LABEL: Record<string, string> = {
  "guest.created": "Guest added",
  "stay.created": "Stay created",
  "signal.created": "Signal captured",
  "insight.created": "Insight created",
  "recommendation.created": "Recommendation created",
  "recommendation.accepted": "Recommendation approved",
  "recommendation.dismissed": "Recommendation dismissed",
  "host_action.created": "Host action planned",
  "host_action.updated": "Host action updated",
  "outcome.created": "Outcome logged",
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

export default async function TodayPage() {
  const { tenantId, userName } = await getAuthContext();
  const snapshot = await getTodaySnapshot(tenantId);
  const firstName = userName.split(" ")[0];

  return (
    <div>
      <h1 className="text-[26px] font-semibold tracking-tight" style={{ color: C.ink }}>
        Good morning, {firstName}
      </h1>
      <p className="mt-2 text-[14.5px]" style={{ color: C.muted }}>
        Here is what matters across the property today.
      </p>

      <div className="mt-6 grid grid-cols-3 gap-4">
        <StatCard value={snapshot.counts.arrivingToday} label="Arriving today" />
        <StatCard value={snapshot.counts.inResidence} label="In residence" />
        <StatCard value={snapshot.counts.needApproval} label="Need approval" alert={snapshot.counts.needApproval > 0} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-7 lg:grid-cols-[1fr_320px]">
        <div>
          <SectionTitle>Upcoming arrivals</SectionTitle>
          <Card className="mt-3 overflow-hidden">
            {snapshot.arrivals.length === 0 ? (
              <div className="px-5 py-6 text-[13px]" style={{ color: C.muted }}>
                No upcoming arrivals.
              </div>
            ) : (
              snapshot.arrivals.map((s, i, arr) => (
                <Link
                  key={s.id}
                  href={`/dashboard/guests/${s.guestId}`}
                  className="flex items-center gap-4 px-5 py-4 no-underline"
                  style={{
                    borderBottom: i === arr.length - 1 ? "none" : `1px solid ${C.soft}`,
                    color: C.ink,
                  }}
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold"
                    style={{ background: C.clayLight, color: C.clayDark }}
                  >
                    {s.guestName.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-medium">{s.guestName}</div>
                    <div className="mt-0.5 text-[12.5px]" style={{ color: C.muted }}>
                      {s.unitName ?? "Unit TBD"} · {s.startDate} – {s.endDate}
                    </div>
                  </div>
                  <div className="text-[12.5px] capitalize" style={{ color: C.muted }}>
                    {s.status.replace("_", " ")}
                  </div>
                </Link>
              ))
            )}
          </Card>
        </div>

        <div>
          <SectionTitle>Recent activity</SectionTitle>
          <Card className="mt-3 p-4">
            {snapshot.recentEvents.length === 0 ? (
              <div className="text-[13px]" style={{ color: C.muted }}>
                No activity yet.
              </div>
            ) : (
              <ul className="space-y-3.5">
                {snapshot.recentEvents.map((e) => (
                  <li key={e.id} className="flex items-start gap-3">
                    <span
                      className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: C.clay }}
                    />
                    <div className="min-w-0 flex-1">
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
