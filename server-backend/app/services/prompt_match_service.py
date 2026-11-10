"""JD Match prompt mode (phase 1).

A recruiter types a request or pastes a job description. The AI parser turns it into a search plan
(skills, years, titles, locations) once; this service then finds a pool of candidates with the existing
filter query and ranks them with a fixed match score, so results are fast, repeatable and explainable.
"""

import hashlib
import json
import math
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx
from loguru import logger
from starlette import status

from app.core.config import settings
from app.core.exceptions import AppException, BadRequestError
from app.repositories.resume_repository import SKILL_FIELDS, SKILL_GROUPS, ResumeRepository, skill_regex
from app.schemas.resume import ResumeResponse

PLAN_CACHE_COLLECTION = "search_plans"
RERANK_CACHE_COLLECTION = "rerank_results"
RERANK_TOP = 25            # candidates the AI re-ranks and explains (phase 2)
RERANK_AI_WEIGHT = 0.3     # final score = 70% code score + 30% AI fit score, so one odd AI answer can't reorder the list
PLAN_CACHE_HOURS = 24
POOL_LIMIT = 500          # most candidates scored for one search
GOOD_MATCH = 60           # score that counts as a good match
MIN_GOOD_MATCHES = 10     # fewer good matches than this -> widen the pool and say so
MAX_PROMPT_CHARS = 15000

# Points per part of the match score. Parts the plan says nothing about are left out and the rest
# scaled to 100, so "HR generalist, 5 years" is not marked down for having no skills listed.
WEIGHTS = {"must_have": 50, "nice_to_have": 15, "experience": 15, "role": 10,
           "location": 5, "education": 5, "keywords": 5, "ai_score": 5}

# Too few years is a near-requirement, not just 15 points: a fresher with the right skills should not
# rank above people who have the years. Each missing year takes 15% off the total, at most half.
SHORT_YEARS_PENALTY = 0.15
SHORT_YEARS_FLOOR = 0.5

PLAN_LIST_FIELDS = ["role_titles", "must_have_skills", "nice_to_have_skills", "locations", "education", "keywords"]
TITLE_STOP_WORDS = {"and", "or", "of", "the", "for", "with", "in", "a", "an", "to", "sr", "jr"}


# ---------------------------------------------------------------- the plan

