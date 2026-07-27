#!/usr/bin/env python3
"""parse_header() の proofread フィールド後方互換チェック。pytest 不要、素の assert。"""
import tempfile
from pathlib import Path

from auto_note_publish import parse_header

HEADER_NO_PROOFREAD = """タイトル: テスト記事
公開推し: 2026-07-30
status: draft
---
本文
"""

HEADER_PENDING = HEADER_NO_PROOFREAD.replace("status: draft", "status: draft\nproofread: pending")
HEADER_DONE = HEADER_NO_PROOFREAD.replace("status: draft", "status: draft\nproofread: done")


def _parse(text: str) -> dict:
    with tempfile.NamedTemporaryFile("w", suffix="-for-note.md", delete=False, encoding="utf-8") as f:
        f.write(text)
        path = Path(f.name)
    try:
        return parse_header(path)
    finally:
        path.unlink()


def test_missing_field_defaults_to_pending():
    assert _parse(HEADER_NO_PROOFREAD)["proofread"] == "pending"


def test_explicit_pending():
    assert _parse(HEADER_PENDING)["proofread"] == "pending"


def test_explicit_done():
    assert _parse(HEADER_DONE)["proofread"] == "done"


if __name__ == "__main__":
    test_missing_field_defaults_to_pending()
    test_explicit_pending()
    test_explicit_done()
    print("ok")
