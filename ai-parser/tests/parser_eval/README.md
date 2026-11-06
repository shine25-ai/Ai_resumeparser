# Parser evaluation

Synthetic resumes with known answers (`corpus/ground_truth.json`), used to measure parsing accuracy before and after changes.

```bash
# from ai-parser/
venv/bin/python tests/parser_eval/scripts/make_corpus.py tests/parser_eval/corpus      # rebuild corpus (incl. R05 scanned PDF)
venv/bin/python tests/parser_eval/scripts/run_after.py "$PWD/tests/parser_eval" openrouter   # rounds a2 single, a3 multi, a4 repeats
venv/bin/python tests/parser_eval/scripts/compare.py "$PWD/tests/parser_eval" "<before glob>" "results_after/a[234]_*.json"
```

`run_after.py` takes an optional parser directory, so a copy of older code can be run as a baseline.
`run_llm_rounds.py` and `round1_extract.py` are the original test rounds (they contain local paths).
Unit tests for the post-processing checks: `venv/bin/python -m pytest tests/test_postprocess.py`.

Gap-specific checks (pass a copy of the parser code as `<code_dir>`; each run uses its own working folder):
- `burst_sim.py <code_dir> <label>` submits 10 resumes at once against a fake LLM that enforces Groq's 8,000 tokens/minute limit (G04).
- `file_types.py <code_dir> <out.json>` runs the scanned, hidden-text, legacy .doc, corrupt and blank files through the whole pipeline (G06-G08).
- `compare_medium.py <eval_dir> <before_dir> <after_dir>` compares two `run_after.py` result folders on non-technical skills (G09),
  phone/skill/date formats (G12), ligatures (G13) and score/level consistency on repeated runs (G14).
  Run `run_after.py` with `EXTRA_REPEATS=R07_unicode.pdf,R09_non_tech_hr.pdf` to get the extra repeats.
- `backend_scenarios.py <server-backend dir> <eval_dir> <results_dir> <parser_texts.json> <out.json>` (backend venv) uploads corpus files
  through the backend with a fake parser and a throwaway local MongoDB: duplicate uploads (G11), whole-word skill search (G12),
  search text (G13) and scanned PDFs reaching the parser.
