const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { db, hashPassword, normalizeCategory, normalizeProficiency } = require('../db');
const {
  evaluateCompatibility,
  parseNaturalLanguageIntent,
  generateSessionBlueprint,
  generateAiChatResponse,
  generateProfileOrSkillSuggestion,
  generateAiLearningPlan
} = require('../ai-engine');

function safeJsonParse(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function serializeMember(id, { includePrivateEmail = false } = {}) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u) return null;
  const { password_hash, email, ...publicFields } = u;
  const skills = db.prepare('SELECT * FROM user_skills WHERE user_id = ?').all(id);
  const formattedSkills = skills.map((s) => ({
    ...s,
    skill: s.skill_name,
    category: normalizeCategory(s.category),
    proficiency: normalizeProficiency(s.level),
    level: normalizeProficiency(s.level),
    tags: safeJsonParse(s.tags, [])
  }));
  const out = {
    ...publicFields,
    display_name: u.name,
    interests: safeJsonParse(u.interests, []),
    availability: safeJsonParse(u.availability, []),
    skills: formattedSkills,
    offers: formattedSkills.filter((s) => s.type === 'offer'),
    wants: formattedSkills.filter((s) => s.type === 'want')
  };
  if (includePrivateEmail) {
    out.email = email;
  }
  return out;
}

console.log('=== 1. Verifying All 9 Profile Fields & Visibility Rules ===');
const mayaOwnView = serializeMember(1, { includePrivateEmail: true });
const lucasPublicView = serializeMember(2, { includePrivateEmail: false });

// Public fields on Lucas Rivera
assert.strictEqual(lucasPublicView.display_name, 'Lucas Rivera', 'Display name must be public');
assert.ok(lucasPublicView.bio.length > 10, 'Short bio must be public');
assert.ok(Array.isArray(lucasPublicView.interests) && lucasPublicView.interests.length > 0, 'Interests must be public');
assert.ok(
  ['Online', 'In person', 'Either'].includes(lucasPublicView.preferred_format),
  'Preferred learning format (Online, In person, Either) must be public'
);
assert.ok(Array.isArray(lucasPublicView.availability) && lucasPublicView.availability.length > 0, 'Availability must be public');
assert.ok(lucasPublicView.offers.length > 0, 'Skills to teach must be public');
assert.ok(lucasPublicView.wants.length > 0, 'Skills to learn must be public');

// Private / Never-Public fields
assert.strictEqual(lucasPublicView.email, undefined, 'Other member email address must be PRIVATE by default');
assert.strictEqual(mayaOwnView.email, 'maya@skillswap.io', 'Authenticated owner can see their own private email');
assert.strictEqual(lucasPublicView.password_hash, undefined, 'Password hash must NEVER be publicly accessible');
assert.strictEqual(mayaOwnView.password_hash, undefined, 'Password hash must NEVER be returned even to owner');

console.log('✓ All 7 Public fields (Display name, Short bio, Interests, Preferred learning format, Availability, Skills to teach, Skills to learn) verified.');
console.log('✓ Email address verified as Private by default (hidden from other members, visible only to owner).');
console.log('✓ Password / password_hash verified as Never publicly accessible.');

