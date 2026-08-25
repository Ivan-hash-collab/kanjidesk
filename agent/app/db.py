from __future__ import annotations

import sqlite3
from collections.abc import Callable
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from app.paths import DB_PATH, ensure_dirs

SCHEMA = """
CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('component', 'kanji', 'vocab', 'grammar')),
    surface TEXT NOT NULL,
    primary_meaning TEXT NOT NULL,
    meaning_ru TEXT,
    extra_json TEXT DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
CREATE INDEX IF NOT EXISTS idx_items_surface ON items(surface);

CREATE TABLE IF NOT EXISTS kanji (
    item_id INTEGER PRIMARY KEY REFERENCES items(id),
    klc_id INTEGER UNIQUE NOT NULL,
    page_no INTEGER,
    onyomi TEXT,
    kunyomi TEXT
);

CREATE INDEX IF NOT EXISTS idx_kanji_klc ON kanji(klc_id);

CREATE TABLE IF NOT EXISTS edges (
    id INTEGER PRIMARY KEY,
    from_id INTEGER NOT NULL REFERENCES items(id),
    to_id INTEGER NOT NULL REFERENCES items(id),
    kind TEXT NOT NULL,
    UNIQUE (from_id, to_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id, kind);
CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_id, kind);

CREATE TABLE IF NOT EXISTS mnemonics (
    id INTEGER PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES items(id),
    locale TEXT NOT NULL DEFAULT 'ru',
    source TEXT NOT NULL CHECK (source IN ('ai', 'user', 'template')),
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS facts (
    id INTEGER PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES items(id),
    kind TEXT NOT NULL,
    UNIQUE (item_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_facts_item ON facts(item_id);

CREATE TABLE IF NOT EXISTS cards (
    fact_id INTEGER PRIMARY KEY REFERENCES facts(id),
    card_json TEXT NOT NULL,
    due TEXT NOT NULL,
    stability REAL,
    difficulty REAL,
    reps INTEGER NOT NULL DEFAULT 0,
    lapses INTEGER NOT NULL DEFAULT 0,
    state INTEGER NOT NULL DEFAULT 1,
    last_review TEXT
);

CREATE INDEX IF NOT EXISTS idx_cards_due ON cards(due);

CREATE TABLE IF NOT EXISTS review_log (
    id INTEGER PRIMARY KEY,
    fact_id INTEGER NOT NULL REFERENCES facts(id),
    rating INTEGER NOT NULL,
    duration_ms INTEGER,
    answer TEXT,
    correct INTEGER,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lesson_completions (
    item_id INTEGER PRIMARY KEY REFERENCES items(id),
    taught_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS synonyms (
    id INTEGER PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES items(id),
    text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES items(id),
    text TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_cache (
    prompt_hash TEXT PRIMARY KEY,
    model TEXT,
    role TEXT,
    response_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS llm_usage (
    day TEXT NOT NULL,
    model TEXT NOT NULL,
    rpd INTEGER NOT NULL DEFAULT 0,
    tpm INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, model)
);

CREATE TABLE IF NOT EXISTS llm_rpm (
    id INTEGER PRIMARY KEY,
    model TEXT NOT NULL,
    ts REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_llm_rpm_model_ts ON llm_rpm(model, ts);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS study_sessions (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    source_text TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_kanji (
    id INTEGER PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    kanji TEXT NOT NULL,
    catalog_id INTEGER,
    analyzed INTEGER NOT NULL DEFAULT 0,
    briefing_json TEXT,
    UNIQUE (session_id, kanji)
);

CREATE INDEX IF NOT EXISTS idx_session_kanji ON session_kanji(session_id, position);

CREATE TABLE IF NOT EXISTS prompts (
    id TEXT PRIMARY KEY,
    skill TEXT NOT NULL,
    name TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    user_template TEXT NOT NULL,
    json_schema TEXT,
    tier TEXT NOT NULL DEFAULT 'workhorse'
);

CREATE TABLE IF NOT EXISTS kanji_notes (
    kanji TEXT PRIMARY KEY,
    mnemonic TEXT,
    notes TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_messages (
    id INTEGER PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    skills TEXT NOT NULL,
    kanji_list TEXT NOT NULL,
    text_ru TEXT NOT NULL,
    meta_json TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_messages ON session_messages(session_id, id);
"""

SCHEMA_VERSION = 1
LATEST_SCHEMA_VERSION = 2
MigrationScript = str | Callable[[sqlite3.Connection], None]


def _table_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {str(row[1]) for row in conn.execute(f"PRAGMA table_info({table})")}


