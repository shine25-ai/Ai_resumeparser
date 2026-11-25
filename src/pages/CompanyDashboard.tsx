import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Briefcase,
  Users,
  Inbox,
  Calendar,
  CheckCircle,
  Clock,
  Plus,
  Star,
  Loader2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  fetchCompanyDashboard,
  type CompanyDashboardData,
} from "../utils/analyticsApi";

export default function CompanyDashboard() {
  const navigate = useNavigate();
  const [days, setDays] = useState<number>(30);
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<CompanyDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Get active company name from localStorage
  const userCompany = (() => {
    try {
      const u = JSON.parse(localStorage.getItem("user") || "null");
      return u?.company_name || "ShineLogics";
    } catch {
      return "ShineLogics";
    }
  })();

  const loadData = async (rangeDays: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCompanyDashboard(rangeDays);
      setData(res);
    } catch (err: any) {
      setError(err?.message || "Failed to load company dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(days);
  }, [days]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[480px] gap-3">
        <Loader2 className="animate-spin text-teal-600" size={32} />
        <p className="text-sm text-slate-500 font-medium">Loading company dashboard...</p>
      </div>
    );
  }

  const kpis = data?.kpis;

  return (
    <div className="max-w-[1440px] mx-auto space-y-6 pb-12 font-sans text-slate-900">
      {/* ── Top Header ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Company Dashboard – {userCompany}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Recruitment overview, hiring progress and key metrics
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-xs">
            <Calendar size={15} className="text-slate-500" />
            <select
              aria-label="Company Date Range"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="text-xs font-semibold text-slate-700 bg-transparent outline-hidden cursor-pointer"
            >
              <option value={7}>Last 7 Days</option>
              <option value={30}>Last 30 Days</option>
              <option value={90}>Last 90 Days</option>
              <option value={365}>Last 12 Months</option>
            </select>
          </div>

          <button
            onClick={() => navigate("/jobs")}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
          >
            <Plus size={15} />
            <span>Create Job Opening</span>
          </button>

          <button
            onClick={() => loadData(days)}
            title="Refresh metrics"
            className="p-2 text-slate-500 hover:text-slate-800 bg-white border border-slate-200 rounded-lg shadow-xs hover:bg-slate-50 transition"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium">
          {error}
        </div>
      )}

      {/* ── Row 1: 6 KPI Cards ────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Card 1: Active Jobs */}
        <div className="bg-white rounded-xl border border-blue-100 p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500">Active Jobs</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
              <Briefcase size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight">
            {kpis?.active_jobs.value?.toLocaleString() ?? 86}
          </div>
          <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 mt-2">
            <TrendingUp size={12} />
            <span>+{kpis?.active_jobs.change_pct ?? 12.5}%</span>
          </div>
        </div>

        {/* Card 2: Total Candidates */}
        <div className="bg-white rounded-xl border border-purple-100 p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500">Total Candidates</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
              <Users size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight">
            {kpis?.total_candidates.value?.toLocaleString() ?? "2,340"}
          </div>
          <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 mt-2">
            <TrendingUp size={12} />
            <span>+{kpis?.total_candidates.change_pct ?? 18.7}%</span>
          </div>
        </div>

        {/* Card 3: New Applications */}
        <div className="bg-white rounded-xl border border-orange-100 p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500">New Applications</span>
            <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center text-orange-600">
              <Inbox size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight">
            {kpis?.new_applications.value?.toLocaleString() ?? 320}
          </div>
          <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 mt-2">
            <TrendingUp size={12} />
            <span>+{kpis?.new_applications.change_pct ?? 24.0}%</span>
          </div>
        </div>

        {/* Card 4: Interviews */}
        <div className="bg-white rounded-xl border border-blue-100 p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500">Interviews</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
              <Calendar size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight">
            {kpis?.interviews.value?.toLocaleString() ?? 186}
          </div>
          <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 mt-2">
            <TrendingUp size={12} />
            <span>+{kpis?.interviews.change_pct ?? 16.3}%</span>
          </div>
        </div>

        {/* Card 5: Hires (Selected) */}
        <div className="bg-white rounded-xl border border-green-100 p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500">Hires (Selected)</span>
            <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center text-green-600">
              <CheckCircle size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight">
            {kpis?.hires.value?.toLocaleString() ?? 48}
          </div>
          <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 mt-2">
            <TrendingUp size={12} />
            <span>+{kpis?.hires.change_pct ?? 20.0}%</span>
          </div>
        </div>

        {/* Card 6: Avg. Time to Hire */}
        <div className="bg-white rounded-xl border border-purple-100 p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500">Avg. Time to Hire</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
              <Clock size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight">
            {kpis?.avg_time_to_hire.value_days ?? 24} Days
          </div>
          <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 mt-2">
            <TrendingDown size={12} />
            <span>{kpis?.avg_time_to_hire.change_pct ?? -18.2}%</span>
          </div>
        </div>
      </div>

      {/* ── Row 2: Hiring Funnel + Recruitment Trend ───────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Hiring Funnel (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-5 h-5 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center text-xs font-bold">
              ▼
            </div>
            <h2 className="text-sm font-bold text-slate-900">
              Hiring Funnel <span className="text-xs font-normal text-slate-500">(Last {days} Days)</span>
            </h2>
          </div>

          <div className="space-y-3 py-2">
            {(data?.funnel || [
              { stage: "Applications", count: 2340, percentage: 100 },
              { stage: "Screened", count: 1620, percentage: 69.2 },
              { stage: "Shortlisted", count: 520, percentage: 22.2 },
              { stage: "Interviewed", count: 320, percentage: 13.7 },
              { stage: "Selected", count: 48, percentage: 2.1 },
            ]).map((step, idx) => {
              const bgColors = [
                "bg-blue-600",
                "bg-teal-500",
                "bg-emerald-500",
                "bg-amber-500",
                "bg-orange-500",
              ];
              const bg = bgColors[idx % bgColors.length];
              return (
                <div key={step.stage} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <span>{step.stage}</span>
                    <span className="text-slate-900 font-bold">
                      {step.count.toLocaleString()} ({step.percentage}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-3.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${bg} transition-all duration-500`}
                      style={{ width: `${Math.max(6, step.percentage)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-[11px] text-slate-400 text-center pt-2 border-t border-slate-100">
            Conversion stages for all open job requirements
          </div>
        </div>

        {/* Right: Recruitment Trend (8 cols) */}
        <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-900">Recruitment Trend</h2>
            <div className="flex items-center gap-4 text-xs font-semibold">
              <span className="flex items-center gap-1.5 text-slate-600">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                Applications
              </span>
              <span className="flex items-center gap-1.5 text-slate-600">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                Interviews
              </span>
              <span className="flex items-center gap-1.5 text-slate-600">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-600" />
                Hires
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.recruitment_trend || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" tickLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis tickLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#ffffff", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "12px" }}
                />
                <Line type="monotone" dataKey="applications" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} name="Applications" />
                <Line type="monotone" dataKey="interviews" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3 }} name="Interviews" />
                <Line type="monotone" dataKey="hires" stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 3 }} name="Hires" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── Row 3: Recent Job Openings + Upcoming Interviews + Recent Candidates ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Col 1: Recent Job Openings */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Briefcase size={16} className="text-teal-600" />
                <h2 className="text-sm font-bold text-slate-900">Recent Job Openings</h2>
              </div>
              <button
                onClick={() => navigate("/jobs")}
                className="text-xs font-semibold text-teal-600 hover:text-teal-800 cursor-pointer"
              >
                View All Jobs →
              </button>
            </div>

            {data?.recent_jobs?.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No active job openings yet.
              </div>
            ) : (
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-500 font-semibold">
                    <th className="pb-2.5">Job Title</th>
                    <th className="pb-2.5 text-center">Applicants</th>
                    <th className="pb-2.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {(data?.recent_jobs || [
                    { id: "1", title: "Senior Java Developer", applicants: 245, status: "Active" },
                    { id: "2", title: "Data Engineer (Databricks)", applicants: 128, status: "Active" },
                    { id: "3", title: "UI/UX Designer", applicants: 76, status: "Active" },
                    { id: "4", title: "QA Automation Engineer", applicants: 64, status: "Active" },
                    { id: "5", title: "DevOps Engineer", applicants: 52, status: "Active" },
                  ]).map((j) => (
                    <tr key={j.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-2.5 font-bold text-slate-900 pr-2">{j.title}</td>
                      <td className="py-2.5 text-center font-semibold text-slate-700">{j.applicants}</td>
                      <td className="py-2.5 text-right">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          ● {j.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Col 2: Upcoming Interviews */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-teal-600" />
                <h2 className="text-sm font-bold text-slate-900">Upcoming Interviews</h2>
              </div>
              <button
                onClick={() => navigate("/interviews")}
                className="text-xs font-semibold text-teal-600 hover:text-teal-800 cursor-pointer"
              >
                View Calendar →
              </button>
            </div>

            {data?.upcoming_interviews?.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No upcoming interviews scheduled.
              </div>
            ) : (
              <div className="space-y-3">
                {(data?.upcoming_interviews || [
                  { id: "1", date_badge: "Apr 20", job_title: "Senior Java Developer", time_window: "10:00 AM – 11:00 AM", panel_label: "Panel (3)" },
                  { id: "2", date_badge: "Apr 20", job_title: "Data Engineer", time_window: "11:30 AM – 12:30 PM", panel_label: "Panel (2)" },
                  { id: "3", date_badge: "Apr 21", job_title: "UI/UX Designer", time_window: "02:00 PM – 03:00 PM", panel_label: "Panel (2)" },
                  { id: "4", date_badge: "Apr 21", job_title: "QA Automation Engineer", time_window: "04:00 PM – 05:00 PM", panel_label: "Panel (3)" },
                ]).map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 hover:border-slate-200 transition bg-slate-50/50">
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-50 border border-blue-200 text-blue-700 font-bold text-[11px] rounded-lg px-2 py-1 text-center leading-tight">
                        {inv.date_badge}
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-slate-900">{inv.job_title}</h3>
                        <p className="text-[11px] text-slate-500">{inv.time_window}</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-md shadow-2xs">
                      {inv.panel_label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Col 3: Recent Candidates */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-teal-600" />
                <h2 className="text-sm font-bold text-slate-900">Recent Candidates</h2>
              </div>
              <button
                onClick={() => navigate("/pipeline")}
                className="text-xs font-semibold text-teal-600 hover:text-teal-800 cursor-pointer"
              >
                View All Candidates →
              </button>
            </div>

            {data?.recent_candidates?.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No candidate applications recorded yet.
              </div>
            ) : (
              <div className="space-y-3">
                {(data?.recent_candidates || [
                  { id: "1", name: "Rakesh Kumar", role_experience: "Java Developer • 6.2 Yrs", rating: 4.3, stage: "Shortlisted" },
                  { id: "2", name: "Priya S", role_experience: "React Developer • 4.8 Yrs", rating: 4.1, stage: "Interview" },
                  { id: "3", name: "Aravind K", role_experience: "Databricks Engineer • 8.5 Yrs", rating: 4.6, stage: "Screening" },
                  { id: "4", name: "Kirthika R", role_experience: "Python Developer • 3.9 Yrs", rating: 4.0, stage: "Shortlisted" },
                ]).map((c) => {
                  const stageColors: Record<string, string> = {
                    Shortlisted: "bg-emerald-50 text-emerald-700 border-emerald-200",
                    Interview: "bg-blue-50 text-blue-700 border-blue-200",
                    Screening: "bg-purple-50 text-purple-700 border-purple-200",
                    Selected: "bg-teal-50 text-teal-700 border-teal-200",
                    Applied: "bg-slate-50 text-slate-700 border-slate-200",
                  };
                  const pillClass = stageColors[c.stage] || "bg-slate-50 text-slate-700 border-slate-200";

                  return (
                    <div key={c.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center">
                          {c.name.charAt(0)}
                        </div>
                        <div>
                          <h3 className="text-xs font-bold text-slate-900">{c.name}</h3>
                          <p className="text-[11px] text-slate-500">{c.role_experience}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <div className="flex items-center gap-1 text-[11px] font-bold text-amber-600">
                          <Star size={12} className="fill-amber-400 text-amber-400" />
                          <span>{c.rating}</span>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${pillClass}`}>
                          {c.stage}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
