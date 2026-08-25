from __future__ import annotations

import sqlite3

from app import db
from app.core.session import create_session, get_session


def test_fresh_database_reaches_latest_schema(initialized_db):
    assert db._user_version(initialized_db) == db.LATEST_SCHEMA_VERSION
    cols = {row[1] for row in initialized_db.execute("PRAGMA table_info(session_kanji)")}
    assert "briefing_run_id" in cols
    tables = {row[0] for row in initialized_db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "generation_runs" in tables
    assert "kanji_notes" in tables


def test_upgrade_from_legacy_schema_preserves_sessions(tmp_path):
    path = tmp_path / "legacy.db"
    conn = sqlite3.connect(str(path))
    conn.executescript(
        """
        CREATE TABLE study_sessions (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            source_text TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE session_kanji (
            id INTEGER PRIMARY KEY,
            session_id INTEGER NOT NULL,
            position INTEGER NOT NULL,
            kanji TEXT NOT NULL,
            catalog_id INTEGER,
            analyzed INTEGER NOT NULL DEFAULT 0,
            briefing_json TEXT
        );
        CREATE TABLE session_messages (
            id INTEGER PRIMARY KEY,
            session_id INTEGER NOT NULL,
            chunk_index INTEGER NOT NULL,
            skills TEXT NOT NULL,
            kanji_list TEXT NOT NULL,
            text_ru TEXT NOT NULL,
            meta_json TEXT,
            created_at TEXT NOT NULL
        );
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        INSERT INTO study_sessions(title, source_text, created_at)
        VALUES ('legacy', '日本', '2024-01-01T00:00:00+00:00');
        INSERT INTO session_kanji(session_id, position, kanji, analyzed)
        VALUES (1, 0, '日', 1), (1, 1, '本', 0);
        INSERT INTO settings(key, value) VALUES ('mnemonic_style', 'koohii-story');
        """
    )
    conn.commit()
    conn.close()

    with db.use_database(path):
        upgraded = db.init_db()
        assert db._user_version(upgraded) == db.LATEST_SCHEMA_VERSION
        sess = get_session(1)
        assert sess["title"] == "legacy"
        assert [k["kanji"] for k in sess["kanji"]] == ["日", "本"]
        assert sess["kanji"][0]["analyzed"] == 1
        assert db.get_setting("mnemonic_style") == "koohii-story"
        cols = {row[1] for row in upgraded.execute("PRAGMA table_info(session_kanji)")}
        assert "briefing_run_id" in cols


def test_transaction_rollback_does_not_leave_partial_session(initialized_db):
    created = create_session("山川", title="ok")
    assert created["count"] == 2
    try:
        with db.tx() as conn:
            conn.execute(
                "INSERT INTO study_sessions(title, source_text, created_at) VALUES ('x','火','t')"
            )
            raise RuntimeError("boom")
    except RuntimeError:
        pass
    rows = db.fetchall("SELECT title FROM study_sessions")
    assert [r["title"] for r in rows] == [created["title"]]