def migrate_v2(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS generation_runs (
            id TEXT PRIMARY KEY,
            session_id INTEGER NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
            status TEXT NOT NULL DEFAULT 'running',
            settings_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL,
            completed_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_generation_runs_session ON generation_runs(session_id, created_at);
        """
    )
    cols = _table_columns(conn, "session_kanji")
    if "briefing_run_id" not in cols:
        conn.execute("ALTER TABLE session_kanji ADD COLUMN briefing_run_id TEXT")


MIGRATIONS: dict[int, MigrationScript] = {
    1: SCHEMA,
    2: migrate_v2,
}

DEFAULTS = {
    "mnemonic_locale": "ru",
    "gemini_tier": "auto",
    "mnemonic_count": "2",
    "mnemonic_style": "visual-story",
    "mnemonic_refs": "wanikani,koohii,heisig",
    "batch_max_out_tokens": "5500",
    "batch_max_kanji": "10",
    "active_skills": "mnemonic,decompose,readings,lookalikes",
    "etymology_level": "short",
    "skill_len_mode": "global",
    "skill_len_global": "2",
    "skill_len_mnemonic": "2",
    "skill_len_decompose": "2",
    "skill_len_readings": "2",
    "skill_len_lookalikes": "2",
    "skill_len_vocab": "2",
    "skill_len_etymology": "2",
    "user_prompt": "",
}

_conn: sqlite3.Connection | None = None
_conn_path: Path | None = None
_db_path_override: Path | None = None
_savepoint_serial = 0


def _normalized_path(path: str | Path) -> Path:
    return Path(path).expanduser().resolve()


def database_path() -> Path:
    return _db_path_override or _normalized_path(DB_PATH)


def configure_database(path: str | Path | None) -> Path:
    """Select the database used by path-less helpers, closing any prior connection."""
    global _db_path_override
    reset_connection()
    _db_path_override = _normalized_path(path) if path is not None else None
    return database_path()


@contextmanager
def use_database(path: str | Path) -> Iterator[Path]:
    """Temporarily isolate all database helpers to one database file."""
    previous = _db_path_override
    selected = configure_database(path)
    try:
        yield selected
    finally:
        configure_database(previous)


def connect(path: str | Path | None = None) -> sqlite3.Connection:
    global _conn, _conn_path, _db_path_override
    if path is not None:
        db_path = _normalized_path(path)
        if _conn is not None and _conn_path != db_path:
            raise RuntimeError(
                f"database connection already open for {_conn_path}; "
                "use configure_database() before switching paths"
            )
        _db_path_override = db_path
    else:
        db_path = database_path()
    if _conn is not None:
        if _conn_path != db_path:
            raise RuntimeError(f"database connection path mismatch: {_conn_path} != {db_path}")
        return _conn
    if db_path == _normalized_path(DB_PATH):
        ensure_dirs()
    else:
        db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    _conn = conn
    _conn_path = db_path
    return conn


def _user_version(conn: sqlite3.Connection) -> int:
    return int(conn.execute("PRAGMA user_version").fetchone()[0])


def _apply_migration(conn: sqlite3.Connection, version: int, script: MigrationScript) -> None:
    try:
        if callable(script):
            conn.execute("BEGIN IMMEDIATE")
            script(conn)
            conn.execute(f"PRAGMA user_version = {version}")
            conn.commit()
            return
        conn.executescript(
            "BEGIN IMMEDIATE;\n"
            f"{script.strip()}\n"
            f"PRAGMA user_version = {version};\n"
            "COMMIT;"
        )
    except Exception:
        if conn.in_transaction:
            conn.rollback()
        raise


def migrate(conn: sqlite3.Connection) -> int:
    """Apply every pending migration and return the resulting schema version."""
    current = _user_version(conn)
    if current > LATEST_SCHEMA_VERSION:
        raise RuntimeError(
            f"database schema version {current} is newer than supported "
            f"version {LATEST_SCHEMA_VERSION}"
        )
    for version in range(current + 1, LATEST_SCHEMA_VERSION + 1):
        try:
            script = MIGRATIONS[version]
        except KeyError as exc:
            raise RuntimeError(f"missing database migration {version}") from exc
        _apply_migration(conn, version, script)
    return _user_version(conn)


def init_db(path: str | Path | None = None) -> sqlite3.Connection:
    conn = connect(path)
    migrate(conn)
    try:
        conn.executemany(
            "INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)",
            DEFAULTS.items(),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return conn


def reset_connection() -> None:
    global _conn, _conn_path
    if _conn is not None:
        _conn.close()
        _conn = None
    _conn_path = None


@contextmanager
def tx() -> Iterator[sqlite3.Connection]:
    global _savepoint_serial
    conn = connect()
    nested = conn.in_transaction
    savepoint = ""
    if nested:
        _savepoint_serial += 1
        savepoint = f"kanjymemo_tx_{_savepoint_serial}"
        conn.execute(f"SAVEPOINT {savepoint}")
    else:
        conn.execute("BEGIN")
    try:
        yield conn
        if nested:
            conn.execute(f"RELEASE SAVEPOINT {savepoint}")
        else:
            conn.commit()
    except Exception:
        if nested:
            conn.execute(f"ROLLBACK TO SAVEPOINT {savepoint}")
            conn.execute(f"RELEASE SAVEPOINT {savepoint}")
        else:
            conn.rollback()
        raise


def fetchall(sql: str, params: tuple[Any, ...] = ()) -> list[sqlite3.Row]:
    return connect().execute(sql, params).fetchall()


def fetchone(sql: str, params: tuple[Any, ...] = ()) -> sqlite3.Row | None:
    return connect().execute(sql, params).fetchone()


def execute(sql: str, params: tuple[Any, ...] = ()) -> sqlite3.Cursor:
    conn = connect()
    should_commit = not conn.in_transaction
    cur = conn.execute(sql, params)
    if should_commit:
        conn.commit()
    return cur


def get_setting(key: str, default: str | None = None) -> str:
    row = fetchone("SELECT value FROM settings WHERE key = ?", (key,))
    if row is None:
        return default if default is not None else DEFAULTS.get(key, "")
    return row["value"]


def set_setting(key: str, value: str) -> None:
    execute(
        "INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {k: row[k] for k in row.keys()}
