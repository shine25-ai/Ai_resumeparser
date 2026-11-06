"""Run the corpus through a parser build: rounds a2 (single), a3 (multi), a4 (repeats), a5 (optional extra repeats).
Usage: python run_after.py <eval_dir> [provider] [parser_dir] [out_name]
parser_dir defaults to this repo's ai-parser (the fixed code); pass a copy of the old code for a baseline."""
import json, os, sys, time
E = sys.argv[1]; provider = sys.argv[2] if len(sys.argv) > 2 else "openrouter"
REPO_AP = os.path.abspath(f"{E}/../..")
AP = os.path.abspath(sys.argv[3]) if len(sys.argv) > 3 else REPO_AP
sys.path.insert(0, AP); os.chdir(REPO_AP)
from dotenv import load_dotenv; load_dotenv(f"{REPO_AP}/.env")
from graph import app_graph

out_dir = f"{E}/" + (sys.argv[4] if len(sys.argv) > 4 else "results_after"); os.makedirs(out_dir, exist_ok=True)
files = sorted(f for f in os.listdir(f"{E}/corpus") if f.startswith("R"))
plan = [("a2", "single", f, 1) for f in files] + [("a3", "multi", f, 1) for f in files] + \
       [("a4", "single", f, i) for f in ["R01_standard.pdf", "R06_mixed_dates.pdf", "R10_long_4page.pdf"] for i in (2, 3, 4)]
# Extra repeat runs for score consistency (G14), e.g. EXTRA_REPEATS=R07_unicode.pdf,R09_non_tech_hr.pdf
plan += [("a5", "single", f, i) for f in filter(None, os.getenv("EXTRA_REPEATS", "").split(",")) for i in (2, 3, 4)]
for rnd, mode, f, i in plan:
    out = f"{out_dir}/{rnd}_{mode}_{f}_{i}.json"
    if os.path.exists(out): continue
    os.environ["PARSE_MODE"] = mode
    retries, t0 = 0, time.time()
    while True:
        state = {"file_path": f"{E}/corpus/{f}", "raw_text": "", "parsed_resume": {}, "evaluation": {}, "status": "started", "error": "",
                 "ai_config": {"provider": provider, "model_name": "openai/gpt-oss-120b"}}
        try:
            res = app_graph.invoke(state)
        except Exception as e:
            res = {"error": f"EXC {e!r}", "status": "exception"}
        err = str(res.get("error") or "")
        if ("429" in err or "rate_limit" in err.lower()) and retries < 6:
            retries += 1; print(f"  429 on {f}, retry {retries}", flush=True); time.sleep(35); continue
        break
    ev = res.get("evaluation") or {}
    rec = {"round": rnd, "mode": mode, "file": f, "run": i, "seconds": round(time.time() - t0, 1), "retries_429": retries, "provider": provider,
           "status": res.get("status"), "error": err, "parsed": res.get("parsed_resume"), "evaluation": ev}
    json.dump(rec, open(out, "w"), indent=1, ensure_ascii=False)
    q = ev.get("parse_quality") or {}
    print(rnd, mode, f, i, rec["status"], f"{rec['seconds']}s", "exp", (rec["parsed"] or {}).get("total_experience_years"),
          "mode", q.get("mode"), "repaired", q.get("repaired_sections"), "retries", q.get("retries"), err[:120], flush=True)
    time.sleep(3)
print("DONE", flush=True)
