const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const path = require('node:path');

const DB_PATH = path.join(__dirname, 'skillswap.db');
const db = new DatabaseSync(DB_PATH);

// Enable WAL and foreign keys
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
`);

function hashPassword(password) {
  const salt = 'skillswap_atelier_salt_v1';
  return crypto.scryptSync(String(password), salt, 32).toString('hex');
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      handle TEXT NOT NULL UNIQUE,
      email TEXT UNIQUE,
      password_hash TEXT,
      role_title TEXT NOT NULL,
      bio TEXT NOT NULL,
      interests TEXT NOT NULL DEFAULT '[]', -- JSON array of public interests
      avatar_initials TEXT NOT NULL,
      avatar_bg TEXT NOT NULL,
      location TEXT NOT NULL,
      timezone TEXT NOT NULL,
      availability TEXT NOT NULL, -- JSON array
      preferred_format TEXT NOT NULL DEFAULT 'Online', -- 'Online' | 'In person' | 'Either'
      session_length_mins INTEGER NOT NULL DEFAULT 60,
      languages TEXT NOT NULL, -- JSON array
      rating REAL NOT NULL DEFAULT 5.0,
      completed_swaps_count INTEGER NOT NULL DEFAULT 0,
      hours_exchanged REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Table 1: profiles (Display name, bio, interests, learning preferences, and availability)
    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      handle TEXT NOT NULL UNIQUE,
      role_title TEXT NOT NULL,
      bio TEXT NOT NULL,
      interests TEXT NOT NULL DEFAULT '[]', -- JSON array of public interests
      preferred_format TEXT NOT NULL DEFAULT 'Online', -- 'Online' | 'In person' | 'Either'
      availability TEXT NOT NULL DEFAULT '[]', -- JSON array of preferred days/times
      location TEXT NOT NULL DEFAULT 'Remote',
      timezone TEXT NOT NULL DEFAULT 'UTC',
      session_length_mins INTEGER NOT NULL DEFAULT 60,
      languages TEXT NOT NULL DEFAULT '["English"]',
      avatar_initials TEXT NOT NULL DEFAULT 'SS',
      avatar_bg TEXT NOT NULL DEFAULT '#0F766E',
      rating REAL NOT NULL DEFAULT 5.0,
      completed_swaps_count INTEGER NOT NULL DEFAULT 0,
      hours_exchanged REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Table 2: skills (Reusable skill names and categories)
    CREATE TABLE IF NOT EXISTS skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL CHECK(category IN ('Technology', 'Business', 'Design', 'Languages')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Table 3: user_skills (Connects users to skills they teach or want to learn, including proficiency)
    CREATE TABLE IF NOT EXISTS user_skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      skill_id INTEGER REFERENCES skills(id) ON DELETE SET NULL,
      type TEXT NOT NULL CHECK(type IN ('offer', 'want')),
      skill_name TEXT NOT NULL,
      category TEXT NOT NULL,
      proficiency TEXT NOT NULL DEFAULT 'Intermediate',
      level TEXT NOT NULL,
      description TEXT NOT NULL,
      tags TEXT NOT NULL, -- JSON array
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS swap_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requester_id INTEGER NOT NULL,
      recipient_id INTEGER NOT NULL,
      offered_skill_name TEXT NOT NULL,
      wanted_skill_name TEXT NOT NULL,
      proposed_slot TEXT NOT NULL,
      duration_mins INTEGER NOT NULL DEFAULT 60,
      format TEXT NOT NULL DEFAULT 'Online',
      learning_goal TEXT NOT NULL,
      message TEXT NOT NULL,
      ai_match_score INTEGER NOT NULL DEFAULT 92,
      ai_match_rationale TEXT NOT NULL DEFAULT '',
      ai_session_agenda TEXT NOT NULL DEFAULT '[]', -- JSON array
      status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'declined', 'completed', 'cancelled')) DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Table 4: exchange_requests (Stores exchange requests and their status)
    CREATE TABLE IF NOT EXISTS exchange_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requester_id INTEGER NOT NULL,
      recipient_id INTEGER NOT NULL,
      offered_skill_id INTEGER REFERENCES skills(id) ON DELETE SET NULL,
      wanted_skill_id INTEGER REFERENCES skills(id) ON DELETE SET NULL,
      offered_skill_name TEXT NOT NULL,
      wanted_skill_name TEXT NOT NULL,
      proposed_slot TEXT NOT NULL,
      duration_mins INTEGER NOT NULL DEFAULT 60,
      format TEXT NOT NULL DEFAULT 'Online',
      learning_goal TEXT NOT NULL,
      message TEXT NOT NULL,
      ai_match_score INTEGER NOT NULL DEFAULT 92,
      ai_match_rationale TEXT NOT NULL DEFAULT '',
      ai_session_agenda TEXT NOT NULL DEFAULT '[]', -- JSON array
      status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'declined', 'completed', 'cancelled')) DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (requester_id) REFERENCES profiles(id) ON DELETE CASCADE,
      FOREIGN KEY (recipient_id) REFERENCES profiles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS completed_exchanges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER,
      partner_a_id INTEGER NOT NULL,
      partner_b_id INTEGER NOT NULL,
      skill_a_taught TEXT NOT NULL,
      skill_b_taught TEXT NOT NULL,
      duration_mins INTEGER NOT NULL DEFAULT 60,
      completed_at TEXT NOT NULL DEFAULT (datetime('now')),
      summary_notes TEXT NOT NULL,
      takeaways TEXT NOT NULL DEFAULT '[]', -- JSON array
      rating_given INTEGER NOT NULL DEFAULT 5,
      testimonial TEXT NOT NULL,
      verified_badge TEXT NOT NULL DEFAULT 'Verified Reciprocal Swap',
      FOREIGN KEY (partner_a_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (partner_b_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Table 5: reviews (Participant-only reviews for completed sessions with uniqueness & self-review checks)
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL,
      reviewer_id INTEGER NOT NULL,
      reviewee_id INTEGER NOT NULL,
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      comment TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK(reviewer_id <> reviewee_id),
      UNIQUE(request_id, reviewer_id),
      FOREIGN KEY (request_id) REFERENCES swap_requests(id) ON DELETE CASCADE,
      FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (reviewee_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Table 7: skill_categories (Reusable skill category catalog)
    CREATE TABLE IF NOT EXISTS skill_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Table 8: exchange_sessions (1-to-1 session scheduling & completion tracking per exchange request)
    CREATE TABLE IF NOT EXISTS exchange_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL UNIQUE,
      scheduled_datetime TEXT,
      session_format TEXT CHECK(session_format IN ('ONLINE', 'IN_PERSON')),
      session_status TEXT NOT NULL DEFAULT 'PROPOSED' CHECK(session_status IN ('PROPOSED', 'SCHEDULED', 'COMPLETED', 'CANCELLED')),
      completion_status TEXT NOT NULL DEFAULT 'NOT_COMPLETED' CHECK(completion_status IN ('NOT_COMPLETED', 'COMPLETED')),
      notes TEXT NOT NULL DEFAULT '' CHECK(length(notes) <= 3000),
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (
        (completion_status = 'COMPLETED' AND completed_at IS NOT NULL)
        OR
        (completion_status = 'NOT_COMPLETED' AND completed_at IS NULL)
      ),
      FOREIGN KEY (request_id) REFERENCES exchange_requests(id) ON DELETE RESTRICT
    );

    -- Table 6: learning_plans (Flow E: AI-generated & user-reviewed learning plans, private to owner)
    CREATE TABLE IF NOT EXISTS learning_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      target_skill TEXT NOT NULL,
      learning_goals TEXT NOT NULL,
      preferred_format TEXT NOT NULL DEFAULT 'Online',
      plan_title TEXT NOT NULL,
      plan_content TEXT NOT NULL,
      milestones TEXT NOT NULL DEFAULT '[]', -- JSON array
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Ensure `interests` column exists on `users` if migrating an older DB file
  const userCols = db.prepare(`PRAGMA table_info(users)`).all();
  if (!userCols.some((c) => c.name === 'interests')) {
    db.exec(`ALTER TABLE users ADD COLUMN interests TEXT NOT NULL DEFAULT '[]';`);
  }

  // Ensure `skill_id` and `proficiency` columns exist on `user_skills` if migrating an older DB file
  const usCols = db.prepare(`PRAGMA table_info(user_skills)`).all();
  if (!usCols.some((c) => c.name === 'skill_id')) {
    db.exec(`ALTER TABLE user_skills ADD COLUMN skill_id INTEGER REFERENCES skills(id) ON DELETE SET NULL;`);
  }
  if (!usCols.some((c) => c.name === 'proficiency')) {
    db.exec(`ALTER TABLE user_skills ADD COLUMN proficiency TEXT NOT NULL DEFAULT 'Intermediate';`);
  }

  // Ensure session-scheduling and review columns exist on `swap_requests` and `exchange_requests`
  for (const tbl of ['swap_requests', 'exchange_requests']) {
    const reqCols = db.prepare(`PRAGMA table_info(${tbl})`).all();
    const colNames = new Set(reqCols.map((c) => c.name));
    if (!colNames.has('session_datetime')) {
      db.exec(`ALTER TABLE ${tbl} ADD COLUMN session_datetime TEXT NOT NULL DEFAULT '';`);
    }
    if (!colNames.has('session_mode')) {
      db.exec(`ALTER TABLE ${tbl} ADD COLUMN session_mode TEXT NOT NULL DEFAULT 'Online';`);
    }
    if (!colNames.has('meeting_link_or_location')) {
      db.exec(`ALTER TABLE ${tbl} ADD COLUMN meeting_link_or_location TEXT NOT NULL DEFAULT '';`);
    }
    if (!colNames.has('session_notes')) {
      db.exec(`ALTER TABLE ${tbl} ADD COLUMN session_notes TEXT NOT NULL DEFAULT '';`);
    }
    if (!colNames.has('schedule_status')) {
      db.exec(`ALTER TABLE ${tbl} ADD COLUMN schedule_status TEXT NOT NULL DEFAULT 'proposed';`);
    }
    if (!colNames.has('rating_given')) {
      db.exec(`ALTER TABLE ${tbl} ADD COLUMN rating_given INTEGER;`);
    }
    if (!colNames.has('review_comment')) {
      db.exec(`ALTER TABLE ${tbl} ADD COLUMN review_comment TEXT NOT NULL DEFAULT '';`);
    }
  }

  // Install automatic synchronization triggers between users <-> profiles and swap_requests <-> exchange_requests
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_users_after_insert
    AFTER INSERT ON users
    BEGIN
      INSERT OR REPLACE INTO profiles (
        id, user_id, display_name, handle, role_title, bio, interests, preferred_format,
        availability, location, timezone, session_length_mins, languages,
        avatar_initials, avatar_bg, rating, completed_swaps_count, hours_exchanged, created_at
      ) VALUES (
        NEW.id, NEW.id, NEW.name, NEW.handle, NEW.role_title, NEW.bio, NEW.interests, NEW.preferred_format,
        NEW.availability, NEW.location, NEW.timezone, NEW.session_length_mins, NEW.languages,
        NEW.avatar_initials, NEW.avatar_bg, NEW.rating, NEW.completed_swaps_count, NEW.hours_exchanged, NEW.created_at
      );
    END;

    DROP TRIGGER IF EXISTS trg_users_after_update;
    CREATE TRIGGER trg_users_after_update
    AFTER UPDATE ON users
    BEGIN
      INSERT INTO profiles (
        id, user_id, display_name, handle, role_title, bio, interests, preferred_format,
        availability, location, timezone, session_length_mins, languages,
        avatar_initials, avatar_bg, rating, completed_swaps_count, hours_exchanged, created_at
      ) VALUES (
        NEW.id, NEW.id, NEW.name, NEW.handle, NEW.role_title, NEW.bio, NEW.interests, NEW.preferred_format,
        NEW.availability, NEW.location, NEW.timezone, NEW.session_length_mins, NEW.languages,
        NEW.avatar_initials, NEW.avatar_bg, NEW.rating, NEW.completed_swaps_count, NEW.hours_exchanged, NEW.created_at
      )
      ON CONFLICT(id) DO UPDATE SET
        display_name = excluded.display_name,
        handle = excluded.handle,
        role_title = excluded.role_title,
        bio = excluded.bio,
        interests = excluded.interests,
        preferred_format = excluded.preferred_format,
        availability = excluded.availability,
        location = excluded.location,
        timezone = excluded.timezone,
        session_length_mins = excluded.session_length_mins,
        languages = excluded.languages,
        avatar_initials = excluded.avatar_initials,
        avatar_bg = excluded.avatar_bg,
        rating = excluded.rating,
        completed_swaps_count = excluded.completed_swaps_count,
        hours_exchanged = excluded.hours_exchanged;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_user_skills_after_insert
    AFTER INSERT ON user_skills
    BEGIN
      INSERT OR IGNORE INTO skills (name, category)
      VALUES (
        NEW.skill_name,
        CASE
          WHEN NEW.category IN ('Technology', 'Business', 'Design', 'Languages') THEN NEW.category
          ELSE 'Technology'
        END
      );
      UPDATE user_skills
      SET skill_id = (SELECT id FROM skills WHERE LOWER(name) = LOWER(NEW.skill_name) LIMIT 1),
          proficiency = COALESCE(NULLIF(NEW.proficiency, ''), NEW.level, 'Intermediate')
      WHERE id = NEW.id;
    END;

    DROP TRIGGER IF EXISTS trg_swap_requests_after_insert;
    CREATE TRIGGER trg_swap_requests_after_insert
    AFTER INSERT ON swap_requests
    BEGIN
      INSERT OR REPLACE INTO exchange_requests (
        id, requester_id, recipient_id, offered_skill_id, wanted_skill_id,
        offered_skill_name, wanted_skill_name, proposed_slot, duration_mins, format,
        session_datetime, session_mode, meeting_link_or_location, session_notes, schedule_status,
        rating_given, review_comment,
        learning_goal, message, ai_match_score, ai_match_rationale, ai_session_agenda,
        status, created_at, updated_at
      ) VALUES (
        NEW.id, NEW.requester_id, NEW.recipient_id,
        (SELECT id FROM skills WHERE LOWER(name) = LOWER(NEW.offered_skill_name) LIMIT 1),
        (SELECT id FROM skills WHERE LOWER(name) = LOWER(NEW.wanted_skill_name) LIMIT 1),
        NEW.offered_skill_name, NEW.wanted_skill_name, NEW.proposed_slot, NEW.duration_mins, NEW.format,
        NEW.session_datetime, NEW.session_mode, NEW.meeting_link_or_location, NEW.session_notes, NEW.schedule_status,
        NEW.rating_given, NEW.review_comment,
        NEW.learning_goal, NEW.message, NEW.ai_match_score, NEW.ai_match_rationale, NEW.ai_session_agenda,
        NEW.status, NEW.created_at, NEW.updated_at
      );
    END;

    DROP TRIGGER IF EXISTS trg_swap_requests_after_update;
    CREATE TRIGGER trg_swap_requests_after_update
    AFTER UPDATE ON swap_requests
    BEGIN
      UPDATE exchange_requests
      SET proposed_slot = NEW.proposed_slot,
          duration_mins = NEW.duration_mins,
          format = NEW.format,
          session_datetime = NEW.session_datetime,
          session_mode = NEW.session_mode,
          meeting_link_or_location = NEW.meeting_link_or_location,
          session_notes = NEW.session_notes,
          schedule_status = NEW.schedule_status,
          rating_given = NEW.rating_given,
          review_comment = NEW.review_comment,
          status = NEW.status,
          updated_at = NEW.updated_at
      WHERE id = NEW.id;
    END;
  `);
}

