"""Serve KanjiDesk and open it as a desktop window."""
from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import threading
import time
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

def frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def resource_dir() -> Path:
    if frozen():
        return Path(getattr(sys, "_MEIPASS"))
    return Path(__file__).resolve().parent


def user_dir() -> Path:
    if frozen():
        base = Path(os.environ.get("APPDATA", str(Path.home() / "AppData/Roaming"))) / "KanjiDesk"
        base.mkdir(parents=True, exist_ok=True)
        return base
    return Path(__file__).resolve().parent


ROOT = resource_dir()
USER = user_dir()
DIST = ROOT / "dist"
SESSION = USER / "session.json"
PROFILE = USER / "chrome-profile"
# Exe uses another port so start.bat and GitHub-сборка не садятся в одно окно.
PORT = 18765 if frozen() else 8765
MEMO_PORT = 15280 if frozen() else 5280
CHANNEL = "exe" if frozen() else "local"
WINDOW_TITLE = "KanjiDesk" if frozen() else "KanjiDesk · отладка"
APP_VERSION = "0.3.4"
URL = f"http://127.0.0.1:{PORT}/"
LOG_DIR = USER / "logs"
EXPECTED_MEMO_VERSION = "0.3.3"
MEMO_CANDIDATES = [
    Path(os.environ.get("KANJYMEMO_ROOT", "")),
    ROOT / "agent",
    Path(__file__).resolve().parent / "agent",
    Path(r"D:\scripts\scripts\KanjyMemo"),
    Path(__file__).resolve().parent.parent.parent.parent / "scripts" / "scripts" / "KanjyMemo",
]


