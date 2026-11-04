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
