# HireLogics — Multi-tenant Job Portal: implementation plan

**Sources**
- Slack requirement from Senthil (#C0ASUUKLVMH, 21 Nov 2026).
- `hirelogics.docx`: 22 screen descriptions with 24 mockups, plus the *Software Requirements Document v1.0* (§1–15).
- Decisions agreed with Ganesan on 23 Nov 2026 (below).

**Baseline:** `staging` @ `85e3b0b`, which has: company workspaces + super admin (#69), dashboard redesign, ATS hub, scorecards (#70/#71). Stack: React 19 + Vite + Tailwind 4, FastAPI, MongoDB (Motor), separate `ai-parser` service.

---

## 0. Decisions

| # | Topic | Decision |
|---|---|---|
| 1 | Data isolation | **One shared database, `company_id` on every company-owned record** (matches SRS §6 "tenant_id on tenant-owned records"). No database per company. Enforced centrally in `app/core/tenant.py`. |
| 2 | Career URL | `/careers/<slug>` + embed script for everyone. **Each company picks** either a platform subdomain (`acme.<platform-domain>`) or its own custom domain (`careers.acme.com`) (SRS "tenant_domains"), in Phase 4. |
| 3 | Panel scoring | Average of submitted panel evaluations, or weighted average when criteria weights are configured (SRS §4.15). HR can decide with feedback missing ("2 of 3 submitted"). |
| 4 | Skill classification | **From both** resume extraction and interview ratings (and job requirements, SRS Screen 13). |
| 5 | Careers integration | Step-by-step "Add to your website" instructions inside the portal + public guide. |
| 6 | White-label scope | **Everything:** colours, logo, favicon, app name, login page, email templates, dark mode. |
| 7 | Candidates across companies | **Fully separate** per company. |
| 8 | Skill weighting | **Configurable per company**; 70% interview / 30% resume is the default. |
| 9 | Tech stack | **Keep the current stack:** FastAPI + MongoDB + React/Vite + Tailwind, with the `ai-parser` service. The SRS's Java/PostgreSQL is only a suggestion. |
| 10 | Billing | **Now:** the super admin sets plans and limits by hand (users, jobs, storage); no payments. **Later:** online payments. The plan model is built so a payment gateway can be added without changing it (§5 Phase 11). |
| 11 | Product name | **Configurable** in Platform Settings (platform name, logo, support email, domain), default "HireLogics". The code has no hard-coded "Shinelogics"; embed names are neutral. |
| 12 | Mockups | The 24 mockups in `hirelogics.docx` are the **target look**, and their style is the **default theme**. Business rules still come from the SRS text. |
| 13 | Candidate sign-in | **No candidate accounts.** The current email-code check stays for applying. |
| 14 | Calendar | **Calendar UI now** (day/week/month views of interviews). Google/Microsoft calendar sync and auto meeting links **later**. |

---

## 1. Requirement coverage: SRS module vs staging

Legend: ✅ done · 🟡 partial · ❌ missing

| SRS § | Module | Status | What exists | What's missing |
|---|---|---|---|---|
| 4.1 | Super Admin dashboard | ❌ | Company dashboard only | Platform KPIs (companies active/inactive, jobs, candidates, applications, interviews, hires), activity trend, recent companies, quick actions, platform event timeline |
| 4.2 | Tenant / company management | 🟡 | `Companies` page: create, slug, email domains, active flag, open workspace | Registration fields (logo, website, industry, description, address/country/state/city/pincode, contact person/email/phone); **4-step setup wizard with live career-page preview**; archive/delete; multiple admins; list with counts/filters/plan; side panel; disabled tenant blocks all services |
| 4.3 | Company dashboard | ✅/🟡 | Redesigned dashboard (KPIs, funnel, trends, today's interviews) | Avg. time-to-hire, date-range presets check, quick actions per SRS |
| 4.4 | Job management | 🟡 | Job openings with department, location, type, experience, description, responsibilities, required/preferred skills, qualifications, positions, open/closed | Job code (auto), category, work mode, salary range, notice period, certifications, min/max experience, **statuses Draft → Approval → Published → Closed → Archived**, approval workflow, duplicate/reopen/archive, **job templates**, **interview rounds per job**, closing date, hiring manager, notification settings, 5-step wizard with live preview |
| 4.5 | Career page builder | ❌ | Only "Careers page text" fields | Section builder (hero, about, culture, life at company, testimonials, FAQs, open positions), order/visibility, templates, banner, SEO/sharing, desktop/mobile preview, draft → publish |
| 4.6 | Public career page | 🟡 | Embeddable page, search, View Details | Branding, hero/culture/gallery/video sections, filters (department, location, experience, work mode), responsive check, approved+published only |
| 4.7 | Job detail page | 🟡 | Pop-up with role sections, `?job=<id>` share | Full page, salary/benefits, good-to-have skills, posted date, social sharing, company profile block |
| 4.8 | Candidate application | 🟡 | Email code → resume upload + "heard from" + note | **5-step wizard** (keeps the email code, no candidate account), AI pre-fill from resume, candidate edits extracted data, education/experience/skills/links/salary/notice, custom questions, consent, draft saved on the device, review & submit |
| 4.9 | Resume parsing | ✅/🟡 | `ai-parser`, structured `parsed_data`, edit modal | Extraction confidence per field, **review & approve screen** with original resume side-by-side, reprocess button, async processing everywhere |
| 4.10 | Candidate 360 | 🟡 | `CandidateDetailsModal`, `CandidateEditModal`, candidate database | Single 360° page (applications, interview scores, notes, activity), tags, recruiter assignment, **duplicate detection by normalised email/phone + merge review** |
| 4.11 | Application management | ❌ | Resume doc holds `applied_jobs`; `job_applications` holds public applies only | **Separate Candidate and Application entities** (SRS §5, §14), source, recruiter, stage, stage history with reason/comment |
| 4.12 | Pipeline (Kanban) | 🟡 | `CandidateTracker`, ATS hub, fixed statuses | Drag-and-drop Kanban per application, **configurable stages** (Applied, Screening, Shortlisted, Interview, Selected, Offer, Hired, Rejected, On Hold, Withdrawn), transition rules/permissions, conversion %, progress vs vacancies |
| 4.13 | Interview scheduling | 🟡 | Scheduling, rounds, interview types, meeting link, reschedule/cancel | Calendar UI day/week/month (now), **multiple interviewers**, telephone mode, reminders, link to application, availability; Google/Microsoft sync later |
| 4.14 | Panel management | ❌ | — | Panels, members, panel lead/roles, expertise/skill mapping, availability, assign to jobs/rounds, duplicate, active/inactive, utilisation |
| 4.15 | Evaluation & scoring | 🟡 | One feedback per interview, `skill_ratings`, `category_scores`, scorecard benchmarks | **One evaluation per panel member**, configurable criteria + weights + scale, recommendation (Next Round / Select / Hold / Reject), draft/submit, round-wise tracking, access restricted to assigned interviewers |
| 4.16 | Skill intelligence | 🟡 | `primary_skills` from parsing, skills-evaluation weightages, skills-gap card | Global + tenant **skill catalog/taxonomy**, per-skill proficiency 1–5, source, verification, confidence, Primary/Secondary engine (Decision 4/8), candidate-to-job match %, gap, heatmap, demand distribution, suggestions, export |
| 4.17 | Users & permissions | 🟡 | Roles with `permissions` list, custom roles, `RoleManagement` | **7 default roles** (Company Admin, HR Admin, Recruiter, Hiring Manager, Interviewer, HR User, Viewer), **module × action permission matrix**, departments/teams, invitations (pending), access limited to assigned jobs/departments, bulk actions |
| 4.18 | Reports & analytics | 🟡 | `AnalyticsReports`, dashboard insights | Source, recruiter productivity, department/job reports, interview analytics, custom report builder, export everywhere |
| 4.19 | Company settings | 🟡 | `Settings`, AI config, mail templates, integration API | Profile, branding (§2), workflow, duplicate detection toggle, retention policy, job-publish approval, calendar integrations, timezone, candidate registration on/off |
| 4.20 | Platform settings | ❌ | — | Platform name/URL/support, **masters** (skills/groups, job categories, industries, experience & education levels, locations), plans & limits, tenant policies, default workflow, global templates, integrations, MFA/SSO policy, system health, background jobs |
| 4.21 | Notifications | 🟡 | Some emails (verification, interview) | Full event list (ack, new application, invite/reminder/reschedule/cancel, pending evaluation, status), **in-app notifications** (bell in `TopHeader`), notification log; SMS/WhatsApp later |
| 4.22 | Audit logs | 🟡 | `AuditLog` page, ATS ops audit | Central audit service: actor, tenant, action, record, before/after; platform vs tenant logs separated; search/filter |
| §6 | Security | 🟡 | Tenant wrapper, JWT, role checks | **Signed/controlled resume URLs** (no public `/uploads`), file validation/AV scan, refresh/revocation, MFA/SSO (later), retention & deletion workflows |
| — | White-label (Decision 6) | ❌ | Hard-coded `indigo-*` in 55 files, ~175 hex values | §2 |
| §10.x | Subscriptions & billing | ❌ | — | Plans, limits (users, jobs, storage) set by the super admin, usage tracking; online payments later |

---

## 2. Cross-cutting design

### 2.1 Tenant isolation (shared DB + `company_id`)
- Keep `TenantScopedDatabase`. Every new collection is added to `TENANT_COLLECTIONS`.
- Company ID comes only from the signed-in user, or the super admin's audited workspace switch, or the slug/domain on public routes. **IDs the client sends are never trusted** (SRS §6).
- Compound indexes starting with `company_id`. Per-company unique keys use `(company_id, …)`, e.g. job code.
- A disabled or archived company: sign-in, API keys and the careers page all refuse. A super admin can still open it read-only (audited).
- CI test: every tenant collection and every list/search/report/export endpoint is checked for cross-company leaks (SRS acceptance #3).

### 2.2 New data model (Mongo collections)
Mapped from SRS §9. **Bold** = new.

| Collection | Notes |
|---|---|
| `companies` | + profile fields, `branding`, `plan_id`, `limits`, `status: active/inactive/archived` |
| **`company_domains`** | slug; `type: subdomain \| custom`; host; verification token + status; TLS status |
| **`plans`**, **`subscriptions`**, **`usage`** | platform-level. `subscriptions` has `billing_mode: manual \| gateway` (manual for now), `period_start/end`, `status`; fields for gateway customer/subscription IDs are kept empty until payments arrive |
| **`platform_settings`** | platform name, logo, favicon, support email, main domain, default branding (single document) |
| **`masters`** | type = skill / skill_group / job_category / industry / location / education_level / experience_level; `company_id = null` = global, else tenant-specific |
| `users`, `roles` | roles get `permissions: {module: [actions]}`; + **`departments`**, **`invitations`** |
| `job_openings` | + code, category, work_mode, salary, min/max exp, status workflow, `primary_skills`/`secondary_skills`, `rounds[]`, hiring_manager_id, closing_date; **`job_templates`** |
| **`candidates`** | the person (contact, parsed profile, skills, tags, notes); split out of `resumes` |
| **`candidate_documents`** | resume files + parse results/confidence (current `resumes` becomes this) |
| **`applications`** | one per candidate × job: stage, source, recruiter, timestamps |
| **`application_history`** | every stage change with actor, reason, comment |
| **`workflows`** | stages per company (and per job override), transition rules |
| `interviews` | + `application_id`, `panel[]`, mode (online/phone/in-person) |
| **`interview_panels`** | members, lead, expertise, availability, assigned jobs/rounds |
| **`evaluation_forms`**, **`interview_evaluations`** | criteria + weights + scale; one evaluation per member |
| **`candidate_skills`** | skill, proficiency, source (resume/interview/HR), verified, confidence, class (primary/secondary) |
| **`career_pages`** | sections JSON, template, SEO, draft/published versions |
| **`notifications`**, **`notification_logs`** | in-app + email delivery history |
| **`audit_logs`** | platform and tenant, separated by `company_id` |

**Migration:** split each `resumes` doc into a `candidate` (deduplicated by normalised email/phone within its company), a `candidate_document`, and one `application` per `applied_jobs` entry. Keep the old read paths working for one release, run a dry-run report on a copy first (like `scripts/migrate_tenancy.py`), and check counts.

### 2.3 Roles & permissions
- Permission matrix: modules (Dashboard, Jobs, Candidates, Applications, Pipeline, Interviews, Evaluations, Skills, Career Page, Reports, Users, Settings) × actions (view, create, edit, delete, publish/approve, export).
- Seeded per company: Company Admin, HR Admin, Recruiter, Hiring Manager, Interviewer, HR User, Viewer. Custom roles cloned from these.
- Scope limits: "assigned jobs only" / "my department only" (Hiring Manager, Interviewer).
- Backend: `require_permission("jobs", "publish")` dependency; the frontend hides what you can't use, but **the backend decides**.

### 2.4 Files & security
- Move resumes and documents out of public static serving into private storage (S3-compatible or a private folder), at `/<company_id>/…`. Access through **short-lived signed URLs** after a permission check.
- Upload checks: type sniffing, size limits from plan, optional antivirus scan.
- Refresh token + revocation list; MFA (TOTP) and SSO (OIDC) behind a company setting (SRS: phase-based).
- Retention: per-company policy (e.g. delete rejected candidates after N months), candidate deletion request workflow.

---

## 3. White-labelling (colours, logo, app name, login, email, dark mode)

### 3.1 Data
`companies.branding`:
```py
class CompanyBranding(BaseModel):
    primary: str = "#6366f1"; primary_hover: str = "#4f46e5"; accent: str = "#0284c7"
    background: str = "#f8fafc"; surface: str = "#ffffff"
    sidebar_bg: str = "#ffffff"; sidebar_text: str = "#0f172a"
    dark: DarkPalette               # generated from light by default, editable
    dark_mode: Literal["off", "user_choice", "system"] = "user_choice"
    font_family: str = "Inter"; radius: Literal["sm", "md", "lg"] = "md"
    logo_url: str | None; logo_dark_url: str | None; favicon_url: str | None
    app_name: str | None            # company's name for the app; falls back to platform name
    login: LoginBranding            # background image, welcome text
    email: EmailBranding            # from_name, reply_to, footer, optional SMTP
```
APIs: `GET/PUT /company/settings/branding`, `GET /public/branding?company=<slug>` (no login). Uploads are validated, and colour contrast is checked against WCAG AA (warning only).

**Three levels of branding:** the platform default (Platform Settings: name, logo, colours, default "HireLogics"), then the company's branding, then each user's light/dark choice. Anything a company leaves empty uses the platform default. The **default theme follows the HireLogics mockups**: colours, spacing, card and table styles, and sidebar layout are taken from the 24 screens at the start of Phase 2.

### 3.2 Theme tokens (main app)
1. `src/index.css`: tokens `--brand-50…900`, `--accent-*`, `--surface`, `--surface-muted`, `--text-main`, `--text-muted`, `--border`, `--sidebar-*`, `--radius`, each defined for `[data-theme="light"]` and `[data-theme="dark"]`. Shades come from one colour with `color-mix(in oklch, …)`.
2. **Codemod** across 55 files: `indigo-*` → `brand-*`, and `bg-white`/`bg-slate-50`/`text-slate-900`/`border-slate-200` → `bg-surface`/`bg-surface-muted`/`text-main`/`border-line`. The ~175 hex values are fixed by hand (charts, Quill, inline styles). Status colours (emerald/red/amber) keep their meaning but get dark variants.
3. `ThemeProvider` loads branding after login and on workspace switch, sets `:root` variables and `data-theme`, swaps logo/title/favicon, and caches to avoid a flash of default colours.
4. Recharts and Quill read the CSS variables.
5. CI check blocks new `indigo-` classes and raw hex values in `src/`.

### 3.3 Dark mode
Company setting `off | user_choice | system`. A toggle in `TopHeader` saves each user's choice on their profile. Modals, charts, editor and careers page all follow it.

### 3.4 Login page
`/<slug>/login` (or the company's domain) shows the company's logo, colours, background and welcome text. Only that company's users can sign in there (super admin excepted). Password reset and session-expired screens use the same branding.

### 3.5 Email
A per-company email layout (logo header, brand buttons, footer). Sender name and reply-to per company, with an optional own SMTP/sending domain (SPF/DKIM guide). Variables: `{{company.*}}`, `{{brand.*}}`. It applies to every notification in SRS §4.21. Includes preview and "Send test email".

### 3.6 Settings → Branding
Sections: Colours (light/dark), Logo & favicon, App name, Login page, Emails, Careers page. Live preview, reset to default. Also appears as Step 3 of the Create Company wizard (SRS Screen 3).

---

## 4. Careers page integration ("Add to your website")

On **Career Page → Add to your website**, the code is pre-filled with the company's slug/domain and API, with **Copy** buttons and a live preview:

| Method | For | How |
|---|---|---|
| 1. Link | No developer | Menu item → `https://<portal>/careers/<slug>` or `https://careers.<company>.com` |
| 2. Embed script (recommended) | Sites that accept HTML | `<div data-shinelogics-careers data-company="<slug>" data-api="https://<api>/api/v1" data-header="false"></div>` + `<script src="https://<api>/static/careers/v1/careers.js"></script>` |
| 3. JS mount | React/Angular/Vue | `window.ShinelogicsCareers.mount(el, { company, apiBaseUrl, showHeader:false })`, `unmount()` on leave |
| 4a. Platform subdomain | Companies without their own domain | One click: `acme.<platform-domain>`, covered by our wildcard certificate, nothing to set up |
| 4b. Custom domain | Companies with their own domain | Add CNAME `careers.acme.com → <platform>` + TXT record for verification; portal checks DNS, then issues a TLS certificate automatically (e.g. Caddy on-demand TLS / Let's Encrypt). Status shown: Pending DNS → Verified → Live |
| 5. Single file | Static hosting | Download `careers.html`, link `careers.html?company=<slug>` |

- Platform steps with screenshots for WordPress (Custom HTML block), Wix (Embed HTML), Squarespace, Webflow, plain HTML.
- Options in plain words (`data-header`, `data-footer`, `data-manage-title`, `data-primary`); single-role links `?job=<id>`.
- Troubleshooting: wrong slug, page turned off, CSP (`script-src`, `connect-src`), fixed-height embed boxes.
- **Test my integration**: the portal shows "Connected — seen on https://acme.com at 10:42" from the first public request's `Origin`.
- Public guide at `/careers/integrate` for the company's web agency. The script is served versioned from the API host (no CDN needed).
- The embed is renamed for white-labelling (`data-careers`, `window.CareersWidget`). The old names keep working.

---

## 5. Phased delivery

Follows SRS §11/§13 order, starting from what is already built. Estimates are for one full-stack developer. Phases in the same row group can run in parallel with a second developer.

| Phase | Scope (SRS refs) | Est. |
|---|---|---|
| **1. Foundation** | Tenant hardening (§2.1); company profile fields + 4-step **Create Company wizard**; archive/disable rules; multiple admins; **7 default roles + permission matrix + departments + invitations** (§2.3); **masters** (global + tenant); central **audit log** service; private file storage + signed URLs (§2.4) | 3 wk |
| **2. White-label** | §3 complete: tokens + codemod, ThemeProvider, dark mode, branded login, email layout, Branding settings | 2–2.5 wk |
| **3. Jobs** | Job wizard (5 steps, live preview), job code, statuses + approval workflow, primary/secondary skills, salary/notice/certifications, interview rounds per job, duplicate/reopen/archive, job templates, job list KPIs/filters/side panel | 1.5–2 wk |
| **4. Career page** | Builder (sections, order, visibility, templates, banner, SEO, desktop/mobile preview, draft/publish); public page + filters + job detail page + sharing; **platform subdomain or custom domain, the company's choice** (wildcard cert + automatic TLS, host → company lookup); **integration guide** (§4) | 3 wk |
| **5. Applications** | ~~Candidate/Application split + migration~~ → moved to Phase 6 (see note below); 5-step application wizard with AI pre-fill and candidate review of extracted data, **keeping the email-code check (no candidate accounts)**, consent, draft kept on the candidate's device; resume review & approve screen with confidence + reprocess | 2.5 wk |
| **6. Candidate management** | Candidate list (columns, AI search, filters, bulk actions, export), Candidate 360 page, notes, tags, recruiter assignment, duplicate detection + merge review | 2 wk |
| **7. Pipeline** | Configurable workflows/stages + transition rules, Kanban drag-and-drop, stage history with reasons, conversion %, progress vs vacancies | 1.5 wk |
| **8. Interviews** | **Calendar UI** (day/week/month, drag to reschedule, filter by panel/job/interviewer, colour by round), multi-interviewer scheduling, modes, invites with `.ics` attachment, reminders; **panel management**; **evaluation forms** (criteria, weights, scale), per-member evaluations, recommendations, draft/submit, round-wise scores. Google/Microsoft sync is **not** in this phase | 3 wk |
| **9. Skill intelligence** | Skill catalog/taxonomy, `candidate_skills` (proficiency, source, verification, confidence), **Primary/Secondary engine** (below), job match %, gap, heatmap, demand, suggestions, export | 2 wk |
| **10. Analytics** | Super Admin dashboard; company reports (source, recruiter, department, job, interview); custom report builder; exports | 2 wk |
| **11. SaaS & operations** | Plans & limits set by the super admin (users, jobs, storage, AI parses), checked on every create/upload with "limit reached" messages, usage meters, plan change history; platform settings (name, logo, domain, default branding); in-app notifications + notification log; MFA/SSO; retention workflows; system health & background jobs screen; monitoring, backups | 2.5 wk |
| **12. Hardening & rollout** | Security review, isolation & permission test suite (SRS §14), performance, staging migration rehearsal, production; all 3 deploy workflows green | 1 wk |

**Total: about 26–29 weeks for one developer, or about 14–16 weeks with two developers** (frontend-heavy work like Phases 2, 4 and 10 runs alongside backend-heavy work like Phases 1, 5 and 8).

### Primary / Secondary skill engine (Phase 9)
- **Inputs per skill:** resume score 0–5 (listed, years, recency), interview score 0–5 (average panel rating, number of raters), and whether the job lists it as primary or secondary.
- **Formula:** `final = W_interview × interview + W_resume × resume`. If not interviewed yet, it uses the resume only and is marked "not verified".
- **Classes:** Primary if `final ≥ T_primary`, Secondary if `final ≥ T_secondary`.
- **Settings → Skill classification** (per company):

  | Setting | Default |
  |---|---|
  | Interview / resume weight (always 100%) | 70 / 30 |
  | Primary / secondary threshold | 4.0 / 3.0 |
  | Minimum raters | 1 |
  | Use resume-only skills | On |
  | "Claimed, not shown" gap | 2.0 |
  | Weight per round type | optional |

  Changing a setting shows a preview of how many candidates would change class, then recomputes in the background.
- HR can verify or override (who/when recorded). All scores are **advisory and explainable** (SRS §4.16, §5): the UI shows where each number came from. No automatic rejection.

### Mapping to SRS acceptance criteria (§12)
| Criterion | Phase |
|---|---|
| Tenant creation, admin login, no cross-tenant access, invite + roles | 1 |
| Create/edit/publish/close jobs | 3 |
| Published jobs on career page | 4 |
| Apply + upload; parsing creates editable profile | 5 |
| Candidate profiles, manage applications | 6 |
| Stage changes recorded in history | 7 |
| Schedule interviews, assign interviewers, submit evaluations | 8 |
| Skills reviewed and classified | 9 |
| Tenant-scoped reports | 10 |
| Audit logs | 1 (+ every phase) |
| Platform settings and masters | 1 + 11 |

---

**Phase 5 as built (24 Nov 2026):**
- **Applications:** they stay in `job_applications` (one per candidate × job) and are now full records: stage, source, everything the candidate entered, what the AI read (in the same shape) with a confidence score, the consent record (text, version, time, IP), review status and history.
- **Resume reading:** the resume goes to the AI parser as soon as it is uploaded (step 1), and the form fills in while the candidate types. On submit the profile is built from that same parser job, so the resume is not parsed twice.
- **Repeat applications:** if the same resume is already on file at the company, the new application is linked to that profile instead of failing.
- **Not split yet:** the candidate profile is still the `resumes` record. The separate `candidates` / `candidate_documents` collections and the migration move to Phase 6, because every candidate screen reads `resumes` and Phase 6 rebuilds those screens. Splitting in Phase 5 would mean changing every screen twice.
- **Confidence:** the parser gives no confidence scores, so "confidence" is the share of the usual details it found, plus a check that the resume's email matches the verified one.

## 6. Later (agreed, not in Phases 1–12)
- **Online payments:** payment gateway (Razorpay/Stripe), invoices, GST, self-serve plan upgrades. Plugs into `subscriptions.billing_mode = gateway`.
- **Calendar sync:** Google Calendar / Microsoft 365 two-way sync, interviewer free/busy, auto Meet/Teams links.
- **SMS / WhatsApp notifications** (SRS §4.21).

## 7. Open questions
None. All answered on 23 Nov 2026 (see §0).

## 8. Mockup coverage (data behind each screen)

The SRS has 24 mockup images. Every screen must be buildable from the API, so each one was checked against the
stored fields and endpoints (23 Nov 2026). ✅ = the API has what the screen shows; the phase column says where
the rest comes from.

**UI matched to the mockups (Phases 1–4):**
- menu with sub-menus, role badge and company switcher;
- top bar with Ctrl+K search, help, and the user's name and role;
- breadcrumbs;
- Companies list and details panel;
- Create Company page with live preview;
- Plans & Billing;
- Job Openings list and panel;
- Create / Edit Job Opening page;
- Career Page Builder;
- public careers page and job page;
- Company Settings & Tenant Configuration;
- Users summary cards.

Still to do: the Super Admin and Company dashboards (Phase 10), Platform Settings as one page (Phase 11), and a Users table restyle.

| Mockup | Data the API gives | Comes later |
|---|---|---|
| Super Admin dashboard | Companies, jobs, candidates, interviews per company (`/companies?all=true`), audit timeline | Trends with % change, activity chart, funnel → Phase 10 |
| Companies list + details panel | ✅ Filters, plan, status, counts; `GET /companies/{id}/summary` (admins, counts, careers URL, recent activity); `GET /companies/export` | Import companies (not planned); hires count → Phase 7 |
| Create company (4 steps) | ✅ Short name, company type, profile, contact, address, slug, admin, plan + valid until, limits, branding | – |
| Company dashboard | Existing dashboard endpoints | Avg. time to hire, funnel by stage → Phases 7 and 10 |
| Job list + job panel | ✅ `GET /job-openings/stats`, `/export`, `/import` (+ `/import/template`), per-job applications / interviews / selected, history | Screened / shortlisted counts and avg. time to hire → Phase 7 |
| Create job opening | ✅ All fields incl. salary period, tagline, requirements, good to have, rounds with durations, deadline, hiring manager, notify emails | – |
| Career page builder | ✅ Sections (incl. new highlights strip), icons on items, About stats / photo / video, header button, second hero button, badge text, split hero, templates, SEO, brand colours (primary, secondary, accent, text, background), page status and URL | Tablet preview and template thumbnails are UI only |
| Public careers page | ✅ All of the above | Language switch → later (§6) |
| Job detail page | ✅ Job ID, posted on, tagline, requirements, good to have, what we offer, skills, About with stats and video, closing banner text | – |
| Application form | ✅ 5-step form (Phase 5): email code, resume upload with AI pre-fill and summary, education, experience, skills, review, consent, draft on device; staff Applications review screen | – |
| Candidates, profile 360°, pipeline, interviews, panels, evaluation, skill matrix | – | Phases 6–9 |
| Users & role permissions | ✅ `GET /users/stats` (totals, pending invites, by role, by department), roles with `users_count`, user phone / photo / last sign-in, permission matrix, audit log | Teams; access policies → Phase 12 |
| Reports & analytics | – | Phase 10 |
| Company settings & tenant configuration | ✅ Profile, branding, `tenant_settings` (resume parsing, duplicate check, multi-department, calendar scheduling, candidate registration, data retention), timezone, job approval | Email templates per company, integrations → Phase 11 |
| Platform settings | ✅ Platform name / URL / support email, default timezone and language, allowed resume types, plan catalogue (`/platform/plans`), masters, default branding | Default workflow → Phase 7; MFA / SSO → Phase 12; integrations → Phase 11; revenue → after payments (§6) |

Switches that are stored now but act in a later phase: `tenant_settings.calendar_scheduling` (calendar sync, §6),
`duplicate_check` (Phase 6), `data_retention_months` (Phase 12 clean-up job). The UI should say so next to them.
