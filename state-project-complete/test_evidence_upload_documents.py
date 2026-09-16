"""Issue #140 follow-up: .pdf and .docx support for the upload-as-Evidence
endpoint, on top of the .txt/.md support added earlier (test_evidence_upload.py).

Builds real minimal PDF/DOCX files rather than mocking the extraction
libraries, so this actually exercises pypdf/python-docx, not just the
surrounding error-handling scaffolding.
"""
from __future__ import annotations

import io
import sqlite3
import tempfile
import unittest
from pathlib import Path

from docx import Document as DocxDocument
from fastapi.testclient import TestClient

from api import Settings, create_app


def _minimal_pdf_bytes(text: str) -> bytes:
    """A hand-built, single-page PDF with a real text content stream --
    avoids pulling in a PDF-writing dependency (e.g. reportlab) just for
    test fixtures. pypdf's PdfReader.extract_text() reads this the same
    way it reads any real text-based PDF."""
    content_stream = f"BT /F1 18 Tf 10 100 Td ({text}) Tj ET".encode("latin-1")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> "
        b"/MediaBox [0 0 400 200] /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(content_stream)).encode() + b" >>\nstream\n" + content_stream + b"\nendstream",
    ]
    out = io.BytesIO()
    out.write(b"%PDF-1.4\n")
    offsets = [0]
    for i, body in enumerate(objects, start=1):
        offsets.append(out.tell())
        out.write(f"{i} 0 obj\n".encode() + body + b"\nendobj\n")
    xref_offset = out.tell()
    out.write(f"xref\n0 {len(objects) + 1}\n".encode())
    out.write(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        out.write(f"{offset:010d} 00000 n \n".encode())
    out.write(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF".encode()
    )
    return out.getvalue()


def _minimal_docx_bytes(paragraphs: list[str], table_rows: list[list[str]] | None = None) -> bytes:
    document = DocxDocument()
    for text in paragraphs:
        document.add_paragraph(text)
    if table_rows:
        table = document.add_table(rows=0, cols=len(table_rows[0]))
        for row in table_rows:
            cells = table.add_row().cells
            for i, value in enumerate(row):
                cells[i].text = value
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


class LaunchDateProvider:
    name = "test"
    model_identifier = "deterministic-test-v1"

    def interpret(self, *, context, evidence):
        return {
            "summary": "The launch date moved.",
            "topics": ["pilot", "launch"],
            "outcome": "review_recommended",
            "review_recommendations": [{
                "review_action": "create",
                "review_type": "proposed_update",
                "decision_question": "Accept the new launch date?",
                "why_consequential": "The current launch date would be stale.",
                "affected_state_item_ids": ["state_launch"],
                "proposed_changes": [{
                    "operation": "update",
                    "state_item_id": "state_launch",
                    "expected_version": 1,
                    "proposed_statement": "Launch is October 15.",
                    "rationale": "The submitted evidence explicitly changes the date.",
                }],
            }],
        }


class DocumentUploadTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tempdir.name) / "state.db")
        app = create_app(
            Settings(database_path=self.db_path, provider="anthropic", cors_origins=["http://localhost:8000"]),
            provider=LaunchDateProvider(),
        )
        self.client_context = TestClient(app)
        self.client = self.client_context.__enter__()
        with sqlite3.connect(self.db_path) as connection:
            connection.execute(
                "INSERT INTO current_state_items(id, topic, statement, version) VALUES (?, ?, ?, ?)",
                ("state_launch", "launch", "Launch is October 1.", 1),
            )
            connection.commit()

    def tearDown(self):
        self.client_context.__exit__(None, None, None)
        self.tempdir.cleanup()

    def test_pdf_upload_extracts_text_and_flows_through_interpretation(self):
        pdf_bytes = _minimal_pdf_bytes("Launch moved to October 15.")
        response = self.client.post(
            "/api/evidence/upload",
            files={"file": ("brief.pdf", pdf_bytes, "application/pdf")},
        )
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(len(response.json()["reviews"]), 1)

        items = self.client.get("/api/evidence").json()["items"]
        uploaded = next(e for e in items if e["source_type"] == "uploaded_note")
        self.assertEqual(uploaded["source_name"], "brief.pdf")
        self.assertIn("Launch moved to October 15", uploaded["content"])

    def test_docx_upload_extracts_paragraphs_and_tables(self):
        docx_bytes = _minimal_docx_bytes(
            ["Kickoff meeting notes.", "Launch moved to October 15."],
            table_rows=[["Owner", "Date"], ["Alex", "October 15"]],
        )
        response = self.client.post(
            "/api/evidence/upload",
            files={"file": ("requirements.docx", docx_bytes,
                             "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
        )
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(len(response.json()["reviews"]), 1)

        items = self.client.get("/api/evidence").json()["items"]
        uploaded = next(e for e in items if e["source_type"] == "uploaded_note")
        self.assertEqual(uploaded["source_name"], "requirements.docx")
        self.assertIn("Launch moved to October 15", uploaded["content"])
        self.assertIn("Alex", uploaded["content"])  # table content preserved

    def test_scanned_pdf_with_no_text_layer_gives_a_clear_error_not_empty_evidence(self):
        # A page with no content stream at all -- pypdf extracts "" from
        # it, exactly like a scanned/image-only page with no text layer.
        blank_pdf = _minimal_pdf_bytes("")
        response = self.client.post(
            "/api/evidence/upload",
            files={"file": ("scan.pdf", blank_pdf, "application/pdf")},
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"]["code"], "no_extractable_text")
        self.assertIn("Scanned", response.json()["detail"]["error_details"]["error_message"])

    def test_corrupt_pdf_is_rejected_cleanly(self):
        response = self.client.post(
            "/api/evidence/upload",
            files={"file": ("broken.pdf", b"%PDF-1.4 not a real pdf structure", "application/pdf")},
        )
        self.assertEqual(response.status_code, 422)
        self.assertIn(response.json()["detail"]["code"], ("unreadable_file", "no_extractable_text"))

    def test_corrupt_docx_is_rejected_cleanly(self):
        response = self.client.post(
            "/api/evidence/upload",
            files={"file": ("broken.docx", b"not a real zip/docx file", "application/octet-stream")},
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"]["code"], "unreadable_file")

    def test_empty_docx_is_rejected_as_empty_not_silently_accepted(self):
        empty_bytes = _minimal_docx_bytes([])
        response = self.client.post(
            "/api/evidence/upload",
            files={"file": ("empty.docx", empty_bytes,
                             "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"]["code"], "empty_file")

    def test_pptx_is_still_rejected_not_yet_supported(self):
        # A .pptx is also a zip container -- confirm the gate is by
        # extension allowlist, not "can python-docx open this zip."
        fake_pptx = b"PK\x03\x04fake pptx bytes"
        response = self.client.post(
            "/api/evidence/upload",
            files={"file": ("deck.pptx", fake_pptx,
                             "application/vnd.openxmlformats-officedocument.presentationml.presentation")},
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"]["code"], "unsupported_file_type")


if __name__ == "__main__":
    unittest.main()
