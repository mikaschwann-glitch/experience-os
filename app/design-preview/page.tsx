"use client";

import { useState } from "react";

/**
 * Static design preview for "Experience-OS — Basalt Workbench / Charcoal Sidebar".
 * This is a visual prototype only: no backend, no data fetching, no product logic.
 * Everything below is hardcoded and the only interactivity is switching preview screens.
 */

// ---- Design tokens (kept inline so colors render exactly, independent of Tailwind config) ----
const C = {
  paper: "#F6F3EC",
  surface: "#FFFFFF",
  ink: "#171717",
  muted: "#6F6A61",
  basalt: "#1F1E1B",
  basaltSoft: "#2B2926",
  stone: "#D8D2C4",
  soft: "#E7E1D6",
  clay: "#A4512C",
  clayDark: "#8E3F22",
  clayLight: "#F3E4DA",
  warn: "#F7EDE4",
  chip: "#ECE7DD",
  // sidebar-specific (on dark basalt)
  sideText: "#CFC8BA",
  sideTextDim: "#8C867A",
  sideActive: "#F6F3EC",
};

const FONT =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

// ---- Minimal line-icon set (stroke-based, currentColor) ----
type IconName =
  | "search"
  | "sunrise"
  | "kitchen"
  | "note"
  | "bed"
  | "clipboard"
  | "user"
  | "calendar"
  | "clock"
  | "checkCircle"
  | "circle"
  | "bell"
  | "mail"
  | "mailOpen"
  | "quote"
  | "lock"
  | "chevronDown"
  | "effort"
  | "pin"
  | "menu"
  | "plus"
  | "gift"
  | "today"
  | "arrivals"
  | "guests"
  | "recommend"
  | "experiences"
  | "settings"
  | "directory";

const PATHS: Record<IconName, string> = {
  search: "M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-4.35-4.35",
  sunrise: "M12 3v3M5.2 9.2l1.4 1.4M18.8 9.2l-1.4 1.4M3 17h18M7.5 17a4.5 4.5 0 019 0",
  kitchen: "M8 3v18M6 3v5a2 2 0 004 0V3M16 3c-1.8 1.6-1.8 7 0 8.5V21",
  note: "M21 11.5a8.4 8.4 0 01-8.5 8.5 8.5 8.5 0 01-3.8-.9L3 21l1.9-5.7A8.4 8.4 0 014 11.5 8.5 8.5 0 0112.5 3 8.4 8.4 0 0121 11.5z",
  bed: "M2 18v-6a2 2 0 012-2h16a2 2 0 012 2v6M2 14h20M6 10V8a2 2 0 012-2h3a2 2 0 012 2v2",
  clipboard:
    "M9 4h6a1 1 0 011 1v1H8V5a1 1 0 011-1zM8 6H6a2 2 0 00-2 2v11a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2h-2",
  user: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z",
  calendar: "M5 4h14a2 2 0 012 2v13a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM3 9h18M8 3v4M16 3v4",
  clock: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2",
  checkCircle: "M12 21a9 9 0 100-18 9 9 0 000 18zM8.5 12l2.5 2.5 4.5-5",
  circle: "M12 21a9 9 0 100-18 9 9 0 000 18z",
  bell: "M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0",
  mail: "M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2zM3 7l9 6 9-6",
  mailOpen: "M3 9l9-6 9 6v10a2 2 0 01-2 2H5a2 2 0 01-2-2V9zM3 9l9 6 9-6",
  quote: "M7 7h4v6H5v-2c0-2 1-3 2-4zM15 7h4v6h-6v-2c0-2 1-3 2-4z",
  lock: "M6 11h12v9H6zM9 11V8a3 3 0 016 0v3",
  chevronDown: "M6 9l6 6 6-6",
  effort: "M4 20h16M7 20v-4M12 20v-8M17 20v-12",
  pin: "M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12zM12 11a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
  menu: "M4 7h16M4 12h16M4 17h16",
  plus: "M12 5v14M5 12h14",
  gift: "M4 12v8a1 1 0 001 1h14a1 1 0 001-1v-8M3 8h18v4H3zM12 21V8M12 8S10.5 3 8 4.2 9 8 12 8M12 8s1.5-5 4-3.8S15 8 12 8",
  today: "M5 4h14a2 2 0 012 2v13a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM3 9h18M8 3v4M16 3v4M9 14l2 2 4-4",
  arrivals: "M3 12h13M12 6l6 6-6 6M16 4h4v16h-4",
  guests: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.8M16 3.2A4 4 0 0116 11",
  recommend: "M12 3l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z",
  experiences: "M3 18l5-6 4 4 4-5 5 7M3 18V6a2 2 0 012-2h14a2 2 0 012 2v12",
  settings:
    "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 13.5a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2v.1a2 2 0 11-4 0v-.1a1.7 1.7 0 00-2.9-1.2l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00-1.2-2.9H4a2 2 0 110-4h.1a1.7 1.7 0 001.2-2.9l-.1-.1A2 2 0 117.9 4.5l.1.1a1.7 1.7 0 002.9-1.2V3a2 2 0 014 0v.1a1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9",
  directory: "M4 5h16M4 12h16M4 19h10",
};

function Icon({
  name,
  size = 18,
  stroke = 1.6,
  className,
  style,
}: {
  name: IconName;
  size?: number;
  stroke?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

// ---- Shared small components ----

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-[3px] text-[12px] leading-none"
      style={{ background: C.chip, color: C.muted }}
    >
      {children}
    </span>
  );
}

function PrimaryButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      className="inline-flex items-center justify-center rounded-md px-3.5 py-2 text-[13px] font-medium transition-colors"
      style={{ background: C.clay, color: "#FFF" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = C.clayDark)}
      onMouseLeave={(e) => (e.currentTarget.style.background = C.clay)}
    >
      {children}
    </button>
  );
}

function GhostButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      className="inline-flex items-center justify-center rounded-md px-3.5 py-2 text-[13px] font-medium transition-colors"
      style={{ background: C.surface, color: C.ink, border: `1px solid ${C.stone}` }}
      onMouseEnter={(e) => (e.currentTarget.style.background = C.paper)}
      onMouseLeave={(e) => (e.currentTarget.style.background = C.surface)}
    >
      {children}
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="text-[11.5px] font-semibold uppercase tracking-[0.045em]"
      style={{ color: C.muted }}
    >
      {children}
    </h3>
  );
}

function Card({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`rounded-xl ${className ?? ""}`}
      style={{
        background: C.surface,
        border: `1px solid ${C.soft}`,
        boxShadow: "0 1px 2px rgba(23,23,23,0.04)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SensitiveNote({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-lg p-4"
      style={{ background: C.warn, border: `1px solid ${C.soft}` }}
    >
      <div className="flex items-center gap-2">
        <span style={{ color: C.clay }}>
          <Icon name="lock" size={15} />
        </span>
        <span className="text-[13px] font-semibold" style={{ color: C.ink }}>
          {title}
        </span>
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: C.muted }}>
        {children}
      </p>
    </div>
  );
}

// ---- Sidebar ----

const NAV: { label: string; icon: IconName }[] = [
  { label: "Today", icon: "today" },
  { label: "Arrivals", icon: "arrivals" },
  { label: "Guests", icon: "guests" },
  { label: "Recommendations", icon: "recommend" },
  { label: "Experiences", icon: "experiences" },
  { label: "Notes", icon: "note" },
  { label: "Settings", icon: "settings" },
];

function SidebarNav({ active }: { active: string }) {
  return (
    <aside
      className="flex w-[236px] shrink-0 flex-col"
      style={{ background: C.basalt }}
    >
      {/* Property identity */}
      <div className="px-5 pb-5 pt-6">
        <div
          className="text-[15.5px] font-semibold tracking-tight"
          style={{ color: C.sideActive }}
        >
          Atlantic Hideaway
        </div>
        <div className="mt-1 text-[12.5px]" style={{ color: C.sideTextDim }}>
          São Miguel · 8 cabins
        </div>
      </div>

      <div className="mx-5 h-px" style={{ background: C.basaltSoft }} />

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4">
        <div
          className="px-3 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em]"
          style={{ color: C.sideTextDim }}
        >
          Workspace
        </div>
        {NAV.map((item) => {
          const isActive = item.label === active;
          return (
            <div
              key={item.label}
              className="mb-[3px] flex items-center gap-3 rounded-lg px-3 py-[9px] text-[14px]"
              style={{
                // translucent fill (not a solid block) keeps the active state present but lighter
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
            </div>
          );
        })}
      </nav>

      <div className="mx-5 h-px" style={{ background: C.basaltSoft }} />

      {/* User area */}
      <div className="flex items-center gap-3 px-5 py-4">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-semibold"
          style={{ background: C.basaltSoft, color: C.sideActive }}
        >
          SM
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium" style={{ color: C.sideActive }}>
            Sofia Medeiros
          </div>
          <div className="text-[11.5px]" style={{ color: C.sideTextDim }}>
            Host
          </div>
        </div>
        <span style={{ color: C.sideTextDim }}>
          <Icon name="chevronDown" size={15} />
        </span>
      </div>
    </aside>
  );
}

// ---- Top bar (inside main work area) ----

function TopBar() {
  return (
    <div
      className="flex items-center gap-4 px-10 py-[18px]"
      style={{ borderBottom: `1px solid ${C.soft}` }}
    >
      <div
        className="flex w-full max-w-[360px] items-center gap-2.5 rounded-lg px-3 py-2"
        style={{ background: C.surface, border: `1px solid ${C.soft}` }}
      >
        <span style={{ color: C.muted }}>
          <Icon name="search" size={16} />
        </span>
        <span className="text-[13px]" style={{ color: C.muted }}>
          Search guests, stays, notes…
        </span>
      </div>
      <div className="ml-auto flex items-center gap-4 text-[13px]" style={{ color: C.muted }}>
        <span className="flex items-center gap-1.5">
          <Icon name="clock" size={15} />
          08:14 local time
        </span>
        <span className="hidden items-center gap-1.5 sm:flex">
          <Icon name="sunrise" size={15} />
          São Miguel · clear, 16°
        </span>
      </div>
    </div>
  );
}

// ---- Product shell (sidebar + scrollable main work area) ----

function ProductShell({
  active,
  children,
}: {
  active: string;
  children: React.ReactNode;
}) {
  return (
    // min-height (not fixed height) lets the surface grow with content, so there is no inner
    // scrollbar; the page itself scrolls when a screen is tall. Feels like an app, not an iframe.
    <div
      className="flex overflow-hidden rounded-2xl"
      style={{
        border: `1px solid ${C.stone}`,
        minHeight: 780,
        boxShadow: "0 16px 40px -12px rgba(23,23,23,0.16)",
      }}
    >
      <SidebarNav active={active} />
      <div className="flex min-w-0 flex-1 flex-col" style={{ background: C.paper }}>
        <TopBar />
        <div className="flex-1 px-10 py-9">{children}</div>
      </div>
    </div>
  );
}

// ============================================================
// SCREEN 1 — Today Dashboard
// ============================================================

function StatCard({
  icon,
  value,
  label,
  alert,
}: {
  icon: IconName;
  value: string;
  label: string;
  alert?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <span style={{ color: C.muted }}>
          <Icon name={icon} size={19} />
        </span>
        {alert && (
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: C.clay }}
            aria-hidden
          />
        )}
      </div>
      <div className="mt-3 text-[28px] font-semibold leading-none" style={{ color: C.ink }}>
        {value}
      </div>
      <div className="mt-1.5 text-[13px]" style={{ color: C.muted }}>
        {label}
      </div>
    </Card>
  );
}

