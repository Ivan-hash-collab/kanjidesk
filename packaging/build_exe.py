"""Build a single-file KanjiDesk.exe for Windows friends."""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "dist-portable"
SPEC = ROOT / "packaging" / "kanjidesk.spec"


def main() -> None:
    if not (ROOT / "dist" / "index.html").is_file():
        raise SystemExit("Сначала собери интерфейс: npm run build")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    subprocess.check_call(
        [
            sys.executable,
            "-m",
            "PyInstaller",
            "--noconfirm",
            "--clean",
            f"--distpath={OUT_DIR}",
            f"--workpath={ROOT / 'build' / 'pyinstaller'}",
            str(SPEC),
        ],
        cwd=ROOT,
    )
    exe = OUT_DIR / "KanjiDesk.exe"
    if not exe.is_file():
        raise SystemExit("PyInstaller не создал KanjiDesk.exe")
    print(exe)
    print(f"size_mb={exe.stat().st_size / 1e6:.1f}")


if __name__ == "__main__":
    shutil.rmtree(ROOT / "build" / "pyinstaller", ignore_errors=True)
    main()
