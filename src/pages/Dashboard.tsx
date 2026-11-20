import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { useDashboardMetrics } from '../hooks/useDashboardMetrics';
import { DashboardSkeleton } from '../components/dashboard/DashboardSkeleton';
import { GlobalFilterBar } from '../components/dashboard/GlobalFilterBar';
import { KpiCardsGrid } from '../components/dashboard/KpiCardsGrid';
import { NeedsAttentionCard } from '../components/dashboard/NeedsAttentionCard';
import { TodaysInterviewsCard } from '../components/dashboard/TodaysInterviewsCard';
import { PipelineVelocityCard } from '../components/dashboard/PipelineVelocityCard';
import { ApplicationsTrendCard } from '../components/dashboard/ApplicationsTrendCard';
import { SourceOfHireCard } from '../components/dashboard/SourceOfHireCard';
import { OpenJobsHealthCard } from '../components/dashboard/OpenJobsHealthCard';
import { AiRecommendationsCard } from '../components/dashboard/AiRecommendationsCard';
import { DistributionsRow } from '../components/dashboard/DistributionsRow';
import { SkillsGapCard } from '../components/dashboard/SkillsGapCard';
import { ParsingQualityCard } from '../components/dashboard/ParsingQualityCard';
import { CandidateDemographicsCard } from '../components/dashboard/CandidateDemographicsCard';
import { InterviewerAndOutcomesRow } from '../components/dashboard/InterviewerAndOutcomesRow';
import { RecentActivityCard } from '../components/dashboard/RecentActivityCard';

type DashboardTab = 'overview' | 'candidates' | 'team';

