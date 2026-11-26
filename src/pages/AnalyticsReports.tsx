import { useState, useEffect } from "react";
import {
  Download,
  Calendar,
  Briefcase,
  Users,
  UserCheck,
  CheckCircle,
  Clock,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Loader2,
  RefreshCw,
  Check,
  Filter,
} from "lucide-react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  fetchRecruitmentReports,
  downloadRecruitmentReportsCsv,
  type RecruitmentReportsData,
  type FunnelStageItem,
} from "../utils/analyticsApi";
import { fetchJobOpenings, type JobOpening } from "../utils/jobsApi";

const SUB_TABS = [
  { id: "dashboard", label: "Recruitment Dashboard" },
  { id: "hiring", label: "Hiring Performance" },
  { id: "sources", label: "Source Analytics" },
  { id: "recruiters", label: "Recruiter Performance" },
  { id: "interviews", label: "Interview Analytics" },
  { id: "jobs", label: "Job-wise Reports" },
  { id: "custom", label: "Custom Reports" },
] as const;

type TabId = (typeof SUB_TABS)[number]["id"];

const FUNNEL_COLORS = [
  "bg-blue-600",
  "bg-teal-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-orange-500",
  "bg-purple-600",
];

const INTERVIEW_STAGE_NAMES = new Set(["Shortlisted", "Interviewed", "Selected", "Hired"]);

