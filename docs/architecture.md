# Experience-OS — Architecture & Operating Model

> **Canonical source of truth.** This document is the canonical technical and
> operating-model reference for Experience-OS. Implementation work must not drift
> from the decisions and invariants recorded here.
>
> - `docs/product-thesis.md` is the separate **strategic** document (thesis, ICP,
>   positioning). It is not superseded by this file and is not duplicated here.
> - `docs/Run-1-scope.md` is **historical implementation scope** for the original
>   foundation run (Run 1). It may no longer reflect the current architecture —
>   read it as history, not as current truth.

---

## Current System Status

Experience-OS today is a **demo-oriented system**. It runs on a dev-auth stub (one
hardcoded demo tenant + demo user, resolved server-side), uses app-layer tenant
scoping only (no production auth, no RLS policies), and is **not production-ready
for real guest data**. Do not put real guest data into any running instance
(see `docs/cloud-preview.md`).

### Implemented / demo-capable
- Core tenant-aware domain model and the manual lifecycle
  signal → insight → recommendation → host action → outcome, with an append-only
  event log.
  > On the **generic** manual entry point (the guest-page signal → insight →
  > recommendation forms), the lifecycle still reaches `outcome` but not property
  > learning: those recommendations carry no `stayId`, so no causally resolved
  > property is available for `property_learning_drafts`. The implemented reactive
  > first-party slice and its stay-scoped fallback DO reach learning — they create
  > the recommendation in an explicit stay context.
- **Property Intelligence**: property-private capabilities, local insights,
  constraints, and playbook actions.
- **Feasibility engine**: capability/insight/playbook matching against guest
  topics, hard/soft constraint evaluation, freshness/weather handling, and
  deterministic **withholding** ("withhold rather than guess").
- **Reactive first-party slice**: a host note / guest request within a specific
  stay → the shared feasibility core → a canonical `recommendation` (with `stayId`
  + explicit provenance) → host action → outcome → property learning. Includes a
  one-step **idempotent** confirm and a **stay-scoped host-authored fallback** when
  the system withholds. First-party — no consent gate, no external research.
- **Explicit provenance**: `trigger_source` + `externally_researched` columns on
  `recommendations` and `feasibility_runs`, plus a source-signal trace on
  first-party runs (`feasibility_runs.source_signal_id`).
- **Outcome → Property Learning Loop**: host-reviewed learning drafts that promote
  into Property Intelligence, scoped to a causally-resolved property.
- **Pre-Arrival Intelligence / "Research Lab"** — implemented but **simulation /
  fixture / lab-only**: consent gating, deterministic identity confidence,
  evidence classification/blocking, and host-reviewed pre-arrival briefs run
  entirely on controlled fixtures. No live web research, no real guest data.
- Mock PMS adapter (`MockPmsAdapter`) only; no live PMS.

### Planned next
- **First-party, profile-based proactive suggestions** from host-maintained
  profile facts, using the same engine without any external-research path.
- A **"Needs You / Open Work"** host dashboard, once real host actions exist to
  aggregate.

### Blocked from production
The following remain **blocked for production** until a real, lawful, consent-based
data source and the corresponding legal/data-processing setup exist:
- live web research and any external guest profiling;
- identity resolution for real guests;
- third-party guest data of any kind;
- any production use with real guest data (current auth/tenancy is demo-only);
- real PMS / channel / payment / accounting integrations (until separately approved).

The existing research functionality is **simulation / fixture / lab-only** and must
never be represented or shipped as production-ready.

---

## Operating-Model Invariant (binding)

> **Exactly one preparation chain and one withholding gate. Every entry point
> converges on `recommendation` before it becomes a host action. Only externally
> researched preparations require a consent gate.**

The single shared chain is:

`signal or trigger → recommendation → host_action → outcome → learning`

Rules that follow from this and are **binding**:

- There must be **no separate preparation table, no parallel task system, no
  duplicate outcome model, and no duplicate withholding logic.** Every entry point
  (manual host note, guest request, feasibility proposal, future profile match)
  resolves into the **canonical `recommendation`** record and then the existing
  `recommendations → host_actions → outcomes` lifecycle, with learning captured via
  `property_learning_drafts` → promoted Property Intelligence.
