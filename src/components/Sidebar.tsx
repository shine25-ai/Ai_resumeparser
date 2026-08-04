import { useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import {
  LayoutDashboard, UploadCloud, Users, CheckCircle, Settings, Briefcase,
  Calendar, Video, MessageSquare, BarChart3, LogOut, Sparkles, PanelLeftClose, PanelLeft
} from "lucide-react";

export function Sidebar() {
  const navigate = useNavigate();
  const [isPinned, setIsPinned] = useState<boolean>(false);
  const [isHovered, setIsHovered] = useState<boolean>(false);

  const isExpanded = isPinned || isHovered;

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  const navItems = [
    { name: "Dashboard", path: "/", icon: <LayoutDashboard size={20} /> },
    { name: "Upload Resume", path: "/upload", icon: <UploadCloud size={20} /> },
    { name: "Candidate Database", path: "/database", icon: <Users size={20} /> },
    { name: "Evaluation", path: "/evaluation", icon: <CheckCircle size={20} /> },
    { name: "JD Matching", path: "/jd-match", icon: <Briefcase size={20} /> },
    { name: "Interviews", path: "/interviews", icon: <Calendar size={20} /> },
    { name: "Interview Dashboard", path: "/interview-dashboard", icon: <Video size={20} /> },
    { name: "Client Feedback", path: "/client-feedback", icon: <MessageSquare size={20} /> },
    { name: "Analytics & Reports", path: "/analytics", icon: <BarChart3 size={20} /> },
  ];

  return (
    <aside
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`fixed top-0 left-0 bottom-0 z-40 bg-[#070a1f]/95 backdrop-blur-xl border-r border-slate-800/80 flex flex-col transition-all duration-300 ease-in-out shadow-2xl ${
        isExpanded ? "w-64" : "w-20"
      }`}
    >
      {/* Header Logo */}
      <div className="p-4 flex items-center justify-between border-b border-slate-800/60 h-16 shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-sky-400 p-0.5 shadow-lg shadow-indigo-500/20 shrink-0 flex items-center justify-center">
            <div className="w-full h-full bg-[#070a1f] rounded-[10px] flex items-center justify-center text-indigo-400">
              <Sparkles size={20} />
            </div>
          </div>
          {isExpanded && (
            <div className="transition-opacity duration-300 whitespace-nowrap overflow-hidden">
              <h2 className="text-base font-extrabold bg-gradient-to-r from-indigo-400 via-sky-300 to-teal-300 bg-clip-text text-transparent">
                AI Recruiter
              </h2>
              <p className="text-[10px] text-slate-400 font-medium">Smart Hiring Platform</p>
            </div>
          )}
        </div>

        {isExpanded && (
          <button
            onClick={() => setIsPinned(!isPinned)}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800/60 transition-colors cursor-pointer shrink-0"
            title={isPinned ? "Unpin sidebar" : "Pin sidebar"}
          >
            {isPinned ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
          </button>
        )}
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto overflow-x-hidden">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 relative group cursor-pointer ${
                isActive
                  ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.15)] font-semibold"
                  : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute left-0 top-2 bottom-2 w-1 bg-indigo-500 rounded-r-full shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
                )}
                <div className={`shrink-0 flex items-center justify-center ${!isExpanded ? "mx-auto" : ""}`}>
                  {item.icon}
                </div>
                {isExpanded ? (
                  <span className="text-xs truncate transition-opacity duration-300">
                    {item.name}
                  </span>
                ) : (
                  <div className="fixed left-20 px-3 py-1.5 bg-slate-900 text-slate-100 text-xs font-semibold rounded-lg shadow-xl border border-slate-800 whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 z-50">
                    {item.name}
                  </div>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer Actions */}
      <div className="p-3 border-t border-slate-800/60 space-y-1 shrink-0 bg-[#070a1f]">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors cursor-pointer group relative ${
              isActive
                ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30"
                : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
            }`
          }
        >
          <div className={`shrink-0 flex items-center justify-center ${!isExpanded ? "mx-auto" : ""}`}>
            <Settings size={20} />
          </div>
          {isExpanded ? (
            <span className="text-xs font-medium truncate">Settings</span>
          ) : (
            <div className="fixed left-20 px-3 py-1.5 bg-slate-900 text-slate-100 text-xs font-semibold rounded-lg shadow-xl border border-slate-800 whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 z-50">
              Settings
            </div>
          )}
        </NavLink>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors text-left text-xs font-medium cursor-pointer group relative"
        >
          <div className={`shrink-0 flex items-center justify-center ${!isExpanded ? "mx-auto" : ""}`}>
            <LogOut size={20} />
          </div>
          {isExpanded ? (
            <span className="truncate">Logout</span>
          ) : (
            <div className="fixed left-20 px-3 py-1.5 bg-slate-900 text-rose-300 text-xs font-semibold rounded-lg shadow-xl border border-slate-800 whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 z-50">
              Logout
            </div>
          )}
        </button>
      </div>
    </aside>
  );
}
