import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth/devAuth";
import {
  getPropertyIntelligence,
  listActiveCapabilities,
  listTenantProperties,
} from "@/lib/repositories/propertyIntelligence";
import { listLearningDrafts } from "@/lib/repositories/learning";
import {
  CONTEXT_TAGS,
  TOPIC_CATEGORIES,
  tagLabel,
} from "@/lib/domain/vocabulary";
import {
  Card,
  C,
  Field,
  Icon,
  PageHeader,
  SectionTitle,
  SubmitButton,
  Select,
  Tag,
  TextArea,
  TextInput,
} from "../_components/ui";
import {
  addCapabilityAction,
  addConstraintAction,
  addInsightAction,
  addPlaybookAction,
  setCapabilityStatusAction,
  setConstraintActiveAction,
  setInsightStatusAction,
  setPlaybookStatusAction,
  promoteLearningDraftAction,
  discardLearningDraftAction,
} from "./actions";

export const dynamic = "force-dynamic";

const LEARNING_TYPE_LABEL: Record<string, string> = {
  local_insight: "Local insight",
  constraint: "Constraint",
  capability: "Capability",
  playbook: "Playbook action",
};

function draftTitle(note: string): string {
  const oneLine = note.replace(/\s+/g, " ").trim();
  return oneLine.length <= 72 ? oneLine : oneLine.slice(0, 69).trimEnd() + "…";
}

function PiStatus({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string }> = {
    active: { bg: C.clayLight, fg: C.clayDark },
    paused: { bg: C.chip, fg: C.muted },
    archived: { bg: C.soft, fg: C.muted },
  };
  const s = map[status] ?? { bg: C.chip, fg: C.muted };
  return (
    <span className="rounded-full px-2.5 py-[2px] text-[11px] font-medium capitalize" style={{ background: s.bg, color: s.fg }}>
      {status}
    </span>
  );
}

function Chips({ values }: { values: unknown }) {
  const arr = Array.isArray(values) ? (values as string[]) : [];
  if (arr.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {arr.map((t) => (
        <Tag key={t}>{tagLabel(t)}</Tag>
      ))}
    </div>
  );
}

// Canonical tag checkboxes (engine-critical: only canonical tokens are offered).
function TagChecks({ name, options, label }: { name: string; options: readonly string[]; label: string }) {
  return (
    <div>
      <div className="mb-1 text-[12px] font-medium" style={{ color: C.muted }}>
        {label}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {options.map((o) => (
          <label key={o} className="flex items-center gap-1.5 text-[12.5px]" style={{ color: C.ink }}>
            <input type="checkbox" name={name} value={o} /> {tagLabel(o)}
          </label>
        ))}
      </div>
    </div>
  );
}

function Details({ children }: { children: React.ReactNode }) {
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-[12.5px] font-medium" style={{ color: C.clay }}>
        Add details (optional)
      </summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  );
}

/**
 * Adaptive add-form: open by default when the section is empty (guided first
 * entry), collapsed behind a compact CTA once the section has items. After a
 * successful create the page re-renders with the section non-empty, so it
 * returns to the compact CTA view. Native <details> — no client JS.
 */
function AddForm({
  open,
  cta,
  children,
}: {
  open: boolean;
  cta: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <details open={open}>
        <summary
          className="flex cursor-pointer items-center gap-2 px-4 py-3 text-[13.5px] font-medium [&::-webkit-details-marker]:hidden"
          style={{ listStyleType: "none", color: C.clay }}
        >
          <Icon name="plus" size={15} /> {cta}
        </summary>
        <div className="px-4 pb-4 pt-1">{children}</div>
      </details>
    </Card>
  );
}

const EFFORT_OPTS = (
  <>
    <option value="">Host effort…</option>
    <option value="low">Low effort</option>
    <option value="medium">Medium effort</option>
    <option value="high">High effort</option>
  </>
);
const COST_OPTS = (
  <>
    <option value="">Cost…</option>
    <option value="none">No cost</option>
    <option value="low">Low cost</option>
    <option value="medium">Medium cost</option>
    <option value="high">High cost</option>
  </>
);

