"""Run file-type cases through the whole pipeline. Usage: g06_files.py <code_dir> <out.json>"""
import sys, os, json, time
code, out = sys.argv[1], sys.argv[2]
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../.."))
sys.path.insert(0, code); os.chdir(REPO)
from dotenv import load_dotenv; load_dotenv(f"{REPO}/.env"); os.environ["PARSE_MODE"] = "single"
from graph import app_graph
rows = []
for f in ["R05_scanned_image.pdf", "R11_prompt_injection.pdf", "R12_legacy_word97.doc", "X01_corrupt.pdf", "X02_blank.pdf", "X03_legacy.doc"]:
    t = time.time()
    st = {"file_path": f"{REPO}/tests/parser_eval/corpus/{f}", "raw_text": "", "parsed_resume": {}, "evaluation": {}, "status": "started", "error": "",
          "ai_config": {"provider": "openrouter", "model_name": "openai/gpt-oss-120b"}}
    try: r = app_graph.invoke(st)
    except Exception as e: r = {"error": f"EXC {e!r}", "status": "exception"}
    p, ev = r.get("parsed_resume") or {}, r.get("evaluation") or {}
    row = {"file": f, "status": r.get("status"), "error": str(r.get("error") or "")[:200], "seconds": round(time.time() - t, 1),
           "name": p.get("full_name"), "email": p.get("email"), "exp": p.get("total_experience_years"), "n_jobs": len(p.get("experience") or []),
           "skills": (p.get("primary_skills") or [])[:5], "score": ev.get("ai_technical_score"), "level": ev.get("experience_level"),
           "red_flags": ev.get("resume_red_flags"), "pq": {k: v for k, v in (ev.get("parse_quality") or {}).items() if k in ("ocr_used", "hidden_text", "converted_from")}}
    rows.append(row); print(json.dumps(row)[:400], flush=True)
json.dump(rows, open(out, "w"), indent=1)
