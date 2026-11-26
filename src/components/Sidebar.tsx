import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Building2, Check, ChevronDown, ChevronRight, Crown, PanelLeftClose, PanelLeft, Search, Sparkles, Undo2 } from "lucide-react";
import { fetchAllCompanies, switchCompany, type Company } from "../utils/jobsApi";
import { useTheme } from "../theme/ThemeProvider";
import {
  PLATFORM_COMPANY_ID, allowed, isPlatformMode, isSuperAdmin, menuFor, pathMatches, roleLabel,
  type NavItem, type NavUser,
} from "./shell/navigation";

const COLLAPSED_KEY = "sidebar.collapsed";

const readUser = (): NavUser | null => {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
};

/** Super admin: open another company's workspace, or go back to the platform. */
function CompanySwitcher({ user, collapsed }: { user: NavUser; collapsed: boolean }) {
  const [open, setOpen] = useState(false);
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const platform = isPlatformMode(user);

  useEffect(() => {
    if (!open) return;
    if (!companies) fetchAllCompanies().then(setCompanies).catch(() => setCompanies([]));
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open, companies]);

  const go = async (id: string) => {
    setBusy(id);
    try {
      await switchCompany(id);
    } finally {
      setBusy(null);
    }
  };

  const label = platform ? "Super Admin" : user.company_name || "Company";
  const list = (companies || []).filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={collapsed ? label : "Switch workspace"}
        className={`flex w-full items-center gap-2 rounded-xl bg-white text-left text-slate-900 shadow-sm ${collapsed ? "justify-center p-2" : "px-3 py-2"}`}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
          {platform ? <Crown size={15} /> : <Building2 size={15} />}
        </span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 truncate text-sm font-bold">{label}</span>
            <ChevronDown size={15} className="shrink-0 text-slate-400" />
          </>
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-800 shadow-xl">
          <div className="border-b border-slate-100 p-2">
            <label className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-xs">
              <Search size={13} className="text-slate-400" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a company" className="w-full bg-transparent outline-none" />
            </label>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            <button
              type="button"
              disabled={platform || busy !== null}
              onClick={() => go(PLATFORM_COMPANY_ID)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:cursor-default"
            >
              <Crown size={14} className="text-amber-500" /> <span className="flex-1 font-semibold">Super Admin (platform)</span>
              {platform && <Check size={14} className="text-emerald-600" />}
            </button>
            {companies === null ? (
              <p className="px-3 py-2 text-xs text-slate-400">Loading…</p>
            ) : (
              list.filter((c) => c.id !== PLATFORM_COMPANY_ID).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={busy !== null || c.id === user.company_id || !c.is_active}
                  onClick={() => go(c.id)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:cursor-default disabled:opacity-60"
                  title={c.is_active ? `Open ${c.name}'s workspace` : "This workspace is turned off"}
                >
                  <Building2 size={14} className="text-slate-400" />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  {c.id === user.company_id && <Check size={14} className="text-emerald-600" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NavGroup({ item, collapsed, pathname, search }: { item: NavItem; collapsed: boolean; pathname: string; search: string }) {
  const children = item.children || [];
  const childActive = children.some((c) => pathMatches(c.path, pathname, search));
  const selfActive = pathMatches(item.path, pathname, search) || (item.path.split("?")[0] !== "/" && pathname.startsWith(item.path.split("?")[0] + "/"));
  const active = childActive || selfActive;
  const [open, setOpen] = useState(active);
  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  const row = `brand-nav-item group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${collapsed ? "justify-center" : ""}`;
  const tooltip = collapsed && (
    <span className="pointer-events-none fixed left-[76px] z-50 whitespace-nowrap rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
      {item.label}
    </span>
  );

  if (!children.length || collapsed) {
    return (
      <NavLink to={item.path} className={() => `${row} ${active ? "active font-semibold shadow-sm" : ""}`} end={item.path === "/"}>
        <span className="shrink-0">{item.icon}</span>
        {!collapsed && <span className="truncate">{item.label}</span>}
        {tooltip}
      </NavLink>
    );
  }

  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} className={`${row} ${active && !open ? "active font-semibold shadow-sm" : active ? "font-semibold" : ""}`} aria-expanded={open}>
        <span className="shrink-0">{item.icon}</span>
        <span className="flex-1 truncate text-left">{item.label}</span>
        {open ? <ChevronDown size={14} className="opacity-70" /> : <ChevronRight size={14} className="opacity-70" />}
      </button>
      {open && (
        <div className="mt-0.5 space-y-0.5 pl-9">
          {children.map((c) => {
            const on = pathMatches(c.path, pathname, search);
            return (
              <Link key={c.path} to={c.path} className={`brand-nav-item block truncate rounded-lg px-3 py-1.5 text-[13px] ${on ? "active font-semibold" : ""}`}>
                {c.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const { branding, logo } = useTheme();
  const { pathname, search } = useLocation();
  const [user] = useState<NavUser | null>(readUser);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggle = () => {
    setCollapsed((v) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, v ? "0" : "1");
      } catch {
        // only a preference
      }
      return !v;
    });
  };

  const items = useMemo(() => menuFor(user), [user]);
  const platform = isPlatformMode(user);
  const superAdmin = isSuperAdmin(user);
  const subtitle = platform ? "Multi-Tenant Job Portal" : user?.company_name || "Recruitment portal";
  const badge = platform ? "Super Admin" : roleLabel(user?.role);

  return (
    <>
      {/* Phones: a bottom bar with the top-level items */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 flex justify-between gap-1 overflow-x-auto border-t border-slate-200 bg-white px-1 py-1.5 [scrollbar-width:none] md:hidden">
        {items.map((item) => (
          <NavLink
            key={item.key}
            to={item.path}
            end={item.path === "/"}
            className={({ isActive }) => `flex min-w-[64px] shrink-0 flex-col items-center gap-0.5 rounded-lg px-1 py-1 text-[11px] font-semibold ${isActive ? "bg-indigo-50 text-indigo-700" : "text-slate-500"}`}
          >
            {item.icon}
            <span className="max-w-[64px] truncate">{item.label === "Dashboard" ? "Home" : item.label.split(" ")[0]}</span>
          </NavLink>
        ))}
      </nav>

      <aside
        aria-label="Main navigation"
        className={`brand-sidebar sticky top-0 z-40 hidden h-screen shrink-0 flex-col border-r transition-[width] duration-200 md:flex ${collapsed ? "w-[72px]" : "w-64"}`}
      >
        {/* Logo, product name */}
        <div className={`flex shrink-0 items-center gap-3 px-4 pt-4 ${collapsed ? "justify-center px-2" : ""}`}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-md">
            {logo ? <img src={logo} alt="" className="h-full w-full object-contain p-1" /> : <Sparkles size={20} className="text-indigo-600" />}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-extrabold leading-tight text-white" title={branding.app_name}>{branding.app_name}</p>
              <p className="brand-sidebar-muted truncate text-[11px] font-medium" title={subtitle}>{subtitle}</p>
            </div>
          )}
        </div>

        {/* Workspace and role */}
        <div className={`shrink-0 space-y-2 px-3 pt-4 ${collapsed ? "px-2" : ""}`}>
          {superAdmin && user ? (
            <CompanySwitcher user={user} collapsed={collapsed} />
          ) : (
            !collapsed && user?.company_name && (
              <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-slate-900 shadow-sm">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"><Building2 size={15} /></span>
                <span className="truncate text-sm font-bold">{user.company_name}</span>
              </div>
            )
          )}
          {!collapsed && (
            <div className="flex justify-center">
              <span className="brand-role-badge rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider">{badge}</span>
            </div>
          )}
          {superAdmin && !platform && !collapsed && (
            <button
              type="button"
              onClick={() => switchCompany(PLATFORM_COMPANY_ID)}
              className="flex w-full items-center justify-center gap-1 text-[11px] font-semibold text-amber-300 hover:underline"
            >
              <Undo2 size={11} /> Back to the platform
            </button>
          )}
        </div>

        {/* Menu */}
        <nav className="mt-3 flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-3 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((item) => (
            <NavGroup key={item.key} item={item} collapsed={collapsed} pathname={pathname} search={search} />
          ))}
          {superAdmin && !platform && allowed(user, "companies") && (
            <NavLink to="/companies" className="brand-nav-item mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm">
              <Building2 size={18} /> {!collapsed && <span>All companies</span>}
            </NavLink>
          )}
        </nav>

        {/* Product card and collapse */}
        <div className="shrink-0 space-y-2 p-3">
          {!collapsed && (
            <div className="brand-promo hidden rounded-2xl p-4 [@media(min-height:860px)]:block">
              <p className="text-sm font-bold text-white">{platform ? "Multi-Tenant Recruitment Platform" : `${user?.company_name || branding.app_name} Recruitment Portal`}</p>
              <p className="brand-sidebar-muted mt-1 text-[11px] leading-snug">
                {platform
                  ? "Create and manage company recruitment portals from one place."
                  : "Manage jobs, candidates, interviews and hiring in one place."}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={toggle}
            className={`brand-nav-item flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs ${collapsed ? "justify-center" : ""}`}
            title={collapsed ? "Expand the menu" : "Collapse the menu"}
          >
            {collapsed ? <PanelLeft size={16} /> : <><PanelLeftClose size={16} /> Collapse menu</>}
          </button>
        </div>
      </aside>
    </>
  );
}
