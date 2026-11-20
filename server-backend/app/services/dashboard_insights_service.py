import asyncio
import re
from collections import Counter
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

from app.core.database import get_database
from app.utils.constants import RESUMES_COLLECTION, INTERVIEWS_COLLECTION
from app.utils.hiring_stage import stage_of, verdict_of
from app.services.dashboard_service import DashboardService

_SKILL_FIELDS = (
    "primary_skills",
    "programming_languages",
    "frameworks",
    "databases",
    "cloud_tech",
    "devops_and_infrastructure",
    "other_technologies",
)


_NOISE_SKILL_PATTERNS = re.compile(
    r"^(tools?\s+and\s+tech|skills?\s+and\s+behav|requirements?|qualifications?|responsibilities?|"
    r"nights?\s+and\s+weekends?|preferred|mandatory|good\s+to\s+have|nice\s+to\s+have|"
    r"workforce\s+management|shift|rotational|experience|years?|degree|bachelor|master|"
    r"clear|strong|excellent|good|proven|ability|knowledge|understanding|familiarity|"
    r"communication|teamwork|leadership|problem\s+solving|analytical|interpersonal|"
    r"self[- ]motivated|flexible|detail[- ]oriented|time\s+management|multitasking)",
    re.I,
)

_GENERIC_NON_SKILLS = {
    "clear", "strong", "good", "excellent", "skills", "skill", "tools", "tool",
    "other", "general", "support", "experience", "role", "work", "time", "process",
    "management", "reporting", "documentation", "leadership", "communication",
    "team", "ability", "knowledge", "preferred", "required", "mandatory", "basic",
    "advanced", "hands-on", "working", "understanding", "ability to", "etc",
}

_SKILL_DISPLAY_OVERRIDES = {
    "servicenow": "ServiceNow",
    "itil": "ITIL",
    "itil 4": "ITIL 4",
    "itil 4 foundation": "ITIL 4 Foundation",
    "microsoft entra id": "Microsoft Entra ID",
    "microsoft 365": "Microsoft 365",
    "m365": "Microsoft 365",
    "o365": "Office 365",
    "office 365": "Office 365",
    "okta": "Okta",
    "aws": "AWS",
    "gcp": "GCP",
    "sql": "SQL",
    "nosql": "NoSQL",
    "sap": "SAP",
    "iam": "IAM",
    "sccm": "SCCM",
    "dns": "DNS",
    "dhcp": "DHCP",
    "vpn": "VPN",
    "sla": "SLA",
    "itsm": "ITSM",
    "html": "HTML",
    "css": "CSS",
    "api": "API",
    "rest api": "REST API",
    "ci/cd": "CI/CD",
    "devops": "DevOps",
    "power bi": "Power BI",
    "active directory": "Active Directory",
    "azure ad": "Azure AD",
    "teams": "Microsoft Teams",
    "microsoft teams": "Microsoft Teams",
    "intune": "Microsoft Intune",
    "jira": "Jira",
}


def _format_skill_name(raw: str) -> str:
    low = re.sub(r"\s+", " ", raw.strip()).lower()
    if low in _SKILL_DISPLAY_OVERRIDES:
        return _SKILL_DISPLAY_OVERRIDES[low]
    # Preserve mixed-case tech acronyms like GraphQL, PostgreSQL, GitHub, PyTorch
    if any(c.isupper() for c in raw[1:]):
        return raw.strip()
    return raw.strip().title()


def _clean_jd_skill(raw: Any) -> Optional[str]:
    s = re.sub(r"\s+", " ", str(raw or "").strip().strip(".,;:-•()[]"))
    if not s or len(s) < 2 or len(s) > 28:
        return None
    if len(s.split()) > 3:
        return None
    if s.lower() in _GENERIC_NON_SKILLS:
        return None
    if _NOISE_SKILL_PATTERNS.search(s):
        return None
    return _format_skill_name(s)


def _resolve_candidate_name(r: Dict[str, Any]) -> str:
    pd = r.get("parsed_data") or {}
    for val in (pd.get("full_name"), pd.get("name"), r.get("candidate_name")):
        s = str(val or "").strip()
        if s and s.lower() not in ("candidate", "unknown", "n/a", "none"):
            return s
    fn = str(r.get("original_filename") or "").strip()
    if fn:
        stem = re.sub(r"\.(pdf|docx?|txt)$", "", fn, flags=re.I)
        stem = re.sub(r"[_\-]+", " ", stem).strip()
        if stem:
            return stem[:36]
    return "Unnamed Profile"


def _extract_skills(parsed_data: Any) -> List[str]:
    if not isinstance(parsed_data, dict):
        return []
    seen: Dict[str, str] = {}
    for field in _SKILL_FIELDS:
        for raw in (parsed_data.get(field) or []):
            s = str(raw or "").strip()
            if s and len(s) <= 32:
                k = s.lower()
                if k not in seen:
                    seen[k] = s
    return list(seen.values())


