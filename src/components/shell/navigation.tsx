import type { ReactNode } from "react";
import {
  BarChart3, Briefcase, Building2, Calendar, CreditCard, Database, FileClock, GitFork, Globe2, LayoutDashboard,
  Settings, Users, UserCog,
} from "lucide-react";

/**
 * The portal's menu, as in the HireLogics mockups: top-level items with sub-items. One list feeds the sidebar,
 * the breadcrumb and the Ctrl+K search, so they always agree.
 *
 * `perm` is the page permission a user needs (see app.core.permissions LEGACY_PAGES / PAGE_FOR). Paths may carry a
 * query (?tab=...), which also has to match for the item to be active.
 */

export interface NavChild {
  label: string;
  path: string;
  perm?: string;
}

export interface NavItem {
  key: string;
  label: string;
  path: string;
  icon: ReactNode;
  perm?: string;
  children?: NavChild[];
}

export interface NavUser {
  full_name?: string;
  email?: string;
  role?: string;
  permissions?: string[];
  company_id?: string;
  company_name?: string;
  is_superadmin?: boolean;
}

/** The super admin's own company (the platform's). */
export const PLATFORM_COMPANY_ID = "default";

export const isSuperAdmin = (u: NavUser | null) => !!u && (!!u.is_superadmin || u.role?.toLowerCase() === "superadmin");

/** The super admin working in the platform company sees the platform menu; inside a company, that company's menu. */
export const isPlatformMode = (u: NavUser | null) => isSuperAdmin(u) && (!u?.company_id || u.company_id === PLATFORM_COMPANY_ID);

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Super Admin",
  admin: "Company Admin",
  hr_admin: "HR Admin",
  recruiter: "Recruiter",
  hiring_manager: "Hiring Manager",
  interviewer: "Interviewer",
  viewer: "Viewer",
  user: "User",
};

export const roleLabel = (role?: string) =>
  ROLE_LABELS[(role || "").toLowerCase()] || (role ? role.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "User");

const I = 18;

export const PLATFORM_NAV: NavItem[] = [
  { key: "dashboard", label: "Dashboard", path: "/", icon: <LayoutDashboard size={I} />, perm: "dashboard" },
  {
    key: "companies", label: "Companies", path: "/companies", icon: <Building2 size={I} />, perm: "companies",
    children: [
      { label: "All Companies", path: "/companies" },
      { label: "Create Company", path: "/companies/new" },
      { label: "Plans & Billing", path: "/platform/plans" },
    ],
  },
  { key: "users", label: "Users", path: "/settings?tab=roles", icon: <Users size={I} />, perm: "settings" },
  { key: "platform-settings", label: "Platform Settings", path: "/settings?tab=branding", icon: <Settings size={I} />, perm: "settings" },
  { key: "analytics", label: "Reports & Analytics", path: "/analytics", icon: <BarChart3 size={I} />, perm: "analytics" },
  { key: "audit", label: "Audit Logs", path: "/audit-log", icon: <FileClock size={I} />, perm: "audit-log" },
  { key: "masters", label: "Master Data", path: "/settings?tab=masters", icon: <Database size={I} />, perm: "settings" },
];

export const COMPANY_NAV: NavItem[] = [
  { key: "dashboard", label: "Dashboard", path: "/", icon: <LayoutDashboard size={I} />, perm: "dashboard" },
  {
    key: "jobs", label: "Jobs & Openings", path: "/job-openings", icon: <Briefcase size={I} />, perm: "upload",
    children: [
      { label: "All Job Openings", path: "/job-openings" },
      { label: "Create Job Opening", path: "/job-openings/new" },
      { label: "Job Templates", path: "/job-openings?view=templates" },
    ],
  },
  {
    key: "candidates", label: "Candidates", path: "/database", icon: <Users size={I} />, perm: "database",
    children: [
      { label: "All Candidates", path: "/database" },
      { label: "Applications", path: "/applications" },
      { label: "Upload Resumes", path: "/upload", perm: "upload" },
      { label: "JD Match", path: "/jd-match", perm: "jd-match" },
    ],
  },
  { key: "interviews", label: "Interviews", path: "/interviews", icon: <Calendar size={I} />, perm: "interviews" },
  {
    key: "pipeline",
    label: "Recruitment Pipeline",
    path: "/pipeline",
    icon: <GitFork size={I} />,
    perm: "pipeline",
    children: [
      { label: "Pipeline (Kanban)", path: "/pipeline" },
      { label: "Pipeline Analytics", path: "/pipeline?tab=analytics" },
      { label: "Stage Configuration", path: "/pipeline?tab=stages" },
    ],
  },
  {
    key: "career", label: "Career Page", path: "/career-page", icon: <Globe2 size={I} />, perm: "career-page",
    children: [
      { label: "Career Page Builder", path: "/career-page" },
      { label: "Add to Your Website", path: "/career-page/integrate" },
    ],
  },
  { key: "users", label: "Company Users", path: "/settings?tab=roles", icon: <UserCog size={I} />, perm: "settings" },
  { key: "analytics", label: "Reports & Analytics", path: "/analytics", icon: <BarChart3 size={I} />, perm: "analytics" },
  { key: "audit", label: "Audit Log", path: "/audit-log", icon: <FileClock size={I} />, perm: "audit-log" },
  {
    key: "settings", label: "Settings", path: "/settings", icon: <Settings size={I} />, perm: "settings",
    children: [
      { label: "Company Settings", path: "/settings?tab=company" },
      { label: "Branding", path: "/settings?tab=branding" },
      { label: "Email Setup", path: "/settings?tab=config" },
      { label: "Email Templates", path: "/settings?tab=templates" },
      { label: "Interview Types", path: "/settings?tab=interviewTypes" },
      { label: "Master Data", path: "/settings?tab=masters" },
      { label: "Integrations", path: "/settings?tab=integration" },
    ],
  },
];

