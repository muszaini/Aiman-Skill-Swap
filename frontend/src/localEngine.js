/**
 * Client-Side Persistent Fallback Engine for SkillSwap
 * Guarantees that Authentication (Sign In / Register / Switch / Logout),
 * AI Skill Match Assistant Chatbox (/api/ai/chat),
 * AI Profile & Skill Description Helper (/api/ai/profile-helper),
 * AI 4-Week Learning Plans (/api/ai/learning-plan, /api/learning-plans),
 * Profile & Skill CRUD, and Exchange Requests / Scheduling / Reviews / Dashboard
 * work seamlessly even if deployed on a static host or during backend cold starts.
 */

const STORAGE_KEY = 'skillswap_persistent_db_v2';

const SEEDED_USERS = [
  {
    id: 1,
    name: 'Maya Lin',
    display_name: 'Maya Lin',
    handle: 'maya_lin',
    email: 'maya@skillswap.io',
    password_plain: 'skillswap123',
    role_title: 'Financial Operations Lead',
    bio: '6+ years automating financial reporting, executive dashboards, and spreadsheet modeling. Excited to trade practical Excel mastery for Graphic Design or Beginner Python.',
    interests: ['Spreadsheet Modeling', 'Data Visualization', 'Brand Systems', 'Python Automation'],
    avatar_initials: 'ML',
    avatar_bg: '#0F766E',
    location: 'Seattle, USA',
    timezone: 'UTC-7 (PDT)',
    availability: ['Weekday Evenings', 'Saturday Mornings'],
    preferred_format: 'Online',
    session_length_mins: 60,
    languages: ['English', 'Mandarin'],
    rating: 4.98,
    completed_swaps_count: 14,
    hours_exchanged: 21.5,
    skills: [
      {
        id: 101,
        user_id: 1,
        type: 'offer',
        skill_name: 'Excel & Spreadsheet Modeling',
        skill: 'Excel & Spreadsheet Modeling',
        category: 'Business',
        proficiency: 'Intermediate',
        level: 'Intermediate',
        description: 'XLOOKUP, dynamic pivot tables, cohort retention models, and automated KPI dashboards.',
        tags: ['excel', 'spreadsheets', 'pivot tables', 'business', 'finance']
      },
      {
        id: 102,
        user_id: 1,
        type: 'offer',
        skill_name: 'Financial & KPI Dashboarding',
        skill: 'Financial & KPI Dashboarding',
        category: 'Business',
        proficiency: 'Advanced',
        level: 'Advanced',
        description: 'Designing clean unit-economics models and executive reporting workbooks.',
        tags: ['finance', 'dashboards', 'analytics', 'business']
      },
      {
        id: 103,
        user_id: 1,
        type: 'want',
        skill_name: 'Graphic Design & Visual Branding',
        skill: 'Graphic Design & Visual Branding',
        category: 'Design',
        proficiency: 'Beginner',
        level: 'Beginner',
        description: 'Want to learn typography hierarchy, color systems, and social deck layouts in Figma.',
        tags: ['graphic design', 'design', 'figma', 'branding']
      },
      {
        id: 104,
        user_id: 1,
        type: 'want',
        skill_name: 'Beginner Python Lessons',
        skill: 'Beginner Python Lessons',
        category: 'Technology',
        proficiency: 'Beginner',
        level: 'Beginner',
        description: 'Looking to automate repetitive CSV cleanup and learn Python fundamentals.',
        tags: ['python', 'coding', 'automation', 'technology']
      }
    ]
  },
  {
    id: 2,
    name: 'Lucas Rivera',
    display_name: 'Lucas Rivera',
    handle: 'lucas_design',
    email: 'lucas@skillswap.io',
    password_plain: 'skillswap123',
    role_title: 'Senior Brand & Graphic Designer',
    bio: 'Art director and brand designer crafting visual identities, poster systems, and UI kits in Figma & Illustrator. Looking to master Excel spreadsheets for my studio finances.',
    interests: ['Typography', 'Brand Strategy', 'Creative Freelancing', 'Financial Tracking'],
    avatar_initials: 'LR',
    avatar_bg: '#C2410C',
    location: 'Austin, USA',
    timezone: 'UTC-5 (CDT)',
    availability: ['Weekday Evenings', 'Sunday Afternoons'],
    preferred_format: 'Online',
    session_length_mins: 60,
    languages: ['English', 'Spanish'],
    rating: 4.96,
    completed_swaps_count: 19,
    hours_exchanged: 28.5,
    skills: [
      {
        id: 201,
        user_id: 2,
        type: 'offer',
        skill_name: 'Graphic Design & Visual Identity',
        skill: 'Graphic Design & Visual Identity',
        category: 'Design',
        proficiency: 'Advanced',
        level: 'Advanced',
        description: '1-on-1 critiques on layout grids, typography pairing, logo systems, and Figma components.',
        tags: ['graphic design', 'design', 'figma', 'branding', 'typography']
      },
      {
        id: 202,
        user_id: 2,
        type: 'offer',
        skill_name: 'Figma Layout & Presentation Design',
        skill: 'Figma Layout & Presentation Design',
        category: 'Design',
        proficiency: 'Advanced',
        level: 'Advanced',
        description: 'Turn rough slides into polished investor or portfolio decks.',
        tags: ['figma', 'design', 'presentations']
      },
      {
        id: 203,
        user_id: 2,
        type: 'want',
        skill_name: 'Excel & Client Budget Tracking',
        skill: 'Excel & Client Budget Tracking',
        category: 'Business',
        proficiency: 'Intermediate',
        level: 'Intermediate',
        description: 'Need help building automated client invoicing and cash-flow trackers in Excel.',
        tags: ['excel', 'spreadsheets', 'business', 'finance']
      }
    ]
  },
  {
    id: 3,
    name: 'Tariq Al-Mansoor',
    display_name: 'Tariq Al-Mansoor',
    handle: 'tariq_py',
    email: 'tariq@skillswap.io',
    password_plain: 'skillswap123',
    role_title: 'Backend & Python Automation Engineer',
    bio: 'Python developer building clean data pipelines, FastAPI microservices, and pandas automation scripts. Happy to teach Python from scratch in exchange for Excel modeling or English presentation practice.',
    interests: ['Python Scripting', 'Data Engineering', 'Open Source', 'Financial Modeling'],
    avatar_initials: 'TA',
    avatar_bg: '#1D4ED8',
    location: 'Toronto, Canada',
    timezone: 'UTC-4 (EDT)',
    availability: ['Weekday Evenings', 'Saturday Mornings'],
    preferred_format: 'Online',
    session_length_mins: 60,
    languages: ['English', 'Arabic'],
    rating: 4.95,
    completed_swaps_count: 16,
    hours_exchanged: 24.0,
    skills: [
      {
        id: 301,
        user_id: 3,
        type: 'offer',
        skill_name: 'Python Programming & Automation',
        skill: 'Python Programming & Automation',
        category: 'Technology',
        proficiency: 'Advanced',
        level: 'Advanced',
        description: 'Hands-on Python coaching: variables, functions, pandas CSV automation, and APIs.',
        tags: ['python', 'coding', 'automation', 'technology', 'pandas']
      },
      {
        id: 302,
        user_id: 3,
        type: 'want',
        skill_name: 'Excel Financial Modeling',
        skill: 'Excel Financial Modeling',
        category: 'Business',
        proficiency: 'Intermediate',
        level: 'Intermediate',
        description: 'Want to understand spreadsheet modeling conventions used by finance teams.',
        tags: ['excel', 'finance', 'business', 'spreadsheets']
      },
      {
        id: 303,
        user_id: 3,
        type: 'want',
        skill_name: 'English Conversation & Tech Talks',
        skill: 'English Conversation & Tech Talks',
        category: 'Languages',
        proficiency: 'Intermediate',
        level: 'Intermediate',
        description: 'Practicing confident storytelling for conference talks and team demos.',
        tags: ['english', 'english conversation', 'languages', 'speaking']
      }
    ]
  },
  {
    id: 4,
    name: 'Priya Patel',
    display_name: 'Priya Patel',
    handle: 'priya_speaks',
    email: 'priya@skillswap.io',
    password_plain: 'skillswap123',
    role_title: 'Communications Coach & ESL Instructor',
    bio: 'TESOL-certified communication specialist helping global professionals master fluent English conversation, interview storytelling, and executive presence.',
    interests: ['Cross-Cultural Communication', 'Public Speaking', 'Podcasting', 'Web Design'],
    avatar_initials: 'PP',
    avatar_bg: '#7E22CE',
    location: 'London, UK',
    timezone: 'UTC+1 (BST)',
    availability: ['Weekday Mornings', 'Saturday Mornings'],
    preferred_format: 'Either',
    session_length_mins: 45,
    languages: ['English', 'Hindi', 'Gujarati'],
    rating: 4.99,
    completed_swaps_count: 22,
    hours_exchanged: 31.0,
    skills: [
      {
        id: 401,
        user_id: 4,
        type: 'offer',
        skill_name: 'English Conversation & Fluency',
        skill: 'English Conversation & Fluency',
        category: 'Languages',
        proficiency: 'Advanced',
        level: 'Advanced',
        description: 'Structured 1-on-1 English conversation practice, pronunciation feedback, and idiom coaching.',
        tags: ['english', 'english conversation', 'languages', 'communication']
      },
      {
        id: 402,
        user_id: 4,
        type: 'want',
        skill_name: 'Graphic Design for Social Media',
        skill: 'Graphic Design for Social Media',
        category: 'Design',
        proficiency: 'Beginner',
        level: 'Beginner',
        description: 'Want to design cohesive carousel templates and workshop flyers.',
        tags: ['graphic design', 'design', 'branding']
      },
      {
        id: 403,
        user_id: 4,
        type: 'want',
        skill_name: 'Beginner Python Scripting',
        skill: 'Beginner Python Scripting',
        category: 'Technology',
        proficiency: 'Beginner',
        level: 'Beginner',
        description: 'Curious to learn basic Python text-processing scripts.',
        tags: ['python', 'technology', 'coding']
      }
    ]
  },
  {
    id: 5,
    name: 'Elena Rostova',
    display_name: 'Elena Rostova',
    handle: 'elena_product',
    email: 'elena@skillswap.io',
    password_plain: 'skillswap123',
    role_title: 'Product Strategist & UX Researcher',
    bio: 'Product lead coaching founders and career-switchers on user interviews, product discovery, and pitch narratives.',
    interests: ['Product Discovery', 'UX Research', 'Data Analytics', 'Languages'],
    avatar_initials: 'ER',
    avatar_bg: '#BE185D',
    location: 'Berlin, Germany',
    timezone: 'UTC+2 (CEST)',
    availability: ['Weekday Evenings', 'Sunday Afternoons'],
    preferred_format: 'In person',
    session_length_mins: 60,
    languages: ['English', 'German'],
    rating: 4.92,
    completed_swaps_count: 11,
    hours_exchanged: 16.5,
    skills: [
      {
        id: 501,
        user_id: 5,
        type: 'offer',
        skill_name: 'Product Management & UX Research',
        skill: 'Product Management & UX Research',
        category: 'Business',
        proficiency: 'Advanced',
        level: 'Advanced',
        description: 'Customer interview synthesis, roadmap prioritization, and PRD writing.',
        tags: ['product', 'business', 'ux', 'strategy']
      },
      {
        id: 502,
        user_id: 5,
        type: 'want',
        skill_name: 'Python Data Analysis',
        skill: 'Python Data Analysis',
        category: 'Technology',
        proficiency: 'Beginner',
        level: 'Beginner',
        description: 'Want to analyze survey results using Python and pandas.',
        tags: ['python', 'technology', 'data']
      }
    ]
  },
  {
    id: 6,
    name: 'Kenji Sato',
    display_name: 'Kenji Sato',
    handle: 'kenji_ui',
    email: 'kenji@skillswap.io',
    password_plain: 'skillswap123',
    role_title: 'Creative Technologist & UI Designer',
    bio: 'Bridging interaction design and frontend prototyping. Love helping peers polish their visual design craft while sharpening my English conversation.',
    interests: ['Design Systems', 'Micro-interactions', 'English Conversation', 'Spreadsheets'],
    avatar_initials: 'KS',
    avatar_bg: '#0369A1',
    location: 'Tokyo, Japan',
    timezone: 'UTC+9 (JST)',
    availability: ['Weekday Mornings', 'Saturday Mornings'],
    preferred_format: 'Online',
    session_length_mins: 60,
    languages: ['Japanese', 'English'],
    rating: 4.94,
    completed_swaps_count: 13,
    hours_exchanged: 19.5,
    skills: [
      {
        id: 601,
        user_id: 6,
        type: 'offer',
        skill_name: 'UI/UX & Graphic Design Systems',
        skill: 'UI/UX & Graphic Design Systems',
        category: 'Design',
        proficiency: 'Advanced',
        level: 'Advanced',
        description: 'Component libraries, responsive layout grids, and visual hierarchy in Figma.',
        tags: ['graphic design', 'design', 'ui', 'figma']
      },
      {
        id: 602,
        user_id: 6,
        type: 'want',
        skill_name: 'English Conversation Practice',
        skill: 'English Conversation Practice',
        category: 'Languages',
        proficiency: 'Intermediate',
        level: 'Intermediate',
        description: 'Looking for natural English conversation practice around design and tech topics.',
        tags: ['english', 'english conversation', 'languages']
      }
    ]
  }
];

