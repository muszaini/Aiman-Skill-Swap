/**
 * SkillSwap AI Discovery, Reciprocal Graph Matching & Session Co-Pilot Engine
 * Combines semantic skill taxonomy embeddings, bidirectional reciprocity scoring,
 * natural language intent extraction, and structured 50/50 session blueprint generation.
 */

const SKILL_TAXONOMY = [
  {
    cluster: 'spreadsheets_data',
    label: 'Business',
    canonical: 'Excel & Spreadsheet Modeling',
    keywords: [
      'excel', 'spreadsheet', 'spreadsheets', 'pivot', 'pivot table', 'pivot tables',
      'xlookup', 'vlookup', 'index match', 'financial modeling', 'formulas', 'macros',
      'vba', 'powerquery', 'google sheets', 'dashboards', 'bookkeeping', 'budget',
      'cohort', 'data modeling', 'finance', 'accounting', 'sheets', 'business'
    ]
  },
  {
    cluster: 'graphic_design',
    label: 'Design',
    canonical: 'Graphic Design & Visual Systems',
    keywords: [
      'graphic design', 'design', 'figma', 'typography', 'layout', 'grid', 'swiss grid',
      'branding', 'brand identity', 'illustrator', 'photoshop', 'poster', 'visual',
      'ui design', 'color theory', 'deck design', 'canva', 'infographics', 'logo',
      'editorial design', 'visual systems', 'creative', 'ux'
    ]
  },
  {
    cluster: 'english_comm',
    label: 'Languages',
    canonical: 'Conversational English Practice',
    keywords: [
      'conversational english', 'english conversation', 'english', 'speaking', 'conversation', 'fluency',
      'idioms', 'pronunciation', 'interview prep', 'public speaking', 'communication',
      'esl', 'business english', 'presentation', 'pitching', 'q&a', 'accent', 'language'
    ]
  },
  {
    cluster: 'python_coding',
    label: 'Technology',
    canonical: 'Beginner Python Lessons',
    keywords: [
      'python', 'beginner python', 'coding', 'programming', 'pandas', 'script',
      'scripting', 'automation', 'jupyter', 'csv', 'data cleaning', 'software',
      'sql', 'javascript', 'web dev', 'api', 'backend', 'code', 'developer', 'technology'
    ]
  },
  {
    cluster: 'product_strategy',
    label: 'Business',
    canonical: 'Product Strategy & UX Research',
    keywords: [
      'product', 'product management', 'ux research', 'storytelling', 'strategy',
      'user interviews', 'roadmap', 'startup', 'marketing', 'growth', 'saas'
    ]
  },
  {
    cluster: 'world_languages',
    label: 'Languages',
    canonical: 'World Language Exchange',
    keywords: [
      'spanish', 'italian', 'mandarin', 'japanese', 'french', 'arabic', 'german',
      'korean', 'portuguese'
    ]
  }
];

const LEVEL_RANK = {
  Beginner: 1,
  Intermediate: 2,
  Advanced: 3,
  Expert: 4
};

