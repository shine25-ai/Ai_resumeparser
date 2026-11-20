import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Clock, Calendar, Sparkles, AlertCircle, Loader2 } from 'lucide-react';
import { fetchPublicTrackingStatus, type PublicTrackStatus } from '../utils/atsApi';

const STEPS = ['Screening', 'Interviewing', 'Offer', 'Hired'];

export default function CandidateTracker() {
  const { token } = useParams();
  const [data, setData] = useState<PublicTrackStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetchPublicTrackingStatus(token)
      .then((res) => setData(res))
      .catch((err: any) => setError(err?.message || 'Status link is invalid or expired.'))
      .finally(() => setLoading(false));
  }, [token]);

  const currentIdx = data
    ? data.current_stage === 'Closed'
      ? -1
      : Math.max(0, STEPS.indexOf(data.current_stage))
    : 0;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans text-slate-900">
      <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
            <Sparkles size={18} />
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-900">Application Status Tracker</h1>
            <p className="text-xs text-slate-500">Live self-service candidate update</p>
          </div>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center text-xs text-slate-500">
            <Loader2 size={24} className="animate-spin text-indigo-600 mb-2" />
            Checking your live application status...
          </div>
        ) : error || !data ? (
          <div className="py-8 text-center space-y-2">
            <AlertCircle size={24} className="mx-auto text-rose-500" />
            <p className="text-sm font-medium text-slate-800">{error || 'Application not found'}</p>
            <p className="text-xs text-slate-500">
              Please contact your recruiter for an updated tracking link.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <p className="text-xs text-slate-500">Hello {data.candidate_first_name},</p>
              <h2 className="text-lg font-semibold text-slate-900 mt-0.5">{data.role}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{data.company}</p>
            </div>

            {data.current_stage === 'Closed' ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                This application is currently marked as <strong>Closed</strong>. Thank you for your
                time and interest—we will keep your profile on file for future roles.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs font-semibold text-slate-700">Hiring Progress</div>
                <div className="space-y-2.5">
                  {STEPS.map((step, idx) => {
                    const done = idx < currentIdx;
                    const active = idx === currentIdx;
                    return (
                      <div
                        key={step}
                        className={`p-3 rounded-xl border flex items-center justify-between ${
                          active
                            ? 'bg-indigo-50/70 border-indigo-200'
                            : done
                              ? 'bg-emerald-50/50 border-emerald-200/70'
                              : 'bg-slate-50/50 border-slate-200/60'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          {done ? (
                            <CheckCircle2 size={16} className="text-emerald-600" />
                          ) : active ? (
                            <Clock size={16} className="text-indigo-600" />
                          ) : (
                            <span className="w-4 h-4 rounded-full border-2 border-slate-300" />
                          )}
                          <span
                            className={`text-xs font-semibold ${
                              active
                                ? 'text-indigo-800'
                                : done
                                  ? 'text-emerald-800'
                                  : 'text-slate-400'
                            }`}
                          >
                            {step}
                          </span>
                        </div>
                        <span className="text-[11px] font-medium text-slate-500">
                          {done ? 'Completed' : active ? 'Current Stage' : 'Upcoming'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {data.next_interview && (
              <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-200/80 flex items-center gap-3">
                <Calendar size={18} className="text-indigo-600 shrink-0" />
                <div>
                  <span className="text-xs font-semibold text-indigo-950 block">
                    Next Scheduled Interview
                  </span>
                  <span className="text-xs text-indigo-700 tabular-nums">
                    {data.next_interview.date} at {data.next_interview.time}
                  </span>
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
              <span>Last updated: {data.last_updated?.slice(0, 10) || 'Recently'}</span>
              <span>Powered by AI Recruitment ATS</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

