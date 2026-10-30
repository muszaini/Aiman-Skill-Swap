import json
import os
import shutil
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional

BACKEND_DIR = Path(__file__).resolve().parent
BASE_DIR = BACKEND_DIR.parent
_SOURCE_DB_PATH = (
    BASE_DIR / "skillswap.db"
    if (BASE_DIR / "skillswap.db").is_file()
    else BACKEND_DIR / "skillswap.db"
)
DATABASE_URL = os.getenv("DATABASE_URL", "")
_ACTIVE_SQLITE_PATH: Optional[str] = None


def _resolve_writable_sqlite_path() -> str:
    global _ACTIVE_SQLITE_PATH
    if _ACTIVE_SQLITE_PATH and os.path.isfile(_ACTIVE_SQLITE_PATH):
        return _ACTIVE_SQLITE_PATH

    src = str(_SOURCE_DB_PATH)
    parent_dir = os.path.dirname(src) or "."
    if os.path.isfile(src) and os.access(src, os.W_OK) and os.access(parent_dir, os.W_OK):
        _ACTIVE_SQLITE_PATH = src
        return _ACTIVE_SQLITE_PATH

    tmp_path = "/tmp/skillswap.db"
    if os.path.isfile(src) and not os.path.isfile(tmp_path):
        try:
            shutil.copy2(src, tmp_path)
        except Exception:
            pass
    _ACTIVE_SQLITE_PATH = tmp_path if os.path.isfile(tmp_path) else src
    return _ACTIVE_SQLITE_PATH


def get_db_connection():
    """
    Returns a database connection.
    Uses Supabase PostgreSQL when DATABASE_URL is set and application tables exist,
    otherwise uses the persistent local SQLite database (skillswap.db).
    """
    if DATABASE_URL.startswith("postgres://") or DATABASE_URL.startswith("postgresql://"):
        try:
            import psycopg2
            from psycopg2.extras import RealDictCursor

            conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
            cur = conn.cursor()
            cur.execute(
                "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') AS has_users"
            )
            row = cur.fetchone()
            if row and dict(row).get("has_users"):
                return conn, "postgres"
            conn.close()
        except Exception:
            pass

    db_path = _resolve_writable_sqlite_path()
    conn = sqlite3.connect(db_path, timeout=30.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 30000;")
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn, "sqlite"


def safe_json_loads(raw: Any, default: Any) -> Any:
    if isinstance(raw, (list, dict)):
        return raw
    if not raw:
        return default
    try:
        return json.loads(raw)
    except Exception:
        return default


def fetch_user_with_skills(user_id: int, include_private_email: bool = False) -> Optional[Dict[str, Any]]:
    conn, dialect = get_db_connection()
    ph = "%s" if dialect == "postgres" else "?"
    try:
        cur = conn.cursor()
        cur.execute(f"SELECT * FROM users WHERE id = {ph}", (user_id,))
        row = cur.fetchone()
        if not row:
            return None
        user = dict(row)
        user.pop("password_hash", None)
        if not include_private_email:
            user.pop("email", None)
        user["display_name"] = user.get("name")
        user["interests"] = safe_json_loads(user.get("interests"), [])
        user["availability"] = safe_json_loads(user.get("availability"), [])
        user["languages"] = safe_json_loads(user.get("languages"), [])

        cur.execute(f"SELECT * FROM user_skills WHERE user_id = {ph} ORDER BY id ASC", (user_id,))
        skills = []
        for s in cur.fetchall():
            sd = dict(s)
            lvl = sd.get("proficiency") or sd.get("level") or "Intermediate"
            sd["skill"] = sd.get("skill_name")
            sd["proficiency"] = lvl
            sd["level"] = lvl
            sd["tags"] = safe_json_loads(sd.get("tags"), [])
            skills.append(sd)

        user["skills"] = skills
        user["offers"] = [s for s in skills if s["type"] == "offer"]
        user["wants"] = [s for s in skills if s["type"] == "want"]
        return user
    finally:
        conn.close()
