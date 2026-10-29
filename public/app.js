/**
 * SkillSwap Frontend Application
 * Connects to persistent SQLite REST API & AI Reciprocal Matchmaking Engine
 */

const state = {
  viewerId: Number(localStorage.getItem('skillswap_viewer_id')) || 1,
  viewer: null,
  allUsers: [],
  candidates: [],
  queryIntent: null,
  requests: [],
  completedExchanges: [],
  stats: {},
  activeTab: 'discover',
  activeCategory: 'all',
  activeSearchQuery: '',
  activeRequestFilter: 'all',
  modalDraftAgenda: [],
  expandedBlueprints: new Set()
};

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(message) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast-msg';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3800);
}

async function apiRequest(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

async function loadBootstrap() {
  try {
    const params = new URLSearchParams({
      viewerId: String(state.viewerId),
      query: state.activeSearchQuery,
      category: state.activeCategory
    });
    const data = await apiRequest(`/api/bootstrap?${params.toString()}`);
    state.viewer = data.viewer;
    state.viewerId = data.viewer.id;
    localStorage.setItem('skillswap_viewer_id', String(state.viewerId));
    state.allUsers = data.allUsers || [];
    state.candidates = data.candidates || [];
    state.queryIntent = data.queryIntent || null;
    state.requests = data.requests || [];
    state.completedExchanges = data.completedExchanges || [];
    state.stats = data.stats || {};

    renderAll();
  } catch (err) {
    console.error('Bootstrap error:', err);
    showToast(`Failed to load data: ${err.message}`);
  }
}

function renderAll() {
  renderTopbar();
  renderPassportSidebar();
  renderAiIntentBanner();
  renderMatchesGrid();
  renderRequestsView();
  renderExchangesView();
  renderProfileStudio();
}

function renderTopbar() {
  const select = document.getElementById('viewerSelect');
  if (select && state.allUsers.length > 0) {
    select.innerHTML = state.allUsers
      .map(
        (u) =>
          `<option value="${u.id}" ${u.id === state.viewerId ? 'selected' : ''}>${escapeHtml(
            u.name
          )} (@${escapeHtml(u.handle)})</option>`
      )
      .join('');
  }

  const actionableRequests = state.requests.filter(
    (r) => r.status === 'pending' || r.status === 'accepted'
  );
  const reqBadge = document.getElementById('requestsBadge');
  if (reqBadge) {
    reqBadge.textContent = String(actionableRequests.length);
  }

  const exBadge = document.getElementById('exchangesBadge');
  if (exBadge) {
    exBadge.textContent = String(state.completedExchanges.length);
  }
}

function renderPassportSidebar() {
  const v = state.viewer;
  if (!v) return;

  const avatar = document.getElementById('sidebarAvatar');
  avatar.textContent = v.avatar_initials;
  avatar.style.backgroundColor = v.avatar_bg || '#0F766E';

  document.getElementById('sidebarName').textContent = v.name;
  document.getElementById('sidebarRole').textContent = v.role_title;
  document.getElementById('sidebarLocation').textContent = v.location.split(',')[0];
  document.getElementById('sidebarRating').textContent = `★ ${Number(v.rating || 5).toFixed(2)}`;
  document.getElementById('sidebarSwapsCount').textContent = String(v.completed_swaps_count || 0);
  document.getElementById('sidebarHoursCount').textContent = `${v.hours_exchanged || 0}h`;

  const offersList = document.getElementById('sidebarOffersList');
  offersList.innerHTML =
    (v.offers || [])
      .map(
        (s) => `
      <div class="mini-skill-tag offer">
        <span>${escapeHtml(s.skill_name)}</span>
        <span class="mini-skill-lvl">${escapeHtml(s.level)}</span>
      </div>
    `
      )
      .join('') || `<p class="peer-submeta">No teaching skills added yet.</p>`;

  const wantsList = document.getElementById('sidebarWantsList');
  wantsList.innerHTML =
    (v.wants || [])
      .map(
        (s) => `
      <div class="mini-skill-tag want">
        <span>${escapeHtml(s.skill_name)}</span>
        <span class="mini-skill-lvl">${escapeHtml(s.level)}</span>
      </div>
    `
      )
      .join('') || `<p class="peer-submeta">No learning goals added yet.</p>`;

  const availContainer = document.getElementById('sidebarAvailability');
  availContainer.innerHTML = (v.availability || [])
    .map((a) => `<span class="avail-chip">${escapeHtml(a)}</span>`)
    .join('');

  // Community Pulse metrics
  document.getElementById('pulseMembersCount').textContent = String(
    state.stats.communityMembers || state.allUsers.length
  );
  document.getElementById('pulseMatchesCount').textContent = String(
    state.stats.activeMatchesCount || state.candidates.length
  );
  document.getElementById('pulseHoursSaved').textContent = `${state.stats.totalHoursSaved || 56}h`;
}

function renderAiIntentBanner() {
  const banner = document.getElementById('aiIntentBanner');
  const clearBtn = document.getElementById('clearAiSearchBtn');
  if (!state.queryIntent || !state.activeSearchQuery) {
    banner.classList.add('hidden');
    clearBtn.classList.add('hidden');
    return;
  }

  clearBtn.classList.remove('hidden');
  banner.classList.remove('hidden');

  const summaryEl = document.getElementById('aiIntentSummaryText');
  const rawSummary = state.queryIntent.summaryExplanation || '';
  summaryEl.innerHTML = escapeHtml(rawSummary).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  const pillsEl = document.getElementById('aiExtractedPills');
  const offerPills = (state.queryIntent.extractedOffers || []).map(
    (o) =>
      `<span class="skill-pill-sm offer">Detected Offer: ${escapeHtml(o.canonical)}</span>`
  );
  const wantPills = (state.queryIntent.extractedWants || []).map(
    (w) =>
      `<span class="skill-pill-sm want">Detected Learning Goal: ${escapeHtml(w.canonical)}</span>`
  );
  const schedPills = (state.queryIntent.scheduleHints || []).map(
    (sh) => `<span class="avail-chip">Schedule: ${escapeHtml(sh)}</span>`
  );

  pillsEl.innerHTML = [...offerPills, ...wantPills, ...schedPills].join('');
}

function renderMatchesGrid() {
  const grid = document.getElementById('matchesGrid');
  const countText = document.getElementById('candidateCountText');

  countText.textContent = `Showing ${state.candidates.length} compatible peer${
    state.candidates.length === 1 ? '' : 's'
  } ranked by reciprocal AI synergy`;

  if (state.candidates.length === 0) {
    grid.innerHTML = `
      <div class="studio-card" style="grid-column: 1 / -1; text-align: center; padding: 40px;">
        <h3 class="studio-card-title">No peers matched that exact filter</h3>
        <p class="peer-bio" style="margin-bottom: 16px;">Try clearing your category filter or asking the AI Matchmaker a broader skill query.</p>
        <button class="btn btn-primary" id="resetFiltersEmptyBtn">Reset Discovery Filters</button>
      </div>
    `;
    const resetBtn = document.getElementById('resetFiltersEmptyBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        state.activeCategory = 'all';
        state.activeSearchQuery = '';
        document.getElementById('aiPromptInput').value = '';
        updateCategoryPillUI();
        loadBootstrap();
      });
    }
    return;
  }

  grid.innerHTML = state.candidates
    .map((c) => {
      const m = c.aiMatch;
      const isExpanded = state.expandedBlueprints.has(c.id);
      const firstName = c.name.split(' ')[0];

      const agendaHtml = (m.suggestedAgenda || [])
        .map(
          (step) => `
        <div class="blueprint-step">
          <span class="bp-time">${escapeHtml(step.time)}</span>
          <span class="bp-text"><strong>${escapeHtml(step.phase)}:</strong> ${escapeHtml(step.detail)}</span>
        </div>
      `
        )
        .join('');

      const allOffersPills = (c.offers || [])
        .map(
          (s) =>
            `<span class="skill-pill-sm offer" title="${escapeHtml(s.description)}">Teaches: ${escapeHtml(
              s.skill_name
            )} (${escapeHtml(s.level)})</span>`
        )
        .join('');

      const allWantsPills = (c.wants || [])
        .map(
          (s) =>
            `<span class="skill-pill-sm want" title="${escapeHtml(s.description)}">Seeks: ${escapeHtml(
              s.skill_name
            )}</span>`
        )
        .join('');

      return `
      <article class="match-card" data-candidate-id="${c.id}">
        <div class="match-card-top">
          <div class="peer-identity">
            <div class="avatar-md" style="background-color: ${escapeHtml(c.avatar_bg || '#0F766E')}">
              ${escapeHtml(c.avatar_initials)}
            </div>
            <div>
              <h3 class="peer-name">${escapeHtml(c.name)}</h3>
              <p class="peer-role">${escapeHtml(c.role_title)}</p>
              <div class="peer-submeta">
                <span>${escapeHtml(c.location)}</span>
                <span>•</span>
                <span>${escapeHtml(c.timezone)}</span>
                <span>•</span>
                <span class="mono-stat">★ ${Number(c.rating || 5).toFixed(2)} (${c.completed_swaps_count} swaps)</span>
              </div>
            </div>
          </div>

          <div class="ai-score-badge" title="Calculated from bidirectional skill taxonomy similarity, level complementarity, and schedule overlap">
            <span class="ai-score-num">✦ ${m.score}% Match</span>
            <span class="ai-score-tier">${escapeHtml(m.matchTier)}</span>
          </div>
        </div>

        <p class="peer-bio">${escapeHtml(c.bio)}</p>

        <!-- Reciprocal Match Connector -->
        <div class="reciprocal-connector">
          <div class="swap-column you-teach">
            <span class="swap-dir-label">You Teach ${escapeHtml(firstName)}</span>
            <span class="swap-skill-title">${escapeHtml(m.youTeach.skillName)}</span>
            <span class="swap-skill-meta">Matches their goal: ${escapeHtml(m.youTeach.targetWantName)}</span>
          </div>

          <div class="swap-bridge-svg" aria-hidden="true" title="Bidirectional 50/50 Reciprocal Swap">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M17 2.1l4 4-4 4"/><path d="M3 12.2v-2a4 4 0 0 1 4-4h12.8"/><path d="M7 21.9l-4-4 4-4"/><path d="M21 11.8v2a4 4 0 0 1-4 4H4.2"/>
            </svg>
            <span class="mono-stat" style="font-size: 0.65rem;">50/50</span>
          </div>

          <div class="swap-column they-teach">
            <span class="swap-dir-label">${escapeHtml(firstName)} Teaches You</span>
            <span class="swap-skill-title">${escapeHtml(m.theyTeach.skillName)}</span>
            <span class="swap-skill-meta">${escapeHtml(m.theyTeach.level)} • ${escapeHtml(c.session_length_mins)}m session</span>
          </div>
        </div>

        <div class="peer-all-skills">
          ${allOffersPills}
          ${allWantsPills}
        </div>

        <!-- AI Rationale & Expandable 50/50 Session Blueprint -->
        <div class="ai-rationale-box">
          <div class="ai-rationale-header">
            <span class="ai-rationale-label">✦ Why AI Paired You</span>
            <button type="button" class="toggle-blueprint-btn" data-toggle-blueprint="${c.id}">
              ${isExpanded ? 'Hide 50/50 Session Blueprint ▲' : 'View AI 50/50 Session Blueprint ▼'}
            </button>
          </div>
          <p class="ai-rationale-copy">${escapeHtml(m.rationale)}</p>
          <div class="blueprint-drawer ${isExpanded ? '' : 'hidden'}" id="blueprint-drawer-${c.id}">
            ${agendaHtml}
          </div>
        </div>

        <div class="match-card-footer">
          <div class="shared-slot-indicator">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span>Shared: <strong>${escapeHtml((m.sharedAvailability || []).join(', '))}</strong></span>
          </div>
          <button type="button" class="btn btn-primary open-request-modal-btn" data-candidate-id="${c.id}">
            Request Skill Swap
          </button>
        </div>
      </article>
    `;
    })
    .join('');

  // Bind blueprint toggles
  grid.querySelectorAll('[data-toggle-blueprint]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cid = Number(btn.getAttribute('data-toggle-blueprint'));
      if (state.expandedBlueprints.has(cid)) {
        state.expandedBlueprints.delete(cid);
      } else {
        state.expandedBlueprints.add(cid);
      }
      renderMatchesGrid();
    });
  });

  // Bind Request Skill Swap buttons
  grid.querySelectorAll('.open-request-modal-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cid = Number(btn.getAttribute('data-candidate-id'));
      openRequestSwapModal(cid);
    });
  });
}