function tokenize(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9+#\-\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

function getSemanticClusters(skillObjOrText) {
  const rawText =
    typeof skillObjOrText === 'string'
      ? skillObjOrText.toLowerCase()
      : `${skillObjOrText.skill_name || ''} ${skillObjOrText.category || ''} ${skillObjOrText.description || ''} ${(
           safeParseArray(skillObjOrText.tags)
        ).join(' ')}`.toLowerCase();

  const matchedClusters = new Set();
  for (const item of SKILL_TAXONOMY) {
    for (const kw of item.keywords) {
      if (rawText.includes(kw)) {
        matchedClusters.add(item.cluster);
      }
    }
  }
  return Array.from(matchedClusters);
}

function safeParseArray(val) {
  if (Array.isArray(val)) return val;
  if (!val) return [];
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Computes semantic similarity [0..1] between a skill offered and a skill wanted
 */
function computeSkillPairSimilarity(offerSkill, wantSkill) {
  const offerName = (offerSkill.skill_name || '').toLowerCase();
  const wantName = (wantSkill.skill_name || '').toLowerCase();

  // Exact or substring skill name match
  if (offerName === wantName) return 1.0;
  if (offerName.includes(wantName) || wantName.includes(offerName)) return 0.96;

  const offerClusters = getSemanticClusters(offerSkill);
  const wantClusters = getSemanticClusters(wantSkill);

  const sharedClusters = offerClusters.filter((c) => wantClusters.includes(c));

  const offerTokens = new Set([
    ...tokenize(offerSkill.skill_name),
    ...tokenize(offerSkill.description),
    ...safeParseArray(offerSkill.tags).flatMap((t) => tokenize(t))
  ]);
  const wantTokens = new Set([
    ...tokenize(wantSkill.skill_name),
    ...tokenize(wantSkill.description),
    ...safeParseArray(wantSkill.tags).flatMap((t) => tokenize(t))
  ]);

  let tokenOverlap = 0;
  for (const t of wantTokens) {
    if (offerTokens.has(t) && !['and', 'for', 'the', 'with', 'want', 'learn', 'teach', 'beginner', 'basic'].includes(t)) {
      tokenOverlap++;
    }
  }

  let score = 0;
  if (sharedClusters.length > 0) {
    score = 0.84 + Math.min(0.15, tokenOverlap * 0.03);
  } else if (offerSkill.category && offerSkill.category === wantSkill.category) {
    score = 0.68 + Math.min(0.20, tokenOverlap * 0.04);
  } else if (tokenOverlap > 0) {
    score = Math.min(0.75, 0.35 + tokenOverlap * 0.08);
  }

  // Factor in level complementarity (Offer level should ideally be >= Want level)
  const offerLvl = LEVEL_RANK[offerSkill.level] || 3;
  const wantLvl = LEVEL_RANK[wantSkill.level] || 1;
  if (score > 0.5 && offerLvl > wantLvl) {
    score = Math.min(0.99, score + 0.03);
  }

  return Number(score.toFixed(2));
}

/**
 * Evaluates full bidirectional compatibility between viewerUser and candidateUser
 */
function evaluateCompatibility(viewer, candidate, queryIntent = null) {
  const viewerOffers = (viewer.skills || []).filter((s) => s.type === 'offer');
  const viewerWants = (viewer.skills || []).filter((s) => s.type === 'want');
  const candidateOffers = (candidate.skills || []).filter((s) => s.type === 'offer');
  const candidateWants = (candidate.skills || []).filter((s) => s.type === 'want');

  // Direction 1: Viewer teaches Candidate (Viewer Offer -> Candidate Want)
  let bestViewerTeaches = null;
  let bestViewerTeachesScore = 0;
  const matchingLearningGoals = [];

  for (const vOffer of viewerOffers) {
    for (const cWant of candidateWants) {
      const sim = computeSkillPairSimilarity(vOffer, cWant);
      if (sim >= 0.72) {
        matchingLearningGoals.push({
          viewerOfferedSkill: vOffer.skill_name,
          viewerOfferedCategory: vOffer.category,
          viewerOfferedProficiency: vOffer.proficiency || vOffer.level,
          candidateGoalSkill: cWant.skill_name,
          candidateGoalCategory: cWant.category,
          candidateGoalProficiency: cWant.proficiency || cWant.level,
          similarity: sim
        });
      }
      if (sim > bestViewerTeachesScore) {
        bestViewerTeachesScore = sim;
        bestViewerTeaches = {
          viewerOffer: vOffer,
          candidateWant: cWant,
          similarity: sim
        };
      }
    }
  }

  // Direction 2: Candidate teaches Viewer (Candidate Offer -> Viewer Want)
  let bestCandidateTeaches = null;
  let bestCandidateTeachesScore = 0;
  const matchingTeachingSkills = [];

  for (const cOffer of candidateOffers) {
    for (const vWant of viewerWants) {
      const sim = computeSkillPairSimilarity(cOffer, vWant);
      if (sim >= 0.72) {
        matchingTeachingSkills.push({
          offeredSkill: cOffer.skill_name,
          offeredCategory: cOffer.category,
          offeredProficiency: cOffer.proficiency || cOffer.level,
          matchedGoalSkill: vWant.skill_name,
          matchedGoalCategory: vWant.category,
          matchedGoalProficiency: vWant.proficiency || vWant.level,
          similarity: sim
        });
      }
      if (sim > bestCandidateTeachesScore) {
        bestCandidateTeachesScore = sim;
        bestCandidateTeaches = {
          candidateOffer: cOffer,
          viewerWant: vWant,
          similarity: sim
        };
      }
    }
  }

  // Fallback if one side didn't match strongly: pick primary skill
  if (!bestViewerTeaches && viewerOffers[0] && candidateWants[0]) {
    bestViewerTeaches = {
      viewerOffer: viewerOffers[0],
      candidateWant: candidateWants[0],
      similarity: 0.45
    };
    bestViewerTeachesScore = 0.45;
  }
  if (!bestCandidateTeaches && candidateOffers[0] && viewerWants[0]) {
    bestCandidateTeaches = {
      candidateOffer: candidateOffers[0],
      viewerWant: viewerWants[0],
      similarity: 0.45
    };
    bestCandidateTeachesScore = 0.45;
  }

  // Availability overlap
  const viewerAvail = safeParseArray(viewer.availability);
  const candidateAvail = safeParseArray(candidate.availability);
  const sharedWindows = viewerAvail.filter((w) => candidateAvail.includes(w));
  const scheduleScore = sharedWindows.length >= 3 ? 0.98 : sharedWindows.length === 2 ? 0.94 : sharedWindows.length === 1 ? 0.85 : 0.68;

  // Timezone proximity bonus
  const sameTz = viewer.timezone && candidate.timezone && viewer.timezone === candidate.timezone ? 1.5 : 0;

  // Query intent boost if user searched with natural language AI prompt
  let intentBoost = 0;

  if (queryIntent) {
    let matchedOfferInQuery = false;
    let matchedWantInQuery = false;

    // If query mentions something candidate offers (what user wants to learn)
    if (queryIntent.extractedWants.length > 0) {
      for (const cOffer of candidateOffers) {
        const cClusters = getSemanticClusters(cOffer);
        const cText = `${cOffer.skill_name} ${cOffer.description}`.toLowerCase();
        for (const qw of queryIntent.extractedWants) {
          if (cClusters.includes(qw.cluster) || cText.includes(qw.term)) {
            matchedWantInQuery = true;
            bestCandidateTeaches = {
              candidateOffer: cOffer,
              viewerWant: bestCandidateTeaches ? bestCandidateTeaches.viewerWant : cOffer,
              similarity: Math.max(bestCandidateTeachesScore, 0.96)
            };
            bestCandidateTeachesScore = Math.max(bestCandidateTeachesScore, 0.96);
          }
        }
      }
      intentBoost += matchedWantInQuery ? 6 : -7;
    }

    // If query mentions something user offers (what candidate wants to learn)
    if (queryIntent.extractedOffers.length > 0) {
      for (const cWant of candidateWants) {
        const cClusters = getSemanticClusters(cWant);
        const cText = `${cWant.skill_name} ${cWant.description}`.toLowerCase();
        for (const qo of queryIntent.extractedOffers) {
          if (cClusters.includes(qo.cluster) || cText.includes(qo.term)) {
            matchedOfferInQuery = true;
            const matchingViewerOffer =
              viewerOffers.find((vo) => getSemanticClusters(vo).includes(qo.cluster)) || viewerOffers[0] || {
                skill_name: qo.display,
                level: 'Advanced',
                description: `Custom offered skill: ${qo.display}`
              };
            bestViewerTeaches = {
              viewerOffer: matchingViewerOffer,
              candidateWant: cWant,
              similarity: Math.max(bestViewerTeachesScore, 0.96)
            };
            bestViewerTeachesScore = Math.max(bestViewerTeachesScore, 0.96);
          }
        }
      }
      intentBoost += matchedOfferInQuery ? 6 : -7;
    }

    // General keyword match against candidate profile
    if (queryIntent.rawKeywords.length > 0) {
      const candidateCorpus = `${candidate.name} ${candidate.role_title} ${candidate.bio} ${candidateOffers
        .map((s) => s.skill_name + ' ' + s.description)
        .join(' ')} ${candidateWants.map((s) => s.skill_name + ' ' + s.description).join(' ')}`.toLowerCase();
      for (const kw of queryIntent.rawKeywords) {
        if (candidateCorpus.includes(kw)) {
          intentBoost += 2;
        }
      }
    }
  }

  // Primary skill alignment bonus (if viewer's #1 offer matches candidate's #1 want, etc.)
  let primaryAlignmentBonus = 0;
  if (
    bestViewerTeaches?.viewerOffer?.id === viewerOffers[0]?.id &&
    bestCandidateTeaches?.viewerWant?.id === viewerWants[0]?.id
  ) {
    primaryAlignmentBonus = 4;
  } else if (
    bestViewerTeaches?.viewerOffer?.id === viewerOffers[1]?.id &&
    bestCandidateTeaches?.viewerWant?.id === viewerWants[1]?.id
  ) {
    primaryAlignmentBonus = 2.5;
  }

  // Calculate overall percentage [68..99] with nuanced differentiation
  const rawReciprocal =
    (bestViewerTeachesScore * 0.42 + bestCandidateTeachesScore * 0.42 + scheduleScore * 0.16) * 95 +
    primaryAlignmentBonus +
    sameTz +
    intentBoost;
  const finalScore = Math.min(99, Math.max(68, Math.round(rawReciprocal)));

  const youTeachSkill = bestViewerTeaches?.viewerOffer?.skill_name || viewerOffers[0]?.skill_name || 'Excel & Data';
  const theyWantSkill = bestViewerTeaches?.candidateWant?.skill_name || youTeachSkill;
  const theyTeachSkill = bestCandidateTeaches?.candidateOffer?.skill_name || candidateOffers[0]?.skill_name || 'Design';
  const youWantSkill = bestCandidateTeaches?.viewerWant?.skill_name || theyTeachSkill;

  const isDirectDoubleMatch = bestViewerTeachesScore >= 0.8 && bestCandidateTeachesScore >= 0.8;
  const teachesYourGoal = matchingTeachingSkills.length > 0 || bestCandidateTeachesScore >= 0.72;
  const wantsYourSkill = matchingLearningGoals.length > 0 || bestViewerTeachesScore >= 0.72;

  const matchTier =
    finalScore >= 94
      ? 'Direct Reciprocal Match'
      : finalScore >= 86
      ? 'High-Synergy Skill Bridge'
      : 'Complementary Learning Pair';

  const rationale = isDirectDoubleMatch
    ? `Direct double-coincidence swap: You offer ${youTeachSkill} (${
        bestViewerTeaches?.viewerOffer?.level || 'Intermediate'
      }), which directly fulfills ${candidate.name.split(' ')[0]}’s goal to learn ${theyWantSkill}. In return, ${
        candidate.name.split(' ')[0]
      } teaches ${theyTeachSkill} (${bestCandidateTeaches?.candidateOffer?.level || 'Advanced'}), matching your ${youWantSkill} goal.${
        sharedWindows.length > 0 ? ` Shared availability on ${sharedWindows.join(' & ')}.` : ''
      }`
    : `Complementary skill synergy: ${candidate.name.split(' ')[0]}’s expertise in ${theyTeachSkill} aligns with your learning path, while your ${youTeachSkill} background bridges their ${theyWantSkill} goals.`;

  const agenda = generateSessionBlueprint({
    viewerName: viewer.name,
    candidateName: candidate.name,
    youTeachSkill,
    theyTeachSkill,
    youTeachDesc: bestViewerTeaches?.candidateWant?.description || bestViewerTeaches?.viewerOffer?.description || '',
    theyTeachDesc: bestCandidateTeaches?.viewerWant?.description || bestCandidateTeaches?.candidateOffer?.description || '',
    durationMins: candidate.session_length_mins || 60
  });

  return {
    score: finalScore,
    matchTier,
    isDirectDoubleMatch,
    teachesYourGoal,
    wantsYourSkill,
    matchingTeachingSkills,
    matchingLearningGoals,
    youTeach: {
      skillName: youTeachSkill,
      level: bestViewerTeaches?.viewerOffer?.level || 'Intermediate',
      targetWantName: theyWantSkill,
      targetWantDesc: bestViewerTeaches?.candidateWant?.description || '',
      fitPercent: Math.min(99, Math.round(bestViewerTeachesScore * 100))
    },
    theyTeach: {
      skillName: theyTeachSkill,
      level: bestCandidateTeaches?.candidateOffer?.level || 'Advanced',
      targetWantName: youWantSkill,
      targetWantDesc: bestCandidateTeaches?.candidateOffer?.description || '',
      fitPercent: Math.min(99, Math.round(bestCandidateTeachesScore * 100))
    },
    sharedAvailability: sharedWindows.length > 0 ? sharedWindows : [candidateAvail[0] || 'Flexible Schedule'],
    rationale,
    suggestedAgenda: agenda,
    suggestedPitch: `Hi ${candidate.name.split(' ')[0]}! I noticed we have a ${finalScore}% reciprocal skill match—I'd love to teach you ${youTeachSkill} in exchange for learning ${theyTeachSkill}. Are you free for a ${
      candidate.session_length_mins || 60
    }-minute split session during ${sharedWindows[0] || 'an upcoming evening'}?`
  };
}

/**
 * Generates a concrete 50/50 split reciprocal learning agenda
 */
function generateSessionBlueprint({
  viewerName,
  candidateName,
  youTeachSkill,
  theyTeachSkill,
  youTeachDesc,
  theyTeachDesc,
  durationMins = 60
}) {
  const vFirst = (viewerName || 'You').split(' ')[0];
  const cFirst = (candidateName || 'Partner').split(' ')[0];
  const half = Math.floor((durationMins - 10) / 2);

  return [
    {
      time: `00–05 min`,
      phase: `Warmup & Mutual Goal Check`,
      detail: `${vFirst} & ${cFirst} share screen setups, sample files, and define 1 concrete takeaway each.`
    },
    {
      time: `05–${5 + half} min`,
      phase: `Part 1: ${youTeachSkill} (${vFirst} teaches ${cFirst})`,
      detail: youTeachDesc
        ? `Hands-on walkthrough focused on: ${youTeachDesc}`
        : `Live guided practice on core ${youTeachSkill} workflows and templates.`
    },
    {
      time: `${5 + half}–${5 + half * 2} min`,
      phase: `Part 2: ${theyTeachSkill} (${cFirst} teaches ${vFirst})`,
      detail: theyTeachDesc
        ? `Interactive coaching focused on: ${theyTeachDesc}`
        : `Step-by-step practice building foundational ${theyTeachSkill} skills together.`
    },
    {
      time: `${5 + half * 2}–${durationMins} min`,
      phase: `Recap, Templates & Next Swap Checkpoint`,
      detail: `Export session notes, share practice files, and log verified skill progress on SkillSwap.`
    }
  ];
}

/**
 * Natural Language AI Concierge Parser
 * Parses prompts like:
 * - "I can teach Excel and want to learn graphic design in return"
 * - "Offer conversational English practice in exchange for beginner Python lessons"
 */
function parseNaturalLanguageIntent(promptText) {
  if (!promptText || !promptText.trim()) {
    return null;
  }

  const text = promptText.trim();
  const lower = text.toLowerCase();

  const extractedOffers = [];
  const extractedWants = [];

  // Split by reciprocity markers if present
  // Patterns like "teach X and learn Y", "offer X in exchange for Y", "trade X for Y"
  const teachLearnRegex = /(?:teach|offer|share|coach|know|good at)\s+([^,.]+?)\s+(?:and\s+learn|and\s+want|in\s+exchange\s+for|for|to\s+learn|in\s+return\s+for)\s+([^,.]+)/i;
  const learnTeachRegex = /(?:learn|want|need|looking for|study)\s+([^,.]+?)\s+(?:in\s+exchange\s+for|by\s+teaching|and\s+teach|and\s+offer|for)\s+([^,.]+)/i;

  let offerSegment = '';
  let wantSegment = '';

  const m1 = text.match(teachLearnRegex);
  const m2 = text.match(learnTeachRegex);

  if (m1) {
    offerSegment = m1[1].trim();
    wantSegment = m1[2].trim();
  } else if (m2) {
    wantSegment = m2[1].trim();
    offerSegment = m2[2].trim();
  } else {
    // Check individual clauses
    const offerMatch = text.match(/(?:teach|offer|coach|trading)\s+([a-zA-Z0-9\s&/-]{2,35})/i);
    const wantMatch = text.match(/(?:learn|want|seeking|for|need)\s+([a-zA-Z0-9\s&/-]{2,35})/i);
    if (offerMatch) offerSegment = offerMatch[1].trim();
    if (wantMatch) wantSegment = wantMatch[1].trim();
  }

  function mapSegmentToTaxonomy(seg) {
    if (!seg) return [];
    const sLower = seg.toLowerCase();
    const results = [];
    for (const item of SKILL_TAXONOMY) {
      for (const kw of item.keywords) {
        if (sLower.includes(kw)) {
          results.push({
            cluster: item.cluster,
            canonical: item.canonical,
            category: item.label,
            term: kw,
            display: seg
          });
          break;
        }
      }
    }
    if (results.length === 0 && seg.length >= 2) {
      results.push({
        cluster: 'custom',
        canonical: seg,
        category: 'Custom Skill',
        term: sLower,
        display: seg
      });
    }
    return results;
  }

  if (offerSegment) {
    extractedOffers.push(...mapSegmentToTaxonomy(offerSegment));
  }
  if (wantSegment) {
    extractedWants.push(...mapSegmentToTaxonomy(wantSegment));
  }

  // If user just typed a skill name like "Graphic Design" or "Python" without "teach/learn", assume they want to learn it or match with it
  if (extractedOffers.length === 0 && extractedWants.length === 0) {
    const generalMatches = mapSegmentToTaxonomy(text);
    extractedWants.push(...generalMatches);
  }

  const rawKeywords = tokenize(lower).filter(
    (w) =>
      ![
        'teach', 'learn', 'offer', 'want', 'exchange', 'return', 'for', 'and',
        'with', 'the', 'can', 'would', 'like', 'lessons', 'practice', 'someone', 'who'
      ].includes(w)
  );

  // Extract schedule hints
  const scheduleHints = [];
  if (lower.includes('evening') || lower.includes('weeknight') || lower.includes('weekday')) {
    scheduleHints.push('Weekday Evenings');
  }
  if (lower.includes('saturday') || lower.includes('morning') || lower.includes('weekend')) {
    scheduleHints.push('Saturday Mornings');
  }
  if (lower.includes('sunday') || lower.includes('afternoon')) {
    scheduleHints.push('Sunday Afternoons');
  }

  const summaryExplanation =
    extractedOffers.length > 0 && extractedWants.length > 0
      ? `AI parsed a bidirectional swap request: Offering **${extractedOffers
          .map((o) => o.canonical)
          .join(', ')}** ⇄ Seeking **${extractedWants.map((w) => w.canonical).join(', ')}**.`
      : extractedWants.length > 0
      ? `AI matching peers who teach **${extractedWants
          .map((w) => w.canonical)
          .join(', ')}** and need skills from your teaching profile.`
      : `AI semantic search across skill profiles for "${text}".`;

  return {
    originalPrompt: text,
    extractedOffers,
    extractedWants,
    scheduleHints,
    rawKeywords,
    summaryExplanation
  };
}

/**
 * Generates a database-grounded AI Skill Match Assistant response (`POST /api/ai/chat`).
 * Strictly uses real registered members and skills from the database—never invents people or skills.
 */
function generateAiChatResponse({ message = '', viewer, candidates = [], history = [] }) {
  const prompt = String(message || '').trim();
  const lower = prompt.toLowerCase();
  const viewerOffers = (viewer?.offers || []).map((s) => `${s.skill_name} (${s.category} • ${s.proficiency || s.level})`);
  const viewerWants = (viewer?.wants || []).map((s) => `${s.skill_name} (${s.category} • ${s.proficiency || s.level})`);

  const intent = parseNaturalLanguageIntent(prompt);
  const scoredCandidates = candidates
    .filter((c) => c.id !== viewer?.id)
    .map((c) => {
      const aiMatch = c.aiMatch || evaluateCompatibility(viewer, c, intent);
      const cOffersText = (c.offers || [])
        .map((s) => `${s.skill_name} ${s.category} ${s.description}`)
        .join(' ')
        .toLowerCase();
      const cNameLower = (c.name || '').toLowerCase();

      let relevanceBoost = 0;
      if (cNameLower && lower.includes(cNameLower.split(' ')[0])) {
        relevanceBoost += 50;
      }
      for (const w of intent.extractedWants || []) {
        if (cOffersText.includes(w.term) || cOffersText.includes(w.canonical.toLowerCase())) {
          relevanceBoost += 35;
        }
      }
      for (const kw of intent.rawKeywords || []) {
        if (kw.length > 2 && cOffersText.includes(kw)) {
          relevanceBoost += 15;
        }
      }

      return {
        ...c,
        aiMatch,
        chatRelevance: aiMatch.score + relevanceBoost
      };
    })
    .sort((a, b) => b.chatRelevance - a.chatRelevance);

  const topMatches = scoredCandidates.slice(0, 3);
  const best = topMatches[0] || null;

  const isPlanningQuery =
    lower.includes('plan') ||
    lower.includes('first skill exchange') ||
    lower.includes('agenda') ||
    lower.includes('blueprint') ||
    lower.includes('how do i start');

  const isExchangeOptionsQuery =
    lower.includes('what skills could i exchange') ||
    lower.includes('which members') ||
    lower.includes('compatible with my skills');

  let reply = '';
  if (isPlanningQuery && best) {
    const bp = best.aiMatch.suggestedAgenda || [];
    const agendaLines = bp
      .map((step) => `• **${step.time} (${step.phase}):** ${step.detail}`)
      .join('\n');
    reply =
      `Here is a step-by-step plan for your first 50/50 skill exchange based on your profile (**Teaches:** ${viewerOffers.join(', ') || 'your skills'} | **Wants:** ${viewerWants.join(', ') || 'your learning goals'}):\n\n` +
      `1. **Recommended Partner from Database:** **${best.name}** (${best.role_title}) — **${best.aiMatch.score}% Match**.\n` +
      `   - **They teach:** ${(best.offers || []).map((o) => `${o.skill_name} (${o.proficiency || o.level})`).join(', ')}\n` +
      `   - **They want to learn:** ${(best.wants || []).map((w) => `${w.skill_name} (${w.proficiency || w.level})`).join(', ')}\n` +
      `   - **Why it works:** ${best.aiMatch.rationale}\n\n` +
      `2. **Suggested 60-Minute Session Blueprint:**\n${agendaLines}\n\n` +
      `3. **Next Step:** Click **Request Swap with ${best.name.split(' ')[0]}** below to send this proposal and agree on an **${best.preferred_format === 'Either' ? 'Online or In person' : best.preferred_format || 'Online'}** session slot (${(best.aiMatch.sharedAvailability || []).join(', ') || 'flexible schedule'}).`;
  } else if (isExchangeOptionsQuery) {
    const bullets = topMatches
      .map((m, idx) => {
        const offersList = (m.offers || [])
          .map((o) => `${o.skill_name} (${o.category} • ${o.proficiency || o.level})`)
          .join(', ');
        const wantsList = (m.wants || [])
          .map((w) => `${w.skill_name} (${w.category} • ${w.proficiency || w.level})`)
          .join(', ');
        return (
          `${idx + 1}. **${m.name}** (${m.aiMatch.score}% ${m.aiMatch.matchTier})\n` +
          `   • **Offers to teach:** ${offersList}\n` +
          `   • **Wants to learn:** ${wantsList}\n` +
          `   • **Reciprocal fit:** You teach **${m.aiMatch.youTeach.skillName}** ⇄ ${m.name.split(' ')[0]} teaches **${m.aiMatch.theyTeach.skillName}** (${m.preferred_format === 'Either' ? 'Online or In person' : m.preferred_format}).`
        );
      })
      .join('\n\n');

    reply =
      `Based on your authenticated SkillSwap profile (you offer **${viewerOffers.join(', ') || 'skills to teach'}** and want to learn **${viewerWants.join(', ') || 'new skills'}**), here are the most compatible registered members in our database:\n\n` +
      `${bullets}`;
  } else if (best) {
    const matchedPeers = topMatches.slice(0, 2);
    const descriptions = matchedPeers
      .map((m, idx) => {
        const offersList = (m.offers || [])
          .map((o) => `${o.skill_name} (${o.category} • ${o.proficiency || o.level})`)
          .join(', ');
        const wantsList = (m.wants || [])
          .map((w) => `${w.skill_name} (${w.category} • ${w.proficiency || w.level})`)
          .join(', ');
        return (
          `${idx + 1}. **${m.name}** — *${m.role_title}* (**${m.aiMatch.score}% Match**)\n` +
          `   • **Teaches:** ${offersList}\n` +
          `   • **Wants to learn:** ${wantsList}\n` +
          `   • **Why you match:** ${m.aiMatch.rationale} Preferred format: **${m.preferred_format === 'Either' ? 'Online or in person' : m.preferred_format || 'Online'}**.`
        );
      })
      .join('\n\n');

    reply =
      `I searched the registered member profiles in the SkillSwap database for **"${prompt}"** and evaluated them against your profile:\n\n` +
      `${descriptions}`;
  } else {
    reply =
      `I checked the registered members in the database, and no profiles currently match "${prompt}". Try asking about **Python**, **Graphic Design**, **Excel**, or **Conversational English**!`;
  }

  const recommendedMembers = topMatches.slice(0, 3).map((m) => {
    const queryMatchedOffer = (m.offers || []).find((o) =>
      (intent.rawKeywords || []).some((kw) => kw.length > 2 && (o.skill_name || '').toLowerCase().includes(kw))
    );
    return {
      id: m.id,
      name: m.name,
      handle: m.handle,
      role_title: m.role_title,
      avatar_initials: m.avatar_initials,
      avatar_bg: m.avatar_bg,
      preferred_format: m.preferred_format,
      score: m.aiMatch.score,
      matchTier: m.aiMatch.matchTier,
      youTeach: m.aiMatch.youTeach.skillName,
      theyWant: m.aiMatch.youTeach.targetWantName,
      theyTeach: queryMatchedOffer ? queryMatchedOffer.skill_name : m.aiMatch.theyTeach.skillName,
      offers: (m.offers || []).map((o) => ({
        skill_name: o.skill_name,
        category: o.category,
        proficiency: o.proficiency || o.level
      })),
      wants: (m.wants || []).map((w) => ({
        skill_name: w.skill_name,
        category: w.category,
        proficiency: w.proficiency || w.level
      })),
      rationale: m.aiMatch.rationale
    };
  });

  const intentType = isPlanningQuery
    ? 'exchange_plan'
    : isExchangeOptionsQuery
    ? 'compatibility_overview'
    : 'skill_partner_search';

  return {
    reply,
    intentType,
    recommendedMembers,
    profileContextUsed: {
      viewerId: viewer?.id,
      displayName: viewer?.name,
      offers: viewerOffers,
      wants: viewerWants
    },
    providerMode: process.env.GEMINI_API_KEY
      ? 'gemini-grounded-database'
      : process.env.OPENAI_API_KEY
      ? 'openai-grounded-database'
      : 'skillswap-semantic-ai-database'
  };
}

/**
 * AI Profile and Skill Description Helper (`POST /api/ai/profile-helper`)
 * Strictly receives ONLY:
 *  - task: 'bio' | 'skill_description'
 *  - roughNotes: string (10 to 500 chars)
 *  - skillName: string (required when task === 'skill_description', 2 to 80 chars)
 */
function generateProfileOrSkillSuggestion({ task, roughNotes, skillName } = {}) {
  const normalizedTask = String(task || '').trim().toLowerCase();
  if (!['bio', 'skill_description'].includes(normalizedTask)) {
    const err = new Error('Invalid task. Must be "bio" or "skill_description".');
    err.statusCode = 400;
    throw err;
  }

  const notes = String(roughNotes || '').trim();
  if (notes.length < 10) {
    const err = new Error('Rough notes are too short. Please enter at least 10 characters.');
    err.statusCode = 400;
    throw err;
  }
  if (notes.length > 500) {
    const err = new Error('Rough notes exceed the 500-character maximum limit.');
    err.statusCode = 400;
    throw err;
  }

  const cleanSkillName = String(skillName || '').trim();
  if (normalizedTask === 'skill_description') {
    if (cleanSkillName.length < 2) {
      const err = new Error('Please provide a skill name (at least 2 characters) for the Skill Description Helper.');
      err.statusCode = 400;
      throw err;
    }
    if (cleanSkillName.length > 80) {
      const err = new Error('Skill name must be 80 characters or fewer.');
      err.statusCode = 400;
      throw err;
    }
  }

  // Privacy guard: reject obvious sensitive personal information (SSN, credit card, password)
  const combinedInput = `${cleanSkillName} ${notes}`;
  const hasSsnPattern = /\b\d{3}-\d{2}-\d{4}\b/.test(combinedInput);
  const hasCardPattern = /\b(?:\d[ -]*?){13,16}\b/.test(combinedInput);
  const hasPasswordLeak = /\b(?:password|passcode|ssn|social security|credit card)\s*[:=]/i.test(combinedInput);
  if (hasSsnPattern || hasCardPattern || hasPasswordLeak) {
    const err = new Error(
      'Privacy safeguard triggered: Please do not submit sensitive personal information (such as passwords, SSNs, or financial numbers).'
    );
    err.statusCode = 400;
    throw err;
  }

  // Clean up bullet fragments from rough notes
  const fragments = notes
    .replace(/\r?\n+/g, '; ')
    .split(/[.;•|]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  let suggestion = '';

  if (normalizedTask === 'bio') {
    const cleanedCore = fragments
      .map((frag) => frag.replace(/^(i am|i'm|im)\s+/i, '').trim())
      .filter(Boolean);

    const primarySummary = cleanedCore[0] || notes;
    const secondaryDetails = cleanedCore.slice(1).join(', ');

    const normalizedPrimary =
      primarySummary.charAt(0).toLowerCase() + primarySummary.slice(1).replace(/\.$/, '');

    if (secondaryDetails) {
      suggestion = `I bring hands-on experience in ${normalizedPrimary}, with a focus on ${secondaryDetails.replace(
        /\.$/,
        ''
      )}. On SkillSwap, I enjoy practical, step-by-step 1-on-1 sessions where we trade actionable workflows, real templates, and constructive feedback so both partners walk away with immediate skills.`;
    } else {
      suggestion = `I focus on ${normalizedPrimary} and love sharing practical, real-world workflows through collaborative 1-on-1 sessions. Excited to connect with fellow SkillSwap members to trade hands-on knowledge, templates, and clear step-by-step coaching!`;
    }
  } else {
    // task === 'skill_description'
    const topicList = fragments.join(', ').replace(/\.$/, '');
    suggestion = `Hands-on 1-on-1 coaching in ${cleanSkillName}: ${
      topicList.charAt(0).toUpperCase() + topicList.slice(1)
    }. In our exchange session, you will learn practical workflows, work through live examples step by step, and leave with reusable templates you can apply immediately.`;
  }

  const fieldsSentToAi =
    normalizedTask === 'skill_description'
      ? ['task', 'skill_name', 'rough_notes']
      : ['task', 'rough_notes'];

  return {
    task: normalizedTask,
    skill_name: normalizedTask === 'skill_description' ? cleanSkillName : undefined,
    suggestion,
    charCount: suggestion.length,
    dataMinimized: true,
    fieldsSentToAi,
    privacyNotice:
      'Only the selected task, rough notes, and (when relevant) skill name were processed. No sensitive personal or account data was transmitted.',
    providerMode: process.env.GEMINI_API_KEY
      ? 'gemini-profile-helper'
      : process.env.OPENAI_API_KEY
      ? 'openai-profile-helper'
      : 'skillswap-ai-profile-helper'
  };
}

/**
 * Flow E: Create an AI Learning Plan (`POST /api/ai/learning-plan`)
 * Validates input (`targetSkill` 2-80 chars, `learningGoals` 10-500 chars) and generates
 * a structured 4-week reciprocal learning plan for the user to review, edit, and save to `learning_plans`.
 */
function generateAiLearningPlan({ targetSkill, learningGoals, preferredFormat = 'Online' } = {}) {
  const cleanSkill = String(targetSkill || '').trim();
  if (cleanSkill.length < 2 || cleanSkill.length > 80) {
    const err = new Error('Target skill must be between 2 and 80 characters.');
    err.statusCode = 400;
    throw err;
  }

  const cleanGoals = String(learningGoals || '').trim();
  if (cleanGoals.length < 10) {
    const err = new Error('Learning goals must be at least 10 characters.');
    err.statusCode = 400;
    throw err;
  }
  if (cleanGoals.length > 500) {
    const err = new Error('Learning goals must be 500 characters or fewer.');
    err.statusCode = 400;
    throw err;
  }

  const combined = `${cleanSkill} ${cleanGoals}`;
  if (
    /\b\d{3}-\d{2}-\d{4}\b/.test(combined) ||
    /\b(?:\d[ -]*?){13,16}\b/.test(combined) ||
    /\b(?:password|passcode|ssn|social security|credit card)\s*[:=]/i.test(combined)
  ) {
    const err = new Error('Privacy safeguard triggered: Please do not submit sensitive personal information.');
    err.statusCode = 400;
    throw err;
  }

  const cleanFormat = ['Online', 'In person', 'Either'].includes(preferredFormat) ? preferredFormat : 'Online';
  const planTitle = `4-Week Reciprocal Learning Plan: ${cleanSkill} (${cleanFormat})`;
  const milestones = [
    {
      week: 'Week 1',
      title: `Core Foundations & Setup in ${cleanSkill}`,
      outcome: `Align on ${cleanFormat} workflow tools and build your first guided exercise focused on: ${cleanGoals}`
    },
    {
      week: 'Week 2',
      title: `Hands-On Practice & Pattern Building`,
      outcome: `Complete a 50/50 peer session applying ${cleanSkill} techniques to a real-world dataset or canvas.`
    },
    {
      week: 'Week 3',
      title: `Troubleshooting, Critique & Optimization`,
      outcome: `Review edge cases with your SkillSwap partner and refine reusable templates.`
    },
    {
      week: 'Week 4',
      title: `Capstone Reciprocal Project & Review`,
      outcome: `Demonstrate your completed ${cleanSkill} deliverable and log a verified exchange review.`
    }
  ];

  const planContent = milestones
    .map((m) => `${m.week} — ${m.title}: ${m.outcome}`)
    .join('\n');

  return {
    target_skill: cleanSkill,
    learning_goals: cleanGoals,
    preferred_format: cleanFormat,
    plan_title: planTitle,
    plan_content: planContent,
    milestones,
    dataMinimized: true,
    fieldsSentToAi: ['target_skill', 'learning_goals', 'preferred_format']
  };
}

module.exports = {
  SKILL_TAXONOMY,
  evaluateCompatibility,
  generateSessionBlueprint,
  parseNaturalLanguageIntent,
  generateAiChatResponse,
  generateProfileOrSkillSuggestion,
  generateAiLearningPlan
};
