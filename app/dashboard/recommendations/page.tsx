import Link from "next/link";
import { getAuthContext } from "@/lib/auth/devAuth";
import { listPendingRecommendations } from "@/lib/repositories/recommendations";
import {
  Card,
  C,
  EmptyState,
  Icon,
  PageHeader,
  RationaleNote,
  SectionTitle,
  SubmitButton,
} from "../_components/ui";
import { approveAction, dismissAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function RecommendationsPage() {
  const { tenantId } = await getAuthContext();
  const pending = await listPendingRecommendations(tenantId);

  return (
    <div>
      <PageHeader
        title="Recommendations"
        subtitle="Suggested gestures awaiting your approval. Nothing is sent to the guest — you prepare it yourself."
      />

      <div className="mt-6">
        <SectionTitle
          right={
            <span className="text-[12.5px]" style={{ color: C.muted }}>
              {pending.length} awaiting
            </span>
          }
        >
          Awaiting approval
        </SectionTitle>
        <div className="mt-3 space-y-3">
          {pending.length === 0 ? (
            <Card>
              <EmptyState>Nothing awaiting approval right now.</EmptyState>
            </Card>
          ) : (
            pending.map((r) => (
              <Card key={r.id} className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[16px] font-semibold leading-snug" style={{ color: C.ink }}>
                      {r.title}
                    </div>
                    <Link
                      href={`/dashboard/guests/${r.guestId}`}
                      className="mt-0.5 inline-flex items-center gap-1.5 text-[12.5px] no-underline"
                      style={{ color: C.clay }}
                    >
                      <Icon name="user" size={13} /> For {r.guestName}
                    </Link>
                    {r.description ? (
                      <p className="mt-2.5 text-[13px] leading-relaxed" style={{ color: C.muted }}>
                        {r.description}
                      </p>
                    ) : null}
                    {r.rationale?.trim() ? (
                      <div className="mt-3 max-w-[560px]">
                        <RationaleNote>{r.rationale}</RationaleNote>
                      </div>
                    ) : null}
                  </div>

                  {/* One primary action (Approve), one quiet secondary (Dismiss). */}
                  <div className="flex shrink-0 flex-col items-stretch gap-2">
                    <form action={approveAction.bind(null, r.id)}>
                      <SubmitButton type="submit" style={{ width: "100%" }}>
                        <Icon name="check" size={15} /> Approve
                      </SubmitButton>
                    </form>
                    <form action={dismissAction.bind(null, r.id)}>
                      <SubmitButton type="submit" variant="ghost" style={{ width: "100%" }}>
                        Dismiss
                      </SubmitButton>
                    </form>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
