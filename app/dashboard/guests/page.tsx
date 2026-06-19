import Link from "next/link";
import { getAuthContext } from "@/lib/auth/devAuth";
import { listGuestsWithSummary } from "@/lib/repositories/guests";
import {
  Avatar,
  Card,
  C,
  EmptyState,
  Icon,
  MetricChip,
  PageHeader,
  SectionTitle,
  StatusBadge,
} from "../_components/ui";

export const dynamic = "force-dynamic";

export default async function GuestsPage() {
  const { tenantId } = await getAuthContext();
  const guests = await listGuestsWithSummary(tenantId);

  return (
    <div>
      <PageHeader title="Guests" subtitle="The people behind every stay." />

      <div className="mt-6">
        <SectionTitle
          right={
            <span className="text-[12.5px]" style={{ color: C.muted }}>
              {guests.length} {guests.length === 1 ? "guest" : "guests"}
            </span>
          }
        >
          All guests
        </SectionTitle>
        <Card className="mt-3 overflow-hidden">
          {guests.length === 0 ? (
            <EmptyState>
              No guests yet. Run <code>npm run db:seed</code> to load the demo data.
            </EmptyState>
          ) : (
            guests.map((g, i, arr) => (
              <Link
                key={g.id}
                href={`/dashboard/guests/${g.id}`}
                className="flex items-center gap-4 px-5 py-4 no-underline transition-colors hover:bg-[#FBF8F1]"
                style={{
                  borderBottom: i === arr.length - 1 ? "none" : `1px solid ${C.soft}`,
                  color: C.ink,
                }}
              >
                <Avatar name={g.fullName} />
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium">{g.fullName}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px]" style={{ color: C.muted }}>
                    {g.currentStay ? (
                      <>
                        <Icon name="bed" size={13} /> {g.currentStay.unitName ?? "Unit TBD"}
                        <span style={{ color: C.stone }}>·</span>
                        {g.currentStay.startDate} – {g.currentStay.endDate}
                      </>
                    ) : (
                      "No stay on record"
                    )}
                  </div>
                </div>
                <div className="hidden items-center gap-5 sm:flex">
                  <MetricChip value={g.insightCount} label="insights" />
                  <MetricChip value={g.openRecommendationCount} label="open recs" />
                </div>
                {g.currentStay ? <StatusBadge status={g.currentStay.status} /> : null}
              </Link>
            ))
          )}
        </Card>
      </div>
    </div>
  );
}
