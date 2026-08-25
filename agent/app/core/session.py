from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.core.parse_kanji import unique_kanji
from app.core.ref_catalog import lookup
from app.db import connect, execute, fetchall, fetchone, tx


def create_session(text: str, title: str | None = None) -> dict[str, Any]:
    chars = unique_kanji(text)
    if not chars:
        raise ValueError("в тексте нет кандзи")
    now = datetime.now(timezone.utc).isoformat()
    label = title or f"{chars[0]}…{chars[-1]}" if len(chars) > 1 else (title or chars[0])
    label = f"{label} ({len(chars)})"
    conn = connect()
    cur = conn.execute(
        "INSERT INTO study_sessions(title, source_text, created_at) VALUES (?, ?, ?)",
        (label, text, now),
    )
    sid = int(cur.lastrowid)
    for i, ch in enumerate(chars):
        cat = lookup(ch)
        conn.execute(
            """
            INSERT INTO session_kanji(session_id, position, kanji, catalog_id, analyzed, briefing_json)
            VALUES (?, ?, ?, ?, 0, NULL)
            """,
            (sid, i, ch, cat.get("id") if cat else None),
        )
    conn.commit()
    return get_session(sid)


def list_sessions() -> list[dict[str, Any]]:
    rows = fetchall(
        """
        SELECT s.*, COUNT(k.id) AS kanji_count,
               SUM(k.analyzed) AS analyzed_count,
               (SELECT COUNT(*) FROM session_messages m WHERE m.session_id = s.id) AS message_count
        FROM study_sessions s
        LEFT JOIN session_kanji k ON k.session_id = s.id
        GROUP BY s.id
        ORDER BY s.id DESC
        LIMIT 40
        """
    )
    return [dict(r) for r in rows]


def get_session(session_id: int) -> dict[str, Any]:
    sess = fetchone("SELECT * FROM study_sessions WHERE id = ?", (session_id,))
    if sess is None:
        raise KeyError(session_id)
    items = fetchall(
        "SELECT * FROM session_kanji WHERE session_id = ? ORDER BY position",
        (session_id,),
    )
    data = dict(sess)
    data["kanji"] = [_item_out(r) for r in items]
    data["count"] = len(items)
    data["analyzed"] = sum(1 for r in items if r["analyzed"])
    data["messages"] = list_messages(session_id)
    return data


def _item_out(row) -> dict[str, Any]:
    import json

    d = dict(row)
    briefing = None
    if d.get("briefing_json"):
        try:
            briefing = json.loads(d["briefing_json"])
        except json.JSONDecodeError:
            briefing = None
    if isinstance(briefing, dict):
        from app.agent.render import render_card
        from app.core.kana import format_readings, has_cyrillic
        from app.core.ref_catalog import lookup as cat_lookup

        cat = cat_lookup(d["kanji"]) or {}
        if has_cyrillic(str(briefing.get("onyomi_hint") or "")):
            briefing["onyomi_hint"] = format_readings(cat.get("onyomi") or "")
        if has_cyrillic(str(briefing.get("kunyomi_hint") or "")):
            briefing["kunyomi_hint"] = format_readings(cat.get("kunyomi") or "")
        vocab = briefing.get("vocab")
        words = vocab if isinstance(vocab, list) else (vocab.get("words") if isinstance(vocab, dict) else None)
        if isinstance(words, list):
            for w in words:
                if not isinstance(w, dict):
                    continue
                for key in ("reading", "kana", "romaji"):
                    if has_cyrillic(str(w.get(key) or "")):
                        w[key] = ""
        briefing["text_ru"] = render_card(briefing)
    d["briefing"] = briefing
    d.pop("briefing_json", None)
    return d


def get_entry(session_id: int, kanji: str):
    row = fetchone(
        "SELECT * FROM session_kanji WHERE session_id = ? AND kanji = ?",
        (session_id, kanji),
    )
    if row is None:
        raise KeyError((session_id, kanji))
    return _item_out(row)


def save_briefing(
    session_id: int,
    kanji: str,
    briefing: dict[str, Any],
    run_id: str | None = None,
) -> None:
    import json

    execute(
        """
        UPDATE session_kanji
        SET analyzed = 1, briefing_json = ?, briefing_run_id = COALESCE(?, briefing_run_id)
        WHERE session_id = ? AND kanji = ?
        """,
        (json.dumps(briefing, ensure_ascii=False), run_id, session_id, kanji),
    )