const VIEW_TABS: { id: DashboardTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'candidates', label: 'Talent Insights' },
  { id: 'team', label: 'Hiring Performance' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');

  const {
    loading,
    refreshing,
    filtering,
    error,
    insights,
    insightsLoading,
    insightsError,
    retryInsights,
    filters,
    updateFilters,
    resetFilters,
    localTimeZoneName,
    stats,
    pipelineData,
    uniqueCandidatesInterviewed,
    totalInterviewRounds,
    activeInterviewingCount,
    recentActivities,
    upcomingInterviews,
    seniorityData,
    domainData,
    refresh,
  } = useDashboardMetrics();

  const handleNavigate = useCallback((path: string) => navigate(path), [navigate]);

  const totalResumes =
    stats.find((s) => s.key === 'total_talent' || s.label === 'Total Resumes')?.value || '0';

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="max-w-[1380px] mx-auto space-y-5 pb-10 font-sans text-slate-900">
      {/* 1. Unified Page Header: Title (Left) + View Switcher & Date Controls (Right) */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-bold text-slate-900 tracking-[-0.02em] leading-tight">
            Recruitment Dashboard
          </h1>
          <p className="text-xs font-medium text-slate-600 mt-0.5">
            Hiring pipeline, active openings, and recruiter workload
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Clean Segmented View Switcher */}
          <nav
            role="tablist"
            aria-label="Dashboard sections"
            className="inline-flex items-center gap-0.5 bg-slate-200/70 p-1 rounded-xl border border-slate-200/80"
          >
            {VIEW_TABS.map((t) => {
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </nav>

          <GlobalFilterBar
            filters={filters}
            onChange={updateFilters}
            onReset={resetFilters}
            filtering={filtering}
          />

          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            title="Refresh data"
            aria-label="Refresh data"
            className="h-9 w-9 flex items-center justify-center bg-white text-slate-500 hover:text-indigo-600 hover:border-indigo-200 rounded-lg border border-slate-200/90 transition-colors shrink-0 disabled:opacity-60 cursor-pointer"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-indigo-600' : ''} />
          </button>
        </div>
      </div>

      {/* 2. Anchored Top KPI Summary (Always Visible Across All Views) */}
      <KpiCardsGrid
        stats={stats}
        uniqueCandidatesInterviewed={uniqueCandidatesInterviewed}
        totalInterviewRounds={totalInterviewRounds}
        activeInterviewingCount={activeInterviewingCount}
        dateRange={filters.dateRange}
        localTimeZoneName={localTimeZoneName}
        onNavigate={handleNavigate}
      />

      {/* Global Error Banner */}
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-rose-50/80 border border-rose-200/80 text-rose-800 text-xs"
        >
          <div className="flex items-center gap-2">
            <AlertCircle size={15} className="text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="px-2.5 py-1 rounded-md bg-white border border-rose-200 text-rose-700 font-medium hover:bg-rose-100/60 transition-colors shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* 4. Priority-Ordered, Equal-Height Tab Views */}
      <div
        className={`space-y-5 transition-opacity duration-200 ${
          filtering ? 'opacity-65' : 'opacity-100'
        }`}
      >
        {activeTab === 'overview' && (
          <>
            {/* Row 1 (50% / 50%, matched height): Hiring Pipeline | Interviews */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
              <PipelineVelocityCard
                pipelineData={pipelineData}
                totalResumes={totalResumes}
                onNavigate={handleNavigate}
              />

              <TodaysInterviewsCard
                interviews={insights?.todaysInterviews || []}
                upcomingInterviews={upcomingInterviews}
                loading={insightsLoading}
                error={insightsError}
                onRetry={retryInsights}
                onRefreshDashboard={refresh}
                onNavigate={handleNavigate}
              />
            </div>

            {/* Row 2 (Full Width): Open Jobs */}
            <OpenJobsHealthCard
              jobs={insights?.openJobsHealth || []}
              loading={insightsLoading}
              error={insightsError}
              onRetry={retryInsights}
              onNavigate={handleNavigate}
            />

            {/* Row 3 (50% / 50%, matched height): Needs Attention | Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
              <NeedsAttentionCard
                items={insights?.needsAttention || []}
                loading={insightsLoading}
                error={insightsError}
                onRetry={retryInsights}
                onNavigate={handleNavigate}
              />

              <RecentActivityCard
                recentActivities={recentActivities}
                onNavigate={handleNavigate}
              />
            </div>
          </>
        )}

        {activeTab === 'candidates' && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
              <ApplicationsTrendCard
                data={insights?.applicationsTrend}
                loading={insightsLoading}
                error={insightsError}
                onRetry={retryInsights}
              />
              <SourceOfHireCard
                items={insights?.sourceOfHire || []}
                loading={insightsLoading}
                error={insightsError}
                onRetry={retryInsights}
                onNavigate={handleNavigate}
              />
            </div>

            <DistributionsRow
              seniorityData={seniorityData}
              domainData={domainData}
              onNavigate={handleNavigate}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
              <CandidateDemographicsCard
                candidateExtras={insights?.candidateExtras}
                loading={insightsLoading}
                error={insightsError}
                onRetry={retryInsights}
                onNavigate={handleNavigate}
              />
              <SkillsGapCard
                items={insights?.skillsGap || []}
                loading={insightsLoading}
                error={insightsError}
                onRetry={retryInsights}
                onNavigate={handleNavigate}
              />
            </div>
          </>
        )}

        {activeTab === 'team' && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
              <ParsingQualityCard
                data={insights?.parsingQuality}
                loading={insightsLoading}
                error={insightsError}
                onRetry={retryInsights}
                onNavigate={handleNavigate}
              />
              <AiRecommendationsCard
                data={insights?.aiRecommendations}
                loading={insightsLoading}
                error={insightsError}
                onRetry={retryInsights}
                onNavigate={handleNavigate}
              />
            </div>

            <InterviewerAndOutcomesRow
              workload={insights?.interviewerWorkload}
              outcomes={insights?.rejectionAndOffers}
              loading={insightsLoading}
              error={insightsError}
              onRetry={retryInsights}
              onNavigate={handleNavigate}
            />
          </>
        )}
      </div>
    </div>
  );
}
