"""
Skill Intelligence & Normalization Engine (Phase 9 - SRS 4.16, Screen 13).

Features:
1. Alias normalization: maps alternate spellings ("ReactJS", "React.js" -> "React")
   using app/data/skill_aliases.json and the master skills collection.
2. Skill proficiency calculation:
   score = (interview_weight% * interview_rating) + (resume_weight% * resume_rating)
   Default: 70% interview / 30% resume.
   Resume score is derived from years of experience, mention recency and confidence.
3. Classification:
   Top skills matching candidate's primary domain/role classified as 'primary', others as 'secondary'.
4. Natural explanation string generated for every skill:
   e.g. "Primary: Java — resume 6 yrs, interview 4/5"
5. Job match & gap analysis:
   Calculates weighted primary match % and secondary match %, lists missing skill gaps.
6. Company skill weights configuration & validation (sum == 100).
"""

import json
import os
import re
from typing import Any, Dict, List, Optional, Set, Tuple
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.core.exceptions import BadRequestError, NotFoundError
from app.models.candidate_skill import (
    CandidateSkillDocument,
    SKILL_CLASS_PRIMARY,
    SKILL_CLASS_SECONDARY,
    SKILL_SOURCE_HR,
    SKILL_SOURCE_INTERVIEW,
    SKILL_SOURCE_RESUME,
    with_candidate_skill_defaults,
)
from app.utils.constants import (
    CANDIDATE_SKILLS_COLLECTION,
    CANDIDATES_COLLECTION,
    JOB_OPENINGS_COLLECTION,
    MASTERS_COLLECTION,
    RESUMES_COLLECTION,
    INTERVIEW_EVALUATIONS_COLLECTION,
)
from app.utils.helpers import utc_now


from decimal import Decimal, ROUND_HALF_UP


def round_half_up(val: float, decimals: int = 1) -> float:
    """Standard arithmetic rounding (0.05 rounds up to 0.1)."""
    d = Decimal(str(round(val, 4)))
    fmt = "0." + "0" * decimals if decimals > 0 else "0"
    return float(d.quantize(Decimal(fmt), rounding=ROUND_HALF_UP))


# Default company skill weights
DEFAULT_INTERVIEW_WEIGHT = 70.0  # 70%
DEFAULT_RESUME_WEIGHT = 30.0     # 30%


