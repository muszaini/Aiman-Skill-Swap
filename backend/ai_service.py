import json
import re
from typing import Any, Dict, List, Optional

SKILL_TAXONOMY = [
    {
        "cluster": "spreadsheets_data",
        "label": "Business",
        "canonical": "Excel & Spreadsheet Modeling",
        "keywords": [
            "excel", "spreadsheet", "spreadsheets", "pivot", "pivot table", "pivot tables",
            "xlookup", "vlookup", "index match", "financial modeling", "formulas", "macros",
            "vba", "powerquery", "google sheets", "dashboards", "bookkeeping", "budget",
            "cohort", "data modeling", "finance", "accounting", "sheets", "business"
        ],
    },
    {
        "cluster": "graphic_design",
        "label": "Design",
        "canonical": "Graphic Design & Visual Systems",
        "keywords": [
            "graphic design", "design", "figma", "typography", "layout", "grid", "swiss grid",
            "branding", "brand identity", "illustrator", "photoshop", "poster", "visual",
            "ui design", "color theory", "deck design", "canva", "infographics", "logo",
            "editorial design", "visual systems", "creative", "ux"
        ],
    },
    {
        "cluster": "english_comm",
        "label": "Languages",
        "canonical": "Conversational English Practice",
        "keywords": [
            "conversational english", "english conversation", "english", "speaking", "conversation", "fluency",
            "idioms", "pronunciation", "interview prep", "public speaking", "communication",
            "esl", "business english", "presentation", "pitching", "q&a", "accent", "language"
        ],
    },
    {
        "cluster": "python_coding",
        "label": "Technology",
        "canonical": "Beginner Python Lessons",
        "keywords": [
            "python", "beginner python", "coding", "programming", "pandas", "script",
            "scripting", "automation", "jupyter", "csv", "data cleaning", "software",
            "sql", "javascript", "web dev", "api", "backend", "code", "developer", "technology"
        ],
    },
    {
        "cluster": "product_strategy",
        "label": "Business",
        "canonical": "Product Strategy & UX Research",
        "keywords": [
            "product", "product management", "ux research", "storytelling", "strategy",
            "user interviews", "roadmap", "startup", "marketing", "growth", "saas"
        ],
    },
]

LEVEL_RANK = {"Beginner": 1, "Intermediate": 2, "Advanced": 3, "Expert": 4}


def safe_parse_array(val: Any) -> List[Any]:
    if isinstance(val, list):
        return val
    if not val:
        return []
    try:
        parsed = json.loads(val)
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []


def tokenize(text: Optional[str]) -> List[str]:
    if not text:
        return []
    cleaned = re.sub(r"[^a-z0-9+#\-\s]", " ", str(text).lower())
    return [w for w in cleaned.split() if len(w) > 1]


def get_semantic_clusters(skill_or_text: Any) -> List[str]:
    if isinstance(skill_or_text, str):
        raw_text = skill_or_text.lower()
    else:
        tags_str = " ".join(safe_parse_array(skill_or_text.get("tags")))
        raw_text = f"{skill_or_text.get('skill_name', '')} {skill_or_text.get('category', '')} {skill_or_text.get('description', '')} {tags_str}".lower()

    matched = []
    for item in SKILL_TAXONOMY:
        for kw in item["keywords"]:
            if kw in raw_text:
                if item["cluster"] not in matched:
                    matched.append(item["cluster"])
                break
    return matched


def compute_skill_pair_similarity(offer_skill: Dict[str, Any], want_skill: Dict[str, Any]) -> float:
    offer_name = (offer_skill.get("skill_name") or "").lower()
    want_name = (want_skill.get("skill_name") or "").lower()
    if offer_name == want_name:
        return 1.0
    if offer_name in want_name or want_name in offer_name:
        return 0.96

    offer_clusters = get_semantic_clusters(offer_skill)
    want_clusters = get_semantic_clusters(want_skill)
    shared = [c for c in offer_clusters if c in want_clusters]

    offer_tokens = set(
        tokenize(offer_skill.get("skill_name"))
        + tokenize(offer_skill.get("description"))
    )
    want_tokens = set(
        tokenize(want_skill.get("skill_name"))
        + tokenize(want_skill.get("description"))
    )
    stopwords = {"and", "for", "the", "with", "want", "learn", "teach", "beginner", "basic"}
    overlap = len([t for t in want_tokens if t in offer_tokens and t not in stopwords])

    score = 0.0
    if shared:
        score = 0.84 + min(0.15, overlap * 0.03)
    elif offer_skill.get("category") and offer_skill.get("category") == want_skill.get("category"):
        score = 0.68 + min(0.20, overlap * 0.04)
    elif overlap > 0:
        score = min(0.75, 0.35 + overlap * 0.08)

    offer_lvl = LEVEL_RANK.get(offer_skill.get("level", "Advanced"), 3)
    want_lvl = LEVEL_RANK.get(want_skill.get("level", "Beginner"), 1)
    if score > 0.5 and offer_lvl > want_lvl:
        score = min(0.99, score + 0.03)

    return round(score, 2)


