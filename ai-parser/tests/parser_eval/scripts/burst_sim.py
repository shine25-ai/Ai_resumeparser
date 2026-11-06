"""Simulated burst: 10 resumes at once against a fake LLM that enforces Groq's on-demand limit
(8,000 tokens per minute) on a clock sped up 10x. Usage: g04_sim.py <code_dir> <before|after>"""
import sys, os, time, json, threading, collections
code, which = sys.argv[1], sys.argv[2]
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../.."))
os.chdir(code); sys.path.insert(0, code)
for f in ("recruitment.db",):
    if os.path.exists(f): os.remove(f)
os.environ["PARSE_MODE"] = "single"
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage
import main, graph

SCALE = 10                 # 1 simulated minute = 6 real seconds
LIMIT, WINDOW = 8000, 60 / SCALE
lock, used = threading.Lock(), collections.deque()   # (time, tokens)
stats = collections.Counter()
RESUME = {"full_name": "A B", "email": "a@b.c", "phone": "1", "experience": [{"company": "X", "designation": "Dev", "duration": "Jan 2020 - Present"}],
          "education": [{"degree": "BE", "institution": "U", "year_of_passing": "2019"}]}
EVAL = {"experience_level": "Mid-Level", "ai_technical_score": 60}

class RateLimitError(Exception):
    pass

class FakeGroq:
    temperature = 0
    def invoke(self, prompt_val):
        sysmsg = prompt_val.to_messages()[0].content
        is_eval = "Recruiter" in sysmsg
        tokens = 3500 if is_eval else 4500
        for internal_try in range(3):          # the Groq client retries 429s twice by itself
            with lock:
                now = time.time()
                while used and now - used[0][0] > WINDOW: used.popleft()
                in_window = sum(t for _, t in used)
                if in_window + tokens <= LIMIT:
                    used.append((now, tokens)); stats["ok_calls"] += 1; break
                wait = (WINDOW - (now - used[0][0])) * SCALE   # in simulated seconds, as Groq reports it
                stats["429s"] += 1
            if internal_try < 2:
                time.sleep(wait / SCALE); continue
            raise RateLimitError(f"Error code: 429 - Rate limit reached for model `openai/gpt-oss-120b` on tokens per minute (TPM): "
                                 f"Limit {LIMIT}, Used {in_window}, Requested {tokens}. Please try again in {wait:.2f}s.")
        time.sleep(1.5 / SCALE * 10 / 10)          # model latency ~1.5s real
        return AIMessage(content=json.dumps(EVAL if is_eval else RESUME), usage_metadata={"input_tokens": tokens - 500, "output_tokens": 500, "total_tokens": tokens})

graph.get_llm = lambda *a, **k: FakeGroq()
# waits the parser does itself also run on the simulated clock
if hasattr(graph, "time"):   # the old code has no waiting of its own
    graph.time = type("T", (), {"sleep": staticmethod(lambda s: time.sleep(s / SCALE)), "time": time.time})

files = ["R01_standard.pdf", "R02_two_column.pdf", "R06_mixed_dates.pdf", "R07_unicode.pdf", "R08_no_contact.pdf"] * 2
t0 = time.time()
with TestClient(main.app) as client:
    ids = [client.post("/api/upload", files={"file": (f, open(f"{REPO}/tests/parser_eval/corpus/{f}", "rb"))},
                       data={"ai_config": json.dumps({"provider": "groq"})}).json()["job_id"] for f in files]
    while True:
        st = {i: client.get(f"/api/status/{i}").json() for i in ids}
        if all(s["status"] in ("completed", "error") for s in st.values()): break
        time.sleep(0.2)
elapsed = (time.time() - t0) * SCALE
done = sum(s["status"] == "completed" for s in st.values())
errors = collections.Counter(((s["evaluation"] or {}).get("error") or "")[:60] for s in st.values() if s["status"] == "error")
waits = sum(((s["evaluation"] or {}).get("parse_quality") or {}).get("rate_limit_waits", 0) for s in st.values())
res = {"which": which, "jobs": len(ids), "completed": done, "failed": len(ids) - done, "simulated_minutes": round(elapsed / 60, 1),
       "provider_429s": stats["429s"], "parser_waits": waits, "errors": dict(errors)}
print(json.dumps(res)); json.dump(res, open(f"{os.path.dirname(code)}/g04_sim_{which}.json", "w"), indent=1)
