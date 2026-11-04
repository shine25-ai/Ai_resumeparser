"""Text extraction for resumes: PDF, DOCX and legacy DOC.

- Hidden PDF text (white, tiny or invisible) is removed before parsing and reported (gap G08).
- PDFs with no readable text are OCR'd when Tesseract is installed, otherwise rejected (gap G06).
- Legacy .doc files are converted with LibreOffice when it is installed, otherwise rejected (gap G07).
"""
import logging
import os
import re
import shutil
import subprocess
import tempfile
from typing import Any, Dict, Tuple

logger = logging.getLogger(__name__)

MIN_TEXT_CHARS = int(os.getenv("MIN_TEXT_CHARS", "100"))     # letters/digits needed to count as "has text"
MIN_VISIBLE_FONT = float(os.getenv("MIN_VISIBLE_FONT", "4.5"))  # pt; smaller text is treated as hidden
OCR_ENABLED = os.getenv("OCR_ENABLED", "true").lower() in ("1", "true", "yes")
SOFFICE_TIMEOUT = int(os.getenv("SOFFICE_TIMEOUT_SECONDS", "90"))


class ExtractionError(Exception):
    """A problem with the file itself; the message is shown to the user."""


def _meaningful_chars(text: str) -> int:
    return len(re.findall(r"[A-Za-z0-9]", text or ""))


# ------------------------------------------------------------------ PDF

def _pypdf_text(path: str) -> str:
    from langchain_community.document_loaders import PyPDFLoader
    return "\n".join(p.page_content for p in PyPDFLoader(path).load())


def _luminance(rgb: Tuple[float, float, float]) -> float:
    r, g, b = rgb
    return 0.299 * r + 0.587 * g + 0.114 * b


