import { getAuthContext } from "@/lib/auth/devAuth";
import { listPropertiesWithUnits } from "@/lib/repositories/properties";
import {
  Card,
  C,
  Field,
  SectionTitle,
  SubmitButton,
  TextInput,
} from "../_components/ui";
import { createPropertyAction, createUnitAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function PropertiesPage() {
  const { tenantId } = await getAuthContext();
  const properties = await listPropertiesWithUnits(tenantId);

  return (
    <div>
      <h1 className="text-[24px] font-semibold tracking-tight" style={{ color: C.ink }}>
        Properties &amp; units
      </h1>
      <p className="mt-2 text-[14px]" style={{ color: C.muted }}>
        Basic property and unit records (Run 1 CRUD).
      </p>

      <div className="mt-6 grid grid-cols-1 gap-7 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          {properties.length === 0 ? (
            <Card className="p-5 text-[13px]" style={{ color: C.muted }}>
              No properties yet.
            </Card>
          ) : (
            properties.map((p) => (
              <Card key={p.id} className="overflow-hidden">
                <div className="px-5 py-4" style={{ borderBottom: `1px solid ${C.soft}` }}>
                  <div className="text-[15px] font-semibold" style={{ color: C.ink }}>
                    {p.name}
                  </div>
                  {p.location ? (
                    <div className="text-[12.5px]" style={{ color: C.muted }}>
                      {p.location}
                    </div>
                  ) : null}
                </div>
                <div className="px-5 py-3">
                  {p.units.length === 0 ? (
                    <div className="py-1 text-[13px]" style={{ color: C.muted }}>
                      No units yet.
                    </div>
                  ) : (
                    <ul className="divide-y" style={{ borderColor: C.soft }}>
                      {p.units.map((u) => (
                        <li key={u.id} className="flex items-center justify-between py-2 text-[13px]">
                          <span style={{ color: C.ink }}>{u.name}</span>
                          <span style={{ color: C.muted }}>
                            {[u.type, `sleeps ${u.capacity}`].filter(Boolean).join(" · ")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <form
                    action={createUnitAction}
                    className="mt-3 flex flex-wrap items-end gap-2 pt-3"
                    style={{ borderTop: `1px solid ${C.soft}` }}
                  >
                    <input type="hidden" name="propertyId" value={p.id} />
                    <div className="min-w-[160px] flex-1">
                      <TextInput name="name" required placeholder="Unit name…" />
                    </div>
                    <div className="w-28">
                      <TextInput name="type" placeholder="type" />
                    </div>
                    <div className="w-20">
                      <TextInput name="capacity" type="number" min={1} placeholder="cap" />
                    </div>
                    <SubmitButton type="submit" variant="ghost">
                      Add unit
                    </SubmitButton>
                  </form>
                </div>
              </Card>
            ))
          )}
        </div>

        <div>
          <SectionTitle>Add a property</SectionTitle>
          <Card className="mt-3 p-4">
            <form action={createPropertyAction} className="space-y-3">
              <Field label="Name">
                <TextInput name="name" required placeholder="e.g. Atlantic Hideaway" />
              </Field>
              <Field label="Location">
                <TextInput name="location" placeholder="e.g. São Miguel, Azores" />
              </Field>
              <SubmitButton type="submit">Create property</SubmitButton>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
