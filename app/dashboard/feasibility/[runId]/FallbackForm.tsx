"use client";

import { useState } from "react";
import { SubmitButton, TextInput } from "../../_components/ui";

/**
 * Wave 1 — browser idempotency-key lifecycle for the host-authored fallback.
 *
 * One key per LOGICAL submission attempt:
 *  - a double-submit / retry of the SAME content reuses the key (server returns the
 *    same Preparation — idempotent);
 *  - a materially changed payload (the host edits the title after an error/interruption)
 *    mints a NEW key, so it is a fresh submission, never a fingerprint conflict.
 *
 * Implemented by regenerating the key whenever the content changes.
 */
export function FallbackForm({
  action,
}: {
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [idemKey, setIdemKey] = useState(() => crypto.randomUUID());
  return (
    <form action={action} className="mt-2 flex flex-wrap items-end gap-2">
      <input type="hidden" name="idempotencyKey" value={idemKey} />
      <div className="min-w-[240px] flex-1">
        <TextInput
          name="title"
          required
          placeholder="Your own preparation, e.g. “Lay out a quiet hiking map”"
          onChange={() => setIdemKey(crypto.randomUUID())}
        />
      </div>
      <SubmitButton type="submit" variant="ghost">
        Create preparation
      </SubmitButton>
    </form>
  );
}
