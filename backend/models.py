"""
SQLAlchemy ORM Models for SkillSwap PostgreSQL Schema (`public` schema).
Maps the 7 authoritative tables:
1. skill_categories
2. profiles
3. skills
4. exchange_requests
5. exchange_sessions
6. reviews
7. learning_plans
"""

import uuid
from datetime import datetime, timezone

try:
    from sqlalchemy import (
        ARRAY,
         Boolean,
        CheckConstraint,
        Column,
        DateTime,
        ForeignKey,
        Index,
        SmallInteger,
        String,
        Text,
        UniqueConstraint,
    )
    from sqlalchemy.dialects.postgresql import JSONB, UUID
    from sqlalchemy.orm import declarative_base, relationship

    Base = declarative_base()

    class SkillCategory(Base):
        __tablename__ = "skill_categories"
        __table_args__ = {"schema": "public"}

        id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
        name = Column(Text, nullable=False, unique=True)
        created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    class Profile(Base):
        __tablename__ = "profiles"
        __table_args__ = (
            CheckConstraint("char_length(trim(display_name)) BETWEEN 1 AND 80", name="chk_profiles_display_name"),
            CheckConstraint("char_length(bio) <= 1000", name="chk_profiles_bio_len"),
            CheckConstraint("profile_visibility IN ('public', 'private')", name="chk_profiles_visibility"),
            {"schema": "public"},
        )

        user_id = Column(UUID(as_uuid=True), primary_key=True)
        display_name = Column(Text, nullable=False)
        bio = Column(Text, nullable=False, default="")
        interests = Column(ARRAY(Text), nullable=False, default=list)
        learning_preferences = Column(ARRAY(Text), nullable=False, default=list)
        availability = Column(Text, nullable=True)
        profile_visibility = Column(Text, nullable=False, default="public")
        created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
        updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    class Skill(Base):
        __tablename__ = "skills"
        __table_args__ = (
            CheckConstraint("char_length(trim(skill_name)) BETWEEN 1 AND 100", name="chk_skills_name_len"),
            CheckConstraint("skill_type IN ('OFFERED', 'WANTED')", name="chk_skills_type"),
            CheckConstraint("proficiency_level IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')", name="chk_skills_proficiency"),
            CheckConstraint("char_length(description) <= 2000", name="chk_skills_desc_len"),
            Index("idx_skills_owner", "owner_user_id"),
            Index("idx_skills_name", "skill_name"),
            Index("idx_skills_category_type", "category_id", "skill_type"),
            {"schema": "public"},
        )

        id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
        owner_user_id = Column(UUID(as_uuid=True), ForeignKey("public.profiles.user_id", ondelete="CASCADE"), nullable=False)
        category_id = Column(UUID(as_uuid=True), ForeignKey("public.skill_categories.id", ondelete="SET NULL"), nullable=True)
        skill_name = Column(Text, nullable=False)
        skill_type = Column(Text, nullable=False)
        proficiency_level = Column(Text, nullable=False)
        description = Column(Text, nullable=False, default="")
        is_public = Column(Boolean, nullable=False, default=True)
        created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
        updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    class ExchangeRequest(Base):
        __tablename__ = "exchange_requests"
        __table_args__ = (
            CheckConstraint("char_length(message) <= 2000", name="chk_requests_msg_len"),
            CheckConstraint(
                "status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'COMPLETED', 'CANCELLED')",
                name="chk_requests_status",
            ),
            CheckConstraint("format IN ('ONLINE', 'IN_PERSON')", name="chk_requests_format"),
            CheckConstraint("requester_user_id <> receiver_user_id", name="chk_requests_distinct_users"),
            Index("idx_requests_requester", "requester_user_id", "status"),
            Index("idx_requests_receiver", "receiver_user_id", "status"),
            {"schema": "public"},
        )

        id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
        requester_user_id = Column(UUID(as_uuid=True), ForeignKey("public.profiles.user_id", ondelete="RESTRICT"), nullable=False)
        receiver_user_id = Column(UUID(as_uuid=True), ForeignKey("public.profiles.user_id", ondelete="RESTRICT"), nullable=False)
        offered_skill_id = Column(UUID(as_uuid=True), ForeignKey("public.skills.id", ondelete="RESTRICT"), nullable=False)
        wanted_skill_id = Column(UUID(as_uuid=True), ForeignKey("public.skills.id", ondelete="RESTRICT"), nullable=False)
        message = Column(Text, nullable=False, default="")
        status = Column(Text, nullable=False, default="PENDING")
        proposed_datetime = Column(DateTime(timezone=True), nullable=True)
        format = Column(Text, nullable=True)
        created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
        updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    class ExchangeSession(Base):
        __tablename__ = "exchange_sessions"
        __table_args__ = (
            CheckConstraint("session_format IN ('ONLINE', 'IN_PERSON')", name="chk_sessions_format"),
            CheckConstraint(
                "session_status IN ('PROPOSED', 'SCHEDULED', 'COMPLETED', 'CANCELLED')",
                name="chk_sessions_status",
            ),
            CheckConstraint(
                "completion_status IN ('NOT_COMPLETED', 'COMPLETED')",
                name="chk_sessions_completion_status",
            ),
            CheckConstraint("char_length(notes) <= 3000", name="chk_sessions_notes_len"),
            CheckConstraint(
                "(completion_status = 'COMPLETED' AND completed_at IS NOT NULL) OR (completion_status = 'NOT_COMPLETED' AND completed_at IS NULL)",
                name="chk_sessions_completed_timestamp",
            ),
            {"schema": "public"},
        )

        id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
        request_id = Column(UUID(as_uuid=True), ForeignKey("public.exchange_requests.id", ondelete="RESTRICT"), nullable=False, unique=True)
        scheduled_datetime = Column(DateTime(timezone=True), nullable=True)
        session_format = Column(Text, nullable=True)
        session_status = Column(Text, nullable=False, default="PROPOSED")
        completion_status = Column(Text, nullable=False, default="NOT_COMPLETED")
        notes = Column(Text, nullable=False, default="")
        completed_at = Column(DateTime(timezone=True), nullable=True)
        created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
        updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    class Review(Base):
        __tablename__ = "reviews"
        __table_args__ = (
            CheckConstraint("rating BETWEEN 1 AND 5", name="chk_reviews_rating"),
            CheckConstraint("char_length(comment) <= 2000", name="chk_reviews_comment_len"),
            CheckConstraint("reviewer_user_id <> reviewee_user_id", name="chk_reviews_distinct_users"),
            UniqueConstraint("session_id", "reviewer_user_id", name="uq_reviews_session_reviewer"),
            Index("idx_reviews_reviewee", "reviewee_user_id"),
            {"schema": "public"},
        )

        id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
        session_id = Column(UUID(as_uuid=True), ForeignKey("public.exchange_sessions.id", ondelete="RESTRICT"), nullable=False)
        reviewer_user_id = Column(UUID(as_uuid=True), ForeignKey("public.profiles.user_id", ondelete="RESTRICT"), nullable=False)
        reviewee_user_id = Column(UUID(as_uuid=True), ForeignKey("public.profiles.user_id", ondelete="RESTRICT"), nullable=False)
        rating = Column(SmallInteger, nullable=False)
        comment = Column(Text, nullable=False, default="")
        created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    class LearningPlan(Base):
        __tablename__ = "learning_plans"
        __table_args__ = (
            CheckConstraint("char_length(trim(target_skill)) BETWEEN 1 AND 100", name="chk_learning_plans_skill_len"),
            Index("idx_learning_plans_user", "user_id"),
            {"schema": "public"},
        )

        id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
        user_id = Column(UUID(as_uuid=True), ForeignKey("public.profiles.user_id", ondelete="CASCADE"), nullable=False)
        target_skill = Column(Text, nullable=False)
        plan_content = Column(JSONB, nullable=False)
        created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
        updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

except ImportError:
    Base = None
