import { useEffect, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import {
  LayoutDashboard, UploadCloud, Users, Settings, Briefcase,
  Calendar, Video, MessageSquare, BarChart3, LogOut, Sparkles, PanelLeftClose, PanelLeft, Shield, Layers
} from "lucide-react";

interface UserState {
  full_name?: string;
  email?: string;
  role?: string;
  permissions?: string[];
}

export function Sidebar() {
  const navigate = useNavigate();
  const [isPinned, setIsPinned] = useState<boolean>(false);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [user, setUser] = useState<UserState | null>(null);

  const isExpanded = isPinned || isHovered;

  useEffect(() => {
    try {
      const storedUserStr = localStorage.getItem("user");
      if (storedUserStr) {
        setUser(JSON.parse(storedUserStr));
      }
    } catch (e) {
      console.error("Failed to parse user from localStorage", e);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  const navItems = [
    { name: "Dashboard", path: "/", perm: "dashboard", icon: <LayoutDashboard size={20} /> },
    { name: "Upload Resume", path: "/upload", perm: "upload", icon: <UploadCloud size={20} /> },
    { name: "Candidate Database", path: "/database", perm: "database", icon: <Users size={20} /> },
    { name: "JD Matching", path: "/jd-match", perm: "jd-match", icon: <Briefcase size={20} /> },
    { name: "Interviews", path: "/interviews", perm: "interviews", icon: <Calendar size={20} /> },
    { name: "Interview Dashboard", path: "/interview-dashboard", perm: "interview-dashboard", icon: <Video size={20} /> },
    { name: "Client Feedback", path: "/client-feedback", perm: "client-feedback", icon: <MessageSquare size={20} /> },
    { name: "Analytics & Reports", path: "/analytics", perm: "analytics", icon: <BarChart3 size={20} /> },
    { name: "Resume Templates", path: "/resume-templates", perm: "resume-templates", icon: <Briefcase size={20} /> },
    { name: "Interview Types", path: "/settings?tab=interviewTypes", perm: "settings", icon: <Layers size={20} /> },
  ];

  // Dynamic role-based filtering:
  // If user is admin or permissions array is missing/empty, show all default items.
  // Otherwise filter strictly by user.permissions.
  const userRoleLower = user?.role?.toLowerCase() || "";
  const visibleNavItems = navItems.filter((item) => {
    if (!user) return true;
    if (userRoleLower === "admin" || userRoleLower === "superadmin") return true;
    if (!user.permissions || user.permissions.length === 0) return true;
    return user.permissions.includes(item.perm);
  });

  const canAccessSettings = !user || userRoleLower === "admin" || userRoleLower === "superadmin" || !user.permissions || user.permissions.includes("settings");


  return (
    <aside
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`fixed top-0 left-0 bottom-0 z-40 bg-white/95 backdrop-blur-xl border-r border-slate-200 flex flex-col transition-all duration-300 ease-in-out shadow-lg ${isExpanded ? "w-64" : "w-20"
        }`}
    >
      {/* Header Logo */}
      <div className="p-4 flex items-center justify-between border-b border-slate-200 h-16 shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-sky-400 p-0.5 shadow-md shadow-indigo-500/20 shrink-0 flex items-center justify-center">
            <div className="w-full h-full bg-white rounded-[10px] flex items-center justify-center text-indigo-600">
              <Sparkles size={20} />
            </div>
          </div>
          {isExpanded && (
            <div className="transition-opacity duration-300 whitespace-nowrap overflow-hidden">
              <h2 className="text-base font-extrabold bg-gradient-to-r from-indigo-600 via-indigo-500 to-sky-600 bg-clip-text text-transparent">
                AI Recruiter
              </h2>
              <p className="text-[10px] text-slate-500 font-medium">Smart Hiring Platform</p>
            </div>
          )}
        </div>

        {isExpanded && (
          <button
            onClick={() => setIsPinned(!isPinned)}
            className="text-slate-500 hover:text-slate-800 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
            title={isPinned ? "Unpin sidebar" : "Pin sidebar"}
          >
            {isPinned ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
          </button>
        )}
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {visibleNavItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 relative group cursor-pointer ${isActive
                ? "bg-indigo-50 text-indigo-600 border border-indigo-200/80 shadow-sm font-semibold"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute left-0 top-2 bottom-2 w-1 bg-indigo-600 rounded-r-full shadow-sm" />
                )}
                <div className={`shrink-0 flex items-center justify-center ${!isExpanded ? "mx-auto" : ""}`}>
                  {item.icon}
                </div>
                {isExpanded ? (
                  <span className="text-xs truncate transition-opacity duration-300">
                    {item.name}
                  </span>
                ) : (
                  <div className="fixed left-20 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-xl border border-slate-800 whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 z-50">
                    {item.name}
                  </div>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer Actions */}
      <div className="p-3 border-t border-slate-200 space-y-1 shrink-0 bg-white">
        {/* Logged in user info */}
        {user && isExpanded && (
          <div className="px-3 py-2 mb-1 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
              {user.full_name?.charAt(0).toUpperCase() || "U"}
            </div>
            <div className="overflow-hidden">
              <div className="text-xs font-bold text-slate-800 truncate">{user.full_name}</div>
              <div className="text-[10px] text-indigo-600 font-semibold flex items-center gap-1 uppercase tracking-wider">
                <Shield size={10} />
                <span>{user.role}</span>
              </div>
            </div>
          </div>
        )}

        {canAccessSettings && (
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors cursor-pointer group relative ${isActive
                ? "bg-indigo-50 text-indigo-600 border border-indigo-200/80 font-semibold"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`
            }
          >
            <div className={`shrink-0 flex items-center justify-center ${!isExpanded ? "mx-auto" : ""}`}>
              <Settings size={20} />
            </div>
            {isExpanded ? (
              <span className="text-xs font-medium truncate">Settings</span>
            ) : (
              <div className="fixed left-20 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-xl border border-slate-800 whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 z-50">
                Settings
              </div>
            )}
          </NavLink>
        )}

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-rose-600 hover:text-rose-700 hover:bg-rose-50 transition-colors text-left text-xs font-medium cursor-pointer group relative"
        >
          <div className={`shrink-0 flex items-center justify-center ${!isExpanded ? "mx-auto" : ""}`}>
            <LogOut size={20} />
          </div>
          {isExpanded ? (
            <span className="truncate">Logout</span>
          ) : (
            <div className="fixed left-20 px-3 py-1.5 bg-slate-900 text-rose-200 text-xs font-semibold rounded-lg shadow-xl border border-slate-800 whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 z-50">
              Logout
            </div>
          )}
        </button>
      </div>
    </aside>
  );
}
