import { useEffect, useState } from "react";
import { BASE_URL } from "./utils/Api";
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { TopHeader } from "./components/TopHeader";
import Breadcrumb from "./components/shell/Breadcrumb";
import { ProtectedRoute } from "./components/ProtectedRoute";
import SessionExpiredModal from "./components/SessionExpiredModal";
import { FeedbackProvider } from "./components/ui/Feedback";
import Dashboard from "./pages/Dashboard";
import Upload from "./pages/Upload";
import CandidateDatabase from "./pages/CandidateDatabase";
import JDMatch from "./pages/JDMatch";
import InterviewManagement from "./pages/InterviewManagement";
import InterviewCalendar from "./pages/InterviewCalendar";
import InterviewPanels from "./pages/InterviewPanels";
import InterviewEvaluations from "./pages/InterviewEvaluations";
import AnalyticsReports from "./pages/AnalyticsReports";
import Login from "./pages/Login";
import AcceptInvite from "./pages/AcceptInvite";
import Settings from "./pages/Settings";
import Companies from "./pages/Companies";
import CreateCompany from "./pages/CreateCompany";
import Plans from "./pages/Plans";
import ResumeTemplates from "./pages/ResumeTemplates";
import CareersPage from "./careers/CareersPage";
import JobOpenings from "./pages/JobOpenings";
import JobEditor from "./pages/JobEditor";
import Applications from "./pages/Applications";
import AuditLog from "./pages/AuditLog";
import CandidateTracker from "./pages/CandidateTracker";
import CareerPageBuilder from "./pages/CareerPageBuilder";
import CareerPagePreviewFrame from "./pages/CareerPagePreviewFrame";
import CareerPageIntegrate, { PublicIntegrationGuide } from "./pages/CareerPageIntegrate";
import Candidate360 from "./pages/Candidate360";
import SkillIntelligencePage from "./pages/SkillIntelligence";

// Role links are now /jobs?job=<id> (the careers page can be embedded in any site)
function RedirectToJob() {
  const { jobId } = useParams();
  return <Navigate to={`/jobs?job=${encodeURIComponent(jobId ?? "")}`} replace />;
}

// A company's careers page: /careers/<page address>, same as /jobs?company=<page address>
function CompanyCareersPage() {
  const { company } = useParams();
  return <CareersPage manageTitle company={company} key={company} />;
}

// Candidate profiles moved from /evaluation/:id to /candidates/:id
function RedirectToCandidate() {
  const { id } = useParams();
  return <Navigate to={`/candidates/${id}`} replace />;
}

/**
 * A company's own careers address (careers.acme.com) or platform subdomain (acme.<careers domain>) shows only
 * that company's careers page. Hosts listed in VITE_APP_HOSTS (and localhost) are the portal itself.
 */
function useCareersHost(): { checking: boolean; slug: string | null } {
  const host = window.location.hostname.toLowerCase();
  const appHosts = String(import.meta.env.VITE_APP_HOSTS || "").split(",").map((h: string) => h.trim().toLowerCase()).filter(Boolean);
  const skip = ["localhost", "127.0.0.1", "[::1]"].includes(host) || /^\d+\.\d+\.\d+\.\d+$/.test(host) || appHosts.includes(host);
  const cacheKey = `careers_host:${host}`;
  const cached = (() => {
    try {
      return sessionStorage.getItem(cacheKey);
    } catch {
      return null;
    }
  })();
  const [state, setState] = useState<{ checking: boolean; slug: string | null }>({
    checking: !skip && cached === null,
    slug: cached && cached !== "-" ? cached : null,
  });
  useEffect(() => {
    if (skip || cached !== null) return;
    fetch(`${BASE_URL}/public/career-page/resolve-host?host=${encodeURIComponent(host)}`)
      .then((r) => r.json())
      .then((body) => {
        const slug = body?.data?.slug || null;
        try {
          sessionStorage.setItem(cacheKey, slug || "-");
        } catch {
          // only a cache
        }
        setState({ checking: false, slug });
      })
      .catch(() => setState({ checking: false, slug: null }));
  }, [skip, cached, cacheKey, host]);
  return state;
}

