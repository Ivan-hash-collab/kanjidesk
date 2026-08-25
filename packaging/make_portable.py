"""Copy a friend-ready KanjiDesk folder (UI + agent, no secrets)."""
from __future__ import annotations

import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "dist-portable" / "KanjiDesk"
ZIP_PATH = ROOT / "dist-portable" / "KanjiDesk-windows.zip"

SKIP_DIR_NAMES = {
    "node_modules",
    ".venv",
    "venv",
    "__pycache__",
    ".pytest_cache",
    "chrome-profile",
    "logs",
    "dist-portable",
    "release",
    ".git",
    "ui",
    "user",
}

SKIP_FILE_NAMES = {
    "gemini_api_key.env",
    "session.json",
    ".env",
}


def should_skip(path: Path) -> bool:
    parts = set(path.parts)
    if parts & SKIP_DIR_NAMES:
        return True
    if path.name in SKIP_FILE_NAMES:
        return True
    if path.suffix == ".pyc":
        return True
    return False


def copy_tree(src: Path, dst: Path) -> None:
    dst.mkdir(parents=True, exist_ok=True)
    for item in src.iterdir():
        if should_skip(item):
            continue
        target = dst / item.name
        if item.is_dir():
            copy_tree(item, target)
        else:
            shutil.copy2(item, target)


def main() -> None:
    dist = ROOT / "dist" / "index.html"
    if not dist.is_file():
        raise SystemExit("Сначала собери интерфейс: npm run build")
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    for name in (
        "launch.py",
        "start.bat",
        "install-shortcut.ps1",
        "package.json",
        "package-lock.json",
        "README.md",
    ):
        src = ROOT / name
        if src.is_file():
            shutil.copy2(src, OUT / name)

    copy_tree(ROOT / "dist", OUT / "dist")
    copy_tree(ROOT / "public", OUT / "public")
    copy_tree(ROOT / "branding", OUT / "branding")
    if (ROOT / "agent").is_dir():
        copy_tree(ROOT / "agent", OUT / "agent")
        example = ROOT / "agent" / "gemini_api_key.env.example"
        if example.is_file():
            shutil.copy2(example, OUT / "agent" / "gemini_api_key.env.example")

    ZIP_PATH.parent.mkdir(parents=True, exist_ok=True)
    if ZIP_PATH.exists():
        ZIP_PATH.unlink()
    with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED) as zf:
        for file in OUT.rglob("*"):
            if file.is_file():
                zf.write(file, file.relative_to(OUT.parent))
    print(ZIP_PATH)


if __name__ == "__main__":
    main()
