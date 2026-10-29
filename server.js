const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { db, hashPassword, normalizeCategory, normalizeProficiency } = require('./db');
const {
  evaluateCompatibility,
  generateSessionBlueprint,
  parseNaturalLanguageIntent,
  generateAiChatResponse,
  generateProfileOrSkillSuggestion,
  generateAiLearningPlan
} = require('./ai-engine');

const PORT = process.env.PORT || 3000;
const DIST_DIR = path.join(__dirname, 'frontend', 'dist');
const PUBLIC_DIR = path.join(__dirname, 'public');

function safeJsonParse(str, fallback) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function formatSkillRow(s) {
  const category = normalizeCategory(s.category);
  const level = normalizeProficiency(s.level);
  return {
    ...s,
    skill: s.skill_name,
    skill_name: s.skill_name,
    category,
    proficiency: level,
    level,
    tags: safeJsonParse(s.tags, [])
  };
}

function getUserWithSkills(userId, { includePrivateEmail = false } = {}) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return null;
  const { password_hash, email, ...publicUser } = user;
  const skills = db.prepare('SELECT * FROM user_skills WHERE user_id = ? ORDER BY id ASC').all(userId);
  const formattedSkills = skills.map(formatSkillRow);
  const formatted = {
    ...publicUser,
    display_name: user.name,
    interests: safeJsonParse(user.interests, []),
    availability: safeJsonParse(user.availability, []),
    languages: safeJsonParse(user.languages, []),
    skills: formattedSkills,
    offers: formattedSkills.filter((s) => s.type === 'offer'),
    wants: formattedSkills.filter((s) => s.type === 'want')
  };
  if (includePrivateEmail) {
    formatted.email = email;
  }
  return formatted;
}

function getAllUsersWithSkills(viewerId = null) {
  const users = db.prepare('SELECT id FROM users ORDER BY id ASC').all();
  return users.map((u) =>
    getUserWithSkills(u.id, { includePrivateEmail: viewerId !== null && u.id === Number(viewerId) })
  );
}

function getAuthenticatedUserId(req) {
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  const session = db.prepare('SELECT user_id FROM auth_sessions WHERE token = ?').get(token);
  return session ? Number(session.user_id) : null;
}

function issueTokenForUser(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO auth_sessions (token, user_id) VALUES (?, ?)').run(token, userId);
  return token;
}

