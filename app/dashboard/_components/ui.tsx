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

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2
      className="text-[11.5px] font-semibold uppercase tracking-[0.045em]"
      style={{ color: C.muted }}
    >
      {children}
    </h2>
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

export function StatusBadge({
  status,
}: {
  status: "pending" | "accepted" | "dismissed" | string;
}) {
  const map: Record<string, { bg: string; fg: string }> = {
    pending: { bg: C.clayLight, fg: C.clayDark },
    accepted: { bg: C.chip, fg: C.ink },
    dismissed: { bg: C.soft, fg: C.muted },
  };
  const s = map[status] ?? { bg: C.chip, fg: C.muted };
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-[2px] text-[11.5px] font-medium capitalize"
      style={{ background: s.bg, color: s.fg }}
    >
      {status}
    </span>
  );
}

export function StatCard({
  value,
  label,
  alert,
}: {
  value: string | number;
  label: string;
  alert?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div className="text-[28px] font-semibold leading-none" style={{ color: C.ink }}>
          {value}
        </div>
        {alert ? (
          <span className="h-2 w-2 rounded-full" style={{ background: C.clay }} />
        ) : null}
      </div>
      <div className="mt-2 text-[13px]" style={{ color: C.muted }}>
        {label}
      </div>
    </Card>
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
    <div
      className="rounded-lg p-4"
      style={{ background: C.warn, border: `1px solid ${C.soft}` }}
    >
      <div className="text-[13px] font-semibold" style={{ color: C.ink }}>
        {title}
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: C.muted }}>
        {children}
      </p>
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
      className="inline-flex items-center justify-center rounded-md px-3.5 py-2 text-[13px] font-medium"
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

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
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
