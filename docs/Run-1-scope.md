# Experience-OS — Run 1 Scope

## Run 1 Verdict

Run 1 is a foundation run.

It is not a product launch, not a full MVP, and not a feature expansion run.

The goal is to build the technical foundation and a manual vertical slice that proves the core data flow.

## Run 1 Goal

Build the foundation for:

Guest Signal → Insight → Recommendation → Host Action → Outcome → Event Log

Everything is manual in Run 1.

No AI.
No voice.
No guest portal.
No live PMS integration.
No payment.
No booking.

## Build Scope

Run 1 builds:

- Next.js App Router
- TypeScript strict
- PostgreSQL
- Drizzle ORM
- Drizzle migrations
- pnpm
- pinned Node version
- dev-auth stub
- one demo tenant
- one demo user
- multi-tenant data model
- tenant-aware repository pattern
- RLS-ready schema
- event log
- transactional event emission
- mock PMS adapter
- minimal host cockpit

## Core Schema

Core schema = 14 domain entities plus 1 join table.

`tenants` is the root table and does not have `tenant_id`.

All tenant-owned tables must have `tenant_id`.

Tables:

1. tenants
2. users
3. integration_connections
4. properties
5. units
6. guests
7. stays
8. consents
9. signals
10. insights
11. recommendations
12. recommendation_insights
13. host_actions
14. outcomes
15. events

## Modeling Rules

Use UUID primary keys.

Use timestamps consistently:

- `created_at`
- `updated_at` where records can change
- `occurred_at` for events/outcomes where applicable

Events are append-only and must not have `updated_at`.

Guests support:

- `deleted_at`
- `anonymized_at`

Stays use:

- `value_amount_cents integer nullable`
- `currency char(3) default 'EUR'`

Do not use a free numeric money field.

## Tenant Isolation

Run 1 uses app-layer tenant scoping.

Mandatory rules:

- every tenant-owned table has `tenant_id`
- every query requires `tenantId`
- every mutation requires `tenantId`
- no generic helpers without `tenantId`
- no direct Drizzle access in React components
- all DB access goes through tenant-aware repository helpers
- client-provided `tenant_id` is never trusted

RLS:

- schema must be RLS-ready
- add TODO notes for future RLS policies
- do not implement fake or half-working RLS
- proper RLS can be added later when auth and tenant context are hardened

## Dev Auth Stub

Run 1 uses only a dev-auth stub.

Rules:

- one demo tenant
- one demo user
- tenantId and userId come from server-side stub
- no production auth provider
- no real tenant switcher
- if a dev-only switcher exists, it must be clearly labeled dev-only

## Event Log

Create a central `emitEvent()` helper.

Event emission must happen in the same DB transaction as the domain mutation where technically possible.

If not possible, document the reason.

Emit events for:

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

Event payload must avoid unnecessary PII.

Events are never updated or deleted.

Use `correlation_id` to connect:

Signal → Insight → Recommendation → HostAction → Outcome

## Mock PMS Adapter

Create interface:

- `pullReservations()`
- `pullGuests()`
- `mapToInternalGuest()`
- `mapToInternalStay()`

Implement only:

- `MockPmsAdapter`

No external API calls.

No MewsAdapter in Run 1.

Internal data model is the source of truth.

## Minimal Host Cockpit

Build simple functional UI.

No design system.

Screens:

1. Today Dashboard
2. Guests List
3. Guest Detail
4. Stay Detail
5. Properties / Units Basic CRUD

## Today Dashboard

Show:

- today’s stays
- active stays
- upcoming arrivals
- open recommendations
- recent host actions

## Guests List

Show:

- guest name
- language
- country
- current/upcoming stay
- number of insights
- open recommendations

## Guest Detail

Show:

- profile
- stays
- signals
- insights
- recommendations
- host actions
- outcomes
- event timeline

Allow:

- create manual text signal
- create manual insight
- create manual recommendation
- accept recommendation
- dismiss recommendation
- create host action
- log outcome

## Stay Detail

Show:

- guest
- unit
- property
- dates
- status
- related recommendations
- related actions
- related outcomes

## Property / Unit CRUD

Only basic CRUD.

Do not build:

- availability calendar
- cleaning workflow
- maintenance workflow
- pricing

## Consent / GDPR

Run 1:

- Consent table only.
- No consent UI.
- No GDPR workflows.
- No export endpoint.
- No anonymization endpoint.

Add TODOs for future:

- export
- anonymization
- consent-based processing
- voice deletion policy
- AVV / data processor setup
- audit trail

## Hard Exclusions

Do not build:

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

If implementation drifts into any excluded area, stop and report.

## Seed Data

Create seed data:

- 1 demo tenant
- 1 demo user
- 1 property
- 2 units
- 3 guests
- 3 stays
- several signals
- several insights
- several recommendations
- recommendation_insights links
- host actions
- outcomes
- events

Demo scenario:

Guest has anniversary → signal → insight → recommendation → host action → outcome → event timeline.

## Verification

At the end run:

- `tsc --noEmit`
- `next build`

Fix all type/build errors.

Do not run lint unless explicitly asked.

## Success Criteria

Run 1 succeeds if:

- schema exists
- migrations exist
- seed data exists
- every tenant-owned table has `tenant_id`
- tenant-aware data access is enforced
- event log exists
- event emission is centralized
- manual Signal → Insight → Recommendation → HostAction → Outcome flow works
- minimal cockpit demonstrates the flow
- mock PMS adapter exists
- no excluded feature was built

Run 1 fails if:

- guest portal is built
- LLM is added
- voice upload/transcription is added
- MEWS live integration is attempted
- payment/booking/accounting is built
- tenant isolation is skipped
- event log is missing
- schema is specific to one hotel only
- implementation exceeds approved scope
