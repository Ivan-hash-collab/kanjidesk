from __future__ import annotations

import sys
from typing import Any

import yaml

from app.db import connect, fetchall, fetchone
from app.paths import PROMPTS_YAML


def seed_prompts() -> int:
    if not PROMPTS_YAML.exists():
        return 0
    try:
        rows = yaml.safe_load(PROMPTS_YAML.read_text(encoding="utf-8")) or []
    except yaml.YAMLError as exc:
        print(f"prompts.yaml не читается: {exc}", file=sys.stderr)
        return 0
    if not isinstance(rows, list):
        print("prompts.yaml: ожидается список промптов", file=sys.stderr)
        return 0
    conn = connect()
    n = 0
    for row in rows:
        conn.execute(
            """
            INSERT INTO prompts(id, skill, name, system_prompt, user_template, json_schema, tier)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                skill = excluded.skill,
                name = excluded.name,
                system_prompt = excluded.system_prompt,
                user_template = excluded.user_template,
                json_schema = excluded.json_schema,
                tier = excluded.tier
            """,
            (
                row["id"],
                row["skill"],
                row["name"],
                row["system_prompt"].strip(),
                row["user_template"].strip(),
                row.get("json_schema"),
                row.get("tier") or "workhorse",
            ),
        )
        n += 1
    conn.commit()
    return n


def get_prompt(prompt_id: str) -> dict[str, Any]:
    row = fetchone("SELECT * FROM prompts WHERE id = ?", (prompt_id,))
    if row is None:
        raise KeyError(prompt_id)
    return dict(row)


def list_prompts() -> list[dict[str, Any]]:
    return [dict(r) for r in fetchall("SELECT id, skill, name, tier FROM prompts ORDER BY skill")]