class SkillNormalizationEngine:
    """Handles skill alias resolution and normalization."""

    _alias_map: Dict[str, str] = {}
    _canonical_names: Set[str] = set()

    @classmethod
    def load_aliases(cls) -> None:
        """Load aliases from static JSON file."""
        if cls._alias_map:
            return

        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        alias_file = os.path.join(base_dir, "data", "skill_aliases.json")
        if not os.path.exists(alias_file):
            # Fallback to root ai-parser
            root_dir = os.path.dirname(base_dir)
            alias_file = os.path.join(root_dir, "ai-parser", "skill_aliases.json")

        if os.path.exists(alias_file):
            try:
                with open(alias_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for canonical, aliases in data.items():
                        if canonical.startswith("_"):
                            continue
                        cls._canonical_names.add(canonical)
                        cls._alias_map[canonical.lower()] = canonical
                        for a in aliases:
                            cls._alias_map[a.strip().lower()] = canonical
            except Exception:
                pass

    @classmethod
    def normalize_skill(cls, raw_skill: str, db_masters: Optional[List[Dict[str, Any]]] = None) -> Tuple[str, str]:
        """
        Normalize raw skill input to canonical master name.
        Returns: (canonical_name, raw_name)
        """
        cls.load_aliases()
        raw_clean = (raw_skill or "").strip()
        if not raw_clean:
            return "", ""

        key = re.sub(r"\s+", " ", raw_clean).lower()

        # Check in alias map
        if key in cls._alias_map:
            return cls._alias_map[key], raw_clean

        # Check in DB masters if provided
        if db_masters:
            for m in db_masters:
                m_name = m.get("name", "")
                m_key = (m.get("key") or m_name).strip().lower()
                if key == m_key:
                    return m_name, raw_clean

        # Return title-cased or trimmed original
        return raw_clean, raw_clean


def calculate_resume_skill_score(years: Optional[float] = None) -> float:
    """
    Derive a 1.0 to 5.0 score from resume evidence (years of experience).
    - < 1 yr or not specified: 3.0 (proficient baseline)
    - 1-2 yrs: 3.5
    - 3-5 yrs: 4.0
    - 5-8 yrs: 4.5
    - 8+ yrs: 5.0
    """
    if years is None or years <= 0:
        return 3.0
    if years < 1.0:
        return 3.0
    if years <= 2.0:
        return 3.5
    if years <= 5.0:
        return 4.0
    if years <= 8.0:
        return 4.5
    return 5.0


class SkillIntelligenceService:
    """Core intelligence engine for candidate skill calculation, matching, and matrix."""

    def __init__(self, db: Any):
        self.db = db
        self.col = db[CANDIDATE_SKILLS_COLLECTION]

    async def get_company_skill_weights(self) -> Dict[str, float]:
        """Fetch company's configured skill weights (default 70% interview / 30% resume)."""
        settings_doc = await self.db["settings"].find_one({"type": "skill_intelligence_weights"})
        if settings_doc:
            return {
                "interview_weight": float(settings_doc.get("interview_weight", DEFAULT_INTERVIEW_WEIGHT)),
                "resume_weight": float(settings_doc.get("resume_weight", DEFAULT_RESUME_WEIGHT)),
            }
        return {
            "interview_weight": DEFAULT_INTERVIEW_WEIGHT,
            "resume_weight": DEFAULT_RESUME_WEIGHT,
        }

    async def save_company_skill_weights(self, interview_weight: float, resume_weight: float) -> Dict[str, float]:
        """Save company's skill weights with strict validation: sum == 100."""
        iw = float(interview_weight)
        rw = float(resume_weight)
        if round(iw + rw, 1) != 100.0 or iw < 0 or rw < 0:
            raise BadRequestError("Skill weights must sum to exactly 100% and cannot be negative.")

        now_iso = utc_now().isoformat()
        await self.db["settings"].update_one(
            {"type": "skill_intelligence_weights"},
            {
                "$set": {
                    "type": "skill_intelligence_weights",
                    "interview_weight": iw,
                    "resume_weight": rw,
                    "updated_at": now_iso,
                }
            },
            upsert=True,
        )
        # Recalculate all candidate skills for this company with new weights
        await self.recalculate_all_candidate_skills(iw, rw)
        return {"interview_weight": iw, "resume_weight": rw}

    async def list_candidate_skills(self, candidate_id: str) -> List[Dict[str, Any]]:
        """Retrieve all skills for a candidate sorted by proficiency descending."""
        docs = await self.col.find({"candidate_id": candidate_id}).sort("proficiency", -1).to_list(length=200)
        return [with_candidate_skill_defaults(d) for d in docs]

    async def update_candidate_skill_hr(
        self, candidate_id: str, skill_name: str, payload: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        HR manual edit of candidate skill: proficiency, years, skill_class (primary/secondary), verified.
        Recalculates explanation and marks source as HR.
        """
        norm_name, raw_name = SkillNormalizationEngine.normalize_skill(skill_name)
        existing = await self.col.find_one({"candidate_id": candidate_id, "skill_name": norm_name})

        sources = list(existing.get("sources", [SKILL_SOURCE_RESUME])) if existing else [SKILL_SOURCE_HR]
        if SKILL_SOURCE_HR not in sources:
            sources.append(SKILL_SOURCE_HR)

        proficiency = float(payload.get("proficiency", existing.get("proficiency", 3.0) if existing else 3.0))
        skill_class = payload.get("skill_class", existing.get("skill_class", SKILL_CLASS_SECONDARY) if existing else SKILL_CLASS_SECONDARY)
        years = payload.get("years_experience", existing.get("years_experience") if existing else None)

        explanation = f"{skill_class.capitalize()}: {norm_name} — HR verified ({proficiency}/5)"
        if years:
            explanation += f", {years} yrs"

        doc = {
            "candidate_id": candidate_id,
            "skill_name": norm_name,
            "raw_name": raw_name or norm_name,
            "proficiency": round(proficiency, 1),
            "sources": sources,
            "years_experience": float(years) if years is not None else None,
            "last_used": payload.get("last_used") or (existing.get("last_used") if existing else str(utc_now().year)),
            "verified": True,
            "confidence": 1.0,
            "skill_class": skill_class,
            "explanation": explanation,
            "updated_at": utc_now().isoformat(),
        }

        await self.col.update_one(
            {"candidate_id": candidate_id, "skill_name": norm_name},
            {"$set": doc},
            upsert=True,
        )
        return with_candidate_skill_defaults(doc)

    async def recalculate_candidate_skills(
        self, candidate_id: str, weights: Optional[Dict[str, float]] = None
    ) -> List[Dict[str, Any]]:
        """
        Recalculates a candidate's skill matrix:
        1. Reads parsed skills from candidate resume(s).
        2. Reads skill ratings from submitted interview evaluations.
        3. Normalizes all skill names via alias dictionary.
        4. Calculates weighted proficiency using company weights (default 70% interview / 30% resume).
        5. Classifies top skills as Primary and remaining as Secondary.
        6. Generates explanation trace string.
        7. Persists into `candidate_skills` collection.
        """
        if not weights:
            weights = await self.get_company_skill_weights()

        i_weight = weights["interview_weight"] / 100.0
        r_weight = weights["resume_weight"] / 100.0

        # 1. Fetch Candidate info (Phase 6 fields)
        candidate = await self.db[CANDIDATES_COLLECTION].find_one({"id": candidate_id})
        candidate_role = ""
        resume_years_exp = None
        if candidate:
            candidate_role = candidate.get("current_role") or ""
            resume_years_exp = candidate.get("total_experience_years")

        # The candidate's resumes point at it with `candidate_ref` and keep their CND code in `candidate_id`.
        # Interviews and evaluations may carry either the candidate's ID or a resume's CND code.
        resumes = await self.db[RESUMES_COLLECTION].find(
            {"$or": [{"candidate_ref": candidate_id}, {"candidate_id": candidate_id}]}
        ).to_list(length=50)
        resume_ids = [r["id"] for r in resumes if r.get("id")]
        person_keys = [k for k in dict.fromkeys([candidate_id, *(r.get("candidate_id") for r in resumes),
                                                (candidate or {}).get("candidate_id_display")]) if k]

        # 2. Gather resume skills
        resume_skills_data: Dict[str, Dict[str, Any]] = {}
        for r in resumes:
            parsed = r.get("parsed_data") or {}
            if resume_years_exp is None and parsed.get("total_experience_years") is not None:
                resume_years_exp = parsed.get("total_experience_years")
            skills_list = parsed.get("primary_skills") or parsed.get("skills") or []
            if isinstance(skills_list, str):
                skills_list = [s.strip() for s in skills_list.split(",") if s.strip()]
            for s in skills_list:
                norm_s, raw_s = SkillNormalizationEngine.normalize_skill(str(s))
                if not norm_s:
                    continue
                resume_skills_data[norm_s] = {
                    "raw_name": raw_s,
                    "years": resume_years_exp,
                    "score": calculate_resume_skill_score(resume_years_exp),
                }

        # 3. Gather interview ratings
        interview_ratings_data: Dict[str, Dict[str, Any]] = {}

        def _add_rating(name: str, value: Any, scale_max: Any = 5) -> None:
            try:
                val = float(value or 0.0)
                top = float(scale_max or 5)
            except (TypeError, ValueError):
                return
            if val <= 0 or top <= 0:
                return
            val = round(val * 5.0 / top, 2)          # every scale counts as out of 5
            norm_c, raw_c = SkillNormalizationEngine.normalize_skill(name or "")
            if not norm_c:
                return
            interview_ratings_data.setdefault(norm_c, {"scores": [], "raw_name": raw_c})["scores"].append(val)

        evals = await self.db[INTERVIEW_EVALUATIONS_COLLECTION].find(
            {"candidate_id": {"$in": person_keys}}
        ).to_list(length=200)
        for ev in evals:
            if str(ev.get("status") or "").upper() != "SUBMITTED":
                continue
            ratings = ev.get("ratings") or {}
            if isinstance(ratings, dict):
                # Phase 8: {criterion_id: score}, with the criteria (id, label) copied onto the evaluation
                labels = {str(c.get("id")): c.get("label") or c.get("name") or "" for c in (ev.get("criteria") or [])
                          if isinstance(c, dict)}
                for crit_id, val in ratings.items():
                    _add_rating(labels.get(str(crit_id)) or str(crit_id), val, ev.get("scale_max"))
            else:
                for r in ratings:
                    if isinstance(r, dict):
                        _add_rating(r.get("criterion_name") or r.get("label") or "", r.get("rating"), ev.get("scale_max"))

        # Also check old interview documents skill_ratings field if any
        inv_or: List[Dict[str, Any]] = [{"candidate_id": {"$in": person_keys}}]
        if resume_ids:
            inv_or.append({"resume_id": {"$in": resume_ids}})
        interviews = await self.db["interviews"].find({"$or": inv_or}).to_list(length=50)
        for intv in interviews:
            for sr in (intv.get("skill_ratings") or []):
                if isinstance(sr, dict):
                    _add_rating(sr.get("skill_name") or "", sr.get("rating"))

        # 4. Merge and calculate combined proficiency
        all_skill_keys = set(resume_skills_data.keys()) | set(interview_ratings_data.keys())
        calculated_skills: List[Dict[str, Any]] = []

        for skill in all_skill_keys:
            has_resume = skill in resume_skills_data
            has_interview = skill in interview_ratings_data

            r_score = resume_skills_data[skill]["score"] if has_resume else 3.0
            r_years = resume_skills_data[skill]["years"] if has_resume else None

            if has_interview:
                i_scores = interview_ratings_data[skill]["scores"]
                i_score = sum(i_scores) / len(i_scores)
            else:
                i_score = None

            # Sources list
            sources = []
            if has_resume:
                sources.append(SKILL_SOURCE_RESUME)
            if has_interview:
                sources.append(SKILL_SOURCE_INTERVIEW)

            # Proficiency formula
            proficiency: float = 3.0
            if has_interview and i_score is not None and has_resume:
                proficiency = float((i_weight * i_score) + (r_weight * r_score))
                verified = True
                confidence = 0.95
            elif has_interview and i_score is not None:
                proficiency = float(i_score)
                verified = True
                confidence = 0.90
            else:
                proficiency = float(r_score)
                verified = False
                confidence = 0.80

            proficiency = round_half_up(max(1.0, min(5.0, proficiency)), 1)
            raw_name = (
                interview_ratings_data.get(skill, {}).get("raw_name")
                or resume_skills_data.get(skill, {}).get("raw_name")
                or skill
            )

            calculated_skills.append({
                "skill_name": skill,
                "raw_name": raw_name,
                "proficiency": proficiency,
                "sources": sources,
                "years_experience": r_years,
                "verified": verified,
                "confidence": confidence,
                "i_score": i_score,
                "r_years": r_years,
            })

        # 5. Classify Primary vs Secondary:
        # Sort by proficiency descending, top 4-5 skills (or skills with >= 4.0 rating) classified as Primary
        calculated_skills.sort(key=lambda s: s["proficiency"], reverse=True)

        final_docs: List[Dict[str, Any]] = []
        for idx, item in enumerate(calculated_skills):
            # Top 3 or skills with proficiency >= 4.0 classified as primary
            is_primary = idx < 3 or item["proficiency"] >= 4.0
            skill_class = SKILL_CLASS_PRIMARY if is_primary else SKILL_CLASS_SECONDARY

            # Explanation trace
            parts = [f"{skill_class.capitalize()}: {item['skill_name']} —"]
            if item["r_years"] is not None:
                parts.append(f"resume {item['r_years']} yrs,")
            elif SKILL_SOURCE_RESUME in item["sources"]:
                parts.append("resume evidence,")
            if item["i_score"] is not None:
                # Format to integer or 1 decimal
                i_fmt = f"{int(item['i_score'])}" if item["i_score"].is_integer() else f"{item['i_score']:.1f}"
                parts.append(f"interview {i_fmt}/5")
            else:
                parts.append("interview pending")

            explanation = " ".join(parts).rstrip(",")

            doc = CandidateSkillDocument(
                candidate_id=candidate_id,
                skill_name=item["skill_name"],
                raw_name=item["raw_name"],
                proficiency=item["proficiency"],
                sources=item["sources"],
                years_experience=item["years_experience"],
                last_used=str(utc_now().year),
                verified=item["verified"],
                confidence=item["confidence"],
                skill_class=skill_class,
                explanation=explanation,
            ).to_dict()

            # Upsert into candidate_skills collection
            # Upsert into candidate_skills collection (the record keeps its id and created_at)
            fields = {k: v for k, v in doc.items() if k not in ("id", "created_at")}
            await self.col.update_one(
                {"candidate_id": candidate_id, "skill_name": item["skill_name"]},
                {"$set": fields, "$setOnInsert": {"id": doc["id"], "created_at": doc["created_at"]}},
                upsert=True,
            )
            final_docs.append(doc)

        return final_docs

    async def recalculate_all_candidate_skills(self, interview_weight: float, resume_weight: float) -> int:
        """Recalculate skills for all candidates when company weights change."""
        candidates = await self.db[CANDIDATES_COLLECTION].find({"merged_into": None}, {"id": 1}).to_list(length=None)
        weights = {"interview_weight": interview_weight, "resume_weight": resume_weight}
        count = 0
        for cand in candidates:
            cand_id = cand.get("id")
            if cand_id:
                await self.recalculate_candidate_skills(cand_id, weights=weights)
                count += 1
        return count

    # ── Job Match & Gap Analysis ─────────────────────────────────────────────

    async def calculate_job_skill_match(
        self, candidate_id: str, job_id: str
    ) -> Dict[str, Any]:
        """
        Calculate candidate skill match % against a job opening's primary and secondary skills.
        Primary skills weight: 70% of total score
        Secondary skills weight: 30% of total score
        Identifies matched skills and missing skill gaps.
        """
        job = await self.db[JOB_OPENINGS_COLLECTION].find_one({"id": job_id})
        if not job:
            raise NotFoundError(f"Job opening '{job_id}' not found.")

        # Fetch candidate skills
        candidate_skills = await self.list_candidate_skills(candidate_id)
        if not candidate_skills:
            # Try on-the-fly recalculate
            candidate_skills = await self.recalculate_candidate_skills(candidate_id)

        return {"candidate_id": candidate_id, "job_id": job_id, "job_title": job.get("title", ""),
                **score_job_match(job, candidate_skills)}

    # ── Screen 13 Skill Matrix & Demand Analytics ───────────────────────────

    async def get_skill_matrix_analytics(self, job_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Screen 13:
        1. Heatmap across candidates for a job or overall.
        2. Demand: most requested skills across open jobs.
        3. Skill gap trends.
        """
        # 1. Job skill demand
        jobs = await self.db[JOB_OPENINGS_COLLECTION].find({"status": "OPEN"}).to_list(length=200)
        demand_counts: Dict[str, int] = {}
        for j in jobs:
            reqs = (j.get("primary_skills") or []) + (j.get("secondary_skills") or [])
            for r in reqs:
                norm_r, _ = SkillNormalizationEngine.normalize_skill(str(r))
                if norm_r:
                    demand_counts[norm_r] = demand_counts.get(norm_r, 0) + 1

        top_demanded = sorted(
            [{"skill": k, "job_count": v} for k, v in demand_counts.items()],
            key=lambda x: x["job_count"],
            reverse=True,
        )[:15]

        # 2. Candidate skill distribution
        pipeline = [
            {"$group": {"_id": "$skill_name", "candidate_count": {"$sum": 1}, "avg_proficiency": {"$avg": "$proficiency"}}},
            {"$sort": {"candidate_count": -1}},
            {"$limit": 20},
        ]
        if hasattr(self.col, "aggregate"):
            distribution_raw = await self.col.aggregate(pipeline).to_list(length=20)
        else:
            distribution_raw = []
        talent_pool = [
            {"skill": d["_id"], "candidate_count": d["candidate_count"], "avg_proficiency": round(d.get("avg_proficiency") or 0.0, 1)}
            for d in distribution_raw if d.get("_id")
        ]

        # 3. Candidate skill matrix / heatmap rows
        candidates_cursor = self.db[CANDIDATES_COLLECTION].find({}).limit(50)
        candidates = await candidates_cursor.to_list(length=50)

        matrix_rows = []
        for c in candidates:
            c_id = c.get("id")
            c_skills = await self.list_candidate_skills(c_id)
            matrix_rows.append({
                "candidate_id": c_id,
                "candidate_name": c.get("full_name") or c.get("name") or "Candidate",
                "role": c.get("current_role") or "",
                "experience": c.get("total_experience_years") or 0.0,
                "primary_skills": [s["skill_name"] for s in c_skills if s.get("skill_class") == SKILL_CLASS_PRIMARY],
                "skills": {s["skill_name"]: s["proficiency"] for s in c_skills},
            })

        return {
            "top_demanded": top_demanded,
            "talent_pool": talent_pool,
            "matrix_rows": matrix_rows,
        }

    # ── Skill Master: Merging & Aliasing ─────────────────────────────────────

    async def merge_duplicate_skills(self, source_skill: str, target_skill: str) -> Dict[str, Any]:
        """
        Admin operation: Merge duplicate skills (e.g. merge 'ReactJS' into 'React').
        Updates all candidate_skills records, job openings, and records the alias.
        """
        source_norm, _ = SkillNormalizationEngine.normalize_skill(source_skill)
        target_norm, _ = SkillNormalizationEngine.normalize_skill(target_skill)

        src_clean = (source_skill or "").strip()
        tgt_clean = (target_skill or "").strip()
        if src_clean.lower() == tgt_clean.lower():
            raise BadRequestError("Source and target skill names must differ.")

        # If normalized names match (e.g. ReactJS and React are both React),
        # use the raw source name as source_norm to migrate legacy un-normalized records
        search_name = src_clean if source_norm.lower() == target_norm.lower() else source_norm

        # Update candidate_skills: update skill_name to target_norm
        updated_cand_skills = await self.col.update_many(
            {"$or": [
                {"skill_name": {"$regex": f"^{re.escape(search_name)}$", "$options": "i"}},
                {"raw_name": {"$regex": f"^{re.escape(search_name)}$", "$options": "i"}},
            ]},
            {"$set": {"skill_name": target_norm, "updated_at": utc_now().isoformat()}},
        )

        # Update job openings primary and secondary skills
        jobs_with_skill = await self.db[JOB_OPENINGS_COLLECTION].find({
            "$or": [
                {"primary_skills": {"$regex": f"^{re.escape(search_name)}$", "$options": "i"}},
                {"secondary_skills": {"$regex": f"^{re.escape(search_name)}$", "$options": "i"}},
            ]
        }).to_list(length=500)

        for j in jobs_with_skill:
            p_skills = [(target_norm if s.lower() == search_name.lower() else s) for s in (j.get("primary_skills") or [])]
            s_skills = [(target_norm if s.lower() == search_name.lower() else s) for s in (j.get("secondary_skills") or [])]
            # Deduplicate while preserving order
            p_dedup = list(dict.fromkeys(p_skills))
            s_dedup = list(dict.fromkeys(s_skills))
            await self.db[JOB_OPENINGS_COLLECTION].update_one(
                {"id": j["id"]},
                {"$set": {"primary_skills": p_dedup, "secondary_skills": s_dedup, "updated_at": utc_now().isoformat()}},
            )

        return {
            "source_skill": source_norm,
            "target_skill": target_norm,
            "updated_candidate_skills": updated_cand_skills.modified_count,
            "status": "merged",
        }


async def recalculate_skills_for(db: Any, any_id: Optional[str], resume_id: Optional[str] = None) -> None:
    """
    Keep a candidate's skill matrix current without anyone pressing "Recalculate". Called when a resume is
    parsed, when interview feedback is saved, and (Phase 8) when an evaluation is submitted.
    `any_id` may be the candidate's ID or a resume's CND code; `resume_id` is used when that is all there is.
    Never raises: a failure is logged and the save that triggered it goes ahead.
    """
    import logging

    try:
        candidate_id = None
        if any_id and await db[CANDIDATES_COLLECTION].find_one({"id": any_id}, {"_id": 0, "id": 1}):
            candidate_id = any_id
        else:
            ors = [{"candidate_id": any_id}] if any_id else []
            if resume_id:
                ors.append({"id": resume_id})
            resume = await db[RESUMES_COLLECTION].find_one({"$or": ors}, {"_id": 0, "candidate_ref": 1}) if ors else None
            candidate_id = (resume or {}).get("candidate_ref")
        if candidate_id:
            await SkillIntelligenceService(db).recalculate_candidate_skills(candidate_id)
    except Exception as e:  # never block the save that triggered it
        logging.getLogger(__name__).warning("Skill recalculation failed for %s: %s", any_id or resume_id, e)




def _job_skill_names(job: Dict[str, Any]) -> Tuple[List[str], List[str]]:
    """The job's primary and secondary skills, normalised to the skill master (aliases folded)."""
    def norm(values: Any) -> List[str]:
        out: List[str] = []
        for v in values or []:
            if isinstance(v, str) and v.strip():
                name = SkillNormalizationEngine.normalize_skill(v)[0]
                if name and name not in out:
                    out.append(name)
        return out

    return (norm(job.get("primary_skills") or job.get("required_skills")),
            norm(job.get("secondary_skills") or job.get("preferred_skills")))


def score_job_match(job: Dict[str, Any], candidate_skills: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Job match (SRS 4.13): % of the job's primary skills the candidate has (70%) and of its secondary skills (30%).
    With only one list on the job, that list counts 100%. A job with no skills listed has no match score (None).
    Gaps are the job's skills the candidate does not have, primary first.
    """
    primary, secondary = _job_skill_names(job)
    have = {str(cs.get("skill_name") or "").lower(): cs for cs in candidate_skills or []}
    matched_primary = [have[s.lower()] for s in primary if s.lower() in have]
    missing_primary = [s for s in primary if s.lower() not in have]
    matched_secondary = [have[s.lower()] for s in secondary if s.lower() in have]
    missing_secondary = [s for s in secondary if s.lower() not in have]

    primary_pct = round(len(matched_primary) / len(primary) * 100.0, 1) if primary else None
    secondary_pct = round(len(matched_secondary) / len(secondary) * 100.0, 1) if secondary else None
    if primary_pct is not None and secondary_pct is not None:
        overall: Optional[float] = round(0.70 * primary_pct + 0.30 * secondary_pct, 1)
    else:
        overall = primary_pct if primary_pct is not None else secondary_pct

    gaps = missing_primary + missing_secondary
    label = "No skills listed on the job" if overall is None else (
        f"{overall:g}% match ({len(gaps)} gap{'s' if len(gaps) != 1 else ''})")
    return {
        "overall_match_pct": overall,
        "primary_match_pct": primary_pct,
        "secondary_match_pct": secondary_pct,
        "matched_primary": matched_primary,
        "missing_primary": missing_primary,
        "matched_secondary": matched_secondary,
        "missing_secondary": missing_secondary,
        "gaps": gaps,
        "summary_label": label,
    }


async def job_matches(db: Any, pairs: List[Tuple[Optional[str], Optional[str]]]) -> Dict[Tuple[str, str], Dict[str, Any]]:
    """
    Match % for many (candidate id, job id) pairs at once, for lists and boards: two queries in all.
    Pairs with no candidate, no job, no saved skills or a job without skills are left out (shown as "no score").
    Returns {(candidate_id, job_id): {"pct", "gaps", "primary_pct", "label"}}.
    """
    pairs = [(str(c), str(j)) for c, j in pairs if c and j]
    if not pairs:
        return {}
    cand_ids = list({c for c, _ in pairs})
    job_ids = list({j for _, j in pairs})
    jobs = {j["id"]: j for j in await db[JOB_OPENINGS_COLLECTION].find(
        {"id": {"$in": job_ids}}, {"_id": 0, "id": 1, "primary_skills": 1, "secondary_skills": 1,
                                   "required_skills": 1, "preferred_skills": 1}).to_list(length=len(job_ids))}
    skills: Dict[str, List[Dict[str, Any]]] = {}
    for cs in await db[CANDIDATE_SKILLS_COLLECTION].find(
            {"candidate_id": {"$in": cand_ids}}, {"_id": 0, "candidate_id": 1, "skill_name": 1}).to_list(length=len(cand_ids) * 200):
        skills.setdefault(str(cs["candidate_id"]), []).append(cs)

    out: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for c, j in pairs:
        if j not in jobs or c not in skills:
            continue
        m = score_job_match(jobs[j], skills[c])
        if m["overall_match_pct"] is None:
            continue
        out[(c, j)] = {"pct": m["overall_match_pct"], "primary_pct": m["primary_match_pct"],
                       "gaps": m["gaps"][:8], "label": m["summary_label"]}
    return out
