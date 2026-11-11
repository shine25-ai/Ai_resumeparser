import type { InterviewItem } from "../types/interview";

/**
 * Where an interview stands, used to decide which actions make sense for it.
 * - upcoming: booked for today or later
 * - needs-feedback: the date has passed and nobody has given feedback yet
 * - done: feedback is in (or it was marked completed)
 * - closed: cancelled, no-show or withdrawn
 */
export type InterviewPhase = "upcoming" | "needs-feedback" | "done" | "closed";

const CLOSED_STATUSES = ["CANCELLED", "NO_SHOW"];
const CLOSED_OUTCOMES = ["No Show", "Withdrawn"];

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function hasFeedback(item: InterviewItem): boolean {
  if ((item.rating ?? 0) > 0 || (item.client_rating ?? 0) > 0) return true;
  if (item.recommendation && item.recommendation !== "Pending") return true;
  return (item.interviewers || []).some((i) => (i.rating ?? 0) > 0 || !!i.feedback);
}

export function getInterviewPhase(item: InterviewItem, today: string = todayIso()): InterviewPhase {
  if (CLOSED_STATUSES.includes(item.status) || CLOSED_OUTCOMES.includes(item.recommendation || "")) return "closed";
  if (item.status === "COMPLETED" || hasFeedback(item)) return "done";
  if ((item.scheduled_date || "") >= today) return "upcoming";
  return "needs-feedback";
}

/** Verdict: how the interview went. Stage: where the candidate is. Both are worked out by the server. */
export const VERDICTS = ["Pending", "Selected", "Rejected", "On Hold", "No Show"];
export const INTERVIEW_STAGES = ["Interviewing", "Offer", "Hired", "Closed"];
export const CANDIDATE_STAGES = ["Screening", ...INTERVIEW_STAGES];

export function getVerdictBadge(verdict: string): string {
  switch (verdict) {
    case "Selected":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "Rejected":
      return "bg-rose-50 text-rose-700 border-rose-200";
    case "On Hold":
    case "No Show":
      return "bg-amber-50 text-amber-800 border-amber-200";
    default:
      return "bg-slate-50 text-slate-600 border-slate-200";
  }
}