class Handler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.0"

    def __init__(self, *args, **kwargs):
        kwargs["directory"] = str(DIST)
        super().__init__(*args, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        if self._is_memo():
            return self._proxy_memo()
        path = self.path.split("?", 1)[0]
        if path == "/app-mode.json":
            payload = json.dumps(
                {
                    "debug": not frozen(),
                    "channel": CHANNEL,
                    "label": "релиз" if frozen() else "отладка",
                    "version": APP_VERSION,
                },
                ensure_ascii=False,
            ).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        if path == "/session.json" and SESSION.exists():
            data = SESSION.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        return super().do_GET()

    def do_POST(self):
        if self._is_memo():
            return self._proxy_memo()
        self.send_error(404)

    def do_PUT(self):
        if self._is_memo():
            return self._proxy_memo()
        self.send_error(404)

    def do_DELETE(self):
        if self._is_memo():
            return self._proxy_memo()
        self.send_error(404)

    def do_OPTIONS(self):
        if self._is_memo():
            return self._proxy_memo()
        self.send_error(404)

    def _is_memo(self) -> bool:
        return self.path.split("?", 1)[0].startswith("/memo-api")

    def _proxy_memo(self) -> None:
        import urllib.error
        import urllib.request

        rest = self.path[len("/memo-api") :] or "/"
        if not rest.startswith("/"):
            rest = "/" + rest
        url = f"http://127.0.0.1:{MEMO_PORT}{rest}"
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None
        headers = {}
        ctype = self.headers.get("Content-Type")
        if ctype:
            headers["Content-Type"] = ctype
        req = urllib.request.Request(url, data=body, method=self.command, headers=headers)
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        try:
            with opener.open(req, timeout=300) as resp:
                data = resp.read()
                self.send_response(resp.status)
                self.send_header("Content-Type", resp.headers.get("Content-Type", "application/json"))
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as e:
            data = e.read() or b""
            self.send_response(e.code)
            ctype = "application/json"
            if e.headers:
                ctype = e.headers.get("Content-Type", ctype)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception:
            data = b'{"detail":"KanjyMemo API is down"}'
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    def log_message(self, format, *args):
        return


class Server(ThreadingHTTPServer):
    # On Windows SO_REUSEADDR lets several processes bind the same port. Chrome then
    # hits a dead listener and shows ERR_EMPTY_RESPONSE.
    allow_reuse_address = False


def _append_log(name: str, text: str) -> None:
    LOG_DIR.mkdir(exist_ok=True)
    path = LOG_DIR / name
    if path.exists() and path.stat().st_size > 2_000_000:
        path.write_bytes(b"")
    with path.open("a", encoding="utf-8") as fh:
        fh.write(text)
        if not text.endswith("\n"):
            fh.write("\n")


def _log_handle(name: str):
    LOG_DIR.mkdir(exist_ok=True)
    path = LOG_DIR / name
    if path.exists() and path.stat().st_size > 2_000_000:
        path.write_bytes(b"")
    return path.open("a", encoding="utf-8")


def find_memo() -> Path | None:
    for p in MEMO_CANDIDATES:
        if p and (p / "app" / "__main__.py").is_file():
            return p
    return None


def memo_health() -> dict | None:
    try:
        import urllib.request

        req = urllib.request.Request(
            f"http://127.0.0.1:{MEMO_PORT}/api/health",
            headers={"Cache-Control": "no-cache"},
        )
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(req, timeout=1.2) as r:
            raw = r.read().decode("utf-8", errors="replace")
            data = json.loads(raw) if raw else {}
            if r.status == 200 and isinstance(data, dict):
                return data
    except Exception:
        return None
    return None


def memo_up() -> bool:
    info = memo_health()
    return bool(info and info.get("status") in {"ok", "degraded"})


def wait_memo(seconds: float = 20) -> dict | None:
    deadline = time.time() + seconds
    last = None
    while time.time() < deadline:
        last = memo_health()
        if last and last.get("db") is not False and last.get("status") in {"ok", "degraded"}:
            return last
        time.sleep(0.4)
    return last


def _alert(title: str, text: str) -> None:
    if not frozen():
        print(text, flush=True)
        return
    _append_log("kanjidesk.log", f"{title}: {text}")
    try:
        import ctypes

        ctypes.windll.user32.MessageBoxW(0, text, title, 0x10)
    except Exception:
        pass


def start_memo_embedded() -> None:
    agent = ROOT / "agent"
    if not (agent / "app" / "__main__.py").is_file():
        print("KanjyMemo не найден в сборке — мнемоники Gemini будут недоступны.", flush=True)
        return
    os.environ["KANJYMEMO_ROOT"] = str(agent)
    os.environ["KANJYMEMO_USER_DIR"] = str(USER / "agent-user")
    os.environ["KANJYMEMO_GEMINI_KEY"] = str(USER / "gemini_api_key.env")
    (USER / "agent-user").mkdir(parents=True, exist_ok=True)
    if str(agent) not in sys.path:
        sys.path.insert(0, str(agent))
    try:
        import uvicorn
        from app.agent.prompt_store import seed_prompts
        from app.api.main import app as memo_app
        from app.db import init_db

        init_db()
        seed_prompts()
        threading.Thread(
            target=lambda: uvicorn.run(memo_app, host="127.0.0.1", port=MEMO_PORT, log_level="warning"),
            daemon=True,
        ).start()
        print(f"KanjyMemo (встроенный) → http://127.0.0.1:{MEMO_PORT}/", flush=True)
        ready = wait_memo(25)
        if ready:
            print(f"Агент готов · v{ready.get('version')} · Sudachi {'да' if ready.get('sudachi') else 'нет'}", flush=True)
        else:
            print("Агент не ответил вовремя. Смотри %APPDATA%\\KanjiDesk\\logs", flush=True)
    except Exception as e:
        _append_log("kanjidesk.log", f"memo embed: {e!r}")
        print(f"Агент не запустился: {e}", flush=True)


def start_memo() -> None:
    if frozen():
        start_memo_embedded()
        return
    info = memo_health()
    ver = str((info or {}).get("version") or "")
    if info and ver == EXPECTED_MEMO_VERSION and info.get("status") in {"ok", "degraded"}:
        print(f"KanjyMemo уже на :{MEMO_PORT} · v{ver} · schema {info.get('schema')}", flush=True)
        return
    if info:
        print(
            f"KanjyMemo на :{MEMO_PORT} устарел (v{ver or '?'}). Перезапускаю {EXPECTED_MEMO_VERSION}…",
            flush=True,
        )
        stop_stale_servers(MEMO_PORT)
    root = find_memo()
    if not root:
        print("KanjyMemo не найден — агент в «Мнемониках» будет недоступен.", flush=True)
        return
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    log = _log_handle("kanjymemo.log")
    subprocess.Popen(
        [sys.executable, "-m", "app", "--api"],
        cwd=str(root),
        env=env,
        stdout=log,
        stderr=log,
        close_fds=True,
    )
    print(f"KanjyMemo: {root} → http://127.0.0.1:{MEMO_PORT}/", flush=True)
    ready = wait_memo(25)
    if ready:
        print(f"Агент готов · v{ready.get('version')} · Sudachi {'да' if ready.get('sudachi') else 'нет'}", flush=True)
    else:
        print("Агент не ответил вовремя. Смотри logs/kanjymemo.log", flush=True)


def ensure_build() -> None:
    if (DIST / "index.html").exists():
        return
    if frozen():
        raise FileNotFoundError("В сборке нет интерфейса dist/index.html")
    print("Собираю KanjiDesk…", flush=True)
    subprocess.check_call(["npm", "run", "build"], cwd=str(Path(__file__).resolve().parent), shell=True)


def _bypass_proxy() -> None:
    os.environ["NO_PROXY"] = "127.0.0.1,localhost,::1"
    os.environ["no_proxy"] = os.environ["NO_PROXY"]


def _opener():
    import urllib.request

    return urllib.request.build_opener(urllib.request.ProxyHandler({}))


def port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.4)
        return s.connect_ex(("127.0.0.1", port)) == 0


