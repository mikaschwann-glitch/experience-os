import type { Executor } from "@/db/client";
import { events } from "@/db/schema";

/**
 * Canonical domain event types for the Run 1 vertical slice.
 * Events are append-only and PII-light: payloads carry ids/types/status, never
 * free guest text.
 */
export type DomainEventType =
  | "guest.created"
  | "stay.created"
  | "signal.created"
  | "insight.created"
  | "recommendation.created"
  | "recommendation.accepted"
  | "recommendation.dismissed"
  | "host_action.created"
  | "host_action.updated"
  | "outcome.created";

export interface EmitEventInput {
  tenantId: string;
  type: DomainEventType;
  entityType: string;
  entityId: string;
  actorUserId?: string | null;
  correlationId?: string | null;
  payload?: Record<string, unknown>;
}

/**
 * Insert an event using the provided executor. Callers pass the open
 * transaction (tx) so the event is written in the SAME transaction as the
 * domain mutation that produced it — if the domain write rolls back, so does
 * the event.
 */
export async function emitEvent(
  executor: Executor,
  input: EmitEventInput,
): Promise<void> {
  await executor.insert(events).values({
    tenantId: input.tenantId,
    type: input.type,
    entityType: input.entityType,
    entityId: input.entityId,
    actorUserId: input.actorUserId ?? null,
    correlationId: input.correlationId ?? null,
    payload: input.payload ?? {},
  });
}
