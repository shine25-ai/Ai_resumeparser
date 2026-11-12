import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Clock, XCircle } from "lucide-react";
import { getCandidateInterviewHistory, type InterviewItem } from "../../utils/Api";

/**
 * The candidate's real interview rounds, oldest first, with the round being
 * reviewed highlighted. Replaces a hard-coded "HR Screening / Technical /
 * Managerial" tracker that showed the same three steps for everyone.
 */
interface RoundsTrackerProps {
  candidateId?: string;
  currentInterviewId?: string;
}

const typeLabel = (code?: string) => {
  if (!code) return "Interview";
  if (code.length <= 3) return code.toUpperCase();
  return code.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
};

const shortDate = (iso?: string) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";

export function RoundsTracker({ candidateId, currentInterviewId }: RoundsTrackerProps) {
  const [rounds, setRounds] = useState<InterviewItem[] | null>(null);

  useEffect(() => {
    if (!candidateId) return;
    let cancelled = false;
    setRounds(null);
    getCandidateInterviewHistory(candidateId)
      .then((data: any) => {
        if (cancelled) return;
        const list: InterviewItem[] = data?.rounds || [];
        list.sort((a, b) => `${a.scheduled_date} ${a.scheduled_time}`.localeCompare(`${b.scheduled_date} ${b.scheduled_time}`));
        setRounds(list);
      })
      .catch(() => !cancelled && setRounds([]));
    return () => {
      cancelled = true;
    };
  }, [candidateId]);

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-4 space-y-3 shadow-xs">
      <span className="text-xs font-extrabold text-slate-900 block uppercase tracking-wider">Interview rounds</span>
      {rounds === null ? (
        <p className="text-xs text-slate-500">Loading rounds...</p>
      ) : rounds.length === 0 ? (
        <p className="text-xs text-slate-500">No rounds found.</p>
      ) : (
        <ol className="space-y-2 text-xs">
          {rounds.map((r) => {
            const current = r.id === currentInterviewId;
            const verdict = r.verdict || "Pending";
            const done = r.status === "COMPLETED";
            const closed = r.status === "CANCELLED" || r.status === "NO_SHOW";
            const icon = closed ? <XCircle size={14} /> : done ? <CheckCircle2 size={14} /> : current ? <Clock size={14} /> : <Circle size={14} />;
            const tone = current
              ? "bg-indigo-50 text-indigo-800 border-indigo-200"
              : closed
              ? "bg-slate-50 text-slate-400 border-slate-200"
              : done
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-slate-50 text-slate-600 border-slate-200";
            return (
              <li key={r.id} className={`flex items-start gap-2 p-2 rounded-xl border font-semibold ${tone}`}>
                <span className="mt-0.5">{icon}</span>
                <span className="flex-1">
                  {typeLabel(r.interview_type)} R{r.round_number || 1}
                  {current && " (this round)"}
                  <span className="block font-normal opacity-80">
                    {shortDate(r.scheduled_date)} · {closed ? r.status.replace("_", " ").toLowerCase() : verdict}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
