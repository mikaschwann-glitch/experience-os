import Link from "next/link";
import { getAuthContext } from "@/lib/auth/devAuth";
import { listLabScenarios } from "@/lib/repositories/research";
import { Card, C, EmptyState, Icon, PageHeader, SectionTitle, SubmitButton } from "../_components/ui";
import { runScenarioAction, withdrawConsentAction } from "./actions";

export const dynamic = "force-dynamic";

function ConsentBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    granted: { bg: C.clayLight, fg: C.clayDark, label: "Consent granted" },
    withdrawn: { bg: C.soft, fg: C.muted, label: "Consent withdrawn" },
    none: { bg: C.chip, fg: C.muted, label: "No consent" },
  };
  const s = map[status] ?? map.none;
  return (
    <span className="rounded-full px-2.5 py-[2px] text-[11.5px] font-medium" style={{ background: s.bg, color: s.fg }}>
      {s.label}
    </span>
  );
}

export default async function ResearchLabPage() {
  const { tenantId } = await getAuthContext();
  const scenarios = await listLabScenarios(tenantId);

  return (
    <div>
      <PageHeader
        title="Pre-Arrival Intelligence — Research Lab"
        subtitle="A controlled simulation of the future consent-based pre-arrival pipeline."
      />

      {/* Persistent simulation banner */}
      <div
        className="mt-5 flex items-center gap-3 rounded-xl px-4 py-3"
        style={{ background: C.warn, border: `1px solid ${C.soft}` }}
      >
        <span style={{ color: C.clayDark }}>
          <Icon name="clipboard" size={18} />
        </span>
        <span className="text-[13px] font-medium" style={{ color: C.ink }}>
          Simulation only — fictional identities and controlled source fixtures. No live web
          research, no real guests, no external data.
        </span>
      </div>

      <div className="mt-7">
        <SectionTitle>Scenarios</SectionTitle>
        <div className="mt-3 space-y-4">
          {scenarios.length === 0 ? (
            <Card>
              <EmptyState>
                No scenarios seeded. Run <code>npm run db:seed</code>.
              </EmptyState>
            </Card>
          ) : (
            scenarios.map((s) => {
              // Only offer a run when at least one subject has granted consent.
              // Otherwise show a clear blocked state rather than a no-op button.
              const runnable = s.subjects.some((x) => x.consentStatus === "granted");
              const blockedLabel = s.subjects.every((x) => x.consentStatus === "withdrawn")
                ? "Consent withdrawn — simulation blocked"
                : "No consent — simulation blocked";
              return (
              <Card key={s.key} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold" style={{ color: C.ink }}>
                      {s.title}
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed" style={{ color: C.muted }}>
                      {s.description}
                    </p>
                  </div>
                  {runnable ? (
                    <form action={runScenarioAction.bind(null, s.key)}>
                      <SubmitButton type="submit">
                        <Icon name="arrowRight" size={15} /> Run simulation
                      </SubmitButton>
                    </form>
                  ) : (
                    <span
                      className="inline-flex items-center rounded-md px-3.5 py-2 text-[13px] font-medium"
                      style={{ background: C.chip, color: C.muted, border: `1px solid ${C.soft}` }}
                    >
                      {blockedLabel}
                    </span>
                  )}
                </div>

                <div className="mt-4 space-y-2 pt-4" style={{ borderTop: `1px solid ${C.soft}` }}>
                  {s.subjects.map((subj) => (
                    <div key={subj.fullName} className="flex flex-wrap items-center gap-3 text-[13px]">
                      <span className="font-medium" style={{ color: C.ink }}>
                        {subj.fullName}
                      </span>
                      <ConsentBadge status={subj.consentStatus} />
                      {subj.latestJob ? (
                        <span className="capitalize" style={{ color: C.muted }}>
                          last run: {subj.latestJob.status.replace("_", " ")}
                        </span>
                      ) : (
                        <span style={{ color: C.muted }}>not run yet</span>
                      )}
                      <div className="ml-auto flex items-center gap-3">
                        {subj.latestJob ? (
                          <Link
                            href={`/dashboard/research-lab/${subj.latestJob.id}`}
                            className="text-[12.5px] font-medium no-underline"
                            style={{ color: C.clay }}
                          >
                            View result →
                          </Link>
                        ) : null}
                        {subj.consentStatus === "granted" && subj.guestId ? (
                          <form action={withdrawConsentAction.bind(null, subj.guestId)}>
                            <SubmitButton type="submit" variant="ghost" style={{ padding: "5px 10px", fontSize: 12 }}>
                              Withdraw consent
                            </SubmitButton>
                          </form>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
