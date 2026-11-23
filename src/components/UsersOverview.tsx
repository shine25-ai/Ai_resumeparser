import { useEffect, useState } from "react";
import { CircleCheck, Clock3, Users, XCircle } from "lucide-react";
import { fetchUserStats, type UserStats } from "../utils/adminApi";
import { StatCard } from "./companies/companyForm";

/** Company Users: summary cards and role distribution (SRS Screen 19, top row). */

const BAR = ["bg-violet-500", "bg-sky-500", "bg-emerald-500", "bg-amber-400", "bg-blue-400", "bg-rose-400", "bg-slate-400"];

export default function UsersOverview() {
  const [stats, setStats] = useState<UserStats | null>(null);
  useEffect(() => {
    fetchUserStats().then(setStats).catch(() => setStats(null));
  }, []);
  if (!stats) return null;
  const total = Math.max(1, stats.by_role.reduce((n, r) => n + r.count, 0));
  return (
    <div className="mb-6 grid gap-3 lg:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.6fr)]">
      <StatCard tone="blue" icon={<Users size={20} />} value={stats.total} label="Total Users" />
      <StatCard tone="green" icon={<CircleCheck size={20} />} value={stats.active} label="Active Users" />
      <StatCard tone="amber" icon={<Clock3 size={20} />} value={stats.pending_invites} label="Pending Invites" />
      <StatCard tone="red" icon={<XCircle size={20} />} value={stats.inactive} label="Inactive Users" />
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-bold text-slate-900">Role Distribution</p>
        <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
          {stats.by_role.map((r, i) => <span key={r.role} className={BAR[i % BAR.length]} style={{ width: `${(r.count / total) * 100}%` }} title={`${r.label}: ${r.count}`} />)}
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">
          {stats.by_role.map((r, i) => <li key={r.role} className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${BAR[i % BAR.length]}`} />{r.label} ({r.count})</li>)}
        </ul>
      </div>
    </div>
  );
}
