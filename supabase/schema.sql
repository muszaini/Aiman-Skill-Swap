-- SkillSwap Production Schema for Supabase PostgreSQL
-- Run this migration in the Supabase SQL Editor or via psql $DATABASE_URL -f supabase/schema.sql

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  handle VARCHAR(80) NOT NULL UNIQUE,
  email VARCHAR(180) UNIQUE,
  password_hash TEXT NOT NULL,
  role_title VARCHAR(160) NOT NULL,
  bio TEXT NOT NULL,
  interests JSONB NOT NULL DEFAULT '["Peer Learning"]'::jsonb,
  avatar_initials VARCHAR(6) NOT NULL,
  avatar_bg VARCHAR(24) NOT NULL DEFAULT '#0F766E',
  location VARCHAR(120) NOT NULL DEFAULT 'Remote',
  timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
  availability JSONB NOT NULL DEFAULT '["Weekday Evenings", "Saturday Mornings"]'::jsonb,
  preferred_format VARCHAR(120) NOT NULL DEFAULT 'Online' CHECK (preferred_format IN ('Online', 'In person', 'Either')),
  session_length_mins INTEGER NOT NULL DEFAULT 60,
  languages JSONB NOT NULL DEFAULT '["English"]'::jsonb,
  rating NUMERIC(3,2) NOT NULL DEFAULT 5.00,
  completed_swaps_count INTEGER NOT NULL DEFAULT 0,
  hours_exchanged NUMERIC(6,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table 1: profiles (Display name, bio, interests, learning preferences, and availability)
CREATE TABLE IF NOT EXISTS profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  display_name VARCHAR(120) NOT NULL,
  handle VARCHAR(80) NOT NULL UNIQUE,
  role_title VARCHAR(160) NOT NULL,
  bio TEXT NOT NULL,
  interests JSONB NOT NULL DEFAULT '["Peer Learning"]'::jsonb,
  preferred_format VARCHAR(120) NOT NULL DEFAULT 'Online' CHECK (preferred_format IN ('Online', 'In person', 'Either')),
  availability JSONB NOT NULL DEFAULT '["Weekday Evenings", "Saturday Mornings"]'::jsonb,
  location VARCHAR(120) NOT NULL DEFAULT 'Remote',
  timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
  session_length_mins INTEGER NOT NULL DEFAULT 60,
  languages JSONB NOT NULL DEFAULT '["English"]'::jsonb,
  avatar_initials VARCHAR(6) NOT NULL DEFAULT 'SS',
  avatar_bg VARCHAR(24) NOT NULL DEFAULT '#0F766E',
  rating NUMERIC(3,2) NOT NULL DEFAULT 5.00,
  completed_swaps_count INTEGER NOT NULL DEFAULT 0,
  hours_exchanged NUMERIC(6,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table 2: skills (Reusable skill names and categories)
CREATE TABLE IF NOT EXISTS skills (
  id SERIAL PRIMARY KEY,
  name VARCHAR(140) NOT NULL UNIQUE,
  category VARCHAR(80) NOT NULL CHECK (category IN ('Technology', 'Business', 'Design', 'Languages')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token VARCHAR(128) PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table 3: user_skills (Connects users to skills they teach or want to learn, including proficiency)
CREATE TABLE IF NOT EXISTS user_skills (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id INTEGER REFERENCES skills(id) ON DELETE SET NULL,
  type VARCHAR(16) NOT NULL CHECK (type IN ('offer', 'want')),
  skill_name VARCHAR(140) NOT NULL,
  category VARCHAR(80) NOT NULL CHECK (category IN ('Technology', 'Business', 'Design', 'Languages')),
  proficiency VARCHAR(32) NOT NULL DEFAULT 'Intermediate' CHECK (proficiency IN ('Beginner', 'Intermediate', 'Advanced', 'Expert')),
  level VARCHAR(32) NOT NULL CHECK (level IN ('Beginner', 'Intermediate', 'Advanced', 'Expert')),
  description TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_user_skills_user_id ON user_skills(user_id);
CREATE INDEX IF NOT EXISTS idx_user_skills_skill_id ON user_skills(skill_id);
CREATE INDEX IF NOT EXISTS idx_user_skills_type ON user_skills(type);

-- Table 4: exchange_requests (Stores exchange requests, session scheduling, ratings/reviews, and status)
CREATE TABLE IF NOT EXISTS exchange_requests (
  id SERIAL PRIMARY KEY,
  requester_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  offered_skill_id INTEGER REFERENCES skills(id) ON DELETE SET NULL,
  wanted_skill_id INTEGER REFERENCES skills(id) ON DELETE SET NULL,
  offered_skill_name VARCHAR(140) NOT NULL,
  wanted_skill_name VARCHAR(140) NOT NULL,
  proposed_slot VARCHAR(160) NOT NULL,
  duration_mins INTEGER NOT NULL DEFAULT 60,
  format VARCHAR(120) NOT NULL DEFAULT 'Online',
  session_datetime VARCHAR(160) NOT NULL DEFAULT '',
  session_mode VARCHAR(32) NOT NULL DEFAULT 'Online' CHECK (session_mode IN ('Online', 'In person')),
  meeting_link_or_location TEXT NOT NULL DEFAULT '',
  session_notes TEXT NOT NULL DEFAULT '',
  schedule_status VARCHAR(24) NOT NULL DEFAULT 'proposed' CHECK (schedule_status IN ('proposed', 'agreed')),
  rating_given INTEGER CHECK (rating_given BETWEEN 1 AND 5),
  review_comment TEXT NOT NULL DEFAULT '',
  learning_goal TEXT NOT NULL,
  message TEXT NOT NULL,
  ai_match_score INTEGER NOT NULL DEFAULT 92,
  ai_match_rationale TEXT NOT NULL DEFAULT '',
  ai_session_agenda JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(24) NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'completed', 'cancelled')) DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exchange_requests_participants ON exchange_requests(requester_id, recipient_id);

CREATE TABLE IF NOT EXISTS swap_requests (
  id SERIAL PRIMARY KEY,
  requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  offered_skill_name VARCHAR(140) NOT NULL,
  wanted_skill_name VARCHAR(140) NOT NULL,
  proposed_slot VARCHAR(160) NOT NULL,
  duration_mins INTEGER NOT NULL DEFAULT 60,
  format VARCHAR(120) NOT NULL DEFAULT '1-on-1 Live Video + Screen Share',
  session_datetime VARCHAR(160) NOT NULL DEFAULT '',
  session_mode VARCHAR(32) NOT NULL DEFAULT 'Online' CHECK (session_mode IN ('Online', 'In person')),
  meeting_link_or_location TEXT NOT NULL DEFAULT '',
  session_notes TEXT NOT NULL DEFAULT '',
  schedule_status VARCHAR(24) NOT NULL DEFAULT 'proposed' CHECK (schedule_status IN ('proposed', 'agreed')),
  rating_given INTEGER CHECK (rating_given BETWEEN 1 AND 5),
  review_comment TEXT NOT NULL DEFAULT '',
  learning_goal TEXT NOT NULL,
  message TEXT NOT NULL,
  ai_match_score INTEGER NOT NULL DEFAULT 92,
  ai_match_rationale TEXT NOT NULL DEFAULT '',
  ai_session_agenda JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(24) NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'completed', 'cancelled')) DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_swap_requests_participants ON swap_requests(requester_id, recipient_id);

CREATE TABLE IF NOT EXISTS completed_exchanges (
  id SERIAL PRIMARY KEY,
  request_id INTEGER REFERENCES swap_requests(id) ON DELETE SET NULL,
  partner_a_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  partner_b_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_a_taught VARCHAR(140) NOT NULL,
  skill_b_taught VARCHAR(140) NOT NULL,
  duration_mins INTEGER NOT NULL DEFAULT 60,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  summary_notes TEXT NOT NULL,
  takeaways JSONB NOT NULL DEFAULT '[]'::jsonb,
  rating_given INTEGER NOT NULL CHECK (rating_given BETWEEN 1 AND 5) DEFAULT 5,
  testimonial TEXT NOT NULL,
  verified_badge VARCHAR(80) NOT NULL DEFAULT 'Verified 1-to-1 Reciprocal Swap'
);


-- ============================================================================
-- SUPABASE POSTGRESQL ROW-LEVEL SECURITY (RLS) POLICIES
-- Enforces database-level privacy and ownership authorization
-- ============================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE swap_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE completed_exchanges ENABLE ROW LEVEL SECURITY;

-- Public read for community discovery on profiles, skills & user_skills; owner-only write
CREATE POLICY profiles_public_read ON profiles FOR SELECT USING (true);
CREATE POLICY profiles_owner_update ON profiles FOR UPDATE
  USING (current_setting('app.current_user_id', true)::int = user_id);

CREATE POLICY reusable_skills_public_read ON skills FOR SELECT USING (true);

CREATE POLICY users_public_read ON users FOR SELECT USING (true);
CREATE POLICY users_owner_update ON users FOR UPDATE
  USING (current_setting('app.current_user_id', true)::int = id);

CREATE POLICY skills_public_read ON user_skills FOR SELECT USING (true);
CREATE POLICY skills_owner_write ON user_skills FOR ALL
  USING (current_setting('app.current_user_id', true)::int = user_id);

-- Private access control on exchange_requests: only requester or recipient can read/modify
CREATE POLICY exchange_requests_participant_select ON exchange_requests FOR SELECT
  USING (
    current_setting('app.current_user_id', true)::int = requester_id
    OR current_setting('app.current_user_id', true)::int = recipient_id
  );

CREATE POLICY exchange_requests_requester_insert ON exchange_requests FOR INSERT
  WITH CHECK (current_setting('app.current_user_id', true)::int = requester_id);

CREATE POLICY exchange_requests_participant_update ON exchange_requests FOR UPDATE
  USING (
    current_setting('app.current_user_id', true)::int = requester_id
    OR current_setting('app.current_user_id', true)::int = recipient_id
  );

-- Private access control on swap_requests: only requester or recipient can read/modify
CREATE POLICY swap_requests_participant_select ON swap_requests FOR SELECT
  USING (
    current_setting('app.current_user_id', true)::int = requester_id
    OR current_setting('app.current_user_id', true)::int = recipient_id
  );

CREATE POLICY swap_requests_requester_insert ON swap_requests FOR INSERT
  WITH CHECK (current_setting('app.current_user_id', true)::int = requester_id);

CREATE POLICY swap_requests_participant_update ON swap_requests FOR UPDATE
  USING (
    current_setting('app.current_user_id', true)::int = requester_id
    OR current_setting('app.current_user_id', true)::int = recipient_id
  );

-- Completed exchanges: public portfolio read, participant-only insert
CREATE POLICY completed_exchanges_public_read ON completed_exchanges FOR SELECT USING (true);
CREATE POLICY completed_exchanges_participant_insert ON completed_exchanges FOR INSERT
  WITH CHECK (
    current_setting('app.current_user_id', true)::int = partner_a_id
    OR current_setting('app.current_user_id', true)::int = partner_b_id
  );