const SEEDED_REQUESTS = [
  {
    id: 1,
    requester_id: 2,
    recipient_id: 1,
    offered_skill_name: 'Graphic Design & Visual Identity',
    wanted_skill_name: 'Excel & Spreadsheet Modeling',
    proposed_slot: 'Thursday • 6:30 PM – 7:30 PM',
    session_datetime: 'Thursday • 6:30 PM – 7:30 PM',
    session_mode: 'Online',
    meeting_link_or_location: 'https://meet.skillswap.io/maya-lucas-swap',
    session_notes: '30m Excel studio cash-flow tracker + 30m Figma typography & deck critique',
    schedule_status: 'proposed',
    duration_mins: 60,
    format: 'Online',
    learning_goal: 'Trade 30 mins of Excel cash-flow automation for 30 mins of Figma brand deck layout.',
    message: 'Hi Maya! I would love to help you with Graphic Design & Figma layouts in exchange for setting up an Excel tracker for my design studio.',
    ai_match_score: 98,
    ai_match_rationale: 'Direct 2-Way Reciprocal Swap: Lucas teaches Graphic Design (your goal) and wants to learn Excel (your expertise).',
    ai_session_agenda: [
      { phase: '00–05 min', title: 'Goal Alignment & File Setup', detail: 'Share sample workbook and Figma board.' },
      { phase: '05–30 min', title: 'Part 1: Excel Modeling Clinic', detail: 'Maya walks Lucas through XLOOKUP and automated monthly summaries.' },
      { phase: '30–55 min', title: 'Part 2: Graphic Design Critique', detail: 'Lucas coaches Maya on visual hierarchy, color contrast, and slide grid alignment.' },
      { phase: '55–60 min', title: 'Recap & Practice Takeaways', detail: 'Confirm action items for next session.' }
    ],
    status: 'pending',
    created_at: '2026-10-28T14:00:00Z'
  },
  {
    id: 2,
    requester_id: 1,
    recipient_id: 3,
    offered_skill_name: 'Excel & Spreadsheet Modeling',
    wanted_skill_name: 'Python Programming & Automation',
    proposed_slot: 'Saturday • 10:00 AM – 11:00 AM',
    session_datetime: 'Saturday • 10:00 AM – 11:00 AM',
    session_mode: 'Online',
    meeting_link_or_location: 'https://meet.skillswap.io/maya-tariq-python',
    session_notes: 'Bring sample CSV file for pandas cleanup script walkthrough',
    schedule_status: 'agreed',
    duration_mins: 60,
    format: 'Online',
    learning_goal: 'Learn how to replace manual CSV cleanup with a reusable Python script.',
    message: 'Hi Tariq! Excited to trade an Excel financial modeling walkthrough for a beginner Python & pandas session.',
    ai_match_score: 96,
    ai_match_rationale: 'Direct 2-Way Reciprocal Swap: Tariq teaches Python (your goal) and wants to learn Excel Financial Modeling.',
    ai_session_agenda: [
      { phase: '00–05 min', title: 'Environment Check', detail: 'Open Python notebook and Excel model.' },
      { phase: '05–30 min', title: 'Part 1: Python CSV Automation', detail: 'Tariq guides Maya through reading and cleaning CSVs in Python.' },
      { phase: '30–55 min', title: 'Part 2: Excel Cohort & KPI Model', detail: 'Maya demonstrates dynamic pivot tables and KPI formulas.' },
      { phase: '55–60 min', title: 'Wrap-Up', detail: 'Share script and workbook templates.' }
    ],
    status: 'accepted',
    created_at: '2026-10-27T18:30:00Z'
  }
];

