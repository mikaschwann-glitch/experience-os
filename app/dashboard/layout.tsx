import type { ReactNode } from "react";
import { getAuthContext } from "@/lib/auth/devAuth";
import { SidebarNav } from "./_components/SidebarNav";
import { Avatar, C, FONT } from "./_components/ui";

// The cockpit reads tenant-scoped data per request; never prerender at build.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { tenantName, userName } = await getAuthContext();
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  return (
    <div className="flex min-h-screen" style={{ background: C.paper, fontFamily: FONT, color: C.ink }}>
      <SidebarNav propertyName={tenantName} subtitle="São Miguel · 8 cabins" userName={userName} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top utility bar — real context only (current date + host identity). */}
        <header
          className="flex items-center justify-between px-8"
          style={{
            height: 60,
            background: C.surface,
            borderBottom: `1px solid ${C.soft}`,
          }}
        >
          <div className="text-[13.5px]" style={{ color: C.muted }}>
            {today}
          </div>
          <div className="flex items-center gap-2.5">
            <div className="text-right leading-tight">
              <div className="text-[13px] font-medium" style={{ color: C.ink }}>
                {userName}
              </div>
              <div className="text-[11.5px]" style={{ color: C.muted }}>
                Host · {tenantName}
              </div>
            </div>
            <Avatar name={userName} tone="clay" size={34} />
          </div>
        </header>

        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-[1180px] px-8 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
