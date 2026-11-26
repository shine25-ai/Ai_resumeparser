import re
import asyncio
import time
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone, timedelta
from loguru import logger

from app.utils.hiring_stage import STAGES, stage_of, verdict_of
from app.core.tenant import TenantScopeError, current_company_id, in_system_scope
from app.core.database import get_database
from app.utils.constants import RESUMES_COLLECTION, INTERVIEWS_COLLECTION, RESUME_LOGS_COLLECTION
from app.utils.enums import InterviewStatus

# Specialization categories for the Domain Specialization chart. Each entry is
# (name, color, title pattern, skill pattern). Titles (specialization, role,
# designation) are matched first; skills are only used when no title matches.
DOMAIN_CATEGORIES = [
    ("QA & Testing", "#f59e0b",
     r"\bqa\b|quality|\btest|\bsdet\b|automation",
     r"selenium|testng|junit|cucumber|jmeter|appium|cypress|playwright|\btest|\bqa\b|\buat\b"),
    ("Data, AI & Analytics", "#8b5cf6",
     r"data|\betl\b|analytics|business intelligence|\b(bi|ai|ml|dba)\b|machine learning|snowflake|databricks|big ?data",
     r"spark|snowflake|databricks|power ?bi|tableau|\betl\b|data|hadoop|airflow|kafka|\bdbt\b|machine learning|\bssis\b|informatica"),
    ("Cloud & DevOps", "#14b8a6",
     r"devops|cloud|\bsre\b|reliability|platform engineer|kubernetes",
     r"docker|kubernetes|jenkins|terraform|ansible|ci/cd|helm|grafana|prometheus|devops|cloudformation|\b(aws|azure|gcp)\b"),
    ("UI/UX Design", "#ec4899",
     r"\b(ux|ui)\b|designer|user experience",
     r"figma|wirefram|prototyp|\b(ux|ui)\b|usability|adobe xd|user research"),
    ("Project & Product Management", "#f97316",
     r"project manag|program manag|product manag|product owner|delivery|scrum|agile coach|manager|\bpmo\b",
     r"project management|scrum|agile|\bpmp\b|waterfall|risk management|budget|roadmap|sprint planning"),
    ("Business Analysis", "#3b82f6",
     r"business (systems? )?analyst|\bbsa\b|systems? analyst|functional (analyst|consultant)",
     r"business analysis|requirement|stakeholder|\b(brd|frd)\b|user stories|process mapping|gap analysis"),
    ("IT Support & Security", "#10b981",
     r"support|administrator|\bsys(tems?)? ?admin|technician|security|help ?desk|network|\bit systems\b",
     r"\bitil\b|servicenow|active directory|troubleshoot|help ?desk|networking|firewall|\bsiem\b|windows server"),
    ("Software Development", "#6366f1",
     r"software|developer|full.?stack|front.?end|back.?end|programmer|\bjava\b|\.net|\bweb\b|mobile|mainframe",
     r"\bjava\b|javascript|typescript|react|angular|spring|node|c#|\.net|html|css|php|django|flask|microservices|kotlin|swift"),
]
DOMAIN_OTHER = ("Others", "#94a3b8")
DOMAIN_NOT_SPECIFIED = ("Not Specified", "#cbd5e1")
_DOMAIN_COLORS = {name: color for name, color, _, _ in DOMAIN_CATEGORIES} | dict([DOMAIN_OTHER, DOMAIN_NOT_SPECIFIED])
_DOMAIN_TITLE_PATTERNS = [(name, re.compile(title)) for name, _, title, _ in DOMAIN_CATEGORIES]
_DOMAIN_SKILL_PATTERNS = [(name, re.compile(skill)) for name, _, _, skill in DOMAIN_CATEGORIES]
_DOMAIN_SKILL_FIELDS = (
    "primary_skills", "programming_languages", "frameworks", "databases",
    "cloud_tech", "devops_and_infrastructure", "other_technologies",
)


def _match_title(text: Any) -> Optional[str]:
    text = str(text).strip().lower() if text else ""
    best = None
    for name, pattern in _DOMAIN_TITLE_PATTERNS:
        match = pattern.search(text)
        if match and (best is None or match.start() < best[0]):
            best = (match.start(), name)
    return best[1] if best else None


def categorize_domain(parsed_data: Any) -> str:
    if not isinstance(parsed_data, dict) or not parsed_data:
        return DOMAIN_NOT_SPECIFIED[0]

    designations = [
        e.get("designation") for e in (parsed_data.get("experience") or []) if isinstance(e, dict)
    ]
    titles = [
        parsed_data.get("specialization"),
        parsed_data.get("current_role"),
        *designations[:1],
        parsed_data.get("primary_domain"),
        *designations[1:],
    ]
    for title in titles:
        category = _match_title(title)
        if category:
            return category

    skills = [
        str(skill).lower()
        for field in _DOMAIN_SKILL_FIELDS
        for skill in (parsed_data.get(field) or [])
    ]
    scores = [(sum(1 for skill in skills if pattern.search(skill)), name) for name, pattern in _DOMAIN_SKILL_PATTERNS]
    best_score = max(score for score, _ in scores)
    if best_score > 0:
        return next(name for score, name in scores if score == best_score)
    return DOMAIN_OTHER[0]


SENIORITY_LEVELS = {
    "Junior": "#10b981",
    "Mid": "#f59e0b",
    "Senior": "#3b82f6",
    "Lead / Architect": "#8b5cf6",
    "Not Specified": "#cbd5e1",
}
_SENIORITY_LABEL_PATTERNS = [
    ("Lead / Architect", re.compile(r"lead|principal|architect|manager|head|director|staff")),
    ("Senior", re.compile(r"senior|\bsr\b")),
    ("Mid", re.compile(r"mid|intermediate")),
    ("Junior", re.compile(r"junior|\bjr\b|fresher|entry|trainee|intern|graduate")),
]
_LEAD_TITLE_PATTERN = re.compile(r"\blead\b|principal|architect|manager|\bhead\b|director")
_NON_LEAD_TITLE_PATTERN = re.compile(r"assistant|associate|trainee|intern")


def categorize_seniority(parsed_data: Any, experience_level: Any = None) -> str:
    if not isinstance(parsed_data, dict) or not parsed_data:
        return "Not Specified"

    for label in (parsed_data.get("seniority"), experience_level):
        text = str(label).strip().lower() if label else ""
        for level, pattern in _SENIORITY_LABEL_PATTERNS:
            if pattern.search(text):
                return level

    experience = [e for e in (parsed_data.get("experience") or []) if isinstance(e, dict)]
    title = str(parsed_data.get("current_role") or (experience[0].get("designation") if experience else "") or "").lower()
    if _LEAD_TITLE_PATTERN.search(title) and not _NON_LEAD_TITLE_PATTERN.search(title):
        return "Lead / Architect"

    try:
        years = float(parsed_data.get("total_experience_years"))
    except (TypeError, ValueError):
        years = 0.0
    if years >= 5:
        return "Senior"
    if years >= 2:
        return "Mid"
    if years > 0:
        return "Junior"
    for level, pattern in _SENIORITY_LABEL_PATTERNS[1:]:
        if pattern.search(title):
            return level
    return "Not Specified"


