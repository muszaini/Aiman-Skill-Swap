"""
Pydantic v2 Schemas for SkillSwap API
"""

from typing import Any, Dict, List, Optional

try:
    from pydantic import BaseModel, Field
except ImportError:
    BaseModel = object  # type: ignore
    def Field(*args, **kwargs): return None  # type: ignore


class SkillCreateSchema(BaseModel):
    type: str = Field(default="offer", pattern="^(offer|want)$")
    skill_name: str = Field(..., min_length=2, max_length=140)
    category: str = Field(default="Business", pattern="^(Technology|Business|Design|Languages)$")
    level: str = Field(default="Intermediate", pattern="^(Beginner|Intermediate|Advanced|Expert)$")
    proficiency: Optional[str] = Field(default=None, pattern="^(Beginner|Intermediate|Advanced|Expert)$")
    description: str = Field(default="")


class SkillUpdateSchema(BaseModel):
    skill_name: Optional[str] = None
    category: Optional[str] = Field(default=None, pattern="^(Technology|Business|Design|Languages)$")
    level: Optional[str] = Field(default=None, pattern="^(Beginner|Intermediate|Advanced|Expert)$")
    proficiency: Optional[str] = Field(default=None, pattern="^(Beginner|Intermediate|Advanced|Expert)$")
    description: Optional[str] = None


class UserRegisterSchema(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    email: str = Field(..., min_length=5, max_length=180)
    password: str = Field(..., min_length=6)
    role_title: str = Field(default="SkillSwap Community Member")
    bio: str = Field(default="")
    location: str = Field(default="Remote")
    timezone: str = Field(default="UTC-5 (EST)")
    session_length_mins: int = Field(default=60, ge=15, le=240)
    availability: List[str] = Field(default=["Weekday Evenings", "Saturday Mornings"])
    offers: List[SkillCreateSchema] = Field(default=[])
    wants: List[SkillCreateSchema] = Field(default=[])


class UserLoginSchema(BaseModel):
    email: str
    password: str


class SwapRequestCreateSchema(BaseModel):
    requester_id: Optional[int] = None
    recipient_id: int
    offered_skill_name: str
    wanted_skill_name: str
    proposed_slot: str
    duration_mins: int = 60
    format: str = "1-on-1 Live Video + Screen Share"
    session_datetime: Optional[str] = None
    session_mode: str = Field(default="Online", pattern="^(Online|In person)$")
    meeting_link_or_location: str = ""
    session_notes: str = ""
    schedule_status: str = Field(default="proposed", pattern="^(proposed|agreed)$")
    learning_goal: str
    message: str
    ai_session_agenda: List[Dict[str, Any]] = []


class SwapRequestScheduleSchema(BaseModel):
    session_datetime: Optional[str] = None
    session_mode: str = Field(default="Online", pattern="^(Online|In person)$")
    meeting_link_or_location: str = ""
    session_notes: str = ""
    schedule_status: str = Field(default="proposed", pattern="^(proposed|agreed)$")
    duration_mins: Optional[int] = 60


class SwapRequestStatusPatchSchema(BaseModel):
    status: Optional[str] = Field(default=None, pattern="^(accepted|declined|cancelled|completed)$")
    session_datetime: Optional[str] = None
    session_mode: Optional[str] = Field(default=None, pattern="^(Online|In person)$")
    meeting_link_or_location: Optional[str] = None
    session_notes: Optional[str] = None
    schedule_status: Optional[str] = Field(default=None, pattern="^(proposed|agreed)$")
    viewerId: Optional[int] = None


class CompletedExchangeCreateSchema(BaseModel):
    viewerId: Optional[int] = None
    request_id: Optional[int] = None
    partner_a_id: Optional[int] = None
    partner_b_id: int
    skill_a_taught: str
    skill_b_taught: str
    duration_mins: int = 60
    summary_notes: str
    takeaways: List[str] = []
    rating_given: int = Field(default=5, ge=1, le=5)
    testimonial: str
    review_comment: Optional[str] = None