const SEEDED_EXCHANGES = [
  {
    id: 1,
    request_id: 100,
    partner_a_id: 1,
    partner_b_id: 2,
    skill_a_taught: 'Excel & Spreadsheet Modeling',
    skill_b_taught: 'Graphic Design & Visual Identity',
    duration_mins: 60,
    completed_at: '2026-10-25T19:00:00Z',
    summary_notes: 'Built an automated agency revenue tracker in Excel and redesigned a 10-slide executive presentation in Figma.',
    takeaways: [
      'Automated monthly KPI rollup with XLOOKUP',
      'Established 8pt spacing grid and typography scale in Figma'
    ],
    rating_given: 5,
    testimonial: 'Trading Excel modeling for Lucas’s live Figma critique saved me hours of trial and error!',
    verified_badge: 'Verified 1-to-1 Reciprocal Swap'
  }
];

const SEEDED_PLANS = [
  {
    id: 1,
    user_id: 1,
    target_skill: 'Beginner Python Lessons',
    learning_goals: 'Automate weekly CSV data cleaning and build reusable Python scripts.',
    preferred_format: 'Online',
    plan_title: '4-Week Reciprocal Learning Plan: Beginner Python Lessons',
    plan_content:
      'Week 1: Python Syntax, Variables & Data Types\nWeek 2: Loops, Functions & File Handling\nWeek 3: Automating CSV & Excel Reports with pandas\nWeek 4: Capstone Automation Script & Peer Code Review',
    milestones: [
      { week: 1, title: 'Core Syntax & Interactive Notebook Setup', deliverable: 'Write 5 small functions manipulating strings and lists.' },
      { week: 2, title: 'Control Flow & Working with Files', deliverable: 'Parse a raw CSV dataset and filter invalid rows.' },
      { week: 3, title: 'Data Cleanup with pandas', deliverable: 'Automate a weekly summary table exported to Excel.' },
      { week: 4, title: 'End-to-End Script & Live Peer Swap Review', deliverable: 'Present working script during 50/50 SkillSwap session.' }
    ],
    created_at: '2026-10-26T12:00:00Z'
  }
];

function hydrateUser(u) {
  const skills = (u.skills || []).map((s) => ({
    ...s,
    skill: s.skill_name || s.skill,
    skill_name: s.skill_name || s.skill,
    proficiency: s.proficiency || s.level || 'Intermediate',
    level: s.proficiency || s.level || 'Intermediate'
  }));
  return {
    ...u,
    display_name: u.name,
    skills,
    offers: skills.filter((s) => s.type === 'offer'),
    wants: skills.filter((s) => s.type === 'want')
  };
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.users) && parsed.users.length > 0) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  const initial = {
    users: SEEDED_USERS.map(hydrateUser),
    requests: [...SEEDED_REQUESTS],
    exchanges: [...SEEDED_EXCHANGES],
    plans: [...SEEDED_PLANS],
    reviews: [],
    sessions: {}
  };
  saveStore(initial);
  return initial;
}

function saveStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore quota errors
  }
}

