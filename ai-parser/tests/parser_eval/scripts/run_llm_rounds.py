"""Rounds 2-4: run the real LangGraph pipeline (Groq, gpt-oss-120b) over the corpus.
Round 2 = single mode (current .env setting), Round 3 = multi mode, Round 4 = repeat runs for consistency."""
import json, os, sys, time
S = sys.argv[1]
only = sys.argv[2] if len(sys.argv) > 2 else None
sys.path.insert(0, "/Users/ganesan/Documents/projects/shinelogics/Ai_resumeparser/ai-parser")
os.chdir("/Users/ganesan/Documents/projects/shinelogics/Ai_resumeparser/ai-parser")
from dotenv import load_dotenv; load_dotenv("/Users/ganesan/Documents/projects/shinelogics/Ai_resumeparser/ai-parser/.env")
from graph import app_graph

files = sorted(f for f in os.listdir(f"{S}/corpus") if f.startswith("R"))
plan = []
if only in (None, "r2"): plan += [("r2", "single", f, 1) for f in files]
if only in (None, "r3"): plan += [("r3", "multi", f, 1) for f in files]
if only in (None, "r4"): plan += [("r4", "single", f, i) for f in ["R01_standard.pdf", "R06_mixed_dates.pdf", "R10_long_4page.pdf"] for i in (2, 3, 4)]

for rnd, mode, f, i in plan:
    out = f"{S}/results/{rnd}_{mode}_{f}_{i}.json"
    if os.path.exists(out): continue
    os.environ["PARSE_MODE"] = mode
    retries, t0 = 0, time.time()
    while True:
        state = {"file_path": f"{S}/corpus/{f}", "raw_text": "", "parsed_resume": {}, "evaluation": {}, "status": "started", "error": "",
                 "ai_config": {"provider": os.getenv("TEST_PROVIDER","groq"), "model_name": "openai/gpt-oss-120b"}}
        try:
            res = app_graph.invoke(state)
        except Exception as e:
            res = {"error": f"EXC {e!r}", "status": "exception"}
        err = str(res.get("error") or "")
        if ("429" in err or "rate_limit" in err.lower()) and retries < 6:
            retries += 1; print(f"  429 on {f}, retry {retries}", flush=True); time.sleep(35); continue
        break
    rec = {"round": rnd, "mode": mode, "file": f, "run": i, "seconds": round(time.time() - t0, 1), "retries_429": retries, "provider": os.getenv("TEST_PROVIDER","groq"),
           "status": res.get("status"), "error": err, "parsed": res.get("parsed_resume"), "evaluation": res.get("evaluation")}
    json.dump(rec, open(out, "w"), indent=1, ensure_ascii=False)
    print(rnd, mode, f, i, rec["status"], f"{rec['seconds']}s", "retries", retries, err[:120], flush=True)
    time.sleep(20)
print("DONE", flush=True)
