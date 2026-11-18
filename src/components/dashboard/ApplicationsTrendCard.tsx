import React, { useState, useMemo } from 'react';
import { LineChart } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { WidgetCard } from './WidgetCard';
import type { ApplicationsTrendData } from '../../types/dashboard';

interface ApplicationsTrendCardProps {
  data?: ApplicationsTrendData;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

type Granularity = 'daily' | 'weekly' | 'monthly';

export const ApplicationsTrendCard = React.memo(function ApplicationsTrendCard({
  data,
  loading,
  error,
  onRetry,
}: ApplicationsTrendCardProps) {
  const [granularity, setGranularity] = useState<Granularity>('daily');

  const series = useMemo(() => {
    if (!data) return [];
    return data[granularity] || [];
  }, [data, granularity]);

  const totals = useMemo(
    () =>
      series.reduce(
        (acc, p) => ({
          resumes: acc.resumes + (p.resumes || 0),
          applications: acc.applications + (p.applications || 0),
        }),
        { resumes: 0, applications: 0 }
      ),
    [series]
  );

  return (
    <WidgetCard
      title="New Candidates Over Time"
      subtitle="Uploaded resumes compared with direct job applications"
      icon={<LineChart size={15} />}
      iconBg="bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100/80"
      loading={loading}
      error={error}
      onRetry={onRetry}
      headerRight={
        <select
          aria-label="Trend time grouping"
          value={granularity}
          onChange={(e) => setGranularity(e.target.value as Granularity)}
          className="h-8 pl-2.5 pr-7 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/90 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 cursor-pointer transition-colors"
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      }
      footer={
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-600" />
              <span>
                Resumes: <strong className="font-semibold text-slate-800 tabular-nums">{totals.resumes}</strong>
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-sky-500" />
              <span>
                Applications: <strong className="font-semibold text-slate-800 tabular-nums">{totals.applications}</strong>
              </span>
            </span>
          </div>
          <span className="text-slate-400 capitalize">{granularity} view</span>
        </div>
      }
    >
      {series.length > 0 ? (
        <div className="h-52 w-full pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 6, right: 8, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id="resumesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="appsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.16} />
                  <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '8px',
                  fontSize: '12px',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 4px 12px rgba(15,23,42,0.06)',
                }}
              />
              <Area
                type="monotone"
                dataKey="resumes"
                name="Resumes Uploaded"
                stroke="#4f46e5"
                strokeWidth={2}
                fill="url(#resumesGrad)"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="applications"
                name="Job Applications"
                stroke="#0ea5e9"
                strokeWidth={2}
                fill="url(#appsGrad)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="py-12 text-center text-xs text-slate-400">
          No upload or application trend data for this period.
        </div>
      )}
    </WidgetCard>
  );
});