class DashboardService:
    """
    High-performance Dashboard Service providing sub-100ms responses
    via in-memory Stale-While-Revalidate caching, parallel query execution,
    and modular endpoint breakdown.
    """
    _cache: Dict[str, Any] = {}
    _cache_timestamps: Dict[str, float] = {}
    _refreshing: Dict[str, bool] = {}
    _inflight: Dict[str, asyncio.Task] = {}
    _lock: Optional[asyncio.Lock] = None
    CACHE_TTL_SECONDS: float = 120.0

    @classmethod
    def _get_lock(cls) -> asyncio.Lock:
        if cls._lock is None:
            cls._lock = asyncio.Lock()
        return cls._lock

    def _get_cached(self, key: str) -> Optional[Any]:
        return self._cache.get(key)

    def _is_cache_fresh(self, key: str) -> bool:
        if key not in self._cache or key not in self._cache_timestamps:
            return False
        return (time.time() - self._cache_timestamps[key]) < self.CACHE_TTL_SECONDS

    def _set_cached(self, key: str, value: Any) -> None:
        self._cache[key] = value
        self._cache_timestamps[key] = time.time()

    @staticmethod
    def _company_key(key: str) -> str:
        """Cache entries belong to one company: the cache is shared by every request."""
        company = current_company_id() or ("__system__" if in_system_scope() else None)
        if company is None:
            raise TenantScopeError("The dashboard was asked for before the company was known.")
        return f"{company}::{key}"

    async def _swr_fetch(self, key: str, fetch_coroutine) -> Any:
        """
        High-performance Stale-While-Revalidate with concurrent in-flight deduplication:
        1. If fresh cache exists: return immediately (< 0.05ms).
        2. If stale cache exists: return stale data immediately (< 0.05ms) and trigger
           an asynchronous background task to refresh the cache.
        3. If no cache exists: deduplicate concurrent callers so multiple simultaneous
           requests await the exact same database task instead of hammering Atlas.
        """
        key = self._company_key(key)
        if self._is_cache_fresh(key):
            return self._cache[key]

        if key in self._cache:
            # Stale data exists - return immediately and refresh in background
            if not self._refreshing.get(key, False):
                self._refreshing[key] = True
                asyncio.create_task(self._background_refresh(key, fetch_coroutine))
            return self._cache[key]

        # Cold start: deduplicate concurrent in-flight fetches
        if key in self._inflight:
            return await self._inflight[key]

        task = asyncio.create_task(self._execute_and_cache(key, fetch_coroutine))
        self._inflight[key] = task
        try:
            return await task
        finally:
            self._inflight.pop(key, None)

    async def _execute_and_cache(self, key: str, fetch_coroutine) -> Any:
        try:
            data = await fetch_coroutine()
            self._set_cached(key, data)
            return data
        except Exception as e:
            logger.error(f"Error computing dashboard key '{key}': {e}")
            if key in self._cache:
                return self._cache[key]
            raise e

    async def _background_refresh(self, key: str, fetch_coroutine):
        try:
            data = await fetch_coroutine()
            self._set_cached(key, data)
        except Exception as e:
            logger.warning(f"Background refresh failed for dashboard key '{key}': {e}")
        finally:
            self._refreshing[key] = False

    @staticmethod
    def _parse_utc_dt(value: Any) -> Optional[datetime]:
        """Parse BSON datetime, ISO-8601 string, or YYYY-MM-DD into timezone-aware UTC datetime."""
        if not value:
            return None
        if isinstance(value, datetime):
            return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)
        s = str(value).strip()
        if not s:
            return None
        try:
            if len(s) == 10 and s[4] == "-" and s[7] == "-":
                return datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
            return dt.astimezone(timezone.utc) if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except Exception:
            try:
                return datetime.strptime(s[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
            except Exception:
                return None

    @staticmethod
    def _window_bounds(window: str, tz_offset_minutes: int) -> Tuple[datetime, datetime, datetime, datetime, str, str]:
        """
        Compute (curr_start, curr_end, prev_start, prev_end, window_title, trend_label) in UTC
        using the user's local timezone offset (JS Date.getTimezoneOffset(), e.g. -330 for IST +05:30).
        """
        clamped_offset = max(-840, min(840, int(tz_offset_minutes or 0)))
        user_tz = timezone(timedelta(minutes=-clamped_offset))
        now_utc = datetime.now(timezone.utc)
        now_local = now_utc.astimezone(user_tz)

        norm_window = (window or "today").strip().lower()
        if norm_window == "24h":
            curr_end = now_utc
            curr_start = now_utc - timedelta(hours=24)
            prev_end = curr_start
            prev_start = curr_start - timedelta(hours=24)
            return curr_start, curr_end, prev_start, prev_end, "Parsed (24h)", "vs prev 24h"
        if norm_window == "7d":
            local_start = (now_local - timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0)
            curr_start = local_start.astimezone(timezone.utc)
            curr_end = now_utc
            prev_end = curr_start
            prev_start = curr_start - timedelta(days=7)
            return curr_start, curr_end, prev_start, prev_end, "Parsed (7d)", "vs prev 7d"

        # Default: "today" in user's local timezone
        local_midnight = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
        curr_start = local_midnight.astimezone(timezone.utc)
        curr_end = now_utc
        prev_end = curr_start
        prev_start = curr_start - timedelta(days=1)
        return curr_start, curr_end, prev_start, prev_end, "Parsed Today", "vs yesterday"

    @staticmethod
    def _calc_trend(current: int, previous: int, label: str) -> Dict[str, Any]:
        delta = current - previous
        if delta == 0:
            return {
                "trend_direction": "flat",
                "trend_percent": 0.0,
                "trend_delta": 0,
                "trend_label": label,
                "change": f"0% {label}",
                "changeColor": "text-slate-400",
            }
        if previous == 0:
            return {
                "trend_direction": "up",
                "trend_percent": 100.0,
                "trend_delta": delta,
                "trend_label": label,
                "change": f"+{delta} {label}",
                "changeColor": "text-emerald-600",
            }
        pct = round((delta / previous) * 100, 1)
        direction = "up" if delta > 0 else "down"
        sign = "+" if pct > 0 else ""
        return {
            "trend_direction": direction,
            "trend_percent": pct,
            "trend_delta": delta,
            "trend_label": label,
            "change": f"{sign}{pct}% {label}",
            "changeColor": "text-emerald-600" if direction == "up" else "text-rose-600",
        }

    @staticmethod
    def _normalize_filters(
        date_range: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        job_id: Optional[str] = None,
        department: Optional[str] = None,
        recruiter: Optional[str] = None,
        tz_offset_minutes: int = 0,
    ) -> Dict[str, Any]:
        dr = (date_range or "all").strip().lower()
        if dr not in ("all", "today", "7d", "30d", "90d", "custom"):
            dr = "all"
        tz_bucket = int(round(int(tz_offset_minutes or 0) / 15.0) * 15)
        return {
            "date_range": dr,
            "start_date": (start_date or "").strip()[:10],
            "end_date": (end_date or "").strip()[:10],
            "job_id": (job_id or "").strip(),
            "department": (department or "").strip(),
            "recruiter": (recruiter or "").strip(),
            "tz_offset_minutes": tz_bucket,
        }

    @staticmethod
    def _filter_sig(f: Dict[str, Any]) -> str:
        return "|".join(
            [
                str(f.get("date_range") or "all"),
                str(f.get("start_date") or ""),
                str(f.get("end_date") or ""),
                str(f.get("job_id") or ""),
                str(f.get("department") or "").lower(),
                str(f.get("recruiter") or "").lower(),
                str(f.get("tz_offset_minutes") or 0),
            ]
        )

    @staticmethod
    def _has_active_filters(f: Dict[str, Any]) -> bool:
        return bool(
            (f.get("date_range") and f.get("date_range") != "all")
            or f.get("job_id")
            or f.get("department")
            or f.get("recruiter")
        )

    async def _resolve_filter_context(self, f: Dict[str, Any]) -> Dict[str, Any]:
        """Resolve date bounds, matching job IDs/titles, and application resume IDs for global filters."""
        clamped_offset = max(-840, min(840, int(f.get("tz_offset_minutes") or 0)))
        user_tz = timezone(timedelta(minutes=-clamped_offset))
        now_utc = datetime.now(timezone.utc)
        now_local = now_utc.astimezone(user_tz)

        dr = f.get("date_range") or "all"
        range_start_utc: Optional[datetime] = None
        range_end_utc: Optional[datetime] = None

        if dr == "today":
            range_start_utc = now_local.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
            range_end_utc = now_utc
        elif dr == "7d":
            range_start_utc = (now_local - timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
            range_end_utc = now_utc
        elif dr == "30d":
            range_start_utc = (now_local - timedelta(days=29)).replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
            range_end_utc = now_utc
        elif dr == "90d":
            range_start_utc = (now_local - timedelta(days=89)).replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
            range_end_utc = now_utc
        elif dr == "custom":
            sd = f.get("start_date")
            ed = f.get("end_date")
            if sd:
                try:
                    d = datetime.strptime(sd, "%Y-%m-%d").replace(tzinfo=user_tz)
                    range_start_utc = d.astimezone(timezone.utc)
                except Exception:
                    pass
            if ed:
                try:
                    d = datetime.strptime(ed, "%Y-%m-%d").replace(hour=23, minute=59, second=59, microsecond=999999, tzinfo=user_tz)
                    range_end_utc = d.astimezone(timezone.utc)
                except Exception:
                    pass

        job_id = f.get("job_id") or ""
        department = (f.get("department") or "").strip().lower()
        recruiter = (f.get("recruiter") or "").strip().lower()

        matched_job_ids: set = set()
        matched_job_titles: set = set()
        matched_app_resume_ids: set = set()
        has_job_scope = bool(job_id or department)

        if has_job_scope:
            db = get_database()
            jobs_docs = await db["job_openings"].find(
                {}, {"_id": 0, "id": 1, "title": 1, "department": 1}
            ).to_list(length=2000)
            for j in jobs_docs:
                jid = str(j.get("id") or "")
                jtitle = str(j.get("title") or "").strip().lower()
                jdept = str(j.get("department") or "").strip().lower()
                if job_id and jid != job_id:
                    continue
                if department and jdept != department:
                    continue
                if jid:
                    matched_job_ids.add(jid)
                if jtitle:
                    matched_job_titles.add(jtitle)

            if matched_job_ids or matched_job_titles:
                apps_docs = await db["job_applications"].find(
                    {}, {"_id": 0, "opening_id": 1, "job_opening_id": 1, "opening_title": 1, "resume_id": 1}
                ).to_list(length=10000)
                for a in apps_docs:
                    oid = str(a.get("opening_id") or a.get("job_opening_id") or "")
                    otitle = str(a.get("opening_title") or "").strip().lower()
                    if (oid and oid in matched_job_ids) or (otitle and otitle in matched_job_titles):
                        rid = str(a.get("resume_id") or "")
                        if rid:
                            matched_app_resume_ids.add(rid)

        return {
            "range_start_utc": range_start_utc,
            "range_end_utc": range_end_utc,
            "has_job_scope": has_job_scope,
            "job_id": job_id,
            "department": department,
            "matched_job_ids": matched_job_ids,
            "matched_job_titles": matched_job_titles,
            "matched_app_resume_ids": matched_app_resume_ids,
            "recruiter": recruiter,
            "user_tz": user_tz,
        }

    def _dt_in_range(self, dt: Optional[datetime], ctx: Dict[str, Any]) -> bool:
        start = ctx.get("range_start_utc")
        end = ctx.get("range_end_utc")
        if not start and not end:
            return True
        if not dt:
            return False
        if start and dt < start:
            return False
        return not (end and dt > end)

    def _resume_matches(self, r: Dict[str, Any], ctx: Dict[str, Any]) -> bool:
        if ctx.get("range_start_utc") or ctx.get("range_end_utc"):
            dt = self._parse_utc_dt(r.get("upload_date") or r.get("created_at"))
            if not self._dt_in_range(dt, ctx):
                return False

        if ctx.get("has_job_scope"):
            rid = str(r.get("id") or r.get("resume_id") or "")
            r_jid = str(r.get("job_opening_id") or "")
            r_jtitle = str(r.get("job_title") or "").strip().lower()
            pd_role = str((r.get("parsed_data") or {}).get("current_role") or "").strip().lower()
            in_apps = bool(rid and rid in ctx["matched_app_resume_ids"])
            in_jid = bool(r_jid and r_jid in ctx["matched_job_ids"])
            in_title = bool(
                ctx["matched_job_titles"]
                and (
                    (r_jtitle and r_jtitle in ctx["matched_job_titles"])
                    or any(t and (t in r_jtitle or t in pd_role) for t in ctx["matched_job_titles"])
                )
            )
            if not (in_apps or in_jid or in_title):
                return False

        rec = ctx.get("recruiter")
        if rec:
            up_email = str(r.get("uploaded_by_email") or "").strip().lower()
            up_name = str(r.get("uploaded_by_name") or "").strip().lower()
            if rec not in up_email and rec not in up_name:
                return False

        return True

    def _interview_matches(
        self, inv: Dict[str, Any], ctx: Dict[str, Any], allowed_resume_ids: Optional[set] = None, check_date: bool = True
    ) -> bool:
        if check_date and (ctx.get("range_start_utc") or ctx.get("range_end_utc")):
            dt = self._parse_utc_dt(inv.get("created_at") or inv.get("scheduled_date"))
            if not self._dt_in_range(dt, ctx):
                return False

        key = str(inv.get("resume_id") or inv.get("candidate_id") or "")

        if ctx.get("has_job_scope"):
            inv_jid = str(inv.get("job_opening_id") or "")
            inv_title = str(inv.get("job_title") or "").strip().lower()
            in_resume = bool(allowed_resume_ids is not None and key and key in allowed_resume_ids)
            in_jid = bool(inv_jid and inv_jid in ctx["matched_job_ids"])
            in_title = bool(
                ctx["matched_job_titles"]
                and inv_title
                and (
                    inv_title in ctx["matched_job_titles"]
                    or any(t and (t in inv_title or inv_title in t) for t in ctx["matched_job_titles"])
                )
            )
            if not (in_resume or in_jid or in_title):
                return False

        rec = ctx.get("recruiter")
        if rec:
            fields = [
                str(inv.get("created_by") or "").lower(),
                str(inv.get("scheduled_by") or "").lower(),
                str(inv.get("interviewer_email") or "").lower(),
                str(inv.get("interviewer_name") or "").lower(),
            ]
            in_resume = bool(allowed_resume_ids is not None and key and key in allowed_resume_ids)
            if not in_resume and not any(rec in fld for fld in fields):
                return False

        return True

    # --------------------------------------------------------------------------
    # Single Source of Truth Pipeline Snapshot (Filter-Aware)
    # --------------------------------------------------------------------------
    async def _get_pipeline_snapshot(
        self, stuck_days: int = 7, filters: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        safe_stuck = max(1, min(90, int(stuck_days or 7)))
        norm_f = filters or self._normalize_filters()
        sig = self._filter_sig(norm_f)
        return await self._swr_fetch(
            f"pipeline_snapshot:{safe_stuck}:{sig}",
            lambda: self._compute_pipeline_snapshot(safe_stuck, norm_f),
        )

    async def _compute_pipeline_snapshot(
        self, stuck_days: int = 7, filters: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        db = get_database()
        resumes_coll = db[RESUMES_COLLECTION]
        interviews_coll = db[INTERVIEWS_COLLECTION]
        now_utc = datetime.now(timezone.utc)
        norm_f = filters or self._normalize_filters()
        has_filters = self._has_active_filters(norm_f)

        ctx_task = self._resolve_filter_context(norm_f) if has_filters else None

        resumes_task = resumes_coll.find(
            {"redirect_id": None},
            {
                "_id": 0,
                "id": 1,
                "resume_id": 1,
                "upload_date": 1,
                "created_at": 1,
                "updated_at": 1,
                "job_opening_id": 1,
                "job_title": 1,
                "uploaded_by_email": 1,
                "uploaded_by_name": 1,
                "parsed_data.current_role": 1,
            },
        ).to_list(length=15000)

        interviews_task = interviews_coll.find(
            {},
            {
                "_id": 0,
                "candidate_id": 1,
                "resume_id": 1,
                "job_opening_id": 1,
                "job_title": 1,
                "created_by": 1,
                "scheduled_by": 1,
                "interviewer_email": 1,
                "interviewer_name": 1,
                "recommendation": 1,
                "status": 1,
                "scheduled_date": 1,
                "scheduled_time": 1,
                "created_at": 1,
                "updated_at": 1,
            },
        ).to_list(length=15000)

        if ctx_task:
            ctx, resumes_docs, all_interviews = await asyncio.gather(ctx_task, resumes_task, interviews_task)
            resumes_docs = [r for r in resumes_docs if self._resume_matches(r, ctx)]
            allowed_rids = set()
            for r in resumes_docs:
                for k in (r.get("id"), r.get("resume_id")):
                    if k:
                        allowed_rids.add(str(k))
            all_interviews = [
                inv for inv in all_interviews if self._interview_matches(inv, ctx, allowed_rids, check_date=True)
            ]
        else:
            resumes_docs, all_interviews = await asyncio.gather(resumes_task, interviews_task)

        total_resumes = len(resumes_docs)
        total_interview_rounds = len(all_interviews)

        # Map resume upload timestamp by resume_id / id
        resume_upload_dts: Dict[str, Optional[datetime]] = {}
        all_upload_dts: List[Optional[datetime]] = []
        for r in resumes_docs:
            dt = self._parse_utc_dt(r.get("upload_date") or r.get("created_at"))
            all_upload_dts.append(dt)
            for k in (r.get("id"), r.get("resume_id")):
                if k:
                    resume_upload_dts[str(k)] = dt

        # Group interviews by unique candidate key
        by_candidate: Dict[str, List[Dict[str, Any]]] = {}
        for inv in all_interviews:
            key = str(inv.get("resume_id") or inv.get("candidate_id") or "")
            if key:
                by_candidate.setdefault(key, []).append(inv)

        stage_counts: Dict[str, int] = dict.fromkeys(STAGES, 0)
        stage_dwell_days: Dict[str, List[float]] = {st: [] for st in STAGES}
        selected_dwell_days: List[float] = []
        stage_stuck_counts: Dict[str, int] = dict.fromkeys(STAGES, 0)

        selected_candidates = 0
        interviewed_keys = set(by_candidate.keys())

        for key, invs in by_candidate.items():
            active = [i for i in invs if str(i.get("status", "")).upper() != "CANCELLED"] or invs
            latest = max(
                active,
                key=lambda i: (
                    str(i.get("scheduled_date") or ""),
                    str(i.get("scheduled_time") or ""),
                    str(i.get("created_at") or ""),
                ),
            )
            earliest = min(
                active,
                key=lambda i: (
                    str(i.get("created_at") or ""),
                    str(i.get("scheduled_date") or ""),
                ),
            )

            st = stage_of(latest.get("recommendation"), latest.get("status"))
            verd = verdict_of(latest.get("recommendation"), latest.get("status"))
            stage_counts[st] = stage_counts.get(st, 0) + 1
            if verd == "Selected" or st in ("Offer", "Hired"):
                selected_candidates += 1

            upload_dt = resume_upload_dts.get(key)
            first_inv_dt = self._parse_utc_dt(earliest.get("created_at") or earliest.get("scheduled_date"))
            latest_inv_dt = self._parse_utc_dt(
                latest.get("updated_at") or latest.get("scheduled_date") or latest.get("created_at")
            )

            # Screening dwell before reaching first interview
            if upload_dt and first_inv_dt and first_inv_dt >= upload_dt:
                stage_dwell_days["Screening"].append((first_inv_dt - upload_dt).total_seconds() / 86400.0)

            # Current / completed stage dwell time
            if st == "Interviewing":
                ref_dt = first_inv_dt or latest_inv_dt
                if ref_dt:
                    dwell = max(0.0, (now_utc - ref_dt).total_seconds() / 86400.0)
                    stage_dwell_days["Interviewing"].append(dwell)
                    if dwell > stuck_days:
                        stage_stuck_counts["Interviewing"] += 1
            elif st in ("Offer", "Hired", "Closed"):
                if first_inv_dt and latest_inv_dt and latest_inv_dt >= first_inv_dt:
                    stage_dwell_days["Interviewing"].append((latest_inv_dt - first_inv_dt).total_seconds() / 86400.0)
                if latest_inv_dt:
                    dwell = max(0.0, (now_utc - latest_inv_dt).total_seconds() / 86400.0)
                    stage_dwell_days[st].append(dwell)
                    if st == "Offer" and dwell > stuck_days:
                        stage_stuck_counts["Offer"] += 1

            if verd == "Selected" or st in ("Offer", "Hired"):
                ref_sel = latest_inv_dt or first_inv_dt
                if ref_sel:
                    selected_dwell_days.append(max(0.0, (now_utc - ref_sel).total_seconds() / 86400.0))

        # Candidates still in Screening (never interviewed yet)
        screening_candidates_count = max(total_resumes - len(interviewed_keys), 0)
        stage_counts["Screening"] = screening_candidates_count

        for r in resumes_docs:
            rid = str(r.get("id") or r.get("resume_id") or "")
            if rid and rid in interviewed_keys:
                continue
            dt = self._parse_utc_dt(r.get("upload_date") or r.get("created_at"))
            if dt:
                dwell = max(0.0, (now_utc - dt).total_seconds() / 86400.0)
                stage_dwell_days["Screening"].append(dwell)
                if dwell > stuck_days:
                    stage_stuck_counts["Screening"] += 1

        # Cap Screening stuck count to actual screening count in case of unlinked IDs
        stage_stuck_counts["Screening"] = min(stage_stuck_counts["Screening"], screening_candidates_count)

        def avg_days(values: List[float]) -> Optional[float]:
            if not values:
                return None
            return round(sum(values) / len(values), 1)

        def share(count: int) -> str:
            return f"{round((count / total_resumes) * 100) if total_resumes > 0 else 0}%"

        unique_interviewed = len(interviewed_keys)
        total_offers = stage_counts["Offer"] + stage_counts["Hired"]
        hired_count = stage_counts["Hired"]

        raw_funnel = [
            {
                "stage": "Resumes Uploaded",
                "count_int": total_resumes,
                "bg": "bg-blue-600",
                "avg_days_in_stage": avg_days(stage_dwell_days["Screening"]),
                "stuck_count": stage_stuck_counts["Screening"],
                "definition": "Total active candidate profiles ingested into the ATS",
            },
            {
                "stage": "Interviewed",
                "count_int": unique_interviewed,
                "bg": "bg-sky-500",
                "avg_days_in_stage": avg_days(stage_dwell_days["Interviewing"]),
                "stuck_count": stage_stuck_counts["Interviewing"],
                "definition": f"Unique candidates with ≥1 interview round ({total_interview_rounds} total rounds)",
            },
            {
                "stage": "Selected",
                "count_int": selected_candidates,
                "bg": "bg-emerald-400",
                "avg_days_in_stage": avg_days(selected_dwell_days),
                "stuck_count": 0,
                "definition": "Unique candidates passed interviews with Selected verdict",
            },
            {
                "stage": "Offer",
                "count_int": total_offers,
                "bg": "bg-emerald-600",
                "avg_days_in_stage": avg_days(stage_dwell_days["Offer"]),
                "stuck_count": stage_stuck_counts["Offer"],
                "definition": "Candidates with an active or accepted offer",
            },
            {
                "stage": "Hired",
                "count_int": hired_count,
                "bg": "bg-emerald-200",
                "avg_days_in_stage": avg_days(stage_dwell_days["Hired"]),
                "stuck_count": 0,
                "definition": "Candidates who accepted offer and joined",
            },
        ]

        pipelineData: List[Dict[str, Any]] = []
        for idx, step in enumerate(raw_funnel):
            c = step["count_int"]
            if idx == 0:
                conv_prev = 100.0 if total_resumes > 0 else 0.0
                dropoff = 0.0
            else:
                prev_c = raw_funnel[idx - 1]["count_int"]
                if prev_c > 0:
                    conv_prev = round((c / prev_c) * 100.0, 1)
                    dropoff = round(max(0.0, 100.0 - conv_prev), 1)
                else:
                    conv_prev = 0.0
                    dropoff = 0.0
            pipelineData.append(
                {
                    "stage": step["stage"],
                    "count": str(c),
                    "width": share(c) if idx > 0 else "100%",
                    "bg": step["bg"],
                    "avg_days_in_stage": step["avg_days_in_stage"],
                    "dropoff_percent": dropoff,
                    "conversion_from_prev_percent": conv_prev,
                    "stuck_count": step["stuck_count"],
                    "definition": step["definition"],
                }
            )

        stage_colors = {
            "Screening": "#4f46e5",
            "Interviewing": "#0ea5e9",
            "Offer": "#10b981",
            "Hired": "#0f766e",
            "Closed": "#94a3b8",
        }
        statusData = [
            {
                "name": st,
                "percentage": share(stage_counts[st]),
                "count": stage_counts[st],
                "color": stage_colors[st],
                "avg_days_in_stage": avg_days(stage_dwell_days[st]),
                "stuck_count": stage_stuck_counts[st],
            }
            for st in STAGES
        ]

        total_stuck = sum(stage_stuck_counts.get(st, 0) for st in ("Screening", "Interviewing", "Offer"))

        return {
            "pipelineData": pipelineData,
            "statusData": statusData,
            "stuckThresholdDays": stuck_days,
            "totalStuckCount": total_stuck,
            "uniqueCandidatesInterviewed": unique_interviewed,
            "totalInterviewRounds": total_interview_rounds,
            "activeInterviewingCount": stage_counts["Interviewing"],
            "totalResumes": total_resumes,
            "selectedCandidates": selected_candidates,
            "totalOffers": total_offers,
            "_uploadDts": all_upload_dts,
            "_interviews": all_interviews,
        }

    # --------------------------------------------------------------------------
    # 1. Stats Endpoint (Single Source of Truth + Timezone Window + Global Filters + Trends)
    # --------------------------------------------------------------------------
    async def get_stats(
        self,
        window: str = "24h",
        tz_offset_minutes: int = 0,
        stuck_days: int = 7,
        filters: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        norm_window = (window or "24h").strip().lower()
        if norm_window not in ("today", "24h", "7d"):
            norm_window = "24h"
        tz_bucket = int(round(int(tz_offset_minutes or 0) / 15.0) * 15)
        norm_f = filters or self._normalize_filters(tz_offset_minutes=tz_bucket)
        sig = self._filter_sig(norm_f)
        cache_key = f"stats:{norm_window}:{tz_bucket}:{stuck_days}:{sig}"
        return await self._swr_fetch(
            cache_key,
            lambda: self._compute_stats(norm_window, tz_bucket, stuck_days, norm_f),
        )

    async def _compute_stats(
        self,
        window: str = "24h",
        tz_offset_minutes: int = 0,
        stuck_days: int = 7,
        filters: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        db = get_database()
        rerank_coll = db["rerank_results"]
        jobs_coll = db["job_openings"]
        norm_f = filters or self._normalize_filters(tz_offset_minutes=tz_offset_minutes)
        has_filters = self._has_active_filters(norm_f)

        curr_start, curr_end, prev_start, prev_end, parsed_label, trend_label = self._window_bounds(
            window, tz_offset_minutes
        )

        # Fetch pipeline snapshot (single source of truth), JD matches, and jobs in parallel
        snapshot_task = self._get_pipeline_snapshot(stuck_days, norm_f)
        rerank_task = rerank_coll.find(
            {}, {"_id": 0, "created_at": 1, "updated_at": 1, "job_opening_id": 1, "job_title": 1}
        ).to_list(length=15000)
        jobs_task = jobs_coll.find(
            {"status": "OPEN"}, {"_id": 0, "id": 1, "title": 1, "department": 1, "created_at": 1}
        ).to_list(length=2000)

        if has_filters:
            ctx, snapshot, rerank_docs, open_jobs_docs = await asyncio.gather(
                self._resolve_filter_context(norm_f), snapshot_task, rerank_task, jobs_task
            )
            # Filter open jobs by job_id / department / date_range
            if ctx["has_job_scope"]:
                open_jobs_docs = [
                    j for j in open_jobs_docs
                    if str(j.get("id") or "") in ctx["matched_job_ids"]
                ]
            if ctx.get("range_start_utc") or ctx.get("range_end_utc"):
                rerank_docs = [
                    d for d in rerank_docs
                    if self._dt_in_range(self._parse_utc_dt(d.get("created_at") or d.get("updated_at")), ctx)
                ]
            if ctx["has_job_scope"]:
                rerank_docs = [
                    d for d in rerank_docs
                    if (
                        str(d.get("job_opening_id") or "") in ctx["matched_job_ids"]
                        or str(d.get("job_title") or "").strip().lower() in ctx["matched_job_titles"]
                    )
                ]
        else:
            snapshot, rerank_docs, open_jobs_docs = await asyncio.gather(
                snapshot_task, rerank_task, jobs_task
            )

        total_resumes = snapshot["totalResumes"]
        total_interview_rounds = snapshot["totalInterviewRounds"]
        unique_interviewed = snapshot["uniqueCandidatesInterviewed"]
        active_interviewing = snapshot["activeInterviewingCount"]
        selected_candidates = snapshot["selectedCandidates"]
        total_offers = snapshot["totalOffers"]

        # Count resumes parsed in current & previous local windows
        parsed_curr = 0
        parsed_prev = 0
        for dt in snapshot.get("_uploadDts", []):
            if not dt:
                continue
            if curr_start <= dt <= curr_end:
                parsed_curr += 1
            elif prev_start <= dt < prev_end:
                parsed_prev += 1

        # JD Matches total + period trend
        jd_matches = len(rerank_docs)
        if jd_matches == 0 and not has_filters:
            search_plans = await db["search_plans"].find({}, {"_id": 0, "created_at": 1}).to_list(length=10000)
            rerank_docs = search_plans
            jd_matches = len(search_plans)

        jd_curr = 0
        jd_prev = 0
        for doc in rerank_docs:
            dt = self._parse_utc_dt(doc.get("created_at") or doc.get("updated_at"))
            if not dt:
                continue
            if curr_start <= dt <= curr_end:
                jd_curr += 1
            elif prev_start <= dt < prev_end:
                jd_prev += 1

        # Active jobs total + period trend
        active_jobs_count = len(open_jobs_docs)
        jobs_curr = 0
        jobs_prev = 0
        for j in open_jobs_docs:
            dt = self._parse_utc_dt(j.get("created_at"))
            if not dt:
                continue
            if curr_start <= dt <= curr_end:
                jobs_curr += 1
            elif prev_start <= dt < prev_end:
                jobs_prev += 1

        # Interviews & Selected period trend
        inv_curr = 0
        inv_prev = 0
        sel_curr = 0
        sel_prev = 0
        for inv in snapshot.get("_interviews", []):
            dt = self._parse_utc_dt(inv.get("created_at") or inv.get("scheduled_date"))
            if not dt:
                continue
            is_sel = verdict_of(inv.get("recommendation"), inv.get("status")) == "Selected"
            if curr_start <= dt <= curr_end:
                inv_curr += 1
                if is_sel:
                    sel_curr += 1
            elif prev_start <= dt < prev_end:
                inv_prev += 1
                if is_sel:
                    sel_prev += 1

        prev_total_resumes = max(0, total_resumes - parsed_curr)
        prev_active_jobs = max(0, active_jobs_count - jobs_curr)
        total_trend = self._calc_trend(total_resumes, prev_total_resumes, trend_label)
        parsed_trend = self._calc_trend(parsed_curr, parsed_prev, trend_label)
        jd_trend = self._calc_trend(jd_curr, jd_prev, trend_label)
        jobs_trend = self._calc_trend(active_jobs_count, prev_active_jobs, trend_label)
        inv_trend = self._calc_trend(inv_curr, inv_prev, trend_label)
        sel_trend = self._calc_trend(sel_curr, sel_prev, trend_label)

        stats = [
            {
                "key": "total_talent",
                "label": "Total Resumes",
                "value": str(total_resumes),
                "subtitle": "Filtered profiles" if has_filters else "Active candidate profiles",
                "tooltip": f"{total_resumes} unique non-redirect candidate profiles matching active filters.",
                **total_trend,
            },
            {
                "key": "parsed_window",
                "label": "AI Parsed Today",
                "value": str(parsed_curr),
                "subtitle": f"{parsed_label} (local TZ)",
                "tooltip": f"Resumes uploaded and parsed in your local '{window}' window ({parsed_prev} in previous period).",
                **parsed_trend,
            },
            {
                "key": "jd_matches",
                "label": "JD Matches",
                "value": str(jd_matches),
                "subtitle": "AI semantic fits",
                "tooltip": f"{jd_matches} AI candidate-to-JD rankings ({jd_curr} added {trend_label.replace('vs ', 'in current ')}).",
                **jd_trend,
            },
            {
                "key": "active_jobs",
                "label": "Active Jobs",
                "value": str(active_jobs_count),
                "subtitle": "Open requisitions",
                "tooltip": f"{active_jobs_count} open job requisitions matching active filters.",
                **jobs_trend,
            },
            {
                "key": "interview_rounds",
                "label": "Interviews",
                "value": str(total_interview_rounds),
                "subtitle": f"{unique_interviewed} unique • {active_interviewing} active",
                "tooltip": (
                    f"{total_interview_rounds} total interview rounds across {unique_interviewed} unique candidates. "
                    f"{active_interviewing} candidates are currently in the active Interviewing stage."
                ),
                **inv_trend,
            },
            {
                "key": "selected_offer",
                "label": "Offers",
                "value": str(selected_candidates if selected_candidates > 0 else total_offers),
                "subtitle": f"{selected_candidates} selected • {total_offers} offers",
                "tooltip": f"{selected_candidates} unique candidates passed interviews; {total_offers} extended/accepted offers.",
                **sel_trend,
            },
        ]

        return {
            "stats": stats,
            "window": window,
            "tzOffsetMinutes": tz_offset_minutes,
        }

    # --------------------------------------------------------------------------
    # 2. Pipeline & Status Endpoint (Backed by Single Source of Truth)
    # --------------------------------------------------------------------------
    async def get_pipeline(
        self, stuck_days: int = 7, filters: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        snapshot = await self._get_pipeline_snapshot(stuck_days, filters)
        return {
            "pipelineData": snapshot["pipelineData"],
            "statusData": snapshot["statusData"],
            "stuckThresholdDays": snapshot["stuckThresholdDays"],
            "totalStuckCount": snapshot["totalStuckCount"],
            "uniqueCandidatesInterviewed": snapshot["uniqueCandidatesInterviewed"],
            "totalInterviewRounds": snapshot["totalInterviewRounds"],
            "activeInterviewingCount": snapshot["activeInterviewingCount"],
        }

    # --------------------------------------------------------------------------
    # 3. Recent Activities Endpoint (Filter-Aware)
    # --------------------------------------------------------------------------
    async def get_recent_activities(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        norm_f = filters or self._normalize_filters()
        sig = self._filter_sig(norm_f)
        return await self._swr_fetch(
            f"activities:{sig}",
            lambda: self._compute_recent_activities(norm_f),
        )

    @staticmethod
    def _format_relative_time(dt_val: Any) -> str:
        if not dt_val:
            return "Recently"
        if isinstance(dt_val, str):
            try:
                dt = datetime.fromisoformat(dt_val.replace('Z', '+00:00'))
            except Exception:
                return "Recently"
        elif isinstance(dt_val, datetime):
            dt = dt_val if dt_val.tzinfo else dt_val.replace(tzinfo=timezone.utc)
        else:
            return "Recently"

        diff = datetime.now(timezone.utc) - dt
        if diff.days == 1:
            return "1 day ago"
        if diff.days > 1:
            return f"{diff.days} days ago"
        if diff.seconds >= 3600:
            hrs = diff.seconds // 3600
            return f"{hrs} hour{'s' if hrs > 1 else ''} ago"
        if diff.seconds >= 60:
            mins = diff.seconds // 60
            return f"{mins} min{'s' if mins > 1 else ''} ago"
        return "Just now"

    async def _compute_recent_activities(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        db = get_database()
        interviews_coll = db[INTERVIEWS_COLLECTION]
        apps_coll = db["job_applications"]
        resumes_coll = db[RESUMES_COLLECTION]
        logs_coll = db[RESUME_LOGS_COLLECTION]
        norm_f = filters or self._normalize_filters()
        has_filters = self._has_active_filters(norm_f)
        fetch_limit = 40 if has_filters else 5

        ctx_task = self._resolve_filter_context(norm_f) if has_filters else None

        inv_task = interviews_coll.find(
            {},
            {
                "candidate_name": 1,
                "job_title": 1,
                "job_opening_id": 1,
                "resume_id": 1,
                "candidate_id": 1,
                "created_by": 1,
                "scheduled_by": 1,
                "interviewer_email": 1,
                "interviewer_name": 1,
                "status": 1,
                "recommendation": 1,
                "created_at": 1,
                "updated_at": 1,
            },
        ).sort("created_at", -1).limit(fetch_limit).to_list(length=fetch_limit)

        apps_task = apps_coll.find(
            {},
            {"applicant_email": 1, "resume_id": 1, "opening_id": 1, "job_opening_id": 1, "opening_title": 1, "submitted_at": 1},
        ).sort("submitted_at", -1).limit(fetch_limit).to_list(length=fetch_limit)

        resumes_task = resumes_coll.find(
            {"$or": [{"redirect_id": None}, {"redirect_id": {"$exists": False}}]},
            {
                "id": 1,
                "resume_id": 1,
                "candidate_name": 1,
                "upload_date": 1,
                "created_at": 1,
                "job_opening_id": 1,
                "job_title": 1,
                "uploaded_by_email": 1,
                "uploaded_by_name": 1,
                "original_filename": 1,
                "parsed_data.full_name": 1,
                "parsed_data.name": 1,
                "parsed_data.email": 1,
                "parsed_data.current_role": 1,
            },
        ).sort("upload_date", -1).limit(fetch_limit).to_list(length=fetch_limit)

        logs_task = logs_coll.find({}).sort("created_at", -1).limit(fetch_limit).to_list(length=fetch_limit)

        if ctx_task:
            ctx, interviews_list, apps_list, resumes_list, logs_list = await asyncio.gather(
                ctx_task, inv_task, apps_task, resumes_task, logs_task
            )
            resumes_list = [r for r in resumes_list if self._resume_matches(r, ctx)]
            interviews_list = [inv for inv in interviews_list if self._interview_matches(inv, ctx)]
            filtered_apps = []
            for app in apps_list:
                if not self._dt_in_range(self._parse_utc_dt(app.get("submitted_at")), ctx):
                    continue
                if ctx["has_job_scope"]:
                    oid = str(app.get("opening_id") or app.get("job_opening_id") or "")
                    otitle = str(app.get("opening_title") or "").strip().lower()
                    if oid not in ctx["matched_job_ids"] and otitle not in ctx["matched_job_titles"]:
                        continue
                filtered_apps.append(app)
            apps_list = filtered_apps
            if ctx.get("range_start_utc") or ctx.get("range_end_utc"):
                logs_list = [log for log in logs_list if self._dt_in_range(self._parse_utc_dt(log.get("created_at")), ctx)]
            if ctx["has_job_scope"] or ctx.get("recruiter"):
                logs_list = []
        else:
            interviews_list, apps_list, resumes_list, logs_list = await asyncio.gather(
                inv_task, apps_task, resumes_task, logs_task
            )

        events: List[Dict[str, Any]] = []

        for inv in interviews_list:
            t = inv.get("updated_at") or inv.get("created_at")
            status = str(inv.get("status") or "SCHEDULED").upper()
            cand = inv.get("candidate_name") or "Candidate"
            role = inv.get("job_title") or "Role"
            rec = inv.get("recommendation")

            if status == "COMPLETED":
                title = f"Interview Completed: {cand}"
                details = f"Verdict: {rec or 'Completed'} ({role})"
                action = "INTERVIEW_COMPLETED"
                icon_type = "check"
            else:
                title = f"Interview Scheduled: {cand}"
                details = f"Position: {role}"
                action = "INTERVIEW_SCHEDULED"
                icon_type = "video"

            events.append({
                "title": title[:65],
                "action": action,
                "email": "",
                "details": details[:65],
                "raw_time": str(t or ""),
                "time": self._format_relative_time(t),
                "icon_type": icon_type,
                "bg": "bg-slate-800"
            })

        # Track applied resume_ids & emails so we don't repeat the same submission twice (Application + Resume Parsed)
        applied_resume_ids = {str(a.get("resume_id") or "") for a in apps_list if a.get("resume_id")}
        applied_emails = {str(a.get("applicant_email") or "").strip().lower() for a in apps_list if a.get("applicant_email")}

        for app in apps_list:
            t = app.get("submitted_at")
            role = app.get("opening_title") or "Job Opening"
            email = app.get("applicant_email") or ""
            events.append({
                "title": f"New Application: {role}"[:65],
                "action": "APPLICATION_SUBMITTED",
                "email": email,
                "details": f"Applied by {email}"[:65],
                "raw_time": str(t or ""),
                "time": self._format_relative_time(t),
                "icon_type": "file",
                "bg": "bg-slate-800"
            })

        for r in resumes_list:
            rid = str(r.get("id") or r.get("resume_id") or "")
            pd = r.get("parsed_data") or {}
            rem = str(pd.get("email") or "").strip().lower()
            if (rid and rid in applied_resume_ids) or (rem and rem in applied_emails):
                continue
            t = r.get("upload_date")
            role = pd.get("current_role") or "Candidate Profile"
            name = pd.get("full_name") or pd.get("name") or r.get("candidate_name") or "Candidate"
            events.append({
                "title": f"Resume Uploaded: {name}"[:65],
                "action": "RESUME_PARSED",
                "email": "",
                "details": f"Role: {role}"[:65],
                "raw_time": str(t or ""),
                "time": self._format_relative_time(t),
                "icon_type": "sparkles",
                "bg": "bg-slate-800"
            })

        for log in logs_list:
            t = log.get("created_at")
            act = str(log.get("action") or "Profile Update").replace("_", " ").title()
            email = log.get("email") or ""
            events.append({
                "title": f"{act} - {email}"[:65],
                "action": log.get("action") or "PROFILE_UPDATED",
                "email": email,
                "details": "Candidate profile updated"[:65],
                "raw_time": str(t or ""),
                "time": self._format_relative_time(t),
                "icon_type": "check",
                "bg": "bg-slate-800"
            })

        events.sort(key=lambda e: str(e.get("raw_time") or ""), reverse=True)
        return events[:5]

    # --------------------------------------------------------------------------
    # 4. Upcoming Interviews Endpoint (Filter-Aware)
    # --------------------------------------------------------------------------
    async def get_upcoming_interviews(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        norm_f = filters or self._normalize_filters()
        sig = self._filter_sig(norm_f)
        return await self._swr_fetch(
            f"upcoming_interviews:{sig}",
            lambda: self._compute_upcoming_interviews(norm_f),
        )

    async def _compute_upcoming_interviews(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        db = get_database()
        interviews_coll = db[INTERVIEWS_COLLECTION]
        norm_f = filters or self._normalize_filters()
        has_filters = self._has_active_filters(norm_f)

        clamped_offset = max(-840, min(840, int(norm_f.get("tz_offset_minutes") or 0)))
        user_tz = timezone(timedelta(minutes=-clamped_offset))
        local_today_str = datetime.now(timezone.utc).astimezone(user_tz).date().isoformat()

        fetch_limit = 50 if has_filters else 15
        upcoming_db = await interviews_coll.find({
            "scheduled_date": {"$gt": local_today_str},
            "status": InterviewStatus.SCHEDULED.value
        }).sort([("scheduled_date", 1), ("scheduled_time", 1)]).limit(fetch_limit).to_list(length=fetch_limit)

        if has_filters:
            ctx = await self._resolve_filter_context(norm_f)
            filtered = []
            for inv in upcoming_db:
                # For upcoming interviews, apply job/department/recruiter scope; if custom end_date set, respect it
                if not self._interview_matches(inv, ctx, None, check_date=False):
                    continue
                if norm_f.get("date_range") == "today":
                    if str(inv.get("scheduled_date") or "")[:10] != local_today_str:
                        continue
                elif (
                    norm_f.get("date_range") == "custom"
                    and norm_f.get("end_date")
                    and str(inv.get("scheduled_date") or "")[:10] > norm_f["end_date"]
                ):
                    continue
                filtered.append(inv)
            upcoming_db = filtered[:5]

        upcomingInterviews = []
        for inv in upcoming_db:
            upcomingInterviews.append({
                "id": str(inv.get("id") or ""),
                "time": f"{inv.get('scheduled_date', '')} {inv.get('scheduled_time', '')}".strip(),
                "scheduled_date": str(inv.get("scheduled_date") or ""),
                "scheduled_time": str(inv.get("scheduled_time") or ""),
                "role": inv.get("job_title", "Interview"),
                "candidate": inv.get("candidate_name", "Unknown"),
                "candidate_id": str(inv.get("resume_id") or inv.get("candidate_id") or ""),
                "status": str(inv.get("status") or "SCHEDULED"),
            })
        return upcomingInterviews

    # --------------------------------------------------------------------------
    # 5. Seniority and Domain Distributions Endpoint (Filter-Aware)
    # --------------------------------------------------------------------------
    async def get_distributions(self, filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        norm_f = filters or self._normalize_filters()
        sig = self._filter_sig(norm_f)
        return await self._swr_fetch(
            f"distributions:{sig}",
            lambda: self._compute_distributions(norm_f),
        )

    async def _compute_distributions(self, filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        db = get_database()
        resumes_coll = db[RESUMES_COLLECTION]
        norm_f = filters or self._normalize_filters()
        has_filters = self._has_active_filters(norm_f)

        profile_fields = [
            "seniority", "total_experience_years", "specialization", "current_role",
            "primary_domain", "experience.designation", *_DOMAIN_SKILL_FIELDS,
        ]
        projection = {
            "_id": 0,
            "id": 1,
            "resume_id": 1,
            "upload_date": 1,
            "created_at": 1,
            "job_opening_id": 1,
            "job_title": 1,
            "uploaded_by_email": 1,
            "uploaded_by_name": 1,
            "ai_evaluation.experience_level": 1,
            **{f"parsed_data.{field}": 1 for field in profile_fields},
        }

        resumes_task = resumes_coll.find({"redirect_id": None}, projection).to_list(length=10000)
        if has_filters:
            ctx, resumes = await asyncio.gather(self._resolve_filter_context(norm_f), resumes_task)
            resumes = [r for r in resumes if self._resume_matches(r, ctx)]
        else:
            resumes = await resumes_task

        total_resumes = len(resumes)
        seniority_counts: Dict[str, int] = {}
        category_counts: Dict[str, int] = {}

        for resume in resumes:
            parsed_data = resume.get("parsed_data")
            level = categorize_seniority(parsed_data, (resume.get("ai_evaluation") or {}).get("experience_level"))
            seniority_counts[level] = seniority_counts.get(level, 0) + 1
            category = categorize_domain(parsed_data)
            category_counts[category] = category_counts.get(category, 0) + 1

        def to_distribution(counts: Dict[str, int], colors: Dict[str, str]) -> List[Dict[str, Any]]:
            return [
                {
                    "name": name,
                    "percentage": f"{round((count / total_resumes) * 100) if total_resumes > 0 else 0}%",
                    "count": count,
                    "color": colors.get(name, "#cbd5e1"),
                }
                for name, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
            ]

        return {
            "seniorityDistribution": to_distribution(seniority_counts, SENIORITY_LEVELS),
            "domainDistribution": to_distribution(category_counts, _DOMAIN_COLORS),
        }

    # --------------------------------------------------------------------------
    # 6. Notifications Center Endpoint
    # --------------------------------------------------------------------------
    async def get_notifications(self, stuck_days: int = 7) -> List[Dict[str, Any]]:
        safe_stuck = max(1, min(90, int(stuck_days or 7)))
        return await self._swr_fetch(
            f"notifications:{safe_stuck}",
            lambda: self._compute_notifications(safe_stuck),
        )

    async def _compute_notifications(self, stuck_days: int = 7) -> List[Dict[str, Any]]:
        db = get_database()
        snapshot_task = self._get_pipeline_snapshot(stuck_days)
        upcoming_task = self.get_upcoming_interviews()
        activities_task = self.get_recent_activities()
        completed_pending_task = db[INTERVIEWS_COLLECTION].find(
            {
                "status": "COMPLETED",
                "$or": [{"recommendation": None}, {"recommendation": ""}, {"recommendation": {"$exists": False}}],
            },
            {"_id": 0, "id": 1, "candidate_name": 1, "job_title": 1, "updated_at": 1, "scheduled_date": 1},
        ).sort("updated_at", -1).limit(5).to_list(length=5)

        snapshot, upcoming, activities, pending_feedback = await asyncio.gather(
            snapshot_task, upcoming_task, activities_task, completed_pending_task
        )

        notifications: List[Dict[str, Any]] = []

        # 1. Stuck candidates warning
        total_stuck = snapshot.get("totalStuckCount", 0)
        if total_stuck > 0:
            stuck_stages = [
                f"{s['name']} ({s['stuck_count']})"
                for s in snapshot.get("statusData", [])
                if (s.get("stuck_count") or 0) > 0
            ]
            notifications.append({
                "id": f"stuck-{stuck_days}-{total_stuck}",
                "type": "stuck",
                "severity": "warning",
                "title": f"{total_stuck} candidates stuck > {stuck_days} days",
                "description": f"Needs review in {', '.join(stuck_stages) or 'active stages'}",
                "time": "Action needed",
                "actionPath": "/database?stage=Screening",
            })

        # 2. Interviews awaiting feedback
        for inv in pending_feedback[:3]:
            cand = inv.get("candidate_name") or "Candidate"
            role = inv.get("job_title") or "Role"
            notifications.append({
                "id": f"feedback-{inv.get('id') or cand}",
                "type": "feedback",
                "severity": "warning",
                "title": f"Feedback pending: {cand}",
                "description": f"Interview completed for {role} without final verdict",
                "time": self._format_relative_time(inv.get("updated_at") or inv.get("scheduled_date")),
                "actionPath": "/interviews",
            })

        # 3. Upcoming interviews
        for inv in upcoming[:3]:
            notifications.append({
                "id": f"upcoming-{inv.get('id') or inv.get('candidate')}-{inv.get('scheduled_date')}",
                "type": "interview",
                "severity": "info",
                "title": f"Upcoming round: {inv.get('candidate')}",
                "description": f"{inv.get('role')} · {inv.get('scheduled_date')} {inv.get('scheduled_time')}",
                "time": inv.get("scheduled_date") or "Scheduled",
                "actionPath": "/interviews",
            })

        # 4. Recent applications & AI parses
        for idx, act in enumerate(activities[:4]):
            act_type = "application" if act.get("action") == "APPLICATION_SUBMITTED" else "parse"
            notifications.append({
                "id": f"act-{act.get('action')}-{idx}-{act.get('title')[:20]}",
                "type": act_type,
                "severity": "success" if act_type == "parse" else "info",
                "title": act.get("title") or "Recruitment event",
                "description": act.get("details") or "Recent candidate activity",
                "time": act.get("time") or "Recently",
                "actionPath": "/database",
            })

        return notifications[:12]

    # --------------------------------------------------------------------------
    # 7. Executive Insights Endpoint (SWR-Cached)
    # --------------------------------------------------------------------------
    async def get_insights(
        self, stuck_days: int = 7, filters: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        from app.services.dashboard_insights_service import compute_dashboard_insights

        safe_stuck = max(1, min(90, int(stuck_days or 7)))
        norm_f = filters or self._normalize_filters()
        sig = self._filter_sig(norm_f)
        return await self._swr_fetch(
            f"insights:{safe_stuck}:{sig}",
            lambda: compute_dashboard_insights(self, stuck_days=safe_stuck, filters=norm_f),
        )

    # --------------------------------------------------------------------------
    # 8. Unified Composite Metrics Endpoint (Backward Compatible + Filter-Aware)
    # --------------------------------------------------------------------------
    async def get_dashboard_metrics(
        self,
        window: str = "24h",
        tz_offset_minutes: int = 0,
        stuck_days: int = 7,
        filters: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        norm_f = filters or self._normalize_filters(tz_offset_minutes=tz_offset_minutes)
        stats_task = self.get_stats(window=window, tz_offset_minutes=tz_offset_minutes, stuck_days=stuck_days, filters=norm_f)
        pipeline_task = self.get_pipeline(stuck_days=stuck_days, filters=norm_f)
        activities_task = self.get_recent_activities(filters=norm_f)
        interviews_task = self.get_upcoming_interviews(filters=norm_f)
        distributions_task = self.get_distributions(filters=norm_f)

        stats_payload, pipeline, activities, upcoming, distributions = await asyncio.gather(
            stats_task, pipeline_task, activities_task, interviews_task, distributions_task
        )

        return {
            "stats": stats_payload.get("stats", []),
            "window": stats_payload.get("window", window),
            "tzOffsetMinutes": stats_payload.get("tzOffsetMinutes", tz_offset_minutes),
            "pipelineData": pipeline.get("pipelineData", []),
            "statusData": pipeline.get("statusData", []),
            "stuckThresholdDays": pipeline.get("stuckThresholdDays", stuck_days),
            "totalStuckCount": pipeline.get("totalStuckCount", 0),
            "uniqueCandidatesInterviewed": pipeline.get("uniqueCandidatesInterviewed", 0),
            "totalInterviewRounds": pipeline.get("totalInterviewRounds", 0),
            "activeInterviewingCount": pipeline.get("activeInterviewingCount", 0),
            "recentActivities": activities,
            "upcomingInterviews": upcoming,
            "seniorityDistribution": distributions.get("seniorityDistribution", []),
            "domainDistribution": distributions.get("domainDistribution", []),
        }

    @classmethod
    def invalidate_cache(cls, key: Optional[str] = None) -> None:
        """Invalidate all or a specific cache key."""
        if key:
            # Keys are stored per company ("<company>::<key>").
            for k in [k for k in cls._cache if k == key or k.endswith(f"::{key}")]:
                cls._cache.pop(k, None)
                cls._cache_timestamps.pop(k, None)
        else:
            cls._cache.clear()
            cls._cache_timestamps.clear()
