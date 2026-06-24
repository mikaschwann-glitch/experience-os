<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Canonical architecture — mandatory reading

`docs/architecture.md` is the canonical technical and operating-model source of truth for Experience-OS.

Before working on any of the following, you MUST read `docs/architecture.md` first and treat its operating invariants and production boundaries as binding:

- guest or host journeys
- recommendations
- feasibility
- property intelligence
- research
- learning / outcomes
- the core domain model
- engine / API logic

If a planned change would contradict `docs/architecture.md`, stop and report instead of proceeding.

`docs/product-thesis.md` is the separate strategic document. `docs/Run-1-scope.md` is historical Run-1 implementation scope and may no longer reflect the current architecture.
