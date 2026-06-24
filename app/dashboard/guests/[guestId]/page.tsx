import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth/devAuth";
import { getGuestMemory } from "@/lib/repositories/guests";
import { canCaptureLearning, listDraftStateForGuest } from "@/lib/repositories/learning";
import { CONTEXT_TAGS, TOPIC_CATEGORIES, tagLabel } from "@/lib/domain/vocabulary";
import {
  Avatar,
  Card,
  C,
  EmptyState,
  Field,
  Icon,
  type IconName,
  SectionTitle,
  Select,
  SensitiveNote,
  StatusBadge,
  SubmitButton,
  TextArea,
  TextInput,
} from "../../_components/ui";
import {
  logOutcomeAction,
  captureLearningAction,
  planPreparationAction,
} from "./actions";

const LEARNING_TYPE_LABEL: Record<string, string> = {
  local_insight: "Local insight",
  constraint: "Constraint / no-go rule",
  capability: "Property capability",
  playbook: "Preparation playbook action",
};

// Host-facing preparation state. 'prepared' (marked ready) and legacy 'done'
// (outcome-logged) both read as "Completed" — never "Prepared", never "Done".
const PREP_STATE_LABEL: Record<string, string> = {
  planned: "Active",
  prepared: "Completed",
  done: "Completed",
  cancelled: "Cancelled",
};

export const dynamic = "force-dynamic";