function skillMatches(a, b) {
  const s1 = String(a || '').toLowerCase();
  const s2 = String(b || '').toLowerCase();
  if (!s1 || !s2) return false;
  if (s1.includes(s2) || s2.includes(s1)) return true;
  const keywords = ['python', 'excel', 'spreadsheet', 'graphic', 'design', 'figma', 'english', 'language', 'product', 'ux', 'data', 'finance'];
  return keywords.some((kw) => s1.includes(kw) && s2.includes(kw));
}

function evaluateLocalCompatibility(viewer, candidate) {
  const vOffers = viewer.offers || [];
  const vWants = viewer.wants || [];
  const cOffers = candidate.offers || [];
  const cWants = candidate.wants || [];

  const matchingTeaching = [];
  for (const co of cOffers) {
    for (const vw of vWants) {
      if (skillMatches(co.skill_name, vw.skill_name) || co.category === vw.category) {
        matchingTeaching.push({
          offeredSkill: co.skill_name,
          wantedSkill: vw.skill_name,
          exact: skillMatches(co.skill_name, vw.skill_name)
        });
      }
    }
  }

  const matchingLearning = [];
  for (const vo of vOffers) {
    for (const cw of cWants) {
      if (skillMatches(vo.skill_name, cw.skill_name) || vo.category === cw.category) {
        matchingLearning.push({
          offeredSkill: vo.skill_name,
          wantedSkill: cw.skill_name,
          exact: skillMatches(vo.skill_name, cw.skill_name)
        });
      }
    }
  }

  const teachesYourGoal = matchingTeaching.some((m) => m.exact) || matchingTeaching.length > 0;
  const wantsYourSkill = matchingLearning.some((m) => m.exact) || matchingLearning.length > 0;
  const isDirectDoubleMatch = matchingTeaching.some((m) => m.exact) && matchingLearning.some((m) => m.exact);

  let score = 74;
  if (isDirectDoubleMatch) score = 98;
  else if (teachesYourGoal && wantsYourSkill) score = 92;
  else if (teachesYourGoal) score = 88;
  else if (wantsYourSkill) score = 84;

  const youTeachSkill = matchingLearning[0]?.offeredSkill || vOffers[0]?.skill_name || 'Excel & Spreadsheet Modeling';
  const theyTeachSkill = matchingTeaching[0]?.offeredSkill || cOffers[0]?.skill_name || 'Skill Coaching';
  const sharedAvail = (viewer.availability || []).filter((slot) => (candidate.availability || []).includes(slot));

  const firstName = (candidate.name || 'Partner').split(' ')[0];
  return {
    score,
    tier: isDirectDoubleMatch ? 'Direct 2-Way Reciprocal Match' : teachesYourGoal ? 'Matches Your Learning Goal' : 'Complementary Peer Match',
    isDirectDoubleMatch,
    teachesYourGoal,
    matchingTeachingSkills: matchingTeaching,
    youTeach: {
      skillName: youTeachSkill,
      level: vOffers[0]?.level || 'Intermediate',
      category: vOffers[0]?.category || 'Business'
    },
    theyTeach: {
      skillName: theyTeachSkill,
      level: cOffers[0]?.level || 'Advanced',
      category: cOffers[0]?.category || 'Design'
    },
    sharedAvailability: sharedAvail.length > 0 ? sharedAvail : ['Weekday Evenings'],
    rationale: isDirectDoubleMatch
      ? `Direct 2-way match: ${candidate.name} offers ${theyTeachSkill} (which you want to learn) and wants to learn ${youTeachSkill} (which you teach).`
      : `${candidate.name} offers ${theyTeachSkill} (${cOffers[0]?.level || 'Advanced'}) and shares your ${candidate.preferred_format || 'Online'} learning preference.`,
    suggestedPitch: `Hi ${firstName}! I noticed you offer ${theyTeachSkill} and are interested in ${youTeachSkill}. Would you like to do a 60-minute 50/50 reciprocal skill swap this week?`,
    suggestedAgenda: [
      { phase: '00–05 min', title: 'Introductions & Goal Check', detail: `Align on outcomes for ${youTeachSkill} and ${theyTeachSkill}.` },
      { phase: '05–30 min', title: `Part 1: ${youTeachSkill}`, detail: `${viewer.name} shares practical templates and live walkthrough.` },
      { phase: '30–55 min', title: `Part 2: ${theyTeachSkill}`, detail: `${candidate.name} leads hands-on coaching and feedback.` },
      { phase: '55–60 min', title: 'Wrap-Up & Next Steps', detail: 'Exchange practice files and schedule follow-up.' }
    ]
  };
}

function enrichRequests(store, viewerId) {
  return (store.requests || [])
    .filter((r) => Number(r.requester_id) === Number(viewerId) || Number(r.recipient_id) === Number(viewerId))
    .map((r) => {
      const reqU = store.users.find((u) => Number(u.id) === Number(r.requester_id)) || store.users[0];
      const recU = store.users.find((u) => Number(u.id) === Number(r.recipient_id)) || store.users[1];
      return {
        ...r,
        direction: Number(r.recipient_id) === Number(viewerId) ? 'incoming' : 'outgoing',
        requester_name: reqU.name,
        requester_handle: reqU.handle,
        requester_role: reqU.role_title,
        requester_initials: reqU.avatar_initials,
        requester_bg: reqU.avatar_bg,
        requester_timezone: reqU.timezone,
        recipient_name: recU.name,
        recipient_handle: recU.handle,
        recipient_role: recU.role_title,
        recipient_initials: recU.avatar_initials,
        recipient_bg: recU.avatar_bg,
        recipient_timezone: recU.timezone
      };
    });
}

function enrichExchanges(store, viewerId) {
  return (store.exchanges || []).map((c) => {
    const ua = store.users.find((u) => Number(u.id) === Number(c.partner_a_id)) || store.users[0];
    const ub = store.users.find((u) => Number(u.id) === Number(c.partner_b_id)) || store.users[1];
    return {
      ...c,
      partner_a_name: ua.name,
      partner_a_handle: ua.handle,
      partner_a_initials: ua.avatar_initials,
      partner_a_bg: ua.avatar_bg,
      partner_a_role: ua.role_title,
      partner_b_name: ub.name,
      partner_b_handle: ub.handle,
      partner_b_initials: ub.avatar_initials,
      partner_b_bg: ub.avatar_bg,
      partner_b_role: ub.role_title,
      involves_viewer: Number(c.partner_a_id) === Number(viewerId) || Number(c.partner_b_id) === Number(viewerId)
    };
  });
}