def generate_session_blueprint(
    viewer_name: str,
    candidate_name: str,
    you_teach_skill: str,
    they_teach_skill: str,
    you_teach_desc: str = "",
    they_teach_desc: str = "",
    duration_mins: int = 60,
) -> List[Dict[str, str]]:
    v_first = (viewer_name or "You").split()[0]
    c_first = (candidate_name or "Partner").split()[0]
    half = (duration_mins - 10) // 2
    return [
        {
            "time": "00–05 min",
            "phase": "Warmup & Mutual Goal Check",
            "detail": f"{v_first} & {c_first} share screen setups, sample files, and define 1 concrete takeaway each.",
        },
        {
            "time": f"05–{5 + half} min",
            "phase": f"Part 1: {you_teach_skill} ({v_first} teaches {c_first})",
            "detail": f"Hands-on walkthrough focused on: {you_teach_desc}" if you_teach_desc else f"Live guided practice on core {you_teach_skill} workflows.",
        },
        {
            "time": f"{5 + half}–{5 + half * 2} min",
            "phase": f"Part 2: {they_teach_skill} ({c_first} teaches {v_first})",
            "detail": f"Interactive coaching focused on: {they_teach_desc}" if they_teach_desc else f"Step-by-step practice building {they_teach_skill} skills together.",
        },
        {
            "time": f"{5 + half * 2}–{duration_mins} min",
            "phase": "Recap, Templates & Next Swap Checkpoint",
            "detail": "Export session notes, share practice files, and log verified skill progress on SkillSwap.",
        },
    ]


