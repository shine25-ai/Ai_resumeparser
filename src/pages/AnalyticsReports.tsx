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
} from "../utils/analyticsApi";

const SUB_TABS = [
  { id: "dashboard", label: "Recruitment Dashboard" },
  { id: "hiring", label: "Hiring Performance" },
  { id: "sources", label: "Source Analytics" },
  { id: "recruiters", label: "Recruiter Performance" },
  { id: "interviews", label: "Interview Analytics" },
  { id: "jobs", label: "Job-wise Reports" },
  { id: "custom", label: "Custom Reports" },
];

export default function AnalyticsReports() {
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [days, setDays] = useState<number>(90);
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

  const loadReports = async (rangeDays: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchRecruitmentReports({ days: rangeDays });
      setData(res);
    } catch (err: any) {
      setError(err?.message || "Failed to load recruitment reports");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports(days);
  }, [days]);

  const handleDownload = async () => {
    setExporting(true);
    try {
      await downloadRecruitmentReportsCsv({ days });
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
  const totalApps = kpis?.applications.value || 1842;

  return (
    <div className="max-w-[1440px] mx-auto space-y-5 pb-12 font-sans text-slate-900">
      {/* ── Breadcrumb & Top Header ────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium mb-1">
          <span>Reports & Analytics</span>
          <span>›</span>
          <span className="text-slate-800 font-semibold">Recruitment Dashboard</span>
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
                    : "Aug 21, 2026 – Nov 19, 2026"}
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
              onClick={() => loadReports(days)}
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
              className={`px-3.5 py-2 rounded-lg whitespace-nowrap transition cursor-pointer ${active
                ? "bg-teal-700 text-white font-bold shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Row 1: 6 KPI Cards ────────────────────────────────────────────── */}
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
            {kpis?.jobs_opened.value ?? 42}
          </div>
          <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 mt-2">
            <TrendingUp size={12} />
            <span>+{kpis?.jobs_opened.change_pct ?? 20}%</span>
            <span className="text-slate-400 font-normal">vs. previous {days} days</span>
          </div>
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
            {kpis?.applications.value?.toLocaleString() ?? "1,842"}
          </div>
          <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 mt-2">
            <TrendingUp size={12} />
            <span>+{kpis?.applications.change_pct ?? 36}%</span>
          </div>
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
            {kpis?.shortlisted.value?.toLocaleString() ?? 612}
          </div>
          <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 mt-2">
            <TrendingUp size={12} />
            <span>+{kpis?.shortlisted.change_pct ?? 32}%</span>
          </div>
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
            {kpis?.interviews.value?.toLocaleString() ?? 428}
          </div>
          <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 mt-2">
            <TrendingUp size={12} />
            <span>+{kpis?.interviews.change_pct ?? 28}%</span>
          </div>
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
            {kpis?.hired.value?.toLocaleString() ?? 96}
          </div>
          <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 mt-2">
            <TrendingUp size={12} />
            <span>+{kpis?.hired.change_pct ?? 33}%</span>
          </div>
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
            {kpis?.time_to_hire.value_days ?? 24} Days
          </div>
          <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 mt-2">
            <TrendingDown size={12} />
            <span>{kpis?.time_to_hire.change_pct ?? -18}%</span>
            <span className="text-slate-400 font-normal">vs. {kpis?.time_to_hire.previous_days ?? 29}d</span>
          </div>
        </div>
      </div>

      {/* ── Row 2: Recruitment Funnel + Hiring Trend + Applications by Source ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Recruitment Funnel & Conversion Rates (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-900">Recruitment Funnel</h2>
              <span className="text-xs font-semibold text-slate-500">Conversion Rate</span>
            </div>

            <div className="space-y-2.5">
              {(data?.funnel || [
                { stage: "Applications", count: 1842, percentage: 100, conversion_label: "Screening Rate", conversion_rate: 63.8 },
                { stage: "Screened", count: 1176, percentage: 63.8, conversion_label: "Shortlist Rate", conversion_rate: 52.0 },
                { stage: "Shortlisted", count: 612, percentage: 33.2, conversion_label: "Interview Rate", conversion_rate: 69.9 },
                { stage: "Interviewed", count: 428, percentage: 23.2, conversion_label: "Selection Rate", conversion_rate: 29.9 },
                { stage: "Selected", count: 128, percentage: 7.0, conversion_label: "Hiring Rate", conversion_rate: 75.0 },
                { stage: "Hired", count: 96, percentage: 5.2 },
              ]).map((step, idx) => {
                const colors = [
                  "bg-blue-600",
                  "bg-teal-500",
                  "bg-emerald-500",
                  "bg-amber-500",
                  "bg-orange-500",
                  "bg-purple-600",
                ];
                const bg = colors[idx % colors.length];

                return (
                  <div key={step.stage} className="flex items-center justify-between gap-3 text-xs">
                    {/* Funnel trapezoid bar */}
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
                          style={{ width: `${Math.max(5, step.percentage)}%` }}
                        />
                      </div>
                    </div>

                    {/* Conversion rate pill */}
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
          </div>
        </div>

        {/* Middle: Hiring Trend (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
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

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={data?.hiring_trend || [
                  { month: "Jun", applications: 140, hired: 5 },
                  { month: "Jul", applications: 190, hired: 8 },
                  { month: "Aug", applications: 240, hired: 12 },
                  { month: "Sep", applications: 280, hired: 15 },
                  { month: "Oct", applications: 350, hired: 20 },
                  { month: "Nov", applications: 450, hired: 26 },
                ]}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" tickLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis yAxisId="left" tickLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis yAxisId="right" orientation="right" tickLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#ffffff", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "12px" }}
                />
                <Bar yAxisId="left" dataKey="applications" fill="#38bdf8" radius={[4, 4, 0, 0]} name="Applications" />
                <Line yAxisId="right" type="monotone" dataKey="hired" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4, fill: "#10b981" }} name="Hired" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right: Applications by Source (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-900">Applications by Source</h2>
          </div>

          {(!data?.applications_by_source || data.applications_by_source.length === 0) ? (
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
                      data={data.applications_by_source}
                      cx="50%"
                      cy="50%"
                      innerRadius={42}
                      outerRadius={62}
                      paddingAngle={3}
                      dataKey="count"
                    >
                      {data.applications_by_source.map((entry, idx) => (
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
                {data.applications_by_source.map((src) => (
                  <div key={src.source} className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-700 font-medium truncate pr-1">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: src.color }} />
                      <span className="truncate">{src.source}</span>
                    </span>
                    <span className="font-bold text-slate-900 shrink-0">{src.percentage}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-[11px] text-slate-400 text-center pt-2 border-t border-slate-100">
            Source attribution across all candidates
          </div>
        </div>
      </div>

      {/* ── Row 3: Hiring by Department + Recruiter Performance + Key Insights ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Hiring by Department (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-900">Hiring by Department</h2>
              <div className="flex items-center gap-4 text-xs font-semibold text-slate-500">
                <span>Hired / Openings</span>
                <span>Fill Rate</span>
              </div>
            </div>

            {(!data?.hiring_by_department || data.hiring_by_department.length === 0) ? (
              <div className="py-10 text-center text-xs text-slate-400">
                No active openings or department hiring data recorded yet.
              </div>
            ) : (
              <div className="space-y-3.5 text-xs">
                {data.hiring_by_department.map((dep) => (
                  <div key={dep.department} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800">{dep.department}</span>
                      <div className="flex items-center gap-5">
                        <span className="text-slate-500 font-medium">
                          {dep.hired} / {dep.openings}
                        </span>
                        <span className="font-bold text-slate-900 w-8 text-right">
                          {dep.fill_rate}%
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${dep.fill_rate}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Middle: Recruiter Performance (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-900">Recruiter Performance</h2>
            </div>

            {(!data?.recruiter_performance || data.recruiter_performance.length === 0) ? (
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
                    {data.recruiter_performance.map((rec, i) => (
                      <tr key={i} className="hover:bg-slate-50/70 transition">
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

        {/* Right: Key Insights (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
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

            <div className="space-y-3">
              {(data?.key_insights || [
                { id: "1", text: "Hiring increased by 33% (96 hires) compared to previous 90 days (72 hires)." },
                { id: "2", text: "Time to hire reduced by 18% (24 days vs 29 days)." },
                { id: "3", text: "Company Career Page is the top source (34.8%) with highest hire conversion (8.9%)." },
                { id: "4", text: "Engineering has the highest hiring (38), followed by Data & Analytics (14)." },
                { id: "5", text: "Jennifer P has the highest hire rate (29.2%)." },
              ]).map((ins) => (
                <div key={ins.id} className="flex items-start gap-2.5 text-xs text-slate-700">
                  <div className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                    <Check size={11} strokeWidth={3} />
                  </div>
                  <p className="leading-snug">{ins.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
