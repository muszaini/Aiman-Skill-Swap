CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Skill categories
CREATE TABLE public.skill_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Member profiles
CREATE TABLE public.profiles (
    user_id UUID PRIMARY KEY
        REFERENCES auth.users(id) ON DELETE CASCADE,

    display_name TEXT NOT NULL
        CHECK (char_length(trim(display_name)) BETWEEN 1 AND 80),

    bio TEXT NOT NULL DEFAULT ''
        CHECK (char_length(bio) <= 1000),

    interests TEXT[] NOT NULL DEFAULT '{}',
    learning_preferences TEXT[] NOT NULL DEFAULT '{}',
    availability TEXT,
    profile_visibility TEXT NOT NULL DEFAULT 'public'
        CHECK (profile_visibility IN ('public', 'private')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Skill listings: one row per offered or wanted skill
CREATE TABLE public.skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    owner_user_id UUID NOT NULL
        REFERENCES public.profiles(user_id) ON DELETE CASCADE,

    category_id UUID
        REFERENCES public.skill_categories(id) ON DELETE SET NULL,

    skill_name TEXT NOT NULL
        CHECK (char_length(trim(skill_name)) BETWEEN 1 AND 100),

    skill_type TEXT NOT NULL
        CHECK (skill_type IN ('OFFERED', 'WANTED')),

    proficiency_level TEXT NOT NULL
        CHECK (
            proficiency_level IN (
                'BEGINNER',
                'INTERMEDIATE',
                'ADVANCED'
            )
        ),

    description TEXT NOT NULL DEFAULT ''
        CHECK (char_length(description) <= 2000),

    is_public BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_skills_owner
    ON public.skills(owner_user_id);

CREATE INDEX idx_skills_name
    ON public.skills(skill_name);

CREATE INDEX idx_skills_category_type
    ON public.skills(category_id, skill_type);

-- 4. Exchange requests
CREATE TABLE public.exchange_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    requester_user_id UUID NOT NULL
        REFERENCES public.profiles(user_id) ON DELETE RESTRICT,

    receiver_user_id UUID NOT NULL
        REFERENCES public.profiles(user_id) ON DELETE RESTRICT,

    offered_skill_id UUID NOT NULL
        REFERENCES public.skills(id) ON DELETE RESTRICT,

    wanted_skill_id UUID NOT NULL
        REFERENCES public.skills(id) ON DELETE RESTRICT,

    message TEXT NOT NULL DEFAULT ''
        CHECK (char_length(message) <= 2000),

    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (
            status IN (
                'PENDING',
                'ACCEPTED',
                'DECLINED',
                'COMPLETED',
                'CANCELLED'
            )
        ),

    proposed_datetime TIMESTAMPTZ,
    format TEXT
        CHECK (format IN ('ONLINE', 'IN_PERSON')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CHECK (requester_user_id <> receiver_user_id)
);

CREATE INDEX idx_requests_requester
    ON public.exchange_requests(requester_user_id, status);

CREATE INDEX idx_requests_receiver
    ON public.exchange_requests(receiver_user_id, status);

-- 5. Exchange sessions
CREATE TABLE public.exchange_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    request_id UUID NOT NULL UNIQUE
        REFERENCES public.exchange_requests(id) ON DELETE RESTRICT,

    scheduled_datetime TIMESTAMPTZ,
    session_format TEXT
        CHECK (session_format IN ('ONLINE', 'IN_PERSON')),

    session_status TEXT NOT NULL DEFAULT 'PROPOSED'
        CHECK (
            session_status IN (
                'PROPOSED',
                'SCHEDULED',
                'COMPLETED',
                'CANCELLED'
            )
        ),

    completion_status TEXT NOT NULL DEFAULT 'NOT_COMPLETED'
        CHECK (
            completion_status IN (
                'NOT_COMPLETED',
                'COMPLETED'
            )
        ),

    notes TEXT NOT NULL DEFAULT ''
        CHECK (char_length(notes) <= 3000),

    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CHECK (
        (completion_status = 'COMPLETED' AND completed_at IS NOT NULL)
        OR
        (completion_status = 'NOT_COMPLETED' AND completed_at IS NULL)
    )
);

-- 6. Reviews
CREATE TABLE public.reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    session_id UUID NOT NULL
        REFERENCES public.exchange_sessions(id) ON DELETE RESTRICT,

    reviewer_user_id UUID NOT NULL
        REFERENCES public.profiles(user_id) ON DELETE RESTRICT,

    reviewee_user_id UUID NOT NULL
        REFERENCES public.profiles(user_id) ON DELETE RESTRICT,

    rating SMALLINT NOT NULL
        CHECK (rating BETWEEN 1 AND 5),

    comment TEXT NOT NULL DEFAULT ''
        CHECK (char_length(comment) <= 2000),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CHECK (reviewer_user_id <> reviewee_user_id),

    UNIQUE (session_id, reviewer_user_id)
);

CREATE INDEX idx_reviews_reviewee
    ON public.reviews(reviewee_user_id);

-- 7. Optional AI learning plans
CREATE TABLE public.learning_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES public.profiles(user_id) ON DELETE CASCADE,

    target_skill TEXT NOT NULL
        CHECK (char_length(trim(target_skill)) BETWEEN 1 AND 100),

    plan_content JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_learning_plans_user
    ON public.learning_plans(user_id);

