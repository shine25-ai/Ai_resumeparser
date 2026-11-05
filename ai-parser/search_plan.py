"""JD Match prompt mode: turn a recruiter's request or a pasted job description into a search plan."""
import re
from typing import Any, Dict, List, Tuple

from postprocess import canonical_skills
from schema import SearchPlanSchema

MAX_PROMPT_CHARS = 15000

# Years for a seniority word when the request gives no number (same bands as postprocess.LEVEL_BANDS).
LEVEL_YEARS = {"fresher": (0, 1), "junior": (1, 3), "mid-level": (3, 7), "senior": (7, None), "architect": (10, None)}

# Personal traits that must never be used to filter candidates.
PROTECTED_TERMS = re.compile(
    r"\b(male|female|men|women|man|woman|gender|boys?|girls?|age[ds]?|years? old|young|younger|"
    r"married|unmarried|marital|religion|religious|hindu|muslim|christian|sikh|jain|caste|"
    r"pregnan\w*|disabilit\w*|handicap\w*|nationality|photo)\b", re.IGNORECASE)

SEARCH_PLAN_SYSTEM = (
    "You turn a recruiter's request or a job description into search filters for a resume database.\n"
    "Rules:\n"
    "- Only use what the text says. Never invent skills, years or locations.\n"
    "- Skills the text calls required go in must_have_skills; skills called preferred, optional, a plus or "
    "good to have go in nice_to_have_skills. In a long job description, keep only the 8 most important must-haves.\n"
    "- Write skills as short names (e.g. 'Spring Boot', not 'experience building Spring Boot services').\n"
    "- Alternatives ('X or Y', 'such as X or Y', 'X/Y') are never all required: put them in nice_to_have_skills.\n"
    "- Industries or business domains (fintech, healthcare, lending) go in keywords, not in skills.\n"
    "- Experience: '5+ years' -> min 5, no max; '3-5 years' -> min 3, max 5; 'fresher' -> min 0, max 1.\n"
    "- Ignore age, gender, marital status, religion, caste, nationality, health or appearance. Never turn them into filters.\n"
    "- Ignore salary, notice period, company benefits and instructions about how to apply.\n"
    "{format_instructions}"
)
SEARCH_PLAN_USER = "Request or job description:\n{prompt}"


def _clean_list(items: List[str], limit: int) -> List[str]:
    out, seen = [], set()
    for item in items or []:
        text = " ".join(str(item).split()).strip(" .,;")
        if not text or PROTECTED_TERMS.search(text) or text.lower() in seen:
            continue
        seen.add(text.lower())
        out.append(text)
    return out[:limit]


def _year(value: Any):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return round(number, 1) if 0 <= number <= 50 else None


def _short_name(skill: str) -> str:
    """'Agile (Scrum)' -> 'Agile': a bracketed note would stop the skill matching any resume."""
    return re.sub(r"\s*\([^)]*\)", "", skill).strip() or skill


def is_alternative(skill: str, prompt: str) -> bool:
    """The request names this skill as one of a choice ('Mixpanel or Amplitude'), so it isn't required."""
    name = re.escape(skill)
    return bool(re.search(rf"(?<![A-Za-z0-9]){name}\s+or\s+[A-Za-z0-9]|[A-Za-z0-9.+#]\s+or\s+{name}(?![A-Za-z0-9])", prompt, re.IGNORECASE))


def clean_plan(plan: Dict[str, Any], prompt: str = "") -> Dict[str, Any]:
    """Make the plan safe and consistent: standard skill names, no duplicates, no protected traits,
    alternatives not required, a sensible experience range, and years filled in from a seniority word."""
    must_all = canonical_skills([_short_name(x) for x in _clean_list(plan.get("must_have_skills"), 8)])
    must = [x for x in must_all if not is_alternative(x, prompt)]
    moved = [x for x in must_all if x not in must]
    nice_all = canonical_skills(moved + [_short_name(x) for x in _clean_list(plan.get("nice_to_have_skills"), 8)])
    nice = [x for x in nice_all if x.lower() not in {m.lower() for m in must}][:8]
    lo, hi = _year(plan.get("min_experience")), _year(plan.get("max_experience"))
    if lo is not None and hi is not None and lo > hi:
        lo, hi = hi, lo
    level = (plan.get("level") or "").strip() or None
    if lo is None and hi is None and level and level.lower() in LEVEL_YEARS:
        lo, hi = LEVEL_YEARS[level.lower()]
    family = (plan.get("role_family") or "").strip() or None
    return {
        "role_titles": _clean_list(plan.get("role_titles"), 4),
        "role_family": None if family and PROTECTED_TERMS.search(family) else family,
        "must_have_skills": must,
        "nice_to_have_skills": nice,
        "min_experience": lo,
        "max_experience": hi,
        "level": level,
        "locations": _clean_list(plan.get("locations"), 5),
        "education": _clean_list(plan.get("education"), 4),
        "keywords": _clean_list(plan.get("keywords"), 5),
    }


def build_search_plan(prompt: str, ai_config: Dict[str, Any] = None) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """One LLM call. Returns (plan, token_usage)."""
    from graph import _invoke_validated  # imported here so tests of clean_plan don't load the LLM stack
    state: Dict[str, Any] = {"ai_config": ai_config or {}, "evaluation": {}}
    raw = _invoke_validated(state, SearchPlanSchema, SEARCH_PLAN_SYSTEM, SEARCH_PLAN_USER,
                            {"prompt": prompt[:MAX_PROMPT_CHARS]})
    return clean_plan(raw, prompt), state["evaluation"].get("token_usage", {})
