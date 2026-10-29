import json
import os
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional

BASE_DIR = Path(__file__).resolve().parent.parent
SQLITE_DB_PATH = BASE_DIR / "skillswap.db"
DATABASE_URL = os.getenv("DATABASE_URL", "")


def get_db_connection():
    """
    Returns a database connection.
    Uses Supabase PostgreSQL when DATABASE_URL is set to a postgresql:// URI,
    otherwise uses the persistent local SQLite database (skillswap.db).
    """
    if DATABASE_URL.startswith("postgres://") or DATABASE_URL.startswith("postgresql://"):
        import psycopg2
        from psycopg2.extras import RealDictCursor

        conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
        return conn, "postgres"

    conn = sqlite3.connect(str(SQLITE_DB_PATH))
    conn.row_factory = sqlite3.Row
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
            sd["tags"] = safe_json_loads(sd.get("tags"), [])
            skills.append(sd)

        user["skills"] = skills
        user["offers"] = [s for s in skills if s["type"] == "offer"]
        user["wants"] = [s for s in skills if s["type"] == "want"]
        return user
    finally:
        conn.close()
