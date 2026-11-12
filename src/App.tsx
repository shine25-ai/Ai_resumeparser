import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
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
import Settings from "./pages/Settings";
import ResumeTemplates from "./pages/ResumeTemplates";
import PublicJobs from "./pages/PublicJobs";
import JobOpenings from "./pages/JobOpenings";

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
        {/* Public careers page: no login needed */}
        <Route path="/jobs" element={<PublicJobs />} />
        <Route element={<ProtectedRoute />}>
          <Route
            path="/*"
            element={
              <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900">
                <SessionExpiredModal />
                <Sidebar />
                <main className="flex-1 overflow-y-auto relative md:pl-20 pb-20 md:pb-0 transition-all duration-300">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-100/40 via-slate-50 to-slate-50 -z-10" />
                  <div className="p-2 sm:p-4 md:p-8 h-full">
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
                      <Route path="/settings" element={<Settings />} />
                    </Routes>
                  </div>
                </main>
              </div>
            }
          />
        </Route>
      </Routes>
    </Router>
    </FeedbackProvider>
  );
}