def list_messages(session_id: int) -> list[dict[str, Any]]:
    import json
    import sqlite3

    from app.agent.render import strip_stub_text

    try:
        rows = fetchall(
            "SELECT * FROM session_messages WHERE session_id = ? ORDER BY id",
            (session_id,),
        )
    except sqlite3.OperationalError:
        return []
    out = []
    for r in rows:
        d = dict(r)
        try:
            d["kanji"] = json.loads(d.pop("kanji_list"))
        except Exception:
            d["kanji"] = []
            d.pop("kanji_list", None)
        meta = None
        if d.get("meta_json"):
            try:
                meta = json.loads(d["meta_json"])
            except json.JSONDecodeError:
                meta = None
        d["meta"] = meta
        d.pop("meta_json", None)
        d["skills"] = [s for s in str(d.get("skills") or "").split(",") if s]
        d["text_ru"] = strip_stub_text(str(d.get("text_ru") or ""))
        out.append(d)
    return out


def add_message(
    session_id: int,
    chunk_index: int,
    skills: list[str],
    kanji: list[str],
    text_ru: str,
    meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    import json

    now = datetime.now(timezone.utc).isoformat()
    execute(
        """
        INSERT INTO session_messages(session_id, chunk_index, skills, kanji_list, text_ru, meta_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            session_id,
            chunk_index,
            ",".join(skills),
            json.dumps(kanji, ensure_ascii=False),
            text_ru,
            json.dumps(meta or {}, ensure_ascii=False),
            now,
        ),
    )
    msgs = list_messages(session_id)
    return msgs[-1] if msgs else {}


def last_run_id(session_id: int) -> str | None:
    last = None
    for m in list_messages(session_id):
        skills = m.get("skills") or []
        if skills == ["chat"] or (len(skills) == 1 and skills[0] == "chat"):
            continue
        rid = (m.get("meta") or {}).get("run_id")
        if rid:
            last = str(rid)
    return last


def last_run_text(session_id: int) -> str:
    msgs = [
        m
        for m in list_messages(session_id)
        if not ((m.get("skills") or []) == ["chat"] or (m.get("skills") or [""])[0:1] == ["chat"])
    ]
    if not msgs:
        return ""
    rid = last_run_id(session_id)
    if rid:
        bag = [m for m in msgs if str((m.get("meta") or {}).get("run_id") or "") == rid]
        if bag:
            msgs = bag
        else:
            msgs = msgs[-8:]
    else:
        # no run_id: take trailing stretch until chunk_index resets
        bag = []
        for m in reversed(msgs):
            bag.append(m)
            if m.get("chunk_index") == 0 and len(bag) > 1:
                break
        msgs = list(reversed(bag))
    return "\n\n——\n\n".join(str(m.get("text_ru") or "") for m in msgs if m.get("text_ru"))


def ensure_generation_run(
    session_id: int,
    run_id: str,
    settings: dict[str, Any] | None = None,
) -> dict[str, Any]:
    import json

    now = datetime.now(timezone.utc).isoformat()
    execute(
        """
        INSERT INTO generation_runs(id, session_id, status, settings_json, created_at)
        VALUES (?, ?, 'running', ?, ?)
        ON CONFLICT(id) DO NOTHING
        """,
        (run_id, session_id, json.dumps(settings or {}, ensure_ascii=False), now),
    )
    row = fetchone("SELECT * FROM generation_runs WHERE id = ?", (run_id,))
    return dict(row) if row else {"id": run_id, "session_id": session_id}


def complete_generation_run(run_id: str, status: str = "done") -> None:
    execute(
        "UPDATE generation_runs SET status = ?, completed_at = ? WHERE id = ?",
        (status, datetime.now(timezone.utc).isoformat(), run_id),
    )


def find_run_chunk(
    session_id: int,
    run_id: str,
    kanji: list[str],
) -> dict[str, Any] | None:
    wanted = list(kanji)
    for m in list_messages(session_id):
        skills = m.get("skills") or []
        if skills == ["chat"]:
            continue
        if str((m.get("meta") or {}).get("run_id") or "") != str(run_id):
            continue
        if list(m.get("kanji") or []) == wanted:
            return m
    return None


def clear_session_analysis(session_id: int) -> dict[str, Any]:
    """Delete every generated run, message and briefing for the session.

    User-authored kanji_notes stay untouched.
    """
    with tx() as conn:
        msg_n = conn.execute(
            "DELETE FROM session_messages WHERE session_id = ?",
            (session_id,),
        ).rowcount
        run_n = conn.execute(
            "DELETE FROM generation_runs WHERE session_id = ?",
            (session_id,),
        ).rowcount
        conn.execute(
            """
            UPDATE session_kanji
            SET analyzed = 0, briefing_json = NULL, briefing_run_id = NULL
            WHERE session_id = ?
            """,
            (session_id,),
        )
    sess = get_session(session_id)
    return {
        "ok": True,
        "deleted": int(msg_n or 0),
        "runs_deleted": int(run_n or 0),
        "analyzed": sess["analyzed"],
        "run_id": None,
    }


def delete_run(session_id: int, run_id: str | None = None) -> dict[str, Any]:
    return clear_session_analysis(session_id)


def latest_session_id() -> int | None:
    row = fetchone("SELECT id FROM study_sessions ORDER BY id DESC LIMIT 1")
    return int(row["id"]) if row else None
