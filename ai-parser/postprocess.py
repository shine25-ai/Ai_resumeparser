"""Checks and fixes applied to LLM output before it is saved.

- compute_total_experience: works out total years from job dates in code (gap G01)
- coerce_and_validate: makes LLM output match the Pydantic schema (gap G02)
- missing_sections: finds sections the resume has but the parse left empty (gap G03)
- normalise_resume: one format for phones, skills and dates (gap G12)
- experience_level: level worked out from years and title, so it doesn't change between runs (gap G14)
"""
import json
import os
import re
from datetime import date
from typing import Any, Dict, List, Optional, Tuple, Type, Union, get_args, get_origin

from pydantic import BaseModel

# ---------------------------------------------------------------- dates (G01)

MONTHS = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}
PRESENT_WORDS = re.compile(r"\b(present|current(ly)?|now|today|till\s*date|to\s*date|ongoing|since)\b", re.I)
RANGE_SPLIT = re.compile(r"\s*(?:–|—|\s-\s|(?<=\d{4})-(?=\s*(?:\d{4}|[a-z]))|\bto\b|\btill\b|\buntil\b)\s*", re.I)


def today_ym() -> Tuple[int, int]:
    t = date.today()
    return t.year, t.month


def parse_ym(text: Optional[str], is_end: bool) -> Optional[Tuple[int, int]]:
    """Turn one date ('2021-03', '03/2021', 'Mar 2021', '2021', 'Present') into (year, month)."""
    if text is None:
        return None
    s = str(text).strip().lower()
    if not s:
        return None
    if PRESENT_WORDS.fullmatch(s) or s in ("present", "current", "now"):
        return today_ym() if is_end else None
    m = re.search(r"\b(\d{4})\s*[-/.]\s*(\d{1,2})\b", s)              # 2021-03
    if m and 1 <= int(m.group(2)) <= 12:
        return int(m.group(1)), int(m.group(2))
    m = re.search(r"\b(\d{1,2})\s*[-/.]\s*(\d{4})\b", s)              # 03/2021
    if m and 1 <= int(m.group(1)) <= 12:
        return int(m.group(2)), int(m.group(1))
    m = re.search(r"\b([a-z]{3})[a-z]*\.?,?\s*'?(\d{4}|\d{2})\b", s)  # Mar 2021, March '21
    if m and m.group(1) in MONTHS:
        y = int(m.group(2))
        y = y + 2000 if y < 100 and y <= today_ym()[0] % 100 else (y + 1900 if y < 100 else y)
        return y, MONTHS[m.group(1)]
    m = re.search(r"\b(19|20)(\d{2})\b", s)                            # 2021
    if m:
        return int(m.group(0)), (12 if is_end else 1)
    return None


def _duration_range(duration: str) -> Tuple[Optional[Tuple[int, int]], Optional[Tuple[int, int]]]:
    """(start, end) read from the dates as written, e.g. 'Jun 2018 – Present' or 'Since Aug 2022'."""
    duration = str(duration or "")
    parts = [p for p in RANGE_SPLIT.split(duration, maxsplit=1) if p.strip()]
    start = parse_ym(PRESENT_WORDS.sub("", parts[0]), False) if parts else None
    if len(parts) > 1:
        end = parse_ym(parts[1], True)
    else:
        end = today_ym() if PRESENT_WORDS.search(duration) else None   # "Since Aug 2022"
    return start, end


def _written_dates(duration: Any) -> Tuple[Optional[str], Optional[str]]:
    """Start and end as written, normalised: 'Jun 2018 – Present' -> ('2018-06', 'Present'); a bare year stays a year."""
    duration = str(duration or "")
    parts = [p for p in RANGE_SPLIT.split(duration, maxsplit=1) if p.strip()]
    if not parts:
        return None, None
    start = normalise_month(PRESENT_WORDS.sub("", parts[0]), False)
    end = normalise_month(parts[1], True) if len(parts) > 1 else ("Present" if PRESENT_WORDS.search(duration) else None)
    ok = lambda v: v if v and re.fullmatch(r"\d{4}(-\d{2})?|Present", v) else None
    return ok(start), ok(end)


