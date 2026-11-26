import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  HelpCircle,
  Search,
  ChevronDown,
  Moon,
  Sun,
  Settings,
  LogOut,
  CheckCheck,
} from 'lucide-react';
import {
  getDashboardNotifications,
  fetchInAppNotifications,
  markInAppNotificationRead,
  markAllInAppNotificationsRead,
} from '../utils/Api';
import type { DashboardNotification } from '../types/dashboard';
import { clearBrandingCache, useTheme } from '../theme/ThemeProvider';
import { loginPath } from '../theme/brandingCache';
import CommandPalette from './shell/CommandPalette';
import { isPlatformMode, roleLabel } from './shell/navigation';

const STORAGE_READ_NOTIFS_KEY = 'dashboard_read_notifs_v1';

function getSeverityDot(severity: DashboardNotification['severity']) {
  if (severity === 'danger') return 'bg-rose-500';
  if (severity === 'warning') return 'bg-amber-500';
  if (severity === 'success') return 'bg-emerald-500';
  return 'bg-indigo-500';
}

export function TopHeader() {
  const location = useLocation();
  const navigate = useNavigate();

  const [userName, setUserName] = useState<string>('');
  const [userRole, setUserRole] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');

  // Dark mode follows the company's setting (off / user's choice / system): see ThemeProvider.
  const { isDark: darkMode, canToggleDark, toggleDark, branding } = useTheme();

  const [notifications, setNotifications] = useState<DashboardNotification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_READ_NOTIFS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return new Set(parsed.map(String));
      }
    } catch {
      // ignore
    }
    return new Set();
  });

  const [notifOpen, setNotifOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef<HTMLDivElement>(null);
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  // Ctrl+K / ⌘K opens the search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const [profileOpen, setProfileOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);


  useEffect(() => {
    try {
      const raw = localStorage.getItem('user');
      if (raw) {
        const u = JSON.parse(raw);
        if (u.full_name) setUserName(u.full_name);
        if (u.email) setUserEmail(u.email);
        setUserRole(isPlatformMode(u) ? 'Super Admin' : roleLabel(u.role));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetchInAppNotifications()
      .then((res) => {
        if (!active) return;
        if (Array.isArray(res?.notifications) && res.notifications.length > 0) {
          const mapped: (DashboardNotification & { inAppId?: string; isRead?: boolean })[] = res.notifications.map((n) => ({
            id: n.id,
            inAppId: n.id,
            title: n.title,
            description: n.message,
            time: n.created_at ? new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently',
            type: n.type || 'info',
            severity: (n.type === 'limit_warning' || n.type === 'warning' ? 'warning' : n.type === 'error' ? 'danger' : 'info') as any,
            actionPath: n.link || '',
            isRead: n.is_read,
          }));
          setNotifications(mapped);
          const read = new Set<string>();
          mapped.forEach((m) => {
            if (m.isRead) read.add(m.id);
          });
          setReadIds(read);
          return;
        }
        // Fallback to dashboard notifications
        getDashboardNotifications(7)
          .then((dRes) => {
            if (active && Array.isArray(dRes?.notifications)) {
              setNotifications(dRes.notifications);
            }
          })
          .catch(() => undefined);
      })
      .catch(() => {
        getDashboardNotifications(7)
          .then((dRes) => {
            if (active && Array.isArray(dRes?.notifications)) {
              setNotifications(dRes.notifications);
            }
          })
          .catch(() => undefined);
      });
    return () => {
      active = false;
    };
  }, [location.pathname]);

  useEffect(() => {
    if (!notifOpen && !profileOpen && !helpOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNotifOpen(false);
        setProfileOpen(false);
        setHelpOpen(false);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) {
        setHelpOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onClick);
    };
  }, [notifOpen, profileOpen, helpOpen]);

  const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length;

  const markRead = (id: string) => {
    markInAppNotificationRead(id).catch(() => undefined);
    setReadIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem(STORAGE_READ_NOTIFS_KEY, JSON.stringify(Array.from(next).slice(-100)));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const markAllRead = () => {
    markAllInAppNotificationsRead().catch(() => undefined);
    setReadIds((prev) => {
      const next = new Set(prev);
      notifications.forEach((n) => next.add(n.id));
      try {
        localStorage.setItem(STORAGE_READ_NOTIFS_KEY, JSON.stringify(Array.from(next).slice(-100)));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    clearBrandingCache();
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    navigate(loginPath());
  };

  const initials =
    userName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || 'U';


  return (
    <header className="h-[68px] shrink-0 bg-white border-b border-slate-200/80 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-30">
      {/* Left: search (Ctrl+K) */}
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="flex h-10 w-full max-w-md items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-left text-sm text-slate-400 transition-colors hover:border-slate-300 hover:bg-white cursor-pointer"
      >
        <Search size={16} className="shrink-0" />
        <span className="flex-1 truncate">{isPlatformMode(JSON.parse(localStorage.getItem('user') || 'null')) ? 'Search companies, pages…' : 'Search candidates, jobs, pages…'}</span>
        <kbd className="hidden rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-500 sm:inline">{isMac ? '⌘ K' : 'Ctrl + K'}</kbd>
      </button>
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Right: Theme, Notifications Bell, User Avatar */}
      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
        {/* Theme Toggle (only when the company lets each user choose) */}
        {canToggleDark && (
        <button
          type="button"
          onClick={toggleDark}
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          {darkMode ? <Sun size={15} className="text-amber-500" /> : <Moon size={15} />}
        </button>
        )}

        {/* Notifications Bell with Unread Badge */}
        <div ref={notifRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setNotifOpen((v) => !v);
              setProfileOpen(false);
            }}
            aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
            aria-expanded={notifOpen}
            className="relative h-8 w-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <Bell size={15} />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-semibold leading-none flex items-center justify-center tabular-nums shadow-xs">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div
              role="dialog"
              aria-label="Notifications"
              className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl border border-slate-200 shadow-xl shadow-slate-900/10 overflow-hidden z-50"
            >
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-semibold text-slate-900">Notifications</h3>
                  {unreadCount > 0 && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-700 tabular-nums">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1"
                  >
                    <CheckCheck size={12} />
                    <span>Mark all read</span>
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                {notifications.length > 0 ? (
                  notifications.map((n) => {
                    const isRead = readIds.has(n.id);
                    return (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => {
                          markRead(n.id);
                          setNotifOpen(false);
                          if (n.actionPath) navigate(n.actionPath);
                        }}
                        className={`w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors flex items-start gap-2.5 ${
                          isRead ? 'opacity-65' : 'bg-indigo-50/20'
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${getSeverityDot(n.severity)}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-800 leading-snug">
                              {n.title}
                            </span>
                            <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">
                              {n.time}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                            {n.description}
                          </p>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="py-8 text-center text-xs text-slate-400">
                    You&apos;re all caught up — no notifications.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Help */}
        <div ref={helpRef} className="relative">
          <button
            type="button"
            onClick={() => { setHelpOpen((v) => !v); setNotifOpen(false); setProfileOpen(false); }}
            aria-label="Help"
            aria-expanded={helpOpen}
            className="h-9 w-9 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <HelpCircle size={17} />
          </button>
          {helpOpen && (
            <div className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-xl z-50">
              <p className="mb-2 text-xs font-semibold text-slate-900">Shortcuts</p>
              <div className="flex items-center justify-between py-1"><span>Search anything</span><kbd className="rounded border border-slate-200 px-1.5 text-[11px]">{isMac ? '⌘ K' : 'Ctrl + K'}</kbd></div>
              <div className="flex items-center justify-between py-1"><span>Close a pop-up</span><kbd className="rounded border border-slate-200 px-1.5 text-[11px]">Esc</kbd></div>
              <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] text-slate-500">Need help? Ask your company administrator{branding.app_name ? ` or the ${branding.app_name} team` : ''}.</p>
            </div>
          )}
        </div>

        <span className="hidden h-8 w-px bg-slate-200 sm:block" />

        {/* User Avatar + Dropdown */}
        <div ref={profileRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setProfileOpen((v) => !v);
              setNotifOpen(false);
            }}
            aria-expanded={profileOpen}
            className="flex items-center gap-2.5 pl-1 pr-2 py-1 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            title={`${userName || 'User'} (${userRole})`}
          >
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-white font-semibold text-xs flex items-center justify-center shadow-xs shrink-0">
              {initials}
            </div>
            <div className="hidden lg:block text-left leading-tight">
              <div className="text-sm font-semibold text-slate-900 max-w-[160px] truncate">{userName || 'User'}</div>
              <div className="text-xs text-slate-500">{userRole}</div>
            </div>
            <ChevronDown size={14} className="text-slate-400 hidden sm:block" />
          </button>

          {profileOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl border border-slate-200 shadow-xl shadow-slate-900/10 py-1.5 z-50">
              <div className="px-3.5 py-2 border-b border-slate-100">
                <div className="text-xs font-semibold text-slate-900 truncate">
                  {userName || 'User'}
                </div>
                {userEmail && (
                  <div className="text-[11px] text-slate-400 truncate">{userEmail}</div>
                )}
                <div className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wider mt-0.5">
                  {userRole}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  navigate('/settings');
                }}
                className="w-full px-3.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
              >
                <Settings size={13} className="text-slate-400" />
                <span>Settings</span>
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="w-full px-3.5 py-2 text-left text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition-colors"
              >
                <LogOut size={13} />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
