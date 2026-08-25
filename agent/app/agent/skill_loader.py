from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from app.paths import SKILLS_DIR


@dataclass
class Skill:
    name: str
    description: str
    prompt_id: str
    tier: str
    output_keys: list[str]
    combinable: bool
    body: str
    path: Path


def _parse_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    if not text.startswith("---"):
        return {}, text
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}, text
    meta = yaml.safe_load(parts[1]) or {}
    return meta, parts[2].strip()


def load_skill(name: str) -> Skill:
    path = SKILLS_DIR / name / "SKILL.md"
    if not path.exists():
        raise FileNotFoundError(name)
    meta, body = _parse_frontmatter(path.read_text(encoding="utf-8"))
    keys = meta.get("output_keys") or []
    if isinstance(keys, str):
        keys = [k.strip() for k in keys.split(",") if k.strip()]
    raw_prompt = meta.get("prompt_id")
    if raw_prompt is None:
        prompt_id = f"{name}.v1"
    else:
        prompt_id = str(raw_prompt)
    return Skill(
        name=str(meta.get("name") or name),
        description=str(meta.get("description") or ""),
        prompt_id=prompt_id,
        tier=str(meta.get("tier") or "workhorse"),
        output_keys=list(keys),
        combinable=bool(meta.get("combinable")),
        body=body,
        path=path,
    )


def list_skills() -> list[Skill]:
    if not SKILLS_DIR.exists():
        return []
    out = []
    for d in sorted(SKILLS_DIR.iterdir()):
        if (d / "SKILL.md").exists():
            out.append(load_skill(d.name))
    return out