def _classify_source(raw: Any, has_app: bool = False) -> Tuple[str, str]:
    """Return (grouped_division, specific_sub_source) for clean executive grouping + hover tooltip breakdown."""
    s = str(raw or "").strip().lower()
    if not s:
        return ("Careers Website", "Careers Page") if has_app else ("Direct & Email", "Direct Upload")

    # 1. Job Portals
    if "naukri" in s:
        return ("Job Portals", "Naukri")
    if "indeed" in s:
        return ("Job Portals", "Indeed")
    if "glassdoor" in s:
        return ("Job Portals", "Glassdoor")
    if "foundit" in s or "monster" in s:
        return ("Job Portals", "Foundit / Monster")
    if "shine" in s:
        return ("Job Portals", "Shine")
    if any(k in s for k in ("portal", "job board", "jobboard")):
        return ("Job Portals", "Other Job Portals")

    # 2. Social & Professional
    if "linkedin" in s:
        return ("Social & Professional", "LinkedIn")
    if "whatsapp" in s:
        return ("Social & Professional", "WhatsApp")
    if any(k in s for k in ("social", "instagram", "facebook", "twitter")):
        return ("Social & Professional", "Social Media")

    # 3. Referrals & Events
    if any(k in s for k in ("refer", "employee", "friend", "internal")):
        return ("Referrals & Events", "Employee Referral")
    if any(k in s for k in ("walk_in", "walk-in", "walk in")):
        return ("Referrals & Events", "Walk-in")
    if "campus" in s:
        return ("Referrals & Events", "Campus Drive")

    # 4. Agencies & Vendors
    if "consult" in s:
        return ("Agencies & Vendors", "Recruitment Consultancy")
    if any(k in s for k in ("staffing", "agency", "vendor")):
        return ("Agencies & Vendors", "Staffing Agency")

    # 5. Careers Website
    if "company_website" in s or "company website" in s:
        return ("Careers Website", "Company Website")
    if any(k in s for k in ("career", "website", "company")):
        return ("Careers Website", "Careers Page")

    # 6. Direct & Email
    if any(k in s for k in ("mail", "email", "inbox")):
        return ("Direct & Email", "Email")
    if any(k in s for k in ("direct", "upload", "manual")):
        return ("Direct & Email", "Direct Upload")

    cleaned = re.sub(r"[_-]+", " ", str(raw).strip()).strip().title()[:28]
    return ("Direct & Email", cleaned or "Direct Upload")


def _parse_number(val: Any) -> Optional[float]:
    if val is None or val == "":
        return None
    if isinstance(val, (int, float)):
        return float(val)
    m = re.search(r"(\d+(?:\.\d+)?)", str(val).replace(",", ""))
    return float(m.group(1)) if m else None


def _ctc_to_lpa(val: Any) -> Optional[float]:
    num = _parse_number(val)
    if num is None or num <= 0:
        return None
    s = str(val).lower()
    if "lpa" in s or "lac" in s or "lakh" in s or num <= 150:
        return num
    # Rupees -> LPA
    if num >= 100000:
        return round(num / 100000.0, 1)
    return None


def _bucket_ctc(lpa: Optional[float]) -> str:
    if lpa is None:
        return "Not Specified"
    if lpa < 6:
        return "< 6 LPA"
    if lpa < 12:
        return "6–12 LPA"
    if lpa < 20:
        return "12–20 LPA"
    if lpa < 35:
        return "20–35 LPA"
    return "35+ LPA"


def _bucket_notice(raw: Any) -> str:
    s = str(raw or "").strip().lower()
    if not s:
        return "Not Specified"
    if any(k in s for k in ("immediate", "serving", "available now", "immidiate")) or re.search(r"\b0\s*days?\b", s):
        return "Immediate"
    num = _parse_number(s)
    if num is not None:
        if "month" in s:
            num *= 30
        if num <= 15:
            return "≤ 15 days"
        if num <= 30:
            return "30 days"
        if num <= 60:
            return "60 days"
        return "90+ days"
    return "Not Specified"


def _normalize_city(raw: Any) -> str:
    s = str(raw or "").strip()
    if not s:
        return ""
    low = s.lower()
    city_map = [
        ("Bengaluru", ("bengaluru", "bangalore", "blr")),
        ("Chennai", ("chennai", "madras")),
        ("Hyderabad", ("hyderabad", "secunderabad", "hyd")),
        ("Pune", ("pune",)),
        ("Mumbai", ("mumbai", "navi mumbai", "thane", "bombay")),
        ("Delhi NCR", ("delhi", "noida", "gurgaon", "gurugram", "faridabad", "ghaziabad", "ncr")),
        ("Kolkata", ("kolkata", "calcutta")),
        ("Coimbatore", ("coimbatore",)),
        ("Kochi", ("kochi", "cochin")),
        ("Ahmedabad", ("ahmedabad",)),
        ("Remote", ("remote", "anywhere")),
    ]
    for label, patterns in city_map:
        if any(p in low for p in patterns):
            return label
    first = s.split(",")[0].strip()
    return first[:24] if first else ""


def _categorize_rejection(note: Any, rec: Any) -> str:
    text = f"{note or ''} {rec or ''}".strip().lower()
    if not text:
        return "Not a role fit"
    if any(k in text for k in ("ctc", "salary", "budget", "compensation", "package", "expectation")):
        return "Salary mismatch"
    if any(k in text for k in ("notice", "joining", "availability", "immediate")):
        return "Long notice period"
    if any(k in text for k in ("comm", "articulation", "english", "soft skill")):
        return "Communication"
    if any(k in text for k in ("culture", "attitude", "fit", "team")):
        return "Team fit"
    if any(k in text for k in ("location", "relocat", "onsite", "hybrid", "commute")):
        return "Location issue"
    if any(k in text for k in ("no show", "absent", "didn't join", "ghost")):
        return "Did not attend"
    if any(k in text for k in ("exp", "senior", "junior", "hands-on", "depth", "tech", "coding", "skill")):
        return "Skills mismatch"
    return "Not a role fit"


