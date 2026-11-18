import React from 'react';
import { UserCheck, ClipboardCheck } from 'lucide-react';
import { WidgetCard } from './WidgetCard';
import type {
  InterviewerWorkloadData,
  RejectionAndOffersData,
} from '../../types/dashboard';

interface InterviewerAndOutcomesRowProps {
  workload?: InterviewerWorkloadData;
  outcomes?: RejectionAndOffersData;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onNavigate?: (path: string) => void;
}

const SIMPLE_REASONS: Record<string, string> = {
  'Compensation Mismatch': 'Salary mismatch',
  'Technical Depth / Skills': 'Skills mismatch',
  'Role / Skills Mismatch': 'Not a role fit',
  'Notice Period Too Long': 'Long notice period',
  'Communication Gaps': 'Communication',
  'Culture / Team Fit': 'Team fit',
  'Location / Relocation': 'Location issue',
  'Candidate No-Show': 'Did not attend',
};

function simplifyReason(reason: string): string {
  return SIMPLE_REASONS[reason] || reason;
}

export const InterviewerAndOutcomesRow = React.memo(
  function InterviewerAndOutcomesRow({
    workload,
    outcomes,
    loading,
    error,
    onRetry,
    onNavigate,
  }: InterviewerAndOutcomesRowProps) {
    const interviewers = workload?.interviewers || [];
    const rejectionReasons = outcomes?.rejection_reasons || [];

    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        {/* Widget 10: Interviewer Activity */}
        <WidgetCard
          title="Interviewer Activity"
          subtitle="Interviews assigned, completed, and pending feedback per interviewer"
          icon={<UserCheck size={15} />}
          iconBg="bg-sky-50 text-sky-600 ring-1 ring-sky-100/80"
          loading={loading}
          error={error}
          onRetry={onRetry}
          headerRight={
            <div className="flex items-center gap-2 text-[11px] tabular-nums">
              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                No-shows: <strong className="font-semibold text-slate-800">{workload?.no_show_rate ?? 0}%</strong>
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                Rescheduled: <strong className="font-semibold text-slate-800">{workload?.reschedule_rate ?? 0}%</strong>
              </span>
            </div>
          }
          footer={
            <div className="flex items-center justify-between">
              <span>
                Total interviews:{' '}
                <strong className="font-semibold text-slate-800 tabular-nums">
                  {workload?.total_rounds ?? 0}
                </strong>
              </span>
              <span className="text-slate-400">Click an interviewer to view rounds</span>
            </div>
          }
        >
          {interviewers.length > 0 ? (
            <div className="overflow-x-auto -mx-5 sm:-mx-6">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100/85 border-y border-slate-200/80 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                    <th className="py-2.5 pl-5 sm:pl-6 pr-3 font-bold">Interviewer</th>
                    <th className="py-2.5 px-2.5 text-right font-bold">Total</th>
                    <th className="py-2.5 px-2.5 text-right font-bold">Completed</th>
                    <th className="py-2.5 pl-2.5 pr-5 sm:pr-6 text-right font-bold">Needs Feedback</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {interviewers.map((iv) => (
                    <tr
                      key={iv.name}
                      onClick={() =>
                        onNavigate?.(`/interviews?view=all&search=${encodeURIComponent(iv.name)}`)
                      }
                      title={`View all interviews by ${iv.name}`}
                      className="hover:bg-slate-50/80 cursor-pointer group transition-colors"
                    >
                      <td className="py-2.5 pl-5 sm:pl-6 pr-3 font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors truncate max-w-[190px]">
                        {iv.name}
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-semibold text-slate-900 tabular-nums">
                        {iv.total_interviews}
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-medium text-slate-700 tabular-nums">
                        {iv.completed}
                      </td>
                      <td className="py-2.5 pl-2.5 pr-5 sm:pr-6 text-right tabular-nums">
                        {iv.pending_feedback > 0 ? (
                          <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium text-[11px]">
                            {iv.pending_feedback}
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-10 text-center text-xs text-slate-400">
              No interviewer assignment records found for this period.
            </div>
          )}
        </WidgetCard>

        {/* Widget 11: Offers & Rejections */}
        <WidgetCard
          title="Offers & Rejections"
          subtitle="Offer status and why candidates were rejected"
          icon={<ClipboardCheck size={15} />}
          iconBg="bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100/80"
          loading={loading}
          error={error}
          onRetry={onRetry}
          headerRight={
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200/70 tabular-nums">
              {outcomes?.total_rejections ?? 0} rejected
            </span>
          }
          footer={
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">
                {outcomes?.offer_acceptance_rate !== null &&
                outcomes?.offer_acceptance_rate !== undefined
                  ? `Offer acceptance rate: ${outcomes.offer_acceptance_rate}%`
                  : 'No offers sent yet'}
              </span>
              <button
                type="button"
                onClick={() => onNavigate?.('/interviews?view=all')}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
              >
                View interviews →
              </button>
            </div>
          }
        >
          {/* Simple 3-Number Offer Summary */}
          <div className="grid grid-cols-3 gap-2.5 mb-5">
            <div className="p-3 rounded-xl bg-slate-50/90 border border-slate-200/60">
              <span className="text-[11px] text-slate-500 block">Offers sent</span>
              <span className="text-lg font-semibold text-slate-900 tabular-nums mt-0.5 block">
                {outcomes?.offers_extended ?? 0}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-200/50">
              <span className="text-[11px] text-emerald-700 block">Accepted</span>
              <span className="text-lg font-semibold text-emerald-700 tabular-nums mt-0.5 block">
                {outcomes?.offers_accepted ?? 0}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-rose-50/50 border border-rose-200/50">
              <span className="text-[11px] text-rose-700 block">Declined</span>
              <span className="text-lg font-semibold text-rose-700 tabular-nums mt-0.5 block">
                {outcomes?.offers_declined ?? 0}
              </span>
            </div>
          </div>

          {/* Why Candidates Were Rejected */}
          <div>
            <div className="text-xs font-bold text-slate-800 mb-2.5">
              Why candidates were rejected
            </div>
            {rejectionReasons.length > 0 ? (
              <div className="space-y-3">
                {rejectionReasons.map((r) => (
                  <button
                    key={r.reason}
                    type="button"
                    onClick={() => onNavigate?.('/interviews?view=all')}
                    className="w-full text-left space-y-1.5 group"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700 group-hover:text-indigo-600 transition-colors">
                        {simplifyReason(r.reason)}
                      </span>
                      <span className="tabular-nums text-slate-900 font-semibold">
                        {r.count} {r.count === 1 ? 'candidate' : 'candidates'}{' '}
                        <span className="text-slate-400 font-normal">({r.percent}%)</span>
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-1.5 rounded-full bg-rose-400/90 transition-all duration-500"
                        style={{ width: `${Math.max(r.percent, 4)}%` }}
                      />
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-slate-400">
                No rejected candidates in this period.
              </div>
            )}
          </div>
        </WidgetCard>
      </div>
    );
  }
);

