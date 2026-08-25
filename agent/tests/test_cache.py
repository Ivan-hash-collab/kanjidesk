from __future__ import annotations

from app.agent import router


def test_cache_key_changes_with_prompt_and_config():
    a = router.prompt_hash("batch.v1", {"k": "日"}, system="s1", user="u1", model="m", config={"n": 2})
    b = router.prompt_hash("batch.v1", {"k": "日"}, system="s1", user="u2", model="m", config={"n": 2})
    c = router.prompt_hash("batch.v1", {"k": "日"}, system="s1", user="u1", model="m", config={"n": 4})
    d = router.prompt_hash("batch.v1", {"k": "日"}, system="s1", user="u1", model="other", config={"n": 2})
    assert len({a, b, c, d}) == 4


def test_force_skips_cached_payload(initialized_db, monkeypatch):
    monkeypatch.setattr(router, "select_model", lambda *args, **kwargs: ("none", None))
    monkeypatch.setattr(router, "get_client", lambda: None)
    h = router.prompt_hash(
        "batch.v1",
        {"k": "日"},
        system="sys",
        user="user",
        model="",
        config={"max_output_tokens": None},
    )
    router.cache_put(h, "", "batch.v1", {"cards": [{"kanji": "日", "mnemonic_ru": "cached"}]})
    cached = router.generate_json("batch.v1", "sys", "user", {"k": "日"})
    assert cached.get("_cached") is True
    assert cached["cards"][0]["mnemonic_ru"] == "cached"

    forced = router.generate_json("batch.v1", "sys", "user", {"k": "日"}, force=True)
    assert forced.get("_cached") is not True
    assert forced.get("_fallback") == "template"

    again = router.generate_json("batch.v1", "sys", "user", {"k": "日"}, force=True)
    assert again.get("_cached") is not True
    assert again.get("cards") is None or again.get("_fallback") == "template"


def test_plain_model_text_is_kept(initialized_db, monkeypatch):
    class _Resp:
        text = "日 — солнце выглядывает из-за горизонта."
        usage_metadata = None

    class _Models:
        def generate_content(self, **kwargs):
            return _Resp()

    class _Client:
        models = _Models()

    monkeypatch.setattr(router, "select_model", lambda *args, **kwargs: ("workhorse", {"id": "fake-model"}))
    monkeypatch.setattr(router, "get_client", lambda: _Client())
    monkeypatch.setattr(router, "record_call", lambda *args, **kwargs: None)
    out = router.generate_json("batch.v1", "sys", "user", {"k": "日"}, force=True)
    assert "солнце" in out["text_ru"]
    assert out.get("_error") is None
    assert out.get("_fallback") != "template"