function TrendBadge({
  pct,
  days,
  invertPositive = false,
  suffix,
}: {
  pct: number;
  days?: number;
  invertPositive?: boolean;
  suffix?: string;
}) {
  const isPositive = invertPositive ? pct <= 0 : pct >= 0;
  const colorClass = pct === 0 ? "text-slate-500" : isPositive ? "text-emerald-600" : "text-rose-600";
  const prefix = pct > 0 ? "+" : "";

  return (
    <div className={`flex items-center gap-1 text-[11px] font-semibold mt-2 ${colorClass}`}>
      {pct < 0 ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
      <span>
        {prefix}
        {pct}%
      </span>
      {days !== undefined && (
        <span className="text-slate-400 font-normal">vs. previous {days} days</span>
      )}
      {suffix && <span className="text-slate-400 font-normal">{suffix}</span>}
    </div>
  );
}

export default function AnalyticsReports() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [days, setDays] = useState<number>(90);
  const [selectedJobId, setSelectedJobId] = useState<string>("all");
  const [jobs, setJobs] = useState<JobOpening[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);
  const [data, setData] = useState<RecruitmentReportsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Read current user permissions to gate the export button
  const user = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  })();

  const canExport = (() => {
    if (!user) return false;
    const role = (user.role || "").toLowerCase();
    if (role === "admin" || role === "superadmin" || user.is_superadmin) return true;
    return (user.permissions || []).includes("reports:export");
  })();

  useEffect(() => {
    fetchJobOpenings()
      .then((list) => setJobs(Array.isArray(list) ? list : []))
      .catch(() => setJobs([]));
  }, []);

  const loadReports = async (rangeDays: number, jobId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchRecruitmentReports({
        days: rangeDays,
        jobId: jobId !== "all" ? jobId : undefined,
      });
      setData(res);
    } catch (err: any) {
      setError(err?.message || "Failed to load recruitment reports");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports(days, selectedJobId);
  }, [days, selectedJobId]);

  const handleDownload = async () => {
    setExporting(true);
    try {
      await downloadRecruitmentReportsCsv({
        days,
        jobId: selectedJobId !== "all" ? selectedJobId : undefined,
      });
    } catch (err: any) {
      alert(err?.message || "Failed to download reports CSV");
    } finally {
      setExporting(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[480px] gap-3">
        <Loader2 className="animate-spin text-teal-600" size={32} />
        <p className="text-sm text-slate-500 font-medium">Loading reports & analytics...</p>
      </div>
    );
  }

  const kpis = data?.kpis;
  const totalApps = kpis?.applications.value ?? 0;
  const funnel = data?.funnel ?? [];
  const hasFunnelData = funnel.some((s) => s.count > 0);
  const hiringTrend = data?.hiring_trend ?? [];
  const hasTrendData = hiringTrend.some((m) => m.applications > 0 || m.hired > 0);
  const sources = data?.applications_by_source ?? [];
  const departments = data?.hiring_by_department ?? [];
  const recruiters = data?.recruiter_performance ?? [];
  const insights = data?.key_insights ?? [];
  const activeTabLabel = SUB_TABS.find((t) => t.id === activeTab)?.label ?? "Recruitment Dashboard";

  const kpiCardsGrid = (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
      {/* Card 1: Jobs Opened */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-500">Jobs Opened</span>
          <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
            <Briefcase size={15} />
          </div>
        </div>
        <div className="text-2xl font-bold text-slate-900 tracking-tight">
          {(kpis?.jobs_opened.value ?? 0).toLocaleString()}
        </div>
        <TrendBadge pct={kpis?.jobs_opened.change_pct ?? 0} days={days} />
      </div>

      {/* Card 2: Applications */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-500">Applications</span>
          <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
            <Users size={15} />
          </div>
        </div>
        <div className="text-2xl font-bold text-slate-900 tracking-tight">
          {totalApps.toLocaleString()}
        </div>
        <TrendBadge pct={kpis?.applications.change_pct ?? 0} />
      </div>

      {/* Card 3: Shortlisted */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-500">Shortlisted</span>
          <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
            <UserCheck size={15} />
          </div>
        </div>
        <div className="text-2xl font-bold text-slate-900 tracking-tight">
          {(kpis?.shortlisted.value ?? 0).toLocaleString()}
        </div>
        <TrendBadge pct={kpis?.shortlisted.change_pct ?? 0} />
      </div>

      {/* Card 4: Interviews */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-500">Interviews</span>
          <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
            <Calendar size={15} />
          </div>
        </div>
        <div className="text-2xl font-bold text-slate-900 tracking-tight">
          {(kpis?.interviews.value ?? 0).toLocaleString()}
        </div>
        <TrendBadge pct={kpis?.interviews.change_pct ?? 0} />
      </div>

      {/* Card 5: Hired */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-500">Hired</span>
          <div className="w-7 h-7 rounded-lg bg-teal-50 flex items-center justify-center text-teal-600">
            <CheckCircle size={15} />
          </div>
        </div>
        <div className="text-2xl font-bold text-slate-900 tracking-tight">
          {(kpis?.hired.value ?? 0).toLocaleString()}
        </div>
        <TrendBadge pct={kpis?.hired.change_pct ?? 0} />
      </div>

      {/* Card 6: Time to Hire */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-500">Time to Hire</span>
          <div className="w-7 h-7 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600">
            <Clock size={15} />
          </div>
        </div>
        <div className="text-2xl font-bold text-slate-900 tracking-tight">
          {kpis?.time_to_hire.value_days ?? 0} Days
        </div>
        <TrendBadge
          pct={kpis?.time_to_hire.change_pct ?? 0}
          invertPositive
          suffix={`vs. ${kpis?.time_to_hire.previous_days ?? 0}d`}
        />
      </div>
    </div>
  );

  const renderFunnelCard = (
    title: string,
    stages: FunnelStageItem[],
    emptyMessage: string,
    colSpanClass = ""
  ) => (
    <div className={`${colSpanClass} bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between`}>
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-900">{title}</h2>
          <span className="text-xs font-semibold text-slate-500">Conversion Rate</span>
        </div>

        {stages.length === 0 || !stages.some((s) => s.count > 0) ? (
          <div className="py-12 text-center text-xs text-slate-400">{emptyMessage}</div>
        ) : (
          <div className="space-y-2.5">
            {stages.map((step, idx) => {
              const bg = FUNNEL_COLORS[idx % FUNNEL_COLORS.length];
              return (
                <div key={step.stage} className="flex items-center justify-between gap-3 text-xs">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1 font-semibold text-slate-700">
                      <span>{step.stage}</span>
                      <span className="text-slate-900 font-bold">
                        {step.count.toLocaleString()} ({step.percentage}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${bg} transition-all duration-500`}
                        style={{ width: `${step.percentage > 0 ? Math.max(5, step.percentage) : 0}%` }}
                      />
                    </div>
                  </div>

                  {step.conversion_rate !== undefined && step.conversion_rate !== null ? (
                    <div className="w-24 text-right shrink-0">
                      <span className="text-[10px] text-slate-400 block">{step.conversion_label}</span>
                      <span className="font-bold text-slate-800 text-xs">{step.conversion_rate}%</span>
                    </div>
                  ) : (
                    <div className="w-24 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const renderHiringTrendCard = (colSpanClass = "") => (
    <div className={`${colSpanClass} bg-white rounded-xl border border-slate-200 p-5 shadow-xs`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-slate-900">Hiring Trend</h2>
        <div className="flex items-center gap-3 text-xs font-semibold">
          <span className="flex items-center gap-1.5 text-slate-600">
            <span className="w-2.5 h-2.5 rounded-xs bg-sky-400" />
            Applications
          </span>
          <span className="flex items-center gap-1.5 text-slate-600">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
            Hired
          </span>
        </div>
      </div>

      {!hasTrendData ? (
        <div className="h-64 flex items-center justify-center text-xs text-slate-400 text-center">
          No hiring trend data recorded for this period yet.
        </div>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={hiringTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="month" tickLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
              <YAxis yAxisId="left" tickLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
              <YAxis yAxisId="right" orientation="right" tickLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#ffffff",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  fontSize: "12px",
                }}
              />
              <Bar yAxisId="left" dataKey="applications" fill="#38bdf8" radius={[4, 4, 0, 0]} name="Applications" />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="hired"
                stroke="#10b981"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "#10b981" }}
                name="Hired"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );

  const renderSourcesCard = (colSpanClass = "") => (
    <div className={`${colSpanClass} bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-slate-900">Applications by Source</h2>
      </div>

      {sources.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center text-xs text-slate-400">
          <span>No application source data recorded for this period yet.</span>
        </div>
      ) : (
        <div className="flex items-center gap-4 py-2">
          {/* Donut Chart with center total */}
          <div className="relative w-36 h-36 shrink-0 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sources}
                  cx="50%"
                  cy="50%"
                  innerRadius={42}
                  outerRadius={62}
                  paddingAngle={3}
                  dataKey="count"
                >
                  {sources.map((entry, idx) => (
                    <Cell key={`cell-${idx}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
              <span className="text-sm font-bold text-slate-900 leading-tight">
                {totalApps.toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-500">Applications</span>
            </div>
          </div>

          {/* Source legend with percentages */}
          <div className="flex-1 space-y-2 text-xs">
            {sources.map((src) => (
              <div key={src.source} className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-slate-700 font-medium truncate pr-1">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: src.color }} />
                  <span className="truncate">{src.source}</span>
                </span>
                <span className="font-bold text-slate-900 shrink-0">
                  {src.count} ({src.percentage}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-[11px] text-slate-400 text-center pt-2 border-t border-slate-100">
        Source attribution across applications in selected range
      </div>
    </div>
  );

  const renderDepartmentCard = (colSpanClass = "") => (
    <div className={`${colSpanClass} bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between`}>
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-900">Hiring by Department</h2>
          <div className="flex items-center gap-4 text-xs font-semibold text-slate-500">
            <span>Hired / Openings</span>
            <span>Fill Rate</span>
          </div>
        </div>

        {departments.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">
            No active openings or department hiring data recorded yet.
          </div>
        ) : (
          <div className="space-y-3.5 text-xs">
            {departments.map((dep) => (
              <div key={dep.department} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">{dep.department}</span>
                  <div className="flex items-center gap-5">
                    <span className="text-slate-500 font-medium">
                      {dep.hired} / {dep.openings}
                    </span>
                    <span className="font-bold text-slate-900 w-10 text-right">
                      {dep.fill_rate}%
                    </span>
                  </div>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${Math.min(100, dep.fill_rate)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderRecruiterCard = (colSpanClass = "") => (
    <div className={`${colSpanClass} bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between`}>
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-900">Recruiter Performance</h2>
        </div>

        {recruiters.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">
            No recruiter activity recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500 font-semibold">
                  <th className="pb-2">Recruiter</th>
                  <th className="pb-2 text-center">Applications</th>
                  <th className="pb-2 text-center">Interviews</th>
                  <th className="pb-2 text-center">Hired</th>
                  <th className="pb-2 text-right">Hire Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {recruiters.map((rec) => (
                  <tr key={rec.recruiter_id} className="hover:bg-slate-50/70 transition">
                    <td className="py-2.5 font-bold text-slate-900 flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-bold text-[10px] flex items-center justify-center shrink-0">
                        {rec.recruiter_name.charAt(0)}
                      </div>
                      <span className="truncate">{rec.recruiter_name}</span>
                    </td>
                    <td className="py-2.5 text-center text-slate-600">{rec.applications}</td>
                    <td className="py-2.5 text-center text-slate-600">{rec.interviews}</td>
                    <td className="py-2.5 text-center font-bold text-slate-900">{rec.hired}</td>
                    <td className="py-2.5 text-right font-bold text-emerald-700">{rec.hire_rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  const renderInsightsCard = (colSpanClass = "") => (
    <div className={`${colSpanClass} bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between`}>
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-purple-600" />
            <h2 className="text-sm font-bold text-slate-900">Key Insights</h2>
          </div>
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <Sparkles size={11} /> AI Insights
          </span>
        </div>

        {insights.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">
            No insights yet.
          </div>
        ) : (
          <div className="space-y-3">
            {insights.map((ins) => (
              <div key={ins.id} className="flex items-start gap-2.5 text-xs text-slate-700">
                <div className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                  <Check size={11} strokeWidth={3} />
                </div>
                <p className="leading-snug">{ins.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="max-w-[1440px] mx-auto space-y-5 pb-12 font-sans text-slate-900">
      {/* ── Breadcrumb & Top Header ────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium mb-1">
          <span>Reports & Analytics</span>
          <span>›</span>
          <span className="text-slate-800 font-semibold">{activeTabLabel}</span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Recruitment Reports & Analytics
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Real-time insights into your hiring funnel, performance, sources and recruitment outcomes.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Date Range Selector */}
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-xs">
              <Calendar size={15} className="text-slate-500" />
              <div className="flex flex-col text-left">
                <select
                  aria-label="Report Date Range"
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  className="text-xs font-bold text-slate-800 bg-transparent outline-hidden cursor-pointer"
                >
                  <option value={7}>Last 7 Days</option>
                  <option value={30}>Last 30 Days</option>
                  <option value={90}>Last 90 Days</option>
                  <option value={180}>Last 6 Months</option>
                  <option value={365}>Last 12 Months</option>
                </select>
                <span className="text-[10px] text-slate-400 font-medium">
                  {data?.start_date && data?.end_date
                    ? `${data.start_date} – ${data.end_date}`
                    : "Selected range"}
                </span>
              </div>
            </div>

            {/* Download Report Button (Strictly hidden if user lacks reports:export) */}
            {canExport && (
              <button
                onClick={handleDownload}
                disabled={exporting}
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs transition cursor-pointer"
              >
                {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                <span>Download Report</span>
              </button>
            )}

            <button
              onClick={() => loadReports(days, selectedJobId)}
              title="Refresh reports"
              className="p-2 text-slate-500 hover:text-slate-800 bg-white border border-slate-200 rounded-lg shadow-xs hover:bg-slate-50 transition"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium">
          {error}
        </div>
      )}

      {/* ── Sub-tab Navigation Bar ────────────────────────────────────────── */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 pb-1 text-xs font-medium">
        {SUB_TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-2 rounded-lg whitespace-nowrap transition cursor-pointer ${
                active
                  ? "bg-teal-700 text-white font-bold shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ───────────────────────────────────────────────────── */}
      {activeTab === "dashboard" && (
        <>
          {kpiCardsGrid}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {renderFunnelCard(
              "Recruitment Funnel",
              hasFunnelData ? funnel : [],
              "No funnel data recorded for this period yet.",
              "lg:col-span-4"
            )}
            {renderHiringTrendCard("lg:col-span-4")}
            {renderSourcesCard("lg:col-span-4")}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {renderDepartmentCard("lg:col-span-4")}
            {renderRecruiterCard("lg:col-span-4")}
            {renderInsightsCard("lg:col-span-4")}
          </div>
        </>
      )}

      {activeTab === "hiring" && (
        <>
          {kpiCardsGrid}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {renderFunnelCard(
              "Recruitment Funnel",
              hasFunnelData ? funnel : [],
              "No funnel data recorded for this period yet.",
              "lg:col-span-6"
            )}
            {renderHiringTrendCard("lg:col-span-6")}
          </div>
        </>
      )}

      {activeTab === "sources" && (
        <div className="grid grid-cols-1 gap-5">
          {renderSourcesCard("")}
        </div>
      )}

      {activeTab === "recruiters" && (
        <div className="grid grid-cols-1 gap-5">
          {renderRecruiterCard("")}
        </div>
      )}

      {activeTab === "interviews" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-slate-500">Interviews Conducted</span>
                <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
                  <Calendar size={16} />
                </div>
              </div>
              <div className="text-3xl font-bold text-slate-900 tracking-tight">
                {(kpis?.interviews.value ?? 0).toLocaleString()}
              </div>
              <TrendBadge pct={kpis?.interviews.change_pct ?? 0} days={days} />
            </div>
            <p className="text-[11px] text-slate-400 pt-4 border-t border-slate-100 mt-4">
              Non-cancelled interviews scheduled in the selected period
            </p>
          </div>

          {renderFunnelCard(
            "Funnel Interview Stages",
            hasFunnelData ? funnel.filter((s) => INTERVIEW_STAGE_NAMES.has(s.stage)) : [],
            "No interview stage progression recorded for this period yet.",
            "lg:col-span-8"
          )}
        </div>
      )}

      {activeTab === "jobs" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <Filter size={14} className="text-teal-600" />
              <span>Filter by Job Opening</span>
            </div>
            <div className="flex items-center gap-2">
              <select
                aria-label="Filter by Job"
                value={selectedJobId}
                onChange={(e) => setSelectedJobId(e.target.value)}
                className="text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-1.5 outline-hidden cursor-pointer"
              >
                <option value="all">All Jobs</option>
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title}{job.department ? ` (${job.department})` : ""}
                  </option>
                ))}
              </select>
              {selectedJobId !== "all" && (
                <button
                  onClick={() => setSelectedJobId("all")}
                  className="text-xs font-semibold text-teal-700 hover:text-teal-800 px-2.5 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 transition cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {renderDepartmentCard("")}
        </div>
      )}

      {activeTab === "custom" && (
        <div className="bg-white rounded-xl border border-slate-200 p-10 shadow-xs text-center space-y-2">
          <h2 className="text-sm font-bold text-slate-900">Custom Reports</h2>
          <p className="text-xs text-slate-500">
            Coming soon — custom report builder and saved report templates will appear here.
          </p>
        </div>
      )}
    </div>
  );
}
