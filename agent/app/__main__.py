from __future__ import annotations

import argparse
import sys
import threading
import time
import urllib.request
import webbrowser

import uvicorn

from app.agent.prompt_store import seed_prompts
from app.db import init_db
from app.paths import USER_DIR


HOST = "127.0.0.1"
PORT = 5280


def _attach_stdio() -> None:
    """pythonw has no console; uvicorn/logging crash if stdout is None."""
    if sys.stdout is not None and sys.stderr is not None:
        return
    USER_DIR.mkdir(parents=True, exist_ok=True)
    stream = open(USER_DIR / "kanjymemo.log", "a", encoding="utf-8", buffering=1)
    sys.stdout = stream
    sys.stderr = stream


def run_api() -> None:
    uvicorn.run("app.api.main:app", host=HOST, port=PORT, reload=False, log_level="warning")


def wait_health() -> bool:
    url = f"http://{HOST}:{PORT}/api/health"
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for _ in range(80):
        try:
            with opener.open(url, timeout=0.4) as resp:
                if 200 <= getattr(resp, "status", 200) < 300:
                    return True
        except Exception:
            time.sleep(0.2)
    return False


def open_desktop(url: str) -> None:
    try:
        import webview

        webview.create_window("KanjyMemo", url, width=1320, height=880)
        webview.start()
    except Exception:
        webbrowser.open(url)


def main() -> None:
    _attach_stdio()
    parser = argparse.ArgumentParser(description="KanjyMemo local app")
    parser.add_argument("--api", action="store_true", help="only FastAPI (no window)")
    parser.add_argument("--dev", action="store_true", help="API only; use Vite on :5173")
    args = parser.parse_args()

    init_db()
    seed_prompts()

    if args.api or args.dev:
        run_api()
        return

    thread = threading.Thread(target=run_api, daemon=True)
    thread.start()
    if not wait_health():
        print(f"API не поднялся на http://{HOST}:{PORT}. Порт занят или сервер упал.", file=sys.stderr)
        sys.exit(1)
    open_desktop(f"http://{HOST}:{PORT}")


if __name__ == "__main__":
    main()
