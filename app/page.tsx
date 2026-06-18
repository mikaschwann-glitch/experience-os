import Link from "next/link";

const C = {
  paper: "#F6F3EC",
  surface: "#FFFFFF",
  ink: "#171717",
  muted: "#6F6A61",
  soft: "#E7E1D6",
  stone: "#D8D2C4",
  clay: "#A4512C",
};

const FONT =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export default function Home() {
  return (
    <div
      className="flex min-h-screen flex-1 items-center justify-center"
      style={{ background: C.paper, fontFamily: FONT, color: C.ink }}
    >
      <main className="w-full max-w-[560px] px-8">
        <div className="text-[12px] font-semibold uppercase tracking-[0.06em]" style={{ color: C.muted }}>
          Experience-OS
        </div>
        <h1 className="mt-2 text-[28px] font-semibold tracking-tight">
          Host cockpit — Run 1 foundation
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed" style={{ color: C.muted }}>
          Experience Intelligence for premium micro-hospitality. Multi-tenant foundation with the
          manual Signal → Insight → Recommendation → Host Action → Outcome loop.
        </p>

        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="rounded-md px-4 py-2.5 text-[14px] font-medium no-underline"
            style={{ background: C.clay, color: "#FFF" }}
          >
            Open the host cockpit
          </Link>
          <Link
            href="/design-preview"
            className="rounded-md px-4 py-2.5 text-[14px] font-medium no-underline"
            style={{ background: C.surface, color: C.ink, border: `1px solid ${C.stone}` }}
          >
            Design preview
          </Link>
        </div>

        <p className="mt-6 text-[12.5px]" style={{ color: C.muted }}>
          First run? Set <code>DATABASE_URL</code> in <code>.env.local</code>, then{" "}
          <code>npm run db:migrate</code> and <code>npm run db:seed</code>.
        </p>
      </main>
    </div>
  );
}
