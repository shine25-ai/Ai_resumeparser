"""Checks and fixes applied to LLM output before it is saved.

- compute_total_experience: works out total years from job dates in code (gap G01)
- coerce_and_validate: makes LLM output match the Pydantic schema (gap G02)
- missing_sections: finds sections the resume has but the parse left empty (gap G03)
"""
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


def job_interval(item: Dict[str, Any]) -> Optional[Tuple[int, int]]:
    """Return a job's (first_month, last_month) as month numbers, or None if the dates can't be read."""
    start = parse_ym(item.get("start_date"), False)
    end = parse_ym(item.get("end_date"), True)
    duration = str(item.get("duration") or "")
    if (start is None or end is None) and duration:
        parts = [p for p in RANGE_SPLIT.split(duration, maxsplit=1) if p.strip()]
        if start is None and parts:
            start = parse_ym(PRESENT_WORDS.sub("", parts[0]), False)
        if end is None:
            if len(parts) > 1:
                end = parse_ym(parts[1], True)
            elif PRESENT_WORDS.search(duration):          # "Since Aug 2022"
                end = today_ym()
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
    """Sections the resume clearly has but the parsed output left empty."""
    return [s for s in ("experience", "projects", "education", "certifications")
            if s in sections_in_text(text) and not parsed.get(s)]
