import { useEffect, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import {
  LayoutDashboard, UploadCloud, Users, Settings, Briefcase,
  Calendar, BarChart3, LogOut, Sparkles, PanelLeftClose, PanelLeft, Shield, Megaphone, Building2, Undo2,
  FileClock, Globe2
} from "lucide-react";
import { switchCompany } from "../utils/jobsApi";
import { clearBrandingCache, useTheme } from "../theme/ThemeProvider";
import { loginPath } from "../theme/brandingCache";

interface UserState {
  full_name?: string;
  email?: string;
  role?: string;
  permissions?: string[];
  company_id?: string;
  company_name?: string;
  is_superadmin?: boolean;
}

// The super admin's own company (the platform's). Opening another company's workspace switches away from it.
const PLATFORM_COMPANY_ID = "default";

export function Sidebar() {
  const { branding, logo } = useTheme();
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
    clearBrandingCache();
    navigate(loginPath());
  };

  const navItems = [
    { name: "Dashboard", path: "/", perm: "dashboard", icon: <LayoutDashboard size={20} /> },
    { name: "Upload", path: "/upload", perm: "upload", icon: <UploadCloud size={20} /> },
    // Resume templates / export now open from the Candidates page
    { name: "Candidates", path: "/database", perm: "database", icon: <Users size={20} /> },
    { name: "JD Match", path: "/jd-match", perm: "jd-match", icon: <Briefcase size={20} /> },
    { name: "Job Openings", path: "/job-openings", perm: "upload", icon: <Megaphone size={20} /> },
    { name: "Career Page", path: "/career-page", perm: "career-page", icon: <Globe2 size={20} /> },
    { name: "Interviews", path: "/interviews", perm: "interviews", icon: <Calendar size={20} /> },
    { name: "Analytics", path: "/analytics", perm: "analytics", icon: <BarChart3 size={20} /> },
    { name: "Audit Log", path: "/audit-log", perm: "audit-log", icon: <FileClock size={20} /> },
    // Interview types live under Settings
    ...(user?.is_superadmin || user?.role?.toLowerCase() === "superadmin"
      ? [{ name: "Companies", path: "/companies", perm: "companies", icon: <Building2 size={20} /> }]
      : []),
  ];
  const isSuper = !!user?.is_superadmin || user?.role?.toLowerCase() === "superadmin";
  const inOtherCompany = isSuper && !!user?.company_id && user.company_id !== PLATFORM_COMPANY_ID;

  // Dynamic role-based filtering:
  // If user is admin or permissions array is missing/empty, show all default items.
  // Otherwise filter strictly by user.permissions.
  const userRoleLower = user?.role?.toLowerCase() || "";
  const visibleNavItems = navItems.filter((item) => {
    if (!user) return true;
    if (userRoleLower === "admin" || userRoleLower === "superadmin") return true;
    if (!user.permissions || user.permissions.length === 0) return true;
    // The old Interview Dashboard and Client Feedback permissions now open the Interviews page
    if (item.perm === "interviews" && (user.permissions.includes("interview-dashboard") || user.permissions.includes("client-feedback"))) return true;
    return user.permissions.includes(item.perm);
  });

  const canAccessSettings = !user || userRoleLower === "admin" || userRoleLower === "superadmin" || !user.permissions || user.permissions.includes("settings");


  return (
    <>
      {/* Phones: a bottom bar instead of the side rail */}
      <nav aria-label="Main" className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 flex justify-around px-0.5 py-1.5">
        {[...visibleNavItems, ...(canAccessSettings ? [{ name: "Settings", path: "/settings", perm: "settings", icon: <Settings size={20} /> }] : [])].map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-1 py-1 rounded-lg text-[11px] font-semibold min-w-0 ${isActive ? "text-indigo-700 bg-indigo-50" : "text-slate-500"}`
            }
          >
            {item.icon}
            <span className="truncate max-w-[64px]">{item.name === "Dashboard" ? "Home" : item.name}</span>
          </NavLink>
        ))}
      </nav>

      <aside
        aria-label="Main navigation"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`brand-sidebar hidden md:flex shrink-0 h-screen sticky top-0 z-40 border-r flex-col transition-[width] duration-300 ease-in-out ${isExpanded ? "w-64" : "w-20"
          }`}
      >
        {/* Header Logo */}
        <div className="p-4 flex items-center justify-between border-b border-white/10 h-16 shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-white shadow-md shrink-0 flex items-center justify-center overflow-hidden">
              {logo ? (
                <img src={logo} alt="" className="w-full h-full object-contain p-1" />
              ) : (
                <span className="text-indigo-600"><Sparkles size={20} /></span>
              )}
            </div>
            {isExpanded && (
              <div className="transition-opacity duration-300 whitespace-nowrap overflow-hidden">
                <h2 className="text-base font-extrabold text-white truncate max-w-[150px]" title={branding.app_name}>
                  {branding.app_name}
                </h2>
                <p className="brand-sidebar-muted text-[11px] font-medium truncate max-w-[150px]" title={user?.company_name}>
                  {user?.company_name || "Recruitment portal"}
                </p>
              </div>
            )}
          </div>

          {isExpanded && (
            <button
              onClick={() => setIsPinned(!isPinned)}
              className="brand-nav-item p-1.5 rounded-lg transition-colors cursor-pointer shrink-0"
              title={isPinned ? "Unpin sidebar" : "Pin sidebar"}
            >
              {isPinned ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
            </button>
          )}
        </div>

        {inOtherCompany && (
          <div className={`mx-3 mt-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 ${isExpanded ? "px-3 py-2" : "p-2 flex justify-center"}`}>
            {isExpanded ? (
              <>
                <div className="text-[11px] font-semibold uppercase tracking-wide">Viewing as super admin</div>
                <div className="text-xs font-bold truncate">{user?.company_name}</div>
                <button
                  onClick={() => switchCompany(PLATFORM_COMPANY_ID)}
                  className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 hover:underline cursor-pointer"
                >
                  <Undo2 size={11} /> Back to my company
                </button>
              </>
            ) : (
              <button onClick={() => switchCompany(PLATFORM_COMPANY_ID)} title={`Viewing ${user?.company_name}. Back to my company`} className="cursor-pointer">
                <Undo2 size={16} />
              </button>
            )}
          </div>
        )}

        {/* Navigation Items */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `brand-nav-item flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 relative group cursor-pointer ${isActive
                  ? "active shadow-sm font-semibold"
                  : ""
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-2 bottom-2 w-1 bg-white/80 rounded-r-full" />
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
        <div className="brand-sidebar-footer p-3 border-t space-y-1 shrink-0">
          {/* Logged in user info */}
          {user && isExpanded && (
            <div className="brand-user-card px-3 py-2 mb-1 border rounded-xl flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                {user.full_name?.charAt(0).toUpperCase() || "U"}
              </div>
              <div className="overflow-hidden">
                <div className="text-xs font-bold text-slate-800 truncate">{user.full_name}</div>
                <div className="text-[11px] text-indigo-600 font-semibold flex items-center gap-1 uppercase tracking-wider">
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
                `brand-nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors cursor-pointer group relative ${isActive
                  ? "active font-semibold"
                  : ""
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
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-rose-300 hover:text-rose-200 hover:bg-rose-500/15 transition-colors text-left text-xs font-medium cursor-pointer group relative"
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
    </>
  );
}
