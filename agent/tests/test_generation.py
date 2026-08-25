from __future__ import annotations

from app.agent.budget import kanji_per_chunk, plan_chunks, skill_settings
from app.core.session import add_message, clear_session_analysis, create_session, get_session, save_briefing
from app.core.user_notes import save_user_note
from app.db import fetchone


def test_higher_detail_shrinks_chunks():
    chars = list("日月火水木金土山川田")
    low = plan_chunks(chars, ["mnemonic"], skill_settings({"skill_len_global": 1, "batch_max_kanji": 10}))
    high = plan_chunks(chars, ["mnemonic"], skill_settings({"skill_len_global": 4, "batch_max_kanji": 10}))
    assert kanji_per_chunk(skill_settings({"skill_len_global": 4})) < kanji_per_chunk(
        skill_settings({"skill_len_global": 1})
    )
    assert high["kanji_per_chunk"] < low["kanji_per_chunk"]
    assert high["calls"] > low["calls"]
    assert high["per_kanji_out"] > low["per_kanji_out"]


def test_delete_clears_all_generated_state_but_keeps_user_notes(initialized_db):
    sess = create_session("日本", title="set")
    sid = sess["id"]
    save_user_note("日", mnemonic="моя история")
    save_briefing(sid, "日", {"kanji": "日", "mnemonic_ru": "ai"})
    add_message(sid, 0, ["mnemonic"], ["日"], "ai story", {"run_id": "run-1"})
    add_message(sid, 0, ["chat"], ["日"], "вопрос", {"oneshot": True})
    before = get_session(sid)
    assert before["analyzed"] == 1
    assert before["messages"]

    out = clear_session_analysis(sid)
    after = get_session(sid)
    assert out["analyzed"] == 0
    assert after["analyzed"] == 0
    assert after["messages"] == []
    assert all(not row.get("briefing") for row in after["kanji"])
    note = fetchone("SELECT mnemonic FROM kanji_notes WHERE kanji = ?", ("日",))
    assert note["mnemonic"] == "моя история"


def test_force_plan_includes_already_analyzed(initialized_db):
    from app.agent.study import plan_session_batch, template_briefing

    sess = create_session("日月", title="set")
    sid = sess["id"]
    save_briefing(sid, "日", {"kanji": "日", "mnemonic_ru": "old"})
    skipped = plan_session_batch(sid, ["mnemonic"], force=False)
    assert "日" in skipped["skipped"]
    rewrite = plan_session_batch(sid, ["mnemonic"], force=True)
    assert "日" not in rewrite["skipped"]
    chars = [ch for chunk in rewrite["chunks"] for ch in chunk["kanji"]]
    assert "日" in chars

    ctx = {
        "kanji": "日",
        "meaning": "sun",
        "components": ["日"],
        "my_mnemonic": "OLD STORY",
        "lookalikes": [],
    }
    assert "OLD STORY" in template_briefing(ctx)["mnemonic_ru"]
    assert "OLD STORY" not in template_briefing(ctx, ignore_saved_mnemonic=True)["mnemonic_ru"]


def test_run_combo_shows_plain_gemini_text(initialized_db, monkeypatch):
    from app.agent import study
    from app.agent.prompt_store import seed_prompts

    seed_prompts()
    letter = "日 — солнце. 月 — луна."
    monkeypatch.setattr(
        study,
        "generate_json",
        lambda *args, **kwargs: {"_text": letter, "text_ru": letter, "_model": "fake"},
    )
    out = study.run_combo(["日", "月"], ["mnemonic"], {"_force": True, "mnemonic_count": 1})
    assert out["text_ru"] == letter
    assert not out.get("_error")
    assert "не JSON" not in str(out.get("_error") or "")
