import { createLink } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from "react";
import type { CurvePoint } from "@/lib/stats";

export function Page({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen bg-lp-bg font-lp text-lp-ink antialiased">
      <main
        className={`mx-auto flex min-h-screen w-full flex-col gap-6 px-4 pb-10 pt-8 sm:px-6 sm:pt-12 ${
          wide ? "max-w-3xl" : "max-w-xl"
        }`}
      >
        {children}
      </main>
    </div>
  );
}

const BackAnchor = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement>>(
  function BackAnchor({ children, ...props }, ref) {
    return (
      <a
        ref={ref}
        {...props}
        className="-ml-1 inline-flex min-h-10 items-center gap-0.5 self-start rounded-lg pr-2 text-sm font-semibold text-lp-ink-3 hover:text-lp-sage"
      >
        <ChevronLeft className="size-[18px]" strokeWidth={2.2} />
        {children}
      </a>
    );
  },
);

/** Zurück-Link oben links (typsicher wie <Link>). */
export const Back = createLink(BackAnchor);

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-[22px] border border-lp-line bg-lp-surface p-4 ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="-mb-2 flex items-baseline justify-between gap-3">
      <h2 className="text-lg font-bold">{children}</h2>
      {action}
    </div>
  );
}

export function Chip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "sage";
}) {
  const cls =
    tone === "sage"
      ? "bg-lp-sage-soft text-lp-sage"
      : "border border-lp-line bg-lp-surface text-lp-ink-3";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}
    >
      {children}
    </span>
  );
}