- Withholding is implemented **once** (in the feasibility/matching logic,
  `lib/feasibility/engine.ts`). New entry points reuse it; they do not reimplement it.
- `feasibility_runs` / `feasibility_proposals` / `feasibility_proposal_evidence`
  are an **upstream feasibility staging artifact**, not a second chain: an accepted
  proposal converts into a canonical `recommendation`
  (`lib/repositories/feasibility.ts`), after which it follows the one shared chain.
  Proposals are how the engine stages and explains candidates; they are not a
  parallel task or outcome model.
- Implementation note: on the manual path, `insight` is an intermediate node
  between signal and recommendation; "learning" denotes `property_learning_drafts`
  promoted into Property Intelligence. The canonical statement above is the
  operating model; these are the concrete records that realize it.

---

## Entry Points & Provenance

Three **orthogonal** axes describe a recommendation's origin. **Do not conflate them.**

- **`trigger_source`** — where the trigger originated. **Implemented** (nullable
  Postgres enum `trigger_source` on `recommendations` and `feasibility_runs`).
  Values:
  - `guest_stated` — the guest stated a wish/need directly.
  - `host_noted` — the host recorded an observation or a maintained profile fact.
  - `system_profile_match` — reserved for the future profile path.
  Null means "no first-party human/profile trigger recorded" (e.g. a research/brief
  run, or the generic manual path).
- **`externally_researched`** — a separate **boolean**. **Implemented**
  (`NOT NULL DEFAULT false` on `recommendations` and `feasibility_runs`). Set
  EXPLICITLY by each adapter, **never inferred from `brief_id`**: the research/brief
  adapter persists `true`; the first-party adapter persists `false`;
  `acceptProposal` / `confirmProposal` copy it from the run onto the recommendation.
  - `false` for first-party guest statements and host-maintained facts.
  - `true` only for information obtained through an external research path.
- **`generated_by`** — the **generation mechanism**. **Implemented** as a Postgres
  enum (`generated_by` on `recommendations` and `insights`). Values:
  `manual`, `rules`, `llm`. (`llm` is reserved; no LLM generation is built or
  permitted in production — see AI Architecture.)

Trigger provenance, external-research status, and generation mechanism are
independent. A `host_noted` / `externally_researched=false` / `generated_by=rules`
recommendation and a `system_profile_match` / `externally_researched=true` /
`generated_by=rules` recommendation are different things and must be distinguishable.

---

## First-Party vs. External-Research Boundary

- **Guest requests and host-maintained profile facts are first-party operational
  inputs.** They may be used for recommendation generation **without** routing
  through the external research / identity-resolution flow. Their operational gate
  is **host review and approval** (human-in-the-loop), not a research consent gate.
- **External research, live web research, identity resolution, and third-party
  guest data remain blocked for production** until a real, lawful, consent-based
  data source exists (with the corresponding legal/data-processing setup).
- The existing research pipeline (Pre-Arrival Intelligence / Research Lab) is
  **simulation / fixture / lab-only** and must not be represented as
  production-ready. Its consent gate (`consent_grants`) and identity/evidence
  machinery apply to that simulated path; first-party inputs do not pass through it.

---

## Experience Intelligence & Property Intelligence

The product's core differentiation is **not** generic guest-data collection. It is a
**property-private operational intelligence system** that connects:

- guest signals,
- host observations,
- property-specific capabilities (`property_capabilities`),
- local insights (`local_insights`),
- constraints (`property_constraints`),
- playbook actions (`preparation_playbook_actions`),
- and outcomes (`outcomes`) feeding the learning loop.

**Binding grounding-and-withholding principle:**

> The system may recommend only preparations that are grounded in this property's
> **active** property-specific knowledge — capabilities (`property_capabilities`),
> validated playbook actions (`preparation_playbook_actions`), or local insights
> (`local_insights`) — matched on the shared canonical vocabulary. When
> identity/confidence, capability/topic overlap, freshness, or constraints are
> insufficient, the system **withholds rather than guesses**.

Also binding:

