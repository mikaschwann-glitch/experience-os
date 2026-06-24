"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { C, Icon, type IconName } from "./ui";

/**
 * Charcoal cockpit rail. Nav items map to routes that actually exist in Run 1
 * (no decorative-only items). Active state uses a translucent fill + clay inset
 * accent bar, matching the frozen design direction.
 */
// Wave 1B IA: three durable work surfaces (Today / Guests / Preparations) + the
// property-knowledge store (Our Place). Recommendations and Research Lab are NOT
// primary host destinations (provenance / simulation surfaces) — their routes still
// exist but are reached contextually, not from the rail. Properties is admin/setup.
const NAV: { label: string; href: string; icon: IconName }[] = [
  { label: "Today", href: "/dashboard", icon: "today" },
  { label: "Guests", href: "/dashboard/guests", icon: "guests" },
  { label: "Preparations", href: "/dashboard/preparations", icon: "clipboard" },
  { label: "Our Place", href: "/dashboard/property-intelligence", icon: "note" },
  { label: "Properties", href: "/dashboard/properties", icon: "properties" },
];

export function SidebarNav({
  propertyName,
  subtitle,
  userName,
}: {
  propertyName: string;
  subtitle: string;
  userName: string;
}) {
  const pathname = usePathname();

  return (
    <aside
      className="flex w-[236px] shrink-0 flex-col overflow-y-auto"
      style={{ background: C.basalt }}
    >
      <div className="px-5 pb-5 pt-6">
        <div className="text-[15.5px] font-semibold tracking-tight" style={{ color: C.sideActive }}>
          {propertyName}
        </div>
        <div className="mt-1 text-[12.5px]" style={{ color: C.sideTextDim }}>
          {subtitle}
        </div>
      </div>

      <div className="mx-5 h-px" style={{ background: C.basaltSoft }} />

      <nav className="flex-1 px-3 py-4">
        <div
          className="px-3 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em]"
          style={{ color: C.sideTextDim }}
        >
          Workspace
        </div>
        {NAV.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="mb-[3px] flex items-center gap-3 rounded-lg px-3 py-[9px] text-[14px] no-underline"
              style={{
                background: isActive ? "rgba(255,255,255,0.055)" : "transparent",
                color: isActive ? C.sideActive : C.sideText,
                boxShadow: isActive ? `inset 2.5px 0 0 ${C.clay}` : "none",
                fontWeight: isActive ? 600 : 450,
              }}
            >
              <span style={{ color: isActive ? C.clay : C.sideTextDim }}>
                <Icon name={item.icon} size={17} stroke={1.7} />
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mx-5 h-px" style={{ background: C.basaltSoft }} />

      <div className="flex items-center gap-3 px-5 py-4">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-semibold"
          style={{ background: C.basaltSoft, color: C.sideActive }}
        >
          {userName
            .split(" ")
            .map((p) => p[0])
            .slice(0, 2)
            .join("")}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium" style={{ color: C.sideActive }}>
            {userName}
          </div>
          <div className="text-[11.5px]" style={{ color: C.sideTextDim }}>
            Host
          </div>
        </div>
      </div>
    </aside>
  );
}
