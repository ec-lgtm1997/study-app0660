import type { ReactNode } from "react";

export function Page({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-lp-bg font-lp text-lp-ink antialiased">
      <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 px-5 pb-8 pt-10 sm:pt-14">
        {children}
      </main>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-[20px] border border-lp-line bg-lp-surface p-[18px] ${className}`}>
      {children}
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
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${cls}`}>
      {children}
    </span>
  );
}

export function Bar({ pct, size = "md" }: { pct: number; size?: "sm" | "md" }) {
  const h = size === "sm" ? "h-[5px]" : "h-2";
  return (
    <div className={`${h} overflow-hidden rounded-full bg-lp-track`}>
      <div
        className={`${h} rounded-full bg-lp-sage transition-[width] duration-500`}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl border border-lp-line bg-lp-surface p-3">
      <span className="text-xl font-extrabold">{value}</span>
      <span className="text-xs text-lp-muted">{label}</span>
    </div>
  );
}

export const primaryBtn =
  "inline-flex min-h-[54px] w-full items-center justify-center rounded-2xl bg-lp-sage px-5 text-base font-bold text-white transition-colors hover:bg-lp-sage-dark disabled:cursor-not-allowed disabled:bg-lp-line disabled:text-lp-muted";

export const secondaryBtn =
  "inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl border-[1.5px] border-[#d5dbd8] px-5 text-[15px] font-bold text-lp-ink-2 transition-colors hover:bg-lp-surface";

export function Spinner({ label = "Lädt …" }: { label?: string }) {
  return <p className="py-10 text-center text-sm text-lp-muted">{label}</p>;
}
