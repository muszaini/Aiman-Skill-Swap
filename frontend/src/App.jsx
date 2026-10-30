import React, { useState, useEffect, useCallback } from 'react';
import { handleLocalApiRequest } from './localEngine';

const CATEGORIES = [
  'Design',
  'Technology',
  'Languages',
  'Business'
];

const PROFICIENCY_LEVELS = [
  'Beginner',
  'Intermediate',
  'Advanced'
];

const REFERENCE_SKILLS = [
  { skill_name: 'Python', category: 'Technology', level: 'Beginner', description: 'Zero-to-one Python fundamentals, data scripting, and automating repetitive workflows.' },
  { skill_name: 'Excel', category: 'Business', level: 'Intermediate', description: 'Pivot tables, XLOOKUP/INDEX-MATCH, financial modeling, and KPI dashboard design.' },
  { skill_name: 'Graphic design', category: 'Design', level: 'Advanced', description: 'Typography hierarchy, editorial grid layouts, visual branding, and Figma components.' },
  { skill_name: 'English conversation', category: 'Languages', level: 'Intermediate', description: 'Natural workplace idioms, interview roleplay, presentation fluency, and pronunciation.' }
];

const AVAILABILITY_OPTIONS = [
  'Weekday Mornings',
  'Weekday Evenings',
  'Saturday Mornings',
  'Sunday Afternoons'
];

