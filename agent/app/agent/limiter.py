from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

import yaml

from app.db import connect, fetchone
from app.paths import LLM_CONFIG

_config: dict[str, Any] | None = None


def load_config() -> dict[str, Any]:
    global _config
    if _config is None:
        _config = yaml.safe_load(LLM_CONFIG.read_text(encoding="utf-8"))
    return _config


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def rpd_used(model: str) -> int:
    row = fetchone("SELECT rpd FROM llm_usage WHERE day = ? AND model = ?", (_today(), model))
    return int(row["rpd"] if row else 0)


def rpm_used(model: str) -> int:
    cutoff = time.time() - 60
    conn = connect()
    conn.execute("DELETE FROM llm_rpm WHERE ts < ?", (cutoff,))
    row = conn.execute("SELECT COUNT(*) AS n FROM llm_rpm WHERE model = ? AND ts >= ?", (model, cutoff)).fetchone()
    conn.commit()
    return int(row["n"] if row else 0)


def record_call(model: str, tokens: int = 0) -> None:
    conn = connect()
    conn.execute(
        """
        INSERT INTO llm_usage(day, model, rpd, tpm) VALUES (?, ?, 1, ?)
        ON CONFLICT(day, model) DO UPDATE SET
            rpd = rpd + 1,
            tpm = tpm + excluded.tpm
        """,
        (_today(), model, tokens),
    )
    conn.execute("INSERT INTO llm_rpm(model, ts) VALUES (?, ?)", (model, time.time()))
    conn.commit()


def rpd_ratio(model: str, limit: int) -> float:
    if limit <= 0:
        return 1.0
    return rpd_used(model) / limit


def can_use(model_cfg: dict[str, Any]) -> bool:
    if rpm_used(model_cfg["id"]) >= int(model_cfg["rpm"]):
        return False
    if rpd_used(model_cfg["id"]) >= int(model_cfg["rpd"]):
        return False
    return True


def pick_model(tier: str) -> dict[str, Any] | None:
    cfg = load_config()
    for model in cfg["tiers"][tier]["models"]:
        if can_use(model):
            return model
    return None


def workhorse_exhausted() -> bool:
    cfg = load_config()
    reserve = float(cfg["policy"]["workhorse_rpd_reserve"])
    for model in cfg["tiers"]["workhorse"]["models"]:
        if rpd_ratio(model["id"], model["rpd"]) < reserve and can_use(model):
            return False
    return True