def health_ok() -> bool:
    try:
        import urllib.request

        req = urllib.request.Request(URL, headers={"Cache-Control": "no-cache"})
        with _opener().open(req, timeout=1.5) as r:
            body = r.read(800)
            return getattr(r, "status", 200) == 200 and b"KanjiDesk" in body
    except Exception:
        return False


def peer_channel() -> str | None:
    try:
        import urllib.request

        req = urllib.request.Request(f"{URL}app-mode.json", headers={"Cache-Control": "no-cache"})
        with _opener().open(req, timeout=1.0) as r:
            data = json.loads(r.read().decode("utf-8"))
        ch = data.get("channel")
        return ch if ch in {"exe", "local"} else None
    except Exception:
        return None


def image_for_pid(pid: int) -> str:
    try:
        out = subprocess.check_output(
            ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
            text=True,
            errors="replace",
        )
    except OSError:
        return ""
    line = (out.strip().splitlines() or [""])[0]
    if line.startswith('"'):
        return line.split('","', 1)[0].strip('"').lower()
    return line.split()[0].lower() if line else ""


def occupant_channel(port: int) -> str | None:
    peer = peer_channel()
    if peer:
        return peer
    for pid in pids_listening(port):
        name = image_for_pid(pid)
        if name == "kanjidesk.exe":
            return "exe"
        if name in {"python.exe", "pythonw.exe", "py.exe"}:
            return "local"
    return None


def pids_listening(port: int) -> list[int]:
    try:
        out = subprocess.check_output(["netstat", "-ano"], text=True, errors="replace")
    except OSError:
        return []
    found: set[int] = set()
    suffix = f":{port}"
    for line in out.splitlines():
        if "LISTENING" not in line.upper():
            continue
        parts = line.split()
        if len(parts) < 2:
            continue
        local = parts[1]
        if not (local.endswith(suffix) or local.endswith(f"]{suffix}")):
            continue
        pid = parts[-1]
        if pid.isdigit():
            found.add(int(pid))
    me = {0, os.getpid()}
    return [p for p in found if p not in me]


def stop_stale_servers(port: int) -> None:
    pids = pids_listening(port)
    if not pids:
        return
    print(f"Порт :{port} занят мёртвым процессом {pids} — освобождаю.", flush=True)
    for pid in pids:
        subprocess.run(["taskkill", "/F", "/PID", str(pid)], capture_output=True)
    time.sleep(0.6)


def _reg_app_path(name: str) -> Path | None:
    try:
        import winreg
    except ImportError:
        return None
    for hive in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
        try:
            with winreg.OpenKey(hive, rf"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\{name}") as key:
                val, _ = winreg.QueryValueEx(key, "")
            p = Path(val)
            if p.is_file():
                return p
        except OSError:
            continue
    return None