export default function App() {
  const initialBoot = typeof window !== 'undefined' ? window.__INITIAL_BOOTSTRAP__ : null;

  const [viewerId, setViewerId] = useState(
    () => Number(localStorage.getItem('skillswap_viewer_id')) || initialBoot?.viewer?.id || 1
  );
  const [authToken, setAuthToken] = useState(
    () => localStorage.getItem('skillswap_token') || initialBoot?.token || ''
  );
  const [viewer, setViewer] = useState(() => initialBoot?.viewer || null);
  const [allUsers, setAllUsers] = useState(() => initialBoot?.allUsers || []);
  const [candidates, setCandidates] = useState(() => initialBoot?.candidates || []);
  const [queryIntent, setQueryIntent] = useState(() => initialBoot?.queryIntent || null);
  const [requests, setRequests] = useState(() => initialBoot?.requests || []);
  const [completedExchanges, setCompletedExchanges] = useState(
    () => initialBoot?.completedExchanges || []
  );
  const [learningPlans, setLearningPlans] = useState(() => initialBoot?.learningPlans || []);
  const [dashboard, setDashboard] = useState(() => initialBoot?.dashboard || null);
  const [stats, setStats] = useState(() => initialBoot?.stats || {});

  const [activeTab, setActiveTab] = useState(() => {
    const h = (typeof window !== 'undefined' && window.location.hash.replace('#', '')) || '';
    return ['dashboard', 'discover', 'requests', 'exchanges', 'profile', 'plans'].includes(h)
      ? h
      : 'discover';
  });
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeProficiency, setActiveProficiency] = useState('all');
  const [activeLearningPreference, setActiveLearningPreference] = useState('all');
  const [activeMatchMode, setActiveMatchMode] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [activeSearchQuery, setActiveSearchQuery] = useState('');
  const [directoryError, setDirectoryError] = useState(null);
  const [totalDirectoryCount, setTotalDirectoryCount] = useState(
    () => initialBoot?.totalDirectoryCount || (initialBoot?.candidates || []).length || 5
  );
  const [requestFilter, setRequestFilter] = useState('all');
  const [expandedBlueprints, setExpandedBlueprints] = useState({});
  const [toasts, setToasts] = useState([]);

  // Profile Edit State
  const [profForm, setProfForm] = useState({
    name: initialBoot?.viewer?.name || '',
    role_title: initialBoot?.viewer?.role_title || '',
    bio: initialBoot?.viewer?.bio || '',
    interests_text: (initialBoot?.viewer?.interests || []).join(', '),
    preferred_format: initialBoot?.viewer?.preferred_format || 'Online',
    location: initialBoot?.viewer?.location || '',
    timezone: initialBoot?.viewer?.timezone || '',
    session_length_mins: initialBoot?.viewer?.session_length_mins || 60,
    availability: initialBoot?.viewer?.availability || []
  });

  // New Skill Forms
  const [newOffer, setNewOffer] = useState({
    skill_name: '',
    category: 'Business',
    level: 'Intermediate',
    description: ''
  });
  const [newWant, setNewWant] = useState({
    skill_name: '',
    category: 'Technology',
    level: 'Beginner',
    description: ''
  });

  // Inline Skill Editing State (Objective 4: Edit skill listing)
  const [editingSkillId, setEditingSkillId] = useState(null);
  const [editingSkillForm, setEditingSkillForm] = useState({
    skill_name: '',
    category: 'Business',
    level: 'Intermediate',
    description: ''
  });

  // Member Detail Modal State (Screen 4: Clicking a member card opens their profile details)
  const [selectedMemberDetail, setSelectedMemberDetail] = useState(null);

  // Request Swap Modal State
  const [requestModalTarget, setRequestModalTarget] = useState(null);
  const [reqForm, setReqForm] = useState({
    offered_skill_name: '',
    wanted_skill_name: '',
    proposed_slot: '',
    session_datetime: '',
    session_mode: 'Online',
    meeting_link_or_location: '',
    session_notes: '',
    schedule_status: 'proposed',
    duration_mins: 60,
    format: '1-on-1 Live Video + Screen Share',
    learning_goal: '',
    message: '',
    ai_session_agenda: []
  });

  // Session Scheduling Editor State (for reviewing or editing session details from an exchange request)
  const [schedulingRequestId, setSchedulingRequestId] = useState(null);
  const [scheduleForm, setScheduleForm] = useState({
    session_datetime: '',
    session_mode: 'Online',
    meeting_link_or_location: '',
    session_notes: '',
    schedule_status: 'proposed'
  });

  // Record Completed Exchange Modal State
  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [recForm, setRecForm] = useState({
    request_id: null,
    partner_b_id: 2,
    duration_mins: 60,
    skill_a_taught: '',
    skill_b_taught: '',
    summary_notes: '',
    takeaways_text: '',
    rating_given: 5,
    testimonial: ''
  });

  // Auth / Register Modal State (Objective 3: Secure Registration & Login)
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [authError, setAuthError] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: 'maya@skillswap.io', password: 'skillswap123' });
  const [regForm, setRegForm] = useState({
    name: '',
    email: '',
    password: '',
    role_title: '',
    interests: 'Financial Tech, Visual Design, Automation',
    preferred_format: 'Online',
    location: 'Seattle, USA',
    timezone: 'UTC-7 (PDT)',
    bio: '',
    offer_skill: '',
    offer_category: 'Business',
    offer_level: 'Intermediate',
    offer_desc: '',
    want_skill: '',
    want_category: 'Technology',
    want_level: 'Beginner',
    want_desc: ''
  });

  // AI Skill Match Assistant Chatbox State
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState(null);
  const [chatMessages, setChatMessages] = useState(() => [
    {
      id: 'welcome-ai',
      role: 'assistant',
      text: `Hi ${
        initialBoot?.viewer?.name?.split(' ')[0] || 'there'
      }! I'm your **AI Skill Match Assistant**. I evaluate real registered members from the SkillSwap database against the skills you offer and want to learn.\n\nAsk me who can teach a specific skill, which members are most compatible with your profile, or how to structure your first 1-on-1 skill exchange!`,
      recommendedMembers: []
    }
  ]);

  const AI_CHAT_PROMPTS = [
    'Who can help me learn Python?',
    'Find someone who can teach me graphic design.',
    'Which members might be compatible with my skills?',
    'What skills could I exchange with another member?',
    'Help me plan my first skill exchange.'
  ];

  // Option 3: AI Profile and Skill Description Helper State (My Profile page)
  const [helperTask, setHelperTask] = useState('bio'); // 'bio' | 'skill_description'
  const [helperRoughNotes, setHelperRoughNotes] = useState('');
  const [helperSkillName, setHelperSkillName] = useState('');
  const [helperTargetSkillId, setHelperTargetSkillId] = useState('new');
  const [helperLoading, setHelperLoading] = useState(false);
  const [helperError, setHelperError] = useState(null);
  const [helperSuggestion, setHelperSuggestion] = useState('');
  const [helperEditedSuggestion, setHelperEditedSuggestion] = useState('');
  const [helperConfirmingBioReplace, setHelperConfirmingBioReplace] = useState(false);

  // Flow E: My Learning Plans State
  const [planSkill, setPlanSkill] = useState('Beginner Python Lessons');
  const [planGoals, setPlanGoals] = useState(
    'Automate weekly CSV data cleaning and replace heavy Excel formulas with reusable Python scripts.'
  );
  const [planFormat, setPlanFormat] = useState('Online');
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState(null);
  const [proposedPlan, setProposedPlan] = useState(null);
  const [editedPlanTitle, setEditedPlanTitle] = useState('');
  const [editedPlanContent, setEditedPlanContent] = useState('');

  const addToast = useCallback((msg) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, msg }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  }, []);

  const apiFetch = useCallback(
    async (url, options = {}) => {
      const { tokenOverride, ...fetchOpts } = options;
      const effectiveToken = tokenOverride !== undefined ? tokenOverride : authToken;
      const headers = { 'Content-Type': 'application/json', ...(fetchOpts.headers || {}) };
      if (effectiveToken) {
        headers['Authorization'] = `Bearer ${effectiveToken}`;
      }

      const tryRequest = async (targetUrl) => {
        try {
          const res = await fetch(targetUrl, { ...fetchOpts, headers });
          const text = await res.text();
          let data = null;
          try {
            data = text ? JSON.parse(text) : {};
          } catch {
            data = null;
          }
          return { res, data, text, networkError: false };
        } catch {
          return { res: { ok: false, status: 0 }, data: null, text: '', networkError: true };
        }
      };

      let result = await tryRequest(url);
      if (
        (result.data === null || result.res.status === 404) &&
        url.startsWith('/api/') &&
        typeof window !== 'undefined' &&
        !window.location.origin.includes('aiman-skill-swap.onrender.com')
      ) {
        const remoteResult = await tryRequest(`https://aiman-skill-swap.onrender.com${url}`);
        if (remoteResult.data !== null && remoteResult.res.status !== 404) {
          result = remoteResult;
        }
      }

      // If the host returned plain text "Not Found", 404, 5xx, or a network error, seamlessly use the persistent local engine
      if (
        result.networkError ||
        result.data === null ||
        result.res.status === 404 ||
        result.res.status >= 500 ||
        (result.data && result.data.detail === 'Not Found')
      ) {
        return handleLocalApiRequest(url, { ...fetchOpts, headers });
      }

      if (!result.res.ok) {
        throw new Error(result.data.error || result.data.detail || 'Request failed');
      }
      return result.data;
    },
    [authToken]
  );

  const loadBootstrap = useCallback(
    async (overrideViewerId = null, overrideToken = null) => {
      try {
        setDirectoryError(null);
        const effectiveViewerId = overrideViewerId !== null ? overrideViewerId : viewerId;
        const effectiveToken = overrideToken !== null ? overrideToken : authToken;
        const params = new URLSearchParams({
          viewerId: String(effectiveViewerId),
          query: activeSearchQuery,
          category: activeCategory,
          proficiency: activeProficiency,
          learningPreference: activeLearningPreference,
          matchMode: activeMatchMode
        });
        const data = await apiFetch(`/api/bootstrap?${params.toString()}`, {
          tokenOverride: effectiveToken
        });
        if (data.token && !effectiveToken) {
          setAuthToken(data.token);
          localStorage.setItem('skillswap_token', data.token);
        }
        if (data.viewer) {
          setViewer(data.viewer);
          localStorage.setItem('skillswap_viewer_id', String(data.viewer.id));
        }
        setAllUsers(data.allUsers || []);
        setCandidates(data.candidates || []);
        setTotalDirectoryCount(
          data.totalDirectoryCount !== undefined
            ? data.totalDirectoryCount
            : (data.candidates || []).length
        );
        setQueryIntent(data.queryIntent || null);
        setRequests(data.requests || []);
        setCompletedExchanges(data.completedExchanges || []);
        setLearningPlans(data.learningPlans || []);
        setDashboard(data.dashboard || null);
        setStats(data.stats || {});

        if (data.viewer) {
          setProfForm({
            name: data.viewer.name || '',
            role_title: data.viewer.role_title || '',
            bio: data.viewer.bio || '',
            interests_text: (data.viewer.interests || []).join(', '),
            preferred_format: data.viewer.preferred_format || 'Online',
            location: data.viewer.location || '',
            timezone: data.viewer.timezone || '',
            session_length_mins: data.viewer.session_length_mins || 60,
            availability: data.viewer.availability || []
          });
        }
      } catch (err) {
        setDirectoryError(err.message || 'Unable to filter member directory. Please try again.');
        addToast(err.message);
      }
    },
    [
      viewerId,
      activeSearchQuery,
      activeCategory,
      activeProficiency,
      activeLearningPreference,
      activeMatchMode,
      authToken,
      apiFetch,
      addToast
    ]
  );

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  // Send a message to the backend AI Skill Match Assistant (POST /api/ai/chat)
  const sendAiChatMessage = async (rawMessageText) => {
    const trimmed = String(rawMessageText || '').trim();
    if (!trimmed || chatLoading) return;

    const userMsg = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: trimmed
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);
    setChatError(null);

    try {
      const profileContext = {
        id: viewer?.id || viewerId,
        name: viewer?.name || '',
        preferred_format: viewer?.preferred_format || 'Online',
        offers: (viewer?.offers || []).map((s) => ({
          skill_name: s.skill_name || s.skill,
          category: s.category,
          level: s.proficiency || s.level
        })),
        wants: (viewer?.wants || []).map((s) => ({
          skill_name: s.skill_name || s.skill,
          category: s.category,
          level: s.proficiency || s.level
        }))
      };

      const data = await apiFetch('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: trimmed,
          viewerId: viewer?.id || viewerId,
          profileContext,
          history: chatMessages.slice(-6).map((m) => ({ role: m.role, text: m.text }))
        })
      });

      const assistantMsg = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        text: data.reply || 'Here are the most compatible registered members from the SkillSwap database.',
        recommendedMembers: data.recommendedMembers || [],
        profileContextUsed: data.profileContextUsed || null
      };

      setChatMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errMsg = err.message || 'Unable to reach the AI Skill Assistant right now. Please try again.';
      setChatError(errMsg);
    } finally {
      setChatLoading(false);
    }
  };

  const handleAiChatSubmit = (e) => {
    e.preventDefault();
    sendAiChatMessage(chatInput);
  };

  // Option 3: AI Profile and Skill Description Helper (`POST /api/ai/profile-helper`)
  const handleGenerateAiProfileHelper = async (e) => {
    if (e) e.preventDefault();
    const notesTrimmed = helperRoughNotes.trim();
    const skillTrimmed = helperSkillName.trim();

    // Client-side input validation (min & max lengths)
    if (notesTrimmed.length < 10) {
      setHelperError('Please enter at least 10 characters of rough notes so the AI helper has enough context.');
      return;
    }
    if (notesTrimmed.length > 500) {
      setHelperError('Rough notes must be 500 characters or fewer.');
      return;
    }
    if (helperTask === 'skill_description') {
      if (skillTrimmed.length < 2) {
        setHelperError('Please enter a skill name (at least 2 characters) for the AI Skill Description Helper.');
        return;
      }
      if (skillTrimmed.length > 80) {
        setHelperError('Skill name must be 80 characters or fewer.');
        return;
      }
    }

    setHelperLoading(true);
    setHelperError(null);
    setHelperConfirmingBioReplace(false);

    try {
      // Data Minimization: Send ONLY the selected task, rough_notes, and (when relevant) skill_name
      const minimalPayload =
        helperTask === 'skill_description'
          ? {
              task: 'skill_description',
              skill_name: skillTrimmed,
              rough_notes: notesTrimmed
            }
          : {
              task: 'bio',
              rough_notes: notesTrimmed
            };

      const data = await apiFetch('/api/ai/profile-helper', {
        method: 'POST',
        body: JSON.stringify(minimalPayload)
      });

      const generated = data.suggestion || '';
      setHelperSuggestion(generated);
      setHelperEditedSuggestion(generated);
      addToast(
        helperTask === 'bio'
          ? '✦ AI Profile Bio suggestion ready for review!'
          : `✦ AI Skill Description suggestion for "${skillTrimmed}" ready for review!`
      );
    } catch (err) {
      setHelperError(
        err.message || 'The AI Profile Helper service is currently unavailable. Please try again.'
      );
    } finally {
      setHelperLoading(false);
    }
  };

  // Explicit user confirmation before replacing existing profile bio
  const handleConfirmReplaceBio = async () => {
    const finalBio = helperEditedSuggestion.trim();
    if (!finalBio) {
      setHelperError('Reviewed bio cannot be empty.');
      return;
    }

    const updatedProf = { ...profForm, bio: finalBio };
    setProfForm(updatedProf);
    setHelperConfirmingBioReplace(false);

    try {
      const interestsArray = String(updatedProf.interests_text || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const data = await apiFetch('/api/profile', {
        method: 'PUT',
        body: JSON.stringify({
          userId: viewerId,
          ...updatedProf,
          interests: interestsArray
        })
      });
      setViewer(data.viewer);
      setCandidates(data.candidates || []);
      addToast('✓ Confirmed! Your profile bio has been updated and saved.');
    } catch (err) {
      addToast('✓ Applied to your profile bio editor. Click Save Profile Details to persist.');
    }
  };

  // Save reviewed skill description to an existing offered skill or the Add Offered Skill form
  const handleSaveSkillDescriptionFromHelper = async () => {
    const finalDesc = helperEditedSuggestion.trim();
    const cleanSkill = helperSkillName.trim() || 'Skill Coaching';
    if (!finalDesc) {
      setHelperError('Reviewed skill description cannot be empty.');
      return;
    }

    // Also persist to browser localStorage for prototype compatibility alongside database persistence
    try {
      const savedLocal = JSON.parse(localStorage.getItem('skillswap_saved_skill_descriptions') || '[]');
      savedLocal.unshift({
        skill_name: cleanSkill,
        description: finalDesc,
        saved_at: new Date().toISOString()
      });
      localStorage.setItem('skillswap_saved_skill_descriptions', JSON.stringify(savedLocal.slice(0, 20)));
    } catch {
      // ignore storage quota errors
    }

    const existingOffer = (viewer?.offers || []).find(
      (s) =>
        (helperTargetSkillId !== 'new' && String(s.id) === String(helperTargetSkillId)) ||
        s.skill_name.toLowerCase() === cleanSkill.toLowerCase()
    );

    if (existingOffer) {
      try {
        await apiFetch(`/api/skills/${existingOffer.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            skill_name: existingOffer.skill_name,
            category: existingOffer.category,
            level: existingOffer.level,
            description: finalDesc
          })
        });
        await loadBootstrap();
        addToast(`✓ Saved updated AI skill description to "${existingOffer.skill_name}"!`);
        return;
      } catch (err) {
        addToast(err.message);
      }
    }

    // Populate the "Add a Skill You Can Teach" form and save directly if desired
    setNewOffer((prev) => ({
      ...prev,
      skill_name: cleanSkill,
      description: finalDesc
    }));
    addToast(`✓ Applied description for "${cleanSkill}" to your Add Offered Skill form!`);
  };

  // Flow E: Create, Review, Edit, Save, and Delete AI Learning Plans
  const handleGenerateAiLearningPlan = async (e) => {
    if (e) e.preventDefault();
    if (planSkill.trim().length < 2) {
      setPlanError('Please enter a target skill (at least 2 characters).');
      return;
    }
    if (planGoals.trim().length < 10 || planGoals.trim().length > 500) {
      setPlanError('Learning goals must be between 10 and 500 characters.');
      return;
    }

    setPlanLoading(true);
    setPlanError(null);
    try {
      const data = await apiFetch('/api/ai/learning-plan', {
        method: 'POST',
        body: JSON.stringify({
          target_skill: planSkill.trim(),
          learning_goals: planGoals.trim(),
          preferred_format: planFormat
        })
      });
      setProposedPlan(data);
      setEditedPlanTitle(data.plan_title || `4-Week Learning Plan: ${planSkill.trim()}`);
      setEditedPlanContent(data.plan_content || '');
      addToast('✦ AI Learning Plan generated! Review and edit before saving.');
    } catch (err) {
      setPlanError(err.message || 'Unable to generate AI learning plan right now.');
    } finally {
      setPlanLoading(false);
    }
  };

  const handleSaveLearningPlan = async () => {
    if (!editedPlanContent.trim()) {
      setPlanError('Plan content cannot be empty.');
      return;
    }
    try {
      const data = await apiFetch('/api/learning-plans', {
        method: 'POST',
        body: JSON.stringify({
          target_skill: planSkill.trim(),
          learning_goals: planGoals.trim(),
          preferred_format: planFormat,
          plan_title: editedPlanTitle.trim(),
          plan_content: editedPlanContent.trim(),
          milestones: proposedPlan?.milestones || []
        })
      });
      setLearningPlans(data.learningPlans || []);
      setProposedPlan(null);
      addToast('✓ Learning plan saved privately to your account!');
    } catch (err) {
      setPlanError(err.message);
    }
  };

  const handleDeleteLearningPlan = async (planId) => {
    try {
      const data = await apiFetch(`/api/learning-plans/${planId}`, {
        method: 'DELETE'
      });
      setLearningPlans(data.learningPlans || []);
      addToast('Removed learning plan.');
    } catch (err) {
      addToast(err.message);
    }
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    localStorage.removeItem('skillswap_token');
    setAuthToken('');
    setAuthError(null);
    setAuthMode('login');
    setAuthModalOpen(true);
    addToast('Signed out of current session.');
  };

  // Switch active user perspective and obtain valid session token
  const handleSwitchMember = async (targetUserId) => {
    try {
      const res = await apiFetch('/api/auth/switch', {
        method: 'POST',
        body: JSON.stringify({ userId: Number(targetUserId) })
      });
      setAuthToken(res.token);
      localStorage.setItem('skillswap_token', res.token);
      setViewer(res.user);
      setViewerId(res.user.id);
      localStorage.setItem('skillswap_viewer_id', String(res.user.id));
      await loadBootstrap(res.user.id, res.token);
      addToast(`Authenticated as ${res.user.name} (@${res.user.handle})`);
    } catch (err) {
      setViewerId(Number(targetUserId));
    }
  };

  // Handle Login Submit
  const handleLoginSubmit = async (e, quickCredentials = null) => {
    if (e) e.preventDefault();
    const creds = quickCredentials || loginForm;
    if (!creds.email || !creds.email.trim() || !creds.password) {
      setAuthError('Please enter both your email/handle and password.');
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: creds.email.trim(),
          password: creds.password
        })
      });
      setAuthToken(res.token);
      localStorage.setItem('skillswap_token', res.token);
      if (res.user) {
        setViewer(res.user);
        setViewerId(res.user.id);
        localStorage.setItem('skillswap_viewer_id', String(res.user.id));
      }
      await loadBootstrap(res.user?.id, res.token);
      setAuthModalOpen(false);
      addToast(`✓ Signed in securely as ${res.user?.name || creds.email}!`);
    } catch (err) {
      setAuthError(err.message || 'Unable to sign in. Please check your email and password.');
      addToast(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  // Handle Registration Submit
  const handleRegisterSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!regForm.name.trim() || !regForm.email.trim() || !regForm.password) {
      setAuthError('Please fill in Display Name, Email Address, and Password.');
      return;
    }
    if (regForm.password.trim().length < 3) {
      setAuthError('Password must be at least 3 characters.');
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      const offerSkillName = regForm.offer_skill.trim() || 'Excel & Spreadsheet Modeling';
      const wantSkillName = regForm.want_skill.trim() || 'Beginner Python Lessons';
      const payload = {
        name: regForm.name.trim(),
        email: regForm.email.trim(),
        password: regForm.password,
        role_title: regForm.role_title.trim() || 'SkillSwap Community Member',
        interests: (regForm.interests || 'Peer Learning, Skill Exchange')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        preferred_format: regForm.preferred_format || 'Online',
        location: regForm.location.trim() || 'Remote',
        timezone: regForm.timezone.trim() || 'UTC',
        bio:
          regForm.bio.trim() ||
          `Offering 1-on-1 coaching in ${offerSkillName} and excited to learn ${wantSkillName}.`,
        offers: [
          {
            skill_name: offerSkillName,
            category: regForm.offer_category || 'Business',
            level: regForm.offer_level || 'Intermediate',
            description: regForm.offer_desc || `Practical 1-on-1 coaching in ${offerSkillName}`
          }
        ],
        wants: [
          {
            skill_name: wantSkillName,
            category: regForm.want_category || 'Technology',
            level: regForm.want_level || 'Beginner',
            description: regForm.want_desc || `Looking to learn hands-on ${wantSkillName}`
          }
        ]
      };
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setAuthToken(res.token);
      localStorage.setItem('skillswap_token', res.token);
      if (res.user) {
        setViewer(res.user);
        setViewerId(res.user.id);
        localStorage.setItem('skillswap_viewer_id', String(res.user.id));
        setAllUsers((prev) =>
          prev.some((u) => Number(u.id) === Number(res.user.id)) ? prev : [...prev, res.user]
        );
      }
      await loadBootstrap(res.user?.id, res.token);
      setAuthModalOpen(false);
      setActiveTab('discover');
      addToast(`✓ Welcome to SkillSwap, ${res.user?.name}! AI calculated your reciprocal matches.`);
    } catch (err) {
      setAuthError(err.message || 'Registration failed. Please check your details and try again.');
      addToast(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  // Handle AI Search
  const handleAiSearchSubmit = (e) => {
    e.preventDefault();
    setActiveSearchQuery(searchInput.trim());
    if (searchInput.trim()) {
      addToast('AI Matchmaker analyzed your prompt and ranked compatible peers!');
    }
  };

  const applyPresetPrompt = (promptText) => {
    setSearchInput(promptText);
    setActiveSearchQuery(promptText);
    setActiveCategory('all');
  };

  const exploreEveryone = () => {
    setSearchInput('');
    setActiveSearchQuery('');
    setActiveCategory('all');
    setActiveProficiency('all');
    setActiveLearningPreference('all');
    setActiveMatchMode('all');
    setDirectoryError(null);
  };

  const hasActiveFilters =
    Boolean(activeSearchQuery) ||
    activeCategory !== 'all' ||
    activeProficiency !== 'all' ||
    activeLearningPreference !== 'all' ||
    activeMatchMode !== 'all';

  // Open Request Modal
  const openRequestModal = (candidate) => {
    const m = candidate.aiMatch;
    const sharedSlot = (m.sharedAvailability && m.sharedAvailability[0]) || 'Weekday Evening';
    const defaultSlot = `Upcoming ${sharedSlot} (7:00 PM – 8:00 PM)`;
    const defaultGoal = `Trade a 30-min ${m.youTeach.skillName} clinic for a 30-min hands-on ${m.theyTeach.skillName} session.`;
    setRequestModalTarget(candidate);
    setReqForm({
      offered_skill_name: m.youTeach.skillName,
      wanted_skill_name: m.theyTeach.skillName,
      proposed_slot: defaultSlot,
      session_datetime: defaultSlot,
      session_mode: candidate.preferred_format === 'In person' ? 'In person' : 'Online',
      meeting_link_or_location:
        candidate.preferred_format === 'In person'
          ? 'Local Café / Shared Study Space'
          : 'https://meet.skillswap.io/reciprocal-session',
      session_notes: defaultGoal,
      schedule_status: 'proposed',
      duration_mins: candidate.session_length_mins || 60,
      format: '1-on-1 Live Video + Screen Share',
      learning_goal: defaultGoal,
      message: m.suggestedPitch,
      ai_session_agenda: m.suggestedAgenda || []
    });
  };

  // Session Scheduling Handlers
  const openScheduleEditor = (reqObj) => {
    setSchedulingRequestId(reqObj.id);
    setScheduleForm({
      session_datetime: reqObj.session_datetime || reqObj.proposed_slot || '',
      session_mode: ['Online', 'In person'].includes(reqObj.session_mode)
        ? reqObj.session_mode
        : 'Online',
      meeting_link_or_location:
        reqObj.meeting_link_or_location || `https://meet.skillswap.io/swap-room-${reqObj.id}`,
      session_notes: reqObj.session_notes || reqObj.learning_goal || '',
      schedule_status: reqObj.schedule_status === 'agreed' ? 'agreed' : 'proposed'
    });
  };

  const handleSaveSessionSchedule = async (e, reqId) => {
    if (e) e.preventDefault();
    try {
      await apiFetch(`/api/requests/${reqId}/schedule`, {
        method: 'PUT',
        body: JSON.stringify(scheduleForm)
      });
      setSchedulingRequestId(null);
      await loadBootstrap();
      addToast(
        scheduleForm.schedule_status === 'agreed'
          ? 'Session details saved and marked as Agreed by both members!'
          : 'Proposed session schedule updated in database!'
      );
    } catch (err) {
      addToast(err.message);
    }
  };

  const handleAgreeSessionSchedule = async (reqObj) => {
    try {
      await apiFetch(`/api/requests/${reqObj.id}/schedule`, {
        method: 'PUT',
        body: JSON.stringify({
          session_datetime: reqObj.session_datetime || reqObj.proposed_slot,
          session_mode: reqObj.session_mode || 'Online',
          meeting_link_or_location: reqObj.meeting_link_or_location || '',
          session_notes: reqObj.session_notes || reqObj.learning_goal || '',
          schedule_status: 'agreed'
        })
      });
      await loadBootstrap();
      addToast('Session schedule marked as Agreed by both members!');
    } catch (err) {
      addToast(err.message);
    }
  };

  const regenerateModalAiBlueprint = async (overrideFields = {}) => {
    if (!requestModalTarget || !viewer) return;
    const merged = { ...reqForm, ...overrideFields };
    try {
      const plan = await apiFetch('/api/ai/session-plan', {
        method: 'POST',
        body: JSON.stringify({
          requesterId: viewer.id,
          recipientId: requestModalTarget.id,
          offeredSkillName: merged.offered_skill_name,
          wantedSkillName: merged.wanted_skill_name,
          durationMins: Number(merged.duration_mins) || 60,
          learningGoal: merged.learning_goal
        })
      });
      setReqForm((prev) => ({
        ...prev,
        ...overrideFields,
        message: plan.suggestedMessage,
        ai_session_agenda: plan.agenda
      }));
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendSwapRequest = async (e) => {
    e.preventDefault();
    if (!requestModalTarget || !viewer) return;
    try {
      await apiFetch('/api/requests', {
        method: 'POST',
        body: JSON.stringify({
          requester_id: viewer.id,
          recipient_id: requestModalTarget.id,
          ...reqForm
        })
      });
      setRequestModalTarget(null);
      await loadBootstrap();
      setActiveTab('requests');
      addToast('Skill-exchange request sent with your 50/50 AI Session Blueprint!');
    } catch (err) {
      addToast(err.message);
    }
  };

  const handleRequestAction = async (reqId, newStatus) => {
    try {
      await apiFetch(`/api/requests/${reqId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus, viewerId: viewer?.id })
      });
      await loadBootstrap();
      addToast(
        newStatus === 'accepted'
          ? 'Swap request accepted! You can now complete the session.'
          : `Request marked as ${newStatus}.`
      );
    } catch (err) {
      addToast(err.message);
    }
  };

  const openRecordExchangeFromRequest = (reqObj = null) => {
    if (reqObj) {
      const isIncoming = reqObj.direction === 'incoming';
      const partnerId = isIncoming ? reqObj.requester_id : reqObj.recipient_id;
      const youTaught = isIncoming ? reqObj.wanted_skill_name : reqObj.offered_skill_name;
      const partnerTaught = isIncoming ? reqObj.offered_skill_name : reqObj.wanted_skill_name;
      setRecForm({
        request_id: reqObj.id,
        partner_b_id: partnerId,
        duration_mins: reqObj.duration_mins || 60,
        skill_a_taught: youTaught,
        skill_b_taught: partnerTaught,
        summary_notes: `Completed our 50/50 reciprocal session: ${reqObj.learning_goal}`,
        takeaways_text: `Built practical templates for ${youTaught}\nCompleted hands-on walkthrough in ${partnerTaught}\nExchanged follow-up practice files`,
        rating_given: 5,
        testimonial: `Awesome 50/50 session! Trading ${youTaught} for ${partnerTaught} was super clear and immediately useful.`
      });
    } else {
      const topCand = candidates[0];
      setRecForm({
        request_id: null,
        partner_b_id: topCand?.id || 2,
        duration_mins: 60,
        skill_a_taught: topCand?.aiMatch?.youTeach?.skillName || viewer?.offers?.[0]?.skill_name || 'Excel',
        skill_b_taught: topCand?.aiMatch?.theyTeach?.skillName || viewer?.wants?.[0]?.skill_name || 'Graphic Design',
        summary_notes: '',
        takeaways_text: '',
        rating_given: 5,
        testimonial: ''
      });
    }
    setRecordModalOpen(true);
  };

  const handleRecordExchangeSubmit = async (e) => {
    e.preventDefault();
    if (!viewer) return;
    const takeaways = recForm.takeaways_text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    try {
      await apiFetch('/api/exchanges', {
        method: 'POST',
        body: JSON.stringify({
          viewerId: viewer.id,
          request_id: recForm.request_id,
          partner_a_id: viewer.id,
          partner_b_id: Number(recForm.partner_b_id),
          duration_mins: Number(recForm.duration_mins) || 60,
          skill_a_taught: recForm.skill_a_taught,
          skill_b_taught: recForm.skill_b_taught,
          summary_notes: recForm.summary_notes,
          takeaways,
          rating_given: Number(recForm.rating_given) || 5,
          testimonial: recForm.testimonial
        })
      });
      setRecordModalOpen(false);
      await loadBootstrap();
      setActiveTab('exchanges');
      addToast('Completed skill exchange verified and persisted in the database!');
    } catch (err) {
      addToast(err.message);
    }
  };

  // Profile Studio Handlers (Objectives 3 & 4)
  const handleSaveProfileDetails = async (e) => {
    e.preventDefault();
    if (!viewer) return;
    try {
      const interests = (profForm.interests_text || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      await apiFetch(`/api/users/${viewer.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...profForm,
          interests
        })
      });
      await loadBootstrap();
      addToast('Profile saved! AI compatibility scores recalculated.');
    } catch (err) {
      addToast(err.message);
    }
  };

  const handleAddSkill = async (e, type) => {
    e.preventDefault();
    if (!viewer) return;
    const formObj = type === 'offer' ? newOffer : newWant;
    try {
      await apiFetch(`/api/users/${viewer.id}/skills`, {
        method: 'POST',
        body: JSON.stringify({ type, ...formObj })
      });
      if (type === 'offer') {
        setNewOffer({ skill_name: '', category: 'Business', level: 'Intermediate', description: '' });
      } else {
        setNewWant({ skill_name: '', category: 'Technology', level: 'Beginner', description: '' });
      }
      await loadBootstrap();
      addToast(`Added "${formObj.skill_name}" to your profile!`);
    } catch (err) {
      addToast(err.message);
    }
  };

  const startEditingSkill = (skill) => {
    setEditingSkillId(skill.id);
    setEditingSkillForm({
      skill_name: skill.skill_name,
      category: skill.category,
      level: skill.level,
      description: skill.description
    });
  };

  const handleSaveEditedSkill = async (skillId) => {
    try {
      await apiFetch(`/api/skills/${skillId}`, {
        method: 'PUT',
        body: JSON.stringify(editingSkillForm)
      });
      setEditingSkillId(null);
      await loadBootstrap();
      addToast('Skill listing updated and AI compatibility scores refreshed!');
    } catch (err) {
      addToast(err.message);
    }
  };

  const handleDeleteSkill = async (skillId) => {
    try {
      await apiFetch(`/api/skills/${skillId}`, { method: 'DELETE' });
      await loadBootstrap();
      addToast('Skill listing removed from your profile.');
    } catch (err) {
      addToast(err.message);
    }
  };

  const toggleAvailabilityWindow = (win) => {
    setProfForm((prev) => {
      const exists = prev.availability.includes(win);
      const next = exists
        ? prev.availability.filter((w) => w !== win)
        : [...prev.availability, win];
      return { ...prev, availability: next };
    });
  };

  const pendingReqsCount =
    dashboard?.pendingCount ?? requests.filter((r) => r.status === 'pending').length;
  const acceptedReqsCount =
    dashboard?.acceptedCount ?? requests.filter((r) => r.status === 'accepted').length;
  const completedCountMetric =
    dashboard?.completedCount ??
    completedExchanges.filter((c) => c.involves_viewer).length;
  const actionableReqsCount = pendingReqsCount + acceptedReqsCount;

  const filteredRequests = requests.filter((r) => {
    if (requestFilter === 'incoming') return r.direction === 'incoming';
    if (requestFilter === 'outgoing') return r.direction === 'outgoing';
    if (['pending', 'accepted', 'declined', 'completed', 'cancelled'].includes(requestFilter)) {
      return r.status === requestFilter;
    }
    return true;
  });

  const totalHoursLogged = (
    completedExchanges.reduce((acc, c) => acc + (Number(c.duration_mins) || 60), 0) / 60
  ).toFixed(1);

  return (
    <div>
      {/* Sticky Top Navigation */}
      <header className="topbar">
        <div className="topbar-inner">
          <a
            href="#discover"
            className="brand"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('discover');
            }}
          >
            <span className="brand-mark" aria-hidden="true">
              <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
                <rect width="28" height="28" rx="8" fill="#0F766E" />
                <path
                  d="M7.5 11H19.5L16 7.5M20.5 17H8.5L12 20.5"
                  stroke="#FBF9F5"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <div className="brand-text">
              <span className="brand-name">SkillSwap</span>
              <span className="brand-tag">Reciprocal Learning Atelier</span>
            </div>
          </a>

          <nav className="main-nav" aria-label="Primary Navigation">
            <button
              className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              <span>Dashboard</span>
            </button>
            <button
              className={`nav-tab ${activeTab === 'discover' ? 'active' : ''}`}
              onClick={() => setActiveTab('discover')}
            >
              <span>Discover &amp; AI Match</span>
            </button>
            <button
              className={`nav-tab ${activeTab === 'requests' ? 'active' : ''}`}
              onClick={() => setActiveTab('requests')}
            >
              <span>Swap Requests</span>
              <span className="nav-badge">{actionableReqsCount}</span>
            </button>
            <button
              className={`nav-tab ${activeTab === 'exchanges' ? 'active' : ''}`}
              onClick={() => setActiveTab('exchanges')}
            >
              <span>Completed Exchanges</span>
              <span className="nav-badge subtle">{completedExchanges.length}</span>
            </button>
            <button
              className={`nav-tab ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              <span>My Skill Profile</span>
            </button>
            <button
              className={`nav-tab ${activeTab === 'plans' ? 'active' : ''}`}
              onClick={() => setActiveTab('plans')}
            >
              <span>My Learning Plans</span>
              <span className="nav-badge subtle">{learningPlans.length}</span>
            </button>
          </nav>

          <div className="topbar-actions">
            <div className="persona-switcher" title="Switch active member perspective to test reciprocal swaps">
              <span className="persona-label">Viewing as:</span>
              <select
                className="persona-select"
                aria-label="Switch active member profile"
                value={viewer?.id || viewerId}
                onChange={(e) => handleSwitchMember(e.target.value)}
              >
                {allUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} (@{u.handle})
                  </option>
                ))}
              </select>
            </div>
            <button
              className="btn-outline-sm"
              onClick={() => {
                setAuthError(null);
                setAuthMode('login');
                setAuthModalOpen(true);
              }}
            >
              {authToken && viewer?.name ? `✓ ${viewer.name.split(' ')[0]} • Switch / Register` : 'Sign In / Register'}
            </button>
            {authToken && (
              <button
                className="btn-outline-sm"
                style={{ color: '#B91C1C', borderColor: '#FECACA' }}
                onClick={handleLogout}
              >
                Sign Out
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="workspace-container">
        {/* Left Sticky Sidebar: Active User's Reciprocal Passport */}
        <aside className="passport-sidebar">
          <div className="passport-card">
            <div className="passport-header">
              <div
                className="avatar-lg"
                style={{ backgroundColor: viewer?.avatar_bg || '#0F766E' }}
              >
                {viewer?.avatar_initials || 'ML'}
              </div>
              <div className="passport-identity">
                <div className="passport-eyebrow">ACTIVE SKILL PASSPORT</div>
                <h2>{viewer?.name || 'Maya Lin'}</h2>
                <p className="passport-role">{viewer?.role_title}</p>
                <div className="passport-meta">
                  <span>{viewer?.location?.split(',')[0]}</span>
                  <span>•</span>
                  <span className="mono-stat">★ {Number(viewer?.rating || 5).toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="passport-stats-grid">
              <div className="passport-stat-box">
                <span className="stat-val mono-stat">{viewer?.completed_swaps_count || 0}</span>
                <span className="stat-lbl">Completed Swaps</span>
              </div>
              <div className="passport-stat-box">
                <span className="stat-val mono-stat">{viewer?.hours_exchanged || 0}h</span>
                <span className="stat-lbl">Tuition-Free Hours</span>
              </div>
            </div>

            <div className="passport-section">
              <div className="passport-section-head">
                <span className="pill-indicator offer-dot"></span>
                <h3>Skills I Teach (Offering)</h3>
                <button className="link-btn" onClick={() => setActiveTab('profile')}>
                  Manage
                </button>
              </div>
              <div className="passport-skills-list">
                {(viewer?.offers || []).map((s) => (
                  <div key={s.id} className="mini-skill-tag offer">
                    <span>{s.skill_name}</span>
                    <span className="mini-skill-lvl">
                      {s.category} • {s.level}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="passport-section">
              <div className="passport-section-head">
                <span className="pill-indicator want-dot"></span>
                <h3>Skills I Want to Learn</h3>
                <button className="link-btn" onClick={() => setActiveTab('profile')}>
                  Manage
                </button>
              </div>
              <div className="passport-skills-list">
                {(viewer?.wants || []).map((s) => (
                  <div key={s.id} className="mini-skill-tag want">
                    <span>{s.skill_name}</span>
                    <span className="mini-skill-lvl">
                      {s.category} • {s.level}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="passport-section">
              <div className="passport-section-head">
                <h3>Interests &amp; Format</h3>
              </div>
              <div className="availability-chips" style={{ marginBottom: 8 }}>
                <span className="skill-pill-sm offer">
                  Format: {viewer?.preferred_format || 'Online'}
                </span>
                {(viewer?.interests || []).map((topic) => (
                  <span key={topic} className="avail-chip">
                    {topic}
                  </span>
                ))}
              </div>
            </div>

            <div className="passport-section">
              <div className="passport-section-head">
                <h3>Preferred Windows</h3>
              </div>
              <div className="availability-chips">
                {(viewer?.availability || []).map((a) => (
                  <span key={a} className="avail-chip">
                    {a}
                  </span>
                ))}
              </div>
            </div>

            <div className="passport-footer">
              <button
                className="btn btn-secondary full-width"
                onClick={() => setActiveTab('profile')}
              >
                Customize Skill Profile
              </button>
            </div>
          </div>

          <div className="community-pulse-card">
            <div className="pulse-eyebrow">TUITION-FREE LEARNING LEDGER</div>
            <p className="pulse-copy">
              Every session on SkillSwap is a <strong>50/50 reciprocal exchange</strong>—teach what comes naturally to you, learn what you need next.
            </p>
            <div className="pulse-metrics">
              <div>
                <strong className="mono-stat">{stats.communityMembers || allUsers.length}</strong>
                <span>Active Peers</span>
              </div>
              <div>
                <strong className="mono-stat">{stats.activeMatchesCount || candidates.length}</strong>
                <span>90%+ AI Matches</span>
              </div>
              <div>
                <strong className="mono-stat">{stats.totalHoursSaved || 56}h</strong>
                <span>Hours Exchanged</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Stage */}
        <section className="main-stage">
          {/* TAB 0: MEMBER DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div>
              <div className="section-header-bar split">
                <div>
                  <span className="eyebrow-badge">MEMBER EXCHANGE OVERVIEW</span>
                  <h1 className="section-title">Your SkillSwap Dashboard</h1>
                  <p className="section-subtitle">
                    Live authenticated database summary of your skills offered and wanted, pending incoming and outgoing requests, upcoming accepted exchanges, and completed session metrics.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setActiveTab('profile')}
                  >
                    Edit Profile &amp; Skills
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setActiveTab('discover')}
                  >
                    Discover New Skill Partners →
                  </button>
                </div>
              </div>

              {/* 4. SUMMARY METRICS & 2. REQUEST COUNTS */}
              <div className="exchanges-summary-strip" style={{ marginBottom: 24 }}>
                <div className="ledger-stat-card">
                  <strong>
                    {dashboard?.requestSummary?.pendingIncomingCount ??
                      requests.filter((r) => r.status === 'pending' && r.direction === 'incoming')
                        .length}
                  </strong>
                  <span>Pending Incoming</span>
                </div>
                <div className="ledger-stat-card">
                  <strong>
                    {dashboard?.requestSummary?.pendingOutgoingCount ??
                      requests.filter((r) => r.status === 'pending' && r.direction === 'outgoing')
                        .length}
                  </strong>
                  <span>Pending Outgoing</span>
                </div>
                <div className="ledger-stat-card">
                  <strong>
                    {dashboard?.summaryMetrics?.totalCompletedCount ?? completedCountMetric}
                  </strong>
                  <span>Total Exchanges Completed</span>
                </div>
                <div className="ledger-stat-card">
                  <strong>{dashboard?.summaryMetrics?.averageRatingDisplay ?? '—'}</strong>
                  <span>
                    Average Rating (
                    {dashboard?.summaryMetrics?.ratingsCount
                      ? `${dashboard.summaryMetrics.ratingsCount} rated`
                      : 'No ratings yet'}
                    )
                  </span>
                </div>
              </div>

              {/* 1. SKILLS OVERVIEW (Skills Offered & Skills Wanted + Edit Profile Shortcut) */}
              <div className="studio-card" style={{ marginBottom: 24 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12,
                    marginBottom: 16
                  }}
                >
                  <div>
                    <span className="eyebrow-badge">1. SKILLS OVERVIEW</span>
                    <h3 className="studio-card-title" style={{ marginTop: 4, marginBottom: 4 }}>
                      Your Teaching Skills &amp; Learning Goals
                    </h3>
                    <p className="peer-submeta">
                      Retrieved from your authenticated database profile (`user_skills` &amp; `skills`).
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setActiveTab('profile')}
                  >
                    Edit Profile &amp; Update Skills →
                  </button>
                </div>

                <div className="form-row-2">
                  <div
                    style={{
                      backgroundColor: '#F0FDF4',
                      border: '1px solid #BBF7D0',
                      borderRadius: 12,
                      padding: 16
                    }}
                  >
                    <span className="badge-offer">SKILLS OFFERED (TEACHING)</span>
                    <h4 style={{ margin: '8px 0 10px' }}>
                      Skills You Can Teach ({(viewer?.offers || []).length})
                    </h4>
                    {(viewer?.offers || []).length === 0 ? (
                      <p className="peer-submeta">
                        No teaching skills listed yet. Click Edit Profile to add skills you can share.
                      </p>
                    ) : (
                      <div className="studio-skill-items">
                        {(viewer?.offers || []).map((s) => (
                          <div key={s.id} className="studio-skill-row">
                            <div>
                              <strong>{s.skill_name}</strong>{' '}
                              <span className="mini-skill-lvl">
                                {s.category} • {s.proficiency || s.level}
                              </span>
                              <p className="peer-submeta">{s.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      backgroundColor: '#FFF7ED',
                      border: '1px solid #FED7AA',
                      borderRadius: 12,
                      padding: 16
                    }}
                  >
                    <span className="badge-want">SKILLS WANTED (LEARNING)</span>
                    <h4 style={{ margin: '8px 0 10px' }}>
                      Skills You Want to Learn ({(viewer?.wants || []).length})
                    </h4>
                    {(viewer?.wants || []).length === 0 ? (
                      <p className="peer-submeta">
                        No learning goals listed yet. Click Edit Profile to add skills you want to learn.
                      </p>
                    ) : (
                      <div className="studio-skill-items">
                        {(viewer?.wants || []).map((s) => (
                          <div key={s.id} className="studio-skill-row">
                            <div>
                              <strong>{s.skill_name}</strong>{' '}
                              <span className="mini-skill-lvl">
                                {s.category} • {s.proficiency || s.level}
                              </span>
                              <p className="peer-submeta">{s.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. EXCHANGE REQUEST SUMMARY (Pending Incoming vs Pending Outgoing) */}
              <div className="studio-card" style={{ marginBottom: 24 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12,
                    marginBottom: 16
                  }}
                >
                  <div>
                    <span className="eyebrow-badge">2. EXCHANGE REQUEST SUMMARY</span>
                    <h3 className="studio-card-title" style={{ marginTop: 4, marginBottom: 4 }}>
                      Pending Incoming &amp; Outgoing Requests
                    </h3>
                    <p className="peer-submeta">
                      Requests received from other members awaiting your response, and invitations you have sent.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setActiveTab('requests')}
                  >
                    Open Full Request Manager ({requests.length})
                  </button>
                </div>

                <div className="form-row-2">
                  {/* Pending Incoming */}
                  <div
                    style={{
                      backgroundColor: '#F8FAFC',
                      border: '1px solid #CBD5E1',
                      borderRadius: 12,
                      padding: 16
                    }}
                  >
                    <h4 style={{ marginTop: 0, marginBottom: 8 }}>
                      ↙ Pending Incoming (
                      {
                        requests.filter(
                          (r) => r.status === 'pending' && r.direction === 'incoming'
                        ).length
                      }
                      )
                    </h4>
                    {requests.filter((r) => r.status === 'pending' && r.direction === 'incoming')
                      .length === 0 ? (
                      <p className="peer-submeta">
                        No incoming requests are currently awaiting your response.
                      </p>
                    ) : (
                      requests
                        .filter((r) => r.status === 'pending' && r.direction === 'incoming')
                        .map((r) => (
                          <div
                            key={r.id}
                            style={{
                              backgroundColor: '#FFFFFF',
                              border: '1px solid #E2E8F0',
                              borderRadius: 10,
                              padding: 12,
                              marginBottom: 10
                            }}
                          >
                            <div style={{ fontWeight: 700, marginBottom: 4 }}>
                              From {r.requester_name} •{' '}
                              <span className="status-pill pending">pending</span>
                            </div>
                            <div style={{ fontSize: '0.85rem', marginBottom: 6 }}>
                              <strong>They Teach:</strong> {r.offered_skill_name} ⇄{' '}
                              <strong>You Teach:</strong> {r.wanted_skill_name}
                            </div>
                            <div
                              style={{
                                fontSize: '0.8rem',
                                color: '#475569',
                                marginBottom: 8
                              }}
                            >
                              Proposed: {r.session_datetime || r.proposed_slot} (
                              {r.session_mode || 'Online'})
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                className="btn btn-success"
                                style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                                onClick={() => handleRequestAction(r.id, 'accepted')}
                              >
                                ✓ Accept
                              </button>
                              <button
                                type="button"
                                className="btn btn-danger-outline"
                                style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                                onClick={() => handleRequestAction(r.id, 'declined')}
                              >
                                Decline
                              </button>
                            </div>
                          </div>
                        ))
                    )}
                  </div>

                  {/* Pending Outgoing */}
                  <div
                    style={{
                      backgroundColor: '#F8FAFC',
                      border: '1px solid #CBD5E1',
                      borderRadius: 12,
                      padding: 16
                    }}
                  >
                    <h4 style={{ marginTop: 0, marginBottom: 8 }}>
                      ↗ Pending Outgoing (
                      {
                        requests.filter(
                          (r) => r.status === 'pending' && r.direction === 'outgoing'
                        ).length
                      }
                      )
                    </h4>
                    {requests.filter((r) => r.status === 'pending' && r.direction === 'outgoing')
                      .length === 0 ? (
                      <p className="peer-submeta">
                        You have no pending outgoing requests awaiting a response.
                      </p>
                    ) : (
                      requests
                        .filter((r) => r.status === 'pending' && r.direction === 'outgoing')
                        .map((r) => (
                          <div
                            key={r.id}
                            style={{
                              backgroundColor: '#FFFFFF',
                              border: '1px solid #E2E8F0',
                              borderRadius: 10,
                              padding: 12,
                              marginBottom: 10
                            }}
                          >
                            <div style={{ fontWeight: 700, marginBottom: 4 }}>
                              Sent to {r.recipient_name} •{' '}
                              <span className="status-pill pending">pending</span>
                            </div>
                            <div style={{ fontSize: '0.85rem', marginBottom: 6 }}>
                              <strong>You Teach:</strong> {r.offered_skill_name} ⇄{' '}
                              <strong>They Teach:</strong> {r.wanted_skill_name}
                            </div>
                            <div
                              style={{
                                fontSize: '0.8rem',
                                color: '#475569',
                                marginBottom: 8
                              }}
                            >
                              Proposed: {r.session_datetime || r.proposed_slot} (
                              {r.session_mode || 'Online'})
                            </div>
                            <button
                              type="button"
                              className="btn btn-danger-outline"
                              style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                              onClick={() => handleRequestAction(r.id, 'cancelled')}
                            >
                              Cancel Request
                            </button>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              </div>

              {/* 3. UPCOMING EXCHANGES (Accepted Exchanges + Empty State) */}
              <div className="studio-card" style={{ marginBottom: 24 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12,
                    marginBottom: 16
                  }}
                >
                  <div>
                    <span className="eyebrow-badge">3. UPCOMING EXCHANGES</span>
                    <h3 className="studio-card-title" style={{ marginTop: 4, marginBottom: 4 }}>
                      Accepted &amp; Scheduled Skill Exchanges ({acceptedReqsCount})
                    </h3>
                    <p className="peer-submeta">
                      Shows accepted exchanges, partner names, skills being exchanged, and proposed or agreed session dates, formats, and meeting details.
                    </p>
                  </div>
                </div>

                {requests.filter((r) => r.status === 'accepted').length === 0 ? (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '28px 20px',
                      backgroundColor: '#F8FAFC',
                      border: '1px dashed #CBD5E1',
                      borderRadius: 12
                    }}
                  >
                    <h4 style={{ marginTop: 0, marginBottom: 6 }}>
                      No upcoming accepted exchanges yet
                    </h4>
                    <p className="peer-submeta" style={{ maxWidth: 480, margin: '0 auto 14px' }}>
                      Accept an incoming request above or browse the directory to propose a new skill-exchange session with a compatible partner.
                    </p>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => setActiveTab('discover')}
                    >
                      Discover Skill Partners
                    </button>
                  </div>
                ) : (
                  <div className="requests-list">
                    {requests
                      .filter((r) => r.status === 'accepted')
                      .map((r) => {
                        const isIncoming = r.direction === 'incoming';
                        const partnerName = isIncoming ? r.requester_name : r.recipient_name;
                        const partnerInitials = isIncoming
                          ? r.requester_initials
                          : r.recipient_initials;
                        const partnerBg = isIncoming ? r.requester_bg : r.recipient_bg;
                        const youTeach = isIncoming
                          ? r.wanted_skill_name
                          : r.offered_skill_name;
                        const partnerTeaches = isIncoming
                          ? r.offered_skill_name
                          : r.wanted_skill_name;
                        return (
                          <article key={r.id} className="request-card">
                            <div className="request-top-bar">
                              <div className="peer-identity">
                                <div
                                  className="avatar-md"
                                  style={{ backgroundColor: partnerBg || '#0F766E' }}
                                >
                                  {partnerInitials}
                                </div>
                                <div>
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 8,
                                      flexWrap: 'wrap'
                                    }}
                                  >
                                    <h3 className="peer-name">{partnerName}</h3>
                                    <span className="status-pill accepted">accepted</span>
                                    <span
                                      className="avail-chip"
                                      style={{
                                        backgroundColor:
                                          r.schedule_status === 'agreed'
                                            ? '#ECFDF5'
                                            : '#FEF3C7',
                                        color:
                                          r.schedule_status === 'agreed'
                                            ? '#065F46'
                                            : '#92400E',
                                        fontWeight: 600
                                      }}
                                    >
                                      {r.schedule_status === 'agreed'
                                        ? '✓ Agreed Session Schedule'
                                        : 'Proposed Session Schedule'}
                                    </span>
                                  </div>
                                  <p className="peer-role">
                                    <strong>You Teach:</strong> {youTeach} ⇄{' '}
                                    <strong>{partnerName.split(' ')[0]} Teaches:</strong>{' '}
                                    {partnerTeaches}
                                  </p>
                                </div>
                              </div>
                              <div className="ai-score-badge">
                                <span className="ai-score-num">{r.session_mode || 'Online'}</span>
                                <span className="ai-score-tier">
                                  {r.session_datetime || r.proposed_slot}
                                </span>
                              </div>
                            </div>

                            <div
                              style={{
                                backgroundColor: '#F8FAFC',
                                border: '1px solid #E2E8F0',
                                borderRadius: 10,
                                padding: '10px 14px',
                                marginBottom: 10,
                                fontSize: '0.86rem'
                              }}
                            >
                              <div>
                                <strong>Session Date &amp; Time:</strong>{' '}
                                {r.session_datetime || r.proposed_slot} •{' '}
                                <strong>Format:</strong> {r.session_mode || 'Online'} (
                                {r.duration_mins} mins)
                              </div>
                              <div>
                                <strong>
                                  {r.session_mode === 'In person'
                                    ? 'Meeting Location:'
                                    : 'Meeting Link:'}
                                </strong>{' '}
                                {r.meeting_link_or_location || 'Not set'}
                              </div>
                              {r.session_notes && (
                                <div>
                                  <strong>Session Notes:</strong> {r.session_notes}
                                </div>
                              )}
                            </div>

                            <div className="request-actions-bar">
                              <span className="peer-submeta">
                                Scheduled with {partnerName}
                              </span>
                              <div className="req-btn-group">
                                <button
                                  type="button"
                                  className="btn btn-outline"
                                  onClick={() => {
                                    setActiveTab('requests');
                                    openScheduleEditor(r);
                                  }}
                                >
                                  Review / Edit Session Details
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  onClick={() => openRecordExchangeFromRequest(r)}
                                >
                                  ✓ Mark Completed &amp; Rate (1–5 ★)
                                </button>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                  </div>
                )}
              </div>

              <div className="studio-card" style={{ marginBottom: 24 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12,
                    marginBottom: 16
                  }}
                >
                  <div>
                    <h3 className="studio-card-title" style={{ marginBottom: 4 }}>
                      Recent Activity &amp; Session Details
                    </h3>
                    <p className="peer-submeta">
                      Live database records of your exchange statuses, session scheduling (Online or In person), and peer reviews.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => setActiveTab('requests')}
                    >
                      Manage All Requests ({requests.length})
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => setActiveTab('discover')}
                    >
                      Discover New Skill Partners
                    </button>
                  </div>
                </div>

                {(dashboard?.recentActivity || []).length === 0 ? (
                  <p className="peer-bio">
                    No exchange activity recorded yet. Use <strong>Discover New Skill Partners</strong> to propose your first 50/50 skill swap!
                  </p>
                ) : (
                  <div className="requests-list">
                    {(dashboard?.recentActivity || []).map((item) => {
                      const reqObj = item.requestId
                        ? requests.find((r) => r.id === item.requestId)
                        : null;
                      return (
                        <article key={item.id} className="request-card">
                          <div className="request-top-bar">
                            <div className="peer-identity">
                              <div
                                className="avatar-md"
                                style={{ backgroundColor: item.partnerBg || '#0F766E' }}
                              >
                                {item.partnerInitials}
                              </div>
                              <div>
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    flexWrap: 'wrap'
                                  }}
                                >
                                  <h3 className="peer-name">{item.partnerName}</h3>
                                  <span className={`status-pill ${item.status}`}>
                                    {item.status}
                                  </span>
                                  <span
                                    className="avail-chip"
                                    style={{
                                      backgroundColor:
                                        item.scheduleStatus === 'agreed' ? '#ECFDF5' : '#FEF3C7',
                                      color:
                                        item.scheduleStatus === 'agreed' ? '#065F46' : '#92400E',
                                      fontWeight: 600
                                    }}
                                  >
                                    {item.scheduleStatus === 'agreed'
                                      ? '✓ Schedule Agreed'
                                      : 'Schedule Proposed'}
                                  </span>
                                </div>
                                <p className="peer-role">
                                  <strong>You Teach:</strong> {item.youTeach} ⇄{' '}
                                  <strong>{item.partnerName.split(' ')[0]} Teaches:</strong>{' '}
                                  {item.partnerTeaches}
                                </p>
                              </div>
                            </div>

                            <div className="ai-score-badge">
                              <span className="ai-score-num">{item.sessionMode || 'Online'}</span>
                              <span className="ai-score-tier">{item.sessionDatetime}</span>
                            </div>
                          </div>

                          <div
                            style={{
                              backgroundColor: '#F8FAFC',
                              border: '1px solid #E2E8F0',
                              borderRadius: 10,
                              padding: '10px 14px',
                              marginBottom: 10,
                              fontSize: '0.86rem'
                            }}
                          >
                            <div>
                              <strong>Session Date &amp; Time:</strong> {item.sessionDatetime} •{' '}
                              <strong>Mode:</strong> {item.sessionMode || 'Online'}
                            </div>
                            {item.meetingLinkOrLocation && (
                              <div>
                                <strong>
                                  {item.sessionMode === 'In person' ? 'Location:' : 'Meeting Link:'}
                                </strong>{' '}
                                {item.meetingLinkOrLocation}
                              </div>
                            )}
                            {item.sessionNotes && (
                              <div>
                                <strong>Session Notes:</strong> {item.sessionNotes}
                              </div>
                            )}
                          </div>

                          {item.ratingGiven && (
                            <div
                              style={{
                                backgroundColor: '#FFFBEB',
                                border: '1px solid #FDE68A',
                                borderRadius: 10,
                                padding: '10px 14px',
                                marginBottom: 10
                              }}
                            >
                              <div style={{ color: '#D97706', fontWeight: 700 }}>
                                {'★'.repeat(Number(item.ratingGiven))}
                                {'☆'.repeat(Math.max(0, 5 - Number(item.ratingGiven)))} (
                                {item.ratingGiven}/5 Stars)
                              </div>
                              {item.reviewComment && (
                                <p className="peer-bio" style={{ margin: '4px 0 0' }}>
                                  &ldquo;{item.reviewComment}&rdquo;
                                </p>
                              )}
                            </div>
                          )}

                          {reqObj && (
                            <div className="request-actions-bar">
                              <span className="peer-submeta">Updated {item.timestamp}</span>
                              <div className="req-btn-group">
                                <button
                                  type="button"
                                  className="btn btn-outline"
                                  onClick={() => {
                                    setActiveTab('requests');
                                    openScheduleEditor(reqObj);
                                  }}
                                >
                                  Review / Edit Session Schedule
                                </button>
                                {reqObj.status === 'accepted' && (
                                  <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={() => openRecordExchangeFromRequest(reqObj)}
                                  >
                                    ✓ Complete &amp; Rate Exchange
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 1: DISCOVER & AI MATCH */}
          {activeTab === 'discover' && (
            <div>
              <div className="concierge-hero">
                <span className="eyebrow-badge">✦ AI RECIPROCAL MATCHMAKING CONCIERGE</span>
                <h1 className="display-title">Trade skills directly with compatible peers.</h1>
                <p className="hero-subtitle">
                  Traditional courses are expensive and solo learning is isolating. SkillSwap connects you with peers for tuition-free, 50/50 reciprocal learning sessions—teach what comes naturally to you, and learn what you need next.
                </p>

                {/* 3-Step How SkillSwap Works Overview */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: 10,
                    marginBottom: 16,
                    textAlign: 'left'
                  }}
                >
                  <div
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.75)',
                      border: '1px solid #CBD5E1',
                      borderRadius: 12,
                      padding: '10px 14px',
                      fontSize: '0.82rem'
                    }}
                  >
                    <strong style={{ color: '#0F766E' }}>1. Publish Your Skills</strong>
                    <div style={{ color: '#475569', marginTop: 2 }}>
                      List the skills you can teach (Offered) and the skills you want to learn (Wanted).
                    </div>
                  </div>
                  <div
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.75)',
                      border: '1px solid #CBD5E1',
                      borderRadius: 12,
                      padding: '10px 14px',
                      fontSize: '0.82rem'
                    }}
                  >
                    <strong style={{ color: '#0F766E' }}>2. Discover &amp; Match</strong>
                    <div style={{ color: '#475569', marginTop: 2 }}>
                      Explore compatible members ranked by complementary skills, proficiency, and format.
                    </div>
                  </div>
                  <div
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.75)',
                      border: '1px solid #CBD5E1',
                      borderRadius: 12,
                      padding: '10px 14px',
                      fontSize: '0.82rem'
                    }}
                  >
                    <strong style={{ color: '#0F766E' }}>3. Exchange &amp; Review</strong>
                    <div style={{ color: '#475569', marginTop: 2 }}>
                      Schedule a 50/50 Online or In-person session, complete the swap, and leave a verified review.
                    </div>
                  </div>
                </div>

                <form className="ai-search-box" onSubmit={handleAiSearchSubmit}>
                  <div className="ai-input-wrapper">
                    <span className="ai-sparkle-icon" aria-hidden="true">
                      ✦
                    </span>
                    <input
                      type="text"
                      className="ai-prompt-input"
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      placeholder="e.g., I can teach Excel pivot tables and want to learn graphic design in return..."
                    />
                    {activeSearchQuery && (
                      <button
                        type="button"
                        className="clear-search-btn"
                        onClick={() => applyPresetPrompt('')}
                        title="Clear search"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <button type="submit" className="btn btn-primary">
                    Ask AI Matchmaker
                  </button>
                </form>

                <div className="preset-prompts-row">
                  <span className="preset-label">Try scenarios:</span>
                  <button
                    type="button"
                    className="preset-chip"
                    onClick={() =>
                      applyPresetPrompt('I can teach Excel and want to learn graphic design in return')
                    }
                  >
                    Teach Excel ⇄ Learn Graphic Design
                  </button>
                  <button
                    type="button"
                    className="preset-chip"
                    onClick={() =>
                      applyPresetPrompt(
                        'Offer conversational English practice in exchange for beginner Python lessons'
                      )
                    }
                  >
                    Offer Conversational English ⇄ Beginner Python
                  </button>
                  <button
                    type="button"
                    className="preset-chip"
                    onClick={() =>
                      applyPresetPrompt(
                        'Teach Excel financial modeling and cohort sheets in exchange for Figma UI design'
                      )
                    }
                  >
                    Excel Cohort Modeling ⇄ Figma UI Design
                  </button>
                  <button
                    type="button"
                    className="preset-chip"
                    onClick={() => applyPresetPrompt('')}
                  >
                    Show All Compatible Peers
                  </button>
                </div>

                {queryIntent && activeSearchQuery && (
                  <div className="ai-intent-banner">
                    <div className="ai-intent-title">
                      <span className="ai-badge-pill">AI SEMANTIC ANALYSIS</span>
                      <span>{queryIntent.summaryExplanation?.replace(/\*\*/g, '')}</span>
                    </div>
                    <div className="ai-extracted-pills">
                      {(queryIntent.extractedOffers || []).map((o, i) => (
                        <span key={`o-${i}`} className="skill-pill-sm offer">
                          Detected Offer: {o.canonical}
                        </span>
                      ))}
                      {(queryIntent.extractedWants || []).map((w, i) => (
                        <span key={`w-${i}`} className="skill-pill-sm want">
                          Detected Learning Goal: {w.canonical}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="discovery-toolbar">
                <div className="category-pills" role="tablist" aria-label="Skill category filter">
                  <button
                    className={`cat-pill ${activeCategory === 'all' ? 'active' : ''}`}
                    onClick={() => setActiveCategory('all')}
                  >
                    All Categories
                  </button>
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      className={`cat-pill ${activeCategory === cat ? 'active' : ''}`}
                      onClick={() => setActiveCategory(cat)}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <div className="results-counter">
                  Showing <strong>{candidates.length}</strong> of <strong>{totalDirectoryCount}</strong> registered member{candidates.length === 1 ? '' : 's'} from database
                </div>
              </div>

              <div
                className="studio-card"
                style={{
                  marginBottom: 18,
                  padding: '14px 18px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <label
                      htmlFor="filter-proficiency"
                      className="peer-submeta"
                      style={{ fontWeight: 600 }}
                    >
                      Proficiency:
                    </label>
                    <select
                      id="filter-proficiency"
                      aria-label="Filter by proficiency"
                      className="persona-select"
                      value={activeProficiency}
                      onChange={(e) => setActiveProficiency(e.target.value)}
                    >
                      <option value="all">All Proficiencies</option>
                      <option value="Beginner">Beginner</option>
                      <option value="Intermediate">Intermediate</option>
                      <option value="Advanced">Advanced</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <label
                      htmlFor="filter-learning-pref"
                      className="peer-submeta"
                      style={{ fontWeight: 600 }}
                    >
                      Learning preference:
                    </label>
                    <select
                      id="filter-learning-pref"
                      aria-label="Filter by learning preference"
                      className="persona-select"
                      value={activeLearningPreference}
                      onChange={(e) => setActiveLearningPreference(e.target.value)}
                    >
                      <option value="all">All Preferences</option>
                      <option value="Online">Online</option>
                      <option value="In person">In person</option>
                      <option value="Online or in person">Online or in person</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <label
                      htmlFor="filter-match-mode"
                      className="peer-submeta"
                      style={{ fontWeight: 600 }}
                    >
                      Matching workflow:
                    </label>
                    <select
                      id="filter-match-mode"
                      aria-label="Filter by matching workflow"
                      className="persona-select"
                      value={activeMatchMode}
                      onChange={(e) => setActiveMatchMode(e.target.value)}
                    >
                      <option value="all">All Directory Members</option>
                      <option value="teaching_goals">
                        Matches My Learning Goals (Teaches What I Want)
                      </option>
                      <option value="reciprocal">
                        2-Way Reciprocal Matches (Mutual Swap)
                      </option>
                    </select>
                  </div>
                </div>

                {hasActiveFilters && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={exploreEveryone}
                  >
                    Explore everyone
                  </button>
                )}
              </div>

              {directoryError && (
                <div
                  role="alert"
                  className="studio-card"
                  style={{
                    marginBottom: 16,
                    borderColor: '#DC2626',
                    backgroundColor: '#FEF2F2',
                    color: '#991B1B',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12
                  }}
                >
                  <span>
                    <strong>Directory filtering error:</strong> {directoryError}
                  </span>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={loadBootstrap}
                  >
                    Retry
                  </button>
                </div>
              )}

              {candidates.length === 0 ? (
                <div
                  className="studio-card"
                  style={{
                    textAlign: 'center',
                    padding: '44px 24px',
                    marginBottom: 24
                  }}
                >
                  <span className="eyebrow-badge">NO MATCHING MEMBERS FOUND</span>
                  <h2 style={{ marginTop: 10, marginBottom: 8 }}>
                    No members match your selected directory filters
                  </h2>
                  <p className="peer-bio" style={{ maxWidth: 540, margin: '0 auto 18px' }}>
                    Try broadening your search query, switching the category or proficiency level
                    (Beginner, Intermediate, or Advanced), or changing the learning preference
                    (Online, In person, or Online or in person).
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={exploreEveryone}
                  >
                    Explore everyone
                  </button>
                </div>
              ) : (
                <div className="matches-grid">
                  {candidates.map((c) => {
                    const m = c.aiMatch;
                    const firstName = c.name.split(' ')[0];
                    const isExpanded = !!expandedBlueprints[c.id];
                    return (
                      <article key={c.id} className="match-card">
                        <div className="match-card-top">
                          <div className="peer-identity">
                            <div
                              className="avatar-md"
                              style={{ backgroundColor: c.avatar_bg || '#0F766E' }}
                            >
                              {c.avatar_initials}
                            </div>
                            <div>
                              <h3 className="peer-name">{c.name}</h3>
                              <p className="peer-role">{c.role_title}</p>
                              <div className="peer-submeta">
                                <span>{c.location}</span>
                                <span>•</span>
                                <span>
                                  Format:{' '}
                                  <strong>
                                    {c.preferred_format === 'Either'
                                      ? 'Online or in person'
                                      : c.preferred_format || 'Online'}
                                  </strong>
                                </span>
                                <span>•</span>
                                <span className="mono-stat">
                                  ★ {Number(c.rating || 5).toFixed(2)} ({c.completed_swaps_count} swaps)
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="ai-score-badge">
                            <span className="ai-score-num">✦ {m.score}% Match</span>
                            <span className="ai-score-tier">{m.matchTier}</span>
                          </div>
                        </div>

                        <p className="peer-bio">{c.bio}</p>

                        {c.interests && c.interests.length > 0 && (
                          <div className="availability-chips">
                            <span className="peer-submeta" style={{ fontWeight: 600 }}>Interests:</span>
                            {c.interests.map((topic, idx) => (
                              <span key={idx} className="avail-chip">
                                {topic}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="reciprocal-connector">
                          <div className="swap-column you-teach">
                            <span className="swap-dir-label">You Teach {firstName}</span>
                            <span className="swap-skill-title">{m.youTeach.skillName}</span>
                            <span className="swap-skill-meta">
                              Matches their goal: {m.youTeach.targetWantName}
                            </span>
                          </div>

                          <div className="swap-bridge-svg" aria-hidden="true">
                            <span>⇄</span>
                            <span className="mono-stat" style={{ fontSize: '0.65rem' }}>
                              50/50
                            </span>
                          </div>

                          <div className="swap-column they-teach">
                            <span className="swap-dir-label">{firstName} Teaches You</span>
                            <span className="swap-skill-title">{m.theyTeach.skillName}</span>
                            <span className="swap-skill-meta">
                              Matches your goal: {m.theyTeach.targetWantName} ({m.theyTeach.level})
                            </span>
                          </div>
                        </div>

                        <div className="peer-all-skills">
                          {(c.offers || []).map((s) => (
                            <span key={s.id} className="skill-pill-sm offer" title={s.description}>
                              Teaches: {s.skill_name} ({s.category} • {s.proficiency || s.level})
                            </span>
                          ))}
                          {(c.wants || []).map((s) => (
                            <span key={s.id} className="skill-pill-sm want" title={s.description}>
                              Wants to learn: {s.skill_name} ({s.category} • {s.proficiency || s.level})
                            </span>
                          ))}
                        </div>

                        <div className="ai-rationale-box">
                          <div className="ai-rationale-header">
                            <span className="ai-rationale-label">✦ Why AI Paired You</span>
                            <button
                              type="button"
                              className="toggle-blueprint-btn"
                              onClick={() =>
                                setExpandedBlueprints((prev) => ({
                                  ...prev,
                                  [c.id]: !prev[c.id]
                                }))
                              }
                            >
                              {isExpanded
                                ? 'Hide 50/50 Session Blueprint ▲'
                                : 'View AI 50/50 Session Blueprint ▼'}
                            </button>
                          </div>
                          <p className="ai-rationale-copy">{m.rationale}</p>
                          {isExpanded && (
                            <div className="blueprint-drawer">
                              {(m.suggestedAgenda || []).map((step, idx) => (
                                <div key={idx} className="blueprint-step">
                                  <span className="bp-time">{step.time}</span>
                                  <span className="bp-text">
                                    <strong>{step.phase}:</strong> {step.detail}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="match-card-footer">
                          <div className="shared-slot-indicator">
                            <span>
                              Shared: <strong>{(m.sharedAvailability || []).join(', ')}</strong>
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="btn btn-outline"
                              onClick={() => setSelectedMemberDetail(c)}
                            >
                              View Member Detail
                            </button>
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={() => openRequestModal(c)}
                            >
                              Request Skill Swap
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SWAP REQUESTS */}
          {activeTab === 'requests' && (
            <div>
              <div className="section-header-bar">
                <span className="eyebrow-badge">SESSION COORDINATION HUB</span>
                <h1 className="section-title">Manage Skill-Exchange Requests</h1>
                <p className="section-subtitle">
                  Review incoming swap proposals, manage your outgoing invitations, plan session scheduling (Online or In person), and record completed sessions with 1–5 star ratings.
                </p>
              </div>

              <div className="requests-filter-tabs" style={{ flexWrap: 'wrap' }}>
                <button
                  className={`req-filter-btn ${requestFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setRequestFilter('all')}
                >
                  All Requests ({requests.length})
                </button>
                <button
                  className={`req-filter-btn ${requestFilter === 'pending' ? 'active' : ''}`}
                  onClick={() => setRequestFilter('pending')}
                >
                  Pending ({requests.filter((r) => r.status === 'pending').length})
                </button>
                <button
                  className={`req-filter-btn ${requestFilter === 'accepted' ? 'active' : ''}`}
                  onClick={() => setRequestFilter('accepted')}
                >
                  Accepted ({requests.filter((r) => r.status === 'accepted').length})
                </button>
                <button
                  className={`req-filter-btn ${requestFilter === 'completed' ? 'active' : ''}`}
                  onClick={() => setRequestFilter('completed')}
                >
                  Completed ({requests.filter((r) => r.status === 'completed').length})
                </button>
                <button
                  className={`req-filter-btn ${requestFilter === 'declined' ? 'active' : ''}`}
                  onClick={() => setRequestFilter('declined')}
                >
                  Declined ({requests.filter((r) => r.status === 'declined').length})
                </button>
                <button
                  className={`req-filter-btn ${requestFilter === 'cancelled' ? 'active' : ''}`}
                  onClick={() => setRequestFilter('cancelled')}
                >
                  Cancelled ({requests.filter((r) => r.status === 'cancelled').length})
                </button>
                <button
                  className={`req-filter-btn ${requestFilter === 'incoming' ? 'active' : ''}`}
                  onClick={() => setRequestFilter('incoming')}
                >
                  Incoming ({requests.filter((r) => r.direction === 'incoming').length})
                </button>
                <button
                  className={`req-filter-btn ${requestFilter === 'outgoing' ? 'active' : ''}`}
                  onClick={() => setRequestFilter('outgoing')}
                >
                  Outgoing ({requests.filter((r) => r.direction === 'outgoing').length})
                </button>
              </div>

              <div className="requests-list">
                {filteredRequests.map((r) => {
                  const isIncoming = r.direction === 'incoming';
                  const partnerName = isIncoming ? r.requester_name : r.recipient_name;
                  const partnerRole = isIncoming ? r.requester_role : r.recipient_role;
                  const partnerInitials = isIncoming ? r.requester_initials : r.recipient_initials;
                  const partnerBg = isIncoming ? r.requester_bg : r.recipient_bg;
                  const youTeach = isIncoming ? r.wanted_skill_name : r.offered_skill_name;
                  const partnerTeaches = isIncoming ? r.offered_skill_name : r.wanted_skill_name;

                  return (
                    <article key={r.id} className="request-card">
                      <div className="request-top-bar">
                        <div className="peer-identity">
                          <div
                            className="avatar-md"
                            style={{ backgroundColor: partnerBg || '#0F766E' }}
                          >
                            {partnerInitials}
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <h3 className="peer-name">{partnerName}</h3>
                              <span className={`req-direction-tag ${r.direction}`}>
                                {isIncoming ? '↙ Incoming Proposal' : '↗ Outgoing Proposal'}
                              </span>
                              <span className={`status-pill ${r.status}`}>{r.status}</span>
                              <span
                                className="avail-chip"
                                style={{
                                  backgroundColor:
                                    r.schedule_status === 'agreed' ? '#ECFDF5' : '#FEF3C7',
                                  color: r.schedule_status === 'agreed' ? '#065F46' : '#92400E',
                                  fontWeight: 600
                                }}
                              >
                                {r.schedule_status === 'agreed'
                                  ? '✓ Session Details Agreed'
                                  : 'Session Details Proposed'}
                              </span>
                            </div>
                            <p className="peer-role">
                              {partnerRole} • Scheduled: <strong>{r.session_datetime || r.proposed_slot}</strong> ({r.duration_mins} mins)
                            </p>
                          </div>
                        </div>

                        <div className="ai-score-badge">
                          <span className="ai-score-num">✦ {r.ai_match_score}% Synergy</span>
                          <span className="ai-score-tier">{r.session_mode || 'Online'}</span>
                        </div>
                      </div>

                      <div className="reciprocal-connector">
                        <div className="swap-column you-teach">
                          <span className="swap-dir-label">You Teach</span>
                          <span className="swap-skill-title">{youTeach}</span>
                        </div>
                        <div className="swap-bridge-svg">⇄</div>
                        <div className="swap-column they-teach">
                          <span className="swap-dir-label">{partnerName.split(' ')[0]} Teaches</span>
                          <span className="swap-skill-title">{partnerTeaches}</span>
                        </div>
                      </div>

                      <p className="peer-bio">
                        <strong>Session Goal:</strong> {r.learning_goal}
                      </p>
                      <p className="testimonial-quote">&ldquo;{r.message}&rdquo;</p>

                      {/* SESSION SCHEDULING PANEL */}
                      <div
                        className="studio-card"
                        style={{
                          marginTop: 12,
                          marginBottom: 12,
                          padding: '14px 16px',
                          backgroundColor: '#F8FAFC',
                          borderColor: '#CBD5E1'
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: 10,
                            marginBottom: 8
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: '0.9rem' }}>
                              📅 Session Scheduling &amp; Logistics
                            </strong>
                            <span
                              className="avail-chip"
                              style={{
                                backgroundColor:
                                  r.schedule_status === 'agreed' ? '#DCFCE7' : '#FEF3C7',
                                color: r.schedule_status === 'agreed' ? '#166534' : '#92400E',
                                fontWeight: 600
                              }}
                            >
                              {r.schedule_status === 'agreed'
                                ? '✓ Agreed by Both Members'
                                : 'Proposed'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {r.schedule_status !== 'agreed' && (
                              <button
                                type="button"
                                className="btn btn-outline"
                                style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                                onClick={() => handleAgreeSessionSchedule(r)}
                              >
                                ✓ Mark as Agreed
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn-outline"
                              style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                              onClick={() =>
                                schedulingRequestId === r.id
                                  ? setSchedulingRequestId(null)
                                  : openScheduleEditor(r)
                              }
                            >
                              {schedulingRequestId === r.id
                                ? 'Close Editor'
                                : 'Review / Edit Session Details'}
                            </button>
                          </div>
                        </div>

                        {schedulingRequestId === r.id ? (
                          <form
                            onSubmit={(e) => handleSaveSessionSchedule(e, r.id)}
                            style={{ marginTop: 10 }}
                          >
                            <div className="form-row-3">
                              <div className="form-group">
                                <label>Proposed Session Date &amp; Time</label>
                                <input
                                  type="text"
                                  value={scheduleForm.session_datetime}
                                  onChange={(e) =>
                                    setScheduleForm({
                                      ...scheduleForm,
                                      session_datetime: e.target.value
                                    })
                                  }
                                  placeholder="e.g., Thursday, Nov 6 • 6:30 PM"
                                  required
                                />
                              </div>
                              <div className="form-group">
                                <label>Session Format (Online or In person)</label>
                                <select
                                  value={scheduleForm.session_mode}
                                  onChange={(e) =>
                                    setScheduleForm({
                                      ...scheduleForm,
                                      session_mode: e.target.value
                                    })
                                  }
                                >
                                  <option value="Online">Online</option>
                                  <option value="In person">In person</option>
                                </select>
                              </div>
                              <div className="form-group">
                                <label>Agreement Status</label>
                                <select
                                  value={scheduleForm.schedule_status}
                                  onChange={(e) =>
                                    setScheduleForm({
                                      ...scheduleForm,
                                      schedule_status: e.target.value
                                    })
                                  }
                                >
                                  <option value="proposed">Proposed</option>
                                  <option value="agreed">Agreed by both members</option>
                                </select>
                              </div>
                            </div>
                            <div className="form-row-2">
                              <div className="form-group">
                                <label>
                                  {scheduleForm.session_mode === 'In person'
                                    ? 'Meeting Location / Address'
                                    : 'Meeting Link (Zoom / Meet / Studio URL)'}
                                </label>
                                <input
                                  type="text"
                                  value={scheduleForm.meeting_link_or_location}
                                  onChange={(e) =>
                                    setScheduleForm({
                                      ...scheduleForm,
                                      meeting_link_or_location: e.target.value
                                    })
                                  }
                                  placeholder={
                                    scheduleForm.session_mode === 'In person'
                                      ? 'e.g., Central Library Study Room B'
                                      : 'https://meet.skillswap.io/swap-room'
                                  }
                                />
                              </div>
                              <div className="form-group">
                                <label>Session Notes &amp; Prep Materials</label>
                                <input
                                  type="text"
                                  value={scheduleForm.session_notes}
                                  onChange={(e) =>
                                    setScheduleForm({
                                      ...scheduleForm,
                                      session_notes: e.target.value
                                    })
                                  }
                                  placeholder="Files, links, or topics to prepare..."
                                />
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                className="btn btn-outline"
                                onClick={() => setSchedulingRequestId(null)}
                              >
                                Cancel
                              </button>
                              <button type="submit" className="btn btn-primary">
                                Save Session Schedule
                              </button>
                            </div>
                          </form>
                        ) : (
                          <div style={{ fontSize: '0.86rem', color: '#334155', lineHeight: 1.6 }}>
                            <div>
                              <strong>Date &amp; Time:</strong>{' '}
                              {r.session_datetime || r.proposed_slot} • <strong>Mode:</strong>{' '}
                              {r.session_mode || 'Online'}
                            </div>
                            <div>
                              <strong>
                                {r.session_mode === 'In person'
                                  ? 'Meeting Location:'
                                  : 'Meeting Link:'}
                              </strong>{' '}
                              {r.meeting_link_or_location || 'Not specified yet'}
                            </div>
                            {r.session_notes && (
                              <div>
                                <strong>Session Notes:</strong> {r.session_notes}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* RECORDED RATING & REVIEW (IF COMPLETED) */}
                      {r.status === 'completed' && r.rating_given && (
                        <div
                          style={{
                            backgroundColor: '#FFFBEB',
                            border: '1px solid #FDE68A',
                            borderRadius: 10,
                            padding: '12px 16px',
                            marginBottom: 12
                          }}
                        >
                          <div style={{ color: '#D97706', fontWeight: 700 }}>
                            ★ Recorded Exchange Feedback:{' '}
                            {'★'.repeat(Number(r.rating_given))}
                            {'☆'.repeat(Math.max(0, 5 - Number(r.rating_given)))} (
                            {r.rating_given}/5 Stars)
                          </div>
                          {r.review_comment && (
                            <p className="peer-bio" style={{ margin: '4px 0 0' }}>
                              &ldquo;{r.review_comment}&rdquo;
                            </p>
                          )}
                        </div>
                      )}

                      {r.ai_session_agenda && r.ai_session_agenda.length > 0 && (
                        <div className="ai-rationale-box">
                          <div className="ai-rationale-header">
                            <span className="ai-rationale-label">✦ Agreed 50/50 AI Session Blueprint</span>
                          </div>
                          <div className="blueprint-drawer">
                            {r.ai_session_agenda.map((st, idx) => (
                              <div key={idx} className="blueprint-step">
                                <span className="bp-time">{st.time}</span>
                                <span className="bp-text">
                                  <strong>{st.phase}:</strong> {st.detail}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="request-actions-bar">
                        <span className="peer-submeta">Created {r.created_at}</span>
                        <div className="req-btn-group">
                          {r.status === 'pending' && isIncoming && (
                            <>
                              <button
                                className="btn btn-success"
                                onClick={() => handleRequestAction(r.id, 'accepted')}
                              >
                                ✓ Accept Swap Session
                              </button>
                              <button
                                className="btn btn-danger-outline"
                                onClick={() => handleRequestAction(r.id, 'declined')}
                              >
                                Decline
                              </button>
                            </>
                          )}
                          {r.status === 'pending' && !isIncoming && (
                            <button
                              className="btn btn-danger-outline"
                              onClick={() => handleRequestAction(r.id, 'cancelled')}
                            >
                              Cancel Request
                            </button>
                          )}
                          {r.status === 'accepted' && (
                            <button
                              className="btn btn-primary"
                              onClick={() => openRecordExchangeFromRequest(r)}
                            >
                              ✓ Mark Completed &amp; Rate (1–5 ★)
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: COMPLETED EXCHANGES */}
          {activeTab === 'exchanges' && (
            <div>
              <div className="section-header-bar split">
                <div>
                  <span className="eyebrow-badge">VERIFIED PEER LEARNING PORTFOLIO</span>
                  <h1 className="section-title">Completed Skill Exchanges</h1>
                  <p className="section-subtitle">
                    A permanent ledger of reciprocal sessions, skills taught and learned, takeaways, and peer endorsements.
                  </p>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => openRecordExchangeFromRequest(null)}
                >
                  + Record Completed Exchange
                </button>
              </div>

              <div className="exchanges-summary-strip">
                <div className="ledger-stat-card">
                  <strong>{completedExchanges.length}</strong>
                  <span>Verified Reciprocal Sessions</span>
                </div>
                <div className="ledger-stat-card">
                  <strong>{totalHoursLogged} hrs</strong>
                  <span>Peer Learning Hours Logged</span>
                </div>
                <div className="ledger-stat-card">
                  <strong>
                    {completedExchanges.filter((c) => c.involves_viewer).length}
                  </strong>
                  <span>Your Completed Skill Swaps</span>
                </div>
                <div className="ledger-stat-card">
                  <strong>$0 Tuition</strong>
                  <span>100% Reciprocal Knowledge Exchange</span>
                </div>
              </div>

              <div className="exchanges-ledger-list">
                {completedExchanges.map((c) => (
                  <article key={c.id} className="exchange-certificate-card">
                    <div className="cert-header">
                      <div className="peer-identity">
                        <div
                          className="avatar-md"
                          style={{ backgroundColor: c.partner_a_bg || '#0F766E' }}
                        >
                          {c.partner_a_initials}
                        </div>
                        <span style={{ fontWeight: 700, color: 'var(--accent-teal)' }}>⇄</span>
                        <div
                          className="avatar-md"
                          style={{ backgroundColor: c.partner_b_bg || '#C2410C' }}
                        >
                          {c.partner_b_initials}
                        </div>
                        <div>
                          <h3 className="peer-name">
                            {c.partner_a_name} &amp; {c.partner_b_name}
                          </h3>
                          <p className="peer-submeta">
                            Completed {c.completed_at} • {c.duration_mins} Minutes •{' '}
                            <span style={{ color: 'var(--status-amber)' }}>
                              {'★'.repeat(Number(c.rating_given) || 5)}
                            </span>
                          </p>
                        </div>
                      </div>

                      <span className="verified-stamp">✓ {c.verified_badge}</span>
                    </div>

                    <div className="reciprocal-connector">
                      <div className="swap-column you-teach">
                        <span className="swap-dir-label">
                          {c.partner_a_name.split(' ')[0]} Taught
                        </span>
                        <span className="swap-skill-title">{c.skill_a_taught}</span>
                      </div>
                      <div className="swap-bridge-svg">⇄</div>
                      <div className="swap-column they-teach">
                        <span className="swap-dir-label">
                          {c.partner_b_name.split(' ')[0]} Taught
                        </span>
                        <span className="swap-skill-title">{c.skill_b_taught}</span>
                      </div>
                    </div>

                    <p className="peer-bio">{c.summary_notes}</p>

                    {c.takeaways && c.takeaways.length > 0 && (
                      <ul className="takeaways-list">
                        {c.takeaways.map((t, idx) => (
                          <li key={idx}>{t}</li>
                        ))}
                      </ul>
                    )}

                    <blockquote className="testimonial-quote">
                      &ldquo;{c.testimonial}&rdquo;
                    </blockquote>
                  </article>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: MY SKILL PROFILE (Create, View, Edit, Delete Skills) */}
          {activeTab === 'profile' && (
            <div>
              <div className="section-header-bar split">
                <div>
                  <span className="eyebrow-badge">SKILL PASSPORT STUDIO</span>
                  <h1 className="section-title">Manage Your Skill Profile</h1>
                  <p className="section-subtitle">
                    Create, view, edit, and delete your teaching skills and learning goals. Our AI recalculates your compatibility scores in real time.
                  </p>
                </div>
                <button
                  className="btn btn-outline"
                  onClick={() => {
                    setAuthMode('register');
                    setAuthModalOpen(true);
                  }}
                >
                  + Register New Account
                </button>
              </div>

              <div className="profile-studio-grid">
                <form className="studio-card" onSubmit={handleSaveProfileDetails}>
                  <h3 className="studio-card-title">1. Personal Identity, Interests &amp; Learning Format</h3>
                  <div className="form-row-3">
                    <div className="form-group">
                      <label>Display Name (Public)</label>
                      <input
                        type="text"
                        value={profForm.name}
                        onChange={(e) => setProfForm({ ...profForm, name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Headline / Role (Public)</label>
                      <input
                        type="text"
                        value={profForm.role_title}
                        onChange={(e) => setProfForm({ ...profForm, role_title: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Email Address (🔒 Private by Default)</label>
                      <input
                        type="email"
                        value={viewer?.email || 'private@skillswap.io'}
                        disabled
                        title="Your email address is private by default and never exposed on public profiles."
                      />
                    </div>
                  </div>
                  <div className="form-row-2">
                    <div className="form-group">
                      <label>Short Bio (Public)</label>
                      <textarea
                        rows="2"
                        value={profForm.bio}
                        onChange={(e) => setProfForm({ ...profForm, bio: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Interests — Topics &amp; Areas You Enjoy (Public, comma-separated)</label>
                      <textarea
                        rows="2"
                        value={profForm.interests_text}
                        onChange={(e) =>
                          setProfForm({ ...profForm, interests_text: e.target.value })
                        }
                        placeholder="e.g., Financial Modeling, Editorial Design, Data Visualization"
                      />
                    </div>
                  </div>
                  <div className="form-row-3">
                    <div className="form-group">
                      <label>Preferred Learning Format (Public)</label>
                      <select
                        value={profForm.preferred_format}
                        onChange={(e) =>
                          setProfForm({ ...profForm, preferred_format: e.target.value })
                        }
                      >
                        <option value="Online">Online</option>
                        <option value="In person">In person</option>
                        <option value="Either">Either (Online or In person)</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Location &amp; Timezone (Public)</label>
                      <input
                        type="text"
                        value={profForm.location}
                        onChange={(e) => setProfForm({ ...profForm, location: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Default Session Length</label>
                      <select
                        value={profForm.session_length_mins}
                        onChange={(e) =>
                          setProfForm({
                            ...profForm,
                            session_length_mins: Number(e.target.value)
                          })
                        }
                      >
                        <option value={45}>45 Minutes (22m / 22m)</option>
                        <option value={60}>60 Minutes (30m / 30m)</option>
                        <option value={90}>90 Minutes (45m / 45m)</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Availability — Preferred Days or Times for Learning (Public)</label>
                    <div className="checkbox-chips">
                      {AVAILABILITY_OPTIONS.map((win) => (
                        <label key={win} className="check-chip">
                          <input
                            type="checkbox"
                            checked={profForm.availability.includes(win)}
                            onChange={() => toggleAvailabilityWindow(win)}
                          />
                          <span>{win}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <button type="submit" className="btn btn-primary">
                    Save Profile Details &amp; Recalculate AI Matches
                  </button>
                </form>

                {/* OPTION 3: AI PROFILE AND SKILL DESCRIPTION HELPER */}
                <section
                  className="studio-card"
                  aria-label="AI Profile and Skill Description Helper"
                  style={{
                    border: '1px solid #99F6E4',
                    background: 'linear-gradient(180deg, #F0FDFA 0%, #FFFFFF 100%)',
                    marginBottom: 20
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      flexWrap: 'wrap',
                      gap: 12,
                      marginBottom: 12
                    }}
                  >
                    <div>
                      <span className="eyebrow-badge" style={{ marginBottom: 6 }}>
                        ✦ AI PROFILE &amp; SKILL DESCRIPTION HELPER
                      </span>
                      <h3 className="studio-card-title" style={{ margin: '4px 0' }}>
                        Turn Rough Notes into a Polished Bio or Skill Description
                      </h3>
                      <p className="peer-submeta" style={{ margin: 0 }}>
                        Generate a clear profile introduction or a structured explanation of a skill you teach, review and edit the suggestion, and confirm before applying.
                      </p>
                    </div>

                    {/* Task Selector Tabs */}
                    <div
                      role="tablist"
                      aria-label="Select AI Helper Task"
                      style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={helperTask === 'bio'}
                        className={helperTask === 'bio' ? 'btn btn-primary' : 'btn btn-outline'}
                        onClick={() => {
                          setHelperTask('bio');
                          setHelperError(null);
                          setHelperConfirmingBioReplace(false);
                        }}
                      >
                        ✦ AI Profile Bio Helper
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={helperTask === 'skill_description'}
                        className={
                          helperTask === 'skill_description' ? 'btn btn-primary' : 'btn btn-outline'
                        }
                        onClick={() => {
                          setHelperTask('skill_description');
                          setHelperError(null);
                          setHelperConfirmingBioReplace(false);
                          if (!helperSkillName && viewer?.offers?.[0]?.skill_name) {
                            setHelperSkillName(viewer.offers[0].skill_name);
                            setHelperTargetSkillId(String(viewer.offers[0].id));
                          }
                        }}
                      >
                        ✦ AI Skill Description Helper
                      </button>
                    </div>
                  </div>

                  {/* Privacy Notice & Data Minimization Safeguard */}
                  <div
                    role="note"
                    style={{
                      backgroundColor: '#FFFBEB',
                      border: '1px solid #FDE68A',
                      borderRadius: 10,
                      padding: '10px 14px',
                      marginBottom: 14,
                      fontSize: '0.82rem',
                      color: '#92400E',
                      lineHeight: 1.45
                    }}
                  >
                    <strong>🔒 Privacy Notice:</strong> Please do not enter sensitive personal information (such as passwords, phone numbers, home addresses, or financial details). To protect your privacy,{' '}
                    <strong>
                      only the selected task, your rough notes
                      {helperTask === 'skill_description' ? ', and the skill name' : ''}
                    </strong>{' '}
                    are sent to <code>POST /api/ai/profile-helper</code>.
                  </div>

                  <form onSubmit={handleGenerateAiProfileHelper}>
                    {helperTask === 'skill_description' && (
                      <div className="form-row-2" style={{ marginBottom: 12 }}>
                        <div className="form-group">
                          <label htmlFor="ai-helper-skill-name">
                            Skill Name You Teach (2–80 characters)
                          </label>
                          <input
                            id="ai-helper-skill-name"
                            type="text"
                            minLength={2}
                            maxLength={80}
                            value={helperSkillName}
                            onChange={(e) => setHelperSkillName(e.target.value)}
                            placeholder="e.g., Excel & Spreadsheet Modeling, Beginner Python"
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="ai-helper-target-skill">
                            Target Offered Skill to Update (Optional)
                          </label>
                          <select
                            id="ai-helper-target-skill"
                            value={helperTargetSkillId}
                            onChange={(e) => {
                              const val = e.target.value;
                              setHelperTargetSkillId(val);
                              const found = (viewer?.offers || []).find(
                                (s) => String(s.id) === String(val)
                              );
                              if (found) {
                                setHelperSkillName(found.skill_name);
                              }
                            }}
                          >
                            <option value="new">+ Apply to New Offered Skill Form</option>
                            {(viewer?.offers || []).map((s) => (
                              <option key={s.id} value={String(s.id)}>
                                Update existing: {s.skill_name} ({s.category} • {s.level})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    <div className="form-group" style={{ marginBottom: 10 }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 4
                        }}
                      >
                        <label htmlFor="ai-helper-rough-notes" style={{ margin: 0 }}>
                          {helperTask === 'bio'
                            ? 'Rough Notes for Your Profile Introduction (10–500 characters)'
                            : 'Rough Notes on What You Teach & What Peers Will Learn (10–500 characters)'}
                        </label>
                        <span
                          style={{
                            fontSize: '0.76rem',
                            fontWeight: 600,
                            color:
                              helperRoughNotes.trim().length > 500 ||
                              (helperRoughNotes.trim().length > 0 &&
                                helperRoughNotes.trim().length < 10)
                                ? '#DC2626'
                                : '#64748B'
                          }}
                        >
                          {helperRoughNotes.trim().length} / 500 chars (min 10)
                        </span>
                      </div>
                      <textarea
                        id="ai-helper-rough-notes"
                        rows="3"
                        minLength={10}
                        maxLength={500}
                        value={helperRoughNotes}
                        onChange={(e) => setHelperRoughNotes(e.target.value)}
                        placeholder={
                          helperTask === 'bio'
                            ? 'e.g., Senior financial analyst; love teaching Excel pivot tables, XLOOKUP, and KPI dashboards; want to learn graphic design and Python automation.'
                            : 'e.g., XLOOKUP, dynamic pivot tables, cleaning messy CSV exports, and building automated monthly budget trackers.'
                        }
                      />
                    </div>

                    {/* Quick Note Starters */}
                    <div
                      className="availability-chips"
                      style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
                    >
                      <span className="peer-submeta">Sample rough notes:</span>
                      {helperTask === 'bio' ? (
                        <>
                          <button
                            type="button"
                            className="preset-chip"
                            onClick={() =>
                              setHelperRoughNotes(
                                'Financial operations lead; love coaching Excel pivot tables, XLOOKUP, and conversational English; looking to learn graphic design and beginner Python.'
                              )
                            }
                          >
                            Fill Bio Notes: Excel &amp; English ⇄ Design &amp; Python
                          </button>
                          <button
                            type="button"
                            className="preset-chip"
                            onClick={() =>
                              setHelperRoughNotes(
                                'Product designer with 6 years in Figma and typography systems; excited to trade visual design critiques for hands-on spreadsheet modeling.'
                              )
                            }
                          >
                            Fill Bio Notes: Product Designer ⇄ Spreadsheets
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="preset-chip"
                            onClick={() => {
                              if (!helperSkillName) setHelperSkillName('Excel & Spreadsheet Modeling');
                              setHelperRoughNotes(
                                'XLOOKUP, INDEX/MATCH, multi-source pivot tables, cohort retention modeling, and executive dashboard layout.'
                              );
                            }}
                          >
                            Fill Skill Notes: Excel Modeling
                          </button>
                          <button
                            type="button"
                            className="preset-chip"
                            onClick={() => {
                              setHelperSkillName('Python');
                              setHelperRoughNotes(
                                'Writing your first Python script, cleaning CSV files with pandas, and automating repetitive weekly spreadsheet reports.'
                              );
                            }}
                          >
                            Fill Skill Notes: Beginner Python
                          </button>
                        </>
                      )}
                    </div>

                    {helperError && (
                      <div
                        role="alert"
                        style={{
                          backgroundColor: '#FEF2F2',
                          border: '1px solid #FECACA',
                          color: '#991B1B',
                          borderRadius: 10,
                          padding: '10px 14px',
                          marginBottom: 12,
                          fontSize: '0.84rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <span>{helperError}</span>
                        <button
                          type="button"
                          onClick={() => setHelperError(null)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#991B1B',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={helperLoading}
                      >
                        {helperLoading
                          ? '✦ Generating AI Suggestion...'
                          : helperTask === 'bio'
                          ? '✦ Generate Profile Bio Suggestion'
                          : '✦ Generate Skill Description Suggestion'}
                      </button>
                      {helperLoading && (
                        <span role="status" style={{ fontSize: '0.84rem', color: '#0F766E', fontWeight: 600 }}>
                          Calling POST /api/ai/profile-helper...
                        </span>
                      )}
                    </div>
                  </form>

                  {/* Review, Edit, and Confirmation Panel */}
                  {helperSuggestion && (
                    <div
                      style={{
                        marginTop: 18,
                        paddingTop: 16,
                        borderTop: '1px solid #CCFBF1'
                      }}
                    >
                      <div className="form-group">
                        <label htmlFor="ai-helper-review-textarea" style={{ fontWeight: 700, color: '#0F766E' }}>
                          Review &amp; Edit AI Suggestion Before Saving
                        </label>
                        <textarea
                          id="ai-helper-review-textarea"
                          rows="3"
                          value={helperEditedSuggestion}
                          onChange={(e) => setHelperEditedSuggestion(e.target.value)}
                          style={{
                            backgroundColor: '#FFFFFF',
                            border: '1px solid #0F766E'
                          }}
                        />
                        <span className="peer-submeta">
                          You can freely edit the suggested text above. Nothing is overwritten automatically.
                        </span>
                      </div>

                      {helperTask === 'bio' ? (
                        <div style={{ marginTop: 10 }}>
                          {!helperConfirmingBioReplace ? (
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => setHelperConfirmingBioReplace(true)}
                              >
                                Apply to Profile Bio (Requires Confirmation)...
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline"
                                onClick={() => {
                                  setHelperSuggestion('');
                                  setHelperEditedSuggestion('');
                                }}
                              >
                                Discard Suggestion
                              </button>
                            </div>
                          ) : (
                            <div
                              role="region"
                              aria-label="Confirm replacing profile bio"
                              style={{
                                backgroundColor: '#FEFCE8',
                                border: '1px solid #FDE047',
                                borderRadius: 12,
                                padding: '12px 16px'
                              }}
                            >
                              <div style={{ fontWeight: 700, color: '#854D0E', marginBottom: 6 }}>
                                Confirm before replacing your existing Profile Bio?
                              </div>
                              <p className="peer-submeta" style={{ margin: '0 0 10px', color: '#713F12' }}>
                                <strong>Current bio:</strong> &ldquo;{profForm.bio || 'None'}&rdquo;
                              </p>
                              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  onClick={handleConfirmReplaceBio}
                                >
                                  ✓ Confirm &amp; Replace Profile Bio
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-outline"
                                  onClick={() => setHelperConfirmingBioReplace(false)}
                                >
                                  Cancel (Keep Existing Bio)
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleSaveSkillDescriptionFromHelper}
                          >
                            ✓ Save Skill Description to Profile
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => {
                              setHelperSuggestion('');
                              setHelperEditedSuggestion('');
                            }}
                          >
                            Discard Suggestion
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </section>

                <div className="studio-skills-column">
                  {/* OFFERED SKILLS CARD */}
                  <div className="studio-card offer-accent-border">
                    <span className="badge-offer">TEACHING / OFFERING</span>
                    <h3 className="studio-card-title">Skills You Can Teach Others</h3>

                    <div className="studio-skill-items">
                      {(viewer?.offers || []).map((s) => (
                        <div key={s.id} className="studio-skill-row">
                          {editingSkillId === s.id ? (
                            <div className="inline-edit-skill-box">
                              <input
                                type="text"
                                value={editingSkillForm.skill_name}
                                onChange={(e) =>
                                  setEditingSkillForm({
                                    ...editingSkillForm,
                                    skill_name: e.target.value
                                  })
                                }
                              />
                              <div className="form-row-2">
                                <select
                                  value={editingSkillForm.category}
                                  onChange={(e) =>
                                    setEditingSkillForm({
                                      ...editingSkillForm,
                                      category: e.target.value
                                    })
                                  }
                                >
                                  {CATEGORIES.map((c) => (
                                    <option key={c} value={c}>
                                      {c}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={editingSkillForm.level}
                                  onChange={(e) =>
                                    setEditingSkillForm({
                                      ...editingSkillForm,
                                      level: e.target.value
                                    })
                                  }
                                >
                                  {PROFICIENCY_LEVELS.map((lvl) => (
                                    <option key={lvl} value={lvl}>
                                      {lvl}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <input
                                type="text"
                                value={editingSkillForm.description}
                                onChange={(e) =>
                                  setEditingSkillForm({
                                    ...editingSkillForm,
                                    description: e.target.value
                                  })
                                }
                              />
                              <div className="skill-row-actions">
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  onClick={() => handleSaveEditedSkill(s.id)}
                                >
                                  Save Changes
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-outline"
                                  onClick={() => setEditingSkillId(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div>
                                <strong>{s.skill_name}</strong>{' '}
                                <span className="mini-skill-lvl">
                                  {s.category} • {s.level}
                                </span>
                                <p className="peer-submeta">{s.description}</p>
                              </div>
                              <div className="skill-row-actions">
                                <button
                                  type="button"
                                  className="edit-skill-btn"
                                  onClick={() => startEditingSkill(s)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="remove-skill-btn"
                                  onClick={() => handleDeleteSkill(s.id)}
                                >
                                  Remove
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>

                    <form
                      className="add-skill-inline-form"
                      onSubmit={(e) => handleAddSkill(e, 'offer')}
                    >
                      <h4>Add a Skill You Can Teach (Skill • Category • Proficiency)</h4>
                      <div className="availability-chips" style={{ marginBottom: 8 }}>
                        <span className="peer-submeta">Quick presets:</span>
                        {REFERENCE_SKILLS.map((ref) => (
                          <button
                            key={ref.skill_name}
                            type="button"
                            className="preset-chip"
                            onClick={() => setNewOffer({ ...ref })}
                          >
                            {ref.skill_name} ({ref.category} • {ref.level})
                          </button>
                        ))}
                      </div>
                      <div className="form-row-3">
                        <input
                          type="text"
                          placeholder="Skill (e.g., Excel, Graphic design)"
                          value={newOffer.skill_name}
                          onChange={(e) =>
                            setNewOffer({ ...newOffer, skill_name: e.target.value })
                          }
                          required
                        />
                        <select
                          aria-label="Offered skill category"
                          value={newOffer.category}
                          onChange={(e) =>
                            setNewOffer({ ...newOffer, category: e.target.value })
                          }
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label="Offered skill proficiency"
                          value={newOffer.level}
                          onChange={(e) =>
                            setNewOffer({ ...newOffer, level: e.target.value })
                          }
                        >
                          {PROFICIENCY_LEVELS.map((lvl) => (
                            <option key={lvl} value={lvl}>
                              {lvl}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="form-row-action">
                        <input
                          type="text"
                          placeholder="Specific topics you can coach..."
                          value={newOffer.description}
                          onChange={(e) =>
                            setNewOffer({ ...newOffer, description: e.target.value })
                          }
                        />
                        <button type="submit" className="btn btn-offer">
                          + Add Offered Skill
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* WANTED SKILLS CARD */}
                  <div className="studio-card want-accent-border">
                    <span className="badge-want">LEARNING / SEEKING</span>
                    <h3 className="studio-card-title">Skills You Want to Learn</h3>

                    <div className="studio-skill-items">
                      {(viewer?.wants || []).map((s) => (
                        <div key={s.id} className="studio-skill-row">
                          {editingSkillId === s.id ? (
                            <div className="inline-edit-skill-box">
                              <input
                                type="text"
                                value={editingSkillForm.skill_name}
                                onChange={(e) =>
                                  setEditingSkillForm({
                                    ...editingSkillForm,
                                    skill_name: e.target.value
                                  })
                                }
                              />
                              <div className="form-row-2">
                                <select
                                  value={editingSkillForm.category}
                                  onChange={(e) =>
                                    setEditingSkillForm({
                                      ...editingSkillForm,
                                      category: e.target.value
                                    })
                                  }
                                >
                                  {CATEGORIES.map((c) => (
                                    <option key={c} value={c}>
                                      {c}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={editingSkillForm.level}
                                  onChange={(e) =>
                                    setEditingSkillForm({
                                      ...editingSkillForm,
                                      level: e.target.value
                                    })
                                  }
                                >
                                  {PROFICIENCY_LEVELS.map((lvl) => (
                                    <option key={lvl} value={lvl}>
                                      {lvl}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <input
                                type="text"
                                value={editingSkillForm.description}
                                onChange={(e) =>
                                  setEditingSkillForm({
                                    ...editingSkillForm,
                                    description: e.target.value
                                  })
                                }
                              />
                              <div className="skill-row-actions">
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  onClick={() => handleSaveEditedSkill(s.id)}
                                >
                                  Save Changes
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-outline"
                                  onClick={() => setEditingSkillId(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div>
                                <strong>{s.skill_name}</strong>{' '}
                                <span className="mini-skill-lvl">
                                  {s.category} • {s.level}
                                </span>
                                <p className="peer-submeta">{s.description}</p>
                              </div>
                              <div className="skill-row-actions">
                                <button
                                  type="button"
                                  className="edit-skill-btn"
                                  onClick={() => startEditingSkill(s)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="remove-skill-btn"
                                  onClick={() => handleDeleteSkill(s.id)}
                                >
                                  Remove
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>

                    <form
                      className="add-skill-inline-form"
                      onSubmit={(e) => handleAddSkill(e, 'want')}
                    >
                      <h4>Add a Skill You Want to Learn (Skill • Category • Proficiency)</h4>
                      <div className="availability-chips" style={{ marginBottom: 8 }}>
                        <span className="peer-submeta">Quick presets:</span>
                        {REFERENCE_SKILLS.map((ref) => (
                          <button
                            key={ref.skill_name}
                            type="button"
                            className="preset-chip"
                            onClick={() => setNewWant({ ...ref })}
                          >
                            {ref.skill_name} ({ref.category} • {ref.level})
                          </button>
                        ))}
                      </div>
                      <div className="form-row-3">
                        <input
                          type="text"
                          placeholder="Skill (e.g., Python, Graphic design)"
                          value={newWant.skill_name}
                          onChange={(e) =>
                            setNewWant({ ...newWant, skill_name: e.target.value })
                          }
                          required
                        />
                        <select
                          aria-label="Learning goal category"
                          value={newWant.category}
                          onChange={(e) =>
                            setNewWant({ ...newWant, category: e.target.value })
                          }
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label="Learning goal proficiency"
                          value={newWant.level}
                          onChange={(e) =>
                            setNewWant({ ...newWant, level: e.target.value })
                          }
                        >
                          {PROFICIENCY_LEVELS.map((lvl) => (
                            <option key={lvl} value={lvl}>
                              {lvl}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="form-row-action">
                        <input
                          type="text"
                          placeholder="What outcome do you want help with?"
                          value={newWant.description}
                          onChange={(e) =>
                            setNewWant({ ...newWant, description: e.target.value })
                          }
                        />
                        <button type="submit" className="btn btn-want">
                          + Add Learning Goal
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: MY LEARNING PLANS (Flow E: Create, Review, Edit, Save, Delete AI Learning Plans) */}
          {activeTab === 'plans' && (
            <div>
              <div className="section-header-bar split">
                <div>
                  <span className="eyebrow-badge">✦ FLOW E: PERSONALIZED AI LEARNING PLANS</span>
                  <h1 className="section-title">My Learning Plans</h1>
                  <p className="section-subtitle">
                    Generate a structured 4-week reciprocal learning plan for any target skill, review and edit the proposed plan before saving, and access your saved plans privately.
                  </p>
                </div>
              </div>

              <div className="profile-studio-grid">
                <form className="studio-card" onSubmit={handleGenerateAiLearningPlan}>
                  <h3 className="studio-card-title">1. Generate an AI Learning Plan</h3>
                  <div
                    role="note"
                    style={{
                      backgroundColor: '#FFFBEB',
                      border: '1px solid #FDE68A',
                      borderRadius: 10,
                      padding: '10px 14px',
                      marginBottom: 14,
                      fontSize: '0.82rem',
                      color: '#92400E'
                    }}
                  >
                    <strong>🔒 Privacy &amp; Access Control:</strong> Saved learning plans are stored in{' '}
                    <code>learning_plans</code> and are strictly accessible only to your authenticated account.
                  </div>

                  <div className="form-row-2">
                    <div className="form-group">
                      <label htmlFor="plan-target-skill">Target Skill to Learn (2–80 chars)</label>
                      <input
                        id="plan-target-skill"
                        type="text"
                        value={planSkill}
                        onChange={(e) => setPlanSkill(e.target.value)}
                        placeholder="e.g., Beginner Python Lessons, Graphic Design"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="plan-preferred-format">Preferred Learning Format</label>
                      <select
                        id="plan-preferred-format"
                        value={planFormat}
                        onChange={(e) => setPlanFormat(e.target.value)}
                      >
                        <option value="Online">Online</option>
                        <option value="In person">In person</option>
                        <option value="Either">Either (Online or In person)</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="plan-learning-goals">
                      Learning Goals &amp; Context (10–500 chars)
                    </label>
                    <textarea
                      id="plan-learning-goals"
                      rows="3"
                      value={planGoals}
                      onChange={(e) => setPlanGoals(e.target.value)}
                      placeholder="Describe what you want to build or achieve over 4 reciprocal exchange sessions..."
                      required
                    />
                  </div>

                  {planError && (
                    <div
                      role="alert"
                      style={{
                        backgroundColor: '#FEF2F2',
                        border: '1px solid #FECACA',
                        color: '#991B1B',
                        borderRadius: 10,
                        padding: '10px 14px',
                        marginBottom: 12,
                        fontSize: '0.84rem'
                      }}
                    >
                      {planError}
                    </div>
                  )}

                  <button type="submit" className="btn btn-primary" disabled={planLoading}>
                    {planLoading ? '✦ Generating Proposed Learning Plan...' : '✦ Generate AI Learning Plan'}
                  </button>

                  {proposedPlan && (
                    <div
                      style={{
                        marginTop: 18,
                        paddingTop: 16,
                        borderTop: '1px solid #CCFBF1'
                      }}
                    >
                      <h4 style={{ margin: '0 0 10px', color: '#0F766E' }}>
                        2. Review &amp; Edit Proposed Plan Before Saving
                      </h4>
                      <div className="form-group">
                        <label htmlFor="edit-plan-title">Plan Title</label>
                        <input
                          id="edit-plan-title"
                          type="text"
                          value={editedPlanTitle}
                          onChange={(e) => setEditedPlanTitle(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="edit-plan-content">4-Week Milestones &amp; Action Plan</label>
                        <textarea
                          id="edit-plan-content"
                          rows="5"
                          value={editedPlanContent}
                          onChange={(e) => setEditedPlanContent(e.target.value)}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={handleSaveLearningPlan}
                        >
                          ✓ Confirm &amp; Save to My Learning Plans
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => setProposedPlan(null)}
                        >
                          Discard Draft
                        </button>
                      </div>
                    </div>
                  )}
                </form>

                <div className="studio-skills-column">
                  <div className="studio-card">
                    <span className="eyebrow-badge">PRIVATE TO {viewer?.name?.toUpperCase()}</span>
                    <h3 className="studio-card-title">
                      Saved Learning Plans ({learningPlans.length})
                    </h3>
                    {learningPlans.length === 0 ? (
                      <p className="peer-submeta">
                        You haven&apos;t saved any AI learning plans yet. Generate and confirm a plan on the left to save it to your account.
                      </p>
                    ) : (
                      <div className="studio-skill-items">
                        {learningPlans.map((plan) => (
                          <div
                            key={plan.id}
                            className="studio-skill-row"
                            style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                              <div>
                                <strong>{plan.plan_title}</strong>{' '}
                                <span className="mini-skill-lvl">
                                  {plan.target_skill} • {plan.preferred_format}
                                </span>
                              </div>
                              <button
                                type="button"
                                className="remove-skill-btn"
                                onClick={() => handleDeleteLearningPlan(plan.id)}
                              >
                                Delete
                              </button>
                            </div>
                            <p className="peer-submeta" style={{ margin: 0 }}>
                              <strong>Goal:</strong> {plan.learning_goals}
                            </p>
                            <pre
                              style={{
                                margin: 0,
                                whiteSpace: 'pre-wrap',
                                fontFamily: 'inherit',
                                fontSize: '0.82rem',
                                backgroundColor: '#F8FAFC',
                                border: '1px solid #E2E8F0',
                                borderRadius: 8,
                                padding: '10px 12px',
                                color: '#1E293B'
                              }}
                            >
                              {plan.plan_content}
                            </pre>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* MODAL 0: MEMBER DETAIL VIEW (Screen 4: Profile details, skills, learning goals, compatibility & request action) */}
      {selectedMemberDetail && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`Member Detail: ${selectedMemberDetail.name}`}>
          <div className="modal-card modal-lg">
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div
                  className="avatar-md"
                  style={{ backgroundColor: selectedMemberDetail.avatar_bg || '#0F766E' }}
                >
                  {selectedMemberDetail.avatar_initials}
                </div>
                <div>
                  <span className="eyebrow-badge">
                    ✦ {selectedMemberDetail.aiMatch?.score}% COMPATIBILITY ESTIMATE • {selectedMemberDetail.aiMatch?.matchTier}
                  </span>
                  <h2 style={{ margin: '4px 0 2px' }}>{selectedMemberDetail.name}</h2>
                  <p className="peer-role" style={{ margin: 0 }}>
                    {selectedMemberDetail.role_title} • {selectedMemberDetail.location} ({selectedMemberDetail.timezone}) • Format:{' '}
                    <strong>
                      {selectedMemberDetail.preferred_format === 'Either'
                        ? 'Online or in person'
                        : selectedMemberDetail.preferred_format || 'Online'}
                    </strong>
                  </p>
                </div>
              </div>
              <button
                className="modal-close-btn"
                onClick={() => setSelectedMemberDetail(null)}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '4px 0 12px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <h4 style={{ margin: '0 0 6px', color: '#0F172A' }}>Member Introduction (Public Bio)</h4>
                <p className="peer-bio" style={{ margin: 0 }}>{selectedMemberDetail.bio}</p>
              </div>

              <div className="form-row-2">
                <div>
                  <h4 style={{ margin: '0 0 6px', color: '#0F766E' }}>Skills Offered (Can Teach You)</h4>
                  <div className="studio-skill-items">
                    {(selectedMemberDetail.offers || []).map((s) => (
                      <div key={s.id} className="studio-skill-row">
                        <div>
                          <strong>{s.skill_name}</strong>{' '}
                          <span className="mini-skill-lvl">
                            {s.category} • {s.proficiency || s.level}
                          </span>
                          <p className="peer-submeta" style={{ margin: '4px 0 0' }}>{s.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 style={{ margin: '0 0 6px', color: '#4338CA' }}>Learning Goals (Wants to Learn)</h4>
                  <div className="studio-skill-items">
                    {(selectedMemberDetail.wants || []).map((s) => (
                      <div key={s.id} className="studio-skill-row">
                        <div>
                          <strong>{s.skill_name}</strong>{' '}
                          <span className="mini-skill-lvl">
                            {s.category} • {s.proficiency || s.level}
                          </span>
                          <p className="peer-submeta" style={{ margin: '4px 0 0' }}>{s.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {selectedMemberDetail.aiMatch && (
                <div className="ai-rationale-box">
                  <div className="ai-rationale-header">
                    <span className="ai-rationale-label">
                      ✦ AI Compatibility Analysis ({selectedMemberDetail.aiMatch.score}% Match)
                    </span>
                  </div>
                  <p className="ai-rationale-copy">{selectedMemberDetail.aiMatch.rationale}</p>
                  <div className="peer-submeta" style={{ marginTop: 6 }}>
                    <strong>Availability:</strong> {(selectedMemberDetail.availability || []).join(', ')} •{' '}
                    <strong>Interests:</strong> {(selectedMemberDetail.interests || []).join(', ')}
                  </div>
                </div>
              )}

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setSelectedMemberDetail(null)}
                >
                  Close Profile
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    const target = selectedMemberDetail;
                    setSelectedMemberDetail(null);
                    openRequestModal(target);
                  }}
                >
                  Request Skill Swap with {selectedMemberDetail.name.split(' ')[0]}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: REQUEST SKILL-EXCHANGE SESSION */}
      {requestModalTarget && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card modal-lg">
            <div className="modal-header">
              <div>
                <span className="eyebrow-badge">
                  ✦ {requestModalTarget.aiMatch?.score}% AI RECIPROCAL MATCH WITH{' '}
                  {requestModalTarget.name.toUpperCase()}
                </span>
                <h2>Propose 50/50 Swap with {requestModalTarget.name}</h2>
              </div>
              <button
                className="modal-close-btn"
                onClick={() => setRequestModalTarget(null)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSendSwapRequest}>
              <div className="modal-swap-bridge">
                <div className="bridge-side offer-side">
                  <span className="bridge-label">YOU TEACH (FIRST HALF)</span>
                  <select
                    value={reqForm.offered_skill_name}
                    onChange={(e) =>
                      regenerateModalAiBlueprint({ offered_skill_name: e.target.value })
                    }
                  >
                    {(viewer?.offers || []).map((s) => (
                      <option key={s.id} value={s.skill_name}>
                        {s.skill_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="bridge-center-icon">⇄</div>
                <div className="bridge-side want-side">
                  <span className="bridge-label">
                    {requestModalTarget.name.split(' ')[0].toUpperCase()} TEACHES (SECOND HALF)
                  </span>
                  <select
                    value={reqForm.wanted_skill_name}
                    onChange={(e) =>
                      regenerateModalAiBlueprint({ wanted_skill_name: e.target.value })
                    }
                  >
                    {(requestModalTarget.offers || []).map((s) => (
                      <option key={s.id} value={s.skill_name}>
                        {s.skill_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row-3">
                <div className="form-group">
                  <label>Proposed Session Date &amp; Time</label>
                  <input
                    type="text"
                    value={reqForm.proposed_slot}
                    onChange={(e) =>
                      setReqForm({
                        ...reqForm,
                        proposed_slot: e.target.value,
                        session_datetime: e.target.value
                      })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Session Mode (Online or In person)</label>
                  <select
                    value={reqForm.session_mode}
                    onChange={(e) =>
                      setReqForm({
                        ...reqForm,
                        session_mode: e.target.value,
                        meeting_link_or_location:
                          e.target.value === 'In person'
                            ? 'Local Café / Shared Study Space'
                            : 'https://meet.skillswap.io/reciprocal-session'
                      })
                    }
                  >
                    <option value="Online">Online</option>
                    <option value="In person">In person</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Total Session Duration</label>
                  <select
                    value={reqForm.duration_mins}
                    onChange={(e) =>
                      regenerateModalAiBlueprint({ duration_mins: Number(e.target.value) })
                    }
                  >
                    <option value={45}>45 mins (20m / 20m split)</option>
                    <option value={60}>60 mins (25m / 25m split)</option>
                    <option value={90}>90 mins (40m / 40m split)</option>
                  </select>
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>
                    {reqForm.session_mode === 'In person'
                      ? 'Meeting Location / Address'
                      : 'Meeting Link (Zoom / Meet / Studio URL)'}
                  </label>
                  <input
                    type="text"
                    value={reqForm.meeting_link_or_location}
                    onChange={(e) =>
                      setReqForm({ ...reqForm, meeting_link_or_location: e.target.value })
                    }
                    placeholder={
                      reqForm.session_mode === 'In person'
                        ? 'e.g., Downtown Library Study Room'
                        : 'https://meet.skillswap.io/reciprocal-session'
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Session Notes &amp; Schedule Status</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      value={reqForm.session_notes}
                      onChange={(e) => setReqForm({ ...reqForm, session_notes: e.target.value })}
                      placeholder="Materials or notes for the session..."
                      style={{ flex: 1 }}
                    />
                    <select
                      aria-label="Initial schedule status"
                      value={reqForm.schedule_status}
                      onChange={(e) =>
                        setReqForm({ ...reqForm, schedule_status: e.target.value })
                      }
                      style={{ width: 150 }}
                    >
                      <option value="proposed">Proposed</option>
                      <option value="agreed">Agreed</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="form-group">
                <div className="label-with-action">
                  <label>Specific Mutual Session Goal</label>
                  <button
                    type="button"
                    className="ai-regen-btn"
                    onClick={() => regenerateModalAiBlueprint()}
                  >
                    ✦ Regenerate AI Session Blueprint
                  </button>
                </div>
                <input
                  type="text"
                  value={reqForm.learning_goal}
                  onChange={(e) =>
                    setReqForm({ ...reqForm, learning_goal: e.target.value })
                  }
                  required
                />
              </div>

              <div className="ai-agenda-box">
                <div className="ai-agenda-head">
                  ✦ AI-Generated 50/50 Session Agenda (Included with Request)
                </div>
                <div className="ai-agenda-steps">
                  {(reqForm.ai_session_agenda || []).map((st, idx) => (
                    <div key={idx} className="blueprint-step">
                      <span className="bp-time">{st.time}</span>
                      <span className="bp-text">
                        <strong>{st.phase}:</strong> {st.detail}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>Personal Note to Partner</label>
                <textarea
                  rows="3"
                  value={reqForm.message}
                  onChange={(e) => setReqForm({ ...reqForm, message: e.target.value })}
                  required
                />
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setRequestModalTarget(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Send Skill-Exchange Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: RECORD COMPLETED EXCHANGE */}
      {recordModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <span className="eyebrow-badge">VERIFIED LEARNING LOG</span>
                <h2>Record a Completed Skill Exchange</h2>
              </div>
              <button
                className="modal-close-btn"
                onClick={() => setRecordModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRecordExchangeSubmit}>
              <div className="form-row-2">
                <div className="form-group">
                  <label>Exchange Partner</label>
                  <select
                    value={recForm.partner_b_id}
                    onChange={(e) =>
                      setRecForm({ ...recForm, partner_b_id: Number(e.target.value) })
                    }
                  >
                    {allUsers
                      .filter((u) => u.id !== viewer?.id)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} (@{u.handle})
                        </option>
                      ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Duration Completed (Minutes)</label>
                  <input
                    type="number"
                    min="15"
                    max="240"
                    value={recForm.duration_mins}
                    onChange={(e) =>
                      setRecForm({ ...recForm, duration_mins: Number(e.target.value) })
                    }
                    required
                  />
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Skill You Taught</label>
                  <input
                    type="text"
                    value={recForm.skill_a_taught}
                    onChange={(e) =>
                      setRecForm({ ...recForm, skill_a_taught: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Skill Partner Taught You</label>
                  <input
                    type="text"
                    value={recForm.skill_b_taught}
                    onChange={(e) =>
                      setRecForm({ ...recForm, skill_b_taught: e.target.value })
                    }
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Session Summary</label>
                <textarea
                  rows="2"
                  value={recForm.summary_notes}
                  onChange={(e) =>
                    setRecForm({ ...recForm, summary_notes: e.target.value })
                  }
                  placeholder="What did you build, practice, or review together?"
                  required
                />
              </div>

              <div className="form-group">
                <label>Key Takeaways &amp; Artifacts (One per line)</label>
                <textarea
                  rows="3"
                  value={recForm.takeaways_text}
                  onChange={(e) =>
                    setRecForm({ ...recForm, takeaways_text: e.target.value })
                  }
                  placeholder="Built automated Pivot Table summary&#10;Redesigned cover slide using 12-column grid"
                />
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Session Rating (1 to 5 Stars)</label>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        className="preset-chip"
                        style={{
                          backgroundColor:
                            Number(recForm.rating_given) >= star ? '#FEF3C7' : '#F8FAFC',
                          borderColor:
                            Number(recForm.rating_given) >= star ? '#F59E0B' : '#CBD5E1',
                          color: Number(recForm.rating_given) >= star ? '#B45309' : '#64748B',
                          fontWeight: 700
                        }}
                        onClick={() => setRecForm({ ...recForm, rating_given: star })}
                      >
                        {star} ★
                      </button>
                    ))}
                  </div>
                  <select
                    aria-label="Session star rating"
                    value={recForm.rating_given}
                    onChange={(e) =>
                      setRecForm({ ...recForm, rating_given: Number(e.target.value) })
                    }
                  >
                    <option value={5}>★★★★★ (5/5 — Exceptional Value)</option>
                    <option value={4}>★★★★☆ (4/5 — Great Session)</option>
                    <option value={3}>★★★☆☆ (3/5 — Helpful)</option>
                    <option value={2}>★★☆☆☆ (2/5 — Fair)</option>
                    <option value={1}>★☆☆☆☆ (1/5 — Needs Improvement)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Short Review (What You Learned or Shared)</label>
                  <input
                    type="text"
                    value={recForm.testimonial}
                    onChange={(e) =>
                      setRecForm({ ...recForm, testimonial: e.target.value })
                    }
                    placeholder="Clear examples and super patient coaching!"
                    required
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setRecordModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Verify &amp; Log Completed Swap
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: SECURE AUTHENTICATION (SIGN IN / REGISTER) */}
      {authModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <span className="eyebrow-badge">AUTHENTICATION &amp; ACCESS CONTROL</span>
                <h2>
                  {authMode === 'login'
                    ? 'Sign In to Your SkillSwap Account'
                    : 'Register a New SkillSwap Account'}
                </h2>
              </div>
              <button
                className="modal-close-btn"
                onClick={() => setAuthModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="auth-tabs">
              <button
                type="button"
                className={`auth-tab-btn ${authMode === 'login' ? 'active' : ''}`}
                onClick={() => {
                  setAuthError(null);
                  setAuthMode('login');
                }}
              >
                Sign In with Credentials
              </button>
              <button
                type="button"
                className={`auth-tab-btn ${authMode === 'register' ? 'active' : ''}`}
                onClick={() => {
                  setAuthError(null);
                  setAuthMode('register');
                }}
              >
                Create New Account
              </button>
            </div>

            {authError && (
              <div
                role="alert"
                style={{
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FECACA',
                  color: '#991B1B',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  marginBottom: '14px',
                  fontSize: '0.86rem',
                  fontWeight: 600,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '10px'
                }}
              >
                <span>⚠️ {authError}</span>
                <button
                  type="button"
                  onClick={() => setAuthError(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#991B1B',
                    cursor: 'pointer',
                    fontWeight: 700
                  }}
                >
                  ✕
                </button>
              </div>
            )}

            {authMode === 'login' ? (
              <form onSubmit={handleLoginSubmit}>
                <div
                  style={{
                    backgroundColor: '#F0FDFA',
                    border: '1px solid #CCFBF1',
                    borderRadius: '10px',
                    padding: '10px 12px',
                    marginBottom: '14px'
                  }}
                >
                  <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#0F766E', marginBottom: '6px' }}>
                    QUICK DEMO SIGN-IN (1-CLICK):
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {[
                      { label: 'Maya Lin (Excel)', email: 'maya@skillswap.io' },
                      { label: 'Lucas Rivera (Design)', email: 'lucas@skillswap.io' },
                      { label: 'Tariq Al-Mansoor (Python)', email: 'tariq@skillswap.io' },
                      { label: 'Priya Patel (English)', email: 'priya@skillswap.io' }
                    ].map((demo) => (
                      <button
                        key={demo.email}
                        type="button"
                        disabled={authLoading}
                        onClick={() => {
                          const nextCreds = { email: demo.email, password: 'skillswap123' };
                          setLoginForm(nextCreds);
                          handleLoginSubmit(null, nextCreds);
                        }}
                        style={{
                          fontSize: '0.75rem',
                          padding: '5px 10px',
                          borderRadius: '999px',
                          border: '1px solid #99F6E4',
                          backgroundColor: '#FFFFFF',
                          color: '#0F766E',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Sign in as {demo.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label>Email or Handle</label>
                  <input
                    type="text"
                    value={loginForm.email}
                    onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                    placeholder="maya@skillswap.io or lucas@skillswap.io"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Password</label>
                  <input
                    type="password"
                    value={loginForm.password}
                    onChange={(e) =>
                      setLoginForm({ ...loginForm, password: e.target.value })
                    }
                    required
                  />
                  <span className="peer-submeta">
                    Demo accounts use password: <code>skillswap123</code> (or register your own account in the tab above).
                  </span>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setAuthModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={authLoading}>
                    {authLoading ? 'Signing In...' : 'Sign In'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleRegisterSubmit}>
                <div className="form-row-2">
                  <div className="form-group">
                    <label>Display Name (Public) *</label>
                    <input
                      type="text"
                      value={regForm.name}
                      onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                      placeholder="e.g., Aiman Musa"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Email Address (🔒 Private by Default) *</label>
                    <input
                      type="email"
                      value={regForm.email}
                      onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                      placeholder="aiman@example.com"
                      required
                    />
                  </div>
                </div>

                <div className="form-row-3">
                  <div className="form-group">
                    <label>Password (Never Public) *</label>
                    <input
                      type="password"
                      value={regForm.password}
                      onChange={(e) =>
                        setRegForm({ ...regForm, password: e.target.value })
                      }
                      placeholder="At least 3 characters"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Role / Headline (Optional)</label>
                    <input
                      type="text"
                      value={regForm.role_title}
                      onChange={(e) =>
                        setRegForm({ ...regForm, role_title: e.target.value })
                      }
                      placeholder="e.g., Data Analyst & Designer"
                    />
                  </div>
                  <div className="form-group">
                    <label>Preferred Learning Format</label>
                    <select
                      value={regForm.preferred_format}
                      onChange={(e) =>
                        setRegForm({ ...regForm, preferred_format: e.target.value })
                      }
                    >
                      <option value="Online">Online</option>
                      <option value="In person">In person</option>
                      <option value="Either">Either</option>
                    </select>
                  </div>
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>Short Bio (Optional)</label>
                    <textarea
                      rows="2"
                      value={regForm.bio}
                      onChange={(e) => setRegForm({ ...regForm, bio: e.target.value })}
                      placeholder="Share what you love teaching and what you're excited to learn..."
                    />
                  </div>
                  <div className="form-group">
                    <label>Interests (Public, comma-separated)</label>
                    <textarea
                      rows="2"
                      value={regForm.interests}
                      onChange={(e) => setRegForm({ ...regForm, interests: e.target.value })}
                      placeholder="e.g., Financial Tech, Visual Design, Automation"
                    />
                  </div>
                </div>

                <div className="modal-swap-bridge">
                  <div className="bridge-side offer-side">
                    <span className="bridge-label">PRIMARY SKILL YOU TEACH</span>
                    <input
                      type="text"
                      value={regForm.offer_skill}
                      onChange={(e) =>
                        setRegForm({ ...regForm, offer_skill: e.target.value })
                      }
                      placeholder="e.g., Excel, English conversation"
                    />
                    <div className="form-row-2">
                      <select
                        value={regForm.offer_category}
                        onChange={(e) =>
                          setRegForm({ ...regForm, offer_category: e.target.value })
                        }
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <select
                        value={regForm.offer_level}
                        onChange={(e) =>
                          setRegForm({ ...regForm, offer_level: e.target.value })
                        }
                      >
                        {PROFICIENCY_LEVELS.map((lvl) => (
                          <option key={lvl} value={lvl}>
                            {lvl}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="bridge-center-icon">⇄</div>
                  <div className="bridge-side want-side">
                    <span className="bridge-label">PRIMARY SKILL YOU WANT TO LEARN</span>
                    <input
                      type="text"
                      value={regForm.want_skill}
                      onChange={(e) =>
                        setRegForm({ ...regForm, want_skill: e.target.value })
                      }
                      placeholder="e.g., Python, Graphic design"
                    />
                    <div className="form-row-2">
                      <select
                        value={regForm.want_category}
                        onChange={(e) =>
                          setRegForm({ ...regForm, want_category: e.target.value })
                        }
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <select
                        value={regForm.want_level}
                        onChange={(e) =>
                          setRegForm({ ...regForm, want_level: e.target.value })
                        }
                      >
                        {PROFICIENCY_LEVELS.map((lvl) => (
                          <option key={lvl} value={lvl}>
                            {lvl}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setAuthModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={authLoading}>
                    {authLoading ? 'Creating Account...' : 'Register & Calculate AI Matches'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Floating AI Skill Match Assistant Button & Chatbox */}
      <div
        style={{
          position: 'fixed',
          right: 24,
          bottom: 24,
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 12
        }}
      >
        {chatOpen && (
          <aside
            aria-label="AI Skill Match Assistant Chatbox"
            style={{
              width: 'min(420px, calc(100vw - 32px))',
              maxHeight: 'min(640px, calc(100vh - 110px))',
              backgroundColor: '#FFFFFF',
              borderRadius: 18,
              border: '1px solid #CBD5E1',
              boxShadow: '0 24px 48px rgba(15, 23, 42, 0.22)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            {/* Chatbox Header */}
            <div
              style={{
                background: 'linear-gradient(135deg, #0F172A 0%, #0F766E 100%)',
                color: '#FFFFFF',
                padding: '14px 18px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.98rem' }}>
                  <span>✦ AI Skill Match Assistant</span>
                  <span
                    style={{
                      fontSize: '0.68rem',
                      backgroundColor: 'rgba(255,255,255,0.18)',
                      padding: '2px 8px',
                      borderRadius: 999,
                      fontWeight: 600
                    }}
                  >
                    Live DB Grounded
                  </span>
                </div>
                <div style={{ fontSize: '0.76rem', color: '#CCFBF1', marginTop: 2 }}>
                  Matches real database members to {viewer?.name || 'your profile'}
                </div>
              </div>
              <button
                type="button"
                aria-label="Close AI Skill Assistant"
                onClick={() => setChatOpen(false)}
                style={{
                  background: 'rgba(255,255,255,0.15)',
                  border: 'none',
                  color: '#FFFFFF',
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  cursor: 'pointer',
                  fontWeight: 700
                }}
              >
                ✕
              </button>
            </div>

            {/* Active Member Skills Context Banner */}
            <div
              style={{
                backgroundColor: '#F8FAFC',
                borderBottom: '1px solid #E2E8F0',
                padding: '8px 14px',
                fontSize: '0.75rem',
                color: '#334155',
                display: 'flex',
                flexDirection: 'column',
                gap: 3
              }}
            >
              <div>
                <strong style={{ color: '#0F766E' }}>You offer:</strong>{' '}
                {(viewer?.offers || []).map((s) => s.skill_name).join(', ') || 'None added yet'}
              </div>
              <div>
                <strong style={{ color: '#4338CA' }}>You want to learn:</strong>{' '}
                {(viewer?.wants || []).map((s) => s.skill_name).join(', ') || 'None added yet'}
              </div>
            </div>

            {/* Quick Example Prompts */}
            <div
              style={{
                padding: '8px 12px',
                borderBottom: '1px solid #F1F5F9',
                display: 'flex',
                gap: 6,
                overflowX: 'auto',
                backgroundColor: '#FFFFFF'
              }}
            >
              {AI_CHAT_PROMPTS.map((promptText) => (
                <button
                  key={promptText}
                  type="button"
                  disabled={chatLoading}
                  onClick={() => sendAiChatMessage(promptText)}
                  style={{
                    whiteSpace: 'nowrap',
                    fontSize: '0.74rem',
                    padding: '5px 10px',
                    borderRadius: 999,
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#F8FAFC',
                    color: '#0F172A',
                    cursor: chatLoading ? 'not-allowed' : 'pointer',
                    fontWeight: 500
                  }}
                >
                  {promptText}
                </button>
              ))}
            </div>

            {/* Conversation Display */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                backgroundColor: '#F8FAFC'
              }}
            >
              {chatMessages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={msg.id}
                    style={{
                      alignSelf: isUser ? 'flex-end' : 'flex-start',
                      maxWidth: '92%',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8
                    }}
                  >
                    <div
                      style={{
                        backgroundColor: isUser ? '#0F766E' : '#FFFFFF',
                        color: isUser ? '#FFFFFF' : '#0F172A',
                        border: isUser ? 'none' : '1px solid #E2E8F0',
                        borderRadius: isUser ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                        padding: '10px 13px',
                        fontSize: '0.84rem',
                        lineHeight: 1.5,
                        whiteSpace: 'pre-line',
                        boxShadow: '0 2px 5px rgba(15, 23, 42, 0.04)'
                      }}
                    >
                      {msg.text}
                    </div>

                    {/* Recommended Member Cards returned from Backend Database */}
                    {!isUser && Array.isArray(msg.recommendedMembers) && msg.recommendedMembers.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {msg.recommendedMembers.map((rec) => {
                          const fullCandidate =
                            candidates.find((c) => Number(c.id) === Number(rec.id)) ||
                            allUsers.find((u) => Number(u.id) === Number(rec.id));
                          return (
                            <div
                              key={rec.id}
                              style={{
                                backgroundColor: '#FFFFFF',
                                border: '1px solid #CBD5E1',
                                borderRadius: 12,
                                padding: '10px 12px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 6
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span
                                    style={{
                                      width: 28,
                                      height: 28,
                                      borderRadius: '50%',
                                      backgroundColor: rec.avatar_bg || '#0F766E',
                                      color: '#FFFFFF',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: '0.74rem',
                                      fontWeight: 700
                                    }}
                                  >
                                    {rec.avatar_initials || 'SS'}
                                  </span>
                                  <div>
                                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0F172A' }}>
                                      {rec.name}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                      {rec.role_title} • {rec.preferred_format}
                                    </div>
                                  </div>
                                </div>
                                <span
                                  style={{
                                    backgroundColor: '#ECFDF5',
                                    color: '#047857',
                                    border: '1px solid #A7F3D0',
                                    fontWeight: 700,
                                    fontSize: '0.74rem',
                                    padding: '2px 8px',
                                    borderRadius: 999
                                  }}
                                >
                                  {rec.score}% Match
                                </span>
                              </div>

                              <div style={{ fontSize: '0.76rem', color: '#334155', lineHeight: 1.4 }}>
                                <div>
                                  <strong style={{ color: '#0F766E' }}>Offers:</strong> {rec.theyTeach}
                                </div>
                                <div>
                                  <strong style={{ color: '#4338CA' }}>Wants to learn:</strong> {rec.theyWant} (matches your{' '}
                                  {rec.youTeach})
                                </div>
                              </div>

                              {fullCandidate && (
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2 }}>
                                  <button
                                    type="button"
                                    className="btn btn-primary"
                                    style={{ padding: '5px 10px', fontSize: '0.75rem' }}
                                    onClick={() => openRequestModal(fullCandidate)}
                                  >
                                    Request Swap with {rec.name.split(' ')[0]}
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {chatLoading && (
                <div
                  role="status"
                  style={{
                    alignSelf: 'flex-start',
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: 12,
                    padding: '9px 13px',
                    fontSize: '0.8rem',
                    color: '#0F766E',
                    fontWeight: 600
                  }}
                >
                  ✦ Evaluating database member skills &amp; compatibility...
                </div>
              )}

              {chatError && (
                <div
                  role="alert"
                  style={{
                    backgroundColor: '#FEF2F2',
                    border: '1px solid #FECACA',
                    color: '#991B1B',
                    borderRadius: 10,
                    padding: '9px 12px',
                    fontSize: '0.78rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8
                  }}
                >
                  <span>{chatError}</span>
                  <button
                    type="button"
                    onClick={() => setChatError(null)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#991B1B',
                      cursor: 'pointer',
                      fontWeight: 700
                    }}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            {/* Message Input Form */}
            <form
              onSubmit={handleAiChatSubmit}
              style={{
                padding: '10px 12px',
                borderTop: '1px solid #E2E8F0',
                backgroundColor: '#FFFFFF',
                display: 'flex',
                gap: 8
              }}
            >
              <input
                type="text"
                aria-label="Ask the AI Skill Assistant"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask e.g. Who can help me learn Python?"
                disabled={chatLoading}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  borderRadius: 10,
                  border: '1px solid #CBD5E1',
                  fontSize: '0.84rem'
                }}
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={chatLoading || !chatInput.trim()}
                style={{ padding: '9px 14px', fontSize: '0.84rem' }}
              >
                {chatLoading ? '...' : 'Send'}
              </button>
            </form>
          </aside>
        )}

        <button
          type="button"
          onClick={() => setChatOpen((prev) => !prev)}
          aria-expanded={chatOpen}
          style={{
            background: 'linear-gradient(135deg, #0F766E 0%, #0F172A 100%)',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 999,
            padding: '13px 20px',
            fontWeight: 700,
            fontSize: '0.92rem',
            boxShadow: '0 14px 28px rgba(15, 23, 42, 0.25)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <span>✦ AI Skill Assistant</span>
        </button>
      </div>

      {/* Toast Notifications */}
      <div className="toast-container" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast-msg">
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
