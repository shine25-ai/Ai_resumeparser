# Phase 12: hardening and rollout

This covers the six Phase 12 items:

- **Done in code:** isolation suite, permission suite, security review, performance.
- **Written for the team to run:** staging rehearsal, release checklist.

Nothing here has been deployed. Staging gets this with PR #72 when the team decides.

## 1. Company isolation suite

**File:** `server-backend/tests/test_isolation_suite.py`, using the harness in `tests/phase12_harness.py`.

**How it works:**
- The real app runs on an in-memory database with two companies, A and B.
- Each company has one document in every company collection (all 38). B's documents carry the marker `ZZLEAKB`.
- Requests use real sign-in tokens, so every request goes through the real company scope and permission checks.
- The route list is read from the app itself: **275 routes**. A new endpoint is covered as soon as it exists.

**Checks:** as company A's admin, every route is called with no IDs and with each of B's IDs.

| Check | Result |
|---|---|
| No response to A contains B's data | pass, after one fix (below) |
| Nothing A does changes B's data | pass |
| B's IDs answer exactly like IDs that don't exist (same status, same body) | pass |
| Every list, report and export answers A the same with or without B's data, so counts don't leak | pass (73 routes compared) |
| No route fails on the seeded data, so the checks really ran | pass, apart from 3 routes the in-memory database can't run (listed in the test, with reasons) |

**Found and fixed:**
- `PATCH /notifications/{id}/read` looked the notification up in system scope and returned it.
- So any signed-in user could read any notification by ID, including another company's.
- It now only finds the caller's own notifications. Anything else is "not found".

## 2. Permission suite

**File:** `server-backend/tests/test_permission_suite.py`.

**How it works:**
- Every route is classified, or the suite fails:
  - it checks a permission in its dependencies (`require_access`, `require_can`, company admin, super admin), or
  - it is listed as **public** (sign-in, careers site, invitations, signed file links, integration API with its own key), or
  - it is listed as **self-service** (own account, own notifications, branding, role names, staff directory), or
  - it is listed as **checked in the handler** (companies, platform operations).
- Public routes work without signing in. Every other route answers **401** without a token.
- Each default role is tested with `PERMISSIONS_MODE=enforce`. The roles are admin, HR admin, HR user, recruiter, hiring manager, interviewer and viewer.
  - Each one calls every route in its own company.
  - A route its permissions deny answers **403**. A route they allow never answers 403.
  - The one exception is saving your own evaluation: it is allowed by role, then limited to interviewers assigned to that interview.
- **Reviewed snapshot:** `tests/snapshots/route_permissions.json` records who may use each of the 275 routes. Any change, or any new route, shows as a diff in the pull request and fails the test until the snapshot is regenerated:

  ```
  UPDATE_PERMISSION_SNAPSHOT=1 pytest tests/test_permission_suite.py
  ```

**Found and fixed:** any signed-in user, including viewers, could:
- **send test emails through the company's mail server** (`POST /settings/email/test`). This now needs a company admin, the same rule as saving the mail settings.
- read the mail and AI settings and the AI usage (`GET /settings/email`, `/settings/ai`, `/settings/ai/usage`). These now need `settings:view`, which recruiters and HR users have. Secrets were never returned; only "is set" flags.

**Reviewed and kept:** the staff directory (`GET /users`) stays open to all staff.
- The interviewer, hiring manager and panel pickers use it.
- It contains no passwords, MFA secrets or tokens. This was checked with seeded secrets.

**Still to do on staging:** set `PERMISSIONS_MODE=enforce` (it is `warn` by default). This is the last step of the checklist below.

## 3. Security review

