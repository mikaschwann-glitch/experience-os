"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/devAuth";
import {
  createCapability,
  createConstraint,
  createLocalInsight,
  createPlaybookAction,
  setCapabilityStatus,
  setConstraintActive,
  setInsightStatus,
  setPlaybookStatus,
} from "@/lib/repositories/propertyIntelligence";

/**
 * Property Intelligence server actions. tenantId/userId always come from the
 * server-side dev-auth stub; property ownership is verified in the repository
 * (client-supplied property_id is never trusted).
 */
const PATH = "/dashboard/property-intelligence";

function s(fd: FormData, name: string): string {
  return String(fd.get(name) ?? "").trim();
}
function tags(fd: FormData, name: string): string[] {
  return fd.getAll(name).map(String);
}
function opt(v: string): string | null {
  return v ? v : null;
}
type Effort = "low" | "medium" | "high";
type Cost = "none" | "low" | "medium" | "high";
function effort(v: string): Effort | null {
  return v === "low" || v === "medium" || v === "high" ? v : null;
}
function cost(v: string): Cost | null {
  return v === "none" || v === "low" || v === "medium" || v === "high" ? v : null;
}

export async function addCapabilityAction(propertyId: string, fd: FormData) {
  const { tenantId, userId } = await getAuthContext();
  const title = s(fd, "title");
  if (!title) return;
  await createCapability(tenantId, userId, propertyId, {
    title,
    description: opt(s(fd, "description")),
    categoryTags: tags(fd, "categoryTags"),
    suitableFor: tags(fd, "suitableFor"),
    unsuitableFor: tags(fd, "unsuitableFor"),
    leadTime: opt(s(fd, "leadTime")),
    hostEffort: effort(s(fd, "hostEffort")),
    costLevel: cost(s(fd, "costLevel")),
  });
  revalidatePath(PATH);
}

export async function addInsightAction(propertyId: string, fd: FormData) {
  const { tenantId, userId } = await getAuthContext();
  const title = s(fd, "title");
  if (!title) return;
  const freshnessRaw = s(fd, "freshness");
  const freshness =
    freshnessRaw === "verify_before_use" || freshnessRaw === "dynamic"
      ? freshnessRaw
      : "stable";
  await createLocalInsight(tenantId, userId, propertyId, {
    title,
    description: opt(s(fd, "description")),
    categoryTags: tags(fd, "categoryTags"),
    suitableFor: tags(fd, "suitableFor"),
    unsuitableFor: tags(fd, "unsuitableFor"),
    bestTimeOfDay: opt(s(fd, "bestTimeOfDay")),
    seasonalSuitability: opt(s(fd, "seasonalSuitability")),
    weatherDependency: opt(s(fd, "weatherDependency")),
    distanceDuration: opt(s(fd, "distanceDuration")),
    reservationRequired: s(fd, "reservationRequired") === "on",
    hostEffort: effort(s(fd, "hostEffort")),
    freshness,
  });
  revalidatePath(PATH);
}

export async function addConstraintAction(propertyId: string, fd: FormData) {
  const { tenantId, userId } = await getAuthContext();
  const title = s(fd, "title");
  if (!title) return;
  const rt = s(fd, "ruleType");
  const ruleType = (
    ["exclusion", "timing", "weather", "mobility", "suitability", "partner", "other"] as const
  ).includes(rt as never)
    ? (rt as "exclusion" | "timing" | "weather" | "mobility" | "suitability" | "partner" | "other")
    : "exclusion";
  const severity = s(fd, "severity") === "hard" ? "hard" : "soft";
  await createConstraint(tenantId, userId, propertyId, {
    title,
    description: opt(s(fd, "description")),
    ruleType,
    severity,
    applicabilityTags: tags(fd, "applicabilityTags"),
  });
  revalidatePath(PATH);
}

export async function addPlaybookAction(propertyId: string, fd: FormData) {
  const { tenantId, userId } = await getAuthContext();
  const title = s(fd, "title");
  if (!title) return;
  await createPlaybookAction(tenantId, userId, propertyId, {
    title,
    description: opt(s(fd, "description")),
    linkedCapabilityId: opt(s(fd, "linkedCapabilityId")),
    leadTime: opt(s(fd, "leadTime")),
    hostEffort: effort(s(fd, "hostEffort")),
    costLevel: cost(s(fd, "costLevel")),
    suitableFor: tags(fd, "suitableFor"),
  });
  revalidatePath(PATH);
}

// ---- Status lifecycle ----
type Status = "active" | "paused" | "archived";

export async function setCapabilityStatusAction(id: string, status: Status) {
  const { tenantId, userId } = await getAuthContext();
  await setCapabilityStatus(tenantId, userId, id, status);
  revalidatePath(PATH);
}
export async function setInsightStatusAction(id: string, status: Status) {
  const { tenantId, userId } = await getAuthContext();
  await setInsightStatus(tenantId, userId, id, status);
  revalidatePath(PATH);
}
export async function setPlaybookStatusAction(id: string, status: Status) {
  const { tenantId, userId } = await getAuthContext();
  await setPlaybookStatus(tenantId, userId, id, status);
  revalidatePath(PATH);
}
export async function setConstraintActiveAction(id: string, active: boolean) {
  const { tenantId, userId } = await getAuthContext();
  await setConstraintActive(tenantId, userId, id, active);
  revalidatePath(PATH);
}
