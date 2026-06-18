import Link from "next/link";
import { getAuthContext } from "@/lib/auth/devAuth";
import { listPendingRecommendations } from "@/lib/repositories/recommendations";
import { Card, C, SectionTitle, SensitiveNote, SubmitButton } from "../_components/ui";
import { approveAction, dismissAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function RecommendationsPage() {
  const { tenantId } = await getAuthContext();
  const pending = await listPendingRecommendations(tenantId);

  return (
    <div>
      <h1 className="text-[24px] font-semibold tracking-tight" style={{ color: C.ink }}>
        Recommendations
      </h1>
      <p className="mt-2 text-[14px]" style={{ color: C.muted }}>
        Suggested gestures awaiting your approval. Nothing is sent to the guest — you prepare it
        yourself.
      </p>

      <div className="mt-6">
        <SectionTitle>Awaiting approval</SectionTitle>
        <div className="mt-3 space-y-3">
          {pending.length === 0 ? (
            <Card className="p-5 text-[13px]" style={{ color: C.muted }}>
              Nothing awaiting approval right now.
            </Card>
          ) : (
            pending.map((r) => (
              <Card key={r.id} className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold" style={{ color: C.ink }}>
                      {r.title}
                    </div>
                    <Link
                      href={`/dashboard/guests/${r.guestId}`}
                      className="text-[12.5px] no-underline"
                      style={{ color: C.clay }}
                    >
                      For {r.guestName}
                    </Link>
                    {r.description ? (
                      <p className="mt-2 text-[13px] leading-relaxed" style={{ color: C.muted }}>
                        {r.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <form action={approveAction.bind(null, r.id)}>
                      <SubmitButton type="submit">Approve</SubmitButton>
                    </form>
                    <form action={dismissAction.bind(null, r.id)}>
                      <SubmitButton type="submit" variant="ghost">
                        Dismiss
                      </SubmitButton>
                    </form>
                  </div>
                </div>
                {r.rationale ? (
                  <div className="mt-3">
                    <SensitiveNote title="Why this may matter">{r.rationale}</SensitiveNote>
                  </div>
                ) : null}
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