function renderRequestsView() {
  const allReqs = state.requests || [];
  const incomingReqs = allReqs.filter((r) => r.direction === 'incoming');
  const outgoingReqs = allReqs.filter((r) => r.direction === 'outgoing');
  const acceptedReqs = allReqs.filter((r) => r.status === 'accepted');

  document.getElementById('countAllReq').textContent = String(allReqs.length);
  document.getElementById('countIncomingReq').textContent = String(incomingReqs.length);
  document.getElementById('countOutgoingReq').textContent = String(outgoingReqs.length);
  document.getElementById('countAcceptedReq').textContent = String(acceptedReqs.length);

  let filtered = allReqs;
  if (state.activeRequestFilter === 'incoming') filtered = incomingReqs;
  if (state.activeRequestFilter === 'outgoing') filtered = outgoingReqs;
  if (state.activeRequestFilter === 'accepted') filtered = acceptedReqs;

  const container = document.getElementById('requestsListContainer');
  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="studio-card" style="text-align: center; padding: 36px;">
        <h3 class="studio-card-title">No swap requests in this view</h3>
        <p class="peer-bio">Head to Discover &amp; AI Match to propose a new 50/50 skill-exchange session.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered
    .map((r) => {
      const isIncoming = r.direction === 'incoming';
      const partnerName = isIncoming ? r.requester_name : r.recipient_name;
      const partnerRole = isIncoming ? r.requester_role : r.recipient_role;
      const partnerInitials = isIncoming ? r.requester_initials : r.recipient_initials;
      const partnerBg = isIncoming ? r.requester_bg : r.recipient_bg;

      const youTeach = isIncoming ? r.wanted_skill_name : r.offered_skill_name;
      const partnerTeaches = isIncoming ? r.offered_skill_name : r.wanted_skill_name;

      const agendaSteps = (r.ai_session_agenda || [])
        .map(
          (st) => `
          <div class="blueprint-step">
            <span class="bp-time">${escapeHtml(st.time)}</span>
            <span class="bp-text"><strong>${escapeHtml(st.phase)}:</strong> ${escapeHtml(st.detail)}</span>
          </div>
        `
        )
        .join('');

      let actionButtonsHtml = '';
      if (r.status === 'pending' && isIncoming) {
        actionButtonsHtml = `
          <button class="btn btn-success" data-req-action="accepted" data-req-id="${r.id}">✓ Accept Swap Session</button>
          <button class="btn btn-danger-outline" data-req-action="declined" data-req-id="${r.id}">Decline</button>
        `;
      } else if (r.status === 'pending' && !isIncoming) {
        actionButtonsHtml = `
          <button class="btn btn-danger-outline" data-req-action="cancelled" data-req-id="${r.id}">Cancel Request</button>
        `;
      } else if (r.status === 'accepted') {
        actionButtonsHtml = `
          <button class="btn btn-primary" data-complete-req-id="${r.id}">✓ Record Completed Session</button>
        `;
      }

      return `
        <article class="request-card">
          <div class="request-top-bar">
            <div class="peer-identity">
              <div class="avatar-md" style="background-color: ${escapeHtml(partnerBg || '#0F766E')}">
                ${escapeHtml(partnerInitials)}
              </div>
              <div>
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                  <h3 class="peer-name">${escapeHtml(partnerName)}</h3>
                  <span class="req-direction-tag ${r.direction}">
                    ${isIncoming ? '↙ Incoming Proposal' : '↗ Outgoing Proposal'}
                  </span>
                  <span class="status-pill ${r.status}">${escapeHtml(r.status)}</span>
                </div>
                <p class="peer-role">${escapeHtml(partnerRole)} • Proposed Slot: <strong>${escapeHtml(
        r.proposed_slot
      )}</strong> (${r.duration_mins} mins)</p>
              </div>
            </div>

            <div class="ai-score-badge">
              <span class="ai-score-num">✦ ${r.ai_match_score}% Synergy</span>
              <span class="ai-score-tier">${escapeHtml(r.format)}</span>
            </div>
          </div>

          <div class="reciprocal-connector">
            <div class="swap-column you-teach">
              <span class="swap-dir-label">You Teach</span>
              <span class="swap-skill-title">${escapeHtml(youTeach)}</span>
            </div>
            <div class="swap-bridge-svg">⇄</div>
            <div class="swap-column they-teach">
              <span class="swap-dir-label">${escapeHtml(partnerName.split(' ')[0])} Teaches</span>
              <span class="swap-skill-title">${escapeHtml(partnerTeaches)}</span>
            </div>
          </div>

          <p class="peer-bio"><strong>Session Goal:</strong> ${escapeHtml(r.learning_goal)}</p>
          <p class="testimonial-quote">"${escapeHtml(r.message)}"</p>

          ${
            agendaSteps
              ? `
            <div class="ai-rationale-box">
              <div class="ai-rationale-header">
                <span class="ai-rationale-label">✦ Agreed 50/50 AI Session Blueprint</span>
              </div>
              <div class="blueprint-drawer">
                ${agendaSteps}
              </div>
            </div>
          `
              : ''
          }

          <div class="request-actions-bar">
            <span class="peer-submeta">Created ${escapeHtml(r.created_at)}</span>
            <div class="req-btn-group">
              ${actionButtonsHtml}
            </div>
          </div>
        </article>
      `;
    })
    .join('');

  container.querySelectorAll('[data-req-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const reqId = Number(btn.getAttribute('data-req-id'));
      const newStatus = btn.getAttribute('data-req-action');
      try {
        const res = await apiRequest(`/api/requests/${reqId}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: newStatus, viewerId: state.viewerId })
        });
        state.requests = res.requests;
        renderTopbar();
        renderRequestsView();
        showToast(
          newStatus === 'accepted'
            ? 'Swap request accepted! You can now run the session or log it as completed.'
            : `Request marked as ${newStatus}.`
        );
      } catch (err) {
        showToast(err.message);
      }
    });
  });

  container.querySelectorAll('[data-complete-req-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const reqId = Number(btn.getAttribute('data-complete-req-id'));
      const reqObj = state.requests.find((r) => r.id === reqId);
      openRecordExchangeModal(reqObj);
    });
  });
}

function renderExchangesView() {
  const strip = document.getElementById('exchangesSummaryStrip');
  const exList = state.completedExchanges || [];
  const totalMinutes = exList.reduce((acc, c) => acc + (Number(c.duration_mins) || 60), 0);
  const viewerInvolvedCount = exList.filter((c) => c.involves_viewer).length;

  strip.innerHTML = `
    <div class="ledger-stat-card">
      <strong>${exList.length}</strong>
      <span>Verified Reciprocal Sessions</span>
    </div>
    <div class="ledger-stat-card">
      <strong>${(totalMinutes / 60).toFixed(1)} hrs</strong>
      <span>Peer Learning Hours Logged</span>
    </div>
    <div class="ledger-stat-card">
      <strong>${viewerInvolvedCount}</strong>
      <span>Your Completed Skill Swaps</span>
    </div>
    <div class="ledger-stat-card">
      <strong>$0 Tuition</strong>
      <span>100% Reciprocal Knowledge Exchange</span>
    </div>
  `;

  const container = document.getElementById('exchangesLedgerContainer');
  if (exList.length === 0) {
    container.innerHTML = `
      <div class="studio-card" style="text-align: center; padding: 36px;">
        <h3 class="studio-card-title">No completed exchanges recorded yet</h3>
        <p class="peer-bio">Record your first completed session to build your verified peer learning portfolio.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = exList
    .map((c) => {
      const takeawaysHtml = (c.takeaways || [])
        .map((t) => `<li>${escapeHtml(t)}</li>`)
        .join('');
      const stars = '★'.repeat(Number(c.rating_given) || 5);

      return `
      <article class="exchange-certificate-card">
        <div class="cert-header">
          <div class="peer-identity">
            <div class="avatar-md" style="background-color: ${escapeHtml(c.partner_a_bg || '#0F766E')}">
              ${escapeHtml(c.partner_a_initials)}
            </div>
            <span style="font-weight: 700; color: var(--accent-teal);">⇄</span>
            <div class="avatar-md" style="background-color: ${escapeHtml(c.partner_b_bg || '#C2410C')}">
              ${escapeHtml(c.partner_b_initials)}
            </div>
            <div>
              <h3 class="peer-name">${escapeHtml(c.partner_a_name)} &amp; ${escapeHtml(c.partner_b_name)}</h3>
              <p class="peer-submeta">Completed ${escapeHtml(c.completed_at)} • ${c.duration_mins} Minutes • <span style="color: var(--status-amber);">${stars}</span></p>
            </div>
          </div>

          <span class="verified-stamp">✓ ${escapeHtml(c.verified_badge)}</span>
        </div>

        <div class="reciprocal-connector">
          <div class="swap-column you-teach">
            <span class="swap-dir-label">${escapeHtml(c.partner_a_name.split(' ')[0])} Taught</span>
            <span class="swap-skill-title">${escapeHtml(c.skill_a_taught)}</span>
          </div>
          <div class="swap-bridge-svg">⇄</div>
          <div class="swap-column they-teach">
            <span class="swap-dir-label">${escapeHtml(c.partner_b_name.split(' ')[0])} Taught</span>
            <span class="swap-skill-title">${escapeHtml(c.skill_b_taught)}</span>
          </div>
        </div>

        <p class="peer-bio">${escapeHtml(c.summary_notes)}</p>

        ${takeawaysHtml ? `<ul class="takeaways-list">${takeawaysHtml}</ul>` : ''}

        <blockquote class="testimonial-quote">
          "${escapeHtml(c.testimonial)}"
        </blockquote>
      </article>
    `;
    })
    .join('');
}

function renderProfileStudio() {
  const v = state.viewer;
  if (!v) return;

  document.getElementById('profName').value = v.name || '';
  document.getElementById('profRole').value = v.role_title || '';
  document.getElementById('profBio').value = v.bio || '';
  document.getElementById('profLocation').value = v.location || '';
  document.getElementById('profTimezone').value = v.timezone || '';
  document.getElementById('profDuration').value = String(v.session_length_mins || 60);

  const availSet = new Set(v.availability || []);
  document
    .querySelectorAll('#profAvailabilityCheckboxes input[type="checkbox"]')
    .forEach((cb) => {
      cb.checked = availSet.has(cb.value);
    });

  const offersContainer = document.getElementById('studioOffersList');
  offersContainer.innerHTML =
    (v.offers || [])
      .map(
        (s) => `
      <div class="studio-skill-row">
        <div>
          <strong>${escapeHtml(s.skill_name)}</strong>
          <span class="mini-skill-lvl">${escapeHtml(s.level)} • ${escapeHtml(s.category)}</span>
          <p class="peer-submeta">${escapeHtml(s.description)}</p>
        </div>
        <button type="button" class="remove-skill-btn" data-delete-skill="${s.id}">Remove</button>
      </div>
    `
      )
      .join('') || `<p class="peer-submeta">Add at least one skill you can teach.</p>`;

  const wantsContainer = document.getElementById('studioWantsList');
  wantsContainer.innerHTML =
    (v.wants || [])
      .map(
        (s) => `
      <div class="studio-skill-row">
        <div>
          <strong>${escapeHtml(s.skill_name)}</strong>
          <span class="mini-skill-lvl">${escapeHtml(s.level)} • ${escapeHtml(s.category)}</span>
          <p class="peer-submeta">${escapeHtml(s.description)}</p>
        </div>
        <button type="button" class="remove-skill-btn" data-delete-skill="${s.id}">Remove</button>
      </div>
    `
      )
      .join('') || `<p class="peer-submeta">Add at least one skill you want to learn.</p>`;

  document.querySelectorAll('[data-delete-skill]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const skillId = Number(btn.getAttribute('data-delete-skill'));
      try {
        await apiRequest(`/api/skills/${skillId}`, { method: 'DELETE' });
        await loadBootstrap();
        showToast('Skill removed and AI compatibility scores updated.');
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

// --- MODAL 1: REQUEST SKILL-EXCHANGE SESSION ---
function openRequestSwapModal(candidateId) {
  const candidate = state.candidates.find((c) => c.id === candidateId);
  if (!candidate || !state.viewer) return;

  const m = candidate.aiMatch;
  document.getElementById('reqRecipientId').value = String(candidate.id);
  document.getElementById('modalMatchScoreBadge').textContent = `✦ ${m.score}% AI RECIPROCAL MATCH WITH ${candidate.name.toUpperCase()}`;
  document.getElementById('requestModalTitle').textContent = `Propose 50/50 Swap with ${candidate.name}`;
  document.getElementById('modalPartnerTeachesLabel').textContent = `${candidate.name
    .split(' ')[0]
    .toUpperCase()} TEACHES (SECOND HALF)`;

  const offerSelect = document.getElementById('reqOfferedSkillSelect');
  const viewerOffers = state.viewer.offers.length > 0
    ? state.viewer.offers
    : [{ skill_name: m.youTeach.skillName }];
  offerSelect.innerHTML = viewerOffers
    .map(
      (s) =>
        `<option value="${escapeHtml(s.skill_name)}" ${
          s.skill_name === m.youTeach.skillName ? 'selected' : ''
        }>${escapeHtml(s.skill_name)}</option>`
    )
    .join('');

  const wantSelect = document.getElementById('reqWantedSkillSelect');
  const candOffers = candidate.offers.length > 0
    ? candidate.offers
    : [{ skill_name: m.theyTeach.skillName }];
  wantSelect.innerHTML = candOffers
    .map(
      (s) =>
        `<option value="${escapeHtml(s.skill_name)}" ${
          s.skill_name === m.theyTeach.skillName ? 'selected' : ''
        }>${escapeHtml(s.skill_name)}</option>`
    )
    .join('');

  const sharedSlot = (m.sharedAvailability && m.sharedAvailability[0]) || 'Weekday Evening';
  document.getElementById('reqProposedSlot').value = `Upcoming ${sharedSlot} (7:00 PM – 8:00 PM)`;
  document.getElementById('reqDurationSelect').value = String(candidate.session_length_mins || 60);
  document.getElementById('reqLearningGoal').value = `Trade a 30-min ${m.youTeach.skillName} clinic for a 30-min hands-on ${m.theyTeach.skillName} session.`;
  document.getElementById('reqPersonalMessage').value = m.suggestedPitch;

  state.modalDraftAgenda = m.suggestedAgenda || [];
  renderModalAgendaPreview();

  document.getElementById('requestModalBackdrop').classList.remove('hidden');
}

function renderModalAgendaPreview() {
  const list = document.getElementById('modalAiAgendaList');
  list.innerHTML = (state.modalDraftAgenda || [])
    .map(
      (step) => `
      <div class="blueprint-step">
        <span class="bp-time">${escapeHtml(step.time)}</span>
        <span class="bp-text"><strong>${escapeHtml(step.phase)}:</strong> ${escapeHtml(step.detail)}</span>
      </div>
    `
    )
    .join('');
}

// --- MODAL 2: RECORD COMPLETED EXCHANGE ---
function openRecordExchangeModal(reqObj = null) {
  const partnerSelect = document.getElementById('recPartnerSelect');
  const otherUsers = state.allUsers.filter((u) => u.id !== state.viewerId);

  partnerSelect.innerHTML = otherUsers
    .map((u) => `<option value="${u.id}">${escapeHtml(u.name)} (@${escapeHtml(u.handle)})</option>`)
    .join('');

  if (reqObj) {
    const isIncoming = reqObj.direction === 'incoming';
    const partnerId = isIncoming ? reqObj.requester_id : reqObj.recipient_id;
    const youTaught = isIncoming ? reqObj.wanted_skill_name : reqObj.offered_skill_name;
    const partnerTaught = isIncoming ? reqObj.offered_skill_name : reqObj.wanted_skill_name;

    document.getElementById('recRequestId').value = String(reqObj.id);
    partnerSelect.value = String(partnerId);
    document.getElementById('recDurationInput').value = String(reqObj.duration_mins || 60);
    document.getElementById('recSkillATaught').value = youTaught;
    document.getElementById('recSkillBTaught').value = partnerTaught;
    document.getElementById('recSummaryNotes').value = `Completed our 50/50 reciprocal session: ${reqObj.learning_goal}`;
    document.getElementById('recTakeawaysInput').value = `Built practical templates for ${youTaught}\nCompleted hands-on walkthrough in ${partnerTaught}\nExchanged follow-up practice files`;
    document.getElementById('recTestimonialInput').value = `Awesome 50/50 session! Trading ${youTaught} for ${partnerTaught} was super clear and immediately useful.`;
  } else {
    document.getElementById('recRequestId').value = '';
    const defaultPartner = state.candidates[0];
    if (defaultPartner) {
      partnerSelect.value = String(defaultPartner.id);
      document.getElementById('recSkillATaught').value = defaultPartner.aiMatch.youTeach.skillName;
      document.getElementById('recSkillBTaught').value = defaultPartner.aiMatch.theyTeach.skillName;
    } else {
      document.getElementById('recSkillATaught').value = state.viewer?.offers[0]?.skill_name || 'Excel & Spreadsheet Modeling';
      document.getElementById('recSkillBTaught').value = state.viewer?.wants[0]?.skill_name || 'Graphic Design';
    }
    document.getElementById('recDurationInput').value = '60';
    document.getElementById('recSummaryNotes').value = '';
    document.getElementById('recTakeawaysInput').value = '';
    document.getElementById('recTestimonialInput').value = '';
  }

  document.getElementById('recordExchangeModalBackdrop').classList.remove('hidden');
}

function switchTab(tabName) {
  state.activeTab = tabName;
  document.querySelectorAll('.nav-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
  });
  document.querySelectorAll('.view-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `view-${tabName}`);
  });
}

function updateCategoryPillUI() {
  document.querySelectorAll('#categoryFilterBar .cat-pill').forEach((pill) => {
    pill.classList.toggle('active', pill.getAttribute('data-category') === state.activeCategory);
  });
}

// --- EVENT LISTENERS INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  loadBootstrap();

  // Top navigation tabs
  document.querySelectorAll('.nav-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchTab(btn.getAttribute('data-tab'));
    });
  });

  // Persona switcher
  document.getElementById('viewerSelect').addEventListener('change', (e) => {
    state.viewerId = Number(e.target.value);
    loadBootstrap();
    showToast('Switched active member perspective. AI compatibility scores updated!');
  });

  // Sidebar quick links to profile studio
  document.getElementById('editProfileSidebarBtn').addEventListener('click', () => {
    switchTab('profile');
  });
  document.querySelectorAll('[data-goto-profile]').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchTab('profile');
      const type = btn.getAttribute('data-goto-profile');
      const targetInput = document.getElementById(type === 'offer' ? 'newOfferName' : 'newWantName');
      if (targetInput) targetInput.focus();
    });
  });

  // AI Concierge Natural Language Form
  document.getElementById('aiConciergeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const promptVal = document.getElementById('aiPromptInput').value.trim();
    state.activeSearchQuery = promptVal;
    await loadBootstrap();
    if (promptVal) {
      showToast('AI Matchmaker ranked compatible peers and built 50/50 blueprints!');
    }
  });

  document.getElementById('clearAiSearchBtn').addEventListener('click', () => {
    document.getElementById('aiPromptInput').value = '';
    state.activeSearchQuery = '';
    loadBootstrap();
  });

  // Preset Scenario Chips
  document.querySelectorAll('.preset-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const prompt = chip.getAttribute('data-prompt') || '';
      document.getElementById('aiPromptInput').value = prompt;
      state.activeSearchQuery = prompt;
      state.activeCategory = 'all';
      updateCategoryPillUI();
      loadBootstrap();
    });
  });

  // Category Filter Pills
  document.querySelectorAll('#categoryFilterBar .cat-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      state.activeCategory = pill.getAttribute('data-category');
      updateCategoryPillUI();
      loadBootstrap();
    });
  });

  // Requests Filter Tabs
  document.querySelectorAll('#requestsFilterTabs .req-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeRequestFilter = btn.getAttribute('data-req-filter');
      document.querySelectorAll('#requestsFilterTabs .req-filter-btn').forEach((b) => {
        b.classList.toggle('active', b === btn);
      });
      renderRequestsView();
    });
  });

  // Request Modal Controls
  const closeRequestModal = () => {
    document.getElementById('requestModalBackdrop').classList.add('hidden');
  };
  document.getElementById('closeRequestModalBtn').addEventListener('click', closeRequestModal);
  document.getElementById('cancelRequestModalBtn').addEventListener('click', closeRequestModal);

  // Regenerate AI Session Blueprint inside Request Modal
  const refreshModalAiPlan = async () => {
    const recipientId = Number(document.getElementById('reqRecipientId').value);
    const offeredSkillName = document.getElementById('reqOfferedSkillSelect').value;
    const wantedSkillName = document.getElementById('reqWantedSkillSelect').value;
    const durationMins = Number(document.getElementById('reqDurationSelect').value) || 60;
    const learningGoal = document.getElementById('reqLearningGoal').value;

    try {
      const plan = await apiRequest('/api/ai/session-plan', {
        method: 'POST',
        body: JSON.stringify({
          requesterId: state.viewerId,
          recipientId,
          offeredSkillName,
          wantedSkillName,
          durationMins,
          learningGoal
        })
      });
      state.modalDraftAgenda = plan.agenda;
      document.getElementById('reqPersonalMessage').value = plan.suggestedMessage;
      renderModalAgendaPreview();
    } catch (err) {
      console.error(err);
    }
  };

  document.getElementById('regenerateAiPlanBtn').addEventListener('click', () => {
    refreshModalAiPlan();
    showToast('AI regenerated your custom 50/50 session blueprint!');
  });
  document.getElementById('reqOfferedSkillSelect').addEventListener('change', refreshModalAiPlan);
  document.getElementById('reqWantedSkillSelect').addEventListener('change', refreshModalAiPlan);
  document.getElementById('reqDurationSelect').addEventListener('change', refreshModalAiPlan);

  // Submit New Skill-Exchange Request
  document.getElementById('createSwapRequestForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      requester_id: state.viewerId,
      recipient_id: Number(document.getElementById('reqRecipientId').value),
      offered_skill_name: document.getElementById('reqOfferedSkillSelect').value,
      wanted_skill_name: document.getElementById('reqWantedSkillSelect').value,
      proposed_slot: document.getElementById('reqProposedSlot').value,
      duration_mins: Number(document.getElementById('reqDurationSelect').value) || 60,
      format: document.getElementById('reqFormatSelect').value,
      learning_goal: document.getElementById('reqLearningGoal').value,
      message: document.getElementById('reqPersonalMessage').value,
      ai_session_agenda: state.modalDraftAgenda
    };

    try {
      const res = await apiRequest('/api/requests', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      state.requests = res.requests;
      closeRequestModal();
      renderTopbar();
      renderRequestsView();
      switchTab('requests');
      showToast('Skill-exchange request sent with your 50/50 AI Session Blueprint!');
    } catch (err) {
      showToast(err.message);
    }
  });

  // Record Completed Exchange Modal Controls
  const closeRecordModal = () => {
    document.getElementById('recordExchangeModalBackdrop').classList.add('hidden');
  };
  document.getElementById('openRecordExchangeBtn').addEventListener('click', () => {
    openRecordExchangeModal(null);
  });
  document.getElementById('closeRecordModalBtn').addEventListener('click', closeRecordModal);
  document.getElementById('cancelRecordModalBtn').addEventListener('click', closeRecordModal);

  document.getElementById('recordExchangeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const takeawaysRaw = document.getElementById('recTakeawaysInput').value;
    const takeaways = takeawaysRaw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const payload = {
      viewerId: state.viewerId,
      request_id: document.getElementById('recRequestId').value || null,
      partner_a_id: state.viewerId,
      partner_b_id: Number(document.getElementById('recPartnerSelect').value),
      duration_mins: Number(document.getElementById('recDurationInput').value) || 60,
      skill_a_taught: document.getElementById('recSkillATaught').value,
      skill_b_taught: document.getElementById('recSkillBTaught').value,
      summary_notes: document.getElementById('recSummaryNotes').value,
      takeaways,
      rating_given: Number(document.getElementById('recRatingSelect').value) || 5,
      testimonial: document.getElementById('recTestimonialInput').value
    };

    try {
      await apiRequest('/api/exchanges', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      closeRecordModal();
      await loadBootstrap();
      switchTab('exchanges');
      showToast('Completed skill exchange verified and added to the community ledger!');
    } catch (err) {
      showToast(err.message);
    }
  });

  // Profile Studio Form Submissions
  document.getElementById('profileDetailsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const checkedAvail = Array.from(
      document.querySelectorAll('#profAvailabilityCheckboxes input[type="checkbox"]:checked')
    ).map((cb) => cb.value);

    const payload = {
      name: document.getElementById('profName').value,
      role_title: document.getElementById('profRole').value,
      bio: document.getElementById('profBio').value,
      location: document.getElementById('profLocation').value,
      timezone: document.getElementById('profTimezone').value,
      session_length_mins: Number(document.getElementById('profDuration').value) || 60,
      availability: checkedAvail.length > 0 ? checkedAvail : ['Weekday Evenings']
    };

    try {
      await apiRequest(`/api/users/${state.viewerId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      await loadBootstrap();
      showToast('Profile saved! AI compatibility scores recalculated.');
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById('addOfferSkillForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      type: 'offer',
      skill_name: document.getElementById('newOfferName').value,
      category: document.getElementById('newOfferCategory').value,
      level: document.getElementById('newOfferLevel').value,
      description: document.getElementById('newOfferDesc').value
    };
    try {
      await apiRequest(`/api/users/${state.viewerId}/skills`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      document.getElementById('newOfferName').value = '';
      document.getElementById('newOfferDesc').value = '';
      await loadBootstrap();
      showToast(`Added "${payload.skill_name}" to your Teaching skills!`);
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById('addWantSkillForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      type: 'want',
      skill_name: document.getElementById('newWantName').value,
      category: document.getElementById('newWantCategory').value,
      level: document.getElementById('newWantLevel').value,
      description: document.getElementById('newWantDesc').value
    };
    try {
      await apiRequest(`/api/users/${state.viewerId}/skills`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      document.getElementById('newWantName').value = '';
      document.getElementById('newWantDesc').value = '';
      await loadBootstrap();
      showToast(`Added "${payload.skill_name}" to your Learning goals!`);
    } catch (err) {
      showToast(err.message);
    }
  });

  // New Member Profile Modal
  const openNewProfileModal = () => {
    document.getElementById('newProfileModalBackdrop').classList.remove('hidden');
  };
  const closeNewProfileModal = () => {
    document.getElementById('newProfileModalBackdrop').classList.add('hidden');
  };

  document.getElementById('openNewProfileModalBtn').addEventListener('click', openNewProfileModal);
  document.getElementById('createNewProfileFromStudioBtn').addEventListener('click', openNewProfileModal);
  document.getElementById('closeNewProfileModalBtn').addEventListener('click', closeNewProfileModal);
  document.getElementById('cancelNewProfileModalBtn').addEventListener('click', closeNewProfileModal);

  document.getElementById('createNewProfileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: document.getElementById('npName').value,
      role_title: document.getElementById('npRole').value,
      location: document.getElementById('npLocation').value,
      timezone: document.getElementById('npTimezone').value,
      bio: document.getElementById('npBio').value,
      offers: [
        {
          skill_name: document.getElementById('npOfferSkill').value,
          category: document.getElementById('npOfferCategory').value,
          level: 'Expert',
          description: document.getElementById('npOfferDesc').value || '1-on-1 practical coaching and templates'
        }
      ],
      wants: [
        {
          skill_name: document.getElementById('npWantSkill').value,
          category: document.getElementById('npWantCategory').value,
          level: 'Beginner',
          description: document.getElementById('npWantDesc').value || 'Looking for hands-on fundamentals'
        }
      ]
    };

    try {
      const res = await apiRequest('/api/users', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      state.viewerId = res.user.id;
      closeNewProfileModal();
      e.target.reset();
      await loadBootstrap();
      switchTab('discover');
      showToast(`Welcome, ${res.user.name}! AI calculated your reciprocal matches.`);
    } catch (err) {
      showToast(err.message);
    }
  });
});
