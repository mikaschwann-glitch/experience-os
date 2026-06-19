import { getAuthContext } from "@/lib/auth/devAuth";
import { listPropertiesWithUnits } from "@/lib/repositories/properties";
import {
  Card,
  C,
  EmptyState,
  Field,
  Icon,
  PageHeader,
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
      <PageHeader
        title="Properties & units"
        subtitle="Your places and the cabins within them."
      />

      <div className="mt-6 grid grid-cols-1 gap-7 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          {properties.length === 0 ? (
            <Card>
              <EmptyState>No properties yet — add one on the right.</EmptyState>
            </Card>
          ) : (
            properties.map((p) => (
              <Card key={p.id} className="overflow-hidden">
                <div
                  className="flex items-center gap-3 px-5 py-4"
                  style={{ borderBottom: `1px solid ${C.soft}` }}
                >
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-lg"
                    style={{ background: C.paper, color: C.muted }}
                  >
                    <Icon name="properties" size={18} />
                  </span>
                  <div>
                    <div className="text-[15px] font-semibold" style={{ color: C.ink }}>
                      {p.name}
                    </div>
                    {p.location ? (
                      <div className="text-[12.5px]" style={{ color: C.muted }}>
                        {p.location}
                      </div>
                    ) : null}
                  </div>
                  <span className="ml-auto text-[12.5px]" style={{ color: C.muted }}>
                    {p.units.length} {p.units.length === 1 ? "unit" : "units"}
                  </span>
                </div>

                <div className="px-5 py-3">
                  {p.units.length === 0 ? (
                    <div className="py-1 text-[13px]" style={{ color: C.muted }}>
                      No units yet.
                    </div>
                  ) : (
                    <ul>
                      {p.units.map((u, i, arr) => (
                        <li
                          key={u.id}
                          className="flex items-center justify-between py-2.5 text-[13px]"
                          style={{
                            borderBottom: i === arr.length - 1 ? "none" : `1px solid ${C.soft}`,
                          }}
                        >
                          <span className="flex items-center gap-2.5" style={{ color: C.ink }}>
                            <span style={{ color: C.muted }}>
                              <Icon name="bed" size={15} />
                            </span>
                            {u.name}
                          </span>
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
                      <Icon name="plus" size={14} /> Add unit
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
              <SubmitButton type="submit">
                <Icon name="plus" size={14} /> Create property
              </SubmitButton>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