function normalizeCategory(rawCategory = '') {
  const c = String(rawCategory).trim();
  const lower = c.toLowerCase();
  if (lower.includes('tech') || lower.includes('program') || lower.includes('code') || lower.includes('python')) {
    return 'Technology';
  }
  if (
    lower.includes('business') ||
    lower.includes('excel') ||
    lower.includes('data') ||
    lower.includes('spreadsheet') ||
    lower.includes('product') ||
    lower.includes('finance')
  ) {
    return 'Business';
  }
  if (lower.includes('design') || lower.includes('creative')) {
    return 'Design';
  }
  if (lower.includes('language') || lower.includes('comm') || lower.includes('english')) {
    return 'Languages';
  }
  return ['Technology', 'Business', 'Design', 'Languages'].includes(c) ? c : 'Technology';
}

function normalizeProficiency(rawLevel = '', fallback = 'Intermediate') {
  const l = String(rawLevel).trim();
  const lower = l.toLowerCase();
  if (lower.startsWith('beg')) return 'Beginner';
  if (lower.startsWith('int')) return 'Intermediate';
  if (lower.startsWith('adv') || lower.startsWith('exp')) return 'Advanced';
  return fallback;
}

function ensureReusableSkill(skillName, rawCategory = 'Technology') {
  const cleanName = String(skillName || '').trim();
  if (!cleanName) return null;
  const normCat = normalizeCategory(rawCategory);
  db.prepare(`
    INSERT INTO skills (name, category)
    VALUES (?, ?)
    ON CONFLICT(name) DO UPDATE SET category = excluded.category
  `).run(cleanName, normCat);
  const row = db.prepare('SELECT id FROM skills WHERE LOWER(name) = LOWER(?) LIMIT 1').get(cleanName);
  return row ? Number(row.id) : null;
}