- **Property Intelligence never crosses property or tenant boundaries.** Knowledge
  is property-private; reads and promotions are always scoped to one
  `(tenant_id, property_id)`. Learning attaches only to a **causally-resolved**
  property (never guessed).
- **Host-authored actions remain possible when the system withholds.** A clean
  "no safe recommendation" is a valid outcome; it does not block the host from
  creating a host action himself.
- **Human judgement is the gate for host-created actions.** Withholding protects
  against the *system* guessing; a host deciding to act on his own property is the
  human gate.

---

## Architecture Verdict

Experience-OS is a simple monorepo with one application, one database, one language,
and clear modular boundaries.

No microservices. No separate backend service. No separate vector database. No
custom PMS/payment/channel/accounting systems.

The architecture optimizes for:

- multi-tenancy
- clean data model
- event logging
- future PMS integrations
- future AI/LLM workflows (behind interfaces, not in production)
- future guest portal
- outcome learning

## Conceptual Layers

Experience-OS has three conceptual layers:

1. **Host Cockpit** — implemented (operator-facing host product).
2. **Guest Portal** — not built (future).
3. **Engine + API** — implemented (the product core).

### Host Cockpit
The operator-facing product. Built surfaces: today dashboard, guests, guest detail,
recommendations, research lab (simulation), property intelligence, feasibility runs,
properties/units CRUD, and the per-guest event timeline.

### Guest Portal
Guest-facing surface (magic link, PWA, stay overview, experiences, feedback,
rebooking). **Not built.** Remains a future layer.

### Engine + API
The product core: signal intake, structured insights, recommendations, host actions,
outcomes, event log, the deterministic feasibility/withholding engine, the simulated
research pipeline, and the property-learning loop. (No external AI; no live PMS sync.)

## Tech Stack

Use:

- Next.js App Router
- TypeScript strict
- PostgreSQL
- Drizzle ORM
- Drizzle migrations
- server-side route handlers / server actions where appropriate
- one monorepo
- one database

Do not use:

- microservices
- separate backend service
- separate vector DB
- external AI in production
- live PMS integration

## Database Choice

Use PostgreSQL.

Reasons:

- relational structure fits Guest → Stay → Signal → Insight → Recommendation → Outcome
- JSONB supports flexible metadata
- future RLS support
- future pgvector support
- strong constraints
- works well for multi-tenant SaaS

## ORM

Use Drizzle.

Reasons:

- TypeScript-first
- schema clarity
- migration control
- SQL closeness
- good fit for constraints and future RLS
- less black-box than heavy ORMs

## Multi-Tenancy

`tenants` is the root table. All tenant-owned tables include `tenant_id`.
Tenant-owned access must always be tenant-scoped. The system uses app-layer tenant
scoping.

Rules:

- all queries include `tenantId`
- all mutations include `tenantId`
- no helper without `tenantId`
- no direct Drizzle access in React components
- no client-provided `tenant_id` trust
- all domain access through repository functions

RLS:

- schema is RLS-ready (tenant_id everywhere + indexes)
- actual RLS policies are not implemented yet
- no fake RLS
- production RLS requires a real auth/tenant context and proper DB role setup

## Data Access Pattern

Good: `getGuestById(tenantId, guestId)` — Bad: `getGuestById(guestId)`

Good: `createSignal(tenantId, userId, input)` — Bad: `createSignal(inputWithTenantIdFromClient)`

The repository layer (`lib/repositories/*`) enforces this pattern.

---

## Core Domain Model

The schema is organized by build wave. Every table is tenant-owned (`tenant_id`
referencing `tenants(id)` ON DELETE CASCADE) except the root `tenants` table. Names
below are the **actual** Drizzle table names (`db/schema/*`); do not invent variants.

### Run 1 core — implemented
`tenants`, `users`, `integration_connections`, `properties`, `units`, `guests`,
`stays`, `consents`, `signals`, `insights`, `recommendations`,
`recommendation_insights`, `host_actions`, `outcomes`, `events`.

(`consents` is the generic Run-1 consent table — schema-only, not an active gate in
any flow. The research consent gate is `consent_grants`, below.)

