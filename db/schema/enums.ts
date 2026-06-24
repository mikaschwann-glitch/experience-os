/**
 * Shared schema enums with NO intra-schema imports.
 *
 * Lives in its own leaf module so it is fully initialized before either `index.ts`
 * (recommendations) or `feasibility.ts` (feasibility_runs) reference it — avoiding
 * a temporal-dead-zone error in the index ↔ feasibility import cycle.
 */
import { pgEnum } from "drizzle-orm/pg-core";

// Provenance: where a trigger originated. Distinct from `generated_by` (mechanism)
// and `externally_researched` (data-source class). Nullable on the tables: null
// means "no first-party human/profile trigger recorded" (e.g. research-originated
// rows). See docs/architecture.md › Entry Points & Provenance.
export const triggerSourceEnum = pgEnum("trigger_source", [
  "guest_stated",
  "host_noted",
  "system_profile_match",
]);
