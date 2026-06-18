# Experience-OS — Architecture

## Architecture Verdict

Experience-OS should start as a simple monorepo with one application, one database, one language, and clear modular boundaries.

No microservices in the beginning.

No separate backend service.

No separate vector database.

No custom PMS/payment/channel/accounting systems.

The architecture must optimize for:

- multi-tenancy
- clean data model
- event logging
- future PMS integrations
- future AI/LLM workflows
- future guest portal
- future outcome learning

## Conceptual Layers

Experience-OS has three conceptual layers:

1. Host Cockpit
2. Guest Portal
3. Engine + API

Run 1 builds only the Host Cockpit foundation and Engine/API foundation.

Guest Portal comes later.

## Host Cockpit

The Host Cockpit is the operator-facing product.

It supports:

- today dashboard
- guests
- stays
- signals
- insights
- recommendations
- host actions
- outcomes
- event timeline
- properties/units basic CRUD

Run 1 builds a minimal functional version.

## Guest Portal

The Guest Portal will later be guest-facing.

It will use:

- magic link
- PWA capability
- stay overview
- buddy book
- experiences
- host contact
- feedback
- rebooking / next location

Run 1 does not build guest portal.

## Engine + API

The engine is the product core.

It manages:

- signal intake
- structured insights
- recommendations
- host actions
- outcomes
- event log
- later LLM/recommendation logic
- later PMS sync
- later learning loops

Run 1 only implements manual engine flows.

## Tech Stack

Use:

- Next.js App Router
- TypeScript strict
- PostgreSQL
- Drizzle ORM
- Drizzle migrations
- pnpm
- pinned Node version
- server-side route handlers / server actions where appropriate
- one monorepo
- one database

Do not use:

- microservices
- separate backend service
- separate vector DB
- external AI in Run 1
- live PMS integration in Run 1

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

`tenants` is the root table.

All tenant-owned tables include `tenant_id`.

Tenant-owned access must always be tenant-scoped.

Run 1 uses app-layer tenant scoping.

Rules:

- all queries include `tenantId`
- all mutations include `tenantId`
- no helper without `tenantId`
- no direct Drizzle access in React components
- no client-provided tenant_id trust
- all domain access through repository functions

RLS:

- schema is RLS-ready
- actual RLS is not required in Run 1
- no fake RLS
- future RLS requires auth/tenant context and proper DB role setup

## Data Access Pattern

Good:

`getGuestById(tenantId, guestId)`

Bad:

`getGuestById(guestId)`

Good:

`createSignal(tenantId, userId, input)`

Bad:

`createSignal(inputWithTenantIdFromClient)`

Repository layer must enforce this pattern.

## Core Domain Model

Core schema = 14 domain entities plus 1 join table.

Tables:

- tenants
- users
- integration_connections
- properties
- units
- guests
- stays
- consents
- signals
- insights
- recommendations
- recommendation_insights
- host_actions
- outcomes
- events

## Event Log

Events are append-only.

Events must not have `updated_at`.

Events must never be updated or deleted.

Events must avoid unnecessary PII.

Event emission should happen in the same DB transaction as the domain mutation where technically possible.

Events are used for:

- auditability
- debugging
- later learning loop
- outcome analysis
- future recommendation model

Events should track:

- guest created
- stay created
- signal created
- insight created
- recommendation created
- recommendation accepted
- recommendation dismissed
- host action created
- host action updated
- outcome created

Use `correlation_id` to connect:

Signal → Insight → Recommendation → HostAction → Outcome

## PMS Integration Architecture

Experience-OS should be PMS-agnostic.

External systems map into the internal model.

Internal model is the source of truth.

Create interface:

- `pullReservations()`
- `pullGuests()`
- `mapToInternalGuest()`
- `mapToInternalStay()`

Run 1 implements only:

- `MockPmsAdapter`

Later:

- `MewsAdapter`

Do not let MEWS shape the core schema.

## Auth Architecture

Run 1 uses dev-auth stub only.

Reason:

Production auth would expand scope and distract from foundation.

Run 1 requires:

- one demo tenant
- one demo user
- server-side tenantId
- server-side userId

Later auth provider can be added once tenant and role model is stable.

## RLS Strategy

Run 1:

- tenant_id everywhere
- tenant-aware repository
- indexes on tenant_id
- migration TODOs for RLS

Later:

- production auth provider
- DB role setup
- RLS policies
- tests for tenant isolation

Do not implement half-working RLS.

## Storage Strategy

Run 1 does not need object storage.

Later storage will be needed for:

- voice files
- attachments
- possible media
- guest-facing assets

Voice files should later be stored encrypted and deleted according to policy after transcription.

## Async Jobs

Run 1 does not need async jobs.

Later async jobs will be needed for:

- transcription
- LLM extraction
- recommendation generation
- PMS sync
- messaging workflows
- scheduled recommendations

Possible tools later:

- Inngest
- Trigger.dev

## AI Architecture

No AI in Run 1.

Later AI should be behind interfaces:

- `AiClient`
- `TranscriptionClient`
- `InsightExtractor`
- `RecommendationGenerator`

Do not hardcode provider-specific logic into domain code.

AI outputs must later include:

- model name
- prompt version
- validation status
- human approval status

## Folder Structure

Recommended:

- `docs/`
  - `product-thesis.md`
  - `run-1-scope.md`
  - `design-direction.md`
  - `architecture.md`
- `src/app/dashboard`
- `src/app/dashboard/guests`
- `src/app/dashboard/stays`
- `src/app/dashboard/properties`
- `src/app/api`
- `src/db/client.ts`
- `src/db/schema/*`
- `src/db/migrations/*`
- `src/lib/auth`
- `src/lib/tenancy`
- `src/lib/events`
- `src/lib/pms`
- `src/lib/engine`
- `src/types`
- `scripts/seed.ts`

Domain logic must not live in React components.

## Run Plan

### Run 1 — Foundation

Build:

- schema
- migrations
- seed data
- tenant scoping
- event log
- dev auth stub
- mock PMS adapter
- minimal host cockpit
- manual vertical slice

### Run 2 — Signal to Insight

Add:

- text/voice intake
- transcription
- LLM extraction
- insight validation
- AI audit fields

### Run 3 — Recommendation Engine

Add:

- rules engine
- LLM recommendation generation
- timing logic
- host approval
- task generation

### Run 4 — Guest Portal / PWA

Add:

- magic link
- stay overview
- buddy book
- experiences
- feedback
- optional PWA install

### Run 5 — PMS Integration

Add:

- MEWS read-only adapter
- reservation sync
- guest sync
- mapping to internal model

### Run 6 — Outcome Learning

Add:

- playbook management
- lightweight analytics
- outcome reporting
- learning loop
- later ML/reward model

## Architecture No-Go List

Do not build in Run 1:

- guest portal
- PWA
- native app
- magic link
- voice upload
- transcription
- LLM
- AI recommendation generation
- MEWS live integration
- payment
- booking
- channel manager
- accounting
- revenue management
- smart locks
- messaging/email/WhatsApp automation
- experience booking
- billing
- analytics dashboard
- ML/reward model
- push notifications
- consent UI
- GDPR workflows
- cleaning workflow
- maintenance workflow
- pricing
- availability calendar
- full design system

## Architecture Success Criteria

The architecture is successful if:

- it supports multi-tenancy from day one
- it keeps the internal model PMS-agnostic
- it logs the core guest-intelligence flow
- it avoids rebuilding commodity hotel software
- it allows later LLM/voice/PMS/guest portal without rewrite
- it remains small enough for a solo/small-team build
