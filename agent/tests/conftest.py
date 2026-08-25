from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest

from app import db


@pytest.fixture
def db_path(tmp_path: Path) -> Iterator[Path]:
    with db.use_database(tmp_path / "kanjymemo-test.db") as path:
        yield path


@pytest.fixture
def initialized_db(db_path: Path):
    return db.init_db()