def normalise_plan(plan: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Accept a plan from the parser or one the recruiter edited: lists stay lists, years stay numbers."""
    plan = dict(plan or {})
    out: Dict[str, Any] = {}
    for field in PLAN_LIST_FIELDS:
        items = plan.get(field) or []
        if isinstance(items, str):
            items = [items]
        seen, clean = set(), []
        for item in items:
            text = " ".join(str(item).split())
            if text and text.lower() not in seen:
                seen.add(text.lower())
                clean.append(text)
        out[field] = clean
    must_lower = {s.lower() for s in out["must_have_skills"]}
    out["nice_to_have_skills"] = [s for s in out["nice_to_have_skills"] if s.lower() not in must_lower]
    for field in ("min_experience", "max_experience"):
        try:
            value = plan.get(field)
            out[field] = None if value in (None, "") else max(0.0, float(value))
        except (TypeError, ValueError):
            out[field] = None
    if out["min_experience"] is not None and out["max_experience"] is not None and out["min_experience"] > out["max_experience"]:
        out["min_experience"], out["max_experience"] = out["max_experience"], out["min_experience"]
    out["role_family"] = plan.get("role_family") or None
    out["level"] = plan.get("level") or None
    return out


def plan_is_empty(plan: Dict[str, Any]) -> bool:
    return not any(plan.get(f) for f in PLAN_LIST_FIELDS) and plan.get("min_experience") is None \
        and plan.get("max_experience") is None


# ---------------------------------------------------------------- the match score

def _strings(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return [str(v) for v in value if v not in (None, "")]
    return [str(value)]


def candidate_skill_text(parsed: Dict[str, Any]) -> str:
    """Every skill the candidate lists, from the skill lists, jobs and projects, one per line."""
    names: List[str] = []
    for field in SKILL_FIELDS:
        names += _strings(parsed.get(field.split(".", 1)[1]))
    for job in parsed.get("experience") or []:
        if isinstance(job, dict):
            names += _strings(job.get("technologies_used"))
    for project in parsed.get("projects") or []:
        if isinstance(project, dict):
            names += _strings(project.get("tech_stack"))
    return "\n".join(names)


def _stem(word: str) -> str:
    for suffix in ("ing", "ers", "es", "ed", "er", "s"):
        if word.endswith(suffix) and len(word) - len(suffix) >= 4:
            return word[: -len(suffix)]
    return word


def skill_pattern(skill: str) -> "re.Pattern":
    """Whole-word match for a skill. Known technologies use the alias list exactly ('Java' never matches
    'JavaScript'). Other skills also accept other word forms: 'Product Roadmaps' matches 'Product Roadmapping'."""
    key = " ".join(skill.lower().split())
    words = re.findall(r"[a-z0-9]+", key)
    if key in SKILL_GROUPS or not words or any(len(_stem(w)) < 4 for w in words) or not re.fullmatch(r"[a-z0-9 \-/&]+", key):
        return skill_regex(skill)
    # Only common endings, so 'Java' never grows into 'JavaScript'; '[a-z]?' allows a doubled letter (roadmapping).
    phrase = r"[\s\-/&]+".join(re.escape(_stem(w)) + r"(?:[a-z]?(?:ing|ers|er|es|ed|s))?" for w in words)
    return re.compile(rf"(?<![A-Za-z0-9])(?:{phrase})(?![A-Za-z0-9])", re.IGNORECASE)


def _skill_hits(skills: List[str], listed: str, text: str) -> Tuple[List[str], List[str], float]:
    """Skills found in the candidate's skill lists (full credit) or only in the resume text (half credit)."""
    matched, missing, credit = [], [], 0.0
    for skill in skills:
        pattern = skill_pattern(skill)
        if pattern.search(listed):
            matched.append(skill)
            credit += 1
        elif text and pattern.search(text):
            matched.append(skill)
            credit += 0.5
        else:
            missing.append(skill)
    return matched, missing, credit


def title_matches(title: str, role: str) -> bool:
    """Every main word of the title appears in the role: 'Backend Engineer' fits 'Software Engineer - Backend'."""
    words = [w for w in re.findall(r"[a-z0-9+#.]+", title.lower()) if w not in TITLE_STOP_WORDS]
    role_l = role.lower()
    return bool(words) and all(re.search(rf"(?<![a-z0-9]){re.escape(w)}(?![a-z0-9])", role_l) for w in words)


def _years(parsed: Dict[str, Any]) -> Optional[float]:
    for field in ("total_experience_years", "years_of_experience"):
        try:
            if parsed.get(field) not in (None, ""):
                return float(parsed[field])
        except (TypeError, ValueError):
            continue
    return None


def match_score(resume: Dict[str, Any], plan: Dict[str, Any]) -> Dict[str, Any]:
    """Score one candidate against the plan, 0-100, with the reasons behind it."""
    parsed = resume.get("parsed_data") or {}
    evaluation = resume.get("ai_evaluation") or {}
    text = resume.get("extracted_text") or ""
    listed = candidate_skill_text(parsed)
    earned: Dict[str, float] = {}
    out: Dict[str, Any] = {"matched_skills": [], "missing_skills": [], "nice_to_have_matched": []}

    if plan["must_have_skills"]:
        matched, missing, credit = _skill_hits(plan["must_have_skills"], listed, text)
        out["matched_skills"], out["missing_skills"] = matched, missing
        earned["must_have"] = WEIGHTS["must_have"] * credit / len(plan["must_have_skills"])

    if plan["nice_to_have_skills"]:
        matched, _, credit = _skill_hits(plan["nice_to_have_skills"], listed, text)
        out["nice_to_have_matched"] = matched
        earned["nice_to_have"] = WEIGHTS["nice_to_have"] * credit / len(plan["nice_to_have_skills"])

    lo, hi = plan["min_experience"], plan["max_experience"]
    years_factor = 1.0
    if lo is not None or hi is not None:
        years = _years(parsed)
        if years is None:
            earned["experience"] = 0.0
        else:
            gap = max((lo or 0) - years, 0) + (max(years - hi, 0) if hi is not None else 0)
            earned["experience"] = max(0.0, WEIGHTS["experience"] - 5 * gap)
            short = max((lo or 0) - years, 0)
            years_factor = max(SHORT_YEARS_FLOOR, 1 - SHORT_YEARS_PENALTY * short)
        out["experience_years"] = years

    if plan["role_titles"] or plan["role_family"]:
        current = " ".join(_strings(parsed.get("current_role")) + _strings(parsed.get("designation")) + _strings(parsed.get("role")))
        past = " | ".join(str(j.get("designation") or "") for j in parsed.get("experience") or [] if isinstance(j, dict))
        family = str(evaluation.get("role_family") or "")
        if any(title_matches(t, current) for t in plan["role_titles"]):
            role_points, out["role_match"] = 1.0, "current role"
        elif any(title_matches(t, past) for t in plan["role_titles"]):
            role_points, out["role_match"] = 0.6, "earlier role"
        elif plan["role_family"] and family.lower() == str(plan["role_family"]).lower():
            role_points, out["role_match"] = 0.6, "same role family"
        else:
            role_points = 0.0
        earned["role"] = WEIGHTS["role"] * role_points

    if plan["locations"]:
        if any(l.lower() == "remote" for l in plan["locations"]):
            loc_points = 1.0
        else:
            location = str(parsed.get("location") or "")
            pats = [re.compile(rf"(?<![A-Za-z]){re.escape(l)}(?![A-Za-z])", re.IGNORECASE) for l in plan["locations"]]
            loc_points = 1.0 if any(p.search(location) for p in pats) else 0.5 if any(p.search(text) for p in pats) else 0.0
        earned["location"] = WEIGHTS["location"] * loc_points

    if plan["education"]:
        degrees = " | ".join(f"{e.get('degree') or ''} {e.get('specialization') or ''}"
                             for e in parsed.get("education") or [] if isinstance(e, dict))
        found = [d for d in plan["education"] if re.search(re.escape(d), degrees, re.IGNORECASE)
                 or re.search(rf"(?<![A-Za-z]){re.escape(d)}(?![A-Za-z])", text, re.IGNORECASE)]
        earned["education"] = WEIGHTS["education"] * len(found) / len(plan["education"])

    if plan["keywords"]:
        found = [k for k in plan["keywords"] if re.search(rf"(?<![A-Za-z0-9]){re.escape(k)}(?![A-Za-z0-9])", text, re.IGNORECASE)]
        out["keywords_found"] = found
        earned["keywords"] = WEIGHTS["keywords"] * len(found) / len(plan["keywords"])

    ai = evaluation.get("ai_technical_score")
    earned["ai_score"] = WEIGHTS["ai_score"] * min(max(float(ai), 0), 100) / 100 if isinstance(ai, (int, float)) else 0.0

    possible = sum(WEIGHTS[k] for k in earned)
    out["match_score"] = round(100 * years_factor * sum(earned.values()) / possible) if possible else 0
    out["score_parts"] = {k: round(v, 1) for k, v in earned.items()}
    if years_factor < 1:
        out["score_parts"]["below_min_years_factor"] = round(years_factor, 2)
    return out


def rank_candidates(pool: List[Dict[str, Any]], plan: Dict[str, Any]) -> List[Tuple[Dict[str, Any], Dict[str, Any]]]:
    """Best match first; the general AI score, then the newest upload, break ties."""
    scored = [(r, match_score(r, plan)) for r in pool]

    def key(item):
        resume, match = item
        ai = (resume.get("ai_evaluation") or {}).get("ai_technical_score")
        return (match["match_score"], ai if isinstance(ai, (int, float)) else -1, str(resume.get("upload_date") or ""))
    return sorted(scored, key=key, reverse=True)


# ---------------------------------------------------------------- phase 2: AI re-rank

def _clip(text: Any, limit: int) -> str:
    text = " ".join(str(text or "").split())
    return text[:limit]


def candidate_summary(resume: Dict[str, Any], match: Dict[str, Any]) -> Dict[str, Any]:
    """What the AI sees about a candidate: work facts only. No name, email, phone, address or photo."""
    parsed = resume.get("parsed_data") or {}
    evaluation = resume.get("ai_evaluation") or {}
    skills: List[str] = []
    for line in candidate_skill_text(parsed).split("\n"):
        if line and line.lower() not in {x.lower() for x in skills}:
            skills.append(line)
    jobs = []
    for job in (parsed.get("experience") or [])[:3]:
        if isinstance(job, dict):
            jobs.append({"title": _clip(job.get("designation"), 80), "company": _clip(job.get("company"), 80),
                         "dates": _clip(job.get("duration"), 40),
                         "tech": [_clip(t, 40) for t in (job.get("technologies_used") or [])[:8]],
                         "work": _clip(job.get("achievements") or job.get("responsibilities"), 200)})
    return {
        "id": resume["id"],
        "current_role": _clip(parsed.get("current_role"), 80),
        "total_years": _years(parsed),
        "level": evaluation.get("experience_level"),
        "role_family": evaluation.get("role_family"),
        "location": _clip(parsed.get("location"), 60),
        "skills": skills[:30],
        "recent_jobs": jobs,
        "education": [_clip(f"{e.get('degree') or ''} {e.get('specialization') or ''}", 80)
                      for e in (parsed.get("education") or [])[:2] if isinstance(e, dict)],
        "certifications": [_clip(c.get("name"), 60) for c in (parsed.get("certifications") or [])[:4] if isinstance(c, dict)],
        "code_check": {"matched_skills": match.get("matched_skills"), "missing_must_haves": match.get("missing_skills")},
    }


def blend_scores(code_score: int, ai_score: int) -> int:
    return round((1 - RERANK_AI_WEIGHT) * code_score + RERANK_AI_WEIGHT * ai_score)


def apply_rerank(ranked: List[Tuple[Dict[str, Any], Dict[str, Any]]], ai: Dict[str, Dict[str, Any]]):
    """The top block gets the AI's score and reasons and is re-ordered by the blended score.
    Candidates below the top block keep their code score and order.
    A shown score in the top block never drops below the best score after it, so page 1
    never shows a lower percentage than the start of page 2 (the order still uses the blend)."""
    top, rest = ranked[:RERANK_TOP], ranked[RERANK_TOP:]
    floor = max((m["match_score"] for _, m in rest), default=0)
    order: Dict[str, int] = {}
    for resume, match in top:
        order[resume["id"]] = match["match_score"]
        result = ai.get(resume["id"])
        if not result:
            continue
        match["code_score"] = match["match_score"]
        match["ai_fit_score"] = result["fit_score"]
        match["why"] = result.get("why") or ""
        match["gaps"] = result.get("gaps") or ""
        blended = blend_scores(match["code_score"], result["fit_score"])
        order[resume["id"]] = blended
        match["match_score"] = max(blended, floor)
    top.sort(key=lambda item: order[item[0]["id"]], reverse=True)
    return top + rest


# ---------------------------------------------------------------- the service

class PromptMatchService:
    def __init__(self, resume_repo: ResumeRepository, resume_service=None):
        self.resume_repo = resume_repo
        self.resume_service = resume_service
        self.plan_cache = resume_repo.db[PLAN_CACHE_COLLECTION]
        self.rerank_cache = resume_repo.db[RERANK_CACHE_COLLECTION]

    async def _ai_config(self) -> Dict[str, Any]:
        from app.repositories.settings_repository import SettingsRepository
        from app.utils.encryption import decrypt_password
        ai_config = await SettingsRepository().get_ai_config()
        if not ai_config:
            return {}
        return {"provider": ai_config.provider, "model_name": ai_config.model_name,
                "api_key": decrypt_password(ai_config.api_key) if ai_config.api_key else "",
                "base_url": ai_config.base_url}

    async def get_plan(self, prompt: str) -> Tuple[Dict[str, Any], bool]:
        """The search plan for a prompt: from the 24-hour cache, else one call to the AI parser."""
        prompt = " ".join(prompt.split())
        ai_config = await self._ai_config()
        key = hashlib.sha256(f"{ai_config.get('model_name') or ''}\n{prompt.lower()}".encode()).hexdigest()
        cached = await self.plan_cache.find_one({"_id": key})
        now = datetime.now(timezone.utc)
        if cached:
            created = cached.get("created_at")
            if created and created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            if created and now - created < timedelta(hours=PLAN_CACHE_HOURS):
                return cached["plan"], True

        url = settings.AI_PARSER_URL.replace("/api/upload", "") + "/api/search-plan"
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(url, json={"prompt": prompt, "ai_config": ai_config})
        except httpx.HTTPError as e:
            logger.error(f"[PROMPT_MATCH] AI parser unreachable: {e}")
            raise AppException("The AI service is not reachable right now. Try again in a minute, or use Filters.",
                               status_code=status.HTTP_503_SERVICE_UNAVAILABLE)
        if response.status_code != 200:
            detail = ""
            try:
                detail = response.json().get("detail", "")
            except ValueError:
                pass
            busy = response.status_code == 429
            logger.error(f"[PROMPT_MATCH] search-plan failed {response.status_code}: {detail[:300]}")
            raise AppException(
                "The AI service is busy (rate limit). Try again shortly, or use Filters." if busy
                else "The AI could not read this request. Try rewording it, or use Filters.",
                status_code=status.HTTP_429_TOO_MANY_REQUESTS if busy else status.HTTP_502_BAD_GATEWAY,
                errors=[detail[:300]] if detail else None)
        plan = response.json().get("plan") or {}
        await self.plan_cache.replace_one({"_id": key}, {"_id": key, "prompt": prompt[:2000], "plan": plan, "created_at": now}, upsert=True)
        return plan, False

    async def rerank(self, prompt: Optional[str], plan: Dict[str, Any],
                     top: List[Tuple[Dict[str, Any], Dict[str, Any]]]) -> Dict[str, Dict[str, Any]]:
        """AI fit score and reasons for the top candidates. Results are kept 24 hours per plan and candidate
        (a changed resume gets a fresh answer), so paging and repeat searches don't call the AI again."""
        ai_config = await self._ai_config()
        plan_key = json.dumps(plan, sort_keys=True)
        now = datetime.now(timezone.utc)
        summaries, keys, results = {}, {}, {}
        for resume, match in top:
            summary = candidate_summary(resume, match)
            summaries[resume["id"]] = summary
            keys[resume["id"]] = hashlib.sha256(
                f"{ai_config.get('model_name') or ''}\n{plan_key}\n{json.dumps(summary, sort_keys=True, default=str)}".encode()).hexdigest()
        async for doc in self.rerank_cache.find({"_id": {"$in": list(keys.values())}}):
            created = doc.get("created_at")
            if created and created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            if created and now - created < timedelta(hours=PLAN_CACHE_HOURS):
                results[doc["resume_id"]] = doc["result"]
        todo = [summaries[i] for i in summaries if i not in results]
        if not todo:
            return results

        url = settings.AI_PARSER_URL.replace("/api/upload", "") + "/api/rerank"
        async with httpx.AsyncClient(timeout=180.0) as client:
            response = await client.post(url, json={"prompt": (prompt or "")[:4000], "plan": plan,
                                                    "candidates": todo, "ai_config": ai_config})
        if response.status_code != 200:
            detail = ""
            try:
                detail = response.json().get("detail", "")
            except ValueError:
                pass
            raise RuntimeError(f"{response.status_code}: {detail[:200]}")
        for result in response.json().get("results") or []:
            rid = result.get("id")
            if rid in keys:
                results[rid] = result
                await self.rerank_cache.replace_one(
                    {"_id": keys[rid]}, {"_id": keys[rid], "resume_id": rid, "result": result, "created_at": now}, upsert=True)
        return results

    async def _pool(self, plan: Dict[str, Any], user_id: str, is_admin: bool) -> Tuple[List[Dict[str, Any]], List[str]]:
        """Candidates worth scoring. Loose on purpose: any listed skill, years widened by 1 on each side.
        Widened further, with a note, when that finds too few."""
        skills = plan["must_have_skills"] + plan["nice_to_have_skills"]
        lo, hi = plan["min_experience"], plan["max_experience"]
        base = dict(user_id=user_id, is_admin=is_admin, skip=0, limit=POOL_LIMIT, sort_by="ai_score")
        titles = None if skills else (plan["role_titles"] or None)
        keywords = None if (skills or titles) else (plan["keywords"] or None)
        exp = dict(min_experience=max(lo - 1, 0) if lo is not None else None,
                   max_experience=hi + 1 if hi is not None else None)
        notes: List[str] = []

        attempts = [(dict(skills=skills or None, skill_mode="any", job_title=titles, keywords=keywords, **exp), None)]
        if lo is not None or hi is not None:
            attempts.append((dict(skills=skills or None, skill_mode="any", job_title=titles, keywords=keywords),
                             "Few candidates in the experience range, so other experience levels are included."))
        if (skills or titles or keywords) and (lo is not None or hi is not None):
            attempts.append((dict(**exp), "Few candidates have the requested skills or titles, so others in the experience range are included."))

        pool: Dict[str, Dict[str, Any]] = {}
        for filters, note in attempts:
            if note and len(pool) >= MIN_GOOD_MATCHES:
                break
            found = (await self.resume_repo.filter_resumes(**base, **filters))["resumes"]
            added = [r for r in found if r["id"] not in pool]
            for r in added:
                pool[r["id"]] = r
            if note and added:
                notes.append(note)
        return list(pool.values()), notes

    async def search(self, prompt: Optional[str], plan: Optional[Dict[str, Any]], user_id: str, is_admin: bool,
                     page: int = 1, limit: int = 25, rerank: bool = False) -> Dict[str, Any]:
        cached = False
        if plan is None:
            if not prompt or not prompt.strip():
                raise BadRequestError("Describe the role or paste a job description.")
            if len(prompt) > MAX_PROMPT_CHARS:
                raise BadRequestError(f"The text is too long ({len(prompt)} characters). Keep it under {MAX_PROMPT_CHARS}.")
            plan, cached = await self.get_plan(prompt)
        plan = normalise_plan(plan)
        if plan_is_empty(plan):
            raise BadRequestError("No skills, role, experience or location could be found in the request. Add more detail, or use Filters.")

        pool, notes = await self._pool(plan, user_id, is_admin)
        ranked = rank_candidates(pool, plan)
        good = sum(1 for _, m in ranked if m["match_score"] >= GOOD_MATCH)
        if ranked and good < MIN_GOOD_MATCHES:
            notes.append(f"No candidate scores {GOOD_MATCH} or more; the closest matches are shown." if good == 0 else
                         f"Only {good} candidate{'s score' if good > 1 else ' scores'} {GOOD_MATCH} or more; weaker matches are shown below.")
        if plan["must_have_skills"]:
            full = sum(1 for _, m in ranked if not m["missing_skills"])
            notes.append("No candidate has every must-have skill." if full == 0 else
                         f"{full} candidate{'s have' if full > 1 else ' has'} every must-have skill.")

        reranked = False
        if rerank and ranked:
            try:
                ai = await self.rerank(prompt, plan, ranked[:RERANK_TOP])
                ranked = apply_rerank(ranked, ai)
                reranked = bool(ai)
                if len(ai) < min(RERANK_TOP, len(ranked)):
                    notes.append(f"The AI explained {len(ai)} of the top {min(RERANK_TOP, len(ranked))} candidates.")
            except (httpx.HTTPError, RuntimeError) as e:
                logger.error(f"[PROMPT_MATCH] rerank failed: {e}")
                busy = "429" in str(e)[:4]
                notes.append("AI explanations are unavailable right now (" + ("rate limit" if busy else "AI service error")
                             + "); results are ranked by the match score only.")

        total = len(ranked)
        start = (page - 1) * limit
        page_items = ranked[start:start + limit]
        resumes = [r for r, _ in page_items]
        if self.resume_service is not None and resumes:
            resumes = await self.resume_service.enrich_resumes_with_interviews(resumes)
        items = []
        for resume, (_, match) in zip(resumes, page_items):
            item = ResumeResponse.model_validate(resume).model_dump(mode="json")
            item["match"] = match
            items.append(item)
        logger.info(f"[PROMPT_MATCH] pool={len(pool)} good={good} page={page} plan_cached={cached} reranked={reranked}")
        return {"plan": plan, "plan_cached": cached, "reranked": reranked, "notes": notes, "total": total, "page": page, "limit": limit,
                "total_pages": max(1, math.ceil(total / limit)), "resumes": items}