function AttentionRow({
  icon,
  title,
  sub,
  status,
  action,
  last,
}: {
  icon: IconName;
  title: string;
  sub: string;
  status?: string;
  action: string;
  last?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-4 px-4 py-3.5"
      style={{ borderBottom: last ? "none" : `1px solid ${C.soft}` }}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ background: C.paper, color: C.muted }}
      >
        <Icon name={icon} size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium" style={{ color: C.ink }}>
          {title}
        </div>
        <div className="mt-0.5 text-[12.5px]" style={{ color: C.muted }}>
          {sub}
        </div>
      </div>
      {status && (
        <span
          className="hidden shrink-0 text-[12px] font-medium sm:block"
          style={{ color: C.clay }}
        >
          {status}
        </span>
      )}
      <div className="shrink-0">
        {status === "Do not miss" ? (
          <PrimaryButton>{action}</PrimaryButton>
        ) : (
          <GhostButton>{action}</GhostButton>
        )}
      </div>
    </div>
  );
}

function TodayDashboard() {
  const schedule: { time: string; label: string; sub: string; accent?: boolean }[] = [
    { time: "15:00", label: "Maria & Tom arrive", sub: "Ocean Cabin 02 · second stay", accent: true },
    { time: "18:00", label: "Confirm breakfast", sub: "with the kitchen", accent: false },
    { time: "Eve", label: "Place handwritten note", sub: "Ocean Cabin 02", accent: false },
  ];
  const activity: { icon: IconName; text: string; time: string }[] = [
    { icon: "note", text: "Welcome note placed in Ocean 02", time: "1h ago" },
    { icon: "arrivals", text: "The Aaltos checked out, Pine 01", time: "3h ago" },
    { icon: "experiences", text: "Kayak guide arranged for Maria & Tom", time: "Yesterday" },
  ];

  return (
    <div className="grid grid-cols-1 gap-7 lg:grid-cols-[1fr_336px]">
      {/* Left / main column */}
      <div>
        <h1 className="text-[27px] font-semibold tracking-tight" style={{ color: C.ink }}>
          Good morning, Sofia
        </h1>
        <p className="mt-2 text-[14.5px] leading-relaxed" style={{ color: C.muted }}>
          Friday, 18 April — 3 things need attention before first check-in.
        </p>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-3 gap-4">
          <StatCard icon="user" value="1" label="Arriving today" />
          <StatCard icon="bed" value="3" label="In residence" />
          <StatCard icon="clipboard" value="2" label="Need approval" alert />
        </div>

        {/* Needs your attention */}
        <div className="mt-8">
          <SectionTitle>Needs your attention</SectionTitle>
          <Card className="mt-3 overflow-hidden">
            <AttentionRow
              icon="sunrise"
              title="Review sunrise breakfast plan"
              sub="Maria & Tom · Ocean Cabin 02 · due 18:00"
              status="Do not miss"
              action="Review plan"
            />
            <AttentionRow
              icon="kitchen"
              title="Confirm breakfast with the kitchen"
              sub="Ocean Cabin 02 · needs confirmation · due 18:00"
              action="Open"
            />
            <AttentionRow
              icon="note"
              title="Outcome missing — welcome gesture"
              sub="Pine Cabin 01 · prepared yesterday"
              action="Log outcome"
              last
            />
          </Card>
        </div>

        {/* Arriving today — the day's anchor, given more presence */}
        <div className="mt-8">
          <SectionTitle>Arriving today</SectionTitle>
          <Card className="mt-3 overflow-hidden">
            <div
              className="flex items-center justify-between px-5 py-2.5"
              style={{ background: C.clayLight, borderBottom: `1px solid ${C.soft}` }}
            >
              <span
                className="flex items-center gap-2 text-[12.5px] font-medium"
                style={{ color: C.clayDark }}
              >
                <Icon name="arrivals" size={15} /> Next arrival
              </span>
              <span className="text-[12.5px] font-semibold" style={{ color: C.clayDark }}>
                Today · 15:00
              </span>
            </div>

            <div className="p-5">
              <div className="flex items-start gap-4">
                <div
                  className="flex shrink-0 items-center justify-center rounded-full text-[15px] font-semibold"
                  style={{ background: C.clayLight, color: C.clayDark, height: 52, width: 52 }}
                >
                  M&T
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[17px] font-semibold" style={{ color: C.ink }}>
                      Maria & Tom
                    </span>
                    <span
                      className="rounded-full px-2 py-[2px] text-[11px] font-medium"
                      style={{ background: C.chip, color: C.muted }}
                    >
                      Second stay
                    </span>
                  </div>
                  <div className="mt-1 text-[13px]" style={{ color: C.muted }}>
                    Ocean Cabin 02 · 18–22 April · 4 nights
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Tag>quiet places</Tag>
                    <Tag>sunrise</Tag>
                    <Tag>local food</Tag>
                    <Tag>no alcohol</Tag>
                    <Tag>anniversary — keep quiet</Tag>
                  </div>
                </div>
              </div>

              <div
                className="mt-4 grid grid-cols-2 gap-3 pt-4"
                style={{ borderTop: `1px solid ${C.soft}` }}
              >
                {[
                  { icon: "clock" as IconName, text: "Check-in from 15:00" },
                  { icon: "bed" as IconName, text: "Cabin ready · key on the table" },
                ].map((f) => (
                  <div key={f.text} className="flex items-center gap-2.5 text-[13px]">
                    <span style={{ color: C.muted }}>
                      <Icon name={f.icon} size={16} />
                    </span>
                    <span style={{ color: C.ink }}>{f.text}</span>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex gap-2.5">
                <PrimaryButton>Review plan</PrimaryButton>
                <GhostButton>Open guest</GhostButton>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Right column — denser, more operational */}
      <div className="flex flex-col gap-6">
        {/* Note card with a CSS morning-light band */}
        <Card className="overflow-hidden">
          <PortalScene mood="morning" height={104} />
          <div className="p-4">
            <div className="text-[14.5px] font-semibold" style={{ color: C.ink }}>
              A quiet day ahead
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: C.muted }}>
              Low arrivals, clear morning. Time to prepare the little things that matter.
            </p>
            <div
              className="mt-3 flex items-center gap-2 pt-3 text-[12.5px]"
              style={{ borderTop: `1px solid ${C.soft}`, color: C.muted }}
            >
              <Icon name="sunrise" size={15} />
              São Miguel · clear, 16° · sunrise 06:42
            </div>
          </div>
        </Card>

        {/* Today's schedule — fills the column with real operational rhythm */}
        <div>
          <SectionTitle>Today&apos;s schedule</SectionTitle>
          <Card className="mt-3 p-4">
            <ul className="space-y-1">
              {schedule.map((s, i, arr) => (
                <li
                  key={s.label}
                  className="flex gap-3.5 py-2"
                  style={{ borderBottom: i === arr.length - 1 ? "none" : `1px solid ${C.soft}` }}
                >
                  <div className="flex w-12 shrink-0 flex-col items-center">
                    <span
                      className="text-[12.5px] font-semibold"
                      style={{ color: s.accent ? C.clay : C.ink }}
                    >
                      {s.time}
                    </span>
                  </div>
                  <div className="relative flex-1 pl-3" style={{ borderLeft: `1px solid ${C.soft}` }}>
                    <span
                      className="absolute left-[-4px] top-[6px] h-[7px] w-[7px] rounded-full"
                      style={{ background: s.accent ? C.clay : C.stone }}
                    />
                    <div className="text-[13.5px] font-medium leading-tight" style={{ color: C.ink }}>
                      {s.label}
                    </div>
                    <div className="text-[12px]" style={{ color: C.muted }}>
                      {s.sub}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* Recent activity — with timestamps + icons */}
        <div>
          <SectionTitle>Recent activity</SectionTitle>
          <Card className="mt-3 p-4">
            <ul className="space-y-3.5">
              {activity.map((a, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span
                    className="mt-[1px] flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                    style={{ background: C.paper, color: C.muted }}
                  >
                    <Icon name={a.icon} size={13} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] leading-snug" style={{ color: C.ink }}>
                      {a.text}
                    </div>
                    <div className="text-[11.5px]" style={{ color: C.muted }}>
                      {a.time}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SCREEN 2 — Guests List
// ============================================================

type Guest = {
  initials: string;
  name: string;
  cabin: string;
  dates: string;
  meta: string;
  note: string;
};

const GUESTS_ARRIVING: Guest[] = [
  {
    initials: "M&T",
    name: "Maria & Tom",
    cabin: "Ocean Cabin 02",
    dates: "18–22 Apr",
    meta: "Arriving 15:00",
    note: "Anniversary — keep quiet · no alcohol",
  },
];

const GUESTS_RESIDENCE: Guest[] = [
  {
    initials: "L",
    name: "The Lunds",
    cabin: "Villa Basalt 03",
    dates: "until 24 Apr",
    meta: "In residence",
    note: "Quiet so far · asked about hiking routes",
  },
  {
    initials: "H&P",
    name: "Henrik & Pia",
    cabin: "Stone Cabin 05",
    dates: "until 20 Apr",
    meta: "In residence",
    note: "Birthday on Tuesday · gesture went well",
  },
  {
    initials: "JW",
    name: "James W.",
    cabin: "Pine Cabin 02",
    dates: "until 19 Apr",
    meta: "In residence",
    note: "Works mornings · walks the coast at dusk",
  },
];

const GUESTS_PAST: Guest[] = [
  {
    initials: "A",
    name: "The Aaltos",
    cabin: "Pine Cabin 01",
    dates: "left today",
    meta: "Departed",
    note: "Welcome gesture — outcome not logged",
  },
  {
    initials: "M",
    name: "The Moreaus",
    cabin: "Ocean Cabin 01",
    dates: "8–12 Apr",
    meta: "Departed",
    note: "Loved the kayak · likely to return",
  },
];

function GuestRow({ g, last }: { g: Guest; last?: boolean }) {
  return (
    <div
      className="flex items-center gap-4 px-5 py-4"
      style={{ borderBottom: last ? "none" : `1px solid ${C.soft}` }}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold"
        style={{ background: C.chip, color: C.muted }}
      >
        {g.initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium" style={{ color: C.ink }}>
          {g.name}
        </div>
        <div className="mt-0.5 text-[12.5px]" style={{ color: C.muted }}>
          {g.cabin} · {g.dates}
        </div>
      </div>
      <div className="hidden min-w-0 flex-1 text-[12.5px] md:block" style={{ color: C.muted }}>
        {g.note}
      </div>
      <div className="shrink-0 text-[12.5px]" style={{ color: C.muted }}>
        {g.meta}
      </div>
    </div>
  );
}

function GuestsList() {
  const filters = ["Arriving", "In residence", "Past"];
  return (
    <div className="mx-auto max-w-[860px]">
      <h1 className="text-[24px] font-semibold tracking-tight" style={{ color: C.ink }}>
        Guests
      </h1>
      <p className="mt-1.5 text-[14px]" style={{ color: C.muted }}>
        Eight cabins · the people behind every stay.
      </p>

      {/* Segmented filters (static / visual) */}
      <div
        className="mt-5 inline-flex gap-1 rounded-lg p-1"
        style={{ background: C.chip }}
      >
        {filters.map((f, i) => (
          <span
            key={f}
            className="rounded-md px-3.5 py-1.5 text-[13px] font-medium"
            style={
              i === 0
                ? { background: C.surface, color: C.ink, boxShadow: "0 1px 2px rgba(23,23,23,0.06)" }
                : { color: C.muted }
            }
          >
            {f}
          </span>
        ))}
      </div>

      <div className="mt-6 space-y-6">
        <div>
          <SectionTitle>Arriving today</SectionTitle>
          <Card className="mt-3 overflow-hidden">
            {GUESTS_ARRIVING.map((g, i) => (
              <GuestRow key={g.name} g={g} last={i === GUESTS_ARRIVING.length - 1} />
            ))}
          </Card>
        </div>

        <div>
          <SectionTitle>In residence</SectionTitle>
          <Card className="mt-3 overflow-hidden">
            {GUESTS_RESIDENCE.map((g, i) => (
              <GuestRow key={g.name} g={g} last={i === GUESTS_RESIDENCE.length - 1} />
            ))}
          </Card>
        </div>

        <div>
          <SectionTitle>Recently departed</SectionTitle>
          <Card className="mt-3 overflow-hidden">
            {GUESTS_PAST.map((g, i) => (
              <GuestRow key={g.name} g={g} last={i === GUESTS_PAST.length - 1} />
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SCREEN 3 — Guest Detail / Guest Memory
// ============================================================

function OutcomeList() {
  const items: { icon: IconName; title: string; sub: string; date: string; done: boolean }[] = [
    {
      icon: "checkCircle",
      title: "Sunrise kayak — they loved it",
      sub: "",
      date: "19 Jun 2023",
      done: true,
    },
    {
      icon: "circle",
      title: "Welcome note placed",
      sub: "Outcome not yet logged",
      date: "18 Apr 2025",
      done: false,
    },
    {
      icon: "sunrise",
      title: "Sunrise breakfast",
      sub: "Planned, pending approval",
      date: "19 Apr 2025",
      done: false,
    },
  ];
  return (
    <ul className="space-y-3.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3">
          <span
            className="mt-0.5 shrink-0"
            style={{ color: it.done ? C.clay : C.muted }}
          >
            <Icon name={it.icon} size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-medium" style={{ color: C.ink }}>
                {it.title}
              </span>
              <span className="shrink-0 text-[12px]" style={{ color: C.muted }}>
                {it.date}
              </span>
            </div>
            {it.sub && (
              <div className="text-[12px]" style={{ color: C.muted }}>
                {it.sub}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function GuestDetail() {
  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-[13px]" style={{ color: C.muted }}>
        <span>Guests</span>
        <span style={{ color: C.stone }}>/</span>
        <span style={{ color: C.ink }}>Maria & Tom</span>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start gap-4">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full text-[16px] font-semibold"
          style={{ background: C.clayLight, color: C.clayDark }}
        >
          M&T
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-[24px] font-semibold tracking-tight" style={{ color: C.ink }}>
            Maria & Tom
          </h1>
          <div className="mt-1 text-[13.5px]" style={{ color: C.muted }}>
            Ocean Cabin 02 · 18–22 April · Second stay
          </div>
          <div className="mt-0.5 text-[13.5px]" style={{ color: C.muted }}>
            Arriving today at 15:00
          </div>
        </div>
        <div className="flex gap-2.5">
          <GhostButton>
            <span className="flex items-center gap-1.5">
              <Icon name="plus" size={15} /> Add a note
            </span>
          </GhostButton>
          <PrimaryButton>
            <span className="flex items-center gap-1.5">
              <Icon name="gift" size={15} /> Prepare a gesture
            </span>
          </PrimaryButton>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main column */}
        <div className="space-y-6">
          <div>
            <SectionTitle>What matters now</SectionTitle>
            <Card className="mt-3 p-4" style={{ background: C.clayLight, border: `1px solid ${C.soft}` }}>
              <div className="flex gap-3">
                <span className="mt-0.5 shrink-0" style={{ color: C.clayDark }}>
                  <Icon name="sunrise" size={18} />
                </span>
                <p className="text-[13.5px] leading-relaxed" style={{ color: C.ink }}>
                  They are celebrating their 10-year anniversary today. One recommendation — a
                  private sunrise breakfast — is waiting for approval.
                </p>
              </div>
            </Card>
          </div>

          <div>
            <SectionTitle>About them</SectionTitle>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Tag>quiet places</Tag>
              <Tag>sunrise & early mornings</Tag>
              <Tag>local seasonal food</Tag>
              <Tag>nature, not nightlife</Tag>
              <Tag>prefers understated gestures</Tag>
            </div>
          </div>

          <SensitiveNote title="Sensitive — handle with care">
            No alcohol — both guests. Do not mention the anniversary directly. Keep any gesture
            quiet and private. Maria prefers understated to a surprise.
          </SensitiveNote>

          <div>
            <SectionTitle>Notes & history</SectionTitle>
            <Card className="mt-3 overflow-hidden">
              {[
                {
                  icon: "quote" as IconName,
                  text: "“It’s our tenth anniversary.”",
                  meta: "Booking note · 12 days ago",
                },
                {
                  icon: "mail" as IconName,
                  text: "“Asked about quiet sunrise spots.”",
                  meta: "Email · 5 days ago",
                },
                {
                  icon: "bell" as IconName,
                  text: "“Declined the wine welcome last stay.”",
                  meta: "2023 stay",
                },
              ].map((n, i, arr) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-4 py-3.5"
                  style={{ borderBottom: i === arr.length - 1 ? "none" : `1px solid ${C.soft}` }}
                >
                  <span style={{ color: C.muted }}>
                    <Icon name={n.icon} size={16} />
                  </span>
                  <span className="flex-1 text-[13.5px]" style={{ color: C.ink }}>
                    {n.text}
                  </span>
                  <span className="shrink-0 text-[12px]" style={{ color: C.muted }}>
                    {n.meta}
                  </span>
                </div>
              ))}
            </Card>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          <div>
            <SectionTitle>This stay</SectionTitle>
            <Card className="mt-3 p-4">
              <dl className="space-y-3 text-[13px]">
                {[
                  { icon: "bed" as IconName, k: "Cabin", v: "Ocean Cabin 02" },
                  { icon: "calendar" as IconName, k: "Dates", v: "18–22 April (4 nights)" },
                  { icon: "clock" as IconName, k: "Check-in", v: "Today from 15:00" },
                ].map((r) => (
                  <div key={r.k} className="flex items-center gap-3">
                    <span style={{ color: C.muted }}>
                      <Icon name={r.icon} size={16} />
                    </span>
                    <span style={{ color: C.muted }} className="w-16">
                      {r.k}
                    </span>
                    <span style={{ color: C.ink }}>{r.v}</span>
                  </div>
                ))}
              </dl>
            </Card>
          </div>

          <div>
            <SectionTitle>Pending recommendation</SectionTitle>
            <Card className="mt-3 p-4">
              <div className="flex items-start gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: C.clayLight, color: C.clayDark }}
                >
                  <Icon name="sunrise" size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-medium" style={{ color: C.ink }}>
                    Private sunrise breakfast
                  </div>
                  <div className="text-[12.5px]" style={{ color: C.muted }}>
                    Deck · 19 Apr
                  </div>
                  <div className="mt-0.5 text-[12.5px] font-medium" style={{ color: C.clay }}>
                    Awaiting approval
                  </div>
                </div>
              </div>
              <div className="mt-3.5">
                <GhostButton>Review</GhostButton>
              </div>
            </Card>
          </div>

          <div>
            <SectionTitle>Outcomes</SectionTitle>
            <Card className="mt-3 p-4">
              <OutcomeList />
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SCREEN 4 — Recommendation Approval
// ============================================================

function InfoBlock({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div
      className="flex items-center gap-3 rounded-lg px-4 py-3"
      style={{ background: C.surface, border: `1px solid ${C.soft}` }}
    >
      <span style={{ color: C.muted }}>
        <Icon name={icon} size={18} />
      </span>
      <div>
        <div className="text-[11.5px] uppercase tracking-[0.06em]" style={{ color: C.muted }}>
          {label}
        </div>
        <div className="text-[14px] font-medium" style={{ color: C.ink }}>
          {value}
        </div>
      </div>
    </div>
  );
}

function RecommendationApproval() {
  const checklist = [
    "Confirm the 06:30 setup with the kitchen — by 18:00 today",
    "Fresh bread and island fruit",
    "Alcohol-free local drink — passionfruit & elderflower",
    "A short handwritten note",
  ];
  const sources = [
    { text: "“It’s our tenth anniversary.”", meta: "Booking note · 12 days ago" },
    { text: "“Asked about quiet sunrise spots.”", meta: "Email · 5 days ago" },
    { text: "“Declined the wine welcome last stay.”", meta: "2023 stay" },
  ];
  return (
    <div className="mx-auto max-w-[840px]">
      {/* Breadcrumb + status */}
      <div className="mb-4 flex items-center gap-2 text-[13px]" style={{ color: C.muted }}>
        <span>Recommendations</span>
        <span style={{ color: C.stone }}>/</span>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium"
          style={{ background: C.clayLight, color: C.clayDark }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: C.clay }} />
          Pending approval
        </span>
      </div>

      <h1 className="text-[24px] font-semibold tracking-tight" style={{ color: C.ink }}>
        Private sunrise breakfast on the deck
      </h1>
      <div className="mt-1.5 text-[13.5px]" style={{ color: C.muted }}>
        For Maria & Tom · Ocean Cabin 02
      </div>
      <p className="mt-2 text-[14px] leading-relaxed" style={{ color: C.ink }}>
        A quiet gesture for their anniversary morning — set just for the two of them.
      </p>

      {/* Info blocks */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <InfoBlock icon="calendar" label="When" value="19 Apr · 06:30" />
        <InfoBlock icon="clock" label="Preparation" value="~45 minutes" />
        <InfoBlock icon="effort" label="Effort" value="Low" />
      </div>

      <div className="mt-7 grid grid-cols-1 gap-7 md:grid-cols-2">
        {/* Why this may matter */}
        <div>
          <SectionTitle>Why this may matter</SectionTitle>
          <p className="mt-3 text-[13.5px] leading-relaxed" style={{ color: C.ink }}>
            It is built from things they have already told you — not a guess. They mentioned their
            anniversary, asked about sunrise spots, and a quiet morning fits how they travel.
          </p>
          <Card className="mt-4 overflow-hidden">
            {sources.map((s, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-3"
                style={{ borderBottom: i === sources.length - 1 ? "none" : `1px solid ${C.soft}` }}
              >
                <span style={{ color: C.muted }}>
                  <Icon name="quote" size={15} />
                </span>
                <span className="flex-1 text-[13px]" style={{ color: C.ink }}>
                  {s.text}
                </span>
                <span className="shrink-0 text-[12px]" style={{ color: C.muted }}>
                  {s.meta}
                </span>
              </div>
            ))}
          </Card>
        </div>

        {/* Preparation */}
        <div>
          <SectionTitle>Preparation</SectionTitle>
          <Card className="mt-3 p-4">
            <ul className="space-y-3">
              {checklist.map((c, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span
                    className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px]"
                    style={{ border: `1.5px solid ${C.stone}`, background: C.surface }}
                  />
                  <span className="text-[13.5px] leading-snug" style={{ color: C.ink }}>
                    {c}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <div className="mt-4">
            <SensitiveNote title="Keep it private">
              Do not mention the anniversary directly. No staff lingering, no card from the whole
              team — quiet and understated is the point.
            </SensitiveNote>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div
        className="mt-8 flex flex-wrap items-center gap-3 pt-5"
        style={{ borderTop: `1px solid ${C.soft}` }}
      >
        <PrimaryButton>Approve & schedule</PrimaryButton>
        <GhostButton>Adjust</GhostButton>
        <button className="px-2 text-[13px] font-medium" style={{ color: C.muted }}>
          Dismiss
        </button>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[12.5px]" style={{ color: C.muted }}>
        <Icon name="lock" size={13} />
        Nothing is sent to the guest — you will prepare this yourself.
      </p>
    </div>
  );
}

// ============================================================
// SCREEN 5 — Guest Portal Preview (two narrow guest-facing surfaces)
// ============================================================

/**
 * CSS-only "photo" treatment for the guest-facing surfaces. No external images:
 * a layered warm gradient + a soft sun, horizon, headland and water lines. Two moods:
 * "morning" (warm sand light) and "sunrise" (deeper, for the featured experience).
 */
function PortalScene({
  mood,
  height,
  caption,
}: {
  mood: "morning" | "sunrise";
  height: number;
  caption?: string;
}) {
  const morning = mood === "morning";
  const bg = morning
    ? "linear-gradient(176deg, #FBF4EC 0%, #F3E4DA 42%, #E9D6C5 70%, #E0D1BF 100%)"
    : "linear-gradient(176deg, #262320 0%, #4A3026 40%, #8A4528 78%, #B86A3E 100%)";
  const sun = morning ? "#D08A5C" : "#F0AE78";
  const sunGlow = morning ? "#E9B98F" : "#E89A5E";
  const water = morning ? C.stone : "#E0915C";
  const land = morning ? "#C3AE94" : "#1E1A17";
  const capColor = morning ? C.muted : "rgba(246,243,236,0.95)";
  const sunY = morning ? 60 : 102;

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ height, background: bg }}
      aria-hidden
    >
      <svg
        viewBox="0 0 400 180"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          {/* soft sun glow + a touch of depth at the foot — gives the flat gradient dimension */}
          <radialGradient id={`glow-${mood}`} cx="75%" cy={`${(sunY / 180) * 100}%`} r="58%">
            <stop offset="0%" stopColor={sunGlow} stopOpacity={morning ? 0.55 : 0.85} />
            <stop offset="62%" stopColor={sunGlow} stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`depth-${mood}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000" stopOpacity={morning ? 0.06 : 0.24} />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width="400" height="180" fill={`url(#glow-${mood})`} />

        {/* sun disc */}
        <circle cx="300" cy={sunY} r="26" fill={sun} opacity={morning ? 0.5 : 0.9} />

        {/* mist band near the horizon */}
        <path
          d="M0 96 Q120 88 240 94 T400 92"
          fill="none"
          stroke={morning ? "#FFFFFF" : "#F0C9A8"}
          strokeWidth="1.2"
          opacity={morning ? 0.5 : 0.22}
        />

        {/* headland silhouette */}
        <path
          d="M0 124 C50 112 80 118 120 108 C160 98 188 114 224 116 L224 180 L0 180 Z"
          fill={land}
          opacity={morning ? 0.22 : 0.55}
        />

        {/* horizon + sun reflection on the water */}
        <line x1="0" y1="122" x2="400" y2="122" stroke={water} strokeWidth="1" opacity="0.5" />
        <path d="M300 124 L295 178 L305 178 Z" fill={sun} opacity={morning ? 0.16 : 0.34} />

        {/* water ripples */}
        {[136, 148, 160, 170].map((y, i) => (
          <path
            key={y}
            d={`M0 ${y} Q100 ${y - 4} 200 ${y} T400 ${y}`}
            fill="none"
            stroke={water}
            strokeWidth="1"
            opacity={0.16 + i * 0.06}
          />
        ))}

        <rect x="0" y="0" width="400" height="180" fill={`url(#depth-${mood})`} />
      </svg>

      {caption && (
        <span
          className="absolute bottom-3 left-4 text-[11.5px] font-medium"
          style={{ color: capColor }}
        >
          {caption}
        </span>
      )}
    </div>
  );
}

function PortalSurface({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex w-full max-w-[420px] flex-col overflow-hidden rounded-2xl"
      style={{
        background: C.surface,
        border: `1px solid ${C.stone}`,
        boxShadow: "0 14px 34px -10px rgba(23,23,23,0.14)",
      }}
    >
      {children}
    </div>
  );
}

function PortalHeader({ subtitle }: { subtitle?: string }) {
  return (
    <div
      className="flex items-center justify-between px-5 py-3.5"
      style={{ borderBottom: `1px solid ${C.soft}` }}
    >
      <span style={{ color: C.muted }}>
        <Icon name="menu" size={18} />
      </span>
      <span className="text-[13px] font-medium" style={{ color: C.ink }}>
        Atlantic Hideaway{subtitle ? ` · ${subtitle}` : ""}
      </span>
      <span style={{ color: C.muted }}>
        <Icon name="mailOpen" size={17} />
      </span>
    </div>
  );
}

function GuestPortalPreview() {
  return (
    <div className="flex flex-wrap items-start justify-center gap-7">
      {/* Surface A — Welcome */}
      <PortalSurface>
        <PortalHeader subtitle="São Miguel" />
        <div className="px-6 py-6">
          <div className="text-[22px] font-semibold tracking-tight" style={{ color: C.ink }}>
            For Maria & Tom
          </div>

          <div className="mt-4 flex items-center gap-3">
            <span
              className="flex h-11 w-11 items-center justify-center rounded-lg"
              style={{ background: C.chip, color: C.muted }}
            >
              <Icon name="bed" size={18} />
            </span>
            <div className="text-[13px]" style={{ color: C.muted }}>
              <div className="font-medium" style={{ color: C.ink }}>
                Ocean Cabin 02
              </div>
              18–22 April (4 nights) · Check-in from 15:00
            </div>
          </div>

          {/* Hero band — CSS-only morning-light scene, no external image */}
          <div
            className="mt-5 overflow-hidden rounded-xl"
            style={{ border: `1px solid ${C.soft}` }}
          >
            <PortalScene mood="morning" height={150} caption="São Miguel · the cove at first light" />
          </div>

          <p className="mt-5 text-[14px] leading-relaxed" style={{ color: C.ink }}>
            The island is between seasons right now — green, quiet, and full of morning light. We
            left the windows facing the water for you.
          </p>
          <div className="mt-2 text-[13px] italic" style={{ color: C.muted }}>
            — Sofia, your host
          </div>

          <div className="mt-5 space-y-2.5">
            <button
              className="w-full rounded-md py-2.5 text-[14px] font-medium"
              style={{ background: C.clay, color: "#FFF" }}
            >
              Open your stay
            </button>
            <button
              className="w-full rounded-md py-2.5 text-[14px] font-medium"
              style={{ background: C.surface, color: C.ink, border: `1px solid ${C.stone}` }}
            >
              Plan a quiet morning
            </button>
          </div>

          <div
            className="mt-5 flex gap-3 rounded-lg p-3.5"
            style={{ background: C.paper }}
          >
            <span className="mt-0.5 shrink-0" style={{ color: C.muted }}>
              <Icon name="lock" size={16} />
            </span>
            <p className="text-[12.5px] leading-relaxed" style={{ color: C.muted }}>
              Check in any time after 15:00. The cabin is open — your key and note are on the
              kitchen table.
            </p>
          </div>
        </div>
      </PortalSurface>

      {/* Surface B — Local guide */}
      <PortalSurface>
        <PortalHeader />
        <div className="px-6 py-6">
          <div className="text-[20px] font-semibold tracking-tight" style={{ color: C.ink }}>
            If you would like to explore
          </div>
          <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: C.muted }}>
            A few places we would send a friend — and one quiet morning, if you would like it.
          </p>

          <div className="mt-5 space-y-1">
            {[
              { name: "Lagoa do Fogo", time: "25 min", desc: "A crater lake above the clouds." },
              { name: "Tony’s, Furnas", time: "35 min", desc: "Our go-to for lunch and hot springs." },
              {
                name: "The black-sand cove",
                time: "8 min walk",
                desc: "A small cove. Easy and quiet.",
              },
            ].map((p, i, arr) => (
              <div
                key={p.name}
                className="flex items-start gap-3 py-3"
                style={{ borderBottom: i === arr.length - 1 ? "none" : `1px solid ${C.soft}` }}
              >
                <span className="mt-0.5 shrink-0" style={{ color: C.clay }}>
                  <Icon name="pin" size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[14px] font-medium" style={{ color: C.ink }}>
                      {p.name}
                    </span>
                    <span className="shrink-0 text-[12px]" style={{ color: C.muted }}>
                      {p.time}
                    </span>
                  </div>
                  <div className="text-[12.5px]" style={{ color: C.muted }}>
                    {p.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Featured experience */}
          <div
            className="mt-5 overflow-hidden rounded-xl"
            style={{ border: `1px solid ${C.soft}` }}
          >
            <PortalScene mood="sunrise" height={120} caption="Sunrise · Caloura" />
            <div className="p-4">
              <div className="text-[15px] font-semibold" style={{ color: C.ink }}>
                Sunrise Kayak with a Local Guide
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: C.muted }}>
                Paddle out as the island wakes up. Quiet water, seabirds, and views you will not
                have any other time.
              </p>
              <dl className="mt-3 space-y-1.5 text-[12.5px]">
                {[
                  { k: "When", v: "Around sunrise" },
                  { k: "Meet", v: "06:15 · Caloura" },
                  { k: "Bring", v: "A warm layer" },
                ].map((r) => (
                  <div key={r.k} className="flex gap-3">
                    <dt className="w-12 font-medium" style={{ color: C.muted }}>
                      {r.k}
                    </dt>
                    <dd style={{ color: C.ink }}>{r.v}</dd>
                  </div>
                ))}
              </dl>
              <button
                className="mt-4 w-full rounded-md py-2.5 text-[13.5px] font-medium"
                style={{ background: C.basalt, color: C.sideActive }}
              >
                Ask Sofia to arrange
              </button>
              <p className="mt-2.5 text-center text-[12px]" style={{ color: C.muted }}>
                No need to book or pay — she will confirm the morning with you.
              </p>
            </div>
          </div>
        </div>
      </PortalSurface>
    </div>
  );
}

// ============================================================
// Preview shell with tab navigation
// ============================================================

type ScreenKey = "today" | "guests" | "detail" | "recommendation" | "portal";

const TABS: { key: ScreenKey; label: string }[] = [
  { key: "today", label: "Today Dashboard" },
  { key: "guests", label: "Guests List" },
  { key: "detail", label: "Guest Memory" },
  { key: "recommendation", label: "Recommendation" },
  { key: "portal", label: "Guest Portal" },
];

export default function DesignPreviewPage() {
  const [screen, setScreen] = useState<ScreenKey>("today");

  return (
    <div
      style={{
        background: C.paper,
        minHeight: "100vh",
        fontFamily: FONT,
        color: C.ink,
        // Reset any inherited spacing so headings, nav and body copy read crisp and natural.
        letterSpacing: "normal",
        wordSpacing: "normal",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <div className="mx-auto max-w-[1440px] px-8 py-7">
        {/* Preview header */}
        <header className="flex items-end justify-between">
          <div>
            <h1 className="text-[24px] font-semibold tracking-tight" style={{ color: C.ink }}>
              Experience-OS Design Preview
            </h1>
            <p className="mt-1 text-[14.5px]" style={{ color: C.muted }}>
              Basalt Workbench — Charcoal Sidebar
            </p>
          </div>
          <span
            className="hidden rounded-full px-3 py-1 text-[12px] font-medium sm:inline-flex"
            style={{ background: C.chip, color: C.muted }}
          >
            Static preview · hardcoded data
          </span>
        </header>

        {/* Tabs — quiet segmented control for switching preview screens */}
        <div
          className="mt-6 inline-flex flex-wrap gap-0.5 rounded-lg p-1"
          style={{ background: C.chip }}
        >
          {TABS.map((t) => {
            const isActive = t.key === screen;
            return (
              <button
                key={t.key}
                onClick={() => setScreen(t.key)}
                className="rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-colors"
                style={{
                  background: isActive ? C.surface : "transparent",
                  color: isActive ? C.clayDark : C.muted,
                  boxShadow: isActive ? "0 1px 2px rgba(23,23,23,0.08)" : "none",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Active screen */}
        <div className="mt-6">
          {screen === "today" && (
            <ProductShell active="Today">
              <TodayDashboard />
            </ProductShell>
          )}
          {screen === "guests" && (
            <ProductShell active="Guests">
              <GuestsList />
            </ProductShell>
          )}
          {screen === "detail" && (
            <ProductShell active="Guests">
              <GuestDetail />
            </ProductShell>
          )}
          {screen === "recommendation" && (
            <ProductShell active="Recommendations">
              <RecommendationApproval />
            </ProductShell>
          )}
          {screen === "portal" && (
            <div
              className="rounded-2xl px-6 py-10"
              style={{ border: `1px solid ${C.soft}`, background: C.surface }}
            >
              <p
                className="mx-auto mb-8 max-w-[680px] text-center text-[13.5px]"
                style={{ color: C.muted }}
              >
                Guest-facing surfaces — what Maria &amp; Tom would see. Two narrow, responsive web
                layouts, prepared by the host. Static preview only.
              </p>
              <GuestPortalPreview />
            </div>
          )}
        </div>

        {/* Footer caption */}
        <footer className="mt-10 text-[12px]" style={{ color: C.muted }}>
          Variant — Basalt Workbench · Charcoal sidebar · Clay accent · Static design preview
        </footer>
      </div>
    </div>
  );
}