### Wave 2A — Pre-Arrival Intelligence / Research Lab — implemented, simulation/fixture-only
`consent_grants`, `research_jobs`, `research_sources`, `identity_candidates`,
`evidence_items`, `prearrival_briefs`, `brief_items`, `policy_incidents`.

These tables are real but exercised only by the deterministic, fixture-driven
simulation. `consent_grants` is the research-scoped consent gate. No live data.

### Wave 2B — Property Intelligence — implemented
`property_capabilities`, `local_insights`, `property_constraints`,
`preparation_playbook_actions`. Each carries a mandatory `property_id`; matchable
tags are canonical-vocabulary tokens (`lib/domain/vocabulary.ts`).

### Wave 2C — Feasibility — implemented
`feasibility_runs`, `feasibility_proposals`, `feasibility_proposal_evidence`.
Upstream staging that converges on `recommendation` (see Operating-Model Invariant).
`feasibility_runs.brief_id` is **nullable** (first-party runs have no brief); the run
also carries `trigger_source`, `externally_researched`, and `source_signal_id` (the
causal link back to the originating first-party signal).

### Wave 2D — Outcome → Property Learning Loop — implemented
`property_learning_drafts` — host-reviewed staging rows that promote into one of the
four Wave 2B tables; carries provenance back-links plus a forward link to the
promoted item.

### Wave 2D.1 — Reactive first-party provenance — implemented
No new tables. `recommendations` gained `trigger_source` (nullable enum) +
`externally_researched` (bool, default false); `feasibility_runs` gained the same
two plus `source_signal_id` and a nullable `brief_id`. The shared `trigger_source`
enum lives in the leaf module `db/schema/enums.ts`.

### Planned (not yet in the schema)
- **No new task/outcome/learning tables are planned** — new entry points reuse the
  one shared chain.

## Event Log

Events are append-only. Events must not have `updated_at`. Events must never be
updated or deleted. Events must avoid unnecessary PII (store ids/types/status, never
free guest text). Event emission happens in the **same DB transaction** as the
domain mutation where technically possible.

Events are used for: auditability, debugging, the learning loop, outcome analysis,
and a future recommendation model.

The Run-1 core tracks: guest created, stay created, signal created, insight created,
recommendation created, recommendation accepted, recommendation dismissed, host
action created, host action updated, outcome created. Later waves (research,
property intelligence, feasibility, learning) emit additional PII-light event types
under the same append-only rules.

Use `correlation_id` to connect a Run-1 chain:
Signal → Insight → Recommendation → HostAction → Outcome.

## PMS Integration Architecture

Experience-OS is **PMS-agnostic**. External systems map into the internal model; the
internal model is the source of truth.

Interface:

- `pullReservations()`
- `pullGuests()`
- `mapToInternalGuest()`
- `mapToInternalStay()`

Implemented: `MockPmsAdapter` only. Later: a real read-only adapter (e.g. MEWS). Do
not let any external PMS shape the core schema.

### Optional future operational modules (boundary)

- Experience-OS **may** maintain an internal operational stay model where the
  Experience-OS workflow requires it.
- Future **lightweight** operational modules **may** provide read-only or
  synchronised views over externally-owned booking, payment, or invoice information.
- Webhook-based synchronisation and booking-linked operational overviews are allowed
  as **optional future extensions**.
- Experience-OS **must not** become the system of record for booking, payment,
  accounting, tax logic, invoicing compliance, channel management, or revenue
  management.
- The strategic rule stands: **integrate the commodity layer; do not rebuild the
  hotel software stack.**

None of these operational modules is built today. They are optional future
extensions only. Nothing here positions Experience-OS as a booking engine,
accounting system, payment system, or full PMS replacement.

## Auth Architecture

Current: **dev-auth stub only** — one demo tenant, one demo user, server-side
`tenantId`/`userId`. There is no production auth provider and no real tenant
switcher.

A production auth provider is added later, once the tenant and role model is stable;
tenant/user are then derived from the authenticated session/membership rather than a
hardcoded slug. Production use with real data is blocked until this exists.

## RLS Strategy

Current:

- `tenant_id` everywhere
- tenant-aware repository
- indexes on `tenant_id`
- migration TODOs for RLS

Later (production):

- production auth provider
- DB role setup
- RLS policies
- tests for tenant isolation

