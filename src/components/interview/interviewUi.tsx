import type { ReactNode } from "react";

/**
 * Shared look for the Interviews screens. Taken from the Interviews page (the reference):
 * title and subtitle, primary and secondary buttons, search box, KPI tiles, status badges and table shells.
 */

export const btnPrimary =
  "flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors shadow-xs cursor-pointer disabled:opacity-50";

export const btnSecondary =
  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40";

export const selectClass =
  "rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:border-indigo-500";

export const inputClass =
  "w-full bg-slate-50/70 hover:bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 font-medium transition-colors";

export const tableShell = "overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm";
export const tableHead = "bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500";
export const th = "py-3 px-4 text-left";
export const td = "py-3 px-4 align-middle text-slate-700";
export const rowHover = "hover:bg-slate-50 transition-colors";

export const card = "rounded-xl border border-slate-200 bg-white shadow-sm";

const BADGE_TONES: Record<string, string> = {
  sky: "bg-sky-50 border-sky-200 text-sky-700",
  emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
  amber: "bg-amber-50 border-amber-200 text-amber-700",
  rose: "bg-rose-50 border-rose-200 text-rose-700",
  violet: "bg-violet-50 border-violet-200 text-violet-700",
  slate: "bg-slate-100 border-slate-200 text-slate-600",
};

/** Status badge, same shape as the Interviews page. */
export function Badge({ tone = "slate", children }: { tone?: keyof typeof BADGE_TONES; children: ReactNode }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-extrabold border ${BADGE_TONES[tone]}`}>{children}</span>
  );
}

export const statusTone = (status: string): keyof typeof BADGE_TONES =>
  status === "COMPLETED" ? "emerald"
    : status === "RESCHEDULED" ? "amber"
    : status === "CANCELLED" ? "rose"
    : status === "NO_SHOW" ? "violet"
    : "sky";

/** Page title, subtitle and actions, in the Interviews page layout. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-[20px] font-bold text-slate-900 tracking-[-0.02em] leading-tight">{title}</h1>
        {subtitle && <p className="text-xs font-medium text-slate-600 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export const TONE_ICON: Record<string, string> = {
  indigo: "bg-indigo-50 text-indigo-600 ring-indigo-100",
  blue: "bg-sky-50 text-sky-600 ring-sky-100",
  green: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  violet: "bg-violet-50 text-violet-600 ring-violet-100",
  rose: "bg-rose-50 text-rose-600 ring-rose-100",
  amber: "bg-amber-50 text-amber-600 ring-amber-100",
};

/** One KPI tile, as in the Interview Scheduling Calendar mockup: coloured icon, large number, small label. */
export function KpiTile({ label, value, icon, note, tone = "indigo", active, onClick }: {
  label: string; value: ReactNode; icon?: ReactNode; note?: string; tone?: keyof typeof TONE_ICON; active?: boolean; onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`p-3 rounded-xl border text-left transition-all duration-150 bg-white shadow-sm ${
        active ? "border-indigo-400 bg-indigo-50/40" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/60"
      } ${onClick ? "cursor-pointer" : "cursor-default"}`}
    >
      <div className="flex items-center gap-3">
        {icon && <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-4 ${TONE_ICON[tone]}`}>{icon}</span>}
        <div className="min-w-0">
          <div className="text-xl font-bold text-slate-900 leading-tight tabular-nums">{value}</div>
          <div className="text-xs text-slate-500 truncate">{label}</div>
          {note && <div className="text-[11px] text-slate-400 truncate">{note}</div>}
        </div>
      </div>
    </button>
  );
}

export function KpiGrid({ children, cols = "lg:grid-cols-6" }: { children: ReactNode; cols?: string }) {
  return <div className={`grid grid-cols-2 sm:grid-cols-3 ${cols} gap-3`}>{children}</div>;
}

/** Search box with the Interviews page styling. */
export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`${inputClass} max-w-xs`} />
  );
}

/** Tab group in the same rounded style as the Interviews page filters. */
export function TabGroup<T extends string>({ tabs, value, onChange }: {
  tabs: { key: T; label: string; count?: number }[]; value: T; onChange: (k: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
            value === t.key ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          {t.label}{t.count !== undefined ? ` (${t.count})` : ""}
        </button>
      ))}
    </div>
  );
}
