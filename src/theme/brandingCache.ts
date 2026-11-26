/** The last company branding, kept so a reload starts in the right colours. No imports: used by the API layer. */
export const BRANDING_CACHE_KEY = "branding_cache_v1";

export function clearBrandingCache() {
  try {
    localStorage.removeItem(BRANDING_CACHE_KEY);
  } catch {
    // ignore
  }
}

/** The company sign-in page to go back to after signing out (remembered across sign-outs). */
const LOGIN_COMPANY_KEY = "login_company_slug";

export function rememberLoginCompany(slug?: string | null) {
  try {
    if (slug) localStorage.setItem(LOGIN_COMPANY_KEY, slug);
  } catch {
    // ignore
  }
}

export function loginPath(): string {
  try {
    const slug = localStorage.getItem(LOGIN_COMPANY_KEY);
    return slug ? `/${encodeURIComponent(slug)}/login` : "/login";
  } catch {
    return "/login";
  }
}
