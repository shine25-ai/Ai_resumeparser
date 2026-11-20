export function DashboardSkeleton() {
  return (
    <div
      className="max-w-[1380px] mx-auto space-y-5 pb-10 animate-pulse"
      role="status"
      aria-label="Loading dashboard metrics"
    >
      {/* Header Skeleton */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="h-6 w-48 bg-slate-200 rounded-md" />
          <div className="h-3 w-64 bg-slate-100 rounded-md" />
        </div>
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-64 bg-slate-200/80 rounded-xl" />
          <div className="h-9 w-28 bg-slate-200/80 rounded-lg" />
          <div className="h-9 w-9 bg-slate-100 rounded-lg" />
        </div>
      </div>

      {/* Anchored 5 KPI Cards Skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="bg-white px-4 py-4 rounded-2xl border border-slate-200/80 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="h-3 w-20 bg-slate-100 rounded" />
              <div className="h-7 w-7 bg-slate-100 rounded-lg" />
            </div>
            <div className="h-7 w-16 bg-slate-200 rounded" />
            <div className="h-3 w-28 bg-slate-100 rounded" />
          </div>
        ))}
      </div>

      {/* Row 1: Hiring Pipeline | Interviews */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="bg-white p-6 rounded-2xl border border-slate-200/80 space-y-3.5"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-slate-100" />
              <div className="space-y-1.5">
                <div className="h-4 w-36 bg-slate-200 rounded" />
                <div className="h-3 w-48 bg-slate-100 rounded" />
              </div>
            </div>
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="flex justify-between py-1.5">
                <div className="h-3.5 w-44 bg-slate-100 rounded" />
                <div className="h-3.5 w-12 bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Priority 2: Full Width Open Jobs */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 space-y-3.5">
        <div className="h-4 w-32 bg-slate-200 rounded" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex justify-between py-2 border-t border-slate-100">
            <div className="h-3.5 w-56 bg-slate-100 rounded" />
            <div className="h-3.5 w-32 bg-slate-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