function syncRelationalTables() {
  // 1. Seed canonical reusable skills in `skills`
  const canonicalCatalog = [
    { name: 'Python', category: 'Technology' },
    { name: 'Excel', category: 'Business' },
    { name: 'Graphic design', category: 'Design' },
    { name: 'English conversation', category: 'Languages' }
  ];
  for (const item of canonicalCatalog) {
    ensureReusableSkill(item.name, item.category);
  }

  // 2. Sync all `users` into `profiles`
  const allUsers = db.prepare('SELECT * FROM users').all();
  const upsertProfile = db.prepare(`
    INSERT INTO profiles (
      id, user_id, display_name, handle, role_title, bio, interests, preferred_format,
      availability, location, timezone, session_length_mins, languages,
      avatar_initials, avatar_bg, rating, completed_swaps_count, hours_exchanged, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      display_name = excluded.display_name,
      handle = excluded.handle,
      role_title = excluded.role_title,
      bio = excluded.bio,
      interests = excluded.interests,
      preferred_format = excluded.preferred_format,
      availability = excluded.availability,
      location = excluded.location,
      timezone = excluded.timezone,
      session_length_mins = excluded.session_length_mins,
      languages = excluded.languages,
      avatar_initials = excluded.avatar_initials,
      avatar_bg = excluded.avatar_bg,
      rating = excluded.rating,
      completed_swaps_count = excluded.completed_swaps_count,
      hours_exchanged = excluded.hours_exchanged
  `);
  for (const u of allUsers) {
    upsertProfile.run(
      u.id,
      u.id,
      u.name,
      u.handle,
      u.role_title,
      u.bio,
      u.interests || '[]',
      u.preferred_format || 'Online',
      u.availability || '[]',
      u.location || 'Remote',
      u.timezone || 'UTC',
      u.session_length_mins || 60,
      u.languages || '["English"]',
      u.avatar_initials || 'SS',
      u.avatar_bg || '#0F766E',
      u.rating || 5.0,
      u.completed_swaps_count || 0,
      u.hours_exchanged || 0,
      u.created_at
    );
  }

  // 3. Normalize `user_skills` and link every row to `skills(id)` and `proficiency`
  const existingSkills = db.prepare('SELECT * FROM user_skills').all();
  const updateSkillStmt = db.prepare(`
    UPDATE user_skills
    SET skill_id = ?, category = ?, proficiency = ?, level = ?
    WHERE id = ?
  `);
  for (const s of existingSkills) {
    const normCat = normalizeCategory(s.category);
    const sLower = (s.skill_name || '').toLowerCase();
    let rawLvl = s.level || s.proficiency;
    // Ensure seeded canonical skills reflect Beginner, Intermediate, and Advanced proficiencies
    if (s.id <= 20) {
      if (sLower.includes('python')) {
        rawLvl = 'Beginner';
      } else if (sLower.includes('excel') || sLower.includes('english') || sLower.includes('italian')) {
        rawLvl = 'Intermediate';
      } else if (sLower.includes('graphic design') || sLower.includes('figma') || sLower.includes('brand') || sLower.includes('sql')) {
        rawLvl = 'Advanced';
      }
    }
    const normLvl = normalizeProficiency(rawLvl);
    const skillId = ensureReusableSkill(s.skill_name, normCat);
    updateSkillStmt.run(skillId, normCat, normLvl, normLvl, s.id);
  }

  // 4. Sync `swap_requests` into `exchange_requests` (and backfill session schedule fields if empty)
  const swapReqs = db.prepare('SELECT * FROM swap_requests').all();
  const backfillReqStmt = db.prepare(`
    UPDATE swap_requests
    SET session_datetime = ?,
        session_mode = ?,
        meeting_link_or_location = ?,
        session_notes = ?,
        schedule_status = ?
    WHERE id = ?
  `);
  const upsertExchangeReq = db.prepare(`
    INSERT INTO exchange_requests (
      id, requester_id, recipient_id, offered_skill_id, wanted_skill_id,
      offered_skill_name, wanted_skill_name, proposed_slot, duration_mins, format,
      session_datetime, session_mode, meeting_link_or_location, session_notes, schedule_status,
      rating_given, review_comment,
      learning_goal, message, ai_match_score, ai_match_rationale, ai_session_agenda,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      offered_skill_id = excluded.offered_skill_id,
      wanted_skill_id = excluded.wanted_skill_id,
      proposed_slot = excluded.proposed_slot,
      duration_mins = excluded.duration_mins,
      format = excluded.format,
      session_datetime = excluded.session_datetime,
      session_mode = excluded.session_mode,
      meeting_link_or_location = excluded.meeting_link_or_location,
      session_notes = excluded.session_notes,
      schedule_status = excluded.schedule_status,
      rating_given = excluded.rating_given,
      review_comment = excluded.review_comment,
      status = excluded.status,
      updated_at = excluded.updated_at
  `);
  for (const r of swapReqs) {
    const offeredId = ensureReusableSkill(r.offered_skill_name, r.offered_skill_name);
    const wantedId = ensureReusableSkill(r.wanted_skill_name, r.wanted_skill_name);
    const sessionDatetime = r.session_datetime || r.proposed_slot || 'Thursday, 6:30 PM – 7:30 PM';
    const sessionMode = ['Online', 'In person'].includes(r.session_mode)
      ? r.session_mode
      : (r.format || '').toLowerCase().includes('person')
      ? 'In person'
      : 'Online';
    const meetingLinkOrLocation =
      r.meeting_link_or_location ||
      (sessionMode === 'In person'
        ? 'Blue Bottle Coffee — Shared Studio Table'
        : `https://meet.skillswap.io/swap-room-${r.id}`);
    const sessionNotes =
      r.session_notes ||
      `50/50 split session: ${r.offered_skill_name} ⇄ ${r.wanted_skill_name}. ${r.learning_goal || ''}`.trim();
    const scheduleStatus =
      r.schedule_status === 'agreed' || r.status === 'accepted' || r.status === 'completed'
        ? 'agreed'
        : 'proposed';

    if (!r.session_datetime || !r.meeting_link_or_location) {
      backfillReqStmt.run(
        sessionDatetime,
        sessionMode,
        meetingLinkOrLocation,
        sessionNotes,
        scheduleStatus,
        r.id
      );
    }

    upsertExchangeReq.run(
      r.id,
      r.requester_id,
      r.recipient_id,
      offeredId,
      wantedId,
      r.offered_skill_name,
      r.wanted_skill_name,
      r.proposed_slot,
      r.duration_mins,
      r.format,
      sessionDatetime,
      sessionMode,
      meetingLinkOrLocation,
      sessionNotes,
      scheduleStatus,
      r.rating_given || null,
      r.review_comment || '',
      r.learning_goal,
      r.message,
      r.ai_match_score,
      r.ai_match_rationale,
      r.ai_session_agenda,
      r.status,
      r.created_at,
      r.updated_at
    );
  }

  // Clean up any leftover ephemeral test accounts if present
  db.prepare(`DELETE FROM users WHERE email LIKE 'test_a_%' OR email LIKE 'test_b_%' OR name LIKE 'Test User %'`).run();
  db.prepare(`DELETE FROM profiles WHERE user_id NOT IN (SELECT id FROM users)`).run();

  // Seed canonical skill_categories ('Design', 'Technology', 'Languages', 'Business')
  for (const catName of ['Design', 'Technology', 'Languages', 'Business']) {
    db.prepare(`INSERT OR IGNORE INTO skill_categories (name) VALUES (?)`).run(catName);
  }

  // Synchronize exchange_sessions with exchange_requests
  const allExReqs = db.prepare('SELECT * FROM exchange_requests').all();
  const upsertSession = db.prepare(`
    INSERT OR REPLACE INTO exchange_sessions (
      id, request_id, scheduled_datetime, session_format, session_status, completion_status, notes, completed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const er of allExReqs) {
    const isCompleted = er.status === 'completed';
    const isCancelled = er.status === 'cancelled' || er.status === 'declined';
    const isScheduled = er.schedule_status === 'agreed' || er.status === 'accepted';
    const sessionStatus = isCompleted
      ? 'COMPLETED'
      : isCancelled
      ? 'CANCELLED'
      : isScheduled
      ? 'SCHEDULED'
      : 'PROPOSED';
    const completionStatus = isCompleted ? 'COMPLETED' : 'NOT_COMPLETED';
    const sessionFormat = (er.session_mode || '').toLowerCase() === 'in person' ? 'IN_PERSON' : 'ONLINE';
    const completedAt = isCompleted ? er.updated_at || er.created_at : null;
    upsertSession.run(
      er.id,
      er.id,
      er.session_datetime || er.proposed_slot,
      sessionFormat,
      sessionStatus,
      completionStatus,
      (er.session_notes || er.learning_goal || '').slice(0, 3000),
      completedAt,
      er.created_at,
      er.updated_at
    );
  }

  // Ensure Maya Lin has at least 1 saved AI learning plan in `learning_plans` (Flow E)
  const existingPlansCount = db.prepare('SELECT COUNT(*) as count FROM learning_plans WHERE user_id = 1').get();
  if (!existingPlansCount || existingPlansCount.count === 0) {
    const mayaExists = db.prepare('SELECT id FROM users WHERE id = 1').get();
    if (mayaExists) {
      db.prepare(`
        INSERT INTO learning_plans (
          user_id, target_skill, learning_goals, preferred_format, plan_title, plan_content, milestones
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        1,
        'Beginner Python Lessons',
        'Transition from complex Excel formulas to Python scripts that clean CSV exports and automate weekly KPI reports.',
        'Online',
        '4-Week Reciprocal Learning Plan: Beginner Python Lessons for Spreadsheet Analysts',
        'Week 1: Environment Setup & Variables — Map Excel cell references to Python variables, lists, and dictionaries.\nWeek 2: DataFrames & CSV Automation — Replace VLOOKUP/XLOOKUP with pandas merge() and groupby() on real CSV exports.\nWeek 3: Reusable Functions & Loops — Convert repetitive multi-tab spreadsheet macros into clean Python scripts.\nWeek 4: Capstone Reciprocal Project — Run an end-to-end automated KPI report script during a live 1-on-1 review session.',
        JSON.stringify([
          { week: 'Week 1', title: 'Python Basics & Data Types', outcome: 'Run first .py script and map Excel tables to Python lists/dicts' },
          { week: 'Week 2', title: 'Pandas & CSV Cleanup', outcome: 'Automate XLOOKUP and Pivot Table summaries in pandas' },
          { week: 'Week 3', title: 'Functions & Workflow Automation', outcome: 'Write reusable functions to clean weekly financial exports' },
          { week: 'Week 4', title: 'Capstone Exchange Demonstration', outcome: 'Present working automation script to your SkillSwap partner' }
        ])
      );
    }
  }
}