-- =============================================================================
-- ROW-LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_plans ENABLE ROW LEVEL SECURITY;

-- 1. profiles RLS (public profiles visible to all; private profiles visible only to owner)
CREATE POLICY "Public profiles are viewable by authenticated users"
ON public.profiles
FOR SELECT
TO authenticated
USING (profile_visibility = 'public' OR user_id = (SELECT auth.uid()));

CREATE POLICY "Users insert their own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users delete their own profile"
ON public.profiles
FOR DELETE
TO authenticated
USING (user_id = (SELECT auth.uid()));

-- 3. skills RLS (owner can manage own listings and cannot transfer owner_user_id)
CREATE POLICY "Public skills are viewable by authenticated users"
ON public.skills
FOR SELECT
TO authenticated
USING (is_public = true OR owner_user_id = (SELECT auth.uid()));

CREATE POLICY "Users create their own skills"
ON public.skills
FOR INSERT
TO authenticated
WITH CHECK (
    owner_user_id = (SELECT auth.uid())
);

CREATE POLICY "Users update their own skills"
ON public.skills
FOR UPDATE
TO authenticated
USING (owner_user_id = (SELECT auth.uid()))
WITH CHECK (owner_user_id = (SELECT auth.uid()));

CREATE POLICY "Users delete their own skills"
ON public.skills
FOR DELETE
TO authenticated
USING (owner_user_id = (SELECT auth.uid()));

-- 4. exchange_requests RLS (only requester can create; only requester/receiver can view or update)
CREATE POLICY "Participants view their exchange requests"
ON public.exchange_requests
FOR SELECT
TO authenticated
USING (
    requester_user_id = (SELECT auth.uid())
    OR receiver_user_id = (SELECT auth.uid())
);

CREATE POLICY "Requesters create exchange requests in their own name"
ON public.exchange_requests
FOR INSERT
TO authenticated
WITH CHECK (
    requester_user_id = (SELECT auth.uid())
    AND requester_user_id <> receiver_user_id
);

CREATE POLICY "Participants update their exchange requests"
ON public.exchange_requests
FOR UPDATE
TO authenticated
USING (
    requester_user_id = (SELECT auth.uid())
    OR receiver_user_id = (SELECT auth.uid())
)
WITH CHECK (
    requester_user_id = (SELECT auth.uid())
    OR receiver_user_id = (SELECT auth.uid())
);

-- 5. exchange_sessions RLS (only participants of the linked exchange_request can view or update)
CREATE POLICY "Participants view their exchange sessions"
ON public.exchange_sessions
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.exchange_requests er
        WHERE er.id = request_id
          AND (
              er.requester_user_id = (SELECT auth.uid())
              OR er.receiver_user_id = (SELECT auth.uid())
          )
    )
);

CREATE POLICY "Participants insert exchange sessions"
ON public.exchange_sessions
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.exchange_requests er
        WHERE er.id = request_id
          AND (
              er.requester_user_id = (SELECT auth.uid())
              OR er.receiver_user_id = (SELECT auth.uid())
          )
    )
);

CREATE POLICY "Participants update exchange sessions"
ON public.exchange_sessions
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.exchange_requests er
        WHERE er.id = request_id
          AND (
              er.requester_user_id = (SELECT auth.uid())
              OR er.receiver_user_id = (SELECT auth.uid())
          )
    )
);

-- 6. reviews RLS (only participants of a COMPLETED session can insert a review for the other participant)
CREATE POLICY "Reviews are viewable by authenticated users"
ON public.reviews
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "reviews_insert_completed_participant"
ON public.reviews
FOR INSERT
TO authenticated
WITH CHECK (
    reviewer_user_id = (SELECT auth.uid())
    AND reviewer_user_id <> reviewee_user_id
    AND EXISTS (
        SELECT 1
        FROM public.exchange_sessions es
        JOIN public.exchange_requests er ON er.id = es.request_id
        WHERE es.id = session_id
          AND es.completion_status = 'COMPLETED'
          AND (
              (er.requester_user_id = reviewer_user_id AND er.receiver_user_id = reviewee_user_id)
              OR (er.receiver_user_id = reviewer_user_id AND er.requester_user_id = reviewee_user_id)
          )
    )
);

-- 7. learning_plans RLS (strictly private to owner)
CREATE POLICY "Users view their own learning plans"
ON public.learning_plans
FOR SELECT
TO authenticated
USING (
    user_id = (SELECT auth.uid())
);

CREATE POLICY "Users create their own learning plans"
ON public.learning_plans
FOR INSERT
TO authenticated
WITH CHECK (
    user_id = (SELECT auth.uid())
);

CREATE POLICY "Users update their own learning plans"
ON public.learning_plans
FOR UPDATE
TO authenticated
USING (
    user_id = (SELECT auth.uid())
)
WITH CHECK (
    user_id = (SELECT auth.uid())
);

CREATE POLICY "Users delete their own learning plans"
ON public.learning_plans
FOR DELETE
TO authenticated
USING (
    user_id = (SELECT auth.uid())
);
