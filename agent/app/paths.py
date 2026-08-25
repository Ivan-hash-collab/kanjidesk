from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP_DIR = ROOT / "app"
CONFIG_DIR = ROOT / "config"
DATA_DIR = ROOT / "data"
SEED_DIR = DATA_DIR / "seed"
USER_DIR = DATA_DIR / "user"
UI_DIR = APP_DIR / "ui"
UI_DIST = UI_DIR / "dist"

KLC_TSV = ROOT / "The Kodansha Kanji Learners Course.txt"
KLC_SEED = SEED_DIR / "klc.tsv"
KKLC_DB = ROOT / "kanji db" / "japanese_kanji.db"
LLM_CONFIG = CONFIG_DIR / "llm_fallback.yaml"
PROMPTS_YAML = SEED_DIR / "prompts.yaml"
SKILLS_DIR = APP_DIR / "agent" / "skills"
GEMINI_KEY_FILE = ROOT / "gemini_api_key.env"
DB_PATH = USER_DIR / "kanjymemo.db"


def ensure_dirs() -> None:
    USER_DIR.mkdir(parents=True, exist_ok=True)
    SEED_DIR.mkdir(parents=True, exist_ok=True)