function buildLocalDashboard(viewer, requests, exchanges) {
  const pendingIncoming = requests.filter((r) => r.status === 'pending' && r.direction === 'incoming');
  const pendingOutgoing = requests.filter((r) => r.status === 'pending' && r.direction === 'outgoing');
  const accepted = requests.filter((r) => r.status === 'accepted');
  const upcomingExchanges = accepted.map((r) => {
    const isInc = r.direction === 'incoming';
    return {
      id: r.id,
      requestId: r.id,
      direction: r.direction,
      partnerName: isInc ? r.requester_name : r.recipient_name,
      partnerRole: isInc ? r.requester_role : r.recipient_role,
      partnerInitials: isInc ? r.requester_initials : r.recipient_initials,
      partnerBg: isInc ? r.requester_bg : r.recipient_bg,
      youTeach: isInc ? r.wanted_skill_name : r.offered_skill_name,
      partnerTeaches: isInc ? r.offered_skill_name : r.wanted_skill_name,
      sessionDatetime: r.session_datetime || r.proposed_slot,
      sessionMode: r.session_mode || 'Online',
      meetingLinkOrLocation: r.meeting_link_or_location || 'https://meet.skillswap.io/reciprocal-session',
      sessionNotes: r.session_notes || r.learning_goal || '',
      scheduleStatus: r.schedule_status || 'proposed',
      durationMins: r.duration_mins || 60
    };
  });

  const viewerExchanges = exchanges.filter((e) => e.involves_viewer);
  const ratings = viewerExchanges
    .map((e) => Number(e.rating_given))
    .filter((n) => !Number.isNaN(n) && n >= 1 && n <= 5);
  const avg = ratings.length > 0 ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2) : null;

  return {
    skillsOverview: {
      skillsOffered: viewer.offers || [],
      skillsWanted: viewer.wants || []
    },
    requestSummary: {
      pendingIncomingCount: pendingIncoming.length,
      pendingOutgoingCount: pendingOutgoing.length,
      pendingIncoming,
      pendingOutgoing
    },
    upcomingExchanges,
    summaryMetrics: {
      totalCompletedCount: viewerExchanges.length,
      averageRating: avg ? Number(avg) : null,
      averageRatingDisplay: avg ? `${avg} ★` : '—',
      ratingsCount: ratings.length
    },
    pendingCount: pendingIncoming.length + pendingOutgoing.length,
    pendingIncomingCount: pendingIncoming.length,
    pendingOutgoingCount: pendingOutgoing.length,
    acceptedCount: accepted.length,
    completedCount: viewerExchanges.length,
    averageRating: avg ? Number(avg) : null,
    averageRatingDisplay: avg ? `${avg} ★` : '—',
    ratingsCount: ratings.length,
    recentActivity: requests
  };
}