export default function App() {
  const careersHost = useCareersHost();
  if (careersHost.checking) return null;
  if (careersHost.slug) {
    return (
      <FeedbackProvider>
        <CareersPage manageTitle company={careersHost.slug} />
      </FeedbackProvider>
    );
  }
  return (
    <FeedbackProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/:company/login" element={<Login />} />
          <Route path="/accept-invite" element={<AcceptInvite />} />
          {/* Public careers page: no login needed */}
          <Route path="/jobs" element={<CareersPage manageTitle />} />
          <Route path="/jobs/:jobId" element={<RedirectToJob />} />
          <Route path="/careers" element={<CareersPage manageTitle />} />
          <Route path="/careers/:company" element={<CompanyCareersPage />} />
          <Route path="/careers/:company/preview" element={<CareerPagePreviewFrame />} />
          <Route path="/careers/:company/integrate" element={<PublicIntegrationGuide />} />
          {/* Public candidate self-service status tracker */}
          <Route path="/track/:token" element={<CandidateTracker />} />
          <Route element={<ProtectedRoute />}>
            <Route
              path="/*"
              element={
                <div className="flex h-screen overflow-hidden bg-[var(--app-bg)] text-slate-900">
                  <SessionExpiredModal />
                  <Sidebar />
                <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden transition-all duration-300">
                  <TopHeader />
                  <main className="flex-1 overflow-y-auto relative pb-20 md:pb-0">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-100/40 via-[var(--app-bg)] to-[var(--app-bg)] -z-10" />
                    <div className="p-2 sm:p-4 md:p-6 h-full">
                      <Breadcrumb />
                      <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/upload" element={<Upload />} />
                        <Route path="/database" element={<CandidateDatabase />} />
                        <Route path="/applications" element={<Applications />} />
                        <Route path="/resume-templates" element={<ResumeTemplates />} />
                        <Route path="/candidates" element={<Navigate to="/database" replace />} />
                        <Route path="/candidates/:id" element={<Candidate360 />} />
                        {/* Old profile links */}
                        <Route path="/evaluation/:id" element={<RedirectToCandidate />} />
                        <Route path="/evaluation" element={<Navigate to="/database" replace />} />
                        <Route path="/jd-match" element={<JDMatch />} />
                        <Route path="/skills" element={<SkillIntelligencePage />} />
                        <Route path="/job-openings" element={<JobOpenings />} />
                        <Route path="/job-openings/new" element={<JobEditor />} />
                        <Route path="/job-openings/:id/edit" element={<JobEditor key="edit" />} />
                        <Route path="/interviews" element={<InterviewManagement />} />
                        <Route path="/interviews/calendar" element={<InterviewCalendar />} />
                        <Route path="/interviews/panels" element={<InterviewPanels />} />
                        <Route path="/interviews/evaluations" element={<InterviewEvaluations />} />
                        {/* The Interview Dashboard is now the Interviews page's "Today and Upcoming" view */}
                        <Route path="/interview-dashboard" element={<Navigate to="/interviews" replace />} />
                        {/* Old link: the mock Client Feedback page was removed */}
                        <Route path="/client-feedback" element={<Navigate to="/interviews" replace />} />
                        <Route path="/analytics" element={<AnalyticsReports />} />
                        <Route path="/pipeline" element={<Navigate to="/interviews" replace />} />
                        <Route path="/audit-log" element={<AuditLog />} />
                        <Route path="/settings" element={<Settings />} />
                        <Route path="/companies" element={<Companies />} />
                        <Route path="/companies/new" element={<CreateCompany />} />
                        <Route path="/platform/plans" element={<Plans />} />
                        <Route path="/career-page" element={<CareerPageBuilder />} />
                        <Route path="/career-page/integrate" element={<CareerPageIntegrate />} />
                      </Routes>
                    </div>
                  </main>
                </div>
              </div>
              }
            />
          </Route>
        </Routes>
      </Router>
    </FeedbackProvider>
  );
}
