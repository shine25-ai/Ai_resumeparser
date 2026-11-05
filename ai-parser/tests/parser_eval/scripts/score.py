"""Score round 2/3/4 outputs against ground truth."""
import json, os, re, sys, glob, collections
truth = {}
def load_truth(eval_dir):
    truth.update(json.load(open(f"{eval_dir}/corpus/ground_truth.json")))
def norm(s): return re.sub(r"\s+", " ", str(s or "")).strip().lower()
def digits(s): return re.sub(r"\D", "", str(s or ""))[-10:]
NULLS = {"", "none", "null", "n/a", "na", "not provided", "not available", "unknown"}

def score(rec):
    t = truth[rec["file"]]; p = rec.get("parsed") or {}; ev = rec.get("evaluation") or {}
    out = {}
    if rec.get("error"):
        return {"_error": rec["error"][:100]}
    out["name"] = norm(p.get("full_name")) == norm(t["full_name"])
    if t["email"] is None:
        out["email"] = norm(p.get("email")) in NULLS
    else:
        out["email"] = norm(p.get("email")) == norm(t["email"])
    if t["phone"] is None:
        out["phone"] = norm(p.get("phone")) in NULLS
    else:
        out["phone"] = digits(p.get("phone")) == t["phone"]
    out["location"] = norm(t["location"]) in norm(p.get("location"))
    if t["linkedin"]:
        out["linkedin"] = t["linkedin"].lower() in norm(p.get("linkedin"))
    else:
        out["linkedin"] = norm(p.get("linkedin")) in NULLS
    te = p.get("total_experience_years")
    out["exp_type_number"] = isinstance(te, (int, float))
    try: tev = float(te)
    except Exception: tev = None
    lo, hi = t["total_exp"]
    out["total_exp"] = tev is not None and lo <= tev <= hi
    out["_exp_value"] = te
    if t["current_role"]:
        out["current_role"] = norm(t["current_role"]) in norm(p.get("current_role"))
    else:
        out["current_role"] = True  # fresher: anything reasonable
    exps = p.get("experience") or []
    comp_text = " ".join(norm(e.get("company")) for e in exps if isinstance(e, dict))
    out["companies"] = all(norm(c) in comp_text for c in t["companies"])
    out["_n_exp"] = len(exps)
    n_exp_expected = len(t["companies"]) + (1 if rec["file"].startswith("R06") else 0)
    out["exp_count"] = len(exps) == n_exp_expected
    projs = p.get("projects") or []
    out["_n_proj"] = len(projs)
    out["projects"] = t["n_projects"][0] <= len(projs) <= t["n_projects"][1]
    edu = p.get("education") or []
    out["_n_edu"] = len(edu)
    out["education"] = t["n_education"][0] <= len(edu) <= t["n_education"][1]
    out["degree"] = any(norm(t["degree"]).replace(".", "") in norm(e.get("degree")).replace(".", "") for e in edu if isinstance(e, dict))
    certs = p.get("certifications") or []
    out["_n_cert"] = len(certs)
    out["certifications"] = t["n_certs"][0] <= len(certs) <= t["n_certs"][1]
    skill_lists = ["primary_skills", "functional_skills", "programming_languages", "frameworks", "databases", "cloud_tech", "devops_and_infrastructure", "other_technologies"]
    allskills = " | ".join(norm(x) for k in skill_lists for x in (p.get(k) or []))
    hit = [s for s in t["skills"] if norm(s) in allskills]
    out["_skill_recall"] = round(len(hit) / len(t["skills"]), 2)
    out["_missed_skills"] = [s for s in t["skills"] if s not in hit]
    out["_ligature"] = any(ch in json.dumps(p, ensure_ascii=False) for ch in "ﬀﬁﬂﬃﬄ")
    out["_prog_langs"] = p.get("programming_languages")
    out["_score"] = ev.get("ai_technical_score"); out["_level"] = ev.get("experience_level"); out["_redflags"] = ev.get("resume_red_flags")
    out["_tokens"] = (ev.get("token_usage") or {}).get("total_tokens")
    return out

def main(S):
  load_truth(S)
  rows = []
  for fp in sorted(glob.glob(f"{S}/results/r[234]_*.json")):
      rec = json.load(open(fp))
      s = score(rec); s.update(round=rec["round"], mode=rec["mode"], file=rec["file"], run=rec["run"], sec=rec["seconds"], retries=rec["retries_429"])
      rows.append(s)
  json.dump(rows, open(f"{S}/results/scores.json", "w"), indent=1, ensure_ascii=False, default=str)
  fields = ["name", "email", "phone", "location", "linkedin", "total_exp", "exp_type_number", "current_role", "companies", "exp_count", "projects", "education", "degree", "certifications"]
  for mode in ["single", "multi"]:
      rs = [r for r in rows if r["mode"] == mode and r["run"] == 1 and "_error" not in r and not r["file"].startswith("R05")]
      if not rs: continue
      print(f"\n== {mode}: {len(rs)} resumes scored")
      for f in fields:
          ok = sum(1 for r in rs if r.get(f)); fails = [r["file"][:3] for r in rs if not r.get(f)]
          print(f"  {f:16s} {ok}/{len(rs)}  fail: {fails}")
      print("  skill recall avg", round(sum(r["_skill_recall"] for r in rs) / len(rs), 2))
  for r in rows:
      print({k: v for k, v in r.items() if k not in fields})

if __name__ == "__main__":
    main(sys.argv[1])