function LifecycleButtons({
  status,
  action,
}: {
  status: string;
  action: (status: "active" | "paused" | "archived") => Promise<void>;
}) {
  return (
    <div className="mt-3 flex gap-2">
      {status === "active" ? (
        <form action={action.bind(null, "paused")}>
          <SubmitButton type="submit" variant="ghost" style={{ padding: "4px 10px", fontSize: 12 }}>
            Pause
          </SubmitButton>
        </form>
      ) : null}
      {status === "paused" ? (
        <form action={action.bind(null, "active")}>
          <SubmitButton type="submit" variant="ghost" style={{ padding: "4px 10px", fontSize: 12 }}>
            Activate
          </SubmitButton>
        </form>
      ) : null}
      {status !== "archived" ? (
        <form action={action.bind(null, "archived")}>
          <SubmitButton type="submit" variant="ghost" style={{ padding: "4px 10px", fontSize: 12 }}>
            Archive
          </SubmitButton>
        </form>
      ) : (
        <form action={action.bind(null, "active")}>
          <SubmitButton type="submit" variant="ghost" style={{ padding: "4px 10px", fontSize: 12 }}>
            Restore
          </SubmitButton>
        </form>
      )}
    </div>
  );
}

export default async function PropertyIntelligencePage({
  searchParams,
}: {
  searchParams: Promise<{ property?: string }>;
}) {
  const { tenantId } = await getAuthContext();
  const propsList = await listTenantProperties(tenantId);
  if (propsList.length === 0) notFound();

  const sp = await searchParams;
  const selected = propsList.find((p) => p.id === sp.property) ?? propsList[0];
  const { capabilities, insights, constraints, playbook } = await getPropertyIntelligence(
    tenantId,
    selected.id,
  );
  const activeCaps = await listActiveCapabilities(tenantId, selected.id);
  // Wave 2D — open learning drafts captured from outcomes, awaiting host review.
  const learningDrafts = await listLearningDrafts(tenantId, selected.id);

  return (
    <div>
      <PageHeader
        title="Our Place"
        subtitle="What we know about our homes, our local area, and what works for guests."
        right={
          <Link
            href="/dashboard/properties"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium no-underline"
            style={{ background: C.surface, color: C.ink, border: `1px solid ${C.stone}` }}
          >
            <Icon name="properties" size={15} /> Homes
          </Link>
        }
      />

      {/* Privacy banner */}
      <div
        className="mt-5 flex items-center gap-3 rounded-xl px-4 py-3"
        style={{ background: C.warn, border: `1px solid ${C.soft}` }}
      >
        <span style={{ color: C.clayDark }}>
          <Icon name="clipboard" size={18} />
        </span>
        <span className="text-[13px] font-medium" style={{ color: C.ink }}>
          Private to this property — never shared with other properties or tenants, never shown to
          guests. It feeds future host-reviewed preparations only.
        </span>
      </div>

      {/* Property switcher */}
      {propsList.length > 1 ? (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="text-[12.5px]" style={{ color: C.muted }}>
            Property:
          </span>
          {propsList.map((p) => {
            const active = p.id === selected.id;
            return (
              <Link
                key={p.id}
                href={`/dashboard/property-intelligence?property=${p.id}`}
                className="rounded-md px-3 py-1.5 text-[12.5px] font-medium no-underline"
                style={{
                  background: active ? C.clay : C.surface,
                  color: active ? "#FFF" : C.ink,
                  border: active ? "none" : `1px solid ${C.stone}`,
                }}
              >
                {p.name}
              </Link>
            );
          })}
        </div>
      ) : null}

      {/* Quick Add (future hook: outcome logging / host actions / voice capture) */}
      <div className="mt-6">
        <Card className="p-4" style={{ borderColor: C.stone }}>
          <div className="flex items-center gap-2">
            <span style={{ color: C.clay }}>
              <Icon name="plus" size={16} />
            </span>
            <span className="text-[14px] font-semibold" style={{ color: C.ink }}>
              Quick add a local insight
            </span>
          </div>
          <p className="mt-1 text-[12.5px]" style={{ color: C.muted }}>
            Just say what you learned in your own words. You can add structure later.
          </p>
          <form action={addInsightAction.bind(null, selected.id)} className="mt-3 space-y-2">
            <TextInput name="title" required placeholder="Short title, e.g. “Quiet coastal route”" />
            <TextArea
              name="description"
              rows={2}
              placeholder="“The route near the coast is ideal before 08:00, but only in good weather. Avoid Saturday mornings.”"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Select name="freshness" defaultValue="stable" style={{ width: 200 }}>
                <option value="stable">Stable (rarely changes)</option>
                <option value="verify_before_use">Verify before use</option>
                <option value="dynamic">Dynamic (changes often)</option>
              </Select>
              <SubmitButton type="submit">Add insight</SubmitButton>
            </div>
          </form>
        </Card>
      </div>

      {/* ===== Learning drafts (captured from outcomes; awaiting review) ===== */}
      {learningDrafts.length > 0 ? (
        <section className="mt-6" data-testid="learning-drafts">
          <SectionTitle>Learning drafts</SectionTitle>
          <p className="mt-1 mb-3 text-[12.5px] leading-relaxed" style={{ color: C.muted }}>
            Captured from completed outcomes. Drafts are review-only — nothing here can
            become active, matchable property knowledge yet. You can review or discard them.
          </p>
          <div className="space-y-2">
            {learningDrafts.map((d) => {
              const dtags = Array.isArray(d.tags) ? (d.tags as string[]) : [];
              return (
                <Card key={d.id} className="p-4" style={{ borderColor: C.stone }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-[14px] font-medium" style={{ color: C.ink }}>
                      {d.note}
                    </div>
                    <span
                      className="shrink-0 rounded-full px-2.5 py-[2px] text-[11px] font-medium"
                      style={{ background: C.clayLight, color: C.clayDark }}
                    >
                      → {LEARNING_TYPE_LABEL[d.learningType] ?? d.learningType}
                    </span>
                  </div>
                  <div className="mt-1 text-[11.5px]" style={{ color: C.muted }}>
                    From a logged outcome
                    {d.feasibilityProposalId ? " · via a feasibility proposal" : ""}
                  </div>
                  {dtags.length > 0 ? <Chips values={dtags} /> : null}

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span
                      className="flex items-center gap-1.5 text-[12.5px]"
                      style={{ color: C.muted }}
                      data-testid="promote-disabled"
                    >
                      <Icon name="circle" size={13} /> Review only — promotion to active
                      property knowledge isn’t available yet.
                    </span>
                    <form action={discardLearningDraftAction.bind(null, d.id, selected.id)}>
                      <SubmitButton type="submit" variant="ghost" style={{ padding: "4px 10px", fontSize: 12 }}>
                        Discard
                      </SubmitButton>
                    </form>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* ===== A. Capabilities ===== */}
      <Section
        title="What this property can do"
        hint="e.g. early breakfast possible · route/map preparation · local welcome note · transfer coordination · picnic basket · quiet celebration setup"
      >
        <AddForm open={capabilities.length === 0} cta="Add capability">
          <form action={addCapabilityAction.bind(null, selected.id)} className="space-y-2">
            <TextInput name="title" required placeholder="Capability, e.g. “Early breakfast from 06:30”" />
            <TextArea name="description" rows={2} placeholder="In your words: what exactly can you do, and any caveats?" />
            <Details>
              <TagChecks name="categoryTags" options={TOPIC_CATEGORIES} label="Categories" />
              <TagChecks name="suitableFor" options={CONTEXT_TAGS} label="Suitable for" />
              <TagChecks name="unsuitableFor" options={CONTEXT_TAGS} label="Not suitable for" />
              <TextInput name="leadTime" placeholder="Lead time, e.g. “evening before”" />
              <div className="flex gap-2">
                <Select name="hostEffort" style={{ width: 170 }}>{EFFORT_OPTS}</Select>
                <Select name="costLevel" style={{ width: 150 }}>{COST_OPTS}</Select>
              </div>
            </Details>
            <SubmitButton type="submit">Add capability</SubmitButton>
          </form>
        </AddForm>

        {capabilities.length === 0 ? null : (
          <div className="mt-3 space-y-2">
            {capabilities.map((c) => (
              <Card key={c.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-[14px] font-medium" style={{ color: C.ink }}>{c.title}</div>
                  <PiStatus status={c.status} />
                </div>
                {c.description ? <p className="mt-1 text-[13px]" style={{ color: C.muted }}>{c.description}</p> : null}
                <Chips values={c.categoryTags} />
                <LifecycleButtons status={c.status} action={setCapabilityStatusAction.bind(null, c.id)} />
              </Card>
            ))}
          </div>
        )}
      </Section>

      {/* ===== B. Local insights ===== */}
      <Section
        title="Local knowledge only you have"
        hint="e.g. a quiet route you know · a local craft insight · a seasonal landscape detail · a low-key food spot · a hidden viewpoint · a partner reliability note"
      >
        <AddForm open={insights.length === 0} cta="Add local insight">
          <form action={addInsightAction.bind(null, selected.id)} className="space-y-2">
            <TextInput name="title" required placeholder="Insight title" />
            <TextArea name="description" rows={2} placeholder="In your own words…" />
            <div className="flex flex-wrap items-center gap-2">
              <Select name="freshness" defaultValue="stable" style={{ width: 200 }}>
                <option value="stable">Stable</option>
                <option value="verify_before_use">Verify before use</option>
                <option value="dynamic">Dynamic</option>
              </Select>
            </div>
            <Details>
              <TagChecks name="categoryTags" options={TOPIC_CATEGORIES} label="Categories" />
              <TagChecks name="suitableFor" options={CONTEXT_TAGS} label="Suitable for" />
              <TagChecks name="unsuitableFor" options={CONTEXT_TAGS} label="Not suitable for" />
              <div className="flex flex-wrap gap-2">
                <TextInput name="bestTimeOfDay" placeholder="Best time of day" style={{ width: 180 }} />
                <TextInput name="seasonalSuitability" placeholder="Season" style={{ width: 150 }} />
                <TextInput name="weatherDependency" placeholder="Weather, e.g. good weather only" style={{ width: 220 }} />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <TextInput name="distanceDuration" placeholder="Distance / duration" style={{ width: 200 }} />
                <label className="flex items-center gap-1.5 text-[12.5px]" style={{ color: C.ink }}>
                  <input type="checkbox" name="reservationRequired" /> Reservation required
                </label>
                <Select name="hostEffort" style={{ width: 170 }}>{EFFORT_OPTS}</Select>
              </div>
            </Details>
            <SubmitButton type="submit">Add local insight</SubmitButton>
          </form>
        </AddForm>

        {insights.length === 0 ? null : (
          <div className="mt-3 space-y-2">
            {insights.map((i) => (
              <Card key={i.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-[14px] font-medium" style={{ color: C.ink }}>{i.title}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px]" style={{ color: C.muted }}>{i.freshness.replace(/_/g, " ")}</span>
                    <PiStatus status={i.status} />
                  </div>
                </div>
                {i.description ? <p className="mt-1 text-[13px]" style={{ color: C.muted }}>{i.description}</p> : null}
                <Chips values={i.categoryTags} />
                <div className="mt-1 text-[11px]" style={{ color: C.muted }}>Visibility: {i.visibility.replace(/_/g, " ")}</div>
                <LifecycleButtons status={i.status} action={setInsightStatusAction.bind(null, i.id)} />
              </Card>
            ))}
          </div>
        )}
      </Section>

      {/* ===== C. Constraints ===== */}
      <Section
        title="What the system should never suggest"
        hint="e.g. no long trips for stays under two nights · no outdoor routes in uncertain weather · avoid crowded spots Saturday mornings · nothing car-dependent without transfer · no big surprises without evidence"
      >
        <AddForm open={constraints.length === 0} cta="Add rule">
          <form action={addConstraintAction.bind(null, selected.id)} className="space-y-2">
            <TextInput name="title" required placeholder="Rule, e.g. “Avoid Saturday-morning crowds”" />
            <TextArea name="description" rows={2} placeholder="Describe the rule in your own words…" />
            <Details>
              <div className="flex flex-wrap gap-2">
                <Select name="ruleType" defaultValue="exclusion" style={{ width: 180 }}>
                  <option value="exclusion">Exclusion</option>
                  <option value="timing">Timing</option>
                  <option value="weather">Weather</option>
                  <option value="mobility">Mobility</option>
                  <option value="suitability">Suitability</option>
                  <option value="partner">Partner</option>
                  <option value="other">Other</option>
                </Select>
                <Select name="severity" defaultValue="soft" style={{ width: 200 }}>
                  <option value="soft">Soft (prefer to avoid)</option>
                  <option value="hard">Hard (never)</option>
                </Select>
              </div>
              <TagChecks name="applicabilityTags" options={CONTEXT_TAGS} label="Applies to (optional)" />
            </Details>
            <SubmitButton type="submit">Add rule</SubmitButton>
          </form>
        </AddForm>

        {constraints.length === 0 ? null : (
          <div className="mt-3 space-y-2">
            {constraints.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-[14px] font-medium" style={{ color: C.ink }}>{r.title}</div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full px-2 py-[2px] text-[11px] font-medium" style={{ background: r.severity === "hard" ? C.clayLight : C.chip, color: r.severity === "hard" ? C.clayDark : C.muted }}>
                      {r.severity} · {r.ruleType}
                    </span>
                    <PiStatus status={r.active ? "active" : "paused"} />
                  </div>
                </div>
                {r.description ? <p className="mt-1 text-[13px]" style={{ color: C.muted }}>{r.description}</p> : null}
                <Chips values={r.applicabilityTags} />
                <div className="mt-3">
                  <form action={setConstraintActiveAction.bind(null, r.id, !r.active)}>
                    <SubmitButton type="submit" variant="ghost" style={{ padding: "4px 10px", fontSize: 12 }}>
                      {r.active ? "Disable" : "Enable"}
                    </SubmitButton>
                  </form>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Section>

      {/* ===== D. Playbook ===== */}
      <Section
        title="Preparations you repeat"
        hint="e.g. prepare early breakfast · add a hand-drawn route card · prepare a local craft note · arrange transfer · create a quiet arrival setup"
      >
        <AddForm open={playbook.length === 0} cta="Add preparation">
          <form action={addPlaybookAction.bind(null, selected.id)} className="space-y-2">
            <TextInput name="title" required placeholder="Preparation, e.g. “Prepare local craft note”" />
            <TextArea name="description" rows={2} placeholder="What do you do, step by step?" />
            <Details>
              {activeCaps.length > 0 ? (
                <Field label="Linked capability (optional)">
                  <Select name="linkedCapabilityId" defaultValue="">
                    <option value="">— none —</option>
                    {activeCaps.map((c) => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </Select>
                </Field>
              ) : null}
              <TagChecks name="suitableFor" options={CONTEXT_TAGS} label="Suitable for" />
              <div className="flex flex-wrap gap-2">
                <TextInput name="leadTime" placeholder="Lead time" style={{ width: 170 }} />
                <Select name="hostEffort" style={{ width: 170 }}>{EFFORT_OPTS}</Select>
                <Select name="costLevel" style={{ width: 150 }}>{COST_OPTS}</Select>
              </div>
            </Details>
            <SubmitButton type="submit">Add preparation</SubmitButton>
          </form>
        </AddForm>

        {playbook.length === 0 ? null : (
          <div className="mt-3 space-y-2">
            {playbook.map((a) => (
              <Card key={a.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-[14px] font-medium" style={{ color: C.ink }}>{a.title}</div>
                  <PiStatus status={a.status} />
                </div>
                {a.description ? <p className="mt-1 text-[13px]" style={{ color: C.muted }}>{a.description}</p> : null}
                <Chips values={a.suitableFor} />
                <LifecycleButtons status={a.status} action={setPlaybookStatusAction.bind(null, a.id)} />
              </Card>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <SectionTitle>{title}</SectionTitle>
      <p className="mt-1 mb-3 text-[12.5px] leading-relaxed" style={{ color: C.muted }}>
        {hint}
      </p>
      {children}
    </section>
  );
}
