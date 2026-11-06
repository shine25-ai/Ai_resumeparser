"""Before/after comparison for gaps G09, G12, G13 and G14 (plus a regression check on the core fields).
Usage: python compare_medium.py <eval_dir> <before_dir> <after_dir> [out.json]"""
import json, glob, os, re, statistics, sys
sys.path.insert(0, os.path.dirname(__file__))
import score as sc

E, BEFORE, AFTER = sys.argv[1:4]; sc.load_truth(E)
OUT = sys.argv[4] if len(sys.argv) > 4 else f"{E}/compare_medium.json"
FIELDS = ["name", "email", "phone", "location", "linkedin", "total_exp", "current_role", "companies", "exp_count",
          "projects", "education", "degree", "certifications"]
SKILL_LISTS = ["primary_skills", "functional_skills", "programming_languages", "frameworks", "databases", "cloud_tech",
               "devops_and_infrastructure", "other_technologies"]
SOFTWARE_WORDS = re.compile(r"software|coding|programming|cloud|architecture|devops|full.?stack|data engineering", re.I)
E164 = re.compile(r"^\+\d{8,15}$")
DATE_OK = re.compile(r"^(\d{4}-\d{2}|\d{4}|Present)$")
VARIANT = re.compile(r"[\s.\-_]|js$", re.I)   # 'React.js' / 'ReactJS' / 'React' -> 'react'


def load(d):
    rows = []
    for fp in sorted(glob.glob(f"{E}/{d}/a[2345]_*.json")):
        rec = json.load(open(fp)); s = sc.score(rec)
        rec["_score"] = s
        rows.append(rec)
    return rows


def summarise(rows):
    ok = [r for r in rows if not r.get("error")]
    res = {"runs": len(rows), "failed_runs": [f"{r['file'][:3]}/{r['mode'][0]}{r['run']}: {r['error'][:80]}" for r in rows if r.get("error")]}

    # Regression check: same field scores as earlier rounds (run 1, R05 excluded as before)
    for mode in ("single", "multi"):
        rs = [r for r in ok if r["mode"] == mode and r["run"] == 1 and r["file"][:3] not in ("R05", "R12")]
        res[f"fields_{mode}"] = {f: f"{sum(1 for r in rs if r['_score'].get(f))}/{len(rs)}" for f in FIELDS}
        res[f"skill_recall_{mode}"] = round(statistics.mean(r["_score"]["_skill_recall"] for r in rs), 2)

    # G09: non-technical resume (R09)
    r09 = [r for r in ok if r["file"].startswith("R09")]
    res["G09_R09"] = [{"run": f"{r['mode'][0]}{r['run']}", "skill_recall": r["_score"]["_skill_recall"],
                       "score": (r["evaluation"] or {}).get("ai_technical_score"),
                       "role_family": (r["evaluation"] or {}).get("role_family"),
                       "software_weaknesses": [w for w in (r["evaluation"] or {}).get("skill_weaknesses") or [] if SOFTWARE_WORDS.search(w)],
                       "functional_skills": (r["parsed"] or {}).get("functional_skills")} for r in r09]

    # G12: one format for phones, skills and dates
    phones = [(r["parsed"] or {}).get("phone") for r in ok if (r["parsed"] or {}).get("phone")]
    res["G12_phone_e164"] = f"{sum(1 for p in phones if E164.match(p))}/{len(phones)}"
    res["G12_phone_examples"] = sorted({p for p in phones})[:8]
    dates = [j.get(k) for r in ok for j in (r["parsed"] or {}).get("experience") or [] for k in ("start_date", "end_date") if j.get(k)]
    res["G12_job_dates_standard"] = f"{sum(1 for d in dates if DATE_OK.match(str(d)))}/{len(dates)}"
    res["G12_nonstandard_dates"] = sorted({str(d) for d in dates if not DATE_OK.match(str(d))})[:8]
    dupes = []
    for r in ok:
        p = r["parsed"] or {}
        seen = {}
        for k in SKILL_LISTS:
            for s in p.get(k) or []:
                key = VARIANT.sub("", str(s).lower())
                if key in seen and seen[key] != s:
                    dupes.append(f"{r['file'][:3]}/{r['mode'][0]}{r['run']}: {seen[key]} + {s}")
                seen.setdefault(key, s)
    res["G12_skill_spelling_duplicates"] = dupes

    # G13: ligatures left in parsed output
    res["G13_runs_with_ligatures"] = [f"{r['file'][:3]}/{r['mode'][0]}{r['run']}" for r in ok if r["_score"].get("_ligature")]

    # G14: same file, repeated single-mode runs
    cons = {}
    for f in sorted({r["file"] for r in ok if r["round"] in ("a4", "a5")}):
        rs = sorted((r for r in ok if r["file"] == f and r["mode"] == "single"), key=lambda r: r["run"])
        scores = [(r["evaluation"] or {}).get("ai_technical_score") for r in rs]
        levels = [(r["evaluation"] or {}).get("experience_level") for r in rs]
        cons[f[:3]] = {"scores": scores, "spread": max(scores) - min(scores), "levels": levels, "level_changes": len(set(levels)) > 1}
    res["G14_repeats"] = cons
    res["G14_avg_spread"] = round(statistics.mean(c["spread"] for c in cons.values()), 1) if cons else None
    res["G14_max_spread"] = max((c["spread"] for c in cons.values()), default=None)
    res["G14_files_with_level_change"] = [k for k, c in cons.items() if c["level_changes"]]
    single_multi = {}
    for f in sorted({r["file"] for r in ok}):
        by = {r["mode"]: (r["evaluation"] or {}).get("ai_technical_score") for r in ok if r["file"] == f and r["run"] == 1}
        if "single" in by and "multi" in by:
            single_multi[f[:3]] = abs(by["single"] - by["multi"])
    res["G14_single_vs_multi_gap_avg"] = round(statistics.mean(single_multi.values()), 1) if single_multi else None
    res["scores_run1_single"] = {r["file"][:3]: (r["evaluation"] or {}).get("ai_technical_score") for r in ok if r["mode"] == "single" and r["run"] == 1}
    res["levels_run1_single"] = {r["file"][:3]: (r["evaluation"] or {}).get("experience_level") for r in ok if r["mode"] == "single" and r["run"] == 1}
    res["median_seconds"] = statistics.median(r["seconds"] for r in rows)
    res["tokens_avg"] = round(statistics.mean(((r["evaluation"] or {}).get("token_usage") or {}).get("total_tokens") or 0 for r in ok))
    return res


before, after = summarise(load(BEFORE)), summarise(load(AFTER))
json.dump({"before": before, "after": after}, open(OUT, "w"), indent=1, default=str)
for k in before:
    print(f"\n### {k}\n  before: {json.dumps(before[k], default=str)}\n  after : {json.dumps(after.get(k), default=str)}")