function seedDatabase() {
  const countRow = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (countRow && countRow.count > 0) {
    // Backfill interests and normalized preferred_format if empty
    const existingUsers = db.prepare('SELECT id, handle, interests, preferred_format FROM users').all();
    const defaultInterestsMap = {
      mayalin: ['Financial Modeling', 'Editorial Design', 'Data Visualization', 'Specialty Coffee'],
      lucasdesign: ['Typography & Print', 'Brand Strategy', 'Indie Studio Ops', 'Architecture'],
      tariqdev: ['Open Source Python', 'Public Speaking', 'Data Engineering', 'Sci-Fi Literature'],
      kenjicode: ['Swiss Grids', 'Creative Coding', 'Motion Graphics', 'Synthesizers'],
      elenaproduct: ['SaaS Metrics', 'Design Systems', 'User Psychology', 'Ceramics'],
      sofiarossi: ['Data Journalism', 'Infographics', 'Italian Cinema', 'Investigative Reporting']
    };
    const defaultFormatMap = {
      mayalin: 'Online',
      lucasdesign: 'Either',
      tariqdev: 'Online',
      kenjicode: 'Either',
      elenaproduct: 'In person',
      sofiarossi: 'Online'
    };
    const updateStmt = db.prepare('UPDATE users SET interests = ?, preferred_format = ? WHERE id = ?');
    for (const u of existingUsers) {
      let parsedInt = [];
      try {
        parsedInt = JSON.parse(u.interests || '[]');
      } catch {
        parsedInt = [];
      }
      const nextInterests =
        parsedInt.length > 0
          ? parsedInt
          : defaultInterestsMap[u.handle] || ['Peer Learning', 'Skill Exchange', 'Creative Tech'];
      const nextFormat = ['Online', 'In person', 'Either'].includes(u.preferred_format)
        ? u.preferred_format
        : defaultFormatMap[u.handle] || 'Online';
      updateStmt.run(JSON.stringify(nextInterests), nextFormat, u.id);
    }

    // Normalize all existing skill categories to Technology | Business | Design | Languages
    const existingSkills = db.prepare('SELECT id, category, level FROM user_skills').all();
    const updateSkillStmt = db.prepare('UPDATE user_skills SET category = ?, level = ? WHERE id = ?');
    for (const s of existingSkills) {
      const normCat = normalizeCategory(s.category);
      const normLvl = normalizeProficiency(s.level);
      if (normCat !== s.category || normLvl !== s.level) {
        updateSkillStmt.run(normCat, normLvl, s.id);
      }
    }
    syncRelationalTables();
    return;
  }

  const defaultPassHash = hashPassword('skillswap123');

  const insertUser = db.prepare(`
    INSERT INTO users (
      name, handle, email, password_hash, role_title, bio, interests, avatar_initials, avatar_bg,
      location, timezone, availability, preferred_format,
      session_length_mins, languages, rating, completed_swaps_count, hours_exchanged
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertSkill = db.prepare(`
    INSERT INTO user_skills (
      user_id, type, skill_name, category, level, description, tags
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const seedUsers = [
    {
      name: 'Maya Lin',
      handle: 'mayalin',
      email: 'maya@skillswap.io',
      role_title: 'Senior Financial Analyst & Aspiring Visual Designer',
      bio: 'I spend my days building automated Excel models, dynamic dashboards, and KPI forecasts—and I love coaching others in conversational business English. Looking to trade spreadsheet mastery or English conversation for hands-on Graphic Design or Beginner Python lessons!',
      interests: JSON.stringify(['Financial Modeling', 'Editorial Design', 'Data Visualization', 'Specialty Coffee']),
      avatar_initials: 'ML',
      avatar_bg: '#0F766E',
      location: 'San Francisco, USA',
      timezone: 'UTC-7 (PDT)',
      availability: JSON.stringify(['Weekday Evenings', 'Saturday Mornings', 'Sunday Afternoons']),
      preferred_format: 'Online',
      session_length_mins: 60,
      languages: JSON.stringify(['English (Native)', 'Mandarin (Conversational)']),
      rating: 4.95,
      completed_swaps_count: 6,
      hours_exchanged: 7.5,
      skills: [
        {
          type: 'offer',
          skill_name: 'Excel & Spreadsheet Modeling',
          category: 'Business',
          level: 'Intermediate',
          description: 'Pivot tables, XLOOKUP/INDEX-MATCH, financial forecasting, PowerQuery cleanup, and executive dashboard design.',
          tags: JSON.stringify(['excel', 'spreadsheets', 'pivot tables', 'xlookup', 'financial modeling', 'data analysis', 'dashboards', 'formulas'])
        },
        {
          type: 'offer',
          skill_name: 'Conversational English Practice',
          category: 'Languages',
          level: 'Intermediate',
          description: 'Natural workplace idioms, tech interview roleplay, presentation storytelling, and pronunciation confidence.',
          tags: JSON.stringify(['conversational english', 'english conversation', 'english', 'speaking', 'communication', 'interview prep', 'idioms', 'fluency', 'language'])
        },
        {
          type: 'want',
          skill_name: 'Graphic Design & Visual Systems',
          category: 'Design',
          level: 'Advanced',
          description: 'Want to learn typography pairing, color hierarchy, grid layouts, and creating polished brand posters/decks in Figma or Illustrator.',
          tags: JSON.stringify(['graphic design', 'design', 'figma', 'typography', 'layout', 'branding', 'visual design', 'illustrator'])
        },
        {
          type: 'want',
          skill_name: 'Beginner Python Lessons',
          category: 'Technology',
          level: 'Beginner',
          description: 'Looking to transition from heavy Excel formulas to Python scripts—automating CSV cleanup, basic pandas, and writing clean functions.',
          tags: JSON.stringify(['python', 'beginner python', 'coding', 'programming', 'automation', 'pandas', 'data scripting'])
        }
      ]
    },
    {
      name: 'Lucas Rivera',
      handle: 'lucasdesign',
      email: 'lucas@skillswap.io',
      role_title: 'Independent Brand & Graphic Designer',
      bio: 'Art director with 7 years designing brand identities, editorial layouts, and Figma design systems. Since going freelance, my studio bookkeeping and client revenue tracking in Excel are a mess—would love to trade Graphic Design mentorship for practical Excel skills!',
      interests: JSON.stringify(['Typography & Print', 'Brand Strategy', 'Indie Studio Ops', 'Architecture']),
      avatar_initials: 'LR',
      avatar_bg: '#C2410C',
      location: 'Austin, USA',
      timezone: 'UTC-5 (CDT)',
      availability: JSON.stringify(['Weekday Evenings', 'Saturday Mornings']),
      preferred_format: 'Either',
      session_length_mins: 60,
      languages: JSON.stringify(['English (Fluent)', 'Spanish (Native)']),
      rating: 4.98,
      completed_swaps_count: 9,
      hours_exchanged: 11.0,
      skills: [
        {
          type: 'offer',
          skill_name: 'Graphic Design & Typography',
          category: 'Design',
          level: 'Advanced',
          description: 'Editorial layout grids, expressive typography, color systems, poster composition, and Figma auto-layout workflows.',
          tags: JSON.stringify(['graphic design', 'design', 'typography', 'figma', 'layout', 'branding', 'visual systems', 'illustrator'])
        },
        {
          type: 'offer',
          skill_name: 'Brand Identity & Deck Design',
          category: 'Design',
          level: 'Advanced',
          description: 'Turning dry presentations or concepts into cohesive visual narratives with custom vector assets.',
          tags: JSON.stringify(['branding', 'graphic design', 'presentations', 'visual storytelling', 'figma'])
        },
        {
          type: 'want',
          skill_name: 'Excel & Financial Tracking',
          category: 'Business',
          level: 'Intermediate',
          description: 'Need help organizing freelance invoices, building automated Pivot Table summaries, and mastering XLOOKUP formulas.',
          tags: JSON.stringify(['excel', 'spreadsheets', 'pivot tables', 'xlookup', 'financial modeling', 'bookkeeping', 'formulas'])
        }
      ]
    },
    {
      name: 'Tariq Al-Mansoor',
      handle: 'tariqdev',
      email: 'tariq@skillswap.io',
      role_title: 'Backend Software Engineer & Python Educator',
      bio: 'I build data pipelines in Python and mentor career-switchers on writing their first Python scripts. Preparing for international tech conferences and want regular Conversational English practice to sound more natural and spontaneous during Q&A!',
      interests: JSON.stringify(['Open Source Python', 'Public Speaking', 'Data Engineering', 'Sci-Fi Literature']),
      avatar_initials: 'TA',
      avatar_bg: '#4338CA',
      location: 'Toronto, Canada',
      timezone: 'UTC-4 (EDT)',
      availability: JSON.stringify(['Weekday Evenings', 'Sunday Afternoons']),
      preferred_format: 'Online',
      session_length_mins: 60,
      languages: JSON.stringify(['Arabic (Native)', 'English (Intermediate-Advanced)']),
      rating: 4.92,
      completed_swaps_count: 8,
      hours_exchanged: 9.5,
      skills: [
        {
          type: 'offer',
          skill_name: 'Beginner Python Lessons',
          category: 'Technology',
          level: 'Advanced',
          description: 'Zero-to-one Python fundamentals: variables, loops, functions, reading Excel/CSV files with pandas, and automating repetitive tasks.',
          tags: JSON.stringify(['beginner python', 'python', 'programming', 'coding', 'automation', 'pandas', 'data scripting'])
        },
        {
          type: 'offer',
          skill_name: 'SQL & API Automation',
          category: 'Technology',
          level: 'Advanced',
          description: 'Querying relational databases cleanly and connecting Python scripts to web APIs.',
          tags: JSON.stringify(['sql', 'python', 'apis', 'backend', 'data analysis'])
        },
        {
          type: 'want',
          skill_name: 'Conversational English Practice',
          category: 'Languages',
          level: 'Intermediate',
          description: 'Looking to practice natural conversational flow, workplace small talk, idioms, and clear pronunciation for tech talks.',
          tags: JSON.stringify(['conversational english', 'english conversation', 'english', 'speaking', 'communication', 'fluency', 'idioms', 'interview prep'])
        }
      ]
    },
    {
      name: 'Kenji Takahashi',
      handle: 'kenjicode',
      email: 'kenji@skillswap.io',
      role_title: 'Creative Technologist & Visual Designer',
      bio: 'Bridging visual design and code! I teach both Graphic Design fundamentals (layout, Swiss grids, vector graphics) and creative Python scripting. Looking to sharpen both my Conversational English nuance and my Excel financial modeling for studio budgets.',
      interests: JSON.stringify(['Swiss Grids', 'Creative Coding', 'Motion Graphics', 'Synthesizers']),
      avatar_initials: 'KT',
      avatar_bg: '#B45309',
      location: 'Vancouver, Canada',
      timezone: 'UTC-7 (PDT)',
      availability: JSON.stringify(['Weekday Evenings', 'Saturday Mornings', 'Sunday Afternoons']),
      preferred_format: 'Either',
      session_length_mins: 60,
      languages: JSON.stringify(['Japanese (Native)', 'English (Conversational)']),
      rating: 4.96,
      completed_swaps_count: 11,
      hours_exchanged: 14.0,
      skills: [
        {
          type: 'offer',
          skill_name: 'Graphic Design & Swiss Grids',
          category: 'Design',
          level: 'Advanced',
          description: 'Poster design, modular grid systems, visual hierarchy, and rapid Figma component libraries.',
          tags: JSON.stringify(['graphic design', 'design', 'figma', 'layout', 'typography', 'visual design'])
        },
        {
          type: 'offer',
          skill_name: 'Python Scripting for Beginners',
          category: 'Technology',
          level: 'Advanced',
          description: 'Practical, visual approach to Python for non-engineers: automating files, parsing data, and simple scripts.',
          tags: JSON.stringify(['beginner python', 'python', 'coding', 'automation', 'programming'])
        },
        {
          type: 'want',
          skill_name: 'Conversational English Practice',
          category: 'Languages',
          level: 'Intermediate',
          description: 'Want to practice pitching creative concepts in English with natural phrasing and confident pacing.',
          tags: JSON.stringify(['conversational english', 'english conversation', 'english', 'speaking', 'communication', 'fluency'])
        },
        {
          type: 'want',
          skill_name: 'Excel Budget & Scenario Modeling',
          category: 'Business',
          level: 'Beginner',
          description: 'Want to learn dynamic Excel templates for project quoting and utilization tracking.',
          tags: JSON.stringify(['excel', 'spreadsheets', 'financial modeling', 'formulas', 'dashboards'])
        }
      ]
    },
    {
      name: 'Elena Rostova',
      handle: 'elenaproduct',
      email: 'elena@skillswap.io',
      role_title: 'Lead Product Designer & UX Strategist',
      bio: 'I lead design critiques and teach non-designers how to think visually using Figma, color theory, and information architecture. Currently building a SaaS business case and desperately need an Excel wizard to teach me cohort modeling!',
      interests: JSON.stringify(['SaaS Metrics', 'Design Systems', 'User Psychology', 'Ceramics']),
      avatar_initials: 'ER',
      avatar_bg: '#be185d',
      location: 'New York, USA',
      timezone: 'UTC-4 (EDT)',
      availability: JSON.stringify(['Weekday Evenings', 'Sunday Afternoons']),
      preferred_format: 'In person',
      session_length_mins: 45,
      languages: JSON.stringify(['English (Fluent)', 'Ukrainian (Native)']),
      rating: 4.89,
      completed_swaps_count: 5,
      hours_exchanged: 5.5,
      skills: [
        {
          type: 'offer',
          skill_name: 'Figma & Visual UI Design',
          category: 'Design',
          level: 'Advanced',
          description: 'Hands-on Graphic & UI design fundamentals: spacing, typography scales, color contrast, and visual polish.',
          tags: JSON.stringify(['graphic design', 'figma', 'design', 'ui design', 'typography', 'layout'])
        },
        {
          type: 'offer',
          skill_name: 'Product Storytelling & UX Research',
          category: 'Business',
          level: 'Advanced',
          description: 'Structuring user interviews, journey maps, and compelling product narratives.',
          tags: JSON.stringify(['product management', 'ux research', 'storytelling', 'design'])
        },
        {
          type: 'want',
          skill_name: 'Advanced Excel & Cohort Modeling',
          category: 'Business',
          level: 'Intermediate',
          description: 'Want to master multi-sheet Excel lookups, sensitivity tables, and SaaS retention charts.',
          tags: JSON.stringify(['excel', 'spreadsheets', 'financial modeling', 'pivot tables', 'xlookup', 'dashboards'])
        }
      ]
    },
    {
      name: 'Sofia Rossi',
      handle: 'sofiarossi',
      email: 'sofia@skillswap.io',
      role_title: 'Data Journalist & Python Storyteller',
      bio: 'I use Python and pandas every day to uncover stories in messy public datasets. Happy to teach Beginner Python step-by-step in exchange for either Excel financial modeling tricks or Conversational English editorial feedback!',
      interests: JSON.stringify(['Data Journalism', 'Infographics', 'Italian Cinema', 'Investigative Reporting']),
      avatar_initials: 'SR',
      avatar_bg: '#0369A1',
      location: 'London, UK',
      timezone: 'UTC+1 (BST)',
      availability: JSON.stringify(['Saturday Mornings', 'Sunday Afternoons']),
      preferred_format: 'Online',
      session_length_mins: 60,
      languages: JSON.stringify(['Italian (Native)', 'English (Fluent)']),
      rating: 4.94,
      completed_swaps_count: 7,
      hours_exchanged: 8.0,
      skills: [
        {
          type: 'offer',
          skill_name: 'Beginner Python & Data Cleaning',
          category: 'Technology',
          level: 'Advanced',
          description: 'Gentle introduction to Python specifically designed for people who already know spreadsheets—pandas, notebooks, and charts.',
          tags: JSON.stringify(['beginner python', 'python', 'pandas', 'data analysis', 'automation', 'coding'])
        },
        {
          type: 'offer',
          skill_name: 'Italian Conversation & Culture',
          category: 'Languages',
          level: 'Advanced',
          description: 'Casual or travel-focused Italian conversation practice.',
          tags: JSON.stringify(['italian', 'language', 'conversation'])
        },
        {
          type: 'want',
          skill_name: 'Excel Dashboard Design & Macros',
          category: 'Business',
          level: 'Intermediate',
          description: 'Often editors want deliverables in Excel rather than Python—want to learn clean Excel dashboard formatting and XLOOKUP.',
          tags: JSON.stringify(['excel', 'spreadsheets', 'dashboards', 'xlookup', 'pivot tables'])
        },
        {
          type: 'want',
          skill_name: 'Graphic Design for Infographics',
          category: 'Design',
          level: 'Beginner',
          description: 'Want to make my data charts look like editorial magazine spreads.',
          tags: JSON.stringify(['graphic design', 'design', 'typography', 'layout'])
        }
      ]
    }
  ];

  const userIds = [];
  for (const u of seedUsers) {
    const res = insertUser.run(
      u.name, u.handle, u.email, defaultPassHash, u.role_title, u.bio, u.interests, u.avatar_initials, u.avatar_bg,
      u.location, u.timezone, u.availability, u.preferred_format,
      u.session_length_mins, u.languages, u.rating, u.completed_swaps_count, u.hours_exchanged
    );
    const uid = Number(res.lastInsertRowid);
    userIds.push(uid);
    for (const s of u.skills) {
      insertSkill.run(uid, s.type, s.skill_name, s.category, s.level, s.description, s.tags);
    }
  }

  const insertRequest = db.prepare(`
    INSERT INTO swap_requests (
      requester_id, recipient_id, offered_skill_name, wanted_skill_name,
      proposed_slot, duration_mins, format, learning_goal, message,
      ai_match_score, ai_match_rationale, ai_session_agenda, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertRequest.run(
    userIds[1],
    userIds[0],
    'Graphic Design & Typography',
    'Excel & Spreadsheet Modeling',
    'Thursday, 6:30 PM – 7:30 PM PDT (Weekday Evening)',
    60,
    'Online',
    'Trade a 30-min Figma layout & typography clinic for a 30-min Excel Pivot Table & freelance revenue tracker setup.',
    'Hey Maya! SkillSwap AI flagged us as a 98% reciprocal match. I would love to teach you typography hierarchy and grid layout in Figma if you can show me how to automate my studio invoice spreadsheet with XLOOKUP and Pivot Tables!',
    98,
    'Direct bidirectional skill match: Maya teaches Expert Excel & Spreadsheet Modeling (which Lucas needs for studio bookkeeping) while Lucas teaches Expert Graphic Design & Typography (Maya’s #1 learning goal). Both share Weekday Evening & Saturday Morning availability.',
    JSON.stringify([
      { time: '00–05 min', phase: 'Warmup & File Setup', detail: 'Share Maya’s sample slide deck and Lucas’s freelance invoice sheet.' },
      { time: '05–30 min', phase: 'Part 1: Excel Pivot Tables & XLOOKUP (Maya teaches Lucas)', detail: 'Convert Lucas’s raw client log into an automated monthly revenue Pivot Table with XLOOKUP status checks.' },
      { time: '30–55 min', phase: 'Part 2: Graphic Design Grids & Typography (Lucas teaches Maya)', detail: 'Redesign Maya’s executive report cover in Figma using a 12-column editorial grid, font pairing, and visual hierarchy.' },
      { time: '55–60 min', phase: 'Recap & Takeaway Checklist', detail: 'Save reusable templates and agree on next practice challenge.' }
    ]),
    'pending',
    '2026-10-27 18:30:00'
  );

  insertRequest.run(
    userIds[0],
    userIds[2],
    'Conversational English Practice',
    'Beginner Python Lessons',
    'Sunday, 2:00 PM – 3:00 PM PDT (Sunday Afternoon)',
    60,
    'Online',
    'Practice 30 mins of spontaneous tech Q&A in English, followed by 30 mins of writing my first Python script to read an Excel file.',
    'Hi Tariq! I saw you teach Beginner Python for spreadsheet users and want Conversational English practice for tech conferences. Let’s do a 50/50 split session this Sunday!',
    96,
    'High-synergy reciprocal match: Maya offers native-level Business & Conversational English coaching while Tariq specializes in teaching Beginner Python specifically tailored to automating CSV/Excel workflows.',
    JSON.stringify([
      { time: '00–05 min', phase: 'Icebreaker & Goal Alignment', detail: 'Quick check-in on Tariq’s upcoming conference talk topic and Maya’s Python environment.' },
      { time: '05–30 min', phase: 'Part 1: Conversational English & Q&A Fluency (Maya coaches Tariq)', detail: 'Roleplay spontaneous audience Q&A, natural transition phrases, and idiomatic tech explanations.' },
      { time: '30–55 min', phase: 'Part 2: Beginner Python for Excel Users (Tariq teaches Maya)', detail: 'Write a 15-line Python script using pandas to load, filter, and summarize an Excel workbook automatically.' },
      { time: '55–60 min', phase: 'Wrap-up & Vocabulary / Code Snippet Export', detail: 'Share markdown notes of English idioms and the starter `.py` script.' }
    ]),
    'accepted',
    '2026-10-26 14:15:00'
  );

  insertRequest.run(
    userIds[0],
    userIds[4],
    'Excel & Spreadsheet Modeling',
    'Figma & Visual UI Design',
    'Tuesday, 6:00 PM – 6:45 PM PDT (Weekday Evening)',
    45,
    'Online',
    'Build Elena’s SaaS cohort retention model in Excel in exchange for a critique and makeover of my dashboard color palette in Figma.',
    'Hi Elena! Happy to walk you through multi-sheet cohort retention modeling in Excel in exchange for learning Figma spacing and color systems.',
    93,
    'Strong domain bridge: Maya’s financial modeling expertise directly solves Elena’s SaaS cohort spreadsheet challenge, while Elena’s visual UI craft accelerates Maya’s design journey.',
    JSON.stringify([
      { time: '00–20 min', phase: 'Part 1: SaaS Cohort Modeling in Excel (Maya teaches Elena)', detail: 'Set up dynamic cohort retention triangles and sensitivity toggles.' },
      { time: '20–40 min', phase: 'Part 2: Visual Hierarchy & Color Systems (Elena teaches Maya)', detail: 'Apply accessible color tokens and typographic scale in Figma.' },
      { time: '40–45 min', phase: 'Action Items', detail: 'Exchange template links.' }
    ]),
    'pending',
    '2026-10-28 09:20:00'
  );

  const insertCompleted = db.prepare(`
    INSERT INTO completed_exchanges (
      request_id, partner_a_id, partner_b_id, skill_a_taught, skill_b_taught,
      duration_mins, completed_at, summary_notes, takeaways, rating_given, testimonial, verified_badge
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertCompleted.run(
    null,
    userIds[0],
    userIds[3],
    'Conversational English Practice',
    'Graphic Design & Swiss Grids',
    60,
    '2026-10-20 19:00:00',
    'Completed a 60-minute split workshop: practiced pitching creative direction in natural English for 30 minutes, then built a modular 12-column Swiss poster grid in Figma.',
    JSON.stringify([
      'Mastered the 8pt baseline grid and 3-level typographic hierarchy in Figma',
      'Practiced 12 natural English transition idioms for client design critiques',
      'Created a reusable dual-language presentation layout template'
    ]),
    5,
    'Maya gave me super actionable phrasing upgrades for my client pitches, and she picked up Swiss grid composition in Figma immediately!',
    'Verified 1-to-1 Reciprocal Swap'
  );

  insertCompleted.run(
    null,
    userIds[0],
    userIds[5],
    'Excel & Spreadsheet Modeling',
    'Beginner Python & Data Cleaning',
    60,
    '2026-10-14 16:30:00',
    'Traded advanced Excel XLOOKUP & dynamic array techniques for a hands-on introduction to Python dictionaries, lists, and reading CSVs in Jupyter.',
    JSON.stringify([
      'Translated 5 common Excel IF/XLOOKUP patterns into clean Python functions',
      'Built an automated Excel summary sheet with dynamic spill ranges',
      'Set up local Python virtual environment and ran first data script'
    ]),
    5,
    'Trading Excel tricks for Python basics with Sofia made coding click for me—seeing how an Excel table maps directly to a Python DataFrame was a lightbulb moment.',
    'Verified 1-to-1 Reciprocal Swap'
  );
  syncRelationalTables();
}

initSchema();
seedDatabase();

module.exports = {
  db,
  hashPassword,
  normalizeCategory,
  normalizeProficiency,
  ensureReusableSkill,
  syncRelationalTables,
  initSchema,
  seedDatabase
};