const EVENT_LABEL: Record<string, string> = {
  "guest.created": "Guest added",
  "stay.created": "Stay created",
  "signal.created": "Note captured",
  "insight.created": "Insight created",
  "recommendation.created": "Suggestion created",
  "recommendation.accepted": "Suggestion approved",
  "recommendation.dismissed": "Suggestion dismissed",
  "host_action.created": "Preparation created",
  "host_action.updated": "Preparation updated",
  "outcome.created": "Outcome logged",
  "preparation.created": "Preparation created",
  "preparation.marked_ready": "Preparation marked ready",
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
  "preparation.marked_ready": "check",
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

  const { guest, stays, hostActions, outcomes, events } = memory;
  // Wave 2D — which outcomes already have a learning draft (any status), so the
  // capture prompt shows its captured state instead of re-prompting.
  const draftByOutcome = await listDraftStateForGuest(tenantId, guestId);
  const captureAvailable = new Map<string, boolean>();
  await Promise.all(
    outcomes
      .filter((o) => !draftByOutcome.get(o.id))
      .map(async (o) => {
        captureAvailable.set(o.id, await canCaptureLearning(tenantId, o.id));
      }),
  );
  const primaryStay = stays[0] ?? null;
  const contact = [guest.email, guest.language, guest.country].filter(Boolean).join(" · ");
  // A preparation must be scoped to a stay with a property.
  const eligibleStays = stays.filter((s) => s.propertyId);
  const singleStay = eligibleStays.length === 1 ? eligibleStays[0] : null;

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
        {/* ---- Left: the primary action + the guest's preparations ---- */}
        <div className="space-y-7">
          {/* PRIMARY action: prepare for this stay (one short input, no taxonomy grid) */}
          {eligibleStays.length > 0 ? (
            <section>
              <SectionTitle>Prepare for this stay</SectionTitle>
              <Card className="mt-3 p-5" style={{ borderColor: C.clay }}>
                <form action={planPreparationAction.bind(null, guest.id)} className="space-y-4">
                  {singleStay ? (
                    <input type="hidden" name="stayId" value={singleStay.id} />
                  ) : (
                    <Field label="Which stay?">
                      <Select name="stayId" defaultValue={eligibleStays[0].id} required>
                        {eligibleStays.map((s) => (
                          <option key={s.id} value={s.id}>
                            {(s.unitName ?? "Unit")} · {s.startDate} – {s.endDate}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )}

                  <Field label="What would help this guest?">
                    <TextArea
                      name="note"
                      rows={2}
                      required
                      placeholder="e.g. They'd like a quiet beach walk away from the crowds."
                    />
                  </Field>

                  <div className="flex flex-wrap items-center gap-3">
                    <Select name="triggerSource" defaultValue="guest_stated" style={{ width: 180 }}>
                      <option value="guest_stated">The guest asked</option>
                      <option value="host_noted">I noticed this</option>
                    </Select>
                    <SubmitButton type="submit">
                      <Icon name="arrowRight" size={15} /> Prepare for this stay
                    </SubmitButton>
                  </div>
                  {singleStay ? (
                    <div className="text-[12px]" style={{ color: C.muted }}>
                      For {singleStay.unitName ?? "this stay"} · {singleStay.startDate} – {singleStay.endDate}
                    </div>
                  ) : null}
                </form>
              </Card>
            </section>
          ) : null}

          {/* Preparations for this guest — the recovery surface (click → work page). */}
          <section>
            <SectionTitle>Preparations</SectionTitle>
            <div className="mt-3 space-y-3">
              {hostActions.length === 0 ? (
                <Card>
                  <EmptyState>No preparations yet — prepare something above.</EmptyState>
                </Card>
              ) : (
                hostActions.map((h) => (
                  <Card key={h.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 shrink-0" style={{ color: C.muted }}>
                          <Icon name="clipboard" size={16} />
                        </span>
                        <Link
                          href={`/dashboard/preparations/${h.id}`}
                          className="text-[14px] font-medium no-underline"
                          style={{ color: C.ink }}
                        >
                          {h.title}
                        </Link>
                      </div>
                      <span
                        className="shrink-0 rounded-full px-2.5 py-[2px] text-[11.5px] font-medium"
                        style={{ background: C.paper, color: C.muted }}
                      >
                        {PREP_STATE_LABEL[h.status] ?? h.status}
                      </span>
                    </div>
                    {h.description ? (
                      <p className="mt-1 pl-7 text-[12.5px] leading-relaxed" style={{ color: C.muted }}>
                        {h.description}
                      </p>
                    ) : null}
                    {h.status !== "done" && h.status !== "cancelled" ? (
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
                          <TextInput name="notes" placeholder="How did it go? (optional)…" />
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

          {/* After the stay — outcomes + optional property learning (collapsed by default) */}
          {outcomes.length > 0 ? (
            <section>
              <SectionTitle>After the stay</SectionTitle>
              <div className="mt-3 space-y-3">
                {outcomes.map((o) => {
                  const draft = draftByOutcome.get(o.id);
                  return (
                    <Card key={o.id} className="p-4">
                      <div className="flex items-start justify-between gap-3">
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
                      </div>

                      <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${C.soft}` }}>
                        {draft ? (
                          <div className="flex items-center gap-2 text-[12.5px]" style={{ color: C.muted }}>
                            <Icon name="recommend" size={14} />
                            <span>
                              Learning {draft.status === "promoted" ? "promoted to Our Place" : draft.status === "discarded" ? "discarded" : "saved as a draft"}
                              {" · "}
                              {LEARNING_TYPE_LABEL[draft.learningType] ?? draft.learningType}
                            </span>
                          </div>
                        ) : captureAvailable.get(o.id) ? (
                          <details data-testid="capture-learning">
                            <summary
                              className="flex cursor-pointer items-center gap-1.5 text-[12.5px] font-medium [&::-webkit-details-marker]:hidden"
                              style={{ listStyleType: "none", color: C.clay }}
                            >
                              <Icon name="plus" size={14} /> Capture a property learning
                            </summary>
                            <form
                              action={captureLearningAction.bind(null, o.id, guest.id)}
                              className="mt-3 space-y-2"
                            >
                              <div className="text-[12px]" style={{ color: C.muted }}>
                                What should this property remember from this?
                              </div>
                              <TextArea
                                name="note"
                                rows={2}
                                required
                                placeholder="e.g. Early breakfast works well when arranged the evening before."
                              />
                              <div className="flex flex-wrap items-center gap-2">
                                <Select name="learningType" defaultValue="local_insight" style={{ width: 230 }}>
                                  <option value="local_insight">Local insight</option>
                                  <option value="constraint">Constraint / no-go rule</option>
                                  <option value="capability">Property capability</option>
                                  <option value="playbook">Preparation playbook action</option>
                                </Select>
                                <SubmitButton type="submit" variant="ghost">
                                  Save learning draft
                                </SubmitButton>
                              </div>
                              <details className="pt-1">
                                <summary className="cursor-pointer text-[12px] font-medium" style={{ color: C.clay }}>
                                  Add relevance tags (optional)
                                </summary>
                                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                                  {[...TOPIC_CATEGORIES, ...CONTEXT_TAGS].map((t) => (
                                    <label key={t} className="flex items-center gap-1.5 text-[12px]" style={{ color: C.ink }}>
                                      <input type="checkbox" name="tags" value={t} /> {tagLabel(t)}
                                    </label>
                                  ))}
                                </div>
                              </details>
                              <div className="text-[11px]" style={{ color: C.muted }}>
                                Optional — saved as a draft for your review under Our Place. Nothing is added automatically.
                              </div>
                            </form>
                          </details>
                        ) : (
                          <div
                            className="flex items-center gap-2 text-[12.5px]"
                            style={{ color: C.muted }}
                            data-testid="capture-unavailable"
                          >
                            <Icon name="circle" size={14} />
                            <span>No property is linked to this preparation — capture unavailable.</span>
                          </div>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>

        {/* ---- Right: stay context, sensitive info, history ---- */}
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
            <details>
              <summary
                className="cursor-pointer [&::-webkit-details-marker]:hidden"
                style={{ listStyleType: "none" }}
              >
                <SectionTitle>History</SectionTitle>
              </summary>
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
            </details>
          </section>
        </div>
      </div>
    </div>
  );
}
