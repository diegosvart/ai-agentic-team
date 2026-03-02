# Agentic TI OS – Database access
# SQLite connection and session for RunState persistence

import os
import sqlite3
from pathlib import Path
from typing import Optional

# Default DB path: data/agentic.db (create dir if missing)
DEFAULT_DB_DIR = Path("data")
DEFAULT_DB_PATH = DEFAULT_DB_DIR / "agentic.db"


def _db_path() -> Path:
    path = os.environ.get("AGENTIC_DB_PATH")
    if path:
        return Path(path)
    DEFAULT_DB_DIR.mkdir(parents=True, exist_ok=True)
    return DEFAULT_DB_PATH


def get_session():
    """Return a DB connection (sqlite3) for RunState persistence. Caller must close or use as context manager."""
    path = _db_path()
    conn = sqlite3.connect(str(path))
    conn.execute(
        """CREATE TABLE IF NOT EXISTS run_state (
            run_id TEXT PRIMARY KEY,
            current_node TEXT,
            payload TEXT,
            gate_a_approved INTEGER,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )"""
    )
    conn.commit()
    return conn