def find_chromium() -> Path | None:
    names = ("chrome.exe", "msedge.exe", "brave.exe")
    env_paths = [
        Path(os.environ.get("PROGRAMFILES", r"C:\Program Files")) / "Google/Chrome/Application/chrome.exe",
        Path(os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)"))
        / "Google/Chrome/Application/chrome.exe",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Google/Chrome/Application/chrome.exe",
        Path(os.environ.get("PROGRAMFILES", r"C:\Program Files")) / "Microsoft/Edge/Application/msedge.exe",
        Path(os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)"))
        / "Microsoft/Edge/Application/msedge.exe",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft/Edge/Application/msedge.exe",
        Path(os.environ.get("LOCALAPPDATA", "")) / "BraveSoftware/Brave-Browser/Application/brave.exe",
    ]
    for p in env_paths:
        if p.is_file():
            return p
    for name in names:
        found = _reg_app_path(name)
        if found:
            return found
    return None


def open_webview() -> bool:
    try:
        import webview

        webview.create_window(WINDOW_TITLE, URL, width=1440, height=900, min_size=(800, 560))
        webview.start()
        return True
    except Exception as e:
        _append_log("kanjidesk.log", f"webview: {e!r}")
        return False


def open_window() -> None:
    exe = find_chromium()
    if exe:
        PROFILE.mkdir(exist_ok=True)
        subprocess.Popen(
            [
                str(exe),
                f"--app={URL}",
                f"--user-data-dir={PROFILE}",
                "--window-size=1440,900",
                "--new-window",
                "--proxy-bypass-list=<-loopback>;127.0.0.1;localhost",
            ],
            close_fds=True,
        )
        print(f"Окно: {exe.name}", flush=True)
        return
    webbrowser.open(URL)
    print("Браузер по умолчанию (отдельного Chrome/Edge не нашла).", flush=True)


def main() -> int:
    _bypass_proxy()
    os.chdir(str(USER if frozen() else Path(__file__).resolve().parent))
    start_memo()
    try:
        ensure_build()
    except FileNotFoundError as e:
        _alert("KanjiDesk", str(e))
        return 1
    except subprocess.CalledProcessError:
        _alert("KanjiDesk", "Сборка не удалась. Нужен Node.js, затем: npm install && npm run build")
        return 1
    if not (DIST / "index.html").exists():
        _alert("KanjiDesk", "Нет папки dist. Собери: npm install && npm run build")
        return 1

    if port_in_use(PORT):
        other = occupant_channel(PORT)
        if other and other != CHANNEL:
            label = "GitHub exe" if other == "exe" else "отладка (start.bat)"
            _alert(
                WINDOW_TITLE,
                f"Уже запущена другая копия: {label}.\nЗакрой её и открой нужную ещё раз.",
            )
            return 1
        if health_ok():
            print("Сервер уже работает. Открываю окно…", flush=True)
            if frozen() and open_webview():
                return 0
            open_window()
            time.sleep(1.2)
            return 0
        print(f"Порт :{PORT} занят, страница не открывается — перезапускаю сервер.", flush=True)
        stop_stale_servers(PORT)

    try:
        server = Server(("127.0.0.1", PORT), Handler)
    except OSError as e:
        _alert("KanjiDesk", f"Не удалось занять порт {PORT}: {e}")
        return 1
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    ready_ui = False
    for _ in range(20):
        if health_ok():
            ready_ui = True
            break
        time.sleep(0.25)
    if not ready_ui:
        if port_in_use(PORT):
            print("Проверка HTTP не прошла, порт жив — открываю окно.", flush=True)
        else:
            _alert(WINDOW_TITLE, f"Интерфейс не ответил на :{PORT}")
            server.shutdown()
            return 1
    print(f"KanjiDesk: {URL}", flush=True)
    try:
        if frozen():
            if not open_webview():
                open_window()
                print("Окно браузера открыто. Процесс можно свернуть.", flush=True)
                while True:
                    time.sleep(1)
        else:
            open_window()
            print("Это чёрное окно не закрывай, пока пользуешься приложением.", flush=True)
            while True:
                time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        server.shutdown()
    return 0


if __name__ == "__main__":
    sys.exit(main())