/** A super admin's extra item inside a company: back to the platform menu is in the company switcher. */
export const PLANS_ITEM: NavItem = {
  key: "plans", label: "Plans & Billing", path: "/platform/plans", icon: <CreditCard size={I} />, perm: "companies",
};

/** Whether the user may open a page needing `perm` (admins and old accounts without a list see everything). */
export function allowed(user: NavUser | null, perm?: string): boolean {
  if (!perm || !user) return true;
  const role = (user.role || "").toLowerCase();
  if (role === "admin" || role === "superadmin" || user.is_superadmin) return true;
  if (perm === "companies") return false;
  const perms = user.permissions || [];
  if (perms.length === 0) return true;
  // The old Interview Dashboard and Client Feedback permissions open the Interviews page.
  if (perm === "interviews" && (perms.includes("interview-dashboard") || perms.includes("client-feedback"))) return true;
  return perms.includes(perm);
}

export function menuFor(user: NavUser | null): NavItem[] {
  const items = isPlatformMode(user) ? PLATFORM_NAV : COMPANY_NAV;
  return items
    .filter((i) => allowed(user, i.perm))
    .map((i) => (i.children ? { ...i, children: i.children.filter((c) => allowed(user, c.perm || i.perm)) } : i));
}

/** True when `path` (which may carry ?query) is the current page. */
export function pathMatches(path: string, pathname: string, search: string): boolean {
  const [p, q] = path.split("?");
  if (p !== pathname) return false;
  const want = new URLSearchParams(q || "");
  const have = new URLSearchParams(search);
  for (const [k, v] of want) if (have.get(k) !== v) return false;
  // "/settings" with no tab is the first tab; "/job-openings" without ?view is the list.
  if (!q && (have.get("view") || (p === "/settings" && have.get("tab")))) return false;
  return true;
}

/** Extra pages that aren't menu items, for the breadcrumb. */
const EXTRA_TRAILS: { test: (p: string) => boolean; trail: (p: string) => string[] }[] = [
  { test: (p) => p.startsWith("/candidates/"), trail: () => ["Candidates", "Candidate Profile"] },
  { test: (p) => /^\/job-openings\/[^/]+\/edit$/.test(p), trail: () => ["Jobs & Openings", "Edit Job Opening"] },
  { test: (p) => p === "/resume-templates", trail: () => ["Candidates", "Resume Templates"] },
];

/** Breadcrumb trail for the current page, e.g. ["Companies", "Create Company"]. */
export function trailFor(items: NavItem[], pathname: string, search: string): string[] {
  for (const item of items) {
    for (const c of item.children || []) {
      if (pathMatches(c.path, pathname, search)) return c.label === item.label ? [item.label] : [item.label, c.label];
    }
  }
  for (const item of items) {
    if (pathMatches(item.path, pathname, search)) return [item.label];
  }
  for (const item of items) {
    const base = item.path.split("?")[0];
    if (base !== "/" && pathname === base) return [item.label];
  }
  const extra = EXTRA_TRAILS.find((e) => e.test(pathname));
  if (extra) return extra.trail(pathname);
  if (pathname === "/platform/plans") return ["Companies", "Plans & Billing"];
  return pathname === "/" ? ["Dashboard"] : [];
}