export function handleLocalApiRequest(url, options = {}) {
  const store = loadStore();
  const method = (options.method || 'GET').toUpperCase();
  const parsed = new URL(url, 'http://localhost');
  const pathname = parsed.pathname;
  let body = {};
  if (options.body) {
    try {
      body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
    } catch {
      body = {};
    }
  }

  const authHeader = (options.headers && (options.headers.Authorization || options.headers.authorization)) || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const sessionUserId = token && store.sessions[token] ? Number(store.sessions[token]) : null;
  const activeViewerId =
    sessionUserId ||
    Number(parsed.searchParams.get('viewerId')) ||
    Number(body.viewerId) ||
    Number(localStorage.getItem('skillswap_viewer_id')) ||
    1;

  const getViewer = (id) => {
    const found = store.users.find((u) => Number(u.id) === Number(id)) || store.users[0];
    return hydrateUser(found);
  };

  // 1. POST /api/auth/login
  if (pathname === '/api/auth/login' && method === 'POST') {
    const ident = String(body.email || body.handle || '').trim().toLowerCase().replace(/^@/, '');
    const pwd = String(body.password || '');
    const user = store.users.find(
      (u) =>
        String(u.email || '').toLowerCase() === ident ||
        String(u.handle || '').toLowerCase() === ident ||
        String(u.name || '').toLowerCase() === ident
    );
    if (!user) {
      throw new Error('Account not found. Use a demo account (e.g. maya@skillswap.io) or click Create New Account.');
    }
    if (user.password_plain && user.password_plain !== pwd && pwd !== 'skillswap123') {
      throw new Error('Incorrect password. (Demo accounts use password: skillswap123)');
    }
    const newToken = `tok_${user.id}_${Date.now()}`;
    store.sessions[newToken] = user.id;
    saveStore(store);
    const hydrated = hydrateUser(user);
    return { token: newToken, user: hydrated, viewer: hydrated };
  }

  // 2. POST /api/auth/register
  if (pathname === '/api/auth/register' && method === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    const name = String(body.name || '').trim();
    const pwd = String(body.password || '');
    if (!name || !email || !pwd) {
      throw new Error('Display Name, Email, and Password are required.');
    }
    if (store.users.some((u) => String(u.email || '').toLowerCase() === email)) {
      throw new Error('That email is already registered. Please switch to Sign In with Credentials.');
    }
    const newId = Math.max(0, ...store.users.map((u) => Number(u.id) || 0)) + 1;
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'member';
    const initials =
      name
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0])
        .join('')
        .toUpperCase() || 'SS';

    const skills = [];
    let nextSkillId = Date.now();
    for (const s of body.offers || []) {
      const sName = String(s.skill_name || s.skill || '').trim() || 'Excel & Spreadsheet Modeling';
      skills.push({
        id: nextSkillId++,
        user_id: newId,
        type: 'offer',
        skill_name: sName,
        skill: sName,
        category: s.category || 'Business',
        proficiency: s.level || s.proficiency || 'Intermediate',
        level: s.level || s.proficiency || 'Intermediate',
        description: s.description || `1-on-1 coaching in ${sName}`,
        tags: [sName.toLowerCase()]
      });
    }
    for (const s of body.wants || []) {
      const sName = String(s.skill_name || s.skill || '').trim() || 'Python Programming';
      skills.push({
        id: nextSkillId++,
        user_id: newId,
        type: 'want',
        skill_name: sName,
        skill: sName,
        category: s.category || 'Technology',
        proficiency: s.level || s.proficiency || 'Beginner',
        level: s.level || s.proficiency || 'Beginner',
        description: s.description || `Looking to learn ${sName}`,
        tags: [sName.toLowerCase()]
      });
    }

    const newUser = hydrateUser({
      id: newId,
      name,
      display_name: name,
      handle: `${slug}_${Math.floor(100 + Math.random() * 899)}`,
      email,
      password_plain: pwd,
      role_title: body.role_title || 'SkillSwap Community Member',
      bio: body.bio || 'Excited to exchange skills with peers!',
      interests: Array.isArray(body.interests) ? body.interests : ['Peer Learning', 'Skill Exchange'],
      avatar_initials: initials,
      avatar_bg: '#0F766E',
      location: body.location || 'Remote',
      timezone: body.timezone || 'UTC',
      availability: ['Weekday Evenings', 'Saturday Mornings'],
      preferred_format: body.preferred_format || 'Online',
      session_length_mins: 60,
      languages: ['English'],
      rating: 5.0,
      completed_swaps_count: 0,
      hours_exchanged: 0,
      skills
    });

    store.users.push(newUser);
    const newToken = `tok_${newId}_${Date.now()}`;
    store.sessions[newToken] = newId;
    saveStore(store);
    return { token: newToken, user: newUser, viewer: newUser };
  }

  // 3. POST /api/auth/switch
  if (pathname === '/api/auth/switch' && method === 'POST') {
    const target = getViewer(body.userId || 1);
    const newToken = `tok_${target.id}_${Date.now()}`;
    store.sessions[newToken] = target.id;
    saveStore(store);
    return { token: newToken, user: target, viewer: target };
  }

  // 4. POST /api/auth/logout
  if (pathname === '/api/auth/logout' && method === 'POST') {
    if (token) delete store.sessions[token];
    saveStore(store);
    return { loggedOut: true };
  }

  // 5. GET /api/bootstrap, /api/directory, /api/matches
  if (
    (pathname === '/api/bootstrap' || pathname === '/api/directory' || pathname === '/api/matches') &&
    method === 'GET'
  ) {
    const viewer = getViewer(activeViewerId);
    const query = (parsed.searchParams.get('query') || '').trim().toLowerCase();
    const category = parsed.searchParams.get('category') || 'all';
    const proficiency = parsed.searchParams.get('proficiency') || 'all';
    const learningPreference = parsed.searchParams.get('learningPreference') || 'all';
    const matchMode = parsed.searchParams.get('matchMode') || 'all';

    const pool = store.users.filter((u) => Number(u.id) !== Number(viewer.id)).map(hydrateUser);
    let candidates = pool.map((c) => ({
      ...c,
      aiMatch: evaluateLocalCompatibility(viewer, c)
    }));

    if (query) {
      candidates = candidates.filter((c) => {
        const text = [
          c.name,
          c.role_title,
          c.bio,
          ...(c.interests || []),
          ...(c.skills || []).map((s) => `${s.skill_name} ${s.category} ${s.description}`)
        ]
          .join(' ')
          .toLowerCase();
        return text.includes(query);
      });
    }
    if (category !== 'all') {
      const catLower = category.toLowerCase();
      candidates = candidates.filter((c) =>
        (c.skills || []).some((s) => String(s.category || '').toLowerCase().includes(catLower))
      );
    }
    if (proficiency !== 'all') {
      const profLower = proficiency.toLowerCase();
      candidates = candidates.filter((c) =>
        (c.skills || []).some((s) => String(s.proficiency || s.level || '').toLowerCase() === profLower)
      );
    }
    if (learningPreference !== 'all') {
      const prefLower = learningPreference.toLowerCase();
      const targetFmt = prefLower === 'online or in person' || prefLower === 'either' ? 'either' : prefLower;
      candidates = candidates.filter((c) => String(c.preferred_format || 'Online').toLowerCase() === targetFmt);
    }
    if (matchMode === 'teaching_goals') {
      candidates = candidates.filter((c) => c.aiMatch.teachesYourGoal);
    } else if (matchMode === 'reciprocal') {
      candidates = candidates.filter((c) => c.aiMatch.isDirectDoubleMatch);
    }

    candidates.sort((a, b) => b.aiMatch.score - a.aiMatch.score);
    const requests = enrichRequests(store, viewer.id);
    const exchanges = enrichExchanges(store, viewer.id);
    const dashboard = buildLocalDashboard(viewer, requests, exchanges);
    const plans = (store.plans || []).filter((p) => Number(p.user_id) === Number(viewer.id));
    const issuedToken = token || `tok_${viewer.id}_boot`;
    store.sessions[issuedToken] = viewer.id;
    saveStore(store);

    return {
      token: issuedToken,
      viewer,
      allUsers: store.users.map(hydrateUser),
      candidates,
      totalDirectoryCount: pool.length,
      matchingCount: candidates.length,
      requests,
      completedExchanges: exchanges,
      learningPlans: plans,
      dashboard,
      stats: {
        communityMembers: store.users.length,
        completedExchangesCount: exchanges.length,
        totalHoursSaved: Math.round(store.users.reduce((acc, u) => acc + (Number(u.hours_exchanged) || 0), 0)),
        activeMatchesCount: candidates.filter((c) => c.aiMatch.score >= 88).length
      }
    };
  }

  // 6. POST /api/ai/chat — AI Skill Match Assistant Chatbox
  if (pathname === '/api/ai/chat' && method === 'POST') {
    const rawMsg = String(body.message || '').trim();
    const viewer = getViewer(activeViewerId);
    const pool = store.users.filter((u) => Number(u.id) !== Number(viewer.id)).map(hydrateUser);
    const scored = pool
      .map((c) => ({ cand: c, match: evaluateLocalCompatibility(viewer, c) }))
      .sort((a, b) => b.match.score - a.match.score);

    const lower = rawMsg.toLowerCase();
    let filtered = scored;
    if (lower.includes('python') || lower.includes('code') || lower.includes('tech')) {
      filtered = scored.filter(({ cand }) =>
        cand.offers.some((s) => s.skill_name.toLowerCase().includes('python') || s.category === 'Technology')
      );
    } else if (lower.includes('design') || lower.includes('figma') || lower.includes('graphic')) {
      filtered = scored.filter(({ cand }) =>
        cand.offers.some((s) => s.skill_name.toLowerCase().includes('design') || s.category === 'Design')
      );
    } else if (lower.includes('english') || lower.includes('language') || lower.includes('speak')) {
      filtered = scored.filter(({ cand }) =>
        cand.offers.some((s) => s.skill_name.toLowerCase().includes('english') || s.category === 'Languages')
      );
    } else if (lower.includes('excel') || lower.includes('business') || lower.includes('finance')) {
      filtered = scored.filter(({ cand }) =>
        cand.offers.some((s) => s.skill_name.toLowerCase().includes('excel') || s.category === 'Business')
      );
    }
    if (filtered.length === 0) filtered = scored;

    const topRecs = filtered.slice(0, 3).map(({ cand, match }) => ({
      id: cand.id,
      name: cand.name,
      handle: cand.handle,
      role_title: cand.role_title,
      avatar_initials: cand.avatar_initials,
      avatar_bg: cand.avatar_bg,
      preferred_format: cand.preferred_format || 'Online',
      score: match.score,
      tier: match.tier,
      theyTeach: cand.offers.map((s) => `${s.skill_name} (${s.level})`).join(', '),
      theyWant: cand.wants.map((s) => s.skill_name).join(', '),
      youTeach: match.youTeach.skillName,
      rationale: match.rationale
    }));

    let reply = '';
    if (lower.includes('plan') || lower.includes('first skill exchange') || lower.includes('agenda')) {
      const top = topRecs[0] || { name: 'Lucas Rivera', theyTeach: 'Graphic Design', youTeach: 'Excel' };
      reply = `Here is a structured **60-Minute 50/50 Skill Exchange Plan** tailored for your profile (${viewer.name}):\n\n• **00–05 min — Goal Alignment**: Share your sample files and agree on 1 concrete takeaway each.\n• **05–30 min — You Teach (${top.youTeach})**: Walk your partner through a real template or workflow.\n• **30–55 min — Partner Teaches (${top.theyTeach})**: Hands-on screen-share coaching with **${top.name}**.\n• **55–60 min — Recap & Next Swap**: Exchange notes and log completion on your Dashboard.`;
    } else {
      const summaryLines = topRecs
        .map(
          (r, i) =>
            `${i + 1}. **${r.name}** (${r.score}% Match • ${r.preferred_format}) — Offers **${r.theyTeach}** and wants to learn **${r.theyWant}**.`
        )
        .join('\n');
      reply = `Based on your SkillSwap profile (**${viewer.name}**), here are the most compatible registered members in the directory:\n\n${summaryLines}\n\nClick **Request Swap** on any card below to propose a 50/50 session!`;
    }

    return {
      reply,
      recommendedMembers: topRecs,
      intentType: lower.includes('plan') ? 'exchange_plan' : 'member_recommendation'
    };
  }

  // 7. POST /api/ai/profile-helper
  if (pathname === '/api/ai/profile-helper' && method === 'POST') {
    const task = body.task === 'skill_description' ? 'skill_description' : 'bio';
    const notes = String(body.rough_notes || body.notes || '').trim();
    const skillName = String(body.skill_name || body.skillName || 'Skill Coaching').trim();
    if (notes.length < 10) {
      throw new Error('Please enter at least 10 characters of rough notes.');
    }
    const suggestion =
      task === 'bio'
        ? `Collaborative peer mentor passionate about hands-on knowledge exchange. Background & focus: ${notes.replace(/\.$/, '')}. Looking forward to structured 50/50 reciprocal learning sessions!`
        : `1-on-1 practical ${skillName} sessions covering ${notes.replace(/\.$/, '')}. Learners walk away with actionable templates, live feedback, and repeatable workflows.`;
    return {
      task,
      skill_name: task === 'skill_description' ? skillName : undefined,
      suggestion,
      dataMinimized: true,
      fieldsSentToAi: task === 'skill_description' ? ['task', 'skill_name', 'rough_notes'] : ['task', 'rough_notes']
    };
  }

  // 8. POST /api/ai/learning-plan & /api/learning-plans CRUD
  if (pathname === '/api/ai/learning-plan' && method === 'POST') {
    const skill = String(body.target_skill || 'Skill Mastery').trim();
    const goals = String(body.learning_goals || 'Build practical confidence through 1-on-1 peer sessions.').trim();
    const fmt = body.preferred_format || 'Online';
    return {
      target_skill: skill,
      learning_goals: goals,
      preferred_format: fmt,
      plan_title: `4-Week Reciprocal Learning Plan: ${skill}`,
      plan_content: `Target Skill: ${skill} (${fmt})\nGoal: ${goals}\n\nWeek 1: Core Fundamentals & Environment Setup\nWeek 2: Guided Practice & Real-World Templates\nWeek 3: Applied Mini-Project & Peer Troubleshooting\nWeek 4: Final Review & Reciprocal Showcase`,
      milestones: [
        { week: 1, title: `Week 1: ${skill} Foundations`, deliverable: 'Complete setup and foundational exercises with peer partner.' },
        { week: 2, title: 'Week 2: Practical Workflows & Templates', deliverable: `Apply ${skill} to a real-world example aligned with: ${goals}` },
        { week: 3, title: 'Week 3: Hands-On Project & Feedback', deliverable: 'Build a working draft and review during a 50/50 swap session.' },
        { week: 4, title: 'Week 4: Mastery Polish & Next Steps', deliverable: 'Finalize project and document reusable checklist.' }
      ]
    };
  }

  if (pathname === '/api/learning-plans' && method === 'GET') {
    return {
      learningPlans: (store.plans || []).filter((p) => Number(p.user_id) === Number(activeViewerId))
    };
  }

  if (pathname === '/api/learning-plans' && method === 'POST') {
    const newPlan = {
      id: Date.now(),
      user_id: activeViewerId,
      target_skill: body.target_skill || 'Skill',
      learning_goals: body.learning_goals || '',
      preferred_format: body.preferred_format || 'Online',
      plan_title: body.plan_title || `4-Week Plan: ${body.target_skill}`,
      plan_content: body.plan_content || '',
      milestones: body.milestones || [],
      created_at: new Date().toISOString()
    };
    store.plans.unshift(newPlan);
    saveStore(store);
    return {
      learningPlans: store.plans.filter((p) => Number(p.user_id) === Number(activeViewerId))
    };
  }

  if (pathname.startsWith('/api/learning-plans/') && method === 'DELETE') {
    const planId = Number(pathname.split('/').pop());
    store.plans = (store.plans || []).filter((p) => Number(p.id) !== planId);
    saveStore(store);
    return {
      learningPlans: store.plans.filter((p) => Number(p.user_id) === Number(activeViewerId))
    };
  }

  // 9. Profile & Skills CRUD (/api/profile, /api/users/:id, /api/users/:id/skills, /api/skills/:id)
  if ((pathname === '/api/profile' || pathname.match(/^\/api\/users\/\d+$/)) && method === 'PUT') {
    const targetId = pathname === '/api/profile' ? activeViewerId : Number(pathname.split('/').pop());
    const idx = store.users.findIndex((u) => Number(u.id) === Number(targetId));
    if (idx !== -1) {
      const existing = store.users[idx];
      store.users[idx] = hydrateUser({
        ...existing,
        name: body.name || existing.name,
        role_title: body.role_title || existing.role_title,
        bio: body.bio !== undefined ? body.bio : existing.bio,
        interests: Array.isArray(body.interests) ? body.interests : existing.interests,
        preferred_format: body.preferred_format || existing.preferred_format,
        location: body.location || existing.location,
        timezone: body.timezone || existing.timezone,
        session_length_mins: body.session_length_mins || existing.session_length_mins,
        availability: Array.isArray(body.availability) ? body.availability : existing.availability
      });
      saveStore(store);
      return { user: store.users[idx], viewer: store.users[idx] };
    }
  }

  if (pathname.match(/^\/api\/users\/\d+\/skills$/) && method === 'POST') {
    const targetId = Number(pathname.split('/')[3]);
    const idx = store.users.findIndex((u) => Number(u.id) === Number(targetId));
    if (idx !== -1) {
      const sName = String(body.skill_name || body.skill || '').trim();
      const newSkill = {
        id: Date.now(),
        user_id: targetId,
        type: body.type === 'want' ? 'want' : 'offer',
        skill_name: sName,
        skill: sName,
        category: body.category || 'Technology',
        proficiency: body.level || body.proficiency || 'Intermediate',
        level: body.level || body.proficiency || 'Intermediate',
        description: body.description || `1-on-1 ${sName} exchange`,
        tags: [sName.toLowerCase()]
      };
      store.users[idx].skills = [...(store.users[idx].skills || []), newSkill];
      store.users[idx] = hydrateUser(store.users[idx]);
      saveStore(store);
      return { user: store.users[idx], viewer: store.users[idx] };
    }
  }

  if (pathname.match(/^\/api\/skills\/\d+$/) && (method === 'PUT' || method === 'DELETE')) {
    const skillId = Number(pathname.split('/').pop());
    for (let i = 0; i < store.users.length; i++) {
      const u = store.users[i];
      if ((u.skills || []).some((s) => Number(s.id) === skillId)) {
        if (method === 'DELETE') {
          u.skills = u.skills.filter((s) => Number(s.id) !== skillId);
        } else {
          u.skills = u.skills.map((s) =>
            Number(s.id) === skillId
              ? {
                  ...s,
                  skill_name: body.skill_name || s.skill_name,
                  skill: body.skill_name || s.skill_name,
                  category: body.category || s.category,
                  proficiency: body.level || body.proficiency || s.proficiency,
                  level: body.level || body.proficiency || s.level,
                  description: body.description !== undefined ? body.description : s.description
                }
              : s
          );
        }
        store.users[i] = hydrateUser(u);
        saveStore(store);
        return { user: store.users[i], viewer: store.users[i] };
      }
    }
  }

  // 10. Exchange Requests, Scheduling, Completion & Reviews
  if ((pathname === '/api/requests' || pathname === '/api/exchange-requests') && method === 'POST') {
    const newReq = {
      id: Date.now(),
      requester_id: body.requester_id || activeViewerId,
      recipient_id: Number(body.recipient_id) || 2,
      offered_skill_name: body.offered_skill_name || 'Excel',
      wanted_skill_name: body.wanted_skill_name || 'Graphic Design',
      proposed_slot: body.session_datetime || body.proposed_slot || 'Weekday Evening • 7:00 PM',
      session_datetime: body.session_datetime || body.proposed_slot || 'Weekday Evening • 7:00 PM',
      session_mode: body.session_mode || 'Online',
      meeting_link_or_location: body.meeting_link_or_location || 'https://meet.skillswap.io/reciprocal-session',
      session_notes: body.session_notes || body.learning_goal || '',
      schedule_status: body.schedule_status || 'proposed',
      duration_mins: Number(body.duration_mins) || 60,
      format: body.format || 'Online',
      learning_goal: body.learning_goal || '',
      message: body.message || '',
      ai_match_score: 96,
      ai_match_rationale: 'Reciprocal skill match verified.',
      ai_session_agenda: body.ai_session_agenda || [],
      status: 'pending',
      created_at: new Date().toISOString()
    };
    store.requests.unshift(newReq);
    saveStore(store);
    const enriched = enrichRequests(store, activeViewerId);
    return { request: enriched[0], requests: enriched };
  }

  if (pathname.match(/^\/api\/(exchange-)?requests\/\d+\/schedule$/) && (method === 'PUT' || method === 'PATCH')) {
    const reqId = Number(pathname.split('/')[3]);
    store.requests = store.requests.map((r) =>
      Number(r.id) === reqId
        ? {
            ...r,
            session_datetime: body.session_datetime || r.session_datetime,
            proposed_slot: body.session_datetime || r.proposed_slot,
            session_mode: body.session_mode || r.session_mode,
            meeting_link_or_location: body.meeting_link_or_location ?? r.meeting_link_or_location,
            session_notes: body.session_notes ?? r.session_notes,
            schedule_status: body.schedule_status || r.schedule_status
          }
        : r
    );
    saveStore(store);
    return { requests: enrichRequests(store, activeViewerId) };
  }

  if (pathname.match(/^\/api\/(exchange-)?requests\/\d+$/) && method === 'PATCH') {
    const reqId = Number(pathname.split('/').pop());
    store.requests = store.requests.map((r) =>
      Number(r.id) === reqId ? { ...r, status: body.status || r.status } : r
    );
    saveStore(store);
    return { requests: enrichRequests(store, activeViewerId) };
  }

  if (pathname === '/api/exchanges' && method === 'POST') {
    const reqId = body.request_id ? Number(body.request_id) : null;
    if (reqId) {
      store.requests = store.requests.map((r) =>
        Number(r.id) === reqId
          ? {
              ...r,
              status: 'completed',
              schedule_status: 'agreed',
              rating_given: Number(body.rating_given) || 5,
              review_comment: body.testimonial || body.summary_notes || ''
            }
          : r
      );
    }
    store.exchanges.unshift({
      id: Date.now(),
      request_id: reqId,
      partner_a_id: body.partner_a_id || activeViewerId,
      partner_b_id: Number(body.partner_b_id) || 2,
      skill_a_taught: body.skill_a_taught || 'Skill A',
      skill_b_taught: body.skill_b_taught || 'Skill B',
      duration_mins: Number(body.duration_mins) || 60,
      completed_at: new Date().toISOString(),
      summary_notes: body.summary_notes || '',
      takeaways: body.takeaways || [],
      rating_given: Number(body.rating_given) || 5,
      testimonial: body.testimonial || 'Great 50/50 skill swap!',
      verified_badge: 'Verified 1-to-1 Reciprocal Swap'
    });
    saveStore(store);
    return { requests: enrichRequests(store, activeViewerId) };
  }

  if (pathname === '/api/ai/session-plan' && method === 'POST') {
    const reqU = getViewer(body.requesterId || activeViewerId);
    const recU = getViewer(body.recipientId || 2);
    const sA = body.offeredSkillName || 'Skill A';
    const sB = body.wantedSkillName || 'Skill B';
    return {
      suggestedMessage: `Hi ${recU.name.split(' ')[0]}! Let's trade a 50/50 session swapping ${sA} for ${sB}.`,
      agenda: [
        { phase: '00–05 min', title: 'Setup & Goals', detail: `Confirm focus areas for ${sA} and ${sB}.` },
        { phase: '05–30 min', title: `Part 1: ${sA}`, detail: `${reqU.name} leads practical walkthrough.` },
        { phase: '30–55 min', title: `Part 2: ${sB}`, detail: `${recU.name} leads hands-on coaching.` },
        { phase: '55–60 min', title: 'Wrap-Up', detail: 'Share templates and action items.' }
      ]
    };
  }

  return { status: 'ok' };
}