function getOrCreateTokenForUser(userId) {
  const existing = db
    .prepare('SELECT token FROM auth_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(userId);
  if (existing && existing.token) {
    return existing.token;
  }
  return issueTokenForUser(userId);
}

function getUserLearningPlans(userId) {
  if (!userId) return [];
  const rows = db
    .prepare('SELECT * FROM learning_plans WHERE user_id = ? ORDER BY id DESC')
    .all(Number(userId));
  return rows.map((r) => ({
    ...r,
    milestones: safeJsonParse(r.milestones, [])
  }));
}

function getEnrichedRequests(viewerId) {
  const rows = db
    .prepare(
      `
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
    WHERE r.requester_id = ? OR r.recipient_id = ?
    ORDER BY
      CASE r.status
        WHEN 'pending' THEN 1
        WHEN 'accepted' THEN 2
        WHEN 'completed' THEN 3
        ELSE 4
      END,
      r.id DESC
  `
    )
    .all(viewerId, viewerId);

  return rows.map((r) => ({
    ...r,
    session_datetime: r.session_datetime || r.proposed_slot || '',
    session_mode: ['Online', 'In person'].includes(r.session_mode) ? r.session_mode : 'Online',
    meeting_link_or_location:
      r.meeting_link_or_location || `https://meet.skillswap.io/swap-room-${r.id}`,
    session_notes: r.session_notes || r.learning_goal || '',
    schedule_status: r.schedule_status === 'agreed' ? 'agreed' : 'proposed',
    rating_given: r.rating_given ? Number(r.rating_given) : null,
    review_comment: r.review_comment || '',
    direction: r.recipient_id === Number(viewerId) ? 'incoming' : 'outgoing',
    ai_session_agenda: safeJsonParse(r.ai_session_agenda, [])
  }));
}

function getEnrichedExchanges(viewerId) {
  const rows = db
    .prepare(
      `
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
  `
    )
    .all();

  return rows.map((c) => ({
    ...c,
    involves_viewer: c.partner_a_id === Number(viewerId) || c.partner_b_id === Number(viewerId),
    takeaways: safeJsonParse(c.takeaways, [])
  }));
}

function buildDashboardPayload(viewerId, requests, completedExchanges, viewerObj = null) {
  const viewer = viewerObj || getUserWithSkills(viewerId, { includePrivateEmail: true });

  // 1. Skills Overview (Skills offered & Skills wanted from database profile)
  const skillsOffered = viewer?.offers || [];
  const skillsWanted = viewer?.wants || [];

  // 2. Exchange Request Summary (Pending incoming vs Pending outgoing)
  const pendingIncoming = requests.filter(
    (r) => r.status === 'pending' && r.direction === 'incoming'
  );
  const pendingOutgoing = requests.filter(
    (r) => r.status === 'pending' && r.direction === 'outgoing'
  );
  const pendingIncomingCount = pendingIncoming.length;
  const pendingOutgoingCount = pendingOutgoing.length;
  const pendingCount = pendingIncomingCount + pendingOutgoingCount;

  // 3. Upcoming Exchanges (Accepted exchanges with partner name, skills, date/time, format, and meeting details)
  const acceptedRequests = requests.filter((r) => r.status === 'accepted');
  const acceptedCount = acceptedRequests.length;
  const upcomingExchanges = acceptedRequests.map((r) => {
    const isIncoming = r.direction === 'incoming';
    const partnerName = isIncoming ? r.requester_name : r.recipient_name;
    const partnerRole = isIncoming ? r.requester_role : r.recipient_role;
    const partnerInitials = isIncoming ? r.requester_initials : r.recipient_initials;
    const partnerBg = isIncoming ? r.requester_bg : r.recipient_bg;
    const youTeach = isIncoming ? r.wanted_skill_name : r.offered_skill_name;
    const partnerTeaches = isIncoming ? r.offered_skill_name : r.wanted_skill_name;
    return {
      id: r.id,
      requestId: r.id,
      direction: r.direction,
      partnerName,
      partnerRole,
      partnerInitials,
      partnerBg,
      youTeach,
      partnerTeaches,
      sessionDatetime: r.session_datetime || r.proposed_slot,
      sessionMode: r.session_mode || 'Online',
      meetingLinkOrLocation: r.meeting_link_or_location || '',
      sessionNotes: r.session_notes || r.learning_goal || '',
      scheduleStatus: r.schedule_status || 'proposed',
      durationMins: r.duration_mins || 60
    };
  });

  // 4. Summary Metrics (Total exchanges completed & Average rating from completed exchanges with ratings, or '—' if none)
  const viewerCompletedExchanges = completedExchanges.filter((c) => c.involves_viewer);
  const completedReqIds = new Set(
    viewerCompletedExchanges.map((c) => c.request_id).filter(Boolean)
  );
  const standaloneCompletedReqs = requests.filter(
    (r) => r.status === 'completed' && !completedReqIds.has(r.id)
  );
  const completedCount = viewerCompletedExchanges.length + standaloneCompletedReqs.length;
  const declinedCount = requests.filter((r) => r.status === 'declined').length;
  const cancelledCount = requests.filter((r) => r.status === 'cancelled').length;

  const collectedRatings = [];
  for (const c of viewerCompletedExchanges) {
    const num = Number(c.rating_given);
    if (!Number.isNaN(num) && num >= 1 && num <= 5) {
      collectedRatings.push(num);
    }
  }
  for (const r of standaloneCompletedReqs) {
    const num = Number(r.rating_given);
    if (!Number.isNaN(num) && num >= 1 && num <= 5) {
      collectedRatings.push(num);
    }
  }

  const ratingsCount = collectedRatings.length;
  const averageRating =
    ratingsCount > 0
      ? Number((collectedRatings.reduce((acc, v) => acc + v, 0) / ratingsCount).toFixed(2))
      : null;
  const averageRatingDisplay = averageRating !== null ? `${averageRating.toFixed(2)} ★` : '—';

  const requestActivities = requests.map((r) => {
    const isIncoming = r.direction === 'incoming';
    const partnerName = isIncoming ? r.requester_name : r.recipient_name;
    const partnerInitials = isIncoming ? r.requester_initials : r.recipient_initials;
    const partnerBg = isIncoming ? r.requester_bg : r.recipient_bg;
    const youTeach = isIncoming ? r.wanted_skill_name : r.offered_skill_name;
    const partnerTeaches = isIncoming ? r.offered_skill_name : r.wanted_skill_name;
    return {
      id: `req-${r.id}`,
      requestId: r.id,
      type: 'exchange_request',
      status: r.status,
      direction: r.direction,
      partnerName,
      partnerInitials,
      partnerBg,
      youTeach,
      partnerTeaches,
      sessionDatetime: r.session_datetime || r.proposed_slot,
      sessionMode: r.session_mode || 'Online',
      meetingLinkOrLocation: r.meeting_link_or_location || '',
      sessionNotes: r.session_notes || r.learning_goal || '',
      scheduleStatus: r.schedule_status || 'proposed',
      ratingGiven: r.rating_given || null,
      reviewComment: r.review_comment || '',
      message: r.message,
      timestamp: r.updated_at || r.created_at
    };
  });

  const completedActivities = viewerCompletedExchanges
    .filter((c) => !c.request_id)
    .map((c) => {
      const isPartnerA = Number(c.partner_a_id) === Number(viewerId);
      const partnerName = isPartnerA ? c.partner_b_name : c.partner_a_name;
      const partnerInitials = isPartnerA ? c.partner_b_initials : c.partner_a_initials;
      const partnerBg = isPartnerA ? c.partner_b_bg : c.partner_a_bg;
      const youTeach = isPartnerA ? c.skill_a_taught : c.skill_b_taught;
      const partnerTeaches = isPartnerA ? c.skill_b_taught : c.skill_a_taught;
      return {
        id: `comp-${c.id}`,
        exchangeId: c.id,
        type: 'completed_exchange',
        status: 'completed',
        direction: 'completed',
        partnerName,
        partnerInitials,
        partnerBg,
        youTeach,
        partnerTeaches,
        sessionDatetime: `Completed ${c.completed_at}`,
        sessionMode: 'Online',
        meetingLinkOrLocation: 'Verified Session Log',
        sessionNotes: c.summary_notes,
        scheduleStatus: 'agreed',
        ratingGiven: Number(c.rating_given) || 5,
        reviewComment: c.testimonial || c.summary_notes,
        message: c.testimonial,
        timestamp: c.completed_at
      };
    });

  const recentActivity = [...requestActivities, ...completedActivities].sort((a, b) =>
    String(b.timestamp || '').localeCompare(String(a.timestamp || ''))
  );

  return {
    skillsOverview: {
      skillsOffered,
      skillsWanted
    },
    requestSummary: {
      pendingIncomingCount,
      pendingOutgoingCount,
      pendingIncoming,
      pendingOutgoing
    },
    upcomingExchanges,
    summaryMetrics: {
      totalCompletedCount: completedCount,
      averageRating,
      averageRatingDisplay,
      ratingsCount,
      savedLearningPlansCount: getUserLearningPlans(viewerId).length
    },
    pendingCount,
    pendingIncomingCount,
    pendingOutgoingCount,
    acceptedCount,
    completedCount,
    averageRating,
    averageRatingDisplay,
    ratingsCount,
    declinedCount,
    cancelledCount,
    recentActivity
  };
}

function buildBootstrapPayload(
  requestedViewerId = 1,
  query = '',
  category = 'all',
  proficiency = 'all',
  learningPreference = 'all',
  matchMode = 'all'
) {
  const allUsers = getAllUsersWithSkills(requestedViewerId);
  const viewer =
    allUsers.find((u) => u.id === requestedViewerId) ||
    getUserWithSkills(allUsers[0]?.id || 1, { includePrivateEmail: true });
  const trimmedQuery = String(query || '').trim();
  const queryIntent = trimmedQuery ? parseNaturalLanguageIntent(trimmedQuery) : null;

  const totalCandidatesPool = allUsers.filter((u) => u.id !== viewer.id);
  let candidates = totalCandidatesPool.map((candidate) => {
    const aiMatch = evaluateCompatibility(viewer, candidate, queryIntent);
    return {
      ...candidate,
      aiMatch
    };
  });

  // 1. Searchable directory: Search by member name, skill, or topic (interests/bio/role)
  if (trimmedQuery) {
    const qLower = trimmedQuery.toLowerCase();
    const isNaturalLanguageSentence = trimmedQuery.split(/\s+/).length >= 5;
    candidates = candidates.filter((c) => {
      const corpus = [
        c.name,
        c.display_name,
        c.handle,
        c.role_title,
        c.bio,
        ...(c.interests || []),
        ...(c.skills || []).flatMap((s) => [s.skill_name, s.category, s.description, ...(s.tags || [])])
      ]
        .join(' ')
        .toLowerCase();

      if (corpus.includes(qLower)) return true;
      if (isNaturalLanguageSentence) {
        // For multi-word natural language sentences, match if any extracted skill/keyword hits
        const hasExtracted =
          (queryIntent?.extractedWants || []).some((w) => corpus.includes(w.term) || corpus.includes(w.canonical.toLowerCase())) ||
          (queryIntent?.extractedOffers || []).some((o) => corpus.includes(o.term) || corpus.includes(o.canonical.toLowerCase())) ||
          (queryIntent?.rawKeywords || []).some((kw) => kw.length > 2 && corpus.includes(kw));
        return hasExtracted;
      }
      return false;
    });
  }

  // 2. Category filter: Design, Technology, Languages, Business
  if (category && category !== 'all') {
    const catLower = category.toLowerCase();
    candidates = candidates.filter((c) =>
      c.skills.some((s) => (s.category || '').toLowerCase() === catLower || (s.category || '').toLowerCase().includes(catLower))
    );
  }

  // 3. Proficiency filter: Beginner, Intermediate, Advanced
  if (proficiency && proficiency !== 'all') {
    const profLower = proficiency.toLowerCase();
    candidates = candidates.filter((c) =>
      c.skills.some(
        (s) =>
          (s.proficiency || s.level || '').toLowerCase() === profLower
      )
    );
  }

  // 4. Learning preference filter: Online, In person, Online or in person (Either)
  if (learningPreference && learningPreference !== 'all') {
    const prefLower = learningPreference.toLowerCase();
    const normalizedTarget =
      prefLower === 'online or in person' || prefLower === 'either'
        ? 'either'
        : prefLower;
    candidates = candidates.filter((c) => {
      const cFmt = (c.preferred_format || 'Online').toLowerCase();
      return cFmt === normalizedTarget;
    });
  }

  // 5. Matching workflow filter: teaching_goals (they teach what viewer wants) or reciprocal (2-way match)
  if (matchMode === 'teaching_goals') {
    candidates = candidates.filter((c) => c.aiMatch.teachesYourGoal);
  } else if (matchMode === 'reciprocal') {
    candidates = candidates.filter((c) => c.aiMatch.isDirectDoubleMatch);
  }

  candidates.sort((a, b) => b.aiMatch.score - a.aiMatch.score);

  const requests = getEnrichedRequests(viewer.id);
  const completedExchanges = getEnrichedExchanges(viewer.id);
  const dashboard = buildDashboardPayload(viewer.id, requests, completedExchanges, viewer);
  const totalHours = allUsers.reduce((acc, u) => acc + (Number(u.hours_exchanged) || 0), 0);
  const totalSwaps = completedExchanges.length;

  return {
    token: getOrCreateTokenForUser(viewer.id),
    viewer,
    allUsers: allUsers.map((u) => ({
      id: u.id,
      name: u.name,
      display_name: u.name,
      handle: u.handle,
      role_title: u.role_title,
      avatar_initials: u.avatar_initials,
      avatar_bg: u.avatar_bg
    })),
    candidates,
    totalDirectoryCount: totalCandidatesPool.length,
    matchingCount: candidates.length,
    filtersApplied: {
      query: trimmedQuery,
      category,
      proficiency,
      learningPreference,
      matchMode
    },
    queryIntent,
    requests,
    completedExchanges,
    learningPlans: getUserLearningPlans(viewer.id),
    dashboard,
    stats: {
      communityMembers: allUsers.length,
      completedExchangesCount: totalSwaps,
      totalHoursSaved: Math.round(totalHours),
      activeMatchesCount: candidates.filter((c) => c.aiMatch.score >= 88).length
    }
  };
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
      });
      return res.end();
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const method = req.method.toUpperCase();
    const tokenUserId = getAuthenticatedUserId(req);

    // --- API ROUTES ---

    // 0. GET /health and GET /api/health (Deployment & Readiness Check)
    if ((pathname === '/api/health' || pathname === '/health') && method === 'GET') {
      const counts = {
        profiles: db.prepare('SELECT COUNT(*) as c FROM profiles').get().c,
        skills: db.prepare('SELECT COUNT(*) as c FROM skills').get().c,
        exchange_requests: db.prepare('SELECT COUNT(*) as c FROM exchange_requests').get().c,
        exchange_sessions: db.prepare('SELECT COUNT(*) as c FROM exchange_sessions').get().c,
        reviews: db.prepare('SELECT COUNT(*) as c FROM reviews').get().c,
        learning_plans: db.prepare('SELECT COUNT(*) as c FROM learning_plans').get().c
      };
      return sendJson(res, 200, {
        status: 'ok',
        service: 'SkillSwap Full-Stack API',
        database: 'connected',
        tables: counts
      });
    }

    // 0b. GET /openapi.json and GET /docs (Interactive API Documentation)
    if (pathname === '/openapi.json' && method === 'GET') {
      return sendJson(res, 200, {
        openapi: '3.1.0',
        info: {
          title: 'SkillSwap Reciprocal Learning API',
          version: '2.0.0',
          description: 'Production API for peer-to-peer skill exchange, AI matching, and session scheduling.'
        },
        paths: {
          '/': { get: { summary: 'Root Status / Web App', responses: { '200': { description: 'OK' } } } },
          '/health': { get: { summary: 'Health Check', responses: { '200': { description: 'OK' } } } },
          '/api/health': { get: { summary: 'API Health Check', responses: { '200': { description: 'OK' } } } },
          '/api/bootstrap': { get: { summary: 'Directory, Matches, & Dashboard Bootstrap', responses: { '200': { description: 'OK' } } } },
          '/api/auth/register': { post: { summary: 'Register Member', responses: { '201': { description: 'Created' } } } },
          '/api/auth/login': { post: { summary: 'Login Member', responses: { '200': { description: 'OK' } } } },
          '/api/profile': { put: { summary: 'Update Authenticated Profile', responses: { '200': { description: 'OK' } } } },
          '/api/requests': { get: { summary: 'List Exchange Requests', responses: { '200': { description: 'OK' } } }, post: { summary: 'Create Exchange Request', responses: { '201': { description: 'Created' } } } },
          '/api/dashboard': { get: { summary: 'Member Dashboard Summary', responses: { '200': { description: 'OK' } } } },
          '/api/ai/chat': { post: { summary: 'AI Skill Match Assistant', responses: { '200': { description: 'OK' } } } },
          '/api/ai/profile-helper': { post: { summary: 'AI Profile Bio & Skill Description Helper', responses: { '200': { description: 'OK' } } } },
          '/api/ai/learning-plan': { post: { summary: 'Generate 4-Week AI Learning Plan', responses: { '200': { description: 'OK' } } } },
          '/api/learning-plans': { get: { summary: 'List Saved Learning Plans', responses: { '200': { description: 'OK' } } }, post: { summary: 'Save Learning Plan', responses: { '201': { description: 'Created' } } } }
        }
      });
    }

    if (pathname === '/docs' && method === 'GET') {
      const swaggerHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SkillSwap Reciprocal Learning API - Swagger UI</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/openapi.json',
        dom_id: '#swagger-ui'
      });
    };
  </script>
