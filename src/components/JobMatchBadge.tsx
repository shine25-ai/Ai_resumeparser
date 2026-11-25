import { Target } from "lucide-react";

/** Job match (Phase 9): the candidate's saved skills against the job's primary (70%) and secondary (30%) skills. */
export interface JobMatch {
  pct: number;
  primary_pct?: number | null;
  /** The job's skills the candidate does not have, primary first (up to 8). */
  gaps: string[];
  label?: string;
}

const tone = (pct: number) =>
  pct >= 75
    ? "bg-emerald-50 text-emerald-700 border-emerald-200/70"
    : pct >= 50
      ? "bg-amber-50 text-amber-700 border-amber-200/70"
      : "bg-rose-50 text-rose-700 border-rose-200/70";

/** "82% match" pill; the tooltip lists the gaps. Shows a muted dash when there is no score yet. */
export default function JobMatchBadge({ match, pct, gaps, compact = false }: {
  match?: JobMatch | null;
  pct?: number | null;
  gaps?: string[];
  compact?: boolean;
}) {
  const value = match?.pct ?? pct ?? null;
  const missing = match?.gaps ?? gaps ?? [];
  if (value == null) {
    return <span className="text-xs text-slate-400" title="No match score: the candidate's skills aren't read yet, or the job lists no skills.">—</span>;
  }
  const tip = missing.length ? `Missing: ${missing.join(", ")}` : "Has all the job's listed skills";
  return (
    <span
      title={tip}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${tone(value)}`}
    >
      <Target size={11} className="shrink-0" />
      {Math.round(value)}%{compact ? "" : " match"}
    </span>
  );
}
