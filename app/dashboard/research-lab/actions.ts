"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/devAuth";
import { getScenario } from "@/lib/research/fixtures";
import { reviewBrief, runSubject, withdrawConsent } from "@/lib/research/engine";

/**
 * Simulation-lab server actions. tenantId/userId always come from the server-side
 * dev-auth stub (never the client). All work is fixture-driven; no external calls.
 */
export async function runScenarioAction(scenarioKey: string) {
  const { tenantId, userId } = await getAuthContext();
  const scenario = getScenario(scenarioKey);
  if (!scenario) return;

  // Run every subject; remember the first job created so we can land the host on
  // a concrete result. Refused subjects (no consent) create no job by design.
  let resultJobId: string | undefined;
  for (const subject of scenario.subjects) {
    const r = await runSubject(tenantId, userId, scenarioKey, subject);
    if (!resultJobId && r.jobId) resultJobId = r.jobId;
  }

  revalidatePath("/dashboard/research-lab");
  // Navigate to the result so EVERY click (first or repeat) has a visible,
  // deterministic outcome — no silent no-op. (redirect() throws NEXT_REDIRECT.)
  if (resultJobId) redirect(`/dashboard/research-lab/${resultJobId}`);
}

export async function withdrawConsentAction(guestId: string) {
  const { tenantId, userId } = await getAuthContext();
  await withdrawConsent(tenantId, userId, guestId);
  revalidatePath("/dashboard/research-lab");
}

export async function reviewBriefAction(
  briefId: string,
  status: "approved" | "rejected" | "edited" | "not_useful",
  formData: FormData,
) {
  const { tenantId, userId } = await getAuthContext();
  const hostNote = String(formData.get("hostNote") ?? "").trim() || null;
  await reviewBrief(tenantId, userId, briefId, status, hostNote);
  revalidatePath("/dashboard/research-lab");
}