def job_interval(item: Dict[str, Any]) -> Optional[Tuple[int, int]]:
    """Return a job's (first_month, last_month) as month numbers, or None if the dates can't be read.
    The dates as written in the resume (`duration`) win; the model's start_date/end_date only fill gaps.
    (In testing the model once wrote start_date 2022-06 for 'Jun 2018 – Present'.)"""
    start, end = _duration_range(item.get("duration"))
    start = start or parse_ym(item.get("start_date"), False)
    end = end or parse_ym(item.get("end_date"), True)
    if start is None or end is None:
        return None
    now = today_ym()
    end = min(end, now)
    s, e = start[0] * 12 + start[1], end[0] * 12 + end[1]
    return (s, e) if e >= s else None


def compute_total_experience(experience: List[Dict[str, Any]]) -> Tuple[Optional[float], int]:
    """Total years across jobs, counting overlapping jobs once. Returns (years, jobs_used)."""
    intervals = sorted(iv for iv in (job_interval(x) for x in experience if isinstance(x, dict)) if iv)
    if not intervals:
        return None, 0
    merged: List[List[int]] = []
    for s, e in intervals:
        if merged and s <= merged[-1][1] + 1:
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([s, e])
    months = sum(e - s + 1 for s, e in merged)
    return round(months / 12, 1), len(intervals)


# ---------------------------------------------------------- validation (G02)

def _empty_for(annotation) -> Any:
    origin = get_origin(annotation)
    if origin in (list, List):
        return []
    if origin is Union:
        return None
    if annotation is float:
        return 0.0
    if annotation is int:
        return 0
    if annotation is str:
        return ""
    if isinstance(annotation, type) and issubclass(annotation, BaseModel):
        return {}
    return None


def _to_number(value: Any, kind: type) -> Any:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return kind(value)
    m = re.search(r"-?\d+(\.\d+)?", str(value or ""))
    return kind(float(m.group(0))) if m else kind(0)


def _coerce(value: Any, annotation, path: str, issues: List[str]) -> Any:
    origin = get_origin(annotation)
    if origin is Union:  # Optional[X]
        if value is None:
            return None
        inner = [a for a in get_args(annotation) if a is not type(None)][0]
        return _coerce(value, inner, path, issues)
    if value is None:
        empty = _empty_for(annotation)
        issues.append(f"{path}: null replaced with {empty!r}")
        return _coerce(empty, annotation, path, issues) if isinstance(empty, dict) else empty
    if origin in (list, List):
        item_type = get_args(annotation)[0]
        if isinstance(value, (str, dict)):
            value = [value] if value else []
            issues.append(f"{path}: wrapped single value in a list")
        if not isinstance(value, list):
            issues.append(f"{path}: {type(value).__name__} replaced with []")
            return []
        out = []
        for i, v in enumerate(value):
            if item_type is str:
                if isinstance(v, (str, int, float)) and str(v).strip():
                    out.append(str(v).strip())
            elif isinstance(item_type, type) and issubclass(item_type, BaseModel):
                if isinstance(v, dict):
                    out.append(_coerce(v, item_type, f"{path}[{i}]", issues))
                else:
                    issues.append(f"{path}[{i}]: dropped non-object item")
            else:
                out.append(v)
        return out
    if isinstance(annotation, type) and issubclass(annotation, BaseModel):
        if not isinstance(value, dict):
            issues.append(f"{path}: {type(value).__name__} replaced with defaults")
            value = {}
        out = dict(value)
        for name, field in annotation.model_fields.items():
            if name not in value:
                if field.is_required():
                    out[name] = _empty_for(field.annotation)
                    issues.append(f"{path}.{name}: missing, filled with {out[name]!r}".lstrip("."))
                continue
            out[name] = _coerce(value[name], field.annotation, f"{path}.{name}".lstrip("."), issues)
        return out
    if annotation in (int, float):
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            issues.append(f"{path}: {value!r} converted to number")
        return _to_number(value, annotation)
    if annotation is str:
        if isinstance(value, (list, dict)):
            issues.append(f"{path}: {type(value).__name__} converted to text")
            return ", ".join(map(str, value)) if isinstance(value, list) else str(value)
        return str(value)
    return value


