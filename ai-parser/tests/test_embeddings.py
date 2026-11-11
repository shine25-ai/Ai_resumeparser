"""JD Match phase 3: the meaning model."""
import pytest

import embeddings
from embeddings import MAX_CHARS, MAX_TEXTS, clean_texts, embed


def test_texts_are_checked_and_cut():
    assert clean_texts(["  a \n b ", None, ""]) == ["a b", "(empty)", "(empty)"]
    assert len(clean_texts(["x" * (MAX_CHARS + 50)])[0]) == MAX_CHARS
    with pytest.raises(ValueError):
        clean_texts([])
    with pytest.raises(ValueError):
        clean_texts(["a"] * (MAX_TEXTS + 1))
    with pytest.raises(ValueError):
        embed(["a"], kind="resume")


@pytest.fixture(scope="module")
def model_ready():
    try:
        embeddings._get_model()
    except Exception as e:  # no network to download it, or fastembed missing
        pytest.skip(f"embedding model not available: {e}")


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def test_vectors_are_normalised(model_ready):
    (v,) = embed(["Backend developer, Python, FastAPI"], "passage")
    assert len(v) == 384 and abs(dot(v, v) - 1.0) < 1e-3


def test_meaning_matches_different_words(model_ready):
    (q,) = embed(["Engineer who has built payment systems for a fintech product"], "query")
    upi, hr, qa = embed(["Software engineer. Built the UPI gateway and card processing for a digital wallet.",
                         "HR manager. Recruitment, onboarding and payroll policies.",
                         "QA engineer. Selenium test automation for a retail website."], "passage")
    assert dot(q, upi) > dot(q, hr) and dot(q, upi) > dot(q, qa)
