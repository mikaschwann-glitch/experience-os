import Link from "next/link";
import { getAuthContext } from "@/lib/auth/devAuth";
import { listGuestsWithSummary } from "@/lib/repositories/guests";
import { Card, C, SectionTitle } from "../_components/ui";

export const dynamic = "force-dynamic";

export default async function GuestsPage() {
  const { tenantId } = await getAuthContext();
  const guests = await listGuestsWithSummary(tenantId);

  return (
    <div>
      <h1 className="text-[24px] font-semibold tracking-tight" style={{ color: C.ink }}>
        Guests
      </h1>
      <p className="mt-2 text-[14px]" style={{ color: C.muted }}>
        The people behind every stay.
      </p>

      <div className="mt-6">
        <SectionTitle>All guests</SectionTitle>
        <Card className="mt-3 overflow-hidden">
          {guests.length === 0 ? (
            <div className="px-5 py-6 text-[13px]" style={{ color: C.muted }}>
              No guests yet. Run <code>npm run db:seed</code> to load the demo data.
            </div>
          ) : (
            guests.map((g, i, arr) => (
              <Link
                key={g.id}
                href={`/dashboard/guests/${g.id}`}
                className="flex items-center gap-4 px-5 py-4 no-underline"
                style={{
                  borderBottom: i === arr.length - 1 ? "none" : `1px solid ${C.soft}`,
                  color: C.ink,
                }}
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold"
                  style={{ background: C.chip, color: C.muted }}
                >
                  {g.fullName.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium">{g.fullName}</div>
                  <div className="mt-0.5 text-[12.5px]" style={{ color: C.muted }}>
                    {g.currentStay
                      ? `${g.currentStay.unitName ?? "Unit TBD"} · ${g.currentStay.startDate} – ${g.currentStay.endDate}`
                      : "No stay on record"}
                  </div>
                </div>
                <div className="hidden gap-6 text-[12.5px] sm:flex" style={{ color: C.muted }}>
                  <span>{g.insightCount} insights</span>
                  <span>{g.openRecommendationCount} open recs</span>
                </div>
                {g.currentStay ? (
                  <span className="text-[12.5px] capitalize" style={{ color: C.muted }}>
                    {g.currentStay.status.replace("_", " ")}
                  </span>
                ) : null}
              </Link>
            ))
          )}
        </Card>
      </div>
    </div>
  );
}
