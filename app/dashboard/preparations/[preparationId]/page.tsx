import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth/devAuth";
import { getPreparationWorkItem } from "@/lib/readmodels/preparations";
import { Card, C, Icon, PageHeader } from "../../_components/ui";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  suggested: "Suggested",
  planned: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default async function PreparationDetailPage({
  params,
}: {
  params: Promise<{ preparationId: string }>;
}) {
  const { preparationId } = await params;
  const { tenantId } = await getAuthContext();
  const item = await getPreparationWorkItem(tenantId, preparationId);
  if (!item) notFound();

  return (
    <div>
      <PageHeader title={item.title} subtitle={`Preparation for ${item.guestName}`} />

      <Card className="mt-5 p-5">
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2.5 py-1 text-[11.5px] font-medium"
            style={{ background: C.paper, color: C.muted }}
          >
            {KIND_LABEL[item.kind]}
          </span>
          <span className="text-[12.5px]" style={{ color: C.muted }}>
            {item.dueAt
              ? `Due ${new Date(item.dueAt).toLocaleDateString("en-GB")}`
              : `Before arrival · ${item.stayStart}`}
          </span>
        </div>

        {item.why ? (
          <p className="mt-4 text-[13.5px] leading-relaxed" style={{ color: C.ink }}>
            {item.why}
          </p>
        ) : null}

        <div className="mt-5 flex items-center gap-1.5 text-[13px]" style={{ color: C.muted }}>
          <Icon name="user" size={14} />
          <Link
            href={`/dashboard/guests/${item.guestId}`}
            className="font-medium no-underline"
            style={{ color: C.clayDark }}
          >
            {item.guestName} →
          </Link>
        </div>
      </Card>

      <div className="mt-5">
        <Link href="/dashboard/preparations" className="text-[13px] no-underline" style={{ color: C.muted }}>
          ← All preparations
        </Link>
      </div>
    </div>
  );
}
