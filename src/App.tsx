import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import Upload from "./pages/Upload";
import CandidateDatabase from "./pages/CandidateDatabase";
import Evaluation from "./pages/Evaluation";
import JDMatch from "./pages/JDMatch";
import InterviewManagement from "./pages/InterviewManagement";
import InterviewDashboard from "./pages/InterviewDashboard";
import ClientFeedback from "./pages/ClientFeedback";
import AnalyticsReports from "./pages/AnalyticsReports";
import Login from "./pages/Login";
import Settings from "./pages/Settings";
import ResumeTemplates from "./pages/ResumeTemplates";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route
            path="/*"
            element={
              <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900">
                <Sidebar />
                <main className="flex-1 overflow-y-auto relative pl-20 transition-all duration-300">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-100/40 via-slate-50 to-slate-50 -z-10" />
                  <div className="p-8 h-full">
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/upload" element={<Upload />} />
                      <Route path="/database" element={<CandidateDatabase />} />
                      <Route path="/resume-templates" element={<ResumeTemplates />} />
                      <Route path="/evaluation" element={<Evaluation />} />
                      <Route path="/evaluation/:id" element={<Evaluation />} />
                      <Route path="/jd-match" element={<JDMatch />} />
                      <Route path="/interviews" element={<InterviewManagement />} />
                      <Route path="/interview-dashboard" element={<InterviewDashboard />} />
                      <Route path="/client-feedback" element={<ClientFeedback />} />
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
  );
}
