from __future__ import annotations

from fastapi.testclient import TestClient

from app.api.main import app
from app.core.session import create_session, save_briefing
from app.core.session import add_message


def test_health_and_delete_contract(initialized_db):
    with TestClient(app) as client:
        health = client.get("/api/health")
        assert health.status_code == 200
        body = health.json()
        assert body["status"] in {"ok", "degraded"}
        assert "version" in body
        assert "schema" in body
        assert "sudachi" in body

        sess = create_session("火水", title="api")
        save_briefing(sess["id"], "火", {"kanji": "火"})
        add_message(sess["id"], 0, ["mnemonic"], ["火"], "story", {"run_id": "r1"})
        res = client.post(f"/api/sessions/{sess['id']}/runs/delete", json={})
        assert res.status_code == 200
        data = res.json()
        assert data["ok"] is True
        assert data["analyzed"] == 0
        loaded = client.get(f"/api/sessions/{sess['id']}")
        assert loaded.json()["analyzed"] == 0
        assert loaded.json()["messages"] == []

        notes = client.put("/api/kanji/火/notes", json={"mnemonic": "user", "notes": "n"})
        assert notes.status_code == 200
        assert notes.json()["ok"] is True
        got = client.get("/api/kanji/火/notes")
        assert got.json()["mnemonic"] == "user"