</body>
</html>`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(swaggerHtml);
    }

    // 1. GET /api/bootstrap (and /api/directory, /api/matches)
    if ((pathname === '/api/bootstrap' || pathname === '/api/directory' || pathname === '/api/matches') && method === 'GET') {
      const requestedViewerId = tokenUserId || Number(parsedUrl.searchParams.get('viewerId')) || 1;
      const query = parsedUrl.searchParams.get('query') || parsedUrl.searchParams.get('search') || '';
      const category = parsedUrl.searchParams.get('category') || 'all';
      const proficiency = parsedUrl.searchParams.get('proficiency') || 'all';
      const learningPreference =
        parsedUrl.searchParams.get('learningPreference') ||
        parsedUrl.searchParams.get('format') ||
        'all';
      const matchMode =
        parsedUrl.searchParams.get('matchMode') ||
        (pathname === '/api/matches' ? 'teaching_goals' : 'all');

      return sendJson(
        res,
        200,
        buildBootstrapPayload(
          requestedViewerId,
          query,
          category,
          proficiency,
          learningPreference,
          matchMode
        )
      );
    }

    // 1b. GET /api/profiles — List public profiles from `profiles` table
    if (pathname === '/api/profiles' && method === 'GET') {
      const profiles = db.prepare('SELECT * FROM profiles ORDER BY id ASC').all().map((p) => ({
        ...p,
        interests: safeJsonParse(p.interests, []),
        availability: safeJsonParse(p.availability, []),
        languages: safeJsonParse(p.languages, [])
      }));
      return sendJson(res, 200, { profiles });
    }

    // 1c. GET /api/skills — List reusable skill names and categories from `skills` table
    if (pathname === '/api/skills' && method === 'GET') {
      const skills = db.prepare('SELECT * FROM skills ORDER BY category ASC, name ASC').all();
      return sendJson(res, 200, { skills });
    }

    // 1d. GET /api/exchange-requests — List exchange requests for active viewer
    if ((pathname === '/api/exchange-requests' || pathname === '/api/requests') && method === 'GET') {
      const requestedViewerId = tokenUserId || Number(parsedUrl.searchParams.get('viewerId')) || 1;
      return sendJson(res, 200, { exchange_requests: getEnrichedRequests(requestedViewerId) });
    }

    // 2. GET /api/auth/me — Verify current session token
    if (pathname === '/api/auth/me' && method === 'GET') {
      if (!tokenUserId) {
        return sendJson(res, 401, { error: 'Unauthorized: Valid session token required.' });
      }
      return sendJson(res, 200, { user: getUserWithSkills(tokenUserId, { includePrivateEmail: true }) });
    }

    // 3. POST /api/auth/login — Authenticate registered member by email or handle + password
    if (pathname === '/api/auth/login' && method === 'POST') {
      const body = await parseBody(req);
      const identifier = (body.email || body.handle || '').trim().toLowerCase();
      const password = body.password || '';

      if (!identifier || !password) {
        return sendJson(res, 400, { error: 'Email/handle and password are required.' });
      }

      const userRow = db
        .prepare('SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(handle) = ?')
        .get(identifier, identifier);

      if (!userRow) {
        return sendJson(res, 401, { error: 'No account found with that email or handle.' });
      }

      const expectedHash = hashPassword(password);
      if (userRow.password_hash && userRow.password_hash !== expectedHash) {
        return sendJson(res, 401, { error: 'Incorrect password. (Demo accounts use: skillswap123)' });
      }

      const token = issueTokenForUser(userRow.id);
      return sendJson(res, 200, {
        token,
        user: getUserWithSkills(userRow.id, { includePrivateEmail: true })
      });
    }

    // 4. POST /api/auth/switch — Issue session token for demo persona switching
    if (pathname === '/api/auth/switch' && method === 'POST') {
      const body = await parseBody(req);
      const targetId = Number(body.userId) || 1;
      const user = getUserWithSkills(targetId, { includePrivateEmail: true });
      if (!user) {
        return sendJson(res, 404, { error: 'User not found' });
      }
      const token = issueTokenForUser(user.id);
      return sendJson(res, 200, { token, user });
    }

    // 5. POST /api/ai/concierge — AI Natural Language Discovery & Matching
    if (pathname === '/api/ai/concierge' && method === 'POST') {
      const body = await parseBody(req);
      const viewerId = tokenUserId || Number(body.viewerId) || 1;
      const prompt = (body.prompt || '').trim();
      const category = body.category || 'all';

      const allUsers = getAllUsersWithSkills();
      const viewer = allUsers.find((u) => u.id === viewerId) || allUsers[0];
      const queryIntent = parseNaturalLanguageIntent(prompt);

      let candidates = allUsers
        .filter((u) => u.id !== viewer.id)
        .map((candidate) => ({
          ...candidate,
          aiMatch: evaluateCompatibility(viewer, candidate, queryIntent)
        }));

      if (category && category !== 'all') {
        candidates = candidates.filter((c) =>
          c.skills.some((s) => s.category.toLowerCase().includes(category.toLowerCase()))
        );
      }

      candidates.sort((a, b) => b.aiMatch.score - a.aiMatch.score);

      return sendJson(res, 200, {
        queryIntent,
        candidates,
        topRecommendation: candidates[0] || null
      });
    }

    // 6. POST /api/ai/session-plan — Generate custom AI Session Agenda & Pitch for Request Modal
    if (pathname === '/api/ai/session-plan' && method === 'POST') {
      const body = await parseBody(req);
      const requester = getUserWithSkills(tokenUserId || Number(body.requesterId) || 1);
      const recipient = getUserWithSkills(Number(body.recipientId) || 2);
      const offeredSkillName = body.offeredSkillName || requester?.offers[0]?.skill_name || 'Excel';
      const wantedSkillName = body.wantedSkillName || recipient?.offers[0]?.skill_name || 'Graphic Design';
      const durationMins = Number(body.durationMins) || 60;
      const customGoal = (body.learningGoal || '').trim();

      const offeredSkillObj =
        requester?.offers.find((s) => s.skill_name === offeredSkillName) || {
          skill_name: offeredSkillName,
          level: 'Advanced',
          description: `Practical coaching in ${offeredSkillName}`
        };
      const wantedSkillObj =
        recipient?.offers.find((s) => s.skill_name === wantedSkillName) || {
          skill_name: wantedSkillName,
          level: 'Expert',
          description: `Hands-on learning in ${wantedSkillName}`
        };

      const agenda = generateSessionBlueprint({
        viewerName: requester?.name || 'You',
        candidateName: recipient?.name || 'Partner',
        youTeachSkill: offeredSkillName,
        theyTeachSkill: wantedSkillName,
        youTeachDesc: offeredSkillObj.description,
        theyTeachDesc: customGoal || wantedSkillObj.description,
        durationMins
      });

      const recFirst = (recipient?.name || 'there').split(' ')[0];
      const suggestedMessage = `Hi ${recFirst}! I'd love to propose a ${durationMins}-minute 50/50 SkillSwap session: I can teach you ${offeredSkillName} for the first half, and learn ${wantedSkillName} from you in the second half.${
        customGoal ? ` My specific focus goal is: "${customGoal}".` : ''
      } Let me know if the proposed time slot works for you!`;

      return sendJson(res, 200, {
        agenda,
        suggestedMessage,
        suggestedGoal:
          customGoal ||
          `Trade a ${Math.floor(durationMins / 2)}-min ${offeredSkillName} clinic for a ${Math.floor(
            durationMins / 2
          )}-min hands-on ${wantedSkillName} workshop.`
      });
    }

    // 7. POST /api/users (or /api/auth/register) — Register a new user profile with hashed password
    if ((pathname === '/api/users' || pathname === '/api/auth/register') && method === 'POST') {
      const body = await parseBody(req);
      const name = (body.name || '').trim();
      if (!name) {
        return sendJson(res, 400, { error: 'Name is required.' });
      }
      const cleanSlug = name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'member';
      const baseHandle = (body.handle || cleanSlug) + '_' + Math.floor(100 + Math.random() * 899);
      const email = (body.email || `${baseHandle}@skillswap.io`).trim().toLowerCase();

      const existingEmail = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(email);
      if (existingEmail) {
        return sendJson(res, 409, { error: 'An account with that email already exists.' });
      }

      const rawPassword = body.password || 'skillswap123';
      if (String(rawPassword).length < 6) {
        return sendJson(res, 400, { error: 'Password must be at least 6 characters.' });
      }
      const passHash = hashPassword(rawPassword);

      const roleTitle = (body.role_title || 'SkillSwap Community Member').trim();
      const bio = (body.bio || 'Excited to trade practical skills through 1-on-1 peer learning sessions!').trim();
      const interests = Array.isArray(body.interests)
        ? body.interests
        : typeof body.interests === 'string' && body.interests.trim()
        ? body.interests.split(',').map((s) => s.trim()).filter(Boolean)
        : ['Peer Learning', 'Skill Exchange'];
      const location = (body.location || 'Remote / Global').trim();
      const timezone = (body.timezone || 'UTC-5 (EST)').trim();
      const preferredFormat = ['Online', 'In person', 'Either'].includes(body.preferred_format)
        ? body.preferred_format
        : (body.preferred_format || 'Online').trim();
      const sessionLength = Number(body.session_length_mins) || 60;
      const availability = Array.isArray(body.availability) && body.availability.length > 0
        ? body.availability
        : ['Weekday Evenings', 'Saturday Mornings'];
      const languages = Array.isArray(body.languages) && body.languages.length > 0
        ? body.languages
        : ['English (Fluent)'];

      const parts = name.split(/\s+/);
      const initials = ((parts[0]?.[0] || 'S') + (parts[1]?.[0] || parts[0]?.[1] || 'S')).toUpperCase();
      const colors = ['#0F766E', '#C2410C', '#4338CA', '#B45309', '#be185d', '#0369A1'];
      const bg = colors[Math.floor(Math.random() * colors.length)];

      const resInsert = db
        .prepare(
          `
        INSERT INTO users (
          name, handle, email, password_hash, role_title, bio, interests, avatar_initials, avatar_bg,
          location, timezone, availability, preferred_format,
          session_length_mins, languages, rating, completed_swaps_count, hours_exchanged
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 5.0, 0, 0)
      `
        )
        .run(
          name,
          baseHandle,
          email,
          passHash,
          roleTitle,
          bio,
          JSON.stringify(interests),
          initials,
          bg,
          location,
          timezone,
          JSON.stringify(availability),
          preferredFormat,
          sessionLength,
          JSON.stringify(languages)
        );

      const newUserId = Number(resInsert.lastInsertRowid);
      const insertSkill = db.prepare(`
        INSERT INTO user_skills (user_id, type, skill_name, category, level, description, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const offers = Array.isArray(body.offers) ? body.offers : [];
      const wants = Array.isArray(body.wants) ? body.wants : [];

      for (const o of offers) {
        const sName = (o.skill_name || o.skill || '').trim();
        if (sName) {
          insertSkill.run(
            newUserId,
            'offer',
            sName,
            normalizeCategory(o.category || 'Business'),
            normalizeProficiency(o.level || o.proficiency, 'Intermediate'),
            o.description || `Hands-on coaching in ${sName}`,
            JSON.stringify(o.tags || [sName.toLowerCase()])
          );
        }
      }
      for (const w of wants) {
        const sName = (w.skill_name || w.skill || '').trim();
        if (sName) {
          insertSkill.run(
            newUserId,
            'want',
            sName,
            normalizeCategory(w.category || 'Technology'),
            normalizeProficiency(w.level || w.proficiency, 'Beginner'),
            w.description || `Looking to learn practical ${sName}`,
            JSON.stringify(w.tags || [sName.toLowerCase()])
          );
        }
      }

      const token = issueTokenForUser(newUserId);
      const createdUser = getUserWithSkills(newUserId, { includePrivateEmail: true });
      return sendJson(res, 201, { token, user: createdUser });
    }

    // 8. PUT /api/users/:id — Update user profile details (Access Control: authenticated owner only)
    const userMatch = pathname.match(/^\/api\/users\/(\d+)$/);
    if (userMatch && method === 'PUT') {
      if (!tokenUserId) {
        return sendJson(res, 401, { error: 'Unauthorized: Valid Bearer authentication token required.' });
      }
      const userId = Number(userMatch[1]);
      if (tokenUserId !== userId) {
        return sendJson(res, 403, { error: 'Forbidden: You can only edit your own profile.' });
      }
      const existing = getUserWithSkills(userId, { includePrivateEmail: true });
      if (!existing) {
        return sendJson(res, 404, { error: 'User not found' });
      }
      const body = await parseBody(req);
      const name = (body.name || existing.name).trim();
      const roleTitle = (body.role_title || existing.role_title).trim();
      const bio = (body.bio || existing.bio).trim();
      const interests = Array.isArray(body.interests)
        ? body.interests
        : typeof body.interests === 'string'
        ? body.interests.split(',').map((s) => s.trim()).filter(Boolean)
        : existing.interests;
      const location = (body.location || existing.location).trim();
      const timezone = (body.timezone || existing.timezone).trim();
      const preferredFormat = (body.preferred_format || existing.preferred_format).trim();
      const sessionLength = Number(body.session_length_mins) || existing.session_length_mins;
      const availability = Array.isArray(body.availability) ? body.availability : existing.availability;

      db.prepare(
        `
        UPDATE users
        SET name = ?, role_title = ?, bio = ?, interests = ?, location = ?, timezone = ?,
            preferred_format = ?, session_length_mins = ?, availability = ?
        WHERE id = ?
      `
      ).run(
        name,
        roleTitle,
        bio,
        JSON.stringify(interests),
        location,
        timezone,
        preferredFormat,
        sessionLength,
        JSON.stringify(availability),
        userId
      );

      return sendJson(res, 200, { user: getUserWithSkills(userId, { includePrivateEmail: true }) });
    }

    // 9. POST /api/users/:id/skills — Create a skill listing (Access Control: authenticated owner only)
    const userSkillMatch = pathname.match(/^\/api\/users\/(\d+)\/skills$/);
    if (userSkillMatch && method === 'POST') {
      if (!tokenUserId) {
        return sendJson(res, 401, { error: 'Unauthorized: Valid Bearer authentication token required.' });
      }
      const userId = Number(userSkillMatch[1]);
      if (tokenUserId !== userId) {
        return sendJson(res, 403, { error: 'Forbidden: You can only add skills to your own profile.' });
      }
      const body = await parseBody(req);
      const type = body.type === 'want' ? 'want' : 'offer';
      const skillName = (body.skill_name || body.skill || '').trim();
      if (!skillName) {
        return sendJson(res, 400, { error: 'Skill name is required.' });
      }
      const category = normalizeCategory(body.category || 'Business');
      const level = normalizeProficiency(body.level || body.proficiency, type === 'offer' ? 'Intermediate' : 'Beginner');
      const description = (
        body.description ||
        (type === 'offer'
          ? `1-on-1 practical walkthroughs and templates for ${skillName}.`
          : `Want to learn hands-on ${skillName} fundamentals through live practice.`)
      ).trim();
      const tags = skillName
        .toLowerCase()
        .split(/[\s,&/]+/)
        .filter(Boolean);

      db.prepare(
        `
        INSERT INTO user_skills (user_id, type, skill_name, category, level, description, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      ).run(userId, type, skillName, category, level, description, JSON.stringify(tags));

      return sendJson(res, 201, { user: getUserWithSkills(userId, { includePrivateEmail: true }) });
    }

    // 10. PUT /api/skills/:skillId — Edit an existing skill listing (Access Control: authenticated owner only)
    const skillMatch = pathname.match(/^\/api\/skills\/(\d+)$/);
    if (skillMatch && method === 'PUT') {
      if (!tokenUserId) {
        return sendJson(res, 401, { error: 'Unauthorized: Valid Bearer authentication token required.' });
      }
      const skillId = Number(skillMatch[1]);
      const skillRow = db.prepare('SELECT * FROM user_skills WHERE id = ?').get(skillId);
      if (!skillRow) {
        return sendJson(res, 404, { error: 'Skill not found' });
      }
      if (tokenUserId !== skillRow.user_id) {
        return sendJson(res, 403, { error: 'Forbidden: You can only edit your own skill listings.' });
      }
      const body = await parseBody(req);
      const skillName = (body.skill_name || body.skill || skillRow.skill_name).trim();
      const category = normalizeCategory(body.category || skillRow.category);
      const level = normalizeProficiency(body.level || body.proficiency || skillRow.level, skillRow.level);
      const description = (body.description !== undefined ? body.description : skillRow.description).trim();
      const tags = skillName
        .toLowerCase()
        .split(/[\s,&/]+/)
        .filter(Boolean);

      db.prepare(
        `
        UPDATE user_skills
        SET skill_name = ?, category = ?, proficiency = ?, level = ?, description = ?, tags = ?
        WHERE id = ?
      `
      ).run(skillName, category, level, level, description, JSON.stringify(tags), skillId);

      return sendJson(res, 200, { user: getUserWithSkills(skillRow.user_id, { includePrivateEmail: true }) });
    }

    // 11. DELETE /api/skills/:skillId — Delete a skill listing (Access Control: authenticated owner only)
    if (skillMatch && method === 'DELETE') {
      if (!tokenUserId) {
        return sendJson(res, 401, { error: 'Unauthorized: Valid Bearer authentication token required.' });
      }
      const skillId = Number(skillMatch[1]);
      const skillRow = db.prepare('SELECT * FROM user_skills WHERE id = ?').get(skillId);
      if (!skillRow) {
        return sendJson(res, 404, { error: 'Skill not found' });
      }
      if (tokenUserId !== skillRow.user_id) {
        return sendJson(res, 403, { error: 'Forbidden: You can only delete your own skill listings.' });
      }
      db.prepare('DELETE FROM user_skills WHERE id = ?').run(skillId);
      return sendJson(res, 200, { user: getUserWithSkills(skillRow.user_id, { includePrivateEmail: true }) });
    }

    // 11b. GET /api/dashboard — Member Dashboard (pending, accepted, completed counts + recent activity)
    if (pathname === '/api/dashboard' && method === 'GET') {
      const viewerId = tokenUserId || Number(parsedUrl.searchParams.get('viewerId')) || 1;
      const requests = getEnrichedRequests(viewerId);
      const completedExchanges = getEnrichedExchanges(viewerId);
      return sendJson(res, 200, {
        dashboard: buildDashboardPayload(viewerId, requests, completedExchanges),
        requests,
        completedExchanges
      });
    }

    // 11c. GET /api/requests (or /api/exchange-requests) — List authenticated member's own exchange requests
    if ((pathname === '/api/requests' || pathname === '/api/exchange-requests') && method === 'GET') {
      const viewerId = tokenUserId || Number(parsedUrl.searchParams.get('viewerId')) || 1;
      const statusFilter = (parsedUrl.searchParams.get('status') || 'all').toLowerCase();
      let requests = getEnrichedRequests(viewerId);
      if (statusFilter !== 'all') {
        requests = requests.filter((r) => (r.status || '').toLowerCase() === statusFilter);
      }
      return sendJson(res, 200, { requests });
    }

    // 12. POST /api/requests (or /api/exchange-requests) — Create a new skill-exchange session request
    if ((pathname === '/api/requests' || pathname === '/api/exchange-requests') && method === 'POST') {
      if (!tokenUserId) {
        return sendJson(res, 401, { error: 'Unauthorized: Valid Bearer authentication token required.' });
      }
      const body = await parseBody(req);
      const requesterId = tokenUserId;
      const recipientId = Number(body.recipient_id);
      if (!recipientId || requesterId === recipientId) {
        return sendJson(res, 400, { error: 'Valid recipient is required.' });
      }

      const requester = getUserWithSkills(requesterId);
      const recipient = getUserWithSkills(recipientId);
      if (!requester || !recipient) {
        return sendJson(res, 404, { error: 'User not found.' });
      }

      const aiEval = evaluateCompatibility(requester, recipient);
      const offeredSkillName = (body.offered_skill_name || aiEval.youTeach.skillName).trim();
      const wantedSkillName = (body.wanted_skill_name || aiEval.theyTeach.skillName).trim();
      const proposedSlot = (
        body.session_datetime ||
        body.proposed_slot ||
        'Thursday, 6:00 PM – 7:00 PM (Weekday Evening)'
      ).trim();
      const durationMins = Number(body.duration_mins) || 60;
      const format = (body.format || '1-on-1 Live Video + Screen Share').trim();
      const sessionDatetime = (body.session_datetime || proposedSlot).trim();
      const sessionMode = ['Online', 'In person'].includes(body.session_mode)
        ? body.session_mode
        : format.toLowerCase().includes('person')
        ? 'In person'
        : 'Online';
      const meetingLinkOrLocation = (
        body.meeting_link_or_location ||
        (sessionMode === 'In person'
          ? 'Local Café / Shared Study Space'
          : 'https://meet.skillswap.io/reciprocal-session')
      ).trim();
      const learningGoal = (
        body.learning_goal ||
        `Trade ${offeredSkillName} coaching for hands-on ${wantedSkillName} practice.`
      ).trim();
      const sessionNotes = (body.session_notes || learningGoal).trim();
      const scheduleStatus = body.schedule_status === 'agreed' ? 'agreed' : 'proposed';
      const message = (body.message || aiEval.suggestedPitch).trim();

      const customAgenda =
        Array.isArray(body.ai_session_agenda) && body.ai_session_agenda.length > 0
          ? body.ai_session_agenda
          : generateSessionBlueprint({
              viewerName: requester.name,
              candidateName: recipient.name,
              youTeachSkill: offeredSkillName,
              theyTeachSkill: wantedSkillName,
              youTeachDesc: learningGoal,
              theyTeachDesc: learningGoal,
              durationMins
            });

      const insertRes = db
        .prepare(
          `
        INSERT INTO swap_requests (
          requester_id, recipient_id, offered_skill_name, wanted_skill_name,
          proposed_slot, duration_mins, format,
          session_datetime, session_mode, meeting_link_or_location, session_notes, schedule_status,
          learning_goal, message,
          ai_match_score, ai_match_rationale, ai_session_agenda, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `
        )
        .run(
          requesterId,
          recipientId,
          offeredSkillName,
          wantedSkillName,
          proposedSlot,
          durationMins,
          format,
          sessionDatetime,
          sessionMode,
          meetingLinkOrLocation,
          sessionNotes,
          scheduleStatus,
          learningGoal,
          message,
          aiEval.score,
          aiEval.rationale,
          JSON.stringify(customAgenda)
        );

      const newReqId = Number(insertRes.lastInsertRowid);
      const requests = getEnrichedRequests(requesterId);
      const createdRequest = requests.find((r) => r.id === newReqId);
      const completedExchanges = getEnrichedExchanges(requesterId);

      return sendJson(res, 201, {
        request: createdRequest,
        requests,
        dashboard: buildDashboardPayload(requesterId, requests, completedExchanges)
      });
    }

    // 13a. PUT / PATCH /api/requests/:id/schedule — Propose, review, edit, or agree on session scheduling details
    const scheduleReqMatch = pathname.match(/^\/api\/(?:requests|exchange-requests)\/(\d+)\/schedule$/);
    if (scheduleReqMatch && (method === 'PUT' || method === 'PATCH')) {
      if (!tokenUserId) {
        return sendJson(res, 401, { error: 'Unauthorized: Valid Bearer authentication token required.' });
      }
      const reqId = Number(scheduleReqMatch[1]);
      const actorId = tokenUserId;
      const existing = db.prepare('SELECT * FROM swap_requests WHERE id = ?').get(reqId);
      if (!existing) {
        return sendJson(res, 404, { error: 'Request not found' });
      }
      if (actorId !== existing.requester_id && actorId !== existing.recipient_id) {
        return sendJson(res, 403, { error: 'Forbidden: Only participants in this exchange request can view or edit session scheduling.' });
      }

      const body = await parseBody(req);
      const sessionDatetime = (
        body.session_datetime !== undefined
          ? body.session_datetime
          : body.proposed_slot !== undefined
          ? body.proposed_slot
          : existing.session_datetime || existing.proposed_slot
      ).trim();
      const sessionMode = ['Online', 'In person'].includes(body.session_mode)
        ? body.session_mode
        : existing.session_mode || 'Online';
      const meetingLinkOrLocation = (
        body.meeting_link_or_location !== undefined
          ? body.meeting_link_or_location
          : existing.meeting_link_or_location || ''
      ).trim();
      const sessionNotes = (
        body.session_notes !== undefined ? body.session_notes : existing.session_notes || ''
      ).trim();
      const scheduleStatus =
        body.schedule_status === 'agreed'
          ? 'agreed'
          : body.schedule_status === 'proposed'
          ? 'proposed'
          : existing.schedule_status || 'proposed';
      const durationMins = Number(body.duration_mins) || existing.duration_mins || 60;

      db.prepare(
        `
        UPDATE swap_requests
        SET proposed_slot = ?,
            duration_mins = ?,
            session_datetime = ?,
            session_mode = ?,
            meeting_link_or_location = ?,
            session_notes = ?,
            schedule_status = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `
      ).run(
        sessionDatetime,
        durationMins,
        sessionDatetime,
        sessionMode,
        meetingLinkOrLocation,
        sessionNotes,
        scheduleStatus,
        reqId
      );

      const requests = getEnrichedRequests(actorId);
      const completedExchanges = getEnrichedExchanges(actorId);
      return sendJson(res, 200, {
        request: requests.find((r) => r.id === reqId),
        requests,
        dashboard: buildDashboardPayload(actorId, requests, completedExchanges)
      });
    }

    // 13b. PATCH /api/requests/:id (or /api/exchange-requests/:id) — Manage request status & session details with strict permissions
    const patchReqMatch = pathname.match(/^\/api\/(?:requests|exchange-requests)\/(\d+)$/);
    if (patchReqMatch && (method === 'PATCH' || method === 'PUT')) {
      if (!tokenUserId) {
        return sendJson(res, 401, { error: 'Unauthorized: Valid Bearer authentication token required.' });
      }
      const reqId = Number(patchReqMatch[1]);
      const body = await parseBody(req);
      const newStatus = body.status;
      const actorId = tokenUserId;

      const existing = db.prepare('SELECT * FROM swap_requests WHERE id = ?').get(reqId);
      if (!existing) {
        return sendJson(res, 404, { error: 'Request not found' });
      }

      // Access Control: Must be requester or recipient
      if (actorId !== existing.requester_id && actorId !== existing.recipient_id) {
        return sendJson(res, 403, { error: 'Forbidden: You are not a participant in this exchange request.' });
      }

      if (newStatus) {
        if (!['accepted', 'declined', 'cancelled', 'completed'].includes(newStatus)) {
          return sendJson(res, 400, { error: 'Invalid status transition.' });
        }

        // Role & Transition validation
        if ((newStatus === 'accepted' || newStatus === 'declined') && actorId !== existing.recipient_id) {
          return sendJson(res, 403, { error: 'Only the recipient can accept or decline an incoming request.' });
        }
        if (newStatus === 'cancelled') {
          if (actorId !== existing.requester_id) {
            return sendJson(res, 403, { error: 'Only the sender can cancel an outgoing request.' });
          }
          if (existing.status !== 'pending') {
            return sendJson(res, 400, { error: 'Only pending requests can be cancelled.' });
          }
        }
      }

      const finalStatus = newStatus || existing.status;
      const sessionDatetime = (
        body.session_datetime !== undefined
          ? body.session_datetime
          : body.proposed_slot !== undefined
          ? body.proposed_slot
          : existing.session_datetime || existing.proposed_slot
      ).trim();
      const sessionMode = ['Online', 'In person'].includes(body.session_mode)
        ? body.session_mode
        : existing.session_mode || 'Online';
      const meetingLinkOrLocation = (
        body.meeting_link_or_location !== undefined
          ? body.meeting_link_or_location
          : existing.meeting_link_or_location || ''
      ).trim();
      const sessionNotes = (
        body.session_notes !== undefined ? body.session_notes : existing.session_notes || ''
      ).trim();
      const scheduleStatus =
        body.schedule_status !== undefined
          ? body.schedule_status === 'agreed'
            ? 'agreed'
            : 'proposed'
          : finalStatus === 'accepted'
          ? 'agreed'
          : existing.schedule_status || 'proposed';

      db.prepare(
        `
        UPDATE swap_requests
        SET status = ?,
            proposed_slot = ?,
            session_datetime = ?,
            session_mode = ?,
            meeting_link_or_location = ?,
            session_notes = ?,
            schedule_status = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `
      ).run(
        finalStatus,
        sessionDatetime,
        sessionDatetime,
        sessionMode,
        meetingLinkOrLocation,
        sessionNotes,
        scheduleStatus,
        reqId
      );

      const requests = getEnrichedRequests(actorId);
      const completedExchanges = getEnrichedExchanges(actorId);
      return sendJson(res, 200, {
        request: requests.find((r) => r.id === reqId),
        requests,
        dashboard: buildDashboardPayload(actorId, requests, completedExchanges)
      });
    }

    // 14. POST /api/exchanges (or POST /api/requests/:id/review) — Mark exchange completed, rate 1–5 stars, and write review
    const reviewReqMatch = pathname.match(/^\/api\/(?:requests|exchange-requests)\/(\d+)\/review$/);
    if ((pathname === '/api/exchanges' || reviewReqMatch) && method === 'POST') {
      if (!tokenUserId) {
        return sendJson(res, 401, { error: 'Unauthorized: Valid Bearer authentication token required.' });
      }
      const body = await parseBody(req);
      const viewerId = tokenUserId;
      const requestId = reviewReqMatch
        ? Number(reviewReqMatch[1])
        : body.request_id
        ? Number(body.request_id)
        : null;

      let partnerAId = Number(body.partner_a_id) || viewerId;
      let partnerBId = Number(body.partner_b_id);
      let skillATaught = (body.skill_a_taught || '').trim();
      let skillBTaught = (body.skill_b_taught || '').trim();
      let durationMins = Number(body.duration_mins) || 60;

      const rawRating = Number(body.rating_given !== undefined ? body.rating_given : body.rating || 5);
      if (Number.isNaN(rawRating) || rawRating < 1 || rawRating > 5) {
        return sendJson(res, 400, { error: 'Rating must be between 1 and 5 stars.' });
      }
      const ratingGiven = Math.round(rawRating);
      const reviewComment = (
        body.testimonial ||
        body.review_comment ||
        body.review ||
        body.summary_notes ||
        ''
      ).trim();

      if (requestId) {
        const reqRow = db.prepare('SELECT * FROM swap_requests WHERE id = ?').get(requestId);
        if (!reqRow) {
          return sendJson(res, 404, { error: 'Exchange request not found.' });
        }
        if (viewerId !== reqRow.requester_id && viewerId !== reqRow.recipient_id) {
          return sendJson(res, 403, { error: 'Forbidden: Only session participants can complete and review this exchange.' });
        }

        // Prevent duplicate reviews by the same reviewer for the same session (FR-06)
        const existingRev = db
          .prepare('SELECT id FROM reviews WHERE request_id = ? AND reviewer_id = ?')
          .get(requestId, viewerId);
        if (existingRev) {
          return sendJson(res, 409, {
            error: 'Duplicate review: You have already submitted a review for this exchange session.'
          });
        }

        partnerAId = reqRow.requester_id;
        partnerBId = reqRow.recipient_id;
        skillATaught = skillATaught || reqRow.offered_skill_name;
        skillBTaught = skillBTaught || reqRow.wanted_skill_name;
        durationMins = Number(body.duration_mins) || reqRow.duration_mins || 60;

        const revieweeId = viewerId === reqRow.requester_id ? reqRow.recipient_id : reqRow.requester_id;
        db.prepare(
          `
          UPDATE swap_requests
          SET status = 'completed',
              schedule_status = 'agreed',
              rating_given = ?,
              review_comment = ?,
              updated_at = datetime('now')
          WHERE id = ?
        `
        ).run(
          ratingGiven,
          reviewComment || `Completed ${skillATaught} ⇄ ${skillBTaught} exchange (${ratingGiven}/5 stars).`,
          requestId
        );

        db.prepare(
          `INSERT INTO reviews (request_id, reviewer_id, reviewee_id, rating, comment) VALUES (?, ?, ?, ?, ?)`
        ).run(
          requestId,
          viewerId,
          revieweeId,
          ratingGiven,
          reviewComment || `Completed ${skillATaught} ⇄ ${skillBTaught} exchange (${ratingGiven}/5 stars).`
        );
      }

      if (!partnerBId) {
        return sendJson(res, 400, { error: 'Partner user ID is required.' });
      }

      const summaryNotes = (
        body.summary_notes ||
        reviewComment ||
        `Completed a ${durationMins}-minute 50/50 reciprocal skill exchange trading ${skillATaught} for ${skillBTaught}.`
      ).trim();

      const takeaways =
        Array.isArray(body.takeaways) && body.takeaways.length > 0
          ? body.takeaways
          : [
              `Practiced hands-on workflows in ${skillBTaught} with live feedback`,
              `Shared reusable templates and mental models for ${skillATaught}`,
              `Verified ${durationMins} minutes of mutual peer-to-peer learning`
            ];

      const testimonial = (
        reviewComment ||
        `Super high-value reciprocal session! Trading ${skillATaught} for ${skillBTaught} saved us both hours of solo trial-and-error.`
      ).trim();

      db.prepare(
        `
        INSERT INTO completed_exchanges (
          request_id, partner_a_id, partner_b_id, skill_a_taught, skill_b_taught,
          duration_mins, summary_notes, takeaways, rating_given, testimonial, verified_badge
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Verified 1-to-1 Reciprocal Swap')
      `
      ).run(
        requestId,
        partnerAId,
        partnerBId,
        skillATaught,
        skillBTaught,
        durationMins,
        summaryNotes,
        JSON.stringify(takeaways),
        ratingGiven,
        testimonial
      );

      const hoursAdded = Number((durationMins / 60).toFixed(2));
      db.prepare(
        `UPDATE users SET completed_swaps_count = completed_swaps_count + 1, hours_exchanged = ROUND(hours_exchanged + ?, 2) WHERE id IN (?, ?)`
      ).run(hoursAdded, partnerAId, partnerBId);

      // Update partner's average rating slightly toward ratingGiven
      const otherPartnerId = viewerId === partnerAId ? partnerBId : partnerAId;
      const otherUser = db.prepare('SELECT rating, completed_swaps_count FROM users WHERE id = ?').get(otherPartnerId);
      if (otherUser) {
        const count = Math.max(1, Number(otherUser.completed_swaps_count) || 1);
        const newAvg = Number((((Number(otherUser.rating || 5) * (count - 1)) + ratingGiven) / count).toFixed(2));
        db.prepare('UPDATE users SET rating = ? WHERE id = ?').run(newAvg, otherPartnerId);
      }

      const requests = getEnrichedRequests(viewerId);
      const completedExchanges = getEnrichedExchanges(viewerId);
      return sendJson(res, 201, {
        viewer: getUserWithSkills(viewerId, { includePrivateEmail: true }),
        requests,
        completedExchanges,
        dashboard: buildDashboardPayload(viewerId, requests, completedExchanges)
      });
    }

    // 16. POST /api/ai/chat — Database-Grounded AI Skill Match Assistant
    if (pathname === '/api/ai/chat' && method === 'POST') {
      const body = await parseBody(req);
      const rawMessage = String(body.message || '').trim();
      if (!rawMessage) {
        return sendJson(res, 400, { error: 'Please enter a question for the AI Skill Assistant.' });
      }

      const viewerId = tokenUserId || Number(body.viewerId) || Number(parsedUrl.searchParams.get('viewerId')) || 1;
      const allUsers = getAllUsersWithSkills(viewerId);
      const dbViewer = allUsers.find((u) => u.id === viewerId) || allUsers[0];
      const candidates = allUsers.filter((u) => u.id !== dbViewer.id);

      // Merge any learning-profile context passed from React with the database member profile
      const profileContext = body.profileContext || {};
      const mergedViewer = {
        ...dbViewer,
        name: profileContext.name || dbViewer.name,
        offers:
          Array.isArray(profileContext.offers) && profileContext.offers.length > 0
            ? profileContext.offers.map((s) =>
                typeof s === 'string' ? { skill_name: s, category: normalizeCategory(s), level: 'Intermediate' } : s
              )
            : dbViewer.offers,
        wants:
          Array.isArray(profileContext.wants) && profileContext.wants.length > 0
            ? profileContext.wants.map((s) =>
                typeof s === 'string' ? { skill_name: s, category: normalizeCategory(s), level: 'Beginner' } : s
              )
            : dbViewer.wants
      };

      const chatResult = generateAiChatResponse({
        message: rawMessage,
        viewer: mergedViewer,
        candidates,
        history: Array.isArray(body.history) ? body.history : []
      });

      return sendJson(res, 200, {
        ...chatResult,
        authenticatedViewerId: dbViewer.id,
        providerMode: process.env.GEMINI_API_KEY
          ? 'gemini-grounded-db'
          : process.env.OPENAI_API_KEY
          ? 'openai-grounded-db'
          : 'skillswap-semantic-db-engine',
        securityNote:
          'Recommendations are strictly grounded in real database member records; AI API keys remain exclusively on the backend.'
      });
    }

    // 17. POST /api/ai/profile-helper — AI Profile Bio & Skill Description Helper
    if (pathname === '/api/ai/profile-helper' && method === 'POST') {
      const body = await parseBody(req);
      // Data Minimization: Extract ONLY task, rough_notes (or notes), and skill_name
      const task = body.task;
      const roughNotes = body.rough_notes !== undefined ? body.rough_notes : body.notes;
      const skillName = body.skill_name !== undefined ? body.skill_name : body.skillName;

      try {
        const result = generateProfileOrSkillSuggestion({
          task,
          roughNotes,
          skillName
        });
        return sendJson(res, 200, result);
      } catch (validationErr) {
        return sendJson(res, validationErr.statusCode || 400, {
          error: validationErr.message || 'Invalid profile helper request.'
        });
      }
    }

    // 18. POST /api/auth/logout — Revoke authenticated session token (FR-01)
    if (pathname === '/api/auth/logout' && method === 'POST') {
      const authHeader = req.headers['authorization'] || '';
      if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();
        if (token) {
          db.prepare('DELETE FROM auth_sessions WHERE token = ?').run(token);
        }
      }
      return sendJson(res, 200, { loggedOut: true });
    }

    // 19. POST /api/reviews — Submit a review for a completed exchange session (FR-06)
    if (pathname === '/api/reviews' && method === 'POST') {
      if (!tokenUserId) {
        return sendJson(res, 401, { error: 'Unauthorized: Valid Bearer authentication token required.' });
      }
      const body = await parseBody(req);
      const requestId = Number(body.request_id || body.exchange_request_id);
      const rating = Math.round(Number(body.rating || body.rating_given));
      const comment = String(body.comment || body.review_comment || '').trim();

      if (!requestId) {
        return sendJson(res, 400, { error: 'request_id is required to submit a review.' });
      }
      if (Number.isNaN(rating) || rating < 1 || rating > 5) {
        return sendJson(res, 400, { error: 'Rating must be between 1 and 5 stars.' });
      }

      const reqRow = db.prepare('SELECT * FROM swap_requests WHERE id = ?').get(requestId);
      if (!reqRow) {
        return sendJson(res, 404, { error: 'Exchange session not found.' });
      }
      if (tokenUserId !== reqRow.requester_id && tokenUserId !== reqRow.recipient_id) {
        return sendJson(res, 403, {
          error: 'Forbidden: You cannot review an exchange you did not participate in.'
        });
      }
      if (reqRow.status !== 'completed') {
        return sendJson(res, 400, {
          error: 'Reviews are only permitted for exchanges that have been marked completed.'
        });
      }

      const existingRev = db
        .prepare('SELECT id FROM reviews WHERE request_id = ? AND reviewer_id = ?')
        .get(requestId, tokenUserId);
      if (existingRev) {
        return sendJson(res, 409, {
          error: 'Duplicate review: You have already reviewed this completed exchange session.'
        });
      }

      const revieweeId = tokenUserId === reqRow.requester_id ? reqRow.recipient_id : reqRow.requester_id;
      const insertRev = db
        .prepare('INSERT INTO reviews (request_id, reviewer_id, reviewee_id, rating, comment) VALUES (?, ?, ?, ?, ?)')
        .run(requestId, tokenUserId, revieweeId, rating, comment);

      db.prepare('UPDATE swap_requests SET rating_given = ?, review_comment = ? WHERE id = ?').run(
        rating,
        comment,
        requestId
      );

      const createdReview = db.prepare('SELECT * FROM reviews WHERE id = ?').get(Number(insertRev.lastInsertRowid));
      return sendJson(res, 201, { review: createdReview });
    }

    // 20. Flow E: AI Learning Plans (POST /api/ai/learning-plan, GET/POST/PUT/DELETE /api/learning-plans)
    if (pathname === '/api/ai/learning-plan' && method === 'POST') {
      const body = await parseBody(req);
      try {
        const plan = generateAiLearningPlan({
          targetSkill: body.target_skill || body.targetSkill,
          learningGoals: body.learning_goals || body.learningGoals,
          preferredFormat: body.preferred_format || body.preferredFormat || 'Online'
        });
        return sendJson(res, 200, plan);
      } catch (err) {
        return sendJson(res, err.statusCode || 400, { error: err.message || 'Invalid learning plan input.' });
      }
    }

    if (pathname === '/api/learning-plans' && method === 'GET') {
      if (!tokenUserId) {
        return sendJson(res, 401, { error: 'Unauthorized: Valid Bearer authentication token required.' });
      }
      return sendJson(res, 200, { learningPlans: getUserLearningPlans(tokenUserId) });
    }

    if (pathname === '/api/learning-plans' && method === 'POST') {
      if (!tokenUserId) {
        return sendJson(res, 401, { error: 'Unauthorized: Valid Bearer authentication token required.' });
      }
      const body = await parseBody(req);
      const targetSkill = String(body.target_skill || '').trim();
      const learningGoals = String(body.learning_goals || '').trim();
      const preferredFormat = ['Online', 'In person', 'Either'].includes(body.preferred_format)
        ? body.preferred_format
        : 'Online';
      const planTitle = String(body.plan_title || `4-Week Learning Plan: ${targetSkill}`).trim();
      const planContent = String(body.plan_content || '').trim();
      const milestones = Array.isArray(body.milestones) ? body.milestones : [];

      if (targetSkill.length < 2 || !planContent) {
        return sendJson(res, 400, { error: 'Target skill and plan content are required before saving.' });
      }

      const ins = db
        .prepare(
          `INSERT INTO learning_plans (user_id, target_skill, learning_goals, preferred_format, plan_title, plan_content, milestones)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          tokenUserId,
          targetSkill,
          learningGoals || `Master ${targetSkill}`,
          preferredFormat,
          planTitle,
          planContent,
          JSON.stringify(milestones)
        );

      const learningPlans = getUserLearningPlans(tokenUserId);
      const createdPlan = learningPlans.find((p) => p.id === Number(ins.lastInsertRowid));
      return sendJson(res, 201, { plan: createdPlan, learningPlans });
    }

    const learningPlanItemMatch = pathname.match(/^\/api\/learning-plans\/(\d+)$/);
    if (learningPlanItemMatch && (method === 'PUT' || method === 'DELETE' || method === 'GET')) {
      if (!tokenUserId) {
        return sendJson(res, 401, { error: 'Unauthorized: Valid Bearer authentication token required.' });
      }
      const planId = Number(learningPlanItemMatch[1]);
      const existingPlan = db.prepare('SELECT * FROM learning_plans WHERE id = ?').get(planId);
      if (!existingPlan) {
        return sendJson(res, 404, { error: 'Learning plan not found.' });
      }
      if (Number(existingPlan.user_id) !== tokenUserId) {
        return sendJson(res, 403, {
          error: 'Forbidden: Users may read, update, or delete only their own learning plans.'
        });
      }

      if (method === 'GET') {
        return sendJson(res, 200, {
          plan: { ...existingPlan, milestones: safeJsonParse(existingPlan.milestones, []) }
        });
      }

      if (method === 'DELETE') {
        db.prepare('DELETE FROM learning_plans WHERE id = ? AND user_id = ?').run(planId, tokenUserId);
        return sendJson(res, 200, { learningPlans: getUserLearningPlans(tokenUserId) });
      }

      const body = await parseBody(req);
      const nextTitle = String(body.plan_title !== undefined ? body.plan_title : existingPlan.plan_title).trim();
      const nextContent = String(body.plan_content !== undefined ? body.plan_content : existingPlan.plan_content).trim();
      const nextGoals = String(body.learning_goals !== undefined ? body.learning_goals : existingPlan.learning_goals).trim();
      db.prepare(
        `UPDATE learning_plans
         SET plan_title = ?, plan_content = ?, learning_goals = ?, updated_at = datetime('now')
         WHERE id = ? AND user_id = ?`
      ).run(nextTitle, nextContent, nextGoals, planId, tokenUserId);

      const learningPlans = getUserLearningPlans(tokenUserId);
      return sendJson(res, 200, {
        plan: learningPlans.find((p) => p.id === planId),
        learningPlans
      });
    }

    // --- STATIC FILE SERVING (Prefer built React+Vite bundle in frontend/dist, fallback to public/) ---
    const staticRoot = fs.existsSync(path.join(DIST_DIR, 'index.html')) ? DIST_DIR : PUBLIC_DIR;
    let filePath = pathname === '/' ? path.join(staticRoot, 'index.html') : path.join(staticRoot, pathname);
    if (!filePath.startsWith(staticRoot)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    const serveIndexHtmlWithBootstrap = (indexPath) => {
      let html = fs.readFileSync(indexPath, 'utf-8');
      const initialData = buildBootstrapPayload(1, '', 'all');
      const scriptTag = `<script>window.__INITIAL_BOOTSTRAP__ = ${JSON.stringify(initialData)};</script>`;
      html = html.replace('</head>', `${scriptTag}\n</head>`);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(html);
    };

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      if (path.basename(filePath) === 'index.html') {
        return serveIndexHtmlWithBootstrap(filePath);
      }
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
    } else {
      const indexPath = path.join(staticRoot, 'index.html');
      if (fs.existsSync(indexPath)) {
        return serveIndexHtmlWithBootstrap(indexPath);
      } else {
        return sendJson(res, 200, {
          message: 'SkillSwap API is running',
          status: 'ok',
          docs: '/docs',
          health: '/health'
        });
      }
    }
  } catch (err) {
    console.error('Server error:', err);
    sendJson(res, 500, { error: err.message || 'Internal Server Error' });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`SkillSwap server running at http://localhost:${PORT}`);
  });
}

module.exports = { server };
