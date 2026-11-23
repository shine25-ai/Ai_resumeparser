import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { BASE_URL, apiFetch } from "../utils/Api";
import { BRANDING_CACHE_KEY } from "./brandingCache";

export { clearBrandingCache } from "./brandingCache";

/**
 * White-label theme (plan §3). Applies a company's branding to the whole app through CSS variables
 * (see the "White-label theme tokens" section of index.css), sets the tab title and favicon, loads the font,
 * and runs light/dark mode within what the company allows.
 *
 * The last branding is cached in localStorage so a reload starts in the right colours instead of flashing
 * the default ones.
 */

export interface Branding {
  app_name: string;
  colors: { primary: string; secondary: string; accent: string; text: string; sidebar_bg: string; sidebar_text: string; background: string };
  dark: { primary: string; background: string; surface: string; sidebar_bg: string };
  dark_mode: "off" | "user_choice" | "system";
  font_family: string;
  radius: "sm" | "md" | "lg" | "";
  logo_url: string;
  logo_dark_url: string;
  favicon_url: string;
  login: { background_url: string; welcome_title: string; welcome_text: string };
  email?: { from_name: string; reply_to: string; footer_text: string };
}

export const DEFAULT_BRANDING: Branding = {
  app_name: "HireLogics",
  colors: { primary: "#1c7975", secondary: "#2563eb", accent: "#3b82f6", text: "#111827", sidebar_bg: "#0b2240", sidebar_text: "#cbd5e1", background: "#f4f7fb" },
  dark: { primary: "", background: "#0b1120", surface: "#111827", sidebar_bg: "#070f1f" },
  dark_mode: "user_choice",
  font_family: "Inter",
  radius: "md",
  logo_url: "",
  logo_dark_url: "",
  favicon_url: "",
  login: { background_url: "", welcome_title: "Welcome back", welcome_text: "Sign in to manage jobs, candidates and interviews." },
};

const CACHE_KEY = BRANDING_CACHE_KEY;
const DARK_KEY = "ats_dark_mode"; // the user's own choice (kept from the earlier toggle)
const RADIUS: Record<string, string> = { sm: "0.6", md: "1", lg: "1.4" };

/** Branding images are served by the API; their stored URLs start with /api/v1/. */
export const assetUrl = (url?: string): string => {
  if (!url) return "";
  if (url.startsWith("/api/")) {
    try {
      return new URL(BASE_URL).origin + url;
    } catch {
      return url;
    }
  }
  return url;
};

const readCache = (): Branding | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Branding) : null;
  } catch {
    return null;
  }
};

const writeCache = (b: Branding) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(b));
  } catch {
    // private window or storage blocked: the theme still applies, it just isn't remembered
  }
};