def coerce_and_validate(data: Any, model: Type[BaseModel]) -> Tuple[Dict[str, Any], List[str]]:
    """Make LLM output fit `model`: fill missing fields, fix types, then validate.
    Raises ValueError when the output is not a JSON object or still fails validation."""
    if not isinstance(data, dict):
        raise ValueError(f"LLM output is a {type(data).__name__}, expected a JSON object")
    if not set(data) & set(model.model_fields):
        raise ValueError(f"LLM output has none of the {model.__name__} fields")
    issues: List[str] = []
    fixed = _coerce(data, model, "", issues)
    validated = model.model_validate(fixed).model_dump()
    # Keys outside the schema are dropped: in testing these were garbled names such as "primary_skields?".
    extras = sorted(k for k in data if k not in validated)
    if extras:
        issues.append(f"dropped unknown keys: {', '.join(extras)[:200]}")
    return validated, issues


# -------------------------------------------------------- completeness (G03)

SECTION_HEADINGS = {
    "experience": r"((work|professional|employment|career)\s+)?(experience|history)|employment|work\s+history",
    "projects": r"((key|academic|personal|major|professional|notable|selected)\s+)?projects?",
    "education": r"education(al)?(\s+(qualifications?|background|details))?(\s*(&|and)\s*certifications?)?"
                 r"|academic\s+(qualifications?|background|details)|qualifications",
    "certifications": r"certifications?|certificates|licen[cs]es(\s*(&|and)\s*certifications?)?"
                      r"|(education\s*(&|and)\s*)?certifications?",
    "skills": r"((technical|core|key|professional|functional)\s+)?(skills|competencies|expertise)(\s*(&|and)\s*tools)?"
              r"|tools(\s*(&|and)\s*technologies)?",
}
_HEADING_RE = {k: re.compile(rf"^\s*(?:{v})\s*:?\s*$", re.I) for k, v in SECTION_HEADINGS.items()}


def sections_in_text(text: str) -> set:
    """Section names whose heading appears on its own line in the resume text."""
    found = set()
    for line in (text or "").splitlines():
        line = line.strip()
        if not line or len(line) > 45:
            continue
        for name, rx in _HEADING_RE.items():
            if rx.match(line):
                found.add(name)
    if "education" in found and re.search(r"(&|and)\s*certifications?", text or "", re.I):
        found.add("certifications")
    return found


def missing_sections(parsed: Dict[str, Any], text: str) -> List[str]:
    """Sections the resume clearly has but the parsed output left empty. 'skills' = every skill list empty."""
    found = sections_in_text(text)
    missing = [s for s in ("experience", "projects", "education", "certifications") if s in found and not parsed.get(s)]
    if "skills" in found and not any(parsed.get(f) for f in SKILL_LIST_FIELDS):
        missing.append("skills")
    return missing


# ------------------------------------------------------- normalisation (G12)

DEFAULT_PHONE_REGION = os.getenv("DEFAULT_PHONE_REGION", "IN")
SKILL_LIST_FIELDS = ["primary_skills", "functional_skills", "programming_languages", "frameworks", "databases",
                     "cloud_tech", "devops_and_infrastructure", "other_technologies"]


def normalise_phone(raw: Any) -> Tuple[str, Optional[str]]:
    """Return (phone in E.164 form, e.g. +919845012345, or the text as written; issue or None).
    Numbers without a country code are read as DEFAULT_PHONE_REGION. When several are listed, the first valid one is kept."""
    text = str(raw or "").strip()
    if not text:
        return "", None
    try:
        import phonenumbers
        for match in phonenumbers.PhoneNumberMatcher(text, DEFAULT_PHONE_REGION):
            return phonenumbers.format_number(match.number, phonenumbers.PhoneNumberFormat.E164), None
        number = phonenumbers.parse(text, DEFAULT_PHONE_REGION)
        if phonenumbers.is_valid_number(number):
            return phonenumbers.format_number(number, phonenumbers.PhoneNumberFormat.E164), None
    except Exception:
        pass
    return text, f"phone {text!r} kept as written (not a valid number)"


def _skill_key(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip().lower())


def _load_aliases() -> Dict[str, str]:
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "skill_aliases.json")
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    lookup = {}
    for canonical, aliases in data.items():
        if canonical.startswith("_"):
            continue
        for name in [canonical, *aliases]:
            lookup[_skill_key(name)] = canonical
    return lookup


SKILL_LOOKUP = _load_aliases()


