# -*- mode: python ; coding: utf-8 -*-
from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs, copy_metadata

SPECDIR = Path(SPECPATH)
ROOT = SPECDIR.parent

SKIP_DIR = {"tests", "__pycache__", ".venv", "venv", "user", ".pytest_cache", "ui"}
SKIP_FILE = {"gemini_api_key.env"}
SKIP_SUFFIX = {".pyc", ".pyo", ".db"}


def agent_datas() -> list[tuple[str, str]]:
    agent = ROOT / "agent"
    out: list[tuple[str, str]] = []
    if not agent.is_dir():
        return out
    for path in agent.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(agent)
        if any(part in SKIP_DIR for part in rel.parts):
            continue
        if path.name in SKIP_FILE or path.suffix in SKIP_SUFFIX:
            continue
        if "Kodansha" in path.name:
            continue
        dest = str(Path("agent") / rel.parent)
        out.append((str(path), dest))
    return out


datas = [
    (str(ROOT / "dist"), "dist"),
    (str(ROOT / "branding" / "kanjidesk.ico"), "branding"),
    *agent_datas(),
]
binaries = []
hidden = [
    "uvicorn",
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "uvicorn.lifespan.off",
    "fastapi",
    "starlette",
    "pydantic",
    "yaml",
    "google.genai",
    "fsrs",
    "webview",
    "webview.platforms.winforms",
    "webview.platforms.edgechromium",
    "app",
    "app.api.main",
    "app.db",
    "app.paths",
    "multipart",
    "python_multipart",
    "anyio",
    "sniffio",
    "h11",
    "click",
]

for pkg in ("sudachipy", "sudachidict_core", "google.genai", "webview"):
    try:
        datas += collect_data_files(pkg)
    except Exception:
        pass
    try:
        binaries += collect_dynamic_libs(pkg)
    except Exception:
        pass
    try:
        datas += copy_metadata(pkg)
    except Exception:
        pass

a = Analysis(
    [str(ROOT / "launch.py")],
    pathex=[str(ROOT / "agent")],
    binaries=binaries,
    datas=datas,
    hiddenimports=hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["pytest", "tkinter", "unittest"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="KanjiDesk",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    icon=str(ROOT / "branding" / "kanjidesk.ico"),
)
