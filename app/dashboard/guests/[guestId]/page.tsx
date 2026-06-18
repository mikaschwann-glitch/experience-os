import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth/devAuth";
import { getGuestMemory } from "@/lib/repositories/guests";
import {
  Card,
  C,
  Field,
  SectionTitle,
  Select,
  SensitiveNote,
  StatusBadge,
  SubmitButton,
  Tag,
  TextArea,
  TextInput,
} from "../../_components/ui";
import {
  acceptRecommendationAction,
  createHostActionAction,
  createInsightAction,
  createRecommendationAction,
  createSignalAction,
  dismissRecommendationAction,
  logOutcomeAction,
} from "./actions";

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

function fmt(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function GuestMemoryPage({
  params,
}: {
  params: Promise<{ guestId: string }>;
}) {
  const { guestId } = await params;
  const { tenantId } = await getAuthContext();
  const memory = await getGuestMemory(tenantId, guestId);
  if (!memory) notFound();

  const { guest, stays, signals, insights, recommendations, hostActions, outcomes, events } =
    memory;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-[13px]" style={{ color: C.muted }}>
        <Link href="/dashboard/guests" className="no-underline" style={{ color: C.muted }}>
          Guests
        </Link>
        <span style={{ color: C.stone }}>/</span>
        <span style={{ color: C.ink }}>{guest.fullName}</span>
      </div>

      <h1 className="text-[24px] font-semibold tracking-tight" style={{ color: C.ink }}>
        {guest.fullName}
      </h1>
      <div className="mt-1 text-[13.5px]" style={{ color: C.muted }}>
        {[guest.email, guest.language, guest.country].filter(Boolean).join(" · ") || "No contact details"}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-7 lg:grid-cols-[1fr_320px]">
        {/* ---- Left: the manual chain ---- */}
        <div className="space-y-7">
          {/* Capture a signal */}
          <div>
            <SectionTitle>Capture a signal</SectionTitle>
            <Card className="mt-3 p-4">
              <form action={createSignalAction.bind(null, guest.id)} className="space-y-3">
                <Field label="What did the guest tell you?">
                  <TextArea
                    name="body"
                    rows={3}
                    required
                    placeholder="e.g. Mentioned it's their tenth anniversary; asked about quiet sunrise spots."
                  />
                </Field>
                <SubmitButton type="submit">Add signal</SubmitButton>
              </form>
            </Card>
          </div>

          {/* Signals -> create insight */}
          <div>
            <SectionTitle>Signals</SectionTitle>
            <div className="mt-3 space-y-3">
              {signals.length === 0 ? (
                <Card className="p-4 text-[13px]" style={{ color: C.muted }}>
                  No signals yet.
                </Card>
              ) : (
                signals.map((s) => (
                  <Card key={s.id} className="p-4">
                    <div className="text-[13.5px]" style={{ color: C.ink }}>
                      {s.body}
                    </div>
                    <div className="mt-1 text-[11.5px]" style={{ color: C.muted }}>
                      {s.type} · {fmt(s.occurredAt)}
                    </div>
                    <form
                      action={createInsightAction.bind(null, s.id, guest.id)}
                      className="mt-3 flex flex-wrap items-end gap-2"
                    >
                      <div className="min-w-[220px] flex-1">
                        <TextInput name="summary" required placeholder="Summarize the insight…" />
                      </div>
                      <SubmitButton type="submit" variant="ghost">
                        Create insight
                      </SubmitButton>
                    </form>
                  </Card>
                ))
              )}
            </div>
          </div>

          {/* Insights -> create recommendation */}
          <div>
            <SectionTitle>Insights</SectionTitle>
            <div className="mt-3 space-y-3">
              {insights.length === 0 ? (
                <Card className="p-4 text-[13px]" style={{ color: C.muted }}>
                  No insights yet.
                </Card>
              ) : (
                insights.map((i) => (
                  <Card key={i.id} className="p-4">
                    <div className="text-[13.5px] font-medium" style={{ color: C.ink }}>
                      {i.summary}
                    </div>
                    {i.detail ? (
                      <div className="mt-1 text-[12.5px]" style={{ color: C.muted }}>
                        {i.detail}
                      </div>
                    ) : null}
                    <div className="mt-1 text-[11px] uppercase tracking-[0.05em]" style={{ color: C.muted }}>
                      {i.generatedBy}
                    </div>
                    <form
                      action={createRecommendationAction.bind(null, i.id, guest.id)}
                      className="mt-3 space-y-2"
                    >
                      <TextInput name="title" required placeholder="Recommendation title…" />
                      <TextInput name="description" placeholder="Short description (optional)…" />
                      <SubmitButton type="submit" variant="ghost">
                        Create recommendation
                      </SubmitButton>
                    </form>
                  </Card>
                ))
              )}
            </div>
          </div>

          {/* Recommendations -> accept/dismiss -> host action */}
          <div>
            <SectionTitle>Recommendations</SectionTitle>
            <div className="mt-3 space-y-3">
              {recommendations.length === 0 ? (
                <Card className="p-4 text-[13px]" style={{ color: C.muted }}>
                  No recommendations yet.
                </Card>
              ) : (
                recommendations.map((r) => (
                  <Card key={r.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-[14px] font-semibold" style={{ color: C.ink }}>
                        {r.title}
                      </div>
                      <StatusBadge status={r.status} />
                    </div>
                    {r.description ? (
                      <p className="mt-1 text-[13px] leading-relaxed" style={{ color: C.muted }}>
                        {r.description}
                      </p>
                    ) : null}
                    {r.rationale ? (
                      <p className="mt-2 text-[12.5px] italic" style={{ color: C.muted }}>
                        Why: {r.rationale}
                      </p>
                    ) : null}

                    {r.status === "pending" ? (
                      <div className="mt-3 flex gap-2">
                        <form action={acceptRecommendationAction.bind(null, r.id, guest.id)}>
                          <SubmitButton type="submit">Approve</SubmitButton>
                        </form>
                        <form action={dismissRecommendationAction.bind(null, r.id, guest.id)}>
                          <SubmitButton type="submit" variant="ghost">
                            Dismiss
                          </SubmitButton>
                        </form>
                      </div>
                    ) : null}

                    {r.status === "accepted" ? (
                      <form
                        action={createHostActionAction.bind(null, r.id, guest.id)}
                        className="mt-3 flex flex-wrap items-end gap-2"
                      >
                        <div className="min-w-[220px] flex-1">
                          <TextInput name="title" required placeholder="Host action to prepare…" />
                        </div>
                        <SubmitButton type="submit" variant="ghost">
                          Plan host action
                        </SubmitButton>
                      </form>
                    ) : null}
                  </Card>
                ))
              )}
            </div>
          </div>

          {/* Host actions -> log outcome */}
          <div>
            <SectionTitle>Host actions</SectionTitle>
            <div className="mt-3 space-y-3">
              {hostActions.length === 0 ? (
                <Card className="p-4 text-[13px]" style={{ color: C.muted }}>
                  No host actions yet.
                </Card>
              ) : (
                hostActions.map((h) => (
                  <Card key={h.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-[14px] font-medium" style={{ color: C.ink }}>
                        {h.title}
                      </div>
                      <StatusBadge status={h.status} />
                    </div>
                    {h.description ? (
                      <p className="mt-1 text-[12.5px]" style={{ color: C.muted }}>
                        {h.description}
                      </p>
                    ) : null}
                    {h.status !== "done" ? (
                      <form
                        action={logOutcomeAction.bind(null, h.id, guest.id)}
                        className="mt-3 flex flex-wrap items-end gap-2"
                      >
                        <Select name="result" defaultValue="positive" style={{ width: 140 }}>
                          <option value="positive">Positive</option>
                          <option value="neutral">Neutral</option>
                          <option value="negative">Negative</option>
                          <option value="unknown">Unknown</option>
                        </Select>
                        <div className="min-w-[200px] flex-1">
                          <TextInput name="notes" placeholder="Outcome notes (optional)…" />
                        </div>
                        <SubmitButton type="submit" variant="ghost">
                          Log outcome
                        </SubmitButton>
                      </form>
                    ) : null}
                  </Card>
                ))
              )}
            </div>
          </div>

          {/* Outcomes */}
          {outcomes.length > 0 ? (
            <div>
              <SectionTitle>Outcomes</SectionTitle>
              <Card className="mt-3 p-4">
                <ul className="space-y-3">
                  {outcomes.map((o) => (
                    <li key={o.id} className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[13px] font-medium capitalize" style={{ color: C.ink }}>
                          {o.result}
                        </div>
                        {o.notes ? (
                          <div className="text-[12.5px]" style={{ color: C.muted }}>
                            {o.notes}
                          </div>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-[11.5px]" style={{ color: C.muted }}>
                        {fmt(o.occurredAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          ) : null}
        </div>

        {/* ---- Right: profile, stays, sensitive, timeline ---- */}
        <div className="space-y-5">
          <div>
            <SectionTitle>Stays</SectionTitle>
            <Card className="mt-3 p-4">
              {stays.length === 0 ? (
                <div className="text-[13px]" style={{ color: C.muted }}>
                  No stays on record.
                </div>
              ) : (
                <ul className="space-y-3">
                  {stays.map((s) => (
                    <li key={s.id} className="text-[13px]">
                      <div className="font-medium" style={{ color: C.ink }}>
                        {s.unitName ?? "Unit TBD"}
                      </div>
                      <div style={{ color: C.muted }}>
                        {s.startDate} – {s.endDate} · <span className="capitalize">{s.status.replace("_", " ")}</span>
                        {s.visitNumber > 1 ? ` · visit ${s.visitNumber}` : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {guest.notes ? (
            <SensitiveNote title="Sensitive — handle with care">{guest.notes}</SensitiveNote>
          ) : null}

          <div>
            <SectionTitle>Event timeline</SectionTitle>
            <Card className="mt-3 p-4">
              {events.length === 0 ? (
                <div className="text-[13px]" style={{ color: C.muted }}>
                  No events yet.
                </div>
              ) : (
                <ul className="space-y-3">
                  {events.map((e) => (
                    <li key={e.id} className="flex items-start gap-3">
                      <span
                        className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: C.clay }}
                      />
                      <div>
                        <div className="text-[12.5px]" style={{ color: C.ink }}>
                          {EVENT_LABEL[e.type] ?? e.type}
                        </div>
                        <div className="text-[11px]" style={{ color: C.muted }}>
                          {fmt(e.occurredAt)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Tag>Tenant-scoped · {guest.tenantId.slice(0, 8)}…</Tag>
        </div>
      </div>
    </div>
  );
}
