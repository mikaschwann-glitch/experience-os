import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Shared presentational primitives for the host cockpit, styled in the frozen
 * "Basalt Workbench — Charcoal Sidebar" direction (see docs/design-system.md).
 * Server-component safe: no client hooks, no event handlers — forms submit to
 * server actions. Colors are inline so they render exactly.
 */
export const C = {
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
  sideText: "#CFC8BA",
  sideTextDim: "#8C867A",
  sideActive: "#F6F3EC",
} as const;

export const FONT =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

// ---- Minimal line-icon set (stroke-based, currentColor; no icon overload) ----
export type IconName =
  | "today"
  | "guests"
  | "recommend"
  | "properties"
  | "user"
  | "bed"
  | "clipboard"
  | "clock"
  | "calendar"
  | "note"
  | "check"
  | "circle"
  | "plus"
  | "arrowRight";

const ICON_PATHS: Record<IconName, string> = {
  today:
    "M5 4h14a2 2 0 012 2v13a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM3 9h18M8 3v4M16 3v4M9 14l2 2 4-4",
  guests:
    "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.8M16 3.2A4 4 0 0116 11",
  recommend: "M12 3l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z",
  properties:
    "M3 21h18M5 21V5a1 1 0 011-1h8a1 1 0 011 1v16M9 8h2M9 12h2M9 16h2M15 21V10h3a1 1 0 011 1v10",
  user: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z",
  bed: "M2 18v-6a2 2 0 012-2h16a2 2 0 012 2v6M2 14h20M6 10V8a2 2 0 012-2h3a2 2 0 012 2v2",
  clipboard:
    "M9 4h6a1 1 0 011 1v1H8V5a1 1 0 011-1zM8 6H6a2 2 0 00-2 2v11a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2h-2",
  clock: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2",
  calendar: "M5 4h14a2 2 0 012 2v13a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM3 9h18M8 3v4M16 3v4",
  note: "M21 11.5a8.4 8.4 0 01-8.5 8.5 8.5 8.5 0 01-3.8-.9L3 21l1.9-5.7A8.4 8.4 0 014 11.5 8.5 8.5 0 0112.5 3 8.4 8.4 0 0121 11.5z",
  check: "M12 21a9 9 0 100-18 9 9 0 000 18zM8.5 12l2.5 2.5 4.5-5",
  circle: "M12 21a9 9 0 100-18 9 9 0 000 18z",
  plus: "M12 5v14M5 12h14",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
};

export function Icon({
  name,
  size = 18,
  stroke = 1.6,
  style,
}: {
  name: IconName;
  size?: number;
  stroke?: number;
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
      style={style}
      aria-hidden="true"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

export function Avatar({
  name,
  tone = "neutral",
  size = 40,
}: {
  name: string;
  tone?: "clay" | "neutral";
  size?: number;
}) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("");
  const clay = tone === "clay";
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{
        height: size,
        width: size,
        fontSize: size * 0.34,
        background: clay ? C.clayLight : C.chip,
        color: clay ? C.clayDark : C.muted,
      }}
    >
      {initials}
    </span>
  );
}

export function Card({
  children,
  className,
  style,
}: {
  children: ReactNode;
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

export function SectionTitle({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <h2
        className="text-[11.5px] font-semibold uppercase tracking-[0.045em]"
        style={{ color: C.muted }}
      >
        {children}
      </h2>
      {right ? <div>{right}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[25px] font-semibold tracking-tight" style={{ color: C.ink }}>
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-2 text-[14.5px] leading-relaxed" style={{ color: C.muted }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-[3px] text-[12px] leading-none"
      style={{ background: C.chip, color: C.muted }}
    >
      {children}
    </span>
  );
}

export function MetricChip({ value, label }: { value: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 text-[12.5px]" style={{ color: C.muted }}>
      <span className="font-semibold" style={{ color: C.ink }}>
        {value}
      </span>
      {label}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string }> = {
    pending: { bg: C.clayLight, fg: C.clayDark },
    accepted: { bg: C.chip, fg: C.ink },
    dismissed: { bg: C.soft, fg: C.muted },
    planned: { bg: C.clayLight, fg: C.clayDark },
    done: { bg: C.chip, fg: C.ink },
    in_residence: { bg: C.clayLight, fg: C.clayDark },
    upcoming: { bg: C.chip, fg: C.muted },
    departed: { bg: C.soft, fg: C.muted },
  };
  const s = map[status] ?? { bg: C.chip, fg: C.muted };
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-[2px] text-[11.5px] font-medium capitalize"
      style={{ background: s.bg, color: s.fg }}
    >
      {status.replace("_", " ")}
    </span>
  );
}

export function StatCard({
  icon,
  value,
  label,
  alert,
  href,
}: {
  icon: IconName;
  value: string | number;
  label: string;
  alert?: boolean;
  href?: string;
}) {
  const inner = (
    <Card className="p-4" style={href ? { transition: "border-color .15s" } : undefined}>
      <div className="flex items-start justify-between">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ background: C.paper, color: C.muted }}
        >
          <Icon name={icon} size={18} />
        </span>
        {alert ? <span className="h-2 w-2 rounded-full" style={{ background: C.clay }} /> : null}
      </div>
      <div className="mt-3 text-[28px] font-semibold leading-none" style={{ color: C.ink }}>
        {value}
      </div>
      <div className="mt-1.5 text-[13px]" style={{ color: C.muted }}>
        {label}
      </div>
    </Card>
  );
  if (!href) return inner;
  return (
    <Link href={href} className="block no-underline">
      {inner}
    </Link>
  );
}

export function SensitiveNote({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg p-4" style={{ background: C.warn, border: `1px solid ${C.soft}` }}>
      <div className="text-[13px] font-semibold" style={{ color: C.ink }}>
        {title}
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: C.muted }}>
        {children}
      </p>
    </div>
  );
}

export function RationaleNote({ children }: { children: ReactNode }) {
  // Calm, clay-tinted "why this matters" block — rationale stays prominent but not alarming.
  return (
    <div
      className="rounded-lg p-3.5"
      style={{ background: C.clayLight, border: `1px solid ${C.soft}` }}
    >
      <div
        className="mb-1 text-[11px] font-semibold uppercase tracking-[0.05em]"
        style={{ color: C.clayDark }}
      >
        Why this may matter
      </div>
      <p className="text-[13px] leading-relaxed" style={{ color: C.ink }}>
        {children}
      </p>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="px-5 py-6 text-[13px]" style={{ color: C.muted }}>
      {children}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
};

export function SubmitButton({ variant = "primary", style, ...rest }: ButtonProps) {
  const primary = variant === "primary";
  return (
    <button
      {...rest}
      className="inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-[13px] font-medium"
      style={{
        background: primary ? C.clay : C.surface,
        color: primary ? "#FFF" : C.ink,
        border: primary ? "none" : `1px solid ${C.stone}`,
        cursor: "pointer",
        ...style,
      }}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium" style={{ color: C.muted }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const controlStyle: React.CSSProperties = {
  width: "100%",
  background: C.surface,
  border: `1px solid ${C.stone}`,
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  color: C.ink,
};

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...controlStyle, ...props.style }} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} style={{ ...controlStyle, ...props.style }} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} style={{ ...controlStyle, ...props.style }} />;
}
