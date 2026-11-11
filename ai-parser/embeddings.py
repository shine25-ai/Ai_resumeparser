"""JD Match prompt mode, phase 3: meaning-based search.

A small open model (BAAI/bge-small-en-v1.5, 384 numbers per text) runs on the server's CPU, so no API key
or per-call cost is needed. Resumes are embedded as "passages" and requests as "queries"; the backend
compares them. Vectors are normalised, so a dot product is the cosine similarity.
"""
import os
import threading
from typing import List

MODEL_NAME = os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")
CACHE_DIR = os.getenv("EMBEDDING_CACHE_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), ".models"))
MAX_TEXTS = 64          # per request
MAX_CHARS = 2000        # the model reads about 512 tokens; longer text is cut

_model = None
_lock = threading.Lock()


def _get_model():
    """Load the model once (downloaded on first use, about 70 MB, then kept in CACHE_DIR)."""
    global _model
    if _model is None:
        with _lock:
            if _model is None:
                from fastembed import TextEmbedding
                _model = TextEmbedding(model_name=MODEL_NAME, cache_dir=CACHE_DIR)
    return _model


def clean_texts(texts: List[str]) -> List[str]:
    if not isinstance(texts, list) or not texts:
        raise ValueError("Send a non-empty list of texts.")
    if len(texts) > MAX_TEXTS:
        raise ValueError(f"At most {MAX_TEXTS} texts per call.")
    return [" ".join(str(t or "").split())[:MAX_CHARS] or "(empty)" for t in texts]


def embed(texts: List[str], kind: str = "passage") -> List[List[float]]:
    """kind 'query' for a search request, 'passage' for a resume."""
    if kind not in ("query", "passage"):
        raise ValueError("kind must be 'query' or 'passage'.")
    texts = clean_texts(texts)
    model = _get_model()
    vectors = model.query_embed(texts) if kind == "query" else model.passage_embed(texts)
    out = []
    for v in vectors:
        norm = float((v * v).sum()) ** 0.5 or 1.0
        out.append([round(float(x) / norm, 6) for x in v])
    return out