def evaluate_compatibility(
    viewer: Dict[str, Any],
    candidate: Dict[str, Any],
    query_intent: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    viewer_offers = viewer.get("offers", [])
    viewer_wants = viewer.get("wants", [])
    candidate_offers = candidate.get("offers", [])
    candidate_wants = candidate.get("wants", [])

    best_v_teaches = None
    best_v_score = 0.0
    for vo in viewer_offers:
        for cw in candidate_wants:
            sim = compute_skill_pair_similarity(vo, cw)
            if sim > best_v_score:
                best_v_score = sim
                best_v_teaches = {"viewerOffer": vo, "candidateWant": cw, "similarity": sim}

    best_c_teaches = None
    best_c_score = 0.0
    for co in candidate_offers:
        for vw in viewer_wants:
            sim = compute_skill_pair_similarity(co, vw)
            if sim > best_c_score:
                best_c_score = sim
                best_c_teaches = {"candidateOffer": co, "viewerWant": vw, "similarity": sim}

    if not best_v_teaches and viewer_offers and candidate_wants:
        best_v_teaches = {"viewerOffer": viewer_offers[0], "candidateWant": candidate_wants[0], "similarity": 0.45}
        best_v_score = 0.45
    if not best_c_teaches and candidate_offers and viewer_wants:
        best_c_teaches = {"candidateOffer": candidate_offers[0], "viewerWant": viewer_wants[0], "similarity": 0.45}
        best_c_score = 0.45

    viewer_avail = safe_parse_array(viewer.get("availability"))
    cand_avail = safe_parse_array(candidate.get("availability"))
    shared_windows = [w for w in viewer_avail if w in cand_avail]
    schedule_score = 0.98 if len(shared_windows) >= 3 else 0.94 if len(shared_windows) == 2 else 0.85 if len(shared_windows) == 1 else 0.68

    raw_reciprocal = (best_v_score * 0.42 + best_c_score * 0.42 + schedule_score * 0.16) * 98
    final_score = min(99, max(68, round(raw_reciprocal)))

    you_teach_skill = (best_v_teaches or {}).get("viewerOffer", {}).get("skill_name", "Excel")
    they_want_skill = (best_v_teaches or {}).get("candidateWant", {}).get("skill_name", you_teach_skill)
    they_teach_skill = (best_c_teaches or {}).get("candidateOffer", {}).get("skill_name", "Graphic Design")
    you_want_skill = (best_c_teaches or {}).get("viewerWant", {}).get("skill_name", they_teach_skill)

    cand_first = candidate.get("name", "Partner").split()[0]
    rationale = (
        f"Direct double-coincidence swap: You offer {you_teach_skill}, which directly fulfills {cand_first}’s goal to learn {they_want_skill}. "
        f"In return, {cand_first} teaches {they_teach_skill}, matching your {you_want_skill} goal."
    )

    agenda = generate_session_blueprint(
        viewer_name=viewer.get("name", "You"),
        candidate_name=candidate.get("name", "Partner"),
        you_teach_skill=you_teach_skill,
        they_teach_skill=they_teach_skill,
        duration_mins=int(candidate.get("session_length_mins") or 60),
    )

    return {
        "score": final_score,
        "matchTier": "Direct Reciprocal Match" if final_score >= 94 else "High-Synergy Skill Bridge",
        "isDirectDoubleMatch": best_v_score >= 0.8 and best_c_score >= 0.8,
        "youTeach": {
            "skillName": you_teach_skill,
            "level": (best_v_teaches or {}).get("viewerOffer", {}).get("level", "Expert"),
            "targetWantName": they_want_skill,
            "fitPercent": min(99, round(best_v_score * 100)),
        },
        "theyTeach": {
            "skillName": they_teach_skill,
            "level": (best_c_teaches or {}).get("candidateOffer", {}).get("level", "Expert"),
            "targetWantName": you_want_skill,
            "fitPercent": min(99, round(best_c_score * 100)),
        },
        "sharedAvailability": shared_windows or ["Flexible Schedule"],
        "rationale": rationale,
        "suggestedAgenda": agenda,
        "suggestedPitch": f"Hi {cand_first}! I noticed we have a {final_score}% reciprocal skill match—I'd love to teach you {you_teach_skill} in exchange for learning {they_teach_skill}.",
    }


def parse_natural_language_intent(raw_query: str) -> Optional[Dict[str, Any]]:
    query = (raw_query or "").strip()
    if not query:
        return None
    clusters = get_semantic_clusters(query)
    matched = [t for t in SKILL_TAXONOMY if t["cluster"] in clusters]
    return {
        "rawQuery": query,
        "extractedOffers": matched[:1],
        "extractedWants": matched[1:] if len(matched) > 1 else matched,
        "summaryExplanation": f"AI mapped your request across {len(matched)} skill domain(s).",
    }


def generate_ai_chat_response(
    message: str,
    viewer: Dict[str, Any],
    candidates: List[Dict[str, Any]],
) -> Dict[str, Any]:
    raw_msg = (message or "").strip()
    lower = raw_msg.lower()
    viewer_offers = [s.get("skill_name") or s.get("skill") for s in viewer.get("offers", []) if s.get("skill_name") or s.get("skill")]
    viewer_wants = [s.get("skill_name") or s.get("skill") for s in viewer.get("wants", []) if s.get("skill_name") or s.get("skill")]

    query_clusters = get_semantic_clusters(raw_msg)
    evaluated = []
    for cand in candidates:
        if int(cand.get("id", 0)) == int(viewer.get("id", 0)):
            continue
        ai_match = evaluate_compatibility(viewer, cand)
        cand_offers = cand.get("offers", [])
        cand_wants = cand.get("wants", [])
        cand_offer_clusters = []
        for s in cand_offers:
            for c in get_semantic_clusters(s):
                if c not in cand_offer_clusters:
                    cand_offer_clusters.append(c)
        matches_query_skill = any(c in cand_offer_clusters for c in query_clusters) if query_clusters else False
        evaluated.append(
            {
                "id": cand.get("id"),
                "name": cand.get("name"),
                "role_title": cand.get("role_title"),
                "preferred_format": cand.get("preferred_format") or "Online",
                "avatar_initials": cand.get("avatar_initials"),
                "avatar_bg": cand.get("avatar_bg"),
                "offers": [s.get("skill_name") for s in cand_offers],
                "wants": [s.get("skill_name") for s in cand_wants],
                "aiMatch": ai_match,
                "matchesQuerySkill": matches_query_skill,
            }
        )

    evaluated.sort(
        key=lambda x: (1 if x["matchesQuerySkill"] else 0, x["aiMatch"]["score"]),
        reverse=True,
    )
    recommended = evaluated[:3]
    top = recommended[0] if recommended else None

    if top and query_clusters:
        reply = (
            f"Based on registered database profiles, **{top['name']}** ({top['aiMatch']['score']}% Match) "
            f"offers **{top['aiMatch']['theyTeach']['skillName']}** and wants to learn **{top['aiMatch']['youTeach']['targetWantName']}**, "
            f"which aligns with your skill in **{top['aiMatch']['youTeach']['skillName']}**."
        )
    elif top and ("plan" in lower or "first" in lower):
        reply = (
            f"Here is a 60-minute 1-on-1 exchange plan with your top database match, **{top['name']}** ({top['aiMatch']['score']}% Match): "
            f"1) 00–05 min warmup; 2) 05–30 min you teach **{top['aiMatch']['youTeach']['skillName']}**; "
            f"3) 30–55 min {top['name']} teaches **{top['aiMatch']['theyTeach']['skillName']}**; 4) 55–60 min wrap-up."
        )
    elif top:
        reply = (
            f"Evaluating your offered skills ({', '.join(viewer_offers) or 'none'}) and learning goals ({', '.join(viewer_wants) or 'none'}) "
            f"against registered members, your top match is **{top['name']}** ({top['aiMatch']['score']}% Match): "
            f"{top['aiMatch']['rationale']}"
        )
    else:
        reply = "No matching members were found in the database yet."

    return {
        "reply": reply,
        "recommendedMembers": [
            {
                "id": m["id"],
                "name": m["name"],
                "role_title": m["role_title"],
                "preferred_format": m["preferred_format"],
                "avatar_initials": m["avatar_initials"],
                "avatar_bg": m["avatar_bg"],
                "score": m["aiMatch"]["score"],
                "matchTier": m["aiMatch"]["matchTier"],
                "theyTeach": m["aiMatch"]["theyTeach"]["skillName"],
                "youTeach": m["aiMatch"]["youTeach"]["skillName"],
                "theyWant": m["aiMatch"]["youTeach"]["targetWantName"],
                "rationale": m["aiMatch"]["rationale"],
                "offers": m["offers"],
                "wants": m["wants"],
            }
            for m in recommended
        ],
        "profileContextUsed": {
            "viewerId": viewer.get("id"),
            "viewerName": viewer.get("name"),
            "skillsOffered": viewer_offers,
            "skillsWanted": viewer_wants,
            "totalDatabaseMembersEvaluated": len(evaluated),
        },
    }


def generate_profile_or_skill_suggestion(
    task: str,
    rough_notes: str,
    skill_name: Optional[str] = None,
) -> Dict[str, Any]:
    normalized_task = (task or "").strip().lower()
    if normalized_task not in ("bio", "skill_description"):
        raise ValueError('Invalid task. Must be "bio" or "skill_description".')

    notes = (rough_notes or "").strip()
    if len(notes) < 10:
        raise ValueError("Rough notes are too short. Please enter at least 10 characters.")
    if len(notes) > 500:
        raise ValueError("Rough notes exceed the 500-character maximum limit.")

    clean_skill = (skill_name or "").strip()
    if normalized_task == "skill_description":
        if len(clean_skill) < 2:
            raise ValueError("Please provide a skill name (at least 2 characters) for the Skill Description Helper.")
        if len(clean_skill) > 80:
            raise ValueError("Skill name must be 80 characters or fewer.")

    combined = f"{clean_skill} {notes}"
    if (
        re.search(r"\b\d{3}-\d{2}-\d{4}\b", combined)
        or re.search(r"\b(?:\d[ -]*?){13,16}\b", combined)
        or re.search(r"\b(?:password|passcode|ssn|social security|credit card)\s*[:=]", combined, re.I)
    ):
        raise ValueError(
            "Privacy safeguard triggered: Please do not submit sensitive personal information (such as passwords, SSNs, or financial numbers)."
        )

    fragments = [s.strip() for s in re.split(r"[.;•|\n]+", notes) if s.strip()]
    if normalized_task == "bio":
        cleaned = [re.sub(r"^(i am|i'm|im)\s+", "", f, flags=re.I).strip() for f in fragments]
        primary = cleaned[0] if cleaned else notes
        primary_norm = primary[0].lower() + primary[1:].rstrip(".")
        secondary = ", ".join(cleaned[1:]).rstrip(".")
        if secondary:
            suggestion = (
                f"I bring hands-on experience in {primary_norm}, with a focus on {secondary}. "
                "On SkillSwap, I enjoy practical, step-by-step 1-on-1 sessions where we trade actionable workflows, "
                "real templates, and constructive feedback so both partners walk away with immediate skills."
            )
        else:
            suggestion = (
                f"I focus on {primary_norm} and love sharing practical, real-world workflows through collaborative 1-on-1 sessions. "
                "Excited to connect with fellow SkillSwap members to trade hands-on knowledge, templates, and clear step-by-step coaching!"
            )
    else:
        topic_list = ", ".join(fragments).rstrip(".")
        topic_cap = topic_list[0].upper() + topic_list[1:] if topic_list else notes
        suggestion = (
            f"Hands-on 1-on-1 coaching in {clean_skill}: {topic_cap}. "
            "In our exchange session, you will learn practical workflows, work through live examples step by step, "
            "and leave with reusable templates you can apply immediately."
        )

    fields_sent = (
        ["task", "skill_name", "rough_notes"]
        if normalized_task == "skill_description"
        else ["task", "rough_notes"]
    )
    return {
        "task": normalized_task,
        "skill_name": clean_skill if normalized_task == "skill_description" else None,
        "suggestion": suggestion,
        "charCount": len(suggestion),
        "dataMinimized": True,
        "fieldsSentToAi": fields_sent,
        "privacyNotice": "Only the selected task, rough notes, and (when relevant) skill name were processed.",
    }


def generate_ai_learning_plan(
    target_skill: str,
    learning_goals: str,
    preferred_format: str = "Online",
) -> Dict[str, Any]:
    clean_skill = (target_skill or "").strip()
    if len(clean_skill) < 2 or len(clean_skill) > 80:
        raise ValueError("Target skill must be between 2 and 80 characters.")

    clean_goals = (learning_goals or "").strip()
    if len(clean_goals) < 10:
        raise ValueError("Learning goals must be at least 10 characters.")
    if len(clean_goals) > 500:
        raise ValueError("Learning goals must be 500 characters or fewer.")

    clean_format = preferred_format if preferred_format in ("Online", "In person", "Either") else "Online"
    plan_title = f"4-Week Reciprocal Learning Plan: {clean_skill} ({clean_format})"
    milestones = [
        {
            "week": "Week 1",
            "title": f"Core Foundations & Setup in {clean_skill}",
            "outcome": f"Align on {clean_format} workflow tools and build your first guided exercise focused on: {clean_goals}",
        },
        {
            "week": "Week 2",
            "title": "Hands-On Practice & Pattern Building",
            "outcome": f"Complete a 50/50 peer session applying {clean_skill} techniques to a real-world project.",
        },
        {
            "week": "Week 3",
            "title": "Troubleshooting, Critique & Optimization",
            "outcome": "Review edge cases with your SkillSwap partner and refine reusable templates.",
        },
        {
            "week": "Week 4",
            "title": "Capstone Reciprocal Project & Review",
            "outcome": f"Demonstrate your completed {clean_skill} deliverable and log a verified exchange review.",
        },
    ]
    plan_content = "\n".join(f"{m['week']} — {m['title']}: {m['outcome']}" for m in milestones)
    return {
        "target_skill": clean_skill,
        "learning_goals": clean_goals,
        "preferred_format": clean_format,
        "plan_title": plan_title,
        "plan_content": plan_content,
        "milestones": milestones,
        "dataMinimized": True,
        "fieldsSentToAi": ["target_skill", "learning_goals", "preferred_format"],
    }




