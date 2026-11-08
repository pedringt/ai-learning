"""Reading text out of an uploaded Evidence file (.txt, .md, .pdf, .docx).

Shared by POST /api/evidence/upload (api_core.py) and POST /api/baseline/evidence/upload (baseline_async_intake.py),
which used to carry identical copies (#620). Errors are 422s with a code the frontend shows.
"""
from __future__ import annotations

import io
import logging

from docx import Document as DocxDocument
from fastapi import HTTPException
from pypdf import PdfReader

logger = logging.getLogger("state.upload")

UPLOAD_EXTENSIONS = {".txt", ".md", ".pdf", ".docx"}
UPLOAD_MAX_BYTES = 15_000_000


def unreadable(message: str, code: str = "unreadable_file") -> HTTPException:
    return HTTPException(status_code=422, detail={"code": code, "error_details": {"error_message": message}})


def extract_upload_text(raw: bytes, extension: str) -> str:
    if extension in (".txt", ".md"):
        try:
            return raw.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise unreadable("That file doesn't look like plain text State can read.") from exc
    if extension == ".pdf":
        try:
            reader = PdfReader(io.BytesIO(raw))
            if reader.is_encrypted:
                raise unreadable("That PDF is password-protected. Remove the password and try again.")
            pages_text = [page.extract_text() or "" for page in reader.pages]
        except HTTPException:
            raise
        except Exception as exc:  # broad on purpose: pypdf raises many types on corrupt input; all become a 422
            logger.info("Uploaded PDF could not be parsed (%s)", type(exc).__name__)
            raise unreadable("That PDF could not be read. It may be corrupted.") from exc
        text = "\n\n".join(pages_text).strip()
        if not text:
            # Scanned/image-only PDFs have no text layer at all -- OCR is explicitly out of scope for this first
            # version (issue #140 follow-up), so this needs its own message rather than the generic empty-file one.
            raise unreadable(
                "State couldn't find readable text in that PDF. Scanned or image-only PDFs aren't "
                "supported yet -- try a text-based PDF instead.",
                code="no_extractable_text",
            )
        return text
    if extension == ".docx":
        try:
            document = DocxDocument(io.BytesIO(raw))
        except Exception as exc:  # broad on purpose: python-docx/zipfile/lxml raise many types on corrupt input; all become a 422
            logger.info("Uploaded .docx could not be parsed (%s)", type(exc).__name__)
            raise unreadable("That .docx file could not be read. It may be corrupted.") from exc
        parts = [p.text for p in document.paragraphs if p.text.strip()]
        for table in document.tables:
            for row in table.rows:
                row_text = " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
                if row_text:
                    parts.append(row_text)
        return "\n\n".join(parts)
    raise unreadable("Unsupported file type.", code="unsupported_file_type")
