"""Before/after comparison for gaps G01-G03.
Usage: python compare.py <eval_dir> [before_glob] [after_glob]  -> prints tables, writes compare.json"""
import json, glob, os, sys, statistics
sys.path.insert(0, os.path.dirname(__file__))
import score as sc

E = sys.argv[1]; sc.load_truth(E)
LISTS = ["programming_languages", "frameworks", "databases", "cloud_tech", "devops_and_infrastructure", "other_technologies",
         "primary_skills", "experience", "projects", "education", "certifications"]
REQ_STR = ["full_name", "email", "phone"]
FIELDS = ["name", "email", "phone", "location", "linkedin", "total_exp", "current_role", "companies", "exp_count",
          "projects", "education", "degree", "certifications"]

def schema_problems(p):
    if not isinstance(p, dict) or not p: return ["no parsed output"]
    out = []
    te = p.get("total_experience_years", "MISSING")
    if te == "MISSING": out.append("total_experience_years missing")
    elif not isinstance(te, (int, float)): out.append(f"total_experience_years={te!r}")
    for k in LISTS:
        if not isinstance(p.get(k), list): out.append(f"{k}={'missing' if k not in p else repr(p.get(k))[:20]}")
    for k in REQ_STR:
        if not isinstance(p.get(k), str): out.append(f"{k}={p.get(k)!r}")
    return out

def load(pattern):
    rows = []
    for fp in sorted(glob.glob(f"{E}/{pattern}")):
        rec = json.load(open(fp)); s = sc.score(rec)
        s.update(mode=rec["mode"], file=rec["file"], run=rec["run"], sec=rec["seconds"], err=rec.get("error") or "",
                 schema=schema_problems(rec.get("parsed")) if not rec.get("error") else [],
                 quality=(rec.get("evaluation") or {}).get("parse_quality") or {})
        mid = sum(sc.truth[rec["file"]]["total_exp"]) / 2
        try: s["_abs_err"] = abs(float(s.get("_exp_value")) - mid)
        except Exception: s["_abs_err"] = None
        rows.append(s)
    return rows

def summarise(rows, label):
    res = {"label": label, "runs": len(rows), "failed_runs": sum(1 for r in rows if r["err"]),
           "max_seconds": max(r["sec"] for r in rows), "median_seconds": statistics.median(r["sec"] for r in rows)}
    for mode in ("single", "multi"):
        rs = [r for r in rows if r["mode"] == mode and r["run"] == 1 and not r["file"].startswith("R05")]
        ok = [r for r in rs if not r["err"]]
        res[mode] = {"scored": f"{len(ok)}/{len(rs)}",
                     "fields": {f: f"{sum(1 for r in ok if r.get(f))}/{len(rs)}" for f in FIELDS},
                     "exp_fail": [f"{r['file'][:3]}={r.get('_exp_value')}" for r in rs if not r.get("total_exp")],
                     "exp_mae": round(statistics.mean(r["_abs_err"] for r in ok if r["_abs_err"] is not None), 2),
                     "skill_recall": round(statistics.mean(r["_skill_recall"] for r in ok), 2)}
    res["schema_problem_runs"] = [f"{r['file'][:3]}/{r['mode'][0]}{r['run']}: {', '.join(r['schema'])}" for r in rows if r["schema"]]
    cons = {}
    for f in ["R01_standard.pdf", "R06_mixed_dates.pdf", "R10_long_4page.pdf"]:
        rs = sorted((r for r in rows if r["file"] == f and r["mode"] == "single"), key=lambda r: r["run"])
        cons[f[:3]] = [("FAILED" if r["err"] else
                        f"exp={r.get('_exp_value')} jobs={r['_n_exp']} proj={r['_n_proj']} edu={r['_n_edu']} cert={r['_n_cert']}") for r in rs]
    res["consistency_single"] = cons
    r10 = [r for r in rows if r["file"].startswith("R10")]
    res["r10_complete"] = f"{sum(1 for r in r10 if not r['err'] and r['_n_exp'] == 7 and r['_n_proj'] == 6 and r['_n_edu'] == 2 and r['_n_cert'] == 4)}/{len(r10)}"
    res["fixes_applied"] = {"retries": sum(r["quality"].get("retries", 0) for r in rows),
                            "repaired": [f"{r['file'][:3]}/{r['mode'][0]}{r['run']}:{s}" for r in rows for s in r["quality"].get("repaired_sections", [])],
                            "fallbacks": [f"{r['file'][:3]}/{r['run']}" for r in rows if r["quality"].get("mode") == "single_fallback_multi"],
                            "llm_vs_computed_exp": {f"{r['file'][:3]}/{r['mode'][0]}{r['run']}": (r["quality"].get("llm_total_experience_years"), r.get("_exp_value"))
                                                    for r in rows if r["quality"] and r["run"] == 1}}
    return res

before = summarise(load(sys.argv[2] if len(sys.argv) > 2 else "results_baseline_or/a[234]_*.json"), "before")
after = summarise(load(sys.argv[3] if len(sys.argv) > 3 else "results_after/a[234]_*.json"), "after")
json.dump({"before": before, "after": after}, open(f"{E}/compare.json", "w"), indent=1, default=str)
for k in before:
    if k in ("label", "fixes_applied"): continue
    print(f"\n### {k}\n  before: {before[k]}\n  after : {after[k]}")
print("\n### fixes_applied (after)\n ", json.dumps(after["fixes_applied"], indent=1))
