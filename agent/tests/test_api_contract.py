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


def test_gemini_key_roundtrip(initialized_db, tmp_path, monkeypatch):
    from app.agent import router

    path = tmp_path / "gemini_api_key.env"
    monkeypatch.setattr(router, "GEMINI_KEY_FILE", path)
    router.reset_client()

    with TestClient(app) as client:
        empty = client.get("/api/gemini-key")
        assert empty.status_code == 200
        assert empty.json() == {"configured": False, "hint": ""}

        bad = client.put("/api/gemini-key", json={"key": "short"})
        assert bad.status_code == 400

        raw = "AIzaSyFakeKeyForTests3456"
        saved = client.put("/api/gemini-key", json={"key": f"GEMINI_API_KEY={raw}"})
        assert saved.status_code == 200
        body = saved.json()
        assert body["configured"] is True
        assert body["hint"] == "…3456"
        assert raw not in body["hint"]
        stored = path.read_text(encoding="utf-8")
        assert stored.startswith("GEMINI_API_KEY=")
        assert raw in stored

        gone = client.delete("/api/gemini-key")
        assert gone.status_code == 200
        assert gone.json()["configured"] is False
        assert not path.exists()


def test_session_works_without_kklc_db(initialized_db, tmp_path, monkeypatch):
    from app.core import ref_catalog

    monkeypatch.setattr(ref_catalog, "KKLC_DB", tmp_path / "missing.db")
    with TestClient(app) as client:
        res = client.post("/api/sessions", json={"text": "火水", "title": "no-kklc"})
        assert res.status_code == 200
        body = res.json()
        assert body["count"] == 2
        assert body["kanji"][0]["kanji"] == "火"
