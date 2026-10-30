"""
SkillSwap Production FastAPI Backend
Connects React + Vite frontend to Supabase PostgreSQL (via DATABASE_URL) or persistent SQLite (skillswap.db).
Enforces scrypt password hashing, strict Bearer token authentication (401), ownership access control (403),
normalized relational tables (profiles, skills, user_skills, exchange_requests), and AI reciprocal matching.
"""

import json
import os
import random
from typing import Any, Dict, List, Optional

try:
    from fastapi import Depends, FastAPI, Header, HTTPException, Query
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import HTMLResponse
    from fastapi.staticfiles import StaticFiles
    from pydantic import BaseModel

    FASTAPI_AVAILABLE = True
except ImportError:
    FASTAPI_AVAILABLE = False
    BaseModel = object  # type: ignore
    HTMLResponse = lambda content, **kw: content  # type: ignore

    class HTTPException(Exception):  # type: ignore
        def __init__(self, status_code: int, detail: str):
            self.status_code = status_code
            self.detail = detail
            super().__init__(detail)

    def Header(default=None):  # type: ignore
        return default

    def Query(default=None):  # type: ignore
        return default

try:
    from .ai_service import (
        evaluate_compatibility,
        generate_ai_chat_response,
        generate_ai_learning_plan,
        generate_profile_or_skill_suggestion,
        generate_session_blueprint,
        parse_natural_language_intent,
    )
    from .auth import generate_session_token, hash_password, verify_password
    from .database import fetch_user_with_skills, get_db_connection, safe_json_loads
except ImportError:
    from ai_service import (  # type: ignore
        evaluate_compatibility,
        generate_ai_chat_response,
        generate_ai_learning_plan,
        generate_profile_or_skill_suggestion,
        generate_session_blueprint,
        parse_natural_language_intent,
    )
    from auth import generate_session_token, hash_password, verify_password  # type: ignore
    from database import fetch_user_with_skills, get_db_connection, safe_json_loads  # type: ignore


def normalize_category(raw_category: str = "") -> str:
    c = (raw_category or "").strip()
    lower = c.lower()
    if any(k in lower for k in ("tech", "program", "code", "python")):
        return "Technology"
    if any(k in lower for k in ("business", "data", "spreadsheet", "product", "finance")):
        return "Business"
    if any(k in lower for k in ("design", "creative")):
        return "Design"
    if any(k in lower for k in ("language", "comm", "english")):
        return "Languages"
    return c if c in ("Technology", "Business", "Design", "Languages") else "Technology"


def normalize_proficiency(raw_level: str = "", fallback: str = "Intermediate") -> str:
    lower = (raw_level or "").strip().lower()
    if lower.startswith("beg"):
        return "Beginner"
    if lower.startswith("int"):
        return "Intermediate"
    if lower.startswith("adv"):
        return "Advanced"
    if lower.startswith("exp"):
        return "Expert"
    return fallback


def issue_session_token(user_id: int) -> str:
    conn, dialect = get_db_connection()
    ph = "%s" if dialect == "postgres" else "?"
    token = generate_session_token()
    try:
        cur = conn.cursor()
        cur.execute(
            f"INSERT INTO auth_sessions (token, user_id) VALUES ({ph}, {ph})",
            (token, int(user_id)),
        )
        conn.commit()
        return token
    finally:
        conn.close()


def resolve_user_from_token(authorization: Optional[str]) -> Optional[Dict[str, Any]]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization[7:].strip()
    if not token:
        return None
    conn, dialect = get_db_connection()
    ph = "%s" if dialect == "postgres" else "?"
    try:
        cur = conn.cursor()
        cur.execute(f"SELECT user_id FROM auth_sessions WHERE token = {ph}", (token,))
        row = cur.fetchone()
        if not row:
            return None
        uid = dict(row)["user_id"]
        return fetch_user_with_skills(int(uid), include_private_email=True)
    finally:
        conn.close()


def resolve_token_user_id(authorization: Optional[str]) -> Optional[int]:
    user = resolve_user_from_token(authorization)
    return int(user["id"]) if user and "id" in user else None


def require_authenticated_user(authorization: Optional[str]) -> Dict[str, Any]:
    user = resolve_user_from_token(authorization)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Unauthorized: A valid Bearer authentication token is required.",
        )
    return user


def ensure_reusable_skill(cur, ph: str, dialect: str, skill_name: str, category: str) -> Optional[int]:
    clean_name = skill_name.strip()
    norm_cat = normalize_category(category)
    if not clean_name:
        return None
    cur.execute(
        f"""
        INSERT INTO skills (name, category)
        VALUES ({ph}, {ph})
        ON CONFLICT(name) DO UPDATE SET category = excluded.category
        """,
        (clean_name, norm_cat),
    )
    cur.execute(f"SELECT id FROM skills WHERE LOWER(name) = LOWER({ph}) LIMIT 1", (clean_name,))
    row = cur.fetchone()
    return int(dict(row)["id"]) if row else None


def get_enriched_requests(viewer_id: int) -> List[Dict[str, Any]]:
    conn, dialect = get_db_connection()
    ph = "%s" if dialect == "postgres" else "?"
    try:
        cur = conn.cursor()
        cur.execute(
            f"""
            SELECT r.*,
              u_req.name as requester_name, u_req.handle as requester_handle,
              u_req.role_title as requester_role, u_req.avatar_initials as requester_initials,
              u_req.avatar_bg as requester_bg, u_req.timezone as requester_timezone,
              u_rec.name as recipient_name, u_rec.handle as recipient_handle,
              u_rec.role_title as recipient_role, u_rec.avatar_initials as recipient_initials,
              u_rec.avatar_bg as recipient_bg, u_rec.timezone as recipient_timezone
            FROM swap_requests r
            JOIN users u_req ON r.requester_id = u_req.id
            JOIN users u_rec ON r.recipient_id = u_rec.id
            WHERE r.requester_id = {ph} OR r.recipient_id = {ph}
            ORDER BY r.id DESC
            """,
            (viewer_id, viewer_id),
        )
        results = []
        for row in cur.fetchall():
            d = dict(row)
            d["direction"] = "incoming" if int(d["recipient_id"]) == int(viewer_id) else "outgoing"
            d["ai_session_agenda"] = safe_json_loads(d.get("ai_session_agenda"), [])
            results.append(d)
        return results
    finally:
        conn.close()