| Area | Finding | Status |
|---|---|---|
| File links | Signed and expiring: 60 minutes by default, redirect to a short-lived S3 link | OK, no change |
| Uploads | Size and extension only, so a renamed file passed as `.pdf` | **Fixed:** content must match (PDF, `.docx` ZIP holding `word/`, `.doc` OLE2) |
| Rate limits | Sign-in had none, so passwords could be guessed without limit. Public applicant endpoints had none per IP | **Fixed:** limits on sign-in (10 per account and 50 per IP per 15 minutes), registration, applicant code request and confirm, resume upload, application submit, invitation accept. Counters are in MongoDB (shared by workers, cleared by a TTL index); emails are stored hashed. Answers 429 with `Retry-After`. Turn off with `RATE_LIMITS_ENABLED=false` |
| Errors | Every 500 response included the exception text | **Fixed:** "Something went wrong… Reference: abc123". The full trace is in the log under that reference |
| Secrets in the repo | None found (only a fake URI in a test). `.env` files are not tracked | OK |
| `SECRET_KEY` | The default is published in `config.py`. A server without its own key would let anyone sign tokens for any user | **Fixed:** the server refuses to start on a non-local database with the default key. **Check the staging and production `.env` before deploying.** Changing the key signs everyone out once; stored passwords use `ENCRYPTION_KEY` and are not affected |
| CORS | Any origin, with credentials allowed | **Fixed:** credentials off. The app uses bearer tokens, never cookies |
| Security headers | None | **Fixed:** on `/api` responses: `nosniff`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `Referrer-Policy`, `Cache-Control: no-store` (signed-in routes), and HSTS on HTTPS |
| Client IP | The consent record took the IP from `X-Forwarded-For`, which anyone can forge | **Fixed:** uses the address uvicorn resolves, which only trusts a local proxy |
| Bell and Phase 11 screens | (fixed earlier in PR #76) relative API paths | Done |
| Python packages (OSV) | PyJWT 2.13: 29 advisories, mostly JWK and public-key modes the app doesn't use; it does use the token parser. cryptography 49: PKCS#7 advisory (not used). black: dev tool | **Fixed:** `pyjwt>=2.15.0`, `cryptography>=50.0.0`, `black>=26.10.1`. All tests pass on 2.15.1 / 50.0.2. One PyJWT advisory (GHSA-gvp8-978c-rx2q) has no fix yet; the app passes no options dict to `decode` |
| npm packages | 9 production advisories (5 high) | **Fixed 5** with non-breaking lockfile updates (react-router, nanoid, postcss, source-map-js); clean install and build pass. **Left:** vite/esbuild (local dev server only, needs Vite 8), Quill XSS in HTML export (low, and its HTML is never rendered raw) |

## 4. Performance

**Method:**
- `scripts/perf_seed.py` seeds a local database: 50 companies × 2,000 candidates.
  - That's 100,000 candidates, 100,000 resumes, 75,000 applications, 20,000 interviews, 500,000 skill records and 25,000 audit entries.
- `scripts/perf_measure.py` times every list endpoint and the main detail pages as one company's admin. It runs through the real app, median of 3 runs.
- Both scripts refuse non-local databases.

| Endpoint | Before | After code fixes | With indexes |
|---|---:|---:|---:|
| `/skills/matrix` | 4,030 ms | 179 ms | 16 ms |
| `/resumes?search=Java` | 638 ms | 639 ms | 89 ms |
| `/pipeline/kanban` | 291 ms | 295 ms | 56 ms |
| `/applications?q=…` | 231 ms | 230 ms | 22 ms |
| `/pipeline/kanban?job_id=…` | 218 ms | 220 ms | 36 ms |
| `/resumes/match` | 199 ms | 197 ms | 13 ms |
| `/resumes` | 194 ms | 194 ms | 35 ms |
| `/applications` | 145 ms | 147 ms | 8 ms |
| `/candidates/summary-stats` | 128 ms | 123 ms | 30 ms |
| `/candidates` | 115 ms | 110 ms | 7 ms |
| `/skills/candidate/{id}` | **500 error** | 88 ms | 3 ms |
| `/candidates?search=…` | 114 ms | 111 ms | 6 ms |
| `/candidates/{id}` | 80 ms | 78 ms | 16 ms |
| `/candidates/duplicates` | 49 ms | 51 ms | 16 ms |
| `/resumes/parsed-summary` | 47 ms | 49 ms | 5 ms |
| `/job-openings` | 44 ms | 45 ms | 21 ms |
| `/job-openings/applications` | 42 ms | 41 ms | 9 ms |
| `/job-openings/{id}` | 40 ms | 44 ms | 15 ms |
| `/ats/duplicates` | 30 ms | 30 ms | 9 ms |
| `/job-openings/stats` | 28 ms | 28 ms | 15 ms |

The slowest 20 together went from **6.9 s to 0.6 s**.

**Code fixes:**
- **Candidate skills route:** it returned MongoDB's `ObjectId`, which can't be sent as JSON. The route **failed on every real database**; the in-memory test database hid it.
- **Skill matrix:** it ran one query per candidate (50). It now runs one query for all of them.

**Indexes:**
- `app/core/indexes.py` creates 40 indexes at startup. It's safe to run every time.
- Company collections lead with `company_id`, followed by the fields lists sort and filter on.
- It adds the rate-limit TTL index.
- On the seeded data, building them took 8 s.

## 5. Staging rehearsal (for the team, not run)

Rehearse on a **copy**, never on production directly. Record the counts and timings in this section.

1. **Back up** production:
   ```
   mongodump --uri "$ATLAS_URL" --db resumeparser --out ./backup-$(date +%F)
   ```
   Keep the backup until the release is signed off.
2. **Copy to a local database:**
   ```
   mongorestore --uri mongodb://localhost:27017 --nsFrom 'resumeparser.*' --nsTo 'rp_rehearsal.*' --drop ./backup-…
   ```
3. **Dry runs on the copy.** Read each report:
   ```
   python scripts/migrate_tenancy.py --db rp_rehearsal
   python scripts/migrate_candidates.py --db rp_rehearsal
   python scripts/migrate_scorecards.py --db rp_rehearsal
   ```
4. **Apply on the copy.** Run each script again with `--apply` (tenancy applies by default; read its report). Then:
   - start the backend against `rp_rehearsal`, which creates the indexes and runs the startup migration;
   - compare document counts per company before and after;
   - run each script a second time and confirm it reports nothing new.
5. **Staging:** repeat steps 3–4 against the staging database with `--allow-remote`.
6. **Rollback:**
   - Stop the backend.
   - `mongorestore --drop` the backup into the database.
   - Redeploy the previous commit.
   - Every user signs in again.
   - Restoring the backup undoes every migration, whatever it changed.

| Step | Database | Counts before / after | Time | Who | When |
|---|---|---|---|---|---|
| Tenancy dry run | | | | | |
| Candidates dry run | | | | | |
| Scorecards dry run | | | | | |
| Apply on the copy | | | | | |
| Re-run shows nothing new | | | | | |
| Staging apply | | | | | |

## 6. Release checklist

| ✓ | Item | Who | When |
|---|---|---|---|
| ☐ | Production backup taken and its size checked | | |
| ☐ | **`SECRET_KEY` and `ENCRYPTION_KEY` set** in the staging and production `.env` (the server now refuses to start without its own `SECRET_KEY`) | | |
| ☐ | `pip install -r requirements.txt` on the server picks up `pyjwt>=2.15`, `cryptography>=50`, `segno`, `boto3` | | |
| ☐ | Migrations rehearsed (section 5) and applied | | |
| ☐ | Backend started: log shows "Ensured 40 database indexes" | | |
| ☐ | `backend-tests` workflow green on the PR | | |
| ☐ | All 3 deploy workflows green (frontend, backend, agent) | | |
| ☐ | Smoke test per screen as an admin: dashboard, jobs, careers page and apply, applications, candidates and 360, pipeline, interviews (calendar, panels, evaluations), skills, reports, settings, users | | |
| ☐ | Smoke test as a viewer: settings hidden, no edit buttons, 403 on writes | | |
| ☐ | Super admin: MFA setup at sign-in, companies, plans, platform settings, health | | |
| ☐ | `PERMISSIONS_MODE=enforce` on staging, then the viewer and recruiter smoke tests again | | |
| ☐ | Monitoring watched for 24 hours: 5xx rate, 429s on sign-in, slow requests | | |

## CI

`.github/workflows/backend-tests.yml` runs the whole backend suite on every pull request, with a MongoDB service for the older tests. The isolation, permission and security suites run first, as their own step.