const loadedFonts = new Set<string>(["Inter"]);
function loadFont(family: string) {
  if (!family || loadedFonts.has(family)) return;
  loadedFonts.add(family);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@400;500;600;700;800&display=swap`;
  document.head.appendChild(link);
}

function setFavicon(url: string) {
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  if (url) link.href = url;
}

/** Writes a branding onto the page. Exported for the Branding screen's live preview of a scoped element. */
export function brandingVars(b: Branding): Record<string, string> {
  const vars: Record<string, string> = {
    "--light-brand": b.colors.primary,
    "--light-accent": b.colors.accent,
    "--light-sidebar-bg": b.colors.sidebar_bg,
    "--light-sidebar-text": b.colors.sidebar_text,
    "--light-bg": b.colors.background,
    "--brand-font": `"${b.font_family || "Inter"}"`,
    "--radius-scale": RADIUS[b.radius || "md"] || "1",
  };
  if (b.dark?.primary) vars["--dark-brand"] = b.dark.primary;
  if (b.dark?.background) vars["--dark-bg"] = b.dark.background;
  if (b.dark?.surface) vars["--dark-surface"] = b.dark.surface;
  if (b.dark?.sidebar_bg) vars["--dark-sidebar-bg"] = b.dark.sidebar_bg;
  return vars;
}

function applyBranding(b: Branding) {
  const root = document.documentElement;
  // Clear dark inputs first: a company without dark overrides must not keep the previous company's.
  ["--dark-brand", "--dark-bg", "--dark-surface", "--dark-sidebar-bg"].forEach((k) => root.style.removeProperty(k));
  Object.entries(brandingVars(b)).forEach(([k, v]) => root.style.setProperty(k, v));
  loadFont(b.font_family);
  document.title = b.app_name || "HireLogics";
  setFavicon(assetUrl(b.favicon_url));
}

const mergeBranding = (b: Partial<Branding> | null | undefined): Branding => ({
  ...DEFAULT_BRANDING,
  ...(b || {}),
  colors: { ...DEFAULT_BRANDING.colors, ...(b?.colors || {}) },
  dark: { ...DEFAULT_BRANDING.dark, ...(b?.dark || {}) },
  login: { ...DEFAULT_BRANDING.login, ...(b?.login || {}) },
});

interface ThemeContextValue {
  branding: Branding;
  /** Signed in: the company's branding. Otherwise the public branding of `companySlug` (or the platform). */
  refresh: (companySlug?: string | null) => Promise<void>;
  /** Show unsaved changes across the app while editing (null to stop). */
  preview: (b: Branding | null) => void;
  isDark: boolean;
  canToggleDark: boolean;
  toggleDark: () => void;
  logo: string;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding>(() => mergeBranding(readCache()));
  const [previewing, setPreviewing] = useState<Branding | null>(null);
  const [userDark, setUserDark] = useState<boolean>(() => {
    try {
      // The choice saved on the profile wins; the browser's copy covers older sessions.
      const saved = JSON.parse(localStorage.getItem("user") || "{}")?.ui_theme;
      if (saved === "dark" || saved === "light") return saved === "dark";
      return localStorage.getItem(DARK_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [systemDark, setSystemDark] = useState<boolean>(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);

  const active = previewing || branding;

  useEffect(() => {
    applyBranding(active);
  }, [active]);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const isDark = active.dark_mode === "off" ? false : active.dark_mode === "system" ? systemDark : userDark;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  const refresh = useCallback(async (companySlug?: string | null) => {
    try {
      const signedIn = !!localStorage.getItem("access_token");
      let next: Branding | null = null;
      if (signedIn && companySlug === undefined) {
        const res = await apiFetch(`${BASE_URL}/branding`);
        if (res.ok) next = (await res.json()).data?.effective;
      } else {
        const q = companySlug ? `?company=${encodeURIComponent(companySlug)}` : "";
        const res = await fetch(`${BASE_URL}/public/branding${q}`);
        if (res.ok) next = (await res.json()).data?.branding;
      }
      if (next) {
        const merged = mergeBranding(next);
        setBranding(merged);
        if (signedIn && companySlug === undefined) writeCache(merged);
      }
    } catch {
      // Offline or API down: keep the cached/default look.
    }
  }, []);

  // Signed-in pages load the company's branding once; the login and careers pages ask for their own.
  useEffect(() => {
    if (localStorage.getItem("access_token")) refresh();
  }, [refresh]);

  const toggleDark = useCallback(() => {
    setUserDark((v) => {
      const next = !v;
      try {
        localStorage.setItem(DARK_KEY, String(next));
        const user = JSON.parse(localStorage.getItem("user") || "null");
        if (user) localStorage.setItem("user", JSON.stringify({ ...user, ui_theme: next ? "dark" : "light" }));
      } catch {
        // ignore
      }
      // Save on the profile so the choice follows the user to other devices. A failure only loses that.
      apiFetch(`${BASE_URL}/users/me`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ui_theme: next ? "dark" : "light" }),
      }).catch(() => undefined);
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      branding: active,
      refresh,
      preview: setPreviewing,
      isDark,
      canToggleDark: active.dark_mode === "user_choice",
      toggleDark,
      logo: assetUrl(isDark && active.logo_dark_url ? active.logo_dark_url : active.logo_url),
    }),
    [active, refresh, isDark, toggleDark]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
