/**
 * Reproducible verification for Wave 2B — Property Intelligence.
 * Exercises create + status lifecycle, property-scoped isolation, and tenant
 * safety through the real repository. Requires `npm run db:seed` first.
 * Run with: npm run verify:pi
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  localInsights,
  preparationPlaybookActions,
  propertyCapabilities,
  propertyConstraints,
} from "@/db/schema";
import { getAuthContext } from "@/lib/auth/devAuth";
import {
  createCapability,
  createConstraint,
  createLocalInsight,
  createPlaybookAction,
  getPropertyIntelligence,
  listTenantProperties,
  setCapabilityStatus,
  setConstraintActive,
  setInsightStatus,
  setPlaybookStatus,
} from "@/lib/repositories/propertyIntelligence";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* ambient */
}

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}`);
  }
}

async function main() {
  const { tenantId, userId } = await getAuthContext();
  const props = await listTenantProperties(tenantId);
  const atlantic = props.find((p) => p.name === "Atlantic Hideaway");
  const other = props.find((p) => p.id !== atlantic?.id);
  check("two demo properties exist", props.length >= 2 && !!atlantic && !!other);
  if (!atlantic || !other) {
    console.log(`\nProperty Intelligence verification: ${pass} passed, ${fail} failed.`);
    process.exit(1);
  }

  // Seeded data present under Atlantic Hideaway
  const a = await getPropertyIntelligence(tenantId, atlantic.id);
  check("seed: capabilities present", a.capabilities.length >= 2);
  check("seed: local insight present", a.insights.length >= 1);
  check("seed: constraints present", a.constraints.length >= 2);
  check("seed: playbook actions present", a.playbook.length >= 2);

  // Property isolation: the simulation property has no PI data
  const o = await getPropertyIntelligence(tenantId, other.id);
  check(
    "isolation: other property has no PI data",
    o.capabilities.length === 0 && o.insights.length === 0 && o.constraints.length === 0 && o.playbook.length === 0,
  );

  // Create + lifecycle: capability
  const cap = await createCapability(tenantId, userId, atlantic.id, {
    title: "TEST capability",
    categoryTags: ["food", "not_a_real_tag"], // invalid tag must be dropped
    suitableFor: ["quiet"],
  });
  check("create capability persisted", !!cap.id && cap.status === "active");
  check("invalid tags sanitized to canonical", Array.isArray(cap.categoryTags) && (cap.categoryTags as string[]).join() === "food");
  const capPaused = await setCapabilityStatus(tenantId, userId, cap.id, "paused");
  check("capability pause", capPaused.status === "paused");
  const capArch = await setCapabilityStatus(tenantId, userId, cap.id, "archived");
  check("capability archive", capArch.status === "archived");
  const capRestored = await setCapabilityStatus(tenantId, userId, cap.id, "active");
  check("capability restore", capRestored.status === "active");

  // Create + lifecycle: insight
  const ins = await createLocalInsight(tenantId, userId, atlantic.id, {
    title: "TEST insight",
    freshness: "verify_before_use",
  });
  check("create insight (property-private)", ins.visibility === "property_private");
  const insArch = await setInsightStatus(tenantId, userId, ins.id, "archived");
  check("insight archive", insArch.status === "archived");

  // Create + toggle: constraint
  const con = await createConstraint(tenantId, userId, atlantic.id, {
    title: "TEST rule",
    ruleType: "weather",
    severity: "hard",
  });
  check("create constraint", con.active === true && con.severity === "hard");
  const conOff = await setConstraintActive(tenantId, userId, con.id, false);
  check("constraint disable", conOff.active === false);

  // Create + lifecycle: playbook
  const pb = await createPlaybookAction(tenantId, userId, atlantic.id, { title: "TEST prep" });
  check("create playbook action", !!pb.id);
  const pbPaused = await setPlaybookStatus(tenantId, userId, pb.id, "paused");
  check("playbook pause", pbPaused.status === "paused");

  // Tenant safety: cannot attach to a property that isn't this tenant's
  let blocked = false;
  try {
    await createCapability(tenantId, userId, randomUUID(), { title: "should fail" });
  } catch {
    blocked = true;
  }
  check("tenant safety: unknown property_id rejected", blocked);

  // Cleanup: hard-delete the TEST rows this script created so the demo DB the UI
  // reads stays pristine (archive is the product behavior; this is test hygiene).
  const db = getDb();
  await db.delete(propertyCapabilities).where(and(eq(propertyCapabilities.tenantId, tenantId), eq(propertyCapabilities.id, cap.id)));
  await db.delete(localInsights).where(and(eq(localInsights.tenantId, tenantId), eq(localInsights.id, ins.id)));
  await db.delete(propertyConstraints).where(and(eq(propertyConstraints.tenantId, tenantId), eq(propertyConstraints.id, con.id)));
  await db.delete(preparationPlaybookActions).where(and(eq(preparationPlaybookActions.tenantId, tenantId), eq(preparationPlaybookActions.id, pb.id)));
  console.log("  (cleanup) removed TEST rows created during verification");

  console.log(`\nProperty Intelligence verification: ${pass} passed, ${fail} failed.`);
  if (fail > 0) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("PI verification crashed:", e);
    process.exit(1);
  });
