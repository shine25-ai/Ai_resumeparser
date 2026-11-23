import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { TopHeader } from "./components/TopHeader";
import { ProtectedRoute } from "./components/ProtectedRoute";
import SessionExpiredModal from "./components/SessionExpiredModal";
import { FeedbackProvider } from "./components/ui/Feedback";
import Dashboard from "./pages/Dashboard";
import Upload from "./pages/Upload";
import CandidateDatabase from "./pages/CandidateDatabase";
import Evaluation from "./pages/Evaluation";
import JDMatch from "./pages/JDMatch";
import InterviewManagement from "./pages/InterviewManagement";
import AnalyticsReports from "./pages/AnalyticsReports";
import Login from "./pages/Login";
import AcceptInvite from "./pages/AcceptInvite";
import Settings from "./pages/Settings";
import Companies from "./pages/Companies";
import ResumeTemplates from "./pages/ResumeTemplates";
import CareersPage from "./careers/CareersPage";
import JobOpenings from "./pages/JobOpenings";
import AuditLog from "./pages/AuditLog";
import CandidateTracker from "./pages/CandidateTracker";

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

export default function App() {
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
                      <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/upload" element={<Upload />} />
                        <Route path="/database" element={<CandidateDatabase />} />
                        <Route path="/resume-templates" element={<ResumeTemplates />} />
                        <Route path="/candidates/:id" element={<Evaluation />} />
                        {/* Old profile links */}
                        <Route path="/evaluation/:id" element={<RedirectToCandidate />} />
                        <Route path="/evaluation" element={<Navigate to="/database" replace />} />
                        <Route path="/jd-match" element={<JDMatch />} />
                        <Route path="/job-openings" element={<JobOpenings />} />
                        <Route path="/interviews" element={<InterviewManagement />} />
                        {/* The Interview Dashboard is now the Interviews page's "Today and Upcoming" view */}
                        <Route path="/interview-dashboard" element={<Navigate to="/interviews" replace />} />
                        {/* Old link: the mock Client Feedback page was removed */}
                        <Route path="/client-feedback" element={<Navigate to="/interviews" replace />} />
                        <Route path="/analytics" element={<AnalyticsReports />} />
                        <Route path="/pipeline" element={<Navigate to="/interviews" replace />} />
                        <Route path="/audit-log" element={<AuditLog />} />
                        <Route path="/settings" element={<Settings />} />
                        <Route path="/companies" element={<Companies />} />
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