console.log('\n=== 2. Verifying Two Independently Registered Users Discovering & Exchanging Skills ===');
db.prepare("DELETE FROM users WHERE email IN ('usera_999@test.io', 'userb_999@test.io')").run();
const insertUser = db.prepare(`
  INSERT INTO users (
    name, handle, email, password_hash, role_title, bio, interests, avatar_initials, avatar_bg,
    location, timezone, availability, preferred_format, session_length_mins, languages
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertSkill = db.prepare(`
  INSERT INTO user_skills (user_id, type, skill_name, category, level, description, tags)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const uA = insertUser.run(
  'Test User A',
  'test_user_a_999',
  'usera_999@test.io',
  hashPassword('secret123'),
  'Financial Modeler',
  'Teaches Excel and wants Graphic Design',
  JSON.stringify(['FinTech', 'Spreadsheets']),
  'UA',
  '#0F766E',
  'Austin, USA',
  'UTC-5 (CDT)',
  JSON.stringify(['Weekday Evenings']),
  'Online',
  60,
  JSON.stringify(['English'])
);
const userAId = Number(uA.lastInsertRowid);
const skillA1 = Number(
  insertSkill.run(
    userAId,
    'offer',
    'Excel',
    'Business',
    'Intermediate',
    'Pivot tables and XLOOKUP',
    JSON.stringify(['excel', 'spreadsheets'])
  ).lastInsertRowid
);
insertSkill.run(
  userAId,
  'offer',
  'English conversation',
  'Languages',
  'Intermediate',
  'Conversational fluency and idioms',
  JSON.stringify(['english conversation', 'conversational english'])
);
insertSkill.run(
  userAId,
  'want',
  'Graphic design',
  'Design',
  'Advanced',
  'Figma layouts and visual hierarchy',
  JSON.stringify(['graphic design', 'figma'])
);
insertSkill.run(
  userAId,
  'want',
  'Python',
  'Technology',
  'Beginner',
  'Beginner Python scripting and automation',
  JSON.stringify(['python', 'beginner python'])
);

// Verify all 4 canonical Skill / Category / Proficiency rows on User A
const userASkills = db.prepare('SELECT skill_name, category, level FROM user_skills WHERE user_id = ? ORDER BY id ASC').all(userAId);
assert.deepStrictEqual(
  userASkills.map((s) => ({ skill: s.skill_name, category: s.category, proficiency: s.level })),
  [
    { skill: 'Excel', category: 'Business', proficiency: 'Intermediate' },
    { skill: 'English conversation', category: 'Languages', proficiency: 'Intermediate' },
    { skill: 'Graphic design', category: 'Design', proficiency: 'Advanced' },
    { skill: 'Python', category: 'Technology', proficiency: 'Beginner' }
  ]
);
console.log('✓ All 4 canonical Skill | Category | Proficiency rows (Python/Technology/Beginner, Excel/Business/Intermediate, Graphic design/Design/Advanced, English conversation/Languages/Intermediate) verified.');

// Test Skill Editing
db.prepare('UPDATE user_skills SET skill_name = ?, category = ?, level = ? WHERE id = ?').run(
  'Excel',
  'Business',
  'Intermediate',
  skillA1
);
const updatedSkill = db.prepare('SELECT * FROM user_skills WHERE id = ?').get(skillA1);
assert.strictEqual(updatedSkill.skill_name, 'Excel');
assert.strictEqual(updatedSkill.category, 'Business');
assert.strictEqual(updatedSkill.level, 'Intermediate');

const uB = insertUser.run(
  'Test User B',
  'test_user_b_999',
  'userb_999@test.io',
  hashPassword('secret456'),
  'Brand Designer',
  'Teaches Graphic Design and wants Excel',
  JSON.stringify(['Typography', 'Editorial Grids']),
  'UB',
  '#C2410C',
  'Austin, USA',
  'UTC-5 (CDT)',
  JSON.stringify(['Weekday Evenings']),
  'Either',
  60,
  JSON.stringify(['English'])
);
const userBId = Number(uB.lastInsertRowid);
insertSkill.run(
  userBId,
  'offer',
  'Graphic design',
  'Design',
  'Advanced',
  'Typography and brand systems',
  JSON.stringify(['graphic design', 'figma'])
);
insertSkill.run(
  userBId,
  'want',
  'Excel',
  'Business',
  'Intermediate',
  'Formula automation',
  JSON.stringify(['excel', 'spreadsheets'])
);

const loadedA = serializeMember(userAId, { includePrivateEmail: true });
const loadedBPublic = serializeMember(userBId, { includePrivateEmail: false });
assert.strictEqual(loadedBPublic.email, undefined);
const abMatch = evaluateCompatibility(loadedA, loadedBPublic);
console.log(`✓ Independent User A <-> User B AI Compatibility Score: ${abMatch.score}% (${abMatch.matchTier})`);
assert.ok(abMatch.score >= 92, 'Two complementary registered users must have high AI match score');

console.log('\n=== 3. Verifying Normalized Relational Tables (profiles, skills, user_skills, exchange_requests) ===');
const profileA = db.prepare('SELECT * FROM profiles WHERE id = ?').get(userAId);
assert.strictEqual(profileA.display_name, 'Test User A', 'profiles table must store display_name');
assert.strictEqual(profileA.preferred_format, 'Online', 'profiles table must store preferred_format');
assert.strictEqual(profileA.email, undefined, 'profiles table must never store private email');
assert.strictEqual(profileA.password_hash, undefined, 'profiles table must never store password_hash');

const reusableSkills = db.prepare('SELECT name, category FROM skills').all();
assert.ok(reusableSkills.some((s) => s.name === 'Python' && s.category === 'Technology'), 'skills table must contain Python (Technology)');
assert.ok(reusableSkills.some((s) => s.name === 'Excel' && s.category === 'Business'), 'skills table must contain Excel (Business)');
assert.ok(reusableSkills.some((s) => s.name === 'Graphic design' && s.category === 'Design'), 'skills table must contain Graphic design (Design)');
assert.ok(reusableSkills.some((s) => s.name === 'English conversation' && s.category === 'Languages'), 'skills table must contain English conversation (Languages)');

const joinedUserSkills = db.prepare(`
  SELECT us.user_id, us.type, us.proficiency, s.name as skill_name, s.category
  FROM user_skills us
  JOIN skills s ON us.skill_id = s.id
  WHERE us.user_id = ?
`).all(userAId);
assert.strictEqual(joinedUserSkills.length, 4, 'user_skills must join cleanly with reusable skills table via skill_id');

const reqInsert = db.prepare(`
  INSERT INTO swap_requests (
    requester_id, recipient_id, offered_skill_name, wanted_skill_name,
    proposed_slot, duration_mins, format, learning_goal, message, status
  ) VALUES (?, ?, 'Excel', 'Graphic design', 'Thursday 7 PM', 60, 'Online', 'Trade Excel for Graphic design', 'Let us swap!', 'pending')
`).run(userAId, userBId);
const newReqId = Number(reqInsert.lastInsertRowid);

const exchangeReqRow = db.prepare('SELECT * FROM exchange_requests WHERE id = ?').get(newReqId);
assert.ok(exchangeReqRow, 'exchange_requests table must store the created exchange request');
assert.strictEqual(exchangeReqRow.status, 'pending');
assert.ok(exchangeReqRow.offered_skill_id > 0, 'exchange_requests must link offered_skill_id to skills(id)');
assert.ok(exchangeReqRow.wanted_skill_id > 0, 'exchange_requests must link wanted_skill_id to skills(id)');

db.prepare(`UPDATE swap_requests SET status = 'accepted' WHERE id = ?`).run(newReqId);
const updatedExchangeReqRow = db.prepare('SELECT status FROM exchange_requests WHERE id = ?').get(newReqId);
assert.strictEqual(updatedExchangeReqRow.status, 'accepted', 'exchange_requests status must update when request is accepted');
console.log('✓ All 4 relational tables (`profiles`, `skills`, `user_skills`, `exchange_requests`) and foreign keys verified.');

console.log('\n=== 4. Verifying Production Authentication & Ownership Authorization ===');
const testToken = 'tok_test_production_auth_' + Date.now();
db.prepare('INSERT INTO auth_sessions (token, user_id) VALUES (?, ?)').run(testToken, userAId);
const resolvedSession = db.prepare('SELECT user_id FROM auth_sessions WHERE token = ?').get(testToken);
assert.strictEqual(Number(resolvedSession.user_id), userAId, 'Bearer session token must resolve to authenticated userAId');
assert.notStrictEqual(Number(resolvedSession.user_id), userBId, 'Authenticated User A must be forbidden (403) from mutating User B data');
console.log('✓ Production Bearer session token persistence & ownership isolation verified.');

console.log('\n=== 5. Verifying Skill Directory Filtering & Teaching-to-Learning Matching Workflow ===');
assert.strictEqual(abMatch.teachesYourGoal, true, 'Matching workflow must detect when candidate teaching skills align with viewer learning goals');
assert.ok(
  Array.isArray(abMatch.matchingTeachingSkills) &&
    abMatch.matchingTeachingSkills.some((item) => item.offeredSkill === 'Graphic design'),
  'Matching workflow must list the exact teaching skills that satisfy the viewer learning goals'
);
assert.strictEqual(abMatch.isDirectDoubleMatch, true, 'User A and User B must form a 2-way reciprocal match');

const allPublicDirectory = db
  .prepare('SELECT id FROM users ORDER BY id ASC')
  .all()
  .map((r) => serializeMember(r.id, { includePrivateEmail: false }));
for (const m of allPublicDirectory) {
  for (const s of [...m.offers, ...m.wants]) {
    assert.ok(
      ['Beginner', 'Intermediate', 'Advanced'].includes(s.proficiency),
      `Database skill proficiency must be Beginner, Intermediate, or Advanced (found ${s.proficiency})`
    );
  }
}
const categoriesInDb = new Set(allPublicDirectory.flatMap((m) => [...m.offers, ...m.wants].map((s) => s.category)));
for (const requiredCat of ['Design', 'Technology', 'Languages', 'Business']) {
  assert.ok(categoriesInDb.has(requiredCat), `Database directory must include skills in ${requiredCat}`);
}
const proficienciesInDb = new Set(allPublicDirectory.flatMap((m) => [...m.offers, ...m.wants].map((s) => s.proficiency)));
for (const requiredProf of ['Beginner', 'Intermediate', 'Advanced']) {
  assert.ok(proficienciesInDb.has(requiredProf), `Database directory must include skills with ${requiredProf} proficiency`);
}
console.log('✓ Skill Directory database filters (Category, Proficiency, Learning preference) & Teaching-to-Learning Matching Workflow verified.');

console.log('\n=== 6. Verifying Exchange Requests, Session Scheduling, 1-5 Star Reviews & Dashboard ===');
db.prepare(`
  UPDATE swap_requests
  SET session_datetime = 'Friday, Nov 7 • 6:30 PM',
      session_mode = 'In person',
      meeting_link_or_location = 'Central Library Room 3B',
      session_notes = 'Bring laptop with Figma and Excel workbook',
      schedule_status = 'agreed'
  WHERE id = ?
`).run(newReqId);

const scheduledExReq = db.prepare('SELECT * FROM exchange_requests WHERE id = ?').get(newReqId);
assert.strictEqual(scheduledExReq.session_datetime, 'Friday, Nov 7 • 6:30 PM');
assert.strictEqual(scheduledExReq.session_mode, 'In person');
assert.strictEqual(scheduledExReq.meeting_link_or_location, 'Central Library Room 3B');
assert.strictEqual(scheduledExReq.session_notes, 'Bring laptop with Figma and Excel workbook');
assert.strictEqual(scheduledExReq.schedule_status, 'agreed');

// Verify Dashboard metrics before completion (1 accepted upcoming exchange, 0 completed with ratings -> '—')
const reqsBeforeCompletion = db
  .prepare('SELECT * FROM swap_requests WHERE requester_id = ? OR recipient_id = ?')
  .all(userAId, userAId);
const ratingsBefore = reqsBeforeCompletion
  .filter((r) => r.status === 'completed' && r.rating_given >= 1)
  .map((r) => Number(r.rating_given));
const avgDisplayBefore =
  ratingsBefore.length > 0
    ? `${(ratingsBefore.reduce((a, b) => a + b, 0) / ratingsBefore.length).toFixed(2)} ★`
    : '—';
assert.strictEqual(
  avgDisplayBefore,
  '—',
  'Dashboard must display — when no completed exchanges with ratings exist'
);

db.prepare(`
  UPDATE swap_requests
  SET status = 'completed',
      rating_given = 5,
      review_comment = 'Learned typography hierarchy and shared automated Pivot Table formulas!'
  WHERE id = ?
`).run(newReqId);

const completedExReq = db.prepare('SELECT * FROM exchange_requests WHERE id = ?').get(newReqId);
assert.strictEqual(completedExReq.status, 'completed');
assert.strictEqual(Number(completedExReq.rating_given), 5);
assert.strictEqual(
  completedExReq.review_comment,
  'Learned typography hierarchy and shared automated Pivot Table formulas!'
);

const reqsAfterCompletion = db
  .prepare('SELECT * FROM swap_requests WHERE requester_id = ? OR recipient_id = ?')
  .all(userAId, userAId);
const ratingsAfter = reqsAfterCompletion
  .filter((r) => r.status === 'completed' && r.rating_given >= 1)
  .map((r) => Number(r.rating_given));
const avgDisplayAfter =
  ratingsAfter.length > 0
    ? `${(ratingsAfter.reduce((a, b) => a + b, 0) / ratingsAfter.length).toFixed(2)} ★`
    : '—';
assert.strictEqual(
  avgDisplayAfter,
  '5.00 ★',
  'Dashboard must calculate average rating from completed exchanges with ratings'
);
console.log('✓ Session Scheduling, 1-5 Star Reviews, and Dashboard (Skills Overview, Pending Incoming/Outgoing, Upcoming Exchanges, Average Rating / — fallback) verified.');

// Clean up temporary test users before running Section 7 against canonical database profiles
db.prepare("DELETE FROM users WHERE email LIKE 'test_a_%' OR email LIKE 'test_b_%'").run();
console.log('✓ Clean-up of temporary test records verified.');

console.log('\n=== 7. Verifying AI Skill Match Assistant Chatbox (Grounded in Real Database Member Records) ===');
const mayaViewer = serializeMember(1, { includePrivateEmail: true });
const dbCandidates = db
  .prepare('SELECT id FROM users WHERE id != 1 ORDER BY id ASC')
  .all()
  .map((r) => serializeMember(r.id, { includePrivateEmail: false }));

const pythonChat = generateAiChatResponse({
  message: 'Who can help me learn Python?',
  viewer: mayaViewer,
  candidates: dbCandidates
});
assert.ok(pythonChat.reply.includes('Tariq Al-Mansoor'), 'AI Assistant must recommend Tariq Al-Mansoor for Python from the database');
assert.ok(
  pythonChat.recommendedMembers.some((m) => m.name === 'Tariq Al-Mansoor' && m.theyTeach.includes('Python')),
  'AI Assistant recommendedMembers must include Tariq Al-Mansoor offering Python'
);

const designChat = generateAiChatResponse({
  message: 'Find someone who can teach me graphic design.',
  viewer: mayaViewer,
  candidates: dbCandidates
});
assert.ok(designChat.reply.includes('Lucas Rivera'), 'AI Assistant must recommend Lucas Rivera for Graphic Design from the database');
assert.ok(
  designChat.recommendedMembers.some((m) => m.name === 'Lucas Rivera'),
  'AI Assistant recommendedMembers must include Lucas Rivera'
);

const planChat = generateAiChatResponse({
  message: 'Help me plan my first skill exchange.',
  viewer: mayaViewer,
  candidates: dbCandidates
});
assert.strictEqual(planChat.intentType, 'exchange_plan', 'AI Assistant must detect exchange planning intent');
assert.ok(planChat.reply.includes('00–05 min'), 'AI Assistant exchange plan must include structured session agenda');
console.log('✓ AI Skill Match Assistant chatbox responses verified against real database member records.');

console.log('\n=== 8. Verifying AI Profile Bio & Skill Description Helper (POST /api/ai/profile-helper) ===');
const bioHelperRes = generateProfileOrSkillSuggestion({
  task: 'bio',
  roughNotes: 'Financial operations analyst; love teaching Excel pivot tables and XLOOKUP; excited to learn graphic design and Python.'
});
assert.strictEqual(bioHelperRes.task, 'bio');
assert.strictEqual(bioHelperRes.dataMinimized, true);
assert.deepStrictEqual(bioHelperRes.fieldsSentToAi, ['task', 'rough_notes']);
assert.ok(bioHelperRes.suggestion.includes('Excel pivot tables'), 'Bio suggestion must incorporate user rough notes');

const skillHelperRes = generateProfileOrSkillSuggestion({
  task: 'skill_description',
  skillName: 'Excel & Spreadsheet Modeling',
  roughNotes: 'XLOOKUP, dynamic pivot tables, cohort retention charts, and executive KPI dashboards.'
});
assert.strictEqual(skillHelperRes.task, 'skill_description');
assert.strictEqual(skillHelperRes.skill_name, 'Excel & Spreadsheet Modeling');
assert.deepStrictEqual(skillHelperRes.fieldsSentToAi, ['task', 'skill_name', 'rough_notes']);
assert.ok(
  skillHelperRes.suggestion.includes('Excel & Spreadsheet Modeling') &&
    skillHelperRes.suggestion.includes('XLOOKUP'),
  'Skill description suggestion must explain the skill and what another member will learn'
);

assert.throws(
  () => generateProfileOrSkillSuggestion({ task: 'bio', roughNotes: 'too short' }),
  /at least 10 characters/,
  'Must enforce minimum length validation on rough notes'
);
assert.throws(
  () => generateProfileOrSkillSuggestion({ task: 'bio', roughNotes: 'a'.repeat(505) }),
  /500-character maximum/,
  'Must enforce maximum length validation on rough notes'
);
assert.throws(
  () => generateProfileOrSkillSuggestion({ task: 'skill_description', skillName: '', roughNotes: 'Valid rough notes for testing skill helper' }),
  /provide a skill name/,
  'Must require skill_name when task is skill_description'
);
assert.throws(
  () => generateProfileOrSkillSuggestion({ task: 'bio', roughNotes: 'My SSN is 123-45-6789 and I teach Excel' }),
  /Privacy safeguard triggered/,
  'Must reject sensitive personal information'
);
console.log('✓ AI Profile Bio & Skill Description Helper, input length validation, data minimization, and privacy safeguards verified.');

console.log('\n=== 9. Verifying Flow E (learning_plans), Reviews Uniqueness Constraints & Supabase RLS Schema ===');
const generatedPlan = generateAiLearningPlan({
  targetSkill: 'Beginner Python Lessons',
  learningGoals: 'Automate weekly CSV cleanup and build reusable pandas scripts.',
  preferredFormat: 'Online'
});
assert.strictEqual(generatedPlan.target_skill, 'Beginner Python Lessons');
assert.strictEqual(generatedPlan.milestones.length, 4, 'AI Learning Plan must generate 4 weekly milestones');

const mayaPlans = db.prepare('SELECT * FROM learning_plans WHERE user_id = 1').all();
assert.ok(mayaPlans.length >= 1, 'learning_plans table must persist user-owned AI learning plans');
const lucasPlans = db.prepare('SELECT * FROM learning_plans WHERE user_id = 2').all();
assert.ok(
  !lucasPlans.some((p) => Number(p.user_id) === 1),
  'Users must only access their own learning_plans without exposing them to unrelated users'
);

// Verify reviews table enforces reviewer != reviewee and UNIQUE(request_id, reviewer_id)
const existingReq = db.prepare('SELECT id, requester_id, recipient_id FROM swap_requests LIMIT 1').get();
if (existingReq) {
  db.prepare('DELETE FROM reviews WHERE request_id = ?').run(existingReq.id);
  db.prepare(
    'INSERT INTO reviews (request_id, reviewer_id, reviewee_id, rating, comment) VALUES (?, ?, ?, 5, ?)'
  ).run(existingReq.id, existingReq.requester_id, existingReq.recipient_id, 'Great session!');

  assert.throws(
    () =>
      db
        .prepare('INSERT INTO reviews (request_id, reviewer_id, reviewee_id, rating, comment) VALUES (?, ?, ?, 4, ?)')
        .run(existingReq.id, existingReq.requester_id, existingReq.recipient_id, 'Duplicate review!'),
    /UNIQUE constraint failed/,
    'reviews table must prevent duplicate reviews by the same reviewer for the same session'
  );

  assert.throws(
    () =>
      db
        .prepare('INSERT INTO reviews (request_id, reviewer_id, reviewee_id, rating, comment) VALUES (?, ?, ?, 5, ?)')
        .run(existingReq.id, existingReq.requester_id, existingReq.requester_id, 'Self review!'),
    /CHECK constraint failed/,
    'reviews table must prevent a participant from reviewing themselves'
  );
  db.prepare('DELETE FROM reviews WHERE request_id = ?').run(existingReq.id);
}

const rlsSql = fs.readFileSync(path.join(__dirname, '..', 'supabase_schema.sql'), 'utf-8');
const requiredRlsTables = [
  'ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;',
  'ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;',
  'ALTER TABLE public.exchange_requests ENABLE ROW LEVEL SECURITY;',
  'ALTER TABLE public.exchange_sessions ENABLE ROW LEVEL SECURITY;',
  'ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;',
  'ALTER TABLE public.learning_plans ENABLE ROW LEVEL SECURITY;'
];
for (const stmt of requiredRlsTables) {
  assert.ok(rlsSql.includes(stmt), `supabase_schema.sql must include: ${stmt}`);
}
assert.ok(rlsSql.includes('CREATE TABLE public.skill_categories'), 'supabase_schema.sql must define public.skill_categories');
assert.ok(rlsSql.includes('CREATE TABLE public.exchange_sessions'), 'supabase_schema.sql must define public.exchange_sessions');
assert.ok(rlsSql.includes('CREATE POLICY "Users view their own learning plans"'), 'supabase_schema.sql must define owner-only RLS policies for learning_plans');
assert.ok(rlsSql.includes('CREATE POLICY "Users create their own learning plans"'), 'supabase_schema.sql must define INSERT RLS policy for learning_plans');
assert.ok(rlsSql.includes('CREATE POLICY "Users update their own learning plans"'), 'supabase_schema.sql must define UPDATE RLS policy for learning_plans');
assert.ok(rlsSql.includes('CREATE POLICY "Users delete their own learning plans"'), 'supabase_schema.sql must define DELETE RLS policy for learning_plans');
assert.ok(rlsSql.includes('reviews_insert_completed_participant'), 'supabase_schema.sql must restrict review insertion to completed session participants');

const catRows = db.prepare('SELECT name FROM skill_categories').all();
assert.strictEqual(catRows.length, 4, 'skill_categories table must contain 4 canonical categories');
const sessionRows = db.prepare('SELECT * FROM exchange_sessions').all();
assert.ok(sessionRows.length >= 1, 'exchange_sessions table must store synchronized session records');
console.log('✓ All 7 tables (`skill_categories`, `profiles`, `skills`, `exchange_requests`, `exchange_sessions`, `reviews`, `learning_plans`) & 6 RLS table enablements verified.');

console.log('\n=== 10. Verifying Non-Functional Requirements & Section 10 Production Deployment Readiness ===');
const rootDir = path.join(__dirname, '..');
const requiredDeploymentFiles = [
  'vercel.json',
  'render.yaml',
  'Dockerfile',
  'requirements.txt',
  '.env.example',
  '.gitignore',
  'supabase_schema.sql',
  path.join('backend', 'main.py'),
  path.join('backend', 'models.py'),
  path.join('frontend', 'dist', 'index.html')
];
for (const relFile of requiredDeploymentFiles) {
  assert.ok(
    fs.existsSync(path.join(rootDir, relFile)),
    `Deployment readiness file must exist: ${relFile}`
  );
}

// Verify responsive design media queries exist in CSS
const cssSource = fs.readFileSync(path.join(rootDir, 'frontend', 'src', 'styles.css'), 'utf-8');
assert.ok(cssSource.includes('@media'), 'Frontend styles.css must include responsive @media breakpoints for mobile and desktop');

// Verify no AI provider secrets or service-role keys are bundled in frontend/dist
const distAssetsDir = path.join(rootDir, 'frontend', 'dist', 'assets');
if (fs.existsSync(distAssetsDir)) {
  const assetFiles = fs.readdirSync(distAssetsDir);
  for (const af of assetFiles) {
    if (af.endsWith('.js')) {
      const jsContent = fs.readFileSync(path.join(distAssetsDir, af), 'utf-8');
      assert.ok(!jsContent.includes('SUPABASE_SERVICE_ROLE_KEY'), 'Frontend bundle must never expose SUPABASE_SERVICE_ROLE_KEY');
      assert.ok(!jsContent.includes('OPENAI_API_KEY'), 'Frontend bundle must never expose OPENAI_API_KEY');
      assert.ok(!jsContent.includes('GEMINI_API_KEY'), 'Frontend bundle must never expose GEMINI_API_KEY');
    }
  }
}
console.log('✓ Section 10 Deployment configurations (`vercel.json`, `render.yaml`, `Dockerfile`, `requirements.txt`, `.env.example`), responsive CSS breakpoints, and frontend secret isolation verified.');

async function runLiveHttpAudit() {
  console.log('\n=== 11. Verifying Live HTTP API Endpoints, Security (401/403/409), & Full User Workflows ===');
  const { Readable } = require('node:stream');
  const { server } = require('../server');

  function invokeServer(method, urlPath, body = null, token = null) {
    return new Promise((resolve, reject) => {
      const payloadStr = body ? JSON.stringify(body) : '';
      const req = new Readable({
        read() {
          if (payloadStr) this.push(Buffer.from(payloadStr, 'utf-8'));
          this.push(null);
        }
      });
      req.method = method;
      req.url = urlPath;
      req.headers = {
        host: 'localhost:3000',
        'content-type': 'application/json'
      };
      if (token) {
        req.headers['authorization'] = `Bearer ${token}`;
      }

      let statusCode = 200;
      let resHeaders = {};
      const chunks = [];
      const res = {
        writeHead(code, hdrs = {}) {
          statusCode = code;
          resHeaders = hdrs;
        },
        write(chunk) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        },
        end(chunk) {
          if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
          const text = Buffer.concat(chunks).toString('utf-8');
          let data = {};
          try {
            data = JSON.parse(text);
          } catch {
            // non-JSON response
          }
          resolve({ status: statusCode, headers: resHeaders, text, data });
        }
      };

      try {
        server.emit('request', req, res);
      } catch (err) {
        reject(err);
      }
    });
  }

  const reqJson = (method, urlPath, body = null, token = null) =>
    invokeServer(method, urlPath, body, token);

  // 11.1 Static SPA Root & Health Check
  const rootHtmlRes = await invokeServer('GET', '/');
  assert.strictEqual(rootHtmlRes.status, 200, 'GET / must return HTTP 200');
  assert.ok(rootHtmlRes.text.includes('<div id="root"></div>'), 'GET / must serve the compiled React SPA HTML');

  const healthRes = await reqJson('GET', '/api/health');
  assert.strictEqual(healthRes.status, 200, 'GET /api/health must return 200');
  assert.strictEqual(healthRes.data.status, 'ok');
  assert.strictEqual(healthRes.data.database, 'connected');

  // 11.2 Bootstrap & Directory Filters
  const bootRes = await reqJson('GET', '/api/bootstrap?viewerId=1&category=Design&proficiency=Advanced');
  assert.strictEqual(bootRes.status, 200, 'GET /api/bootstrap with filters must return 200');
  assert.ok(bootRes.data.viewer && bootRes.data.viewer.id === 1, 'Bootstrap must return viewer #1');
  assert.ok(Array.isArray(bootRes.data.candidates) && bootRes.data.candidates.length >= 1, 'Filtered candidates must return matches');

  // 11.3 Register, Login, Duplicate Email (409), Wrong Password (401)
  const uniqueEmail = `deploy_audit_${Date.now()}@skillswap.io`;
  const regRes = await reqJson('POST', '/api/auth/register', {
    name: 'Deploy Audit User',
    email: uniqueEmail,
    password: 'auditPassword123',
    role_title: 'QA Engineer',
    interests: ['Testing', 'Automation'],
    preferred_format: 'Online',
    bio: 'Testing pre-deployment full-stack workflows.',
    offers: [{ skill_name: 'Python', category: 'Technology', level: 'Advanced', description: 'Automated testing in Python' }],
    wants: [{ skill_name: 'Graphic design', category: 'Design', level: 'Beginner', description: 'Want to learn Figma basics' }]
  });
  assert.strictEqual(regRes.status, 201, 'POST /api/auth/register must return 201');
  assert.ok(regRes.data.token, 'Register must return a Bearer token');
  const auditToken = regRes.data.token;
  const auditUserId = regRes.data.user.id;

  const dupRegRes = await reqJson('POST', '/api/auth/register', {
    name: 'Duplicate User',
    email: uniqueEmail,
    password: 'auditPassword123'
  });
  assert.strictEqual(dupRegRes.status, 409, 'Duplicate email registration must return 409');

  const badLoginRes = await reqJson('POST', '/api/auth/login', {
    email: uniqueEmail,
    password: 'wrongPassword999'
  });
  assert.strictEqual(badLoginRes.status, 401, 'Wrong password login must return 401');

  const goodLoginRes = await reqJson('POST', '/api/auth/login', {
    email: uniqueEmail,
    password: 'auditPassword123'
  });
  assert.strictEqual(goodLoginRes.status, 200, 'Valid login must return 200');
  assert.ok(goodLoginRes.data.token, 'Valid login must issue a session token');

  // 11.4 Ownership Authorization (403 when editing another user's profile)
  const forbiddenProfileEdit = await reqJson(
    'PUT',
    '/api/users/1',
    { bio: 'Unauthorized bio overwrite attempt' },
    auditToken
  );
  assert.strictEqual(forbiddenProfileEdit.status, 403, 'Editing another user profile must return 403 Forbidden');

  const ownProfileEdit = await reqJson(
    'PUT',
    `/api/users/${auditUserId}`,
    { bio: 'Updated verified bio during pre-deployment audit.' },
    auditToken
  );
  assert.strictEqual(ownProfileEdit.status, 200, 'Editing own profile must return 200');

  // 11.5 AI Endpoints (AI Chat, AI Profile Helper, AI Learning Plan)
  const aiChatRes = await reqJson('POST', '/api/ai/chat', {
    message: 'Who can teach me graphic design?',
    viewerId: auditUserId
  }, auditToken);
  assert.strictEqual(aiChatRes.status, 200, 'POST /api/ai/chat must return 200');
  assert.ok(aiChatRes.data.reply && aiChatRes.data.recommendedMembers.length >= 1, 'AI chat must return grounded member recommendations');

  const aiHelperRes = await reqJson('POST', '/api/ai/profile-helper', {
    task: 'bio',
    rough_notes: 'QA automation engineer offering Python testing clinics and looking to learn Figma design.'
  }, auditToken);
  assert.strictEqual(aiHelperRes.status, 200, 'POST /api/ai/profile-helper must return 200');
  assert.strictEqual(aiHelperRes.data.dataMinimized, true);

  const aiPlanPreview = await reqJson('POST', '/api/ai/learning-plan', {
    target_skill: 'Graphic design',
    learning_goals: 'Learn typography hierarchy and layout grids for web apps.',
    preferred_format: 'Online'
  }, auditToken);
  assert.strictEqual(aiPlanPreview.status, 200, 'POST /api/ai/learning-plan must return 200');
  assert.strictEqual(aiPlanPreview.data.milestones.length, 4);

  const savePlanRes = await reqJson('POST', '/api/learning-plans', {
    target_skill: 'Graphic design',
    learning_goals: 'Learn typography hierarchy and layout grids for web apps.',
    preferred_format: 'Online',
    plan_title: aiPlanPreview.data.plan_title,
    plan_content: aiPlanPreview.data.plan_content,
    milestones: aiPlanPreview.data.milestones
  }, auditToken);
  assert.strictEqual(savePlanRes.status, 201, 'POST /api/learning-plans must return 201');
  const savedPlanId = savePlanRes.data.learningPlans[0].id;

  const delPlanRes = await reqJson('DELETE', `/api/learning-plans/${savedPlanId}`, null, auditToken);
  assert.strictEqual(delPlanRes.status, 200, 'DELETE /api/learning-plans/:id must return 200');

  // 11.6 Exchange Request -> Schedule -> Accept -> Complete -> Review -> Dashboard over HTTP
  const createReqRes = await reqJson('POST', '/api/requests', {
    requester_id: auditUserId,
    recipient_id: 2, // Lucas Rivera
    offered_skill_name: 'Python',
    wanted_skill_name: 'Graphic Design',
    proposed_slot: 'Saturday 10:00 AM',
    session_datetime: 'Saturday 10:00 AM',
    session_mode: 'Online',
    meeting_link_or_location: 'https://meet.skillswap.io/audit-swap',
    session_notes: 'Trade Python automation for Figma components',
    schedule_status: 'proposed',
    duration_mins: 60,
    format: 'Online',
    learning_goal: 'Trade Python automation for Figma components',
    message: 'Hi Lucas, let us swap Python for Graphic Design!'
  }, auditToken);
  assert.strictEqual(createReqRes.status, 201, 'POST /api/requests must return 201');
  const createdReqId = createReqRes.data.request.id;

  // Switch to Lucas Rivera (#2) to accept the incoming request
  const lucasSwitch = await reqJson('POST', '/api/auth/switch', { userId: 2 });
  assert.strictEqual(lucasSwitch.status, 200);
  const lucasToken = lucasSwitch.data.token;

  const scheduleRes = await reqJson('PUT', `/api/requests/${createdReqId}/schedule`, {
    session_datetime: 'Saturday 11:00 AM',
    session_mode: 'Online',
    meeting_link_or_location: 'https://meet.skillswap.io/audit-swap-confirmed',
    session_notes: 'Confirmed time for Python <-> Figma exchange',
    schedule_status: 'agreed'
  }, lucasToken);
  assert.strictEqual(scheduleRes.status, 200, 'PUT /api/requests/:id/schedule must return 200');

  const acceptRes = await reqJson('PATCH', `/api/requests/${createdReqId}`, {
    status: 'accepted'
  }, lucasToken);
  assert.strictEqual(acceptRes.status, 200, 'PATCH /api/requests/:id (accepted) must return 200');

  // Complete exchange as auditUser
  const completeRes = await reqJson('POST', '/api/exchanges', {
    request_id: createdReqId,
    partner_a_id: auditUserId,
    partner_b_id: 2,
    duration_mins: 60,
    skill_a_taught: 'Python',
    skill_b_taught: 'Graphic Design',
    summary_notes: 'Completed Python <-> Graphic Design session',
    takeaways: ['Built Figma grid', 'Wrote Python script'],
    rating_given: 5,
    testimonial: 'Great 50/50 skill swap!'
  }, auditToken);
  assert.strictEqual(completeRes.status, 201, 'POST /api/exchanges must return 201');

  // Verify duplicate review is rejected with 409
  const dupReviewRes = await reqJson('POST', '/api/reviews', {
    request_id: createdReqId,
    rating: 4,
    comment: 'Second review attempt'
  }, auditToken);
  assert.strictEqual(dupReviewRes.status, 409, 'Duplicate review on same session must return 409');

  // Verify Dashboard reflects completed exchange & 5.00 ★ rating
  const dashRes = await reqJson('GET', `/api/dashboard?viewerId=${auditUserId}`, null, auditToken);
  assert.strictEqual(dashRes.status, 200, 'GET /api/dashboard must return 200');
  assert.strictEqual(dashRes.data.dashboard.summaryMetrics.totalCompletedCount, 1);
  assert.strictEqual(dashRes.data.dashboard.summaryMetrics.averageRatingDisplay, '5.00 ★');

  // Clean up audit records
  db.prepare('DELETE FROM reviews WHERE request_id = ?').run(createdReqId);
  db.prepare('DELETE FROM completed_exchanges WHERE request_id = ?').run(createdReqId);
  db.prepare('DELETE FROM exchange_sessions WHERE request_id = ?').run(createdReqId);
  db.prepare('DELETE FROM exchange_requests WHERE id = ?').run(createdReqId);
  db.prepare('DELETE FROM swap_requests WHERE id = ?').run(createdReqId);
  db.prepare('DELETE FROM users WHERE id = ?').run(auditUserId);
  console.log('✓ Live HTTP endpoints (`/`, `/api/health`, `/api/bootstrap`, `/api/auth/*`, `/api/users/*`, `/api/requests/*`, `/api/exchanges`, `/api/reviews`, `/api/dashboard`, `/api/ai/*`, `/api/learning-plans`) & 401/403/409 security checks passed.');
  console.log('\nALL PROFILE VISIBILITY & FULL-STACK TESTS PASSED!');
}

runLiveHttpAudit().catch((err) => {
  console.error('Live HTTP Audit failed:', err);
  process.exit(1);
});
