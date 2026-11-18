import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  getDashboardStats,
  getDashboardPipeline,
  getDashboardActivities,
  getDashboardUpcomingInterviews,
  getDashboardDistributions,
  getDashboardInsights,
  type DashboardFilterQuery,
} from '../utils/Api';
import type {
  IntakeWindow,
  DashboardStatItem,
  DashboardPipelineItem,
  DashboardStatusItem,
  DashboardActivityItem,
  DashboardUpcomingInterviewItem,
  DashboardFilters,
  DashboardInsights,
} from '../types/dashboard';

const DEFAULT_STUCK_DAYS = 7;

export const DEFAULT_FILTERS: DashboardFilters = {
  dateRange: 'all',
  startDate: '',
  endDate: '',
};

function resolveIntakeWindow(dateRange: DashboardFilters['dateRange']): IntakeWindow {
  if (dateRange === 'today') return 'today';
  if (dateRange === '7d') return '7d';
  return '24h';
}

export function useDashboardMetrics() {
  const tzOffset = useMemo(() => new Date().getTimezoneOffset(), []);

  const [filters, setFiltersState] = useState<DashboardFilters>(DEFAULT_FILTERS);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [filtering, setFiltering] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [insights, setInsights] = useState<DashboardInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState<boolean>(true);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  const [stats, setStats] = useState<DashboardStatItem[]>([]);
  const [pipelineData, setPipelineData] = useState<DashboardPipelineItem[]>([]);
  const [uniqueCandidatesInterviewed, setUniqueCandidatesInterviewed] = useState<number>(0);
  const [totalInterviewRounds, setTotalInterviewRounds] = useState<number>(0);
  const [activeInterviewingCount, setActiveInterviewingCount] = useState<number>(0);

  const [recentActivities, setRecentActivities] = useState<DashboardActivityItem[]>([]);
  const [upcomingInterviews, setUpcomingInterviews] = useState<DashboardUpcomingInterviewItem[]>([]);
  const [seniorityData, setSeniorityData] = useState<DashboardStatusItem[]>([]);
  const [domainData, setDomainData] = useState<DashboardStatusItem[]>([]);

  const hasMountedRef = useRef(false);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const toFilterQuery = useCallback(
    (f: DashboardFilters): DashboardFilterQuery => ({
      dateRange: f.dateRange,
      startDate: f.dateRange === 'custom' ? f.startDate : undefined,
      endDate: f.dateRange === 'custom' ? f.endDate : undefined,
      tzOffset,
    }),
    [tzOffset]
  );

  const fetchInsightsOnly = useCallback(
    async (activeFilters: DashboardFilters) => {
      setInsightsError(null);
      try {
        const fq = toFilterQuery(activeFilters);
        const res = await getDashboardInsights({ ...fq, stuckDays: DEFAULT_STUCK_DAYS });
        setInsights(res || null);
      } catch (err: unknown) {
        console.error('Failed to load insights', err);
        setInsightsError(err instanceof Error ? err.message : 'Unable to load executive insights.');
      } finally {
        setInsightsLoading(false);
      }
    },
    [toFilterQuery]
  );

  const fetchWidgets = useCallback(
    async (activeFilters: DashboardFilters, mode: 'initial' | 'refresh' | 'filter') => {
      if (mode === 'refresh') setRefreshing(true);
      if (mode === 'filter') setFiltering(true);
      setError(null);
      setInsightsError(null);

      const fq = toFilterQuery(activeFilters);
      const effectiveWindow = resolveIntakeWindow(activeFilters.dateRange);

      try {
        let failedCount = 0;
        const [
          statsRes,
          pipelineRes,
          activitiesRes,
          upcomingRes,
          distributionsRes,
          insightsRes,
        ] = await Promise.all([
          getDashboardStats({ ...fq, window: effectiveWindow, stuckDays: DEFAULT_STUCK_DAYS }).catch((err) => {
            console.error('Failed to load stats', err);
            failedCount += 1;
            return { stats: [] };
          }),
          getDashboardPipeline({ ...fq, stuckDays: DEFAULT_STUCK_DAYS }).catch((err) => {
            console.error('Failed to load pipeline', err);
            failedCount += 1;
            return { pipelineData: [] };
          }),
          getDashboardActivities(fq).catch((err) => {
            console.error('Failed to load activities', err);
            failedCount += 1;
            return { recentActivities: [] };
          }),
          getDashboardUpcomingInterviews(fq).catch((err) => {
            console.error('Failed to load upcoming interviews', err);
            failedCount += 1;
            return { upcomingInterviews: [] };
          }),
          getDashboardDistributions(fq).catch((err) => {
            console.error('Failed to load distributions', err);
            failedCount += 1;
            return { seniorityDistribution: [], domainDistribution: [] };
          }),
          getDashboardInsights({ ...fq, stuckDays: DEFAULT_STUCK_DAYS }).catch((err) => {
            console.error('Failed to load dashboard insights', err);
            setInsightsError(err?.message || 'Failed to load insights widgets.');
            return null;
          }),
        ]);

        if (failedCount === 5) {
          setError('Unable to reach the recruitment API. Please check your connection and retry.');
        }

        setStats(statsRes?.stats || []);
        setPipelineData(pipelineRes?.pipelineData || []);
        setUniqueCandidatesInterviewed(Number(pipelineRes?.uniqueCandidatesInterviewed ?? 0));
        setTotalInterviewRounds(Number(pipelineRes?.totalInterviewRounds ?? 0));
        setActiveInterviewingCount(Number(pipelineRes?.activeInterviewingCount ?? 0));
        setRecentActivities(activitiesRes?.recentActivities || []);
        setUpcomingInterviews(upcomingRes?.upcomingInterviews || []);
        setSeniorityData(distributionsRes?.seniorityDistribution || []);
        setDomainData(distributionsRes?.domainDistribution || []);
        if (insightsRes) setInsights(insightsRes);
      } catch (err: unknown) {
        console.error('Failed to load dashboard metrics', err);
        setError(err instanceof Error ? err.message : 'Failed to load dashboard metrics.');
      } finally {
        if (mode === 'initial') {
          setLoading(false);
          setInsightsLoading(false);
        }
        if (mode === 'refresh') setRefreshing(false);
        if (mode === 'filter') setFiltering(false);
      }
    },
    [toFilterQuery]
  );

  // Initial load
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      fetchWidgets(DEFAULT_FILTERS, 'initial');
    }
  }, [fetchWidgets]);

  // Date filter update
  const updateFilters = useCallback(
    (patch: Partial<DashboardFilters>) => {
      const next: DashboardFilters = { ...filtersRef.current, ...patch };
      if (patch.dateRange && patch.dateRange !== 'custom') {
        next.startDate = '';
        next.endDate = '';
      }
      setFiltersState(next);
      if (next.dateRange === 'custom' && !next.startDate && !next.endDate) {
        return;
      }
      fetchWidgets(next, 'filter');
    },
    [fetchWidgets]
  );

  const resetFilters = useCallback(() => {
    setFiltersState(DEFAULT_FILTERS);
    fetchWidgets(DEFAULT_FILTERS, 'filter');
  }, [fetchWidgets]);

  const localTimeZoneName = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local TZ';
    } catch {
      return 'Local TZ';
    }
  }, []);

  const refresh = useCallback(() => {
    fetchWidgets(filtersRef.current, 'refresh');
  }, [fetchWidgets]);

  const retryInsights = useCallback(() => {
    setInsightsLoading(true);
    fetchInsightsOnly(filtersRef.current);
  }, [fetchInsightsOnly]);

  return {
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
  };
}