export function Bar({ pct, size = "md" }: { pct: number; size?: "sm" | "md" }) {
  const h = size === "sm" ? "h-[6px]" : "h-2";
  return (
    <div className={`${h} overflow-hidden rounded-full bg-lp-track`}>
      <div
        className={`${h} rounded-full bg-lp-sage transition-[width] duration-500`}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

/** Balken in drei Teilen: sitzt (grün), noch üben (rot), offen. */
export function Mastery({ total, good, bad }: { total: number; good: number; bad: number }) {
  const w = (n: number) => `${total ? (n / total) * 100 : 0}%`;
  return (
    <div className="flex h-[7px] gap-0.5 overflow-hidden rounded-full bg-lp-track">
      {good ? <i className="block bg-lp-good" style={{ width: w(good) }} /> : null}
      {bad ? <i className="block bg-lp-warn" style={{ width: w(bad) }} /> : null}
    </div>
  );
}

export function MasteryLegend() {
  const dot = "mr-1.5 inline-block size-2 rounded-[3px] align-[1px]";
  return (
    <div className="flex gap-4 text-xs text-lp-muted">
      <span>
        <i className={`${dot} bg-lp-good`} />
        sitzt
      </span>
      <span>
        <i className={`${dot} bg-lp-warn`} />
        noch üben
      </span>
      <span>
        <i className={`${dot} bg-lp-track`} />
        offen
      </span>
    </div>
  );
}

export function Ring({ pct, size = 54 }: { pct: number; size?: number }) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div
      className="grid flex-none place-items-center rounded-full"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(var(--lp-sage) ${p}%, var(--lp-sage-soft) 0)`,
      }}
      aria-label={`${p} Prozent geübt`}
    >
      <span
        className="grid place-items-center rounded-full bg-lp-surface text-[13px] font-bold"
        style={{ width: size - 12, height: size - 12 }}
      >
        {p}%
      </span>
    </div>
  );
}

export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[18px] border border-lp-line bg-lp-surface px-3 py-3">
      <span className="font-display text-2xl font-extrabold tracking-[-0.02em]">{value}</span>
      <span className="text-xs text-lp-muted">{label}</span>
    </div>
  );
}

export function GradeBadge({ grade, size = "md" }: { grade: number | null; size?: "md" | "lg" }) {
  const tone =
    grade === null
      ? "border-[1.5px] border-dashed border-lp-line text-lp-muted"
      : grade <= 2
        ? "bg-lp-good-soft text-lp-good"
        : grade <= 4
          ? "bg-lp-sage-soft text-lp-sage"
          : "bg-lp-warn-soft text-lp-warn";
  const dim =
    size === "lg"
      ? "size-[112px] rounded-[34px] text-[64px] tracking-[-0.04em]"
      : "size-[34px] rounded-xl text-[17px]";
  return (
    <span
      className={`grid flex-none place-items-center font-display font-extrabold ${dim} ${tone}`}
    >
      {grade ?? "–"}
    </span>
  );
}

/** Lernkurve im Stil einer Patientenkurve auf Rasterpapier. */
export function LearningCurve({ points }: { points: CurvePoint[] }) {
  const W = 300;
  const H = 140;
  const x0 = 26;
  const x1 = 290;
  const y0 = 6;
  const y1 = 116;
  const y = (pct: number) => y1 - (pct / 100) * (y1 - y0);
  const step = points.length > 1 ? (x1 - x0) / (points.length - 1) : 0;
  const xs = points.map((_, i) => (points.length > 1 ? x0 + i * step : (x0 + x1) / 2));
  const line = points.map((p, i) => `${xs[i]},${y(p.pct)}`).join(" ");
  const last = points.at(-1);
  const label = (d: string) => {
    const [, m, day] = d.split("-");
    return `${Number(day)}.${Number(m)}.`;
  };
  const labelIdx = new Set(
    points.length <= 4
      ? points.map((_, i) => i)
      : [0, Math.round((points.length - 1) / 2), points.length - 1],
  );

  return (
    <div className="rounded-[22px] border border-lp-line bg-lp-surface px-3.5 pb-2.5 pt-3.5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-bold">Lernkurve</h3>
        <span className="text-xs text-lp-muted">Prozent richtig je Lerntag</span>
      </div>
      {points.length === 0 ? (
        <p className="py-8 text-center text-sm text-lp-muted">
          Sobald du übst, entsteht hier deine Kurve.
        </p>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`Lernkurve, zuletzt ${last?.pct ?? 0} Prozent richtig`}
        >
          <defs>
            <pattern
              id="lp-raster"
              width="13.2"
              height="11"
              patternUnits="userSpaceOnUse"
              x={x0}
              y={y0}
            >
              <path d="M13.2 0H0V11" fill="none" stroke="var(--lp-grid)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="url(#lp-raster)" />
          <line
            x1={x0}
            x2={x1}
            y1={y(82)}
            y2={y(82)}
            stroke="var(--lp-good)"
            strokeWidth="1"
            strokeDasharray="4 3"
          />
          <text x={x0 + 4} y={y(82) - 4} fontSize="9" fill="var(--lp-good)">
            Sehr gut
          </text>
          <g fontSize="9" fill="var(--lp-muted)">
            <text x="0" y={y(100) + 3}>
              100
            </text>
            <text x="6" y={y(50) + 3}>
              50
            </text>
            <text x="12" y={y(0) + 3}>
              0
            </text>
          </g>
          {points.length > 1 ? (
            <polyline
              fill="none"
              stroke="var(--lp-sage)"
              strokeWidth="2.4"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={line}
            />
          ) : null}
          {points.map((p, i) =>
            i === points.length - 1 ? (
              <circle key={p.day} cx={xs[i]} cy={y(p.pct)} r="5" fill="var(--lp-sage)" />
            ) : (
              <circle
                key={p.day}
                cx={xs[i]}
                cy={y(p.pct)}
                r="3.5"
                fill="var(--lp-surface)"
                stroke="var(--lp-sage)"
                strokeWidth="2"
              />
            ),
          )}
          <g fontSize="9" fill="var(--lp-muted)" textAnchor="middle">
            {points.map((p, i) =>
              labelIdx.has(i) ? (
                <text key={p.day} x={xs[i]} y={H - 6}>
                  {label(p.day)}
                </text>
              ) : null,
            )}
          </g>
        </svg>
      )}
    </div>
  );
}

export const primaryBtn =
  "inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-lp-sage px-5 text-base font-bold text-lp-on-sage transition-colors hover:bg-lp-sage-dark disabled:cursor-not-allowed disabled:bg-lp-line disabled:text-lp-muted";

export const secondaryBtn =
  "inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-lp-line bg-lp-surface px-5 text-[15px] font-bold text-lp-ink-2 transition-colors hover:border-lp-sage-line";

export const softBtn =
  "inline-flex min-h-10 items-center justify-center rounded-full bg-lp-sage-soft px-4 text-sm font-bold text-lp-sage transition-colors hover:bg-lp-sage-on";

export const linkBtn = "text-sm font-semibold text-lp-sage hover:text-lp-sage-dark";

export function Spinner({ label = "Lädt …" }: { label?: string }) {
  return <p className="py-10 text-center text-sm text-lp-muted">{label}</p>;
}
