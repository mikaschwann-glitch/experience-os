import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth/devAuth";
import { getGuestMemory } from "@/lib/repositories/guests";
import {
  Avatar,
  Card,
  C,
  EmptyState,
  Field,
  Icon,
  type IconName,
  RationaleNote,
  SectionTitle,
  Select,
  SensitiveNote,
  StatusBadge,
  SubmitButton,
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
  const primaryStay = stays[0] ?? null;
  const contact = [guest.email, guest.language, guest.country].filter(Boolean).join(" · ");

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-[13px]" style={{ color: C.muted }}>
        <Link href="/dashboard/guests" className="no-underline" style={{ color: C.muted }}>
          Guests
        </Link>
        <span style={{ color: C.stone }}>/</span>
        <span style={{ color: C.ink }}>{guest.fullName}</span>
      </div>

      {/* Identity header */}
      <div className="flex flex-wrap items-start gap-4">
        <Avatar name={guest.fullName} tone="clay" size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="text-[24px] font-semibold tracking-tight" style={{ color: C.ink }}>
            {guest.fullName}
          </h1>
          <div className="mt-1 text-[13.5px]" style={{ color: C.muted }}>
            {contact || "No contact details"}
          </div>
          {primaryStay ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px]" style={{ color: C.muted }}>
              <span className="flex items-center gap-1.5">
                <Icon name="bed" size={14} /> {primaryStay.unitName ?? "Unit TBD"}
              </span>
              <span style={{ color: C.stone }}>·</span>
              <span className="flex items-center gap-1.5">
                <Icon name="calendar" size={14} /> {primaryStay.startDate} – {primaryStay.endDate}
              </span>
              <StatusBadge status={primaryStay.status} />
              {primaryStay.visitNumber > 1 ? <span>visit {primaryStay.visitNumber}</span> : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-7 grid grid-cols-1 gap-7 lg:grid-cols-[1fr_330px]">
        {/* ---- Left: the manual chain (the core product workflow) ---- */}
        <div className="space-y-7">
          {/* Capture a signal */}
          <section>
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
                <SubmitButton type="submit">
                  <Icon name="plus" size={15} /> Add signal
                </SubmitButton>
              </form>
            </Card>
          </section>

          {/* Signals -> create insight */}
          <section>
            <SectionTitle>Signals</SectionTitle>
            <div className="mt-3 space-y-3">
              {signals.length === 0 ? (
                <Card>
                  <EmptyState>No signals captured yet.</EmptyState>
                </Card>
              ) : (
                signals.map((s) => (
                  <Card key={s.id} className="p-4">
                    <div className="flex gap-3">
                      <span className="mt-0.5 shrink-0" style={{ color: C.muted }}>
                        <Icon name="note" size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px]" style={{ color: C.ink }}>
                          {s.body}
                        </div>
                        <div className="mt-1 text-[11.5px] capitalize" style={{ color: C.muted }}>
                          {s.type} · {fmt(s.occurredAt)}
                        </div>
                      </div>
                    </div>
                    <form
                      action={createInsightAction.bind(null, s.id, guest.id)}
                      className="mt-3 flex flex-wrap items-end gap-2 pt-3"
                      style={{ borderTop: `1px solid ${C.soft}` }}
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
          </section>

          {/* Insights -> create recommendation */}
          <section>
            <SectionTitle>Insights</SectionTitle>
            <div className="mt-3 space-y-3">
              {insights.length === 0 ? (
                <Card>
                  <EmptyState>No insights yet — create one from a signal above.</EmptyState>
                </Card>
              ) : (
                insights.map((i) => (
                  <Card key={i.id} className="p-4">
                    <div className="text-[13.5px] font-medium" style={{ color: C.ink }}>
                      {i.summary}
                    </div>
                    {i.detail ? (
                      <div className="mt-1 text-[12.5px] leading-relaxed" style={{ color: C.muted }}>
                        {i.detail}
                      </div>
                    ) : null}
                    <div className="mt-1 text-[11px] uppercase tracking-[0.05em]" style={{ color: C.muted }}>
                      {i.generatedBy}
                    </div>
                    <form
                      action={createRecommendationAction.bind(null, i.id, guest.id)}
                      className="mt-3 space-y-2 pt-3"
                      style={{ borderTop: `1px solid ${C.soft}` }}
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
          </section>

          {/* Recommendations -> decision objects -> host action */}
          <section>
            <SectionTitle>Recommendations</SectionTitle>
            <div className="mt-3 space-y-3">
              {recommendations.length === 0 ? (
                <Card>
                  <EmptyState>No recommendations yet.</EmptyState>
                </Card>
              ) : (
                recommendations.map((r) => (
                  <Card key={r.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-[15px] font-semibold" style={{ color: C.ink }}>
                        {r.title}
                      </div>
                      <StatusBadge status={r.status} />
                    </div>
                    {r.description ? (
                      <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: C.muted }}>
                        {r.description}
                      </p>
                    ) : null}
                    {r.rationale ? (
                      <div className="mt-3">
                        <RationaleNote>{r.rationale}</RationaleNote>
                      </div>
                    ) : null}

                    {r.status === "pending" ? (
                      <div className="mt-3 flex items-center gap-2">
                        <form action={acceptRecommendationAction.bind(null, r.id, guest.id)}>
                          <SubmitButton type="submit">
                            <Icon name="check" size={15} /> Approve
                          </SubmitButton>
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
                        className="mt-3 flex flex-wrap items-end gap-2 pt-3"
                        style={{ borderTop: `1px solid ${C.soft}` }}
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
          </section>

          {/* Host actions -> log outcome */}
          <section>
            <SectionTitle>Host actions</SectionTitle>
            <div className="mt-3 space-y-3">
              {hostActions.length === 0 ? (
                <Card>
                  <EmptyState>No host actions planned yet.</EmptyState>
                </Card>
              ) : (
                hostActions.map((h) => (
                  <Card key={h.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 shrink-0" style={{ color: C.muted }}>
                          <Icon name="clipboard" size={16} />
                        </span>
                        <div className="text-[14px] font-medium" style={{ color: C.ink }}>
                          {h.title}
                        </div>
                      </div>
                      <StatusBadge status={h.status} />
                    </div>
                    {h.description ? (
                      <p className="mt-1 pl-7 text-[12.5px] leading-relaxed" style={{ color: C.muted }}>
                        {h.description}
                      </p>
                    ) : null}
                    {h.status !== "done" ? (
                      <form
                        action={logOutcomeAction.bind(null, h.id, guest.id)}
                        className="mt-3 flex flex-wrap items-end gap-2 pt-3"
                        style={{ borderTop: `1px solid ${C.soft}` }}
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
          </section>

          {/* Outcomes */}
          {outcomes.length > 0 ? (
            <section>
              <SectionTitle>Outcomes</SectionTitle>
              <Card className="mt-3 p-4">
                <ul className="space-y-3">
                  {outcomes.map((o) => (
                    <li key={o.id} className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 shrink-0" style={{ color: C.clay }}>
                          <Icon name="check" size={16} />
                        </span>
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
                      </div>
                      <span className="shrink-0 text-[11.5px]" style={{ color: C.muted }}>
                        {fmt(o.occurredAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ) : null}
        </div>

        {/* ---- Right: stay context, sensitive info, audit timeline ---- */}
        <div className="space-y-5">
          <section>
            <SectionTitle>Stay context</SectionTitle>
            <Card className="mt-3 p-4">
              {stays.length === 0 ? (
                <div className="text-[13px]" style={{ color: C.muted }}>
                  No stays on record.
                </div>
              ) : (
                <ul className="space-y-3">
                  {stays.map((s) => (
                    <li key={s.id} className="text-[13px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium" style={{ color: C.ink }}>
                          {s.unitName ?? "Unit TBD"}
                        </span>
                        <StatusBadge status={s.status} />
                      </div>
                      <div className="mt-0.5" style={{ color: C.muted }}>
                        {s.startDate} – {s.endDate}
                        {s.visitNumber > 1 ? ` · visit ${s.visitNumber}` : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>

          {guest.notes ? (
            <SensitiveNote title="Sensitive — handle with care">{guest.notes}</SensitiveNote>
          ) : null}

          <section>
            <SectionTitle>Event timeline</SectionTitle>
            <Card className="mt-3 p-4">
              {events.length === 0 ? (
                <div className="text-[13px]" style={{ color: C.muted }}>
                  No events yet.
                </div>
              ) : (
                <ul className="space-y-0">
                  {events.map((e, i, arr) => (
                    <li key={e.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span
                          className="flex h-7 w-7 items-center justify-center rounded-full"
                          style={{ background: C.paper, color: C.clay }}
                        >
                          <Icon name={EVENT_ICON[e.type] ?? "circle"} size={13} />
                        </span>
                        {i < arr.length - 1 ? (
                          <span className="my-0.5 w-px flex-1" style={{ background: C.soft }} />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1 pb-3.5">
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
          </section>
        </div>
      </div>
    </div>
  );
}
