import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Kanban,
  Scale,
  FileSignature,
  GitMerge,
  MessageSquareText,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import {
  fetchKanbanBoard,
  fetchDuplicates,
  fetchScorecards,
  fetchOffers,
  fetchOnboardingList,
  fetchAutomationTemplates,
  type KanbanCandidate,
  type TeamMember,
  type DuplicateGroup,
  type ScorecardItem,
  type OfferItem,
  type OnboardingRecord,
  type AutomationTemplate,
} from '../utils/atsApi';
import { KanbanBoardTab } from '../components/ats/KanbanBoardTab';
import { ScorecardsCompareTab } from '../components/ats/ScorecardsCompareTab';
import { OffersOnboardingTab } from '../components/ats/OffersOnboardingTab';
import {
  DuplicatesTab,
  TemplatesAutomationTab,
} from '../components/ats/DuplicatesAndTemplatesTabs';

type HubTab = 'kanban' | 'scorecards' | 'offers' | 'duplicates' | 'templates';

const TABS: { id: HubTab; label: string; icon: any }[] = [
  { id: 'kanban', label: 'Kanban & Bulk', icon: Kanban },
  { id: 'scorecards', label: 'Scorecards & Compare', icon: Scale },
  { id: 'offers', label: 'Offers & Onboarding', icon: FileSignature },
  { id: 'duplicates', label: 'Duplicates', icon: GitMerge },
  { id: 'templates', label: 'Templates & Automation', icon: MessageSquareText },
];

export default function PipelineHub() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as HubTab) || 'kanban';
  const [activeTab, setActiveTab] = useState<HubTab>(
    TABS.some((t) => t.id === initialTab) ? initialTab : 'kanban'
  );

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stages, setStages] = useState<string[]>([
    'Screening',
    'Interviewing',
    'Offer',
    'Hired',
    'Closed',
  ]);
  const [candidates, setCandidates] = useState<KanbanCandidate[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [scorecards, setScorecards] = useState<ScorecardItem[]>([]);
  const [offers, setOffers] = useState<OfferItem[]>([]);
  const [onboarding, setOnboarding] = useState<OnboardingRecord[]>([]);
  const [templates, setTemplates] = useState<AutomationTemplate[]>([]);

  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [boardRes, dupRes, scRes, offerRes, onbRes, tmplRes] = await Promise.all([
        fetchKanbanBoard().catch(() => ({
          stages: ['Screening', 'Interviewing', 'Offer', 'Hired', 'Closed'],
          candidates: [],
          team: [],
        })),
        fetchDuplicates().catch(() => []),
        fetchScorecards().catch(() => []),
        fetchOffers().catch(() => []),
        fetchOnboardingList().catch(() => []),
        fetchAutomationTemplates().catch(() => []),
      ]);
      setStages(boardRes.stages);
      setCandidates(boardRes.candidates);
      setTeam(boardRes.team);
      setDuplicates(dupRes);
      setScorecards(scRes);
      setOffers(offerRes);
      setOnboarding(onbRes);
      setTemplates(tmplRes);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAll(false);
  }, [loadAll]);

  const switchTab = (tab: HubTab) => {
    setActiveTab(tab);
    setSearchParams({ tab }, { replace: true });
  };

  const handleNavigate = useCallback((path: string) => navigate(path), [navigate]);

  return (
    <div className="max-w-[1440px] mx-auto space-y-4 pb-8 font-sans text-slate-900">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-slate-200/80">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 tracking-tight">
            Pipeline &amp; Operations
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Drag-and-drop stages, bulk actions, scorecards, offers, onboarding, duplicates &amp; automation
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadAll(true)}
          disabled={refreshing}
          className="h-9 px-3 rounded-lg bg-white border border-slate-200/90 hover:bg-slate-50 text-xs font-medium text-slate-600 inline-flex items-center gap-1.5"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin text-indigo-600' : ''} />
          <span>Refresh</span>
        </button>
      </header>

      {/* Clean Tab Strip */}
      <div
        role="tablist"
        aria-label="Pipeline workspace sections"
        className="flex flex-wrap items-center gap-1 bg-slate-200/60 p-1 rounded-xl w-fit"
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          const badge =
            t.id === 'duplicates' && duplicates.length > 0
              ? duplicates.length
              : t.id === 'offers' && offers.length > 0
                ? offers.length
                : null;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => switchTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-all ${
                active
                  ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.08)]'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon size={13} />
              <span>{t.label}</span>
              {badge !== null && (
                <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded-full bg-indigo-50 text-indigo-700 tabular-nums">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center text-xs text-slate-500">
          <Loader2 size={24} className="animate-spin text-indigo-600 mb-2" />
          Loading ATS operations workspace...
        </div>
      ) : (
        <>
          {activeTab === 'kanban' && (
            <KanbanBoardTab
              stages={stages}
              candidates={candidates}
              team={team}
              onReload={() => loadAll(true)}
              onNavigate={handleNavigate}
            />
          )}
          {activeTab === 'scorecards' && (
            <ScorecardsCompareTab
              candidates={candidates}
              scorecards={scorecards}
              onReload={() => loadAll(true)}
            />
          )}
          {activeTab === 'offers' && (
            <OffersOnboardingTab
              candidates={candidates}
              offers={offers}
              onboardingList={onboarding}
              onReload={() => loadAll(true)}
            />
          )}
          {activeTab === 'duplicates' && (
            <DuplicatesTab groups={duplicates} onReload={() => loadAll(true)} />
          )}
          {activeTab === 'templates' && (
            <TemplatesAutomationTab templates={templates} onReload={() => loadAll(true)} />
          )}
        </>
      )}
    </div>
  );
}