def canonical_skill(name: str) -> str:
    """One spelling per skill: 'ReactJS', 'react.js' -> 'React'. Unknown skills are kept as written."""
    name = re.sub(r"\s+", " ", str(name)).strip()
    return SKILL_LOOKUP.get(_skill_key(name), name)


def canonical_skills(items: List[str]) -> List[str]:
    out, seen = [], set()
    for item in items or []:
        skill = canonical_skill(item)
        if skill and _skill_key(skill) not in seen:
            seen.add(_skill_key(skill))
            out.append(skill)
    return out


def normalise_month(text: Any, is_end: bool) -> Optional[str]:
    """Job dates as YYYY-MM, YYYY (year only) or 'Present'; text that can't be read is kept as written."""
    s = str(text or "").strip()
    if not s:
        return None
    if is_end and PRESENT_WORDS.search(s):
        return "Present"
    if re.fullmatch(r"(19|20)\d{2}", s):
        return s
    ym = parse_ym(s, is_end)
    return f"{ym[0]:04d}-{ym[1]:02d}" if ym else s


def normalise_resume(parsed: Dict[str, Any]) -> List[str]:
    """Normalise phone, skills and job dates in place. Returns notes about values that could not be normalised."""
    issues = []
    if parsed.get("phone"):
        parsed["phone"], issue = normalise_phone(parsed["phone"])
        if issue:
            issues.append(issue)
    for field in SKILL_LIST_FIELDS:
        if isinstance(parsed.get(field), list):
            parsed[field] = canonical_skills(parsed[field])
    for job in parsed.get("experience") or []:
        job["technologies_used"] = canonical_skills(job.get("technologies_used") or [])
        job["start_date"] = normalise_month(job.get("start_date"), False)
        job["end_date"] = normalise_month(job.get("end_date"), True)
        # Keep start/end in line with the dates as written (they are what the total is computed from).
        written = _written_dates(job.get("duration"))
        for key, value in zip(("start_date", "end_date"), written):
            if value and job.get(key) != value and not (value.isdigit() and str(job.get(key) or "").startswith(value)):
                issues.append(f"{job.get('company')}: {key} {job[key]} corrected to {value} from '{job.get('duration')}'")
                job[key] = value
    for project in parsed.get("projects") or []:
        project["tech_stack"] = canonical_skills(project.get("tech_stack") or [])
    for edu in parsed.get("education") or []:
        m = re.search(r"\b(19|20)\d{2}\b", str(edu.get("year_of_passing") or ""))
        if m:
            edu["year_of_passing"] = m.group(0)
    return issues


CONTACT_HINT = re.compile(r"@|\+?\d[\d\s().-]{7,}\d|linkedin", re.I)


def location_from_contact_line(text: str) -> Optional[str]:
    """City from the contact line at the top, e.g. 'name@x.com | +91 98450 12345 | Chennai' -> 'Chennai'.
    Used only when the model leaves location empty (seen in testing on R03, R04, R07, R09)."""
    for line in (text or "").splitlines()[:6]:
        if not CONTACT_HINT.search(line):
            continue
        # The city usually comes last; a name on the same line comes first.
        for part in reversed(re.split(r"\s*[|•·;]\s*", line)[1:]):
            part = part.strip(" ,")
            if part and not CONTACT_HINT.search(part) and re.fullmatch(r"[A-Za-z][A-Za-z .,'-]{1,39}", part) \
                    and not re.search(r"\b(street|road|www|http|github)\b", part, re.I):
                return part
    return None


# ---------------------------------------------------------- consistency (G14)

LEVEL_BANDS = [(1, "Fresher"), (3, "Junior"), (7, "Mid-Level")]   # years below the limit -> level
ARCHITECT_TITLES = re.compile(
    r"architect|principal|\bstaff\b|distinguished|\bcto\b|chief technology|engineering (director|head|manager)"
    r"|(director|head|vp|vice president) of (engineering|technology)", re.I)


def experience_level(years: Optional[float], current_role: Optional[str]) -> str:
    """Fresher < 1 year, Junior < 3, Mid-Level < 7, otherwise Senior; Architect for 10+ years in an
    architect or engineering-leadership title."""
    if years is None:
        return "Unknown"
    for limit, level in LEVEL_BANDS:
        if years < limit:
            return level
    if years >= 10 and ARCHITECT_TITLES.search(current_role or ""):
        return "Architect"
    return "Senior"