def _int_to_rgb(color: int) -> Tuple[float, float, float]:
    return ((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255


def _dark_fills(page):
    """Rectangles filled with a dark colour (light text on these is visible, e.g. a header banner)."""
    import fitz
    rects = []
    for d in page.get_drawings():
        fill = d.get("fill")
        if fill and len(fill) >= 3 and _luminance(tuple(fill[:3])) < 0.5 and d.get("rect") is not None:
            rects.append(fitz.Rect(d["rect"]))
    return rects


def _hidden_reason(span, page, dark_rects, invisible_rects) -> str:
    import fitz
    bbox = fitz.Rect(span["bbox"])
    centre = fitz.Point((bbox.x0 + bbox.x1) / 2, (bbox.y0 + bbox.y1) / 2)
    if span.get("alpha", 255) == 0 or any(r.contains(centre) for r in invisible_rects):
        return "invisible"
    if not page.rect.contains(centre):
        return "off-page"
    if span["size"] < MIN_VISIBLE_FONT:
        return "tiny"
    if _luminance(_int_to_rgb(span["color"])) > 0.9 and not any(r.contains(centre) for r in dark_rects):
        return "white"
    return ""


def _pdf_with_hidden_removed(path: str) -> Tuple[str, Dict[str, Any]]:
    """Return (visible text, hidden-text report). Text is '' when nothing was hidden."""
    import fitz
    hidden, kept_pages, found = [], [], False
    with fitz.open(path) as doc:
        for page in doc:
            invisible = [fitz.Rect(t["bbox"]) for t in page.get_texttrace()
                         if t.get("type") == 3 or t.get("opacity", 1) == 0]
            dark = _dark_fills(page)
            lines_out = []
            for block in page.get_text("dict", sort=True)["blocks"]:
                for line in block.get("lines", []):
                    parts = []
                    for span in line["spans"]:
                        if not span["text"].strip():
                            parts.append(span["text"])
                            continue
                        reason = _hidden_reason(span, page, dark, invisible)
                        if reason:
                            found = True
                            hidden.append((reason, span["text"].strip()))
                        else:
                            parts.append(span["text"])
                    if "".join(parts).strip():
                        lines_out.append("".join(parts).rstrip())
            kept_pages.append("\n".join(lines_out))
    report = {}
    if found:
        text = " ".join(t for _, t in hidden)
        report = {"chars": len(text), "reasons": sorted({r for r, _ in hidden}), "sample": text[:200]}
    return ("\n".join(kept_pages) if found else ""), report


def _ocr_pdf(path: str) -> str:
    import fitz
    tessdata = fitz.get_tessdata()
    if not tessdata:
        raise RuntimeError("Tesseract language data not found")
    out = []
    with fitz.open(path) as doc:
        for page in doc:
            tp = page.get_textpage_ocr(language=os.getenv("OCR_LANGUAGE", "eng"), dpi=300, full=True, tessdata=tessdata)
            out.append(page.get_text(textpage=tp))
    return "\n".join(out)


def _extract_pdf(path: str, info: Dict[str, Any]) -> str:
    try:
        text = _pypdf_text(path)
    except Exception as e:
        raise ExtractionError("This PDF could not be opened. It may be damaged or password-protected.") from e
    try:
        visible, report = _pdf_with_hidden_removed(path)
        if report:
            info["hidden_text"] = report
            text = visible
    except Exception as e:  # never block parsing on the hidden-text check itself
        logger.warning(f"Hidden-text check failed for {path}: {e}")

    if _meaningful_chars(text) >= MIN_TEXT_CHARS:
        return text
    if OCR_ENABLED:
        try:
            ocr_text = _ocr_pdf(path)
            if _meaningful_chars(ocr_text) >= MIN_TEXT_CHARS:
                info["ocr_used"] = True
                return ocr_text
        except Exception as e:
            logger.warning(f"OCR unavailable or failed for {path}: {e}")
            info["ocr_error"] = str(e)[:200]
    raise ExtractionError(
        "No readable text found. This looks like a scanned or image-only resume"
        + (" and OCR could not read it." if OCR_ENABLED else "; OCR is not enabled on this server.")
        + " Please upload a text-based PDF or DOCX.")


# ------------------------------------------------------------------ Word

def _find_soffice() -> str:
    candidates = [os.getenv("SOFFICE_PATH"), shutil.which("soffice"), shutil.which("libreoffice"),
                  "/Applications/LibreOffice.app/Contents/MacOS/soffice"]
    return next((c for c in candidates if c and os.path.exists(c)), "")


def _docx_text(path: str) -> str:
    from langchain_community.document_loaders import Docx2txtLoader
    return "\n".join(p.page_content for p in Docx2txtLoader(path).load())


def _extract_doc(path: str, info: Dict[str, Any]) -> str:
    soffice = _find_soffice()
    if not soffice:
        raise ExtractionError("Legacy .doc files can't be read on this server. Please save the resume as DOCX or PDF and upload again.")
    with tempfile.TemporaryDirectory() as out_dir:
        # A private profile dir lets conversions run while another LibreOffice is open.
        profile = f"file://{out_dir}/profile"
        try:
            subprocess.run([soffice, f"-env:UserInstallation={profile}", "--headless", "--convert-to", "docx",
                            "--outdir", out_dir, path], check=True, capture_output=True, timeout=SOFFICE_TIMEOUT)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
            raise ExtractionError("This .doc file could not be converted. Please save it as DOCX or PDF and upload again.") from e
        converted = os.path.join(out_dir, os.path.splitext(os.path.basename(path))[0] + ".docx")
        if not os.path.exists(converted):
            raise ExtractionError("This .doc file could not be converted. Please save it as DOCX or PDF and upload again.")
        info["converted_from"] = "doc"
        return _docx_text(converted)


# ------------------------------------------------------------------ entry point

def extract_resume_text(path: str) -> Tuple[str, Dict[str, Any]]:
    """Return (text, info). Raises ExtractionError with a user-facing message for unusable files."""
    path = str(path)
    info: Dict[str, Any] = {}
    ext = path.rsplit(".", 1)[-1].lower()
    if ext == "pdf":
        text = _extract_pdf(path, info)
    elif ext == "docx":
        try:
            text = _docx_text(path)
        except Exception as e:
            raise ExtractionError("This DOCX file could not be opened. It may be damaged or not a real Word file.") from e
    elif ext == "doc":
        text = _extract_doc(path, info)
    else:
        raise ExtractionError("Only PDF, DOCX and DOC files are supported.")
    if _meaningful_chars(text) < MIN_TEXT_CHARS:
        raise ExtractionError("The document has almost no text, so there is nothing to parse.")
    return text, info