Do not implement half-working RLS.

## Storage Strategy

No object storage today. Later storage will be needed for voice files, attachments,
media, and guest-facing assets. Voice files must later be stored encrypted and
deleted per policy after transcription. (Voice/transcription remain unbuilt.)

## Async Jobs

No async jobs today. Later async jobs will be needed for transcription, any future
extraction, recommendation generation, PMS sync, messaging workflows, and scheduled
recommendations. Possible tools later: Inngest, Trigger.dev.

## AI Architecture

No AI in production. The deterministic engines (identity scoring, evidence
classification, feasibility/withholding) are intentionally rule-based and reproducible.

Later AI, if introduced, must sit behind interfaces (`AiClient`,
`TranscriptionClient`, `InsightExtractor`, `RecommendationGenerator`) and must not
hardcode provider-specific logic into domain code. AI outputs must include: model
name, prompt version, validation status, human approval status. (`generated_by=llm`
is reserved for this future case and is not used today.)

## Folder Structure

Actual repository layout (no `src/` prefix):

- `docs/`
  - `architecture.md` (this file — canonical)
  - `product-thesis.md` (strategic)
  - `Run-1-scope.md` (historical Run-1 scope)
  - `design-system.md`, `cloud-preview.md`
- `app/` — Next.js App Router (host cockpit). Routes under `app/dashboard/*`
  (`guests`, `recommendations`, `research-lab`, `feasibility`,
  `property-intelligence`, `properties`), each with its `actions.ts` server actions;
  shared UI in `app/dashboard/_components/`.
- `db/` — `db/client.ts`, `db/schema/*` (`index`, `research`, `propertyIntelligence`,
  `feasibility`, `learning`), `db/migrations/*`, `db/seed.ts`.
- `lib/` — `lib/auth`, `lib/domain` (canonical vocabulary), `lib/events`, `lib/pms`,
  `lib/repositories`, `lib/research`, `lib/feasibility`.
- `scripts/` — `seed.ts`, `verify-*.ts`.
- `tests/` — `tests/acceptance` (Playwright), `tests/integration`, `tests/setup`.

Domain logic must not live in React components; all DB access goes through the
tenant-aware repositories in `lib/repositories`.

---

## Roadmap

This replaces the former Run 1–6 "Run Plan", which was inaccurate (the system was
actually built as Run 1 + Waves 2A–2D, not the planned Run 2–6 sequence).

### Implemented foundation
- Original core lifecycle and tenant-aware model
  (signal → insight → recommendation → host action → outcome + event log).
- Property Intelligence (capabilities, local insights, constraints, playbook actions).
- Feasibility / constraints / withholding.
- Outcome → Property Learning Loop.
- Simulated Pre-Arrival Intelligence / Research Lab (fixture-only).
- **Reactive first-party slice** — host note / guest request within a stay → the
  shared (decoupled) feasibility core → `recommendation` (with `stayId` + explicit
  provenance) → host action → outcome → learning; one-step idempotent confirm; a
  stay-scoped host-authored fallback on withhold. No external research path.

### Immediate next sequence
1. **First-party, profile-based proactive suggestions** — host-maintained profile
   facts → the same engine, with no external-research path; gated by host
   review/approval.
2. **"Needs You / Open Work" dashboard** — only after real host actions exist to
   aggregate.

### Blocked
(Same boundary as "Blocked from production" above.)
- live web research,
- external guest profiling,
- identity resolution for real guests,
- third-party guest data,
- any production use without a lawful, consent-based data source,
- real PMS integrations until separately approved.

---

## Architecture Success Criteria

The architecture is successful if:

- it supports multi-tenancy from day one,
- it keeps the internal model PMS-agnostic,
- it holds the one-chain / one-withholding-gate operating invariant across every
  entry point,
- it keeps Property Intelligence property-private and never crosses property/tenant
  boundaries,
- it keeps external research blocked from production until a lawful consent-based
  data source exists,
- it logs the core guest-intelligence flow,
- it avoids rebuilding commodity hotel software,
- it allows later auth/LLM/voice/PMS/guest portal without rewrite,
- it remains small enough for a solo/small-team build.