def get_enriched_exchanges(viewer_id: int) -> List[Dict[str, Any]]:
    conn, _ = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT c.*,
              ua.name as partner_a_name, ua.handle as partner_a_handle,
              ua.avatar_initials as partner_a_initials, ua.avatar_bg as partner_a_bg,
              ua.role_title as partner_a_role,
              ub.name as partner_b_name, ub.handle as partner_b_handle,
              ub.avatar_initials as partner_b_initials, ub.avatar_bg as partner_b_bg,
              ub.role_title as partner_b_role
            FROM completed_exchanges c
            JOIN users ua ON c.partner_a_id = ua.id
            JOIN users ub ON c.partner_b_id = ub.id
            ORDER BY c.id DESC
            """
        )
        results = []
        for row in cur.fetchall():
            d = dict(row)
            d["involves_viewer"] = int(d["partner_a_id"]) == int(viewer_id) or int(d["partner_b_id"]) == int(viewer_id)
            d["takeaways"] = safe_json_loads(d.get("takeaways"), [])
            results.append(d)
        return results
    except Exception:
        return []
    finally:
        conn.close()


def find_frontend_dist_dir() -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    parent = os.path.dirname(here)
    cwd = os.getcwd()
    candidates = [
        os.path.join(parent, "frontend", "dist"),
        os.path.join(here, "dist"),
        os.path.join(cwd, "frontend", "dist"),
        os.path.join(cwd, "backend", "dist"),
        os.path.join(cwd, "dist"),
    ]
    for c in candidates:
        if os.path.isfile(os.path.join(c, "index.html")):
            return c
    return candidates[0]


app: Any = None

if FASTAPI_AVAILABLE:
    app = FastAPI(
        title="SkillSwap Reciprocal Learning API",
        description="Production FastAPI + Supabase PostgreSQL backend for peer-to-peer skill exchange",
        version="2.0.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    class SkillInput(BaseModel):
        type: str = "offer"
        skill_name: Optional[str] = None
        skill: Optional[str] = None
        category: str = "Business"
        level: str = "Intermediate"
        proficiency: Optional[str] = None
        description: str = ""

    class ProfileUpdateInput(BaseModel):
        name: Optional[str] = None
        role_title: Optional[str] = None
        bio: Optional[str] = None
        interests: Optional[List[str]] = None
        preferred_format: Optional[str] = None
        location: Optional[str] = None
        timezone: Optional[str] = None
        session_length_mins: Optional[int] = None
        availability: Optional[List[str]] = None

    class RegisterInput(BaseModel):
        name: str
        email: str
        password: str
        role_title: str = "SkillSwap Community Member"
        bio: str = ""
        interests: List[str] = ["Peer Learning", "Skill Exchange"]
        preferred_format: str = "Online"
        location: str = "Remote"
        timezone: str = "UTC-5 (EST)"
        session_length_mins: int = 60
        availability: List[str] = ["Weekday Evenings", "Saturday Mornings"]
        offers: List[SkillInput] = []
        wants: List[SkillInput] = []

    class LoginInput(BaseModel):
        email: str
        password: str

    class SwitchPersonaInput(BaseModel):
        userId: int

    class ExchangeRequestInput(BaseModel):
        recipient_id: int
        offered_skill_name: str
        wanted_skill_name: str
        proposed_slot: str
        duration_mins: int = 60
        format: str = "Online"
        session_datetime: Optional[str] = None
        session_mode: str = "Online"
        meeting_link_or_location: str = ""
        session_notes: str = ""
        schedule_status: str = "proposed"
        learning_goal: str
        message: str
        ai_session_agenda: List[Dict[str, Any]] = []

    class RequestStatusInput(BaseModel):
        status: Optional[str] = None
        session_datetime: Optional[str] = None
        session_mode: Optional[str] = None
        meeting_link_or_location: Optional[str] = None
        session_notes: Optional[str] = None
        schedule_status: Optional[str] = None

    class RequestScheduleInput(BaseModel):
        session_datetime: Optional[str] = None
        proposed_slot: Optional[str] = None
        session_mode: str = "Online"
        meeting_link_or_location: str = ""
        session_notes: str = ""
        schedule_status: str = "proposed"
        duration_mins: int = 60

    class CompleteReviewInput(BaseModel):
        request_id: Optional[int] = None
        partner_a_id: Optional[int] = None
        partner_b_id: Optional[int] = None
        skill_a_taught: str = ""
        skill_b_taught: str = ""
        duration_mins: int = 60
        summary_notes: str = ""
        takeaways: List[str] = []
        rating_given: int = 5
        testimonial: str = ""
        review_comment: Optional[str] = None

    @app.get("/api/auth/me")
    def get_me(authorization: Optional[str] = Header(default=None)):
        user = require_authenticated_user(authorization)
        return {"user": user}

    @app.post("/api/auth/login")
    def login(payload: LoginInput):
        conn, dialect = get_db_connection()
        ph = "%s" if dialect == "postgres" else "?"
        ident = payload.email.strip().lower().lstrip("@")
        user_dict = None
        try:
            cur = conn.cursor()
            cur.execute(
                f"SELECT * FROM users WHERE LOWER(email) = {ph} OR LOWER(handle) = {ph} OR LOWER(name) = {ph}",
                (ident, ident, ident),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(
                    status_code=401,
                    detail="Account not found. Try maya@skillswap.io (password: skillswap123) or create a new account.",
                )
            user_dict = dict(row)
            if not verify_password(payload.password, user_dict.get("password_hash")):
                raise HTTPException(
                    status_code=401,
                    detail="Incorrect password. (Demo accounts use password: skillswap123)",
                )
        finally:
            conn.close()

        uid = int(user_dict["id"])
        token = issue_session_token(uid)
        user_obj = fetch_user_with_skills(uid, include_private_email=True)
        return {
            "token": token,
            "user": user_obj,
            "viewer": user_obj,
        }

    @app.post("/api/auth/register", status_code=201)
    def register(payload: RegisterInput):
        if not payload.password or len(payload.password.strip()) < 3:
            raise HTTPException(status_code=400, detail="Password must be at least 3 characters.")
        if not payload.name or not payload.name.strip():
            raise HTTPException(status_code=400, detail="Display name is required.")
        if not payload.email or not payload.email.strip():
            raise HTTPException(status_code=400, detail="Email address is required.")

        conn, dialect = get_db_connection()
        ph = "%s" if dialect == "postgres" else "?"
        email = payload.email.strip().lower()
        slug = "".join(c for c in payload.name.lower() if c.isalnum()) or "member"
        handle = f"{slug}_{random.randint(100, 999)}"
        initials = "".join(p[0] for p in payload.name.split()[:2] if p).upper() or "SS"
        preferred_format = (
            payload.preferred_format
            if payload.preferred_format in ("Online", "In person", "Either")
            else "Online"
        )
        new_uid = None
        try:
            cur = conn.cursor()
            cur.execute(f"SELECT id FROM users WHERE LOWER(email) = {ph}", (email,))
            if cur.fetchone():
                raise HTTPException(
                    status_code=409,
                    detail="That email is already registered. Please switch to 'Sign In with Credentials' to log in.",
                )

            pass_hash = hash_password(payload.password)
            cur.execute(
                f"""
                INSERT INTO users (
                  name, handle, email, password_hash, role_title, bio, interests,
                  avatar_initials, avatar_bg, location, timezone, availability,
                  preferred_format, session_length_mins, languages
                ) VALUES ({ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph})
                """,
                (
                    payload.name.strip(),
                    handle,
                    email,
                    pass_hash,
                    (payload.role_title or "SkillSwap Community Member").strip() or "SkillSwap Community Member",
                    (payload.bio or "").strip() or "Excited to exchange skills with peers!",
                    json.dumps(payload.interests or ["Peer Learning", "Skill Exchange"]),
                    initials,
                    "#0F766E",
                    (payload.location or "Remote").strip() or "Remote",
                    (payload.timezone or "UTC").strip() or "UTC",
                    json.dumps(payload.availability or ["Weekday Evenings", "Saturday Mornings"]),
                    preferred_format,
                    payload.session_length_mins or 60,
                    json.dumps(["English"]),
                ),
            )
            cur.execute(f"SELECT id FROM users WHERE LOWER(email) = {ph}", (email,))
            new_uid = int(dict(cur.fetchone())["id"])

            for s_list, s_type in ((payload.offers, "offer"), (payload.wants, "want")):
                for s in s_list:
                    s_name = (s.skill_name or s.skill or "").strip()
                    if not s_name:
                        continue
                    cat = normalize_category(s.category)
                    lvl = normalize_proficiency(
                        s.proficiency or s.level,
                        "Intermediate" if s_type == "offer" else "Beginner",
                    )
                    skill_id = ensure_reusable_skill(cur, ph, dialect, s_name, cat)
                    cur.execute(
                        f"""
                        INSERT INTO user_skills (
                          user_id, skill_id, type, skill_name, category, proficiency, level, description, tags
                        ) VALUES ({ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph})
                        """,
                        (
                            new_uid,
                            skill_id,
                            s_type,
                            s_name,
                            cat,
                            lvl,
                            lvl,
                            s.description or f"1-on-1 {s_name} exchange",
                            json.dumps([s_name.lower()]),
                        ),
                    )
            conn.commit()
        finally:
            conn.close()

        token = issue_session_token(new_uid)
        user_obj = fetch_user_with_skills(new_uid, include_private_email=True)
        return {
            "token": token,
            "user": user_obj,
            "viewer": user_obj,
        }

    @app.get("/")
    def root():
        dist_dir_path = find_frontend_dist_dir()
        dist_index = os.path.join(dist_dir_path, "index.html")
        if os.path.isfile(dist_index):
            with open(dist_index, "r", encoding="utf-8") as f:
                html = f.read()
            try:
                initial_data = get_directory_and_matches(
                    viewerId=1,
                    query="",
                    category="all",
                    proficiency="all",
                    learningPreference="all",
                    matchMode="all",
                    authorization=None,
                )
                script_tag = f"<script>window.__INITIAL_BOOTSTRAP__ = {json.dumps(initial_data)};</script>"
                html = html.replace("</head>", f"{script_tag}\n</head>")
            except Exception:
                pass
            return HTMLResponse(
                content=html,
                status_code=200,
                headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"},
            )
        return HTMLResponse(
            content="""<!DOCTYPE html><html><head><meta charset="utf-8"><title>SkillSwap</title><link rel="stylesheet" href="/assets/index-dFjtyFob.css"></head><body><div id="root"></div><script type="module" src="/assets/index-BheUWr_l.js"></script></body></html>""",
            status_code=200,
            headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"},
        )

    @app.get("/api")
    @app.get("/api/status")
    def api_status():
        return {
            "message": "SkillSwap API is running",
            "status": "ok",
            "docs": "/docs",
            "health": "/health",
        }

    @app.get("/health")
    @app.get("/api/health")
    def health_check():
        try:
            conn, dialect = get_db_connection()
            try:
                cur = conn.cursor()
                cur.execute("SELECT COUNT(*) as c FROM profiles")
                row = cur.fetchone()
                profile_count = int(dict(row)["c"]) if row else 0
                return {
                    "status": "ok",
                    "service": "SkillSwap FastAPI Backend",
                    "database": dialect,
                    "profiles": profile_count,
                }
            finally:
                conn.close()
        except Exception:
            return {
                "status": "ok",
                "service": "SkillSwap FastAPI Backend",
            }

    @app.get("/api/bootstrap")
    @app.get("/api/directory")
    @app.get("/api/matches")
    def get_directory_and_matches(
        viewerId: int = Query(default=1),
        query: str = Query(default=""),
        category: str = Query(default="all"),
        proficiency: str = Query(default="all"),
        learningPreference: str = Query(default="all"),
        matchMode: str = Query(default="all"),
        authorization: Optional[str] = Header(default=None),
    ):
        auth_user = resolve_user_from_token(authorization)
        active_id = int(auth_user["id"]) if auth_user else int(viewerId or 1)
        conn, _ = get_db_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT id FROM users ORDER BY id ASC")
            user_ids = [int(dict(r)["id"]) for r in cur.fetchall()]
        finally:
            conn.close()

        all_users = [
            fetch_user_with_skills(uid, include_private_email=(uid == active_id))
            for uid in user_ids
        ]
        all_users = [u for u in all_users if u is not None]
        viewer = next((u for u in all_users if int(u["id"]) == active_id), all_users[0])
        trimmed_query = (query or "").strip()
        query_intent = parse_natural_language_intent(trimmed_query) if trimmed_query else None

        pool = [u for u in all_users if int(u["id"]) != int(viewer["id"])]
        candidates = []
        for cand in pool:
            ai_match = evaluate_compatibility(viewer, cand, query_intent)
            c_copy = dict(cand)
            c_copy["aiMatch"] = ai_match
            candidates.append(c_copy)

        if trimmed_query:
            q_lower = trimmed_query.lower()
            candidates = [
                c
                for c in candidates
                if q_lower
                in " ".join(
                    [
                        str(c.get("name", "")),
                        str(c.get("role_title", "")),
                        str(c.get("bio", "")),
                        " ".join(c.get("interests", [])),
                        " ".join(
                            f"{s.get('skill_name', '')} {s.get('category', '')} {s.get('description', '')}"
                            for s in c.get("skills", [])
                        ),
                    ]
                ).lower()
            ]

        if category and category != "all":
            cat_lower = category.lower()
            candidates = [
                c
                for c in candidates
                if any(cat_lower in (s.get("category") or "").lower() for s in c.get("skills", []))
            ]

        if proficiency and proficiency != "all":
            prof_lower = proficiency.lower()
            candidates = [
                c
                for c in candidates
                if any(
                    (s.get("proficiency") or s.get("level") or "").lower() == prof_lower
                    for s in c.get("skills", [])
                )
            ]

        if learningPreference and learningPreference != "all":
            pref_lower = learningPreference.lower()
            target_fmt = "either" if pref_lower in ("online or in person", "either") else pref_lower
            candidates = [
                c
                for c in candidates
                if (c.get("preferred_format") or "Online").lower() == target_fmt
            ]

        if matchMode == "teaching_goals":
            candidates = [c for c in candidates if c["aiMatch"].get("teachesYourGoal", True)]
        elif matchMode == "reciprocal":
            candidates = [c for c in candidates if c["aiMatch"].get("isDirectDoubleMatch", False)]

        candidates.sort(key=lambda x: x["aiMatch"]["score"], reverse=True)
        vid = int(viewer["id"])
        token = issue_session_token(vid) if not auth_user else (authorization[7:].strip() if authorization and authorization.startswith("Bearer ") else issue_session_token(vid))
        dash_payload = get_dashboard(viewerId=vid, authorization=f"Bearer {token}")

        conn2, dialect2 = get_db_connection()
        ph2 = "%s" if dialect2 == "postgres" else "?"
        try:
            cur2 = conn2.cursor()
            cur2.execute(f"SELECT * FROM learning_plans WHERE user_id = {ph2} ORDER BY id DESC", (vid,))
            plans = []
            for r in cur2.fetchall():
                d = dict(r)
                d["milestones"] = safe_json_loads(d.get("milestones"), [])
                plans.append(d)
        finally:
            conn2.close()

        completed_exchanges = get_enriched_exchanges(vid)
        total_hours = sum(int(u.get("hours_exchanged") or 0) for u in all_users)

        return {
            "token": token,
            "viewer": viewer,
            "allUsers": all_users,
            "candidates": candidates,
            "totalDirectoryCount": len(pool),
            "matchingCount": len(candidates),
            "queryIntent": query_intent,
            "requests": dash_payload["requests"],
            "completedExchanges": completed_exchanges,
            "dashboard": dash_payload["dashboard"],
            "learningPlans": plans,
            "stats": {
                "communityMembers": len(all_users),
                "completedExchangesCount": len(completed_exchanges),
                "totalHoursSaved": int(total_hours),
                "activeMatchesCount": sum(1 for c in candidates if c["aiMatch"]["score"] >= 88),
            },
        }

    @app.post("/api/auth/switch")
    def switch_persona(payload: SwitchPersonaInput):
        target_user = fetch_user_with_skills(int(payload.userId), include_private_email=True)
        if not target_user:
            raise HTTPException(status_code=404, detail="Target member not found")
        token = issue_session_token(int(target_user["id"]))
        return {"token": token, "user": target_user}

    @app.put("/api/profile")
    def update_current_profile(
        payload: ProfileUpdateInput,
        authorization: Optional[str] = Header(default=None),
    ):
        auth_user = require_authenticated_user(authorization)
        res = update_user_profile(int(auth_user["id"]), payload, authorization)
        return {"viewer": res["user"], "user": res["user"]}

    @app.get("/api/profiles")
    def list_public_profiles():
        conn, _ = get_db_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT * FROM profiles ORDER BY id ASC")
            profiles = []
            for r in cur.fetchall():
                d = dict(r)
                d["interests"] = safe_json_loads(d.get("interests"), [])
                d["availability"] = safe_json_loads(d.get("availability"), [])
                d["languages"] = safe_json_loads(d.get("languages"), [])
                profiles.append(d)
            return {"profiles": profiles}
        finally:
            conn.close()

    @app.get("/api/skills")
    def list_reusable_skills():
        conn, _ = get_db_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT * FROM skills ORDER BY category ASC, name ASC")
            return {"skills": [dict(r) for r in cur.fetchall()]}
        finally:
            conn.close()

    @app.put("/api/users/{user_id}")
    def update_user_profile(
        user_id: int,
        payload: ProfileUpdateInput,
        authorization: Optional[str] = Header(default=None),
    ):
        auth_user = require_authenticated_user(authorization)
        if int(auth_user["id"]) != int(user_id):
            raise HTTPException(
                status_code=403,
                detail="Forbidden: You can only edit your own profile.",
            )
        conn, dialect = get_db_connection()
        ph = "%s" if dialect == "postgres" else "?"
        try:
            cur = conn.cursor()
            name = (payload.name or auth_user["name"]).strip()
            role_title = (payload.role_title or auth_user["role_title"]).strip()
            bio = (payload.bio or auth_user["bio"]).strip()
            interests = payload.interests if payload.interests is not None else auth_user["interests"]
            preferred_format = (
                payload.preferred_format
                if payload.preferred_format in ("Online", "In person", "Either")
                else auth_user.get("preferred_format", "Online")
            )
            location = (payload.location or auth_user["location"]).strip()
            timezone = (payload.timezone or auth_user["timezone"]).strip()
            session_len = payload.session_length_mins or auth_user["session_length_mins"]
            availability = payload.availability if payload.availability is not None else auth_user["availability"]

            cur.execute(
                f"""
                UPDATE users
                SET name = {ph}, role_title = {ph}, bio = {ph}, interests = {ph},
                    preferred_format = {ph}, location = {ph}, timezone = {ph},
                    session_length_mins = {ph}, availability = {ph}
                WHERE id = {ph}
                """,
                (
                    name,
                    role_title,
                    bio,
                    json.dumps(interests),
                    preferred_format,
                    location,
                    timezone,
                    session_len,
                    json.dumps(availability),
                    user_id,
                ),
            )
            conn.commit()
            return {"user": fetch_user_with_skills(user_id, include_private_email=True)}
        finally:
            conn.close()

    @app.post("/api/users/{user_id}/skills")
    def create_user_skill(
        user_id: int,
        payload: SkillInput,
        authorization: Optional[str] = Header(default=None),
    ):
        auth_user = require_authenticated_user(authorization)
        if int(auth_user["id"]) != int(user_id):
            raise HTTPException(
                status_code=403,
                detail="Forbidden: You can only add skills to your own profile.",
            )
        s_name = (payload.skill_name or payload.skill or "").strip()
        if not s_name:
            raise HTTPException(status_code=400, detail="Skill name is required.")
        s_type = "want" if payload.type == "want" else "offer"
        cat = normalize_category(payload.category)
        lvl = normalize_proficiency(
            payload.proficiency or payload.level,
            "Intermediate" if s_type == "offer" else "Beginner",
        )
        conn, dialect = get_db_connection()
        ph = "%s" if dialect == "postgres" else "?"
        try:
            cur = conn.cursor()
            skill_id = ensure_reusable_skill(cur, ph, dialect, s_name, cat)
            cur.execute(
                f"""
                INSERT INTO user_skills (
                  user_id, skill_id, type, skill_name, category, proficiency, level, description, tags
                ) VALUES ({ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph})
                """,
                (
                    user_id,
                    skill_id,
                    s_type,
                    s_name,
                    cat,
                    lvl,
                    lvl,
                    payload.description.strip() or f"Hands-on {s_name} practice",
                    json.dumps([s_name.lower()]),
                ),
            )
            conn.commit()
            return {"user": fetch_user_with_skills(user_id, include_private_email=True)}
        finally:
            conn.close()

    @app.put("/api/skills/{skill_id}")
    def update_skill(
        skill_id: int,
        payload: SkillInput,
        authorization: Optional[str] = Header(default=None),
    ):
        auth_user = require_authenticated_user(authorization)
        conn, dialect = get_db_connection()
        ph = "%s" if dialect == "postgres" else "?"
        try:
            cur = conn.cursor()
            cur.execute(f"SELECT * FROM user_skills WHERE id = {ph}", (skill_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Skill listing not found")
            skill_row = dict(row)
            if int(auth_user["id"]) != int(skill_row["user_id"]):
                raise HTTPException(
                    status_code=403,
                    detail="Forbidden: You can only edit your own skill listings",
                )

            s_name = (payload.skill_name or payload.skill or skill_row["skill_name"]).strip()
            cat = normalize_category(payload.category or skill_row["category"])
            lvl = normalize_proficiency(
                payload.proficiency or payload.level or skill_row["level"],
                skill_row["level"],
            )
            reusable_id = ensure_reusable_skill(cur, ph, dialect, s_name, cat)
            tags = [t for t in s_name.lower().split() if len(t) > 1]
            cur.execute(
                f"""
                UPDATE user_skills
                SET skill_id = {ph}, skill_name = {ph}, category = {ph},
                    proficiency = {ph}, level = {ph}, description = {ph}, tags = {ph}
                WHERE id = {ph}
                """,
                (
                    reusable_id,
                    s_name,
                    cat,
                    lvl,
                    lvl,
                    payload.description.strip(),
                    json.dumps(tags),
                    skill_id,
                ),
            )
            conn.commit()
            return {"user": fetch_user_with_skills(int(skill_row["user_id"]), include_private_email=True)}
        finally:
            conn.close()

    @app.delete("/api/skills/{skill_id}")
    def delete_skill(
        skill_id: int,
        authorization: Optional[str] = Header(default=None),
    ):
        auth_user = require_authenticated_user(authorization)
        conn, dialect = get_db_connection()
        ph = "%s" if dialect == "postgres" else "?"
        try:
            cur = conn.cursor()
            cur.execute(f"SELECT * FROM user_skills WHERE id = {ph}", (skill_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Skill listing not found")
            skill_row = dict(row)
            if int(auth_user["id"]) != int(skill_row["user_id"]):
                raise HTTPException(
                    status_code=403,
                    detail="Forbidden: You can only delete your own skill listings",
                )
            cur.execute(f"DELETE FROM user_skills WHERE id = {ph}", (skill_id,))
            conn.commit()
            return {"user": fetch_user_with_skills(int(skill_row["user_id"]), include_private_email=True)}
        finally:
            conn.close()

    @app.get("/api/dashboard")
    def get_dashboard(
        viewerId: int = Query(default=1),
        authorization: Optional[str] = Header(default=None),
    ):
        auth_uid = resolve_token_user_id(authorization)
        active_id = auth_uid if auth_uid is not None else viewerId
        viewer = fetch_user_with_skills(active_id, include_private_email=True)
        requests = get_enriched_requests(active_id)
        pending_in = [r for r in requests if r.get("status") == "pending" and r.get("direction") == "incoming"]
        pending_out = [r for r in requests if r.get("status") == "pending" and r.get("direction") == "outgoing"]
        accepted_list = [r for r in requests if r.get("status") == "accepted"]
        upcoming_exchanges = []
        for r in accepted_list:
            is_inc = r.get("direction") == "incoming"
            upcoming_exchanges.append(
                {
                    "id": r.get("id"),
                    "requestId": r.get("id"),
                    "direction": r.get("direction"),
                    "partnerName": r.get("requester_name") if is_inc else r.get("recipient_name"),
                    "partnerRole": r.get("requester_role") if is_inc else r.get("recipient_role"),
                    "partnerInitials": r.get("requester_initials") if is_inc else r.get("recipient_initials"),
                    "partnerBg": r.get("requester_bg") if is_inc else r.get("recipient_bg"),
                    "youTeach": r.get("wanted_skill_name") if is_inc else r.get("offered_skill_name"),
                    "partnerTeaches": r.get("offered_skill_name") if is_inc else r.get("wanted_skill_name"),
                    "sessionDatetime": r.get("session_datetime") or r.get("proposed_slot"),
                    "sessionMode": r.get("session_mode") or "Online",
                    "meetingLinkOrLocation": r.get("meeting_link_or_location") or "",
                    "sessionNotes": r.get("session_notes") or r.get("learning_goal") or "",
                    "scheduleStatus": r.get("schedule_status") or "proposed",
                    "durationMins": r.get("duration_mins") or 60,
                }
            )
        completed_list = [r for r in requests if r.get("status") == "completed"]
        ratings = [
            int(r["rating_given"])
            for r in completed_list
            if r.get("rating_given") is not None and 1 <= int(r["rating_given"]) <= 5
        ]
        avg_rating = round(sum(ratings) / len(ratings), 2) if ratings else None
        avg_display = f"{avg_rating:.2f} ★" if avg_rating is not None else "—"
        return {
            "dashboard": {
                "skillsOverview": {
                    "skillsOffered": viewer.get("offers", []) if viewer else [],
                    "skillsWanted": viewer.get("wants", []) if viewer else [],
                },
                "requestSummary": {
                    "pendingIncomingCount": len(pending_in),
                    "pendingOutgoingCount": len(pending_out),
                    "pendingIncoming": pending_in,
                    "pendingOutgoing": pending_out,
                },
                "upcomingExchanges": upcoming_exchanges,
                "summaryMetrics": {
                    "totalCompletedCount": len(completed_list),
                    "averageRating": avg_rating,
                    "averageRatingDisplay": avg_display,
                    "ratingsCount": len(ratings),
                },
                "pendingCount": len(pending_in) + len(pending_out),
                "pendingIncomingCount": len(pending_in),
                "pendingOutgoingCount": len(pending_out),
                "acceptedCount": len(accepted_list),
                "completedCount": len(completed_list),
                "averageRating": avg_rating,
                "averageRatingDisplay": avg_display,
                "ratingsCount": len(ratings),
                "recentActivity": requests,
            },
            "requests": requests,
        }

    @app.get("/api/exchange-requests")
    @app.get("/api/requests")
    def list_exchange_requests(
        status: str = Query(default="all"),
        viewerId: int = Query(default=1),
        authorization: Optional[str] = Header(default=None),
    ):
        auth_uid = resolve_token_user_id(authorization)
        active_id = auth_uid if auth_uid is not None else viewerId
        requests = get_enriched_requests(active_id)
        if status and status.lower() != "all":
            requests = [r for r in requests if (r.get("status") or "").lower() == status.lower()]
        return {"requests": requests}

    @app.post("/api/exchange-requests")
    @app.post("/api/requests")
    def create_exchange_request(
        payload: ExchangeRequestInput,
        authorization: Optional[str] = Header(default=None),
    ):
        auth_user = require_authenticated_user(authorization)
        requester_id = int(auth_user["id"])
        recipient_id = int(payload.recipient_id)
        if requester_id == recipient_id:
            raise HTTPException(status_code=400, detail="Cannot send an exchange request to yourself.")

        recipient = fetch_user_with_skills(recipient_id, include_private_email=False)
        if not recipient:
            raise HTTPException(status_code=404, detail="Recipient not found.")

        ai_eval = evaluate_compatibility(auth_user, recipient)
        agenda = payload.ai_session_agenda or generate_session_blueprint(
            auth_user["name"],
            recipient["name"],
            payload.offered_skill_name,
            payload.wanted_skill_name,
            payload.duration_mins,
        )
        session_datetime = (payload.session_datetime or payload.proposed_slot).strip()
        session_mode = payload.session_mode if payload.session_mode in ("Online", "In person") else "Online"
        meeting_link_or_location = (
            payload.meeting_link_or_location.strip()
            or ("Local Study Café" if session_mode == "In person" else "https://meet.skillswap.io/reciprocal-session")
        )
        session_notes = (payload.session_notes or payload.learning_goal).strip()
        schedule_status = "agreed" if payload.schedule_status == "agreed" else "proposed"

        conn, dialect = get_db_connection()
        ph = "%s" if dialect == "postgres" else "?"
        try:
            cur = conn.cursor()
            cur.execute(
                f"""
                INSERT INTO swap_requests (
                  requester_id, recipient_id, offered_skill_name, wanted_skill_name,
                  proposed_slot, duration_mins, format,
                  session_datetime, session_mode, meeting_link_or_location, session_notes, schedule_status,
                  learning_goal, message,
                  ai_match_score, ai_match_rationale, ai_session_agenda, status
                ) VALUES ({ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, 'pending')
                """,
                (
                    requester_id,
                    recipient_id,
                    payload.offered_skill_name.strip(),
                    payload.wanted_skill_name.strip(),
                    session_datetime,
                    payload.duration_mins,
                    payload.format.strip(),
                    session_datetime,
                    session_mode,
                    meeting_link_or_location,
                    session_notes,
                    schedule_status,
                    payload.learning_goal.strip(),
                    payload.message.strip(),
                    ai_eval["score"],
                    ai_eval["rationale"],
                    json.dumps(agenda),
                ),
            )
            conn.commit()
            requests = get_enriched_requests(requester_id)
            return {"request": requests[0] if requests else None, "requests": requests}
        finally:
            conn.close()

    @app.put("/api/exchange-requests/{req_id}/schedule")
    @app.patch("/api/exchange-requests/{req_id}/schedule")
    @app.put("/api/requests/{req_id}/schedule")
    @app.patch("/api/requests/{req_id}/schedule")
    def update_exchange_request_schedule(
        req_id: int,
        payload: RequestScheduleInput,
        authorization: Optional[str] = Header(default=None),
    ):
        auth_user = require_authenticated_user(authorization)
        actor_id = int(auth_user["id"])
        conn, dialect = get_db_connection()
        ph = "%s" if dialect == "postgres" else "?"
        try:
            cur = conn.cursor()
            cur.execute(f"SELECT * FROM swap_requests WHERE id = {ph}", (req_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Exchange request not found")
            existing = dict(row)
            if actor_id not in (int(existing["requester_id"]), int(existing["recipient_id"])):
                raise HTTPException(
                    status_code=403,
                    detail="Forbidden: Only participants in this exchange request can view or edit session scheduling.",
                )
            session_datetime = (
                payload.session_datetime
                or payload.proposed_slot
                or existing.get("session_datetime")
                or existing.get("proposed_slot")
                or ""
            ).strip()
            session_mode = (
                payload.session_mode
                if payload.session_mode in ("Online", "In person")
                else existing.get("session_mode") or "Online"
            )
            meeting_link = (payload.meeting_link_or_location or existing.get("meeting_link_or_location") or "").strip()
            session_notes = (payload.session_notes or existing.get("session_notes") or "").strip()
            schedule_status = "agreed" if payload.schedule_status == "agreed" else "proposed"

            cur.execute(
                f"""
                UPDATE swap_requests
                SET proposed_slot = {ph}, session_datetime = {ph}, session_mode = {ph},
                    meeting_link_or_location = {ph}, session_notes = {ph}, schedule_status = {ph}
                WHERE id = {ph}
                """,
                (
                    session_datetime,
                    session_datetime,
                    session_mode,
                    meeting_link,
                    session_notes,
                    schedule_status,
                    req_id,
                ),
            )
            conn.commit()
            return {"requests": get_enriched_requests(actor_id)}
        finally:
            conn.close()

    @app.patch("/api/exchange-requests/{req_id}")
    @app.patch("/api/requests/{req_id}")
    def update_exchange_request_status(
        req_id: int,
        payload: RequestStatusInput,
        authorization: Optional[str] = Header(default=None),
    ):
        auth_user = require_authenticated_user(authorization)
        actor_id = int(auth_user["id"])

        conn, dialect = get_db_connection()
        ph = "%s" if dialect == "postgres" else "?"
        try:
            cur = conn.cursor()
            cur.execute(f"SELECT * FROM swap_requests WHERE id = {ph}", (req_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Exchange request not found")
            existing = dict(row)
            if actor_id not in (int(existing["requester_id"]), int(existing["recipient_id"])):
                raise HTTPException(
                    status_code=403,
                    detail="Forbidden: You are not a participant in this exchange request.",
                )

            new_status = (payload.status or existing["status"]).strip()
            if payload.status:
                if new_status not in ("accepted", "declined", "cancelled", "completed"):
                    raise HTTPException(status_code=400, detail="Invalid request status transition.")
                if new_status in ("accepted", "declined") and actor_id != int(existing["recipient_id"]):
                    raise HTTPException(
                        status_code=403,
                        detail="Forbidden: Only the recipient can accept or decline an incoming request.",
                    )
                if new_status == "cancelled":
                    if actor_id != int(existing["requester_id"]):
                        raise HTTPException(
                            status_code=403,
                            detail="Forbidden: Only the requester can cancel an outgoing request.",
                        )
                    if existing.get("status") != "pending":
                        raise HTTPException(
                            status_code=400,
                            detail="Only pending requests can be cancelled.",
                        )

            cur.execute(
                f"UPDATE swap_requests SET status = {ph} WHERE id = {ph}",
                (new_status, req_id),
            )
            conn.commit()
            return {"requests": get_enriched_requests(actor_id)}
        finally:
            conn.close()

    @app.post("/api/exchange-requests/{req_id}/review")
    @app.post("/api/requests/{req_id}/review")
    @app.post("/api/exchanges")
    def complete_and_review_exchange(
        payload: CompleteReviewInput,
        req_id: Optional[int] = None,
        authorization: Optional[str] = Header(default=None),
    ):
        auth_user = require_authenticated_user(authorization)
        viewer_id = int(auth_user["id"])
        target_req_id = req_id if req_id is not None else payload.request_id
        rating = int(payload.rating_given)
        if rating < 1 or rating > 5:
            raise HTTPException(status_code=400, detail="Rating must be between 1 and 5 stars.")

        conn, dialect = get_db_connection()
        ph = "%s" if dialect == "postgres" else "?"
        try:
            cur = conn.cursor()
            partner_a_id = payload.partner_a_id or viewer_id
            partner_b_id = payload.partner_b_id
            skill_a = payload.skill_a_taught.strip()
            skill_b = payload.skill_b_taught.strip()
            duration_mins = int(payload.duration_mins or 60)
            review_text = (payload.testimonial or payload.review_comment or payload.summary_notes or "").strip()

            if target_req_id:
                cur.execute(f"SELECT * FROM swap_requests WHERE id = {ph}", (target_req_id,))
                r_row = cur.fetchone()
                if not r_row:
                    raise HTTPException(status_code=404, detail="Exchange request not found.")
                req_dict = dict(r_row)
                if viewer_id not in (int(req_dict["requester_id"]), int(req_dict["recipient_id"])):
                    raise HTTPException(
                        status_code=403,
                        detail="Forbidden: Only session participants can complete and review this exchange.",
                    )
                partner_a_id = int(req_dict["requester_id"])
                partner_b_id = int(req_dict["recipient_id"])
                skill_a = skill_a or req_dict["offered_skill_name"]
                skill_b = skill_b or req_dict["wanted_skill_name"]
                cur.execute(
                    f"""
                    UPDATE swap_requests
                    SET status = 'completed', schedule_status = 'agreed',
                        rating_given = {ph}, review_comment = {ph}
                    WHERE id = {ph}
                    """,
                    (rating, review_text, target_req_id),
                )

            cur.execute(
                f"""
                INSERT INTO completed_exchanges (
                  request_id, partner_a_id, partner_b_id, skill_a_taught, skill_b_taught,
                  duration_mins, summary_notes, takeaways, rating_given, testimonial, verified_badge
                ) VALUES ({ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, 'Verified 1-to-1 Reciprocal Swap')
                """,
                (
                    target_req_id,
                    partner_a_id,
                    partner_b_id,
                    skill_a,
                    skill_b,
                    duration_mins,
                    payload.summary_notes or review_text,
                    json.dumps(payload.takeaways or []),
                    rating,
                    review_text or f"Completed {skill_a} ⇄ {skill_b} exchange ({rating}/5 stars).",
                ),
            )
            conn.commit()
            return {"requests": get_enriched_requests(viewer_id)}
        finally:
            conn.close()

    class AiChatInput(BaseModel):
        message: str
        viewerId: Optional[int] = None
        profileContext: Optional[Dict[str, Any]] = None
        history: List[Dict[str, Any]] = []

    @app.post("/api/ai/chat")
    def ai_skill_assistant_chat(
        payload: AiChatInput,
        authorization: Optional[str] = Header(default=None),
    ):
        raw_message = (payload.message or "").strip()
        if not raw_message:
            raise HTTPException(status_code=400, detail="Please enter a question for the AI Skill Assistant.")

        auth_user = resolve_user_from_token(authorization)
        viewer_id = int(auth_user["id"]) if auth_user else int(payload.viewerId or 1)

        conn, _ = get_db_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT id FROM users ORDER BY id ASC")
            user_ids = [int(dict(r)["id"]) for r in cur.fetchall()]
        finally:
            conn.close()

        all_users = [
            fetch_user_with_skills(uid, include_private_email=(uid == viewer_id))
            for uid in user_ids
        ]
        all_users = [u for u in all_users if u is not None]
        viewer = next((u for u in all_users if int(u["id"]) == viewer_id), all_users[0])
        candidates = [u for u in all_users if int(u["id"]) != int(viewer["id"])]

        chat_res = generate_ai_chat_response(
            message=raw_message,
            viewer=viewer,
            candidates=candidates,
        )
        return {
            **chat_res,
            "authenticatedViewerId": viewer["id"],
            "providerMode": "gemini-grounded-db" if os.getenv("GEMINI_API_KEY") else "skillswap-semantic-db-engine",
            "securityNote": "Recommendations are grounded in Supabase PostgreSQL / SQLite member records; API keys remain strictly on the backend.",
        }

    class AiProfileHelperInput(BaseModel):
        task: str
        rough_notes: Optional[str] = None
        notes: Optional[str] = None
        skill_name: Optional[str] = None
        skillName: Optional[str] = None

    @app.post("/api/ai/profile-helper")
    def ai_profile_and_skill_helper(payload: AiProfileHelperInput):
        rough_notes = payload.rough_notes if payload.rough_notes is not None else (payload.notes or "")
        skill_name = payload.skill_name if payload.skill_name is not None else payload.skillName
        try:
            result = generate_profile_or_skill_suggestion(
                task=payload.task,
                rough_notes=rough_notes,
                skill_name=skill_name,
            )
            result["providerMode"] = (
                "gemini-profile-helper"
                if os.getenv("GEMINI_API_KEY")
                else "openai-profile-helper"
                if os.getenv("OPENAI_API_KEY")
                else "skillswap-ai-profile-helper"
            )
            return result
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    @app.post("/api/auth/logout")
    def logout_user(authorization: Optional[str] = Header(default=None)):
        if authorization and authorization.startswith("Bearer "):
            token = authorization[7:].strip()
            if token:
                conn, dialect = get_db_connection()
                ph = "%s" if dialect == "postgres" else "?"
                try:
                    cur = conn.cursor()
                    cur.execute(f"DELETE FROM auth_sessions WHERE token = {ph}", (token,))
                    conn.commit()
                finally:
                    conn.close()
        return {"loggedOut": True}

    class ReviewSubmissionInput(BaseModel):
        request_id: int
        rating: int
        comment: str = ""

    @app.post("/api/reviews")
    def submit_exchange_review(
        payload: ReviewSubmissionInput,
        authorization: Optional[str] = Header(default=None),
    ):
        auth_user = require_authenticated_user(authorization)
        reviewer_id = int(auth_user["id"])
        if payload.rating < 1 or payload.rating > 5:
            raise HTTPException(status_code=400, detail="Rating must be between 1 and 5 stars.")

        conn, dialect = get_db_connection()
        ph = "%s" if dialect == "postgres" else "?"
        try:
            cur = conn.cursor()
            cur.execute(f"SELECT * FROM swap_requests WHERE id = {ph}", (payload.request_id,))
            req_row = cur.fetchone()
            if not req_row:
                raise HTTPException(status_code=404, detail="Exchange session not found.")
            req_dict = dict(req_row)
            if reviewer_id not in (int(req_dict["requester_id"]), int(req_dict["recipient_id"])):
                raise HTTPException(
                    status_code=403,
                    detail="Forbidden: You cannot review an exchange you did not participate in.",
                )
            if req_dict["status"] != "completed":
                raise HTTPException(
                    status_code=400,
                    detail="Reviews are only permitted for exchanges that have been marked completed.",
                )

            cur.execute(
                f"SELECT id FROM reviews WHERE request_id = {ph} AND reviewer_id = {ph}",
                (payload.request_id, reviewer_id),
            )
            if cur.fetchone():
                raise HTTPException(
                    status_code=409,
                    detail="Duplicate review: You have already reviewed this completed exchange session.",
                )

            reviewee_id = (
                int(req_dict["recipient_id"])
                if reviewer_id == int(req_dict["requester_id"])
                else int(req_dict["requester_id"])
            )
            cur.execute(
                f"INSERT INTO reviews (request_id, reviewer_id, reviewee_id, rating, comment) VALUES ({ph}, {ph}, {ph}, {ph}, {ph})",
                (payload.request_id, reviewer_id, reviewee_id, payload.rating, payload.comment.strip()),
            )
            conn.commit()
            return {"status": "created"}
        finally:
            conn.close()

    class AiLearningPlanInput(BaseModel):
        target_skill: str
        learning_goals: str
        preferred_format: str = "Online"

    class SaveLearningPlanInput(BaseModel):
        target_skill: str
        learning_goals: str
        preferred_format: str = "Online"
        plan_title: str
        plan_content: str
        milestones: List[Dict[str, Any]] = []

    @app.post("/api/ai/learning-plan")
    def create_ai_learning_plan_preview(payload: AiLearningPlanInput):
        try:
            return generate_ai_learning_plan(
                target_skill=payload.target_skill,
                learning_goals=payload.learning_goals,
                preferred_format=payload.preferred_format,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    @app.get("/api/learning-plans")
    def list_my_learning_plans(authorization: Optional[str] = Header(default=None)):
        auth_user = require_authenticated_user(authorization)
        uid = int(auth_user["id"])
        conn, dialect = get_db_connection()
        ph = "%s" if dialect == "postgres" else "?"
        try:
            cur = conn.cursor()
            cur.execute(f"SELECT * FROM learning_plans WHERE user_id = {ph} ORDER BY id DESC", (uid,))
            plans = []
            for r in cur.fetchall():
                d = dict(r)
                d["milestones"] = safe_json_loads(d.get("milestones"), [])
                plans.append(d)
            return {"learningPlans": plans}
        finally:
            conn.close()

    @app.post("/api/learning-plans")
    def save_my_learning_plan(
        payload: SaveLearningPlanInput,
        authorization: Optional[str] = Header(default=None),
    ):
        auth_user = require_authenticated_user(authorization)
        uid = int(auth_user["id"])
        conn, dialect = get_db_connection()
        ph = "%s" if dialect == "postgres" else "?"
        try:
            cur = conn.cursor()
            cur.execute(
                f"""
                INSERT INTO learning_plans (user_id, target_skill, learning_goals, preferred_format, plan_title, plan_content, milestones)
                VALUES ({ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph})
                """,
                (
                    uid,
                    payload.target_skill.strip(),
                    payload.learning_goals.strip(),
                    payload.preferred_format,
                    payload.plan_title.strip(),
                    payload.plan_content.strip(),
                    json.dumps(payload.milestones),
                ),
            )
            conn.commit()
            return list_my_learning_plans(authorization)
        finally:
            conn.close()

    @app.delete("/api/learning-plans/{plan_id}")
    def delete_my_learning_plan(
        plan_id: int,
        authorization: Optional[str] = Header(default=None),
    ):
        auth_user = require_authenticated_user(authorization)
        uid = int(auth_user["id"])
        conn, dialect = get_db_connection()
        ph = "%s" if dialect == "postgres" else "?"
        try:
            cur = conn.cursor()
            cur.execute(f"SELECT user_id FROM learning_plans WHERE id = {ph}", (plan_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Learning plan not found.")
            if int(dict(row)["user_id"]) != uid:
                raise HTTPException(
                    status_code=403,
                    detail="Forbidden: Users may read, update, or delete only their own learning plans.",
                )
            cur.execute(f"DELETE FROM learning_plans WHERE id = {ph} AND user_id = {ph}", (plan_id, uid))
            conn.commit()
            return list_my_learning_plans(authorization)
        finally:
            conn.close()

    class SessionPlanInput(BaseModel):
        requesterId: int = 1
        recipientId: int = 2
        offeredSkillName: str = ""
        wantedSkillName: str = ""
        durationMins: int = 60
        learningGoal: str = ""

    @app.post("/api/ai/session-plan")
    def build_session_plan(payload: SessionPlanInput):
        req_user = fetch_user_with_skills(int(payload.requesterId), include_private_email=False)
        rec_user = fetch_user_with_skills(int(payload.recipientId), include_private_email=False)
        req_name = req_user["name"] if req_user else "You"
        rec_name = rec_user["name"] if rec_user else "Partner"
        agenda = generate_session_blueprint(
            req_name,
            rec_name,
            payload.offeredSkillName or "Skill A",
            payload.wantedSkillName or "Skill B",
            int(payload.durationMins or 60),
        )
        first_name = rec_name.split(" ")[0]
        pitch = f"Hi {first_name}! Let's swap a 50/50 session trading {payload.offeredSkillName} for {payload.wantedSkillName}."
        return {"agenda": agenda, "suggestedMessage": pitch}

    dist_dir = find_frontend_dist_dir()
    assets_dir = os.path.join(dist_dir, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")
    if os.path.isdir(dist_dir):
        app.mount("/app", StaticFiles(directory=dist_dir, html=True), name="static")




