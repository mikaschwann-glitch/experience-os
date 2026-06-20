"use client";

import { C } from "../_components/ui";

/**
 * Visible error state for the Research Lab route. If a run/withdraw/review action
 * throws (instead of failing silently), the host sees a clear message and can retry.
 */
export default function ResearchLabError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      className="rounded-xl p-5"
      style={{ background: C.warn, border: `1px solid ${C.soft}`, fontFamily: "inherit" }}
    >
      <div className="text-[14px] font-semibold" style={{ color: C.ink }}>
        Something went wrong running the simulation.
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: C.muted }}>
        {error.message || "The action could not be completed."}
      </p>
      <button
        onClick={reset}
        className="mt-3 inline-flex items-center rounded-md px-3.5 py-2 text-[13px] font-medium"
        style={{ background: C.clay, color: "#FFF", cursor: "pointer" }}
      >
        Try again
      </button>
    </div>
  );
}
