"""Round 1: compare the parser's text extraction (graph.extract_text_node) with the backend's (fitz / python-docx)."""
import json, os, re, sys, subprocess
S = sys.argv[1]
sys.path.insert(0, "/Users/ganesan/Documents/projects/shinelogics/Ai_resumeparser/ai-parser")
os.chdir("/Users/ganesan/Documents/projects/shinelogics/Ai_resumeparser/ai-parser")
from graph import extract_text_node

truth = json.load(open(f"{S}/corpus/ground_truth.json"))
BACKEND = "/Users/ganesan/Documents/projects/shinelogics/Ai_resumeparser/server-backend/venv/bin/python"
backend_code = r'''
import sys, fitz, docx
p = sys.argv[1]; ext = p.rsplit(".",1)[-1].lower()
try:
    if ext == "pdf":
        with fitz.open(p) as d: t = "\n".join(pg.get_text() for pg in d)
    elif ext == "docx":
        d = docx.Document(p); parts = [x.text for x in d.paragraphs if x.text.strip()]
        for tb in d.tables:
            for r in tb.rows:
                rt = " | ".join(c.text.strip() for c in r.cells if c.text.strip())
                if rt: parts.append(rt)
        t = "\n".join(parts)
    else:
        c = open(p,"rb").read().decode("utf-8", errors="ignore"); t = "".join(ch for ch in c if ch.isprintable() or ch in "\n\r\t")
    print(t.strip(), end="")
except Exception as e:
    print("__ERR__"+repr(e), end="")
'''
rows = []
for f in sorted(os.listdir(f"{S}/corpus")):
    if f.endswith(".json"): continue
    p = f"{S}/corpus/{f}"
    r = extract_text_node({"file_path": p})
    ptext = r.get("raw_text", "")
    perr = r.get("error", "")
    btext = subprocess.run([BACKEND, "-c", backend_code, p], capture_output=True, text=True).stdout
    t = truth.get(f, {})
    def has(text, s):
        if not s: return None
        return s.lower() in text.lower()
    def has_phone(text, ph):
        if not ph: return None
        return ph in re.sub(r"\D", "", text)
    row = dict(file=f, parser_chars=len(ptext.strip()), parser_err=perr[:80], backend_chars=len(btext.strip()) if not btext.startswith("__ERR__") else 0,
               backend_err=btext[7:90] if btext.startswith("__ERR__") else "",
               parser_name=has(ptext, t.get("full_name")), parser_email=has(ptext, t.get("email")), parser_phone=has_phone(ptext, t.get("phone")),
               backend_name=has(btext, t.get("full_name")), backend_email=has(btext, t.get("email")),
               injection_in_text=("SYSTEM NOTE" in ptext) if f.startswith("R11") else None)
    rows.append(row)
    with open(f"{S}/results/r1_{f}.parser.txt", "w") as fh: fh.write(ptext or perr)
    with open(f"{S}/results/r1_{f}.backend.txt", "w") as fh: fh.write(btext)
json.dump(rows, open(f"{S}/results/round1.json", "w"), indent=1)
for r in rows: print(r)
