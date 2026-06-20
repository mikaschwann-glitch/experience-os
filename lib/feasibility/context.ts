/**
 * Simulated stay context for the feasibility engine (SIMULATION ONLY).
 *
 * The Run 1 stay model has no weather/transport, so these are explicit,
 * deterministic fixtures — never live weather, maps, or availability. Duration
 * and lead time are derived from the real stay dates by the engine where needed.
 */
export type SimWeather = "good" | "uncertain" | "poor";
export type SimTransport = "car" | "transfer_available" | "no_transport";

export interface SimContext {
  weather: SimWeather;
  transport: SimTransport;
}

export const DEFAULT_SIM_CONTEXT: SimContext = { weather: "good", transport: "car" };

// Deterministic per-guest context so scenarios are reproducible.
const BY_GUEST: Record<string, SimContext> = {
  "Greta Hofer": { weather: "good", transport: "car" },
  "Sofia Lindqvist": { weather: "good", transport: "car" },
  "Clara Vance": { weather: "good", transport: "no_transport" }, // hard-constraint demo
};

export function resolveSimContext(guestName: string, override?: Partial<SimContext>): SimContext {
  const base = BY_GUEST[guestName] ?? DEFAULT_SIM_CONTEXT;
  return { ...base, ...(override ?? {}) };
}
