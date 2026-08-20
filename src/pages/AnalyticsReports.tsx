import { useState, useEffect } from "react";
import { ChevronDown, ArrowUpRight, Loader2 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { ANALYTICS_REPORTS_URL } from "../utils/Api";

export default function AnalyticsReports() {
  const [timeRange] = useState("This Month");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const token = localStorage.getItem("access_token");
        const headers: Record<string, string> = {};
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
        const response = await fetch(ANALYTICS_REPORTS_URL, { headers });
        if (!response.ok) {
          throw new Error("Failed to fetch analytics data");
        }
        const result = await response.json();
        setData(result.data || result);
      } catch (err: any) {
        setError(err.message || "An error occurred");
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin text-indigo-600 w-8 h-8" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen text-rose-600">
        <p>Error loading analytics: {error}</p>
      </div>
    );
  }

  const {
    stats = [],
    resumeSourceData = [],
    pipelineTrendData = [],
    topSkills = [],
    expDistribution = [],
    successRate = 0
  } = data;

  return (
    <div className="bg-white text-slate-800 min-h-screen p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6 font-sans">
      {/* Top Header Bar */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900">Analytics & Reports</h1>
        </div>

        <button className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-1.5 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors shadow-sm cursor-pointer">
          {timeRange}
          <ChevronDown size={14} />
        </button>
      </div>

      {/* Top 5 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {stats.map((stat, i) => (
          <div key={i} className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm space-y-2">
            <span className="text-xs font-semibold text-slate-500 block">{stat.label}</span>
            <div className="text-2xl font-extrabold text-slate-900">{stat.value}</div>
            <div className="flex items-center gap-1 text-xs font-bold text-emerald-600">
              <ArrowUpRight size={14} />
              <span>{stat.change}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Row 2 Grid: Resume Source (Left) & Pipeline Trend Chart (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Resume Source (1 Col) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-xs font-bold text-slate-900">Resume Source</h3>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Donut Chart with Center Text */}
            <div className="relative w-40 h-40 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={resumeSourceData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={68}
                    paddingAngle={3}
                    dataKey="count"
                  >
                    {resumeSourceData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute flex flex-col items-center justify-center text-center">
                <span className="text-sm font-bold text-slate-900">{stats.find((s:any) => s.label === "Total Resumes")?.value || "0"}</span>
                <span className="text-[10px] text-slate-500 font-medium">Total</span>
              </div>
            </div>

            {/* Legend List */}
            <div className="space-y-2 w-full sm:w-auto">
              {resumeSourceData.map((item, i) => (
                <div key={i} className="flex items-center justify-between gap-4 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></span>
                    <span className="font-semibold text-slate-700">{item.name}</span>
                  </div>
                  <span className="text-slate-500 font-medium">{item.percentage}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Pipeline Trend Line Chart (2 Cols) */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-slate-900">Pipeline Trend</h3>
            <div className="flex items-center gap-4 text-[11px] font-semibold">
              <span className="flex items-center gap-1 text-blue-600"><span className="w-2.5 h-0.5 bg-blue-500 inline-block"></span> Resumes</span>
              <span className="flex items-center gap-1 text-emerald-600"><span className="w-2.5 h-0.5 bg-emerald-500 inline-block"></span> Shortlisted</span>
              <span className="flex items-center gap-1 text-amber-600"><span className="w-2.5 h-0.5 bg-amber-500 inline-block"></span> Interviewed</span>
              <span className="flex items-center gap-1 text-purple-600"><span className="w-2.5 h-0.5 bg-purple-500 inline-block"></span> Offers</span>
            </div>
          </div>

          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={pipelineTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px', color: '#0f172a' }} />
                <Line type="monotone" dataKey="Resumes" stroke="#2563eb" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Shortlisted" stroke="#10b981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Interviewed" stroke="#f59e0b" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Offers" stroke="#a855f7" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Row 3 Grid: Top Skills (1 Col), Experience Wise Distribution (1 Col) & Success Rate (1 Col) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Top Skills in Demand */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-xs font-bold text-slate-900">Top Skills in Demand</h3>
          <div className="space-y-3">
            {topSkills.map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-700">{item.name}</span>
                  <span className="text-slate-500 font-medium">{item.count}</span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full bg-indigo-600 rounded-full ${item.width}`}></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Experience Wise Distribution */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-xs font-bold text-slate-900">Experience Wise Distribution</h3>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Donut Chart */}
            <div className="w-32 h-32 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={36}
                    outerRadius={56}
                    paddingAngle={3}
                    dataKey="count"
                  >
                    {expDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Legend List */}
            <div className="space-y-2 w-full sm:w-auto">
              {expDistribution.map((item, i) => (
                <div key={i} className="flex items-center justify-between gap-4 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></span>
                    <span className="font-semibold text-slate-700">{item.name}</span>
                  </div>
                  <span className="text-slate-500 font-medium">{item.percentage}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Interview Success Rate */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between items-center text-center space-y-4">
          <h3 className="text-xs font-bold text-slate-900">Interview Success Rate</h3>

          {/* Circle Gauge Chart */}
          <div className="relative w-28 h-28 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-slate-100"
                strokeWidth="3"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="text-indigo-600 stroke-current"
                strokeWidth="3"
                strokeDasharray="70, 100"
                strokeLinecap="round"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center">
              <span className="text-lg font-black text-slate-900">{successRate}%</span>
            </div>
          </div>

          <span className="text-xs font-bold text-slate-700">Success Rate</span>
        </div>
      </div>
    </div>
  );
}