async def compute_dashboard_insights(
    service: DashboardService,
    stuck_days: int = 7,
    filters: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Compute all 12 Phase 3 executive dashboard widgets from MongoDB in one parallel batch.
    """
    db = get_database()
    norm_f = filters or service._normalize_filters()
    has_filters = service._has_active_filters(norm_f)
    now_utc = datetime.now(timezone.utc)

    clamped_offset = max(-840, min(840, int(norm_f.get("tz_offset_minutes") or 0)))
    user_tz = timezone(timedelta(minutes=-clamped_offset))
    now_local = now_utc.astimezone(user_tz)
    local_today_str = now_local.date().isoformat()

    resumes_proj = {
        "_id": 0,
        "id": 1,
        "resume_id": 1,
        "candidate_id": 1,
        "candidate_name": 1,
        "original_filename": 1,
        "status": 1,
        "parse_error": 1,
        "email_conflict": 1,
        "upload_date": 1,
        "created_at": 1,
        "updated_at": 1,
        "resume_source": 1,
        "applicant_heard_from": 1,
        "hr_updates": 1,
        "job_opening_id": 1,
        "job_title": 1,
        "uploaded_by_email": 1,
        "uploaded_by_name": 1,
        "ai_evaluation.ai_technical_score": 1,
        "ai_evaluation.overall_score": 1,
        "parsed_data.full_name": 1,
        "parsed_data.name": 1,
        "parsed_data.email": 1,
        "parsed_data.phone": 1,
        "parsed_data.location": 1,
        "parsed_data.city": 1,
        "parsed_data.current_location": 1,
        "parsed_data.current_role": 1,
        "parsed_data.total_experience_years": 1,
        "parsed_data.notice_period": 1,
        "parsed_data.current_ctc": 1,
        "parsed_data.expected_ctc": 1,
        **{f"parsed_data.{f}": 1 for f in _SKILL_FIELDS},
    }

    interviews_proj = {
        "_id": 0,
        "id": 1,
        "candidate_id": 1,
        "candidate_name": 1,
        "resume_id": 1,
        "job_id": 1,
        "job_opening_id": 1,
        "job_title": 1,
        "status": 1,
        "recommendation": 1,
        "reason_note": 1,
        "feedback": 1,
        "scheduled_date": 1,
        "scheduled_time": 1,
        "meeting_link": 1,
        "interviewer_name": 1,
        "interviewer_email": 1,
        "interviewers": 1,
        "created_at": 1,
        "updated_at": 1,
        "reschedule_count": 1,
        "salary_requested": 1,
        "final_fit_salary": 1,
        "created_by": 1,
        "scheduled_by": 1,
    }

    resumes_task = db[RESUMES_COLLECTION].find({"redirect_id": None}, resumes_proj).to_list(length=10000)
    interviews_task = db[INTERVIEWS_COLLECTION].find({}, interviews_proj).to_list(length=10000)
    jobs_task = db["job_openings"].find({}, {"_id": 0}).sort("created_at", -1).to_list(length=500)
    apps_task = db["job_applications"].find(
        {},
        {"_id": 0, "id": 1, "opening_id": 1, "job_opening_id": 1, "opening_title": 1, "resume_id": 1, "submitted_at": 1, "heard_from": 1},
    ).to_list(length=10000)

    if has_filters:
        ctx, resumes_all, interviews_all, jobs_all, apps_all = await asyncio.gather(
            service._resolve_filter_context(norm_f),
            resumes_task,
            interviews_task,
            jobs_task,
            apps_task,
        )
        resumes = [r for r in resumes_all if service._resume_matches(r, ctx)]
        allowed_rids = {str(r.get("id") or r.get("resume_id") or "") for r in resumes}
        interviews = [
            inv for inv in interviews_all if service._interview_matches(inv, ctx, allowed_rids, check_date=True)
        ]
        apps = [
            a for a in apps_all
            if service._dt_in_range(service._parse_utc_dt(a.get("submitted_at")), ctx)
        ]
    else:
        resumes_all, interviews_all, jobs_all, apps_all = await asyncio.gather(
            resumes_task, interviews_task, jobs_task, apps_task
        )
        resumes = resumes_all
        interviews = interviews_all
        apps = apps_all

    # Index interviews by candidate/resume key
    inv_by_cand: Dict[str, List[Dict[str, Any]]] = {}
    for inv in interviews:
        key = str(inv.get("resume_id") or inv.get("candidate_id") or "")
        if key:
            inv_by_cand.setdefault(key, []).append(inv)

    # Index applications by resume_id and job_id
    app_by_resume: Dict[str, List[Dict[str, Any]]] = {}
    apps_by_job: Dict[str, List[Dict[str, Any]]] = {}
    for a in apps:
        rid = str(a.get("resume_id") or "")
        if rid:
            app_by_resume.setdefault(rid, []).append(a)
        oid = str(a.get("opening_id") or a.get("job_opening_id") or "")
        if oid:
            apps_by_job.setdefault(oid, []).append(a)

    # Compute per-candidate latest stage, dwell, and duplicate keys
    email_counts: Counter = Counter()
    phone_counts: Counter = Counter()
    for r in resumes:
        pd = r.get("parsed_data") or {}
        em = str(pd.get("email") or "").strip().lower()
        ph = re.sub(r"\D", "", str(pd.get("phone") or ""))[-10:]
        if em:
            email_counts[em] += 1
        if len(ph) >= 8:
            phone_counts[ph] += 1

    # ── 1. Needs Your Attention + 8. AI Parsing Quality + 9. Candidate Extras ──
    unreviewed_count = 0
    low_conf_or_failed = 0
    stuck_total = 0
    pending_offers_count = 0
    possible_duplicates = 0

    failed_parse_count = 0
    confidence_scores: List[float] = []
    missing_field_counts: Counter = Counter()

    location_counts: Counter = Counter()
    notice_buckets: Counter = Counter()
    current_ctc_buckets: Counter = Counter()
    expected_ctc_buckets: Counter = Counter()
    real_ctc_present = 0

    pool_skill_counts: Counter = Counter()
    candidate_stage_map: Dict[str, str] = {}
    candidate_skills_map: Dict[str, Tuple[Dict[str, Any], set]] = {}

    for r in resumes:
        rid = str(r.get("id") or r.get("resume_id") or "")
        pd = r.get("parsed_data") or {}
        status_str = str(r.get("status") or "").upper()
        upload_dt = service._parse_utc_dt(r.get("upload_date") or r.get("created_at"))

        cand_invs = inv_by_cand.get(rid) or inv_by_cand.get(str(r.get("candidate_id") or "")) or []
        if cand_invs:
            active_invs = [i for i in cand_invs if str(i.get("status") or "").upper() != "CANCELLED"] or cand_invs
            latest = max(
                active_invs,
                key=lambda i: (str(i.get("scheduled_date") or ""), str(i.get("scheduled_time") or ""), str(i.get("created_at") or "")),
            )
            earliest = min(active_invs, key=lambda i: (str(i.get("created_at") or ""), str(i.get("scheduled_date") or "")))
            st = stage_of(latest.get("recommendation"), latest.get("status"))
            first_inv_dt = service._parse_utc_dt(earliest.get("created_at") or earliest.get("scheduled_date"))
            latest_inv_dt = service._parse_utc_dt(latest.get("updated_at") or latest.get("scheduled_date") or latest.get("created_at"))
            if st == "Interviewing" and first_inv_dt:
                d_int = max(0.0, (now_utc - first_inv_dt).total_seconds() / 86400.0)
                if d_int > stuck_days:
                    stuck_total += 1
            elif st == "Offer":
                pending_offers_count += 1
                if latest_inv_dt:
                    d_st = max(0.0, (now_utc - latest_inv_dt).total_seconds() / 86400.0)
                    if d_st > stuck_days:
                        stuck_total += 1
        else:
            st = "Screening"
            if not r.get("hr_updates"):
                unreviewed_count += 1
            if upload_dt:
                d_scr = max(0.0, (now_utc - upload_dt).total_seconds() / 86400.0)
                if d_scr > stuck_days:
                    stuck_total += 1

        candidate_stage_map[rid] = st

        # Duplicates
        em = str(pd.get("email") or "").strip().lower()
        ph = re.sub(r"\D", "", str(pd.get("phone") or ""))[-10:]
        if r.get("email_conflict") or (em and email_counts[em] > 1) or (len(ph) >= 8 and phone_counts[ph] > 1):
            possible_duplicates += 1

        # Parsing quality & missing fields
        is_failed = status_str == "FAILED" or bool(r.get("parse_error")) or not isinstance(pd, dict) or len(pd) == 0
        if is_failed:
            failed_parse_count += 1
            low_conf_or_failed += 1
        else:
            skills_list = _extract_skills(pd)
            has_name = bool(pd.get("full_name") or pd.get("name") or r.get("candidate_name"))
            has_email = bool(em)
            has_phone = len(ph) >= 8
            has_exp = _parse_number(pd.get("total_experience_years")) is not None
            has_loc = bool(pd.get("location") or pd.get("city") or pd.get("current_location"))
            has_notice = bool(pd.get("notice_period"))
            # Also check interview-recorded salary fields as fallback for CTC
            inv_req_sal = next((i.get("salary_requested") for i in cand_invs if i.get("salary_requested")), None)
            inv_fit_sal = next((i.get("final_fit_salary") for i in cand_invs if i.get("final_fit_salary")), None)
            raw_cur_ctc = pd.get("current_ctc") or inv_fit_sal
            raw_exp_ctc = pd.get("expected_ctc") or inv_req_sal
            has_ctc = bool(raw_exp_ctc or raw_cur_ctc)
            has_skills = len(skills_list) > 0

            if not has_email:
                missing_field_counts["Email"] += 1
            if not has_phone:
                missing_field_counts["Phone"] += 1
            if not has_exp:
                missing_field_counts["Experience"] += 1
            if not has_loc:
                missing_field_counts["Location"] += 1
            if not has_notice:
                missing_field_counts["Notice Period"] += 1
            if not has_ctc:
                missing_field_counts["Expected CTC"] += 1
            if not has_skills:
                missing_field_counts["Skills"] += 1

            core_score = (
                (20 if has_name else 0)
                + (20 if has_email else 0)
                + (15 if has_phone else 0)
                + (15 if has_exp else 0)
                + (15 if has_skills else 0)
                + (15 if has_loc else 0)
            )
            confidence_scores.append(float(core_score))
            if core_score < 65:
                low_conf_or_failed += 1

            # Skills & Demographics (normalize keys case-insensitively with clean display names)
            skill_set_lower = set()
            for sk in skills_list:
                cleaned_sk = _clean_jd_skill(sk)
                if cleaned_sk:
                    sk_key = cleaned_sk.lower()
                    pool_skill_counts[sk_key] += 1
                    skill_set_lower.add(sk_key)
                else:
                    skill_set_lower.add(sk.lower())
            candidate_skills_map[rid] = (r, skill_set_lower)

            city = _normalize_city(pd.get("location") or pd.get("city") or pd.get("current_location"))
            if city:
                location_counts[city] += 1
            nb = _bucket_notice(pd.get("notice_period"))
            notice_buckets[nb] += 1

            cur_lpa = _ctc_to_lpa(raw_cur_ctc)
            exp_lpa = _ctc_to_lpa(raw_exp_ctc)
            if cur_lpa is not None or exp_lpa is not None:
                real_ctc_present += 1
            current_ctc_buckets[_bucket_ctc(cur_lpa)] += 1
            expected_ctc_buckets[_bucket_ctc(exp_lpa)] += 1

    # Completed interviews awaiting feedback
    awaiting_feedback_count = sum(
        1
        for inv in interviews
        if str(inv.get("status") or "").upper() == "COMPLETED"
        and not str(inv.get("recommendation") or "").strip()
        and not str(inv.get("feedback") or "").strip()
    )

    needs_attention = [
        {
            "key": "unreviewed_resumes",
            "label": "Resumes parsed, not yet reviewed",
            "count": unreviewed_count,
            "severity": "info" if unreviewed_count > 0 else "clear",
            "actionPath": "/database?attention=unreviewed",
        },
        {
            "key": "low_confidence",
            "label": "Low-confidence or failed parses",
            "count": low_conf_or_failed,
            "severity": "warning" if low_conf_or_failed > 0 else "clear",
            "actionPath": "/database?attention=low_confidence",
        },
        {
            "key": "stuck_candidates",
            "label": f"Candidates stuck in a stage > {stuck_days} days",
            "count": stuck_total,
            "severity": "danger" if stuck_total > 0 else "clear",
            "actionPath": f"/database?attention=stuck&days={stuck_days}",
        },
        {
            "key": "awaiting_feedback",
            "label": "Interviews completed, awaiting feedback",
            "count": awaiting_feedback_count,
            "severity": "warning" if awaiting_feedback_count > 0 else "clear",
            "actionPath": "/interviews?view=all&filter=awaiting_feedback",
        },
        {
            "key": "possible_duplicates",
            "label": "Possible duplicate candidate profiles",
            "count": possible_duplicates,
            "severity": "warning" if possible_duplicates > 0 else "clear",
            "actionPath": "/pipeline?tab=duplicates",
        },
        {
            "key": "pending_offers",
            "label": "Offers pending response or expiring soon",
            "count": pending_offers_count,
            "severity": "info" if pending_offers_count > 0 else "clear",
            "actionPath": "/pipeline?tab=offers",
        },
    ]

    # ── 2. Today's Interviews Timeline (Local Today) ──
    todays_interviews = []
    for inv in interviews_all:
        sdate = str(inv.get("scheduled_date") or "")[:10]
        st_up = str(inv.get("status") or "").upper()
        if sdate == local_today_str and st_up != "CANCELLED":
            panel = inv.get("interviewers") or []
            interviewer = (
                inv.get("interviewer_name")
                or (panel[0].get("interviewer_name") if panel and isinstance(panel[0], dict) else None)
                or "Hiring Panel"
            )
            todays_interviews.append({
                "id": str(inv.get("id") or ""),
                "candidate": str(inv.get("candidate_name") or "Candidate"),
                "candidate_id": str(inv.get("resume_id") or inv.get("candidate_id") or ""),
                "role": str(inv.get("job_title") or "Role"),
                "interviewer": str(interviewer),
                "time": str(inv.get("scheduled_time") or "TBD"),
                "date": sdate,
                "status": st_up or "SCHEDULED",
                "meeting_link": str(inv.get("meeting_link") or ""),
            })
    todays_interviews.sort(key=lambda x: x["time"])

    # ── 3. Applications & Uploads Trend (Daily / Weekly / Monthly) ──
    daily_res: Counter = Counter()
    daily_app: Counter = Counter()
    weekly_res: Counter = Counter()
    weekly_app: Counter = Counter()
    monthly_res: Counter = Counter()
    monthly_app: Counter = Counter()

    for r in resumes:
        dt = service._parse_utc_dt(r.get("upload_date") or r.get("created_at"))
        if not dt:
            continue
        ld = dt.astimezone(user_tz).date()
        daily_res[ld.isoformat()] += 1
        wk = (ld - timedelta(days=ld.weekday())).isoformat()
        weekly_res[wk] += 1
        monthly_res[ld.strftime("%Y-%m")] += 1

    for a in apps:
        dt = service._parse_utc_dt(a.get("submitted_at"))
        if not dt:
            continue
        ld = dt.astimezone(user_tz).date()
        daily_app[ld.isoformat()] += 1
        wk = (ld - timedelta(days=ld.weekday())).isoformat()
        weekly_app[wk] += 1
        monthly_app[ld.strftime("%Y-%m")] += 1

    today_local_date = now_local.date()
    daily_series = []
    for i in range(13, -1, -1):
        d = today_local_date - timedelta(days=i)
        k = d.isoformat()
        daily_series.append({
            "label": d.strftime("%b %d"),
            "resumes": daily_res.get(k, 0),
            "applications": daily_app.get(k, 0),
        })

    weekly_series = []
    curr_wk = today_local_date - timedelta(days=today_local_date.weekday())
    for i in range(7, -1, -1):
        w = curr_wk - timedelta(weeks=i)
        k = w.isoformat()
        weekly_series.append({
            "label": f"Wk {w.strftime('%b %d')}",
            "resumes": weekly_res.get(k, 0),
            "applications": weekly_app.get(k, 0),
        })

    monthly_series = []
    y, m = today_local_date.year, today_local_date.month
    months_list = []
    for _ in range(6):
        months_list.append((y, m))
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    for yy, mm in reversed(months_list):
        k = f"{yy:04d}-{mm:02d}"
        lbl = datetime(yy, mm, 1).strftime("%b %y")
        monthly_series.append({
            "label": lbl,
            "resumes": monthly_res.get(k, 0),
            "applications": monthly_app.get(k, 0),
        })

    applications_trend = {
        "daily": daily_series,
        "weekly": weekly_series,
        "monthly": monthly_series,
    }

    # ── 4. Source of Hire (grouped divisions with sub-source breakdown for hover tooltip) ──
    source_stats: Dict[str, Dict[str, Any]] = {}
    for r in resumes:
        rid = str(r.get("id") or r.get("resume_id") or "")
        r_apps = app_by_resume.get(rid, [])
        raw_src = r.get("resume_source") or r.get("applicant_heard_from") or (r_apps[0].get("heard_from") if r_apps else None)
        group_name, sub_name = _classify_source(raw_src, has_app=bool(r_apps))
        entry = source_stats.setdefault(
            group_name,
            {"candidates": 0, "interviewed": 0, "selected": 0, "sub_counts": Counter()},
        )
        entry["candidates"] += 1
        entry["sub_counts"][sub_name] += 1
        cand_invs = inv_by_cand.get(rid) or inv_by_cand.get(str(r.get("candidate_id") or "")) or []
        if cand_invs:
            entry["interviewed"] += 1
            if any(verdict_of(i.get("recommendation"), i.get("status")) == "Selected" for i in cand_invs):
                entry["selected"] += 1

    source_of_hire = [
        {
            "source": src,
            "candidates": d["candidates"],
            "interviewed": d["interviewed"],
            "selected": d["selected"],
            "conversion_rate": round((d["interviewed"] / d["candidates"]) * 100, 1) if d["candidates"] > 0 else 0.0,
            "breakdown": [
                {"name": sub, "count": cnt}
                for sub, cnt in d["sub_counts"].most_common()
            ],
        }
        for src, d in sorted(source_stats.items(), key=lambda x: -x[1]["candidates"])
    ]

    # ── 5. Open Jobs Health + 6. Skills Demand vs Supply + 11. AI Recommendations ──
    open_jobs = [j for j in jobs_all if str(j.get("status") or "").upper() == "OPEN"]
    jd_skill_demand: Counter = Counter()
    open_jobs_health = []
    missed_candidates = []

    for j in open_jobs:
        jid = str(j.get("id") or "")
        jtitle = str(j.get("title") or "Untitled Role")
        jdept = str(j.get("department") or "General")
        created_dt = service._parse_utc_dt(j.get("created_at"))
        days_open = max(0, int((now_utc - created_dt).total_seconds() // 86400)) if created_dt else 0

        req_raw = [str(s).strip() for s in (j.get("required_skills") or []) if str(s).strip()]
        pref_raw = [str(s).strip() for s in (j.get("preferred_skills") or []) if str(s).strip()]
        req_skills = [c for c in (_clean_jd_skill(s) for s in req_raw) if c]
        pref_skills = [c for c in (_clean_jd_skill(s) for s in pref_raw) if c]

        # Also extract known pool skills mentioned in JD title, description, or raw required skills
        jd_blob = " ".join([
            jtitle,
            str(j.get("description") or ""),
            " ".join(req_raw),
            " ".join(pref_raw),
        ]).lower()
        pool_vocab_top = [sk for sk, _ in pool_skill_counts.most_common(60) if len(sk) >= 2]
        detected_pool_skills = [
            _format_skill_name(sk) for sk in pool_vocab_top
            if re.search(r"(?<![a-z0-9])" + re.escape(sk) + r"(?![a-z0-9])", jd_blob)
        ]

        # Deduplicate effective skills case-insensitively
        eff_map: Dict[str, str] = {}
        for s in (*detected_pool_skills, *req_skills):
            k = s.lower()
            if k not in eff_map:
                eff_map[k] = _format_skill_name(s)
        effective_req = list(eff_map.values())[:10]
        for s in effective_req:
            jd_skill_demand[s.lower()] += 1
        target_skills = {s.lower() for s in (*effective_req, *pref_skills)}
        title_tokens = {
            tok for tok in re.findall(r"[a-z0-9+#.]{3,}", jtitle.lower())
            if tok not in ("senior", "junior", "lead", "engineer", "analyst", "manager", "specialist", "director", "shift")
        }

        j_apps = apps_by_job.get(jid, [])
        j_app_rids = {str(a.get("resume_id") or "") for a in j_apps if a.get("resume_id")}
        j_invs = [
            inv for inv in interviews
            if str(inv.get("job_opening_id") or inv.get("job_id") or "") == jid
            or str(inv.get("job_title") or "").strip().lower() == jtitle.strip().lower()
            or str(inv.get("resume_id") or "") in j_app_rids
        ]
        j_interviewed_cands = {str(i.get("resume_id") or i.get("candidate_id") or "") for i in j_invs if i.get("resume_id") or i.get("candidate_id")}
        j_shortlisted = sum(
            1 for i in j_invs if verdict_of(i.get("recommendation"), i.get("status")) == "Selected"
        )
        applicants_count = max(len(j_apps), len(j_interviewed_cands))

        # Score candidate pool against this job for Top 3 AI Matches
        scored_cands = []
        for rid, (r_doc, cand_skills_lower) in candidate_skills_map.items():
            pd = r_doc.get("parsed_data") or {}
            cand_role = str(pd.get("current_role") or "").lower()
            overlap = sorted(target_skills.intersection(cand_skills_lower)) if target_skills else []
            title_hit = sum(1 for t in title_tokens if t in cand_role) if title_tokens else 0

            if target_skills:
                denom = min(len(target_skills), 5)
                skill_pct = min(78.0, (len(overlap) / max(denom, 1)) * 78.0)
            else:
                skill_pct = 50.0 if title_hit > 0 else 25.0
            ai_tech = _parse_number((r_doc.get("ai_evaluation") or {}).get("ai_technical_score")) or 0.0
            bonus = min(18.0, title_hit * 9.0) + min(12.0, (ai_tech / 100.0) * 12.0)
            match_pct = int(min(97, max(42, round(skill_pct + bonus))))
            is_applied = (
                rid in j_app_rids
                or str(r_doc.get("job_opening_id") or "") == jid
                or rid in j_interviewed_cands
            )
            if overlap or title_hit > 0 or is_applied:
                scored_cands.append({
                    "id": rid,
                    "name": _resolve_candidate_name(r_doc),
                    "role": str(pd.get("current_role") or "Candidate"),
                    "match_pct": match_pct,
                    "matched_skills": [s.title() for s in overlap[:4]],
                    "stage": candidate_stage_map.get(rid, "Screening"),
                    "applied": is_applied,
                    "upload_dt": service._parse_utc_dt(r_doc.get("upload_date") or r_doc.get("created_at")),
                })

        # Highlight applied candidates first, then sort by match percentage
        scored_cands.sort(key=lambda x: (not x["applied"], -x["match_pct"]))
        top3 = [
            {
                "id": c["id"],
                "name": c["name"],
                "role": c["role"],
                "match_pct": c["match_pct"],
                "matched_skills": c["matched_skills"],
                "stage": c["stage"],
                "applied": c["applied"],
            }
            for c in scored_cands[:3]
        ]

        if days_open > 30 and j_shortlisted == 0:
            health = "open_too_long"
        elif applicants_count < 3:
            health = "low_applicants"
        else:
            health = "healthy"

        open_jobs_health.append({
            "id": jid,
            "title": jtitle,
            "department": jdept,
            "applicants": applicants_count,
            "shortlisted": j_shortlisted,
            "interviewed": len(j_interviewed_cands),
            "days_open": days_open,
            "health": health,
            "top_matches": top3,
        })

        # Uncontacted talent matches: candidates still in Screening who did NOT apply to this job yet
        # (ensures Suggested Candidates surfaces distinct hidden talent instead of repeating Open Jobs applicants)
        for c in scored_cands[:15]:
            if c["stage"] == "Screening" and not c["applied"] and c["match_pct"] >= 55:
                age_days = (
                    max(0, int((now_utc - c["upload_dt"]).total_seconds() // 86400))
                    if c["upload_dt"]
                    else 0
                )
                missed_candidates.append({
                    "id": c["id"],
                    "name": c["name"],
                    "role": c["role"],
                    "matched_job": jtitle,
                    "job_id": jid,
                    "match_pct": c["match_pct"],
                    "days_in_pool": age_days,
                    "matched_skills": c["matched_skills"],
                })

    # Deduplicate missed candidates by candidate id, keep best match
    dedup_missed: Dict[str, Dict[str, Any]] = {}
    for mc in sorted(missed_candidates, key=lambda x: -x["match_pct"]):
        if mc["id"] not in dedup_missed:
            dedup_missed[mc["id"]] = mc
    missed_list = list(dedup_missed.values())[:5]

    # ── 7. Skills Demand vs Supply ──
    # Case-insensitive matching between open JD requirements and parsed candidate skills
    if jd_skill_demand:
        top_skill_keys = [k for k, _ in jd_skill_demand.most_common(8)]
    else:
        top_skill_keys = [k for k, _ in pool_skill_counts.most_common(8)]

    skills_gap = []
    for sk_key in top_skill_keys:
        demand_jobs = jd_skill_demand.get(sk_key, 0)
        supply_cands = pool_skill_counts.get(sk_key, 0)
        # Also catch broader family match for certified/qualified skills like "itil 4 foundation" -> "itil"
        if supply_cands == 0 and " " in sk_key:
            first_word = sk_key.split()[0]
            if len(first_word) >= 3 and first_word in pool_skill_counts:
                supply_cands = pool_skill_counts.get(first_word, 0)
        # Target healthy supply: ~8 candidates per open role demanding the skill
        target_supply = max(demand_jobs * 8, 5) if demand_jobs > 0 else 5
        coverage_pct = min(100, round((supply_cands / target_supply) * 100)) if target_supply > 0 else 100
        severity = "high" if coverage_pct < 40 else ("medium" if coverage_pct < 75 else "covered")
        skills_gap.append({
            "skill": _format_skill_name(sk_key),
            "demand_jobs": demand_jobs,
            "supply_candidates": supply_cands,
            "coverage_pct": coverage_pct,
            "gap_severity": severity,
        })
    skills_gap.sort(key=lambda x: (-x["demand_jobs"], x["coverage_pct"]))

    # ── 8. AI Parsing Quality Panel ──
    total_r = len(resumes)
    parse_success_rate = round(((total_r - failed_parse_count) / total_r) * 100, 1) if total_r > 0 else 100.0
    avg_confidence = round(sum(confidence_scores) / len(confidence_scores), 1) if confidence_scores else 0.0
    missing_fields = [
        {
            "field": field,
            "count": cnt,
            "percent": round((cnt / max(total_r - failed_parse_count, 1)) * 100, 1),
        }
        for field, cnt in missing_field_counts.most_common(6)
    ]
    parsing_quality = {
        "total_resumes": total_r,
        "parse_success_rate": parse_success_rate,
        "avg_confidence_score": avg_confidence,
        "failed_count": failed_parse_count,
        "missing_fields": missing_fields,
    }

    # ── 9. Candidate Distribution Extras (Indian Hiring) ──
    notice_order = ["Immediate", "≤ 15 days", "30 days", "60 days", "90+ days", "Not Specified"]
    ctc_order = ["< 6 LPA", "6–12 LPA", "12–20 LPA", "20–35 LPA", "35+ LPA"]

    candidate_extras = {
        "locations": [
            {"label": city, "count": cnt, "percent": round((cnt / max(total_r, 1)) * 100)}
            for city, cnt in location_counts.most_common(6)
        ],
        "notice_periods": [
            {"label": nb, "count": notice_buckets.get(nb, 0), "percent": round((notice_buckets.get(nb, 0) / max(total_r, 1)) * 100)}
            for nb in notice_order
            if notice_buckets.get(nb, 0) > 0
        ],
        "ctc_bands": [
            {
                "band": b,
                "current_count": current_ctc_buckets.get(b, 0),
                "expected_count": expected_ctc_buckets.get(b, 0),
            }
            for b in ctc_order
        ],
        "ctc_has_real_data": real_ctc_present > 0,
    }

    # ── 10. Interviewer Workload ──
    interviewer_map: Dict[str, Dict[str, Any]] = {}
    no_show_count = 0
    rescheduled_count = 0
    total_invs = len(interviews)

    for inv in interviews:
        st_up = str(inv.get("status") or "").upper()
        verd = verdict_of(inv.get("recommendation"), inv.get("status"))
        if st_up == "NO_SHOW" or verd == "No Show":
            no_show_count += 1
        if st_up == "RESCHEDULED" or (inv.get("reschedule_count") or 0) > 0:
            rescheduled_count += 1

        names = []
        for p in (inv.get("interviewers") or []):
            if isinstance(p, dict) and p.get("interviewer_name"):
                names.append(str(p["interviewer_name"]).strip())
        if not names and inv.get("interviewer_name"):
            names.append(str(inv["interviewer_name"]).strip())
        if not names:
            names.append("Unassigned Panel")

        is_pending_fb = st_up == "COMPLETED" and not str(inv.get("recommendation") or "").strip() and not str(inv.get("feedback") or "").strip()

        for nm in names:
            norm_key = re.sub(r"\s+", " ", nm.strip()).lower()
            display_name = nm.strip()
            if display_name.islower() or display_name.isupper():
                display_name = display_name.title()
            entry = interviewer_map.setdefault(
                norm_key, {"name": display_name, "total": 0, "completed": 0, "pending_feedback": 0}
            )
            # Prefer mixed-case display name if seen later
            if not (nm.strip().islower() or nm.strip().isupper()):
                entry["name"] = nm.strip()
            entry["total"] += 1
            if st_up == "COMPLETED":
                entry["completed"] += 1
            if is_pending_fb:
                entry["pending_feedback"] += 1

    interviewers_list = [
        {
            "name": d["name"],
            "total_interviews": d["total"],
            "completed": d["completed"],
            "pending_feedback": d["pending_feedback"],
        }
        for d in sorted(interviewer_map.values(), key=lambda x: -x["total"])[:6]
    ]

    interviewer_workload = {
        "interviewers": interviewers_list,
        "no_show_rate": round((no_show_count / total_invs) * 100, 1) if total_invs > 0 else 0.0,
        "reschedule_rate": round((rescheduled_count / total_invs) * 100, 1) if total_invs > 0 else 0.0,
        "total_rounds": total_invs,
    }

    # ── 11. Rejection Reasons & Offer Outcomes ──
    rejection_counter: Counter = Counter()
    offers_extended = 0
    offers_accepted = 0
    offers_declined = 0

    for inv in interviews:
        rec_low = str(inv.get("recommendation") or "").strip().lower()
        verd = verdict_of(inv.get("recommendation"), inv.get("status"))
        if rec_low in ("offer to be released", "offer accepted", "offer rejected"):
            offers_extended += 1
            if rec_low == "offer accepted":
                offers_accepted += 1
            elif rec_low == "offer rejected":
                offers_declined += 1
        elif verd == "Rejected" or rec_low in ("rejected", "not recommended", "no hire"):
            rejection_counter[_categorize_rejection(inv.get("reason_note") or inv.get("feedback"), rec_low)] += 1

    total_rej = sum(rejection_counter.values())
    rejection_reasons = [
        {
            "reason": rsn,
            "count": cnt,
            "percent": round((cnt / total_rej) * 100) if total_rej > 0 else 0,
        }
        for rsn, cnt in rejection_counter.most_common(5)
    ]

    offer_acceptance_rate = (
        round((offers_accepted / offers_extended) * 100, 1) if offers_extended > 0 else None
    )

    rejection_and_offers = {
        "rejection_reasons": rejection_reasons,
        "total_rejections": total_rej,
        "offers_extended": offers_extended,
        "offers_accepted": offers_accepted,
        "offers_declined": offers_declined,
        "offer_acceptance_rate": offer_acceptance_rate,
    }

    return {
        "needsAttention": needs_attention,
        "todaysInterviews": todays_interviews,
        "applicationsTrend": applications_trend,
        "sourceOfHire": source_of_hire,
        "openJobsHealth": open_jobs_health,
        "skillsGap": skills_gap,
        "parsingQuality": parsing_quality,
        "candidateExtras": candidate_extras,
        "interviewerWorkload": interviewer_workload,
        "rejectionAndOffers": rejection_and_offers,
        "aiRecommendations": {
            "missed_candidates": missed_list,
        },
    }

