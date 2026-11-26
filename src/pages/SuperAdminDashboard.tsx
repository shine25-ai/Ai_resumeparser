import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  Building,
  Briefcase,
  Users,
  Calendar,
  CheckCircle,
  Plus,
  UserPlus,
  Settings,
  BarChart3,
  CreditCard,
  ChevronRight,
  TrendingUp,
  Clock,
  Loader2,
  RefreshCw,
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
  fetchPlatformDashboard,
  type PlatformDashboardData,
} from "../utils/analyticsApi";

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const [days, setDays] = useState<number>(30);
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<PlatformDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTrendTab, setActiveTrendTab] = useState<"all" | "applications" | "interviews" | "hires">("all");

  const loadData = async (rangeDays: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPlatformDashboard(rangeDays);
      setData(res);
    } catch (err: any) {
      setError(err?.message || "Failed to load platform dashboard");
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
        <Loader2 className="animate-spin text-emerald-600" size={32} />
        <p className="text-sm text-slate-500 font-medium">Loading platform dashboard...</p>
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
            Super Admin Dashboard
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Platform overview and recruitment activity across all companies
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-xs">
            <Calendar size={15} className="text-slate-500" />
            <select
              aria-label="Platform Date Range"
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
        {/* Card 1: Total Companies */}
        <div className="bg-white rounded-xl border border-cyan-100 p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500">Total Companies</span>
            <div className="w-8 h-8 rounded-lg bg-cyan-50 flex items-center justify-center text-cyan-600">
              <Building2 size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight">
            {kpis?.total_companies.value?.toLocaleString() ?? 48}
          </div>
          <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 mt-2">
            <TrendingUp size={12} />
            <span>+{kpis?.total_companies.change_pct ?? 14.3}% vs. previous {days} days</span>
          </div>
        </div>

        {/* Card 2: Active Companies */}
        <div className="bg-white rounded-xl border border-emerald-100 p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500">Active Companies</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
              <Building size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight">
            {kpis?.active_companies.value?.toLocaleString() ?? 42}
          </div>
          <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 mt-2">
            <TrendingUp size={12} />
            <span>+{kpis?.active_companies.change_pct ?? 10.5}%</span>
          </div>
        </div>

        {/* Card 3: Active Jobs */}
        <div className="bg-white rounded-xl border border-blue-100 p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500">Active Jobs</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
              <Briefcase size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight">
            {kpis?.active_jobs.value?.toLocaleString() ?? "1,256"}
          </div>
          <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 mt-2">
            <TrendingUp size={12} />
            <span>+{kpis?.active_jobs.change_pct ?? 18.7}%</span>
          </div>
        </div>

        {/* Card 4: Total Candidates */}
        <div className="bg-white rounded-xl border border-purple-100 p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500">Total Candidates</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
              <Users size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight">
            {kpis?.total_candidates.value?.toLocaleString() ?? "26,340"}
          </div>
          <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 mt-2">
            <TrendingUp size={12} />
            <span>+{kpis?.total_candidates.change_pct ?? 22.5}%</span>
          </div>
        </div>

        {/* Card 5: Interviews */}
        <div className="bg-white rounded-xl border border-orange-100 p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500">Interviews</span>
            <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center text-orange-600">
              <Calendar size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight">
            {kpis?.interviews.value?.toLocaleString() ?? "4,892"}
          </div>
          <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 mt-2">
            <TrendingUp size={12} />
            <span>+{kpis?.interviews.change_pct ?? 16.1}%</span>
          </div>
        </div>

        {/* Card 6: Hires (Selected) */}
        <div className="bg-white rounded-xl border border-green-100 p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500">Hires (Selected)</span>
            <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center text-green-600">
              <CheckCircle size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight">
            {kpis?.hires.value?.toLocaleString() ?? "786"}
          </div>
          <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 mt-2">
            <TrendingUp size={12} />
            <span>+{kpis?.hires.change_pct ?? 19.8}%</span>
          </div>
        </div>
      </div>

      {/* ── Row 2: Recruitment Activity Trend + Recruitment Funnel + Quick Actions ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Recruitment Activity Trend (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 size={18} className="text-teal-600" />
              <h2 className="text-sm font-bold text-slate-900">Recruitment Activity Trend</h2>
            </div>

            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-semibold">
              <button
                onClick={() => setActiveTrendTab("all")}
                className={`px-2.5 py-1 rounded-md transition ${
                  activeTrendTab === "all" ? "bg-white text-teal-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setActiveTrendTab("applications")}
                className={`px-2.5 py-1 rounded-md transition ${
                  activeTrendTab === "applications" ? "bg-emerald-500 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Applications
              </button>
              <button
                onClick={() => setActiveTrendTab("interviews")}
                className={`px-2.5 py-1 rounded-md transition ${
                  activeTrendTab === "interviews" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Interviews
              </button>
              <button
                onClick={() => setActiveTrendTab("hires")}
                className={`px-2.5 py-1 rounded-md transition ${
                  activeTrendTab === "hires" ? "bg-purple-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Hires
              </button>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.activity_trend || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" tickLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis tickLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#ffffff", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "12px" }}
                />
                {(activeTrendTab === "all" || activeTrendTab === "applications") && (
                  <Line type="monotone" dataKey="applications" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} name="Applications" />
                )}
                {(activeTrendTab === "all" || activeTrendTab === "interviews") && (
                  <Line type="monotone" dataKey="interviews" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3 }} name="Interviews" />
                )}
                {(activeTrendTab === "all" || activeTrendTab === "hires") && (
                  <Line type="monotone" dataKey="hires" stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 3 }} name="Hires" />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Middle: Recruitment Funnel (3 cols) */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-5 h-5 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center text-xs font-bold">
              ▼
            </div>
            <h2 className="text-sm font-bold text-slate-900">Recruitment Funnel <span className="text-xs font-normal text-slate-500">(Last 30 Days)</span></h2>
          </div>

          <div className="space-y-2 py-1">
            {(data?.funnel || [
              { stage: "Applications", count: 26340, percentage: 100 },
              { stage: "Screened", count: 16820, percentage: 63.8 },
              { stage: "Shortlisted", count: 5920, percentage: 22.5 },
              { stage: "Interviewed", count: 4892, percentage: 18.6 },
              { stage: "Selected", count: 786, percentage: 3.0 },
            ]).map((step, idx) => {
              const colors = [
                "bg-blue-600",
                "bg-teal-500",
                "bg-emerald-500",
                "bg-amber-500",
                "bg-orange-500",
              ];
              const bg = colors[idx % colors.length];
              return (
                <div key={step.stage} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <span>{step.stage}</span>
                    <span className="text-slate-900 font-bold">
                      {step.count.toLocaleString()} {step.percentage < 100 ? `(${step.percentage}%)` : ""}
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${bg} transition-all duration-500`}
                      style={{ width: `${Math.max(5, step.percentage)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-[11px] text-slate-500 text-center pt-2 border-t border-slate-100">
            Funnel stage distribution across all tenants
          </div>
        </div>

        {/* Right: Quick Actions (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 mb-3 text-amber-500 font-bold text-xs uppercase tracking-wider">
              <span>⚡</span> Quick Actions
            </div>

            <div className="space-y-2">
              <button
                onClick={() => navigate("/companies")}
                className="w-full flex items-center justify-between p-2.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-800 hover:bg-slate-50 hover:border-slate-300 transition text-left cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Plus size={14} className="text-emerald-600" />
                  <span>Create Company</span>
                </div>
                <ChevronRight size={14} className="text-slate-400" />
              </button>

              <button
                onClick={() => navigate("/users")}
                className="w-full flex items-center justify-between p-2.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-800 hover:bg-slate-50 hover:border-slate-300 transition text-left cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <UserPlus size={14} className="text-blue-600" />
                  <span>Create Company Admin</span>
                </div>
                <ChevronRight size={14} className="text-slate-400" />
              </button>

              <button
                onClick={() => navigate("/settings/platform")}
                className="w-full flex items-center justify-between p-2.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-800 hover:bg-slate-50 hover:border-slate-300 transition text-left cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Settings size={14} className="text-slate-600" />
                  <span>Platform Settings</span>
                </div>
                <ChevronRight size={14} className="text-slate-400" />
              </button>

              <button
                onClick={() => navigate("/analytics")}
                className="w-full flex items-center justify-between p-2.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-800 hover:bg-slate-50 hover:border-slate-300 transition text-left cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <BarChart3 size={14} className="text-purple-600" />
                  <span>View Reports</span>
                </div>
                <ChevronRight size={14} className="text-slate-400" />
              </button>

              <button
                onClick={() => navigate("/plans")}
                className="w-full flex items-center justify-between p-2.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-800 hover:bg-slate-50 hover:border-slate-300 transition text-left cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <CreditCard size={14} className="text-teal-600" />
                  <span>Manage Plans & Billing</span>
                </div>
                <ChevronRight size={14} className="text-slate-400" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 3: Recent Companies + Company Activity + Recent Activity ────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Recent Companies (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Building2 size={16} className="text-teal-600" />
              <h2 className="text-sm font-bold text-slate-900">Recent Companies</h2>
            </div>
            <button
              onClick={() => navigate("/companies")}
              className="text-xs font-semibold text-teal-600 hover:text-teal-800 flex items-center gap-1 cursor-pointer"
            >
              View All Companies →
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500 font-semibold">
                  <th className="pb-2.5 pr-2">#</th>
                  <th className="pb-2.5 px-2">Company</th>
                  <th className="pb-2.5 px-2">Industry</th>
                  <th className="pb-2.5 px-2">Jobs</th>
                  <th className="pb-2.5 px-2">Candidates</th>
                  <th className="pb-2.5 px-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {(data?.recent_companies || []).map((c, i) => (
                  <tr key={c.id || i} className="hover:bg-slate-50/70 transition">
                    <td className="py-2.5 pr-2 text-slate-400">{i + 1}</td>
                    <td className="py-2.5 px-2 font-bold text-slate-900">{c.name}</td>
                    <td className="py-2.5 px-2 text-slate-500">{c.industry}</td>
                    <td className="py-2.5 px-2 font-semibold text-slate-700">{c.jobs}</td>
                    <td className="py-2.5 px-2 font-semibold text-slate-700">{c.candidates.toLocaleString()}</td>
                    <td className="py-2.5 px-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        ● {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Middle: Company Activity (3 cols) */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={16} className="text-teal-600" />
            <h2 className="text-sm font-bold text-slate-900">Company Activity</h2>
          </div>

          <div className="space-y-3.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-600">
                <Users size={14} className="text-orange-500" />
                New Companies Registered
              </span>
              <span className="font-bold text-slate-900">{data?.company_activity.new_companies_registered ?? 6}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-600">
                <Briefcase size={14} className="text-blue-500" />
                Jobs Published
              </span>
              <span className="font-bold text-slate-900">{data?.company_activity.jobs_published ?? 128}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-600">
                <Users size={14} className="text-teal-500" />
                New Candidates
              </span>
              <span className="font-bold text-slate-900">{data?.company_activity.new_candidates?.toLocaleString() ?? "3,420"}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-600">
                <Calendar size={14} className="text-amber-500" />
                Interviews Scheduled
              </span>
              <span className="font-bold text-slate-900">{data?.company_activity.interviews_scheduled ?? 892}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-600">
                <CheckCircle size={14} className="text-emerald-500" />
                Candidates Selected
              </span>
              <span className="font-bold text-slate-900">{data?.company_activity.candidates_selected ?? 186}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-600">
                <Clock size={14} className="text-rose-500" />
                Jobs Closing in 7 Days
              </span>
              <span className="font-bold text-slate-900">{data?.company_activity.jobs_closing_7d ?? 24}</span>
            </div>
          </div>
        </div>

        {/* Right: Recent Activity (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-teal-600" />
              <h2 className="text-sm font-bold text-slate-900">Recent Activity</h2>
            </div>
            <button
              onClick={() => navigate("/audit")}
              className="text-xs font-semibold text-teal-600 hover:text-teal-800 cursor-pointer"
            >
              View All
            </button>
          </div>

          <div className="space-y-3.5">
            {(data?.recent_activity || [
              { id: "1", description: 'New company "GreenTech Solutions" registered', time_ago: "15 minutes ago" },
              { id: "2", description: 'Job "Data Engineer" published by VetraSoft Solutions', time_ago: "42 minutes ago" },
              { id: "3", description: "120 new applications received across companies", time_ago: "1 hour ago" },
              { id: "4", description: 'Company "NexaCloud Systems" updated career page', time_ago: "2 hours ago" },
              { id: "5", description: 'Plan upgraded to "Pro" by BrightMinds Analytics', time_ago: "3 hours ago" },
            ]).map((act, idx) => {
              const dots = ["bg-purple-500", "bg-emerald-500", "bg-blue-500", "bg-teal-500", "bg-amber-500"];
              const dotBg = dots[idx % dots.length];
              return (
                <div key={act.id || idx} className="flex items-start gap-2.5 text-xs">
                  <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${dotBg}`} />
                  <div className="flex-1">
                    <p className="font-medium text-slate-800 leading-snug">{act.description}</p>
                    <span className="text-[11px] text-slate-400">{act.time_ago}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
