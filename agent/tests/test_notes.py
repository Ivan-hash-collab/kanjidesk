from __future__ import annotations

from app.core.user_notes import clear_user_notes, get_user_note, save_user_note
from app.core.ref_catalog import save_user_fields


def test_user_notes_roundtrip_does_not_require_kklc(initialized_db):
    saved = save_user_fields("霧", mnemonic="fog story", notes="memo")
    assert saved["mnemonic"] == "fog story"
    assert get_user_note("霧") == {"mnemonic": "fog story", "notes": "memo"}
    save_user_note("霧", notes="updated")
    assert get_user_note("霧")["mnemonic"] == "fog story"
    assert get_user_note("霧")["notes"] == "updated"
    assert clear_user_notes() == 1
    assert get_user_note("霧") == {"mnemonic": "", "notes": ""}
