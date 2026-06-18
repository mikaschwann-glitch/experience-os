import type { ReactNode } from "react";
import { getAuthContext } from "@/lib/auth/devAuth";
import { SidebarNav } from "./_components/SidebarNav";
import { C, FONT } from "./_components/ui";

// The cockpit reads tenant-scoped data per request; never prerender at build.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { tenantName, userName } = await getAuthContext();

  return (
    <div className="flex min-h-screen" style={{ background: C.paper, fontFamily: FONT, color: C.ink }}>
      <SidebarNav
        propertyName={tenantName}
        subtitle="São Miguel · 8 cabins"
        userName={userName}
      />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-[1180px] px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
