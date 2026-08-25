from __future__ import annotations

import pytest

from app.core.ja_tokenize import available, tokenize_ja


pytestmark = pytest.mark.skipif(not available(), reason="Sudachi is not installed")


def test_offsets_and_lemmas():
    samples = {
        "かかった": "かかる",
        "浸かった": "浸かる",
        "見ていました": "見る",
    }
    for surface, lemma in samples.items():
        data = tokenize_ja(surface)
        assert data["engine"] == "sudachi"
        assert data["tokens"]
        head = data["tokens"][0]
        assert head["lemma"] == lemma
        assert head["begin"] == 0
        assert head["end"] >= len(surface) or head["surface"]
        assert "reading" in head
        assert isinstance(head.get("lemmas"), list)
