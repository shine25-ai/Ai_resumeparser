import { BASE_URL, apiFetch } from "./Api";
import { readJson } from "../careers/api";
import type { Branding } from "../theme/ThemeProvider";

// ── Invitations ──────────────────────────────────────────────────────────────

export interface Invitation {
  id: string;
  email: string;
  full_name: string;
  role: string;
  department: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  invited_by?: { id?: string; name?: string };
  created_at: string;
  expires_at: string;
  accepted_at?: string;
  /** Only when the email could not be sent: share this link yourself. */
  invite_link?: string | null;
  email_sent?: boolean;
}

const INVITES = `${BASE_URL}/invitations`;
const json = (body: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const fetchInvitations = async (): Promise<Invitation[]> => readJson(await apiFetch(INVITES));

export const inviteUser = async (payload: { email: string; full_name: string; role: string; department: string }): Promise<Invitation> =>
  readJson(await apiFetch(INVITES, { method: "POST", ...json({ ...payload, app_url: window.location.origin }) }));

export const resendInvitation = async (id: string): Promise<Invitation> =>
  readJson(await apiFetch(`${INVITES}/${id}/resend`, { method: "POST" }));

export const cancelInvitation = async (id: string): Promise<Invitation> =>
  readJson(await apiFetch(`${INVITES}/${id}`, { method: "DELETE" }));

// Public: no login
export interface InvitationInfo {
  email: string;
  full_name: string;
  role: string;
  department: string;
  company_name: string;
  company_logo_url: string;
  expires_at: string;
}

export const lookupInvitation = async (token: string): Promise<InvitationInfo> =>
  readJson(await fetch(`${BASE_URL}/public/invitations/${encodeURIComponent(token)}`));

export const acceptInvitation = async (token: string, full_name: string, password: string): Promise<{ email: string; company_name: string }> =>
  readJson(await fetch(`${BASE_URL}/public/invitations/${encodeURIComponent(token)}/accept`, { method: "POST", ...json({ full_name, password }) }));

// ── Master data ──────────────────────────────────────────────────────────────

export interface MasterType {
  id: string;
  label: string;
  company_only: boolean;
}

export interface MasterEntry {
  id: string;
  type: string;
  name: string;
  parent: string;
  is_active: boolean;
  is_global: boolean;
}

const MASTERS = `${BASE_URL}/masters`;
type Scope = "company" | "platform";

export const fetchMasterTypes = async (): Promise<MasterType[]> => readJson(await apiFetch(`${MASTERS}/types`));

export const fetchMasters = async (type: string, scope: Scope = "company", includeInactive = false): Promise<MasterEntry[]> =>
  readJson(await apiFetch(`${MASTERS}?type=${encodeURIComponent(type)}&scope=${scope}${includeInactive ? "&include_inactive=true" : ""}`));

export const createMaster = async (type: string, name: string, scope: Scope = "company", parent = ""): Promise<MasterEntry> =>
  readJson(await apiFetch(`${MASTERS}?scope=${scope}`, { method: "POST", ...json({ type, name, parent }) }));

export const updateMaster = async (id: string, changes: Partial<Pick<MasterEntry, "name" | "parent" | "is_active">>, scope: Scope = "company"): Promise<MasterEntry> =>
  readJson(await apiFetch(`${MASTERS}/${id}?scope=${scope}`, { method: "PATCH", ...json(changes) }));

// ── Audit log ────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  entity_label: string;
  changes: Record<string, { from?: unknown; to?: unknown }>;
  details: string;
  actor: { id: string; name: string; email: string; role: string };
  target_company_id?: string | null;
  ip: string;
  created_at: string;
}

export interface AuditFilters {
  action?: string;
  actor?: string;
  entity_type?: string;
  start?: string;
  end?: string;
  search?: string;
  scope?: Scope;
}

const AUDIT = `${BASE_URL}/audit-logs`;
const query = (f: AuditFilters, extra: Record<string, string | number> = {}) =>
  new URLSearchParams(
    Object.entries({ ...f, ...extra })
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => [k, String(v)])
  ).toString();

export const fetchAuditLogs = async (f: AuditFilters, page = 1, limit = 50): Promise<{ items: AuditEntry[]; total: number; page: number; limit: number }> =>
  readJson(await apiFetch(`${AUDIT}?${query(f, { page, limit })}`));

/** Downloads the filtered log as CSV (the request needs the sign-in token, so it can't be a plain link). */
export const downloadAuditCsv = async (f: AuditFilters): Promise<void> => {
  const res = await apiFetch(`${AUDIT}/export?${query(f)}`);
  if (!res.ok) await readJson(res);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = "audit-log.csv";
  a.click();
  URL.revokeObjectURL(url);
};

// ── Branding ─────────────────────────────────────────────────────────────────


export type BrandingChanges = Partial<Omit<Branding, "colors" | "dark" | "login" | "email">> & {
  colors?: Partial<Branding["colors"]>;
  dark?: Partial<Branding["dark"]>;
  login?: Partial<Branding["login"]>;
  email?: Partial<NonNullable<Branding["email"]>>;
};

export interface BrandingData {
  effective: Branding;
  company: BrandingChanges;
  defaults: Branding;
  warnings: { check: string; ratio: number; needed: number }[];
  platform_name: string;
  company_name: string;
  company_slug: string;
}

export interface PlatformSettings {
  platform_name: string;
  support_email: string;
  platform_url: string;
  branding: BrandingChanges;
}

const BRANDING = `${BASE_URL}/branding`;

export const fetchBranding = async (): Promise<BrandingData> => readJson(await apiFetch(BRANDING));

export const saveBranding = async (changes: BrandingChanges): Promise<BrandingData> =>
  readJson(await apiFetch(BRANDING, { method: "PUT", ...json(changes) }));

export const resetBranding = async (): Promise<BrandingData> => readJson(await apiFetch(BRANDING, { method: "DELETE" }));

export const uploadBrandingImage = async (
  kind: "logo" | "logo_dark" | "favicon" | "login_background",
  file: File,
  scope: "company" | "platform" = "company"
): Promise<{ id: string; url: string }> => {
  const form = new FormData();
  form.append("kind", kind);
  form.append("file", file);
  return readJson(await apiFetch(`${BRANDING}/assets?scope=${scope}`, { method: "POST", body: form }));
};

export const fetchPlatformSettings = async (): Promise<PlatformSettings> => readJson(await apiFetch(`${BASE_URL}/platform/settings`));

export const savePlatformSettings = async (changes: Partial<PlatformSettings>): Promise<PlatformSettings> =>
  readJson(await apiFetch(`${BASE_URL}/platform/settings`, { method: "PUT", ...json(changes) }));
