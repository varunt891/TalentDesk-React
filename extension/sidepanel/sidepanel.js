// TalentDesk Side Panel Controller Script (Hybrid DOM + Gemini AI Parser)

document.addEventListener('DOMContentLoaded', async () => {
  const apiUrlInput = document.getElementById('apiUrl');
  const orgIdInput = document.getElementById('orgId');
  const saveConfigBtn = document.getElementById('saveConfigBtn');
  const toggleSettingsBtn = document.getElementById('toggleSettingsBtn');
  const configCard = document.getElementById('configCard');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const pdfBanner = document.getElementById('pdfBanner');
  const jobSelect = document.getElementById('jobSelect');
  const scrapeBtn = document.getElementById('scrapeBtn');
  const deepScanBtn = document.getElementById('deepScanBtn');
  const aiParseBtn = document.getElementById('aiParseBtn');
  const importBtn = document.getElementById('importBtn');
  const openAppBtn = document.getElementById('openAppBtn');
  const previewCard = document.getElementById('previewCard');
  const duplicateAlert = document.getElementById('duplicateAlert');
  const duplicateTitle = document.getElementById('duplicateTitle');
  const duplicateDesc = document.getElementById('duplicateDesc');
  const toast = document.getElementById('toast');

  // Input elements in preview card
  const candAvatar = document.getElementById('candAvatar');
  const candName = document.getElementById('candName');
  const candTitle = document.getElementById('candTitle');
  const candCompany = document.getElementById('candCompany');
  const candLocation = document.getElementById('candLocation');
  const candSource = document.getElementById('candSource');
  const candEmail = document.getElementById('candEmail');
  const candPhone = document.getElementById('candPhone');
  const candSourceUrl = document.getElementById('candSourceUrl');
  const candSummary = document.getElementById('candSummary');
  const candSkills = document.getElementById('candSkills');
  const candExperience = document.getElementById('candExperience');
  const candEducation = document.getElementById('candEducation');
  const experienceGroup = document.getElementById('experienceGroup');
  const educationGroup = document.getElementById('educationGroup');

  let currentProfileData = null;
  let existingCandidates = [];

  // Toggle settings panel
  if (toggleSettingsBtn && configCard) {
    toggleSettingsBtn.addEventListener('click', () => {
      configCard.classList.toggle('hidden');
    });
  }

  // Mini Tab Switcher inside Candidate Card
  const navTabs = document.querySelectorAll('.nav-tab');
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTabId = tab.getAttribute('data-tab');
      navTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      document.querySelectorAll('.card-tab-content').forEach(content => {
        if (content.id === targetTabId) {
          content.classList.remove('hidden');
          content.classList.add('active');
        } else {
          content.classList.add('hidden');
          content.classList.remove('active');
        }
      });
    });
  });

  // Load saved settings
  // Default API URL points to the live Render server so the extension works
  // without any manual configuration. Update this constant when you redeploy.
  const LIVE_API_URL = 'https://talentdesk-react.onrender.com';

  const config = await chrome.storage.local.get(['apiUrl', 'orgId']);
  const apiUrl = config.apiUrl || LIVE_API_URL;
  const orgId = config.orgId || '';

  apiUrlInput.value = apiUrl;
  orgIdInput.value = orgId;

  // Check active tab to see if it is a PDF
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && activeTab.url && (activeTab.url.toLowerCase().includes('.pdf') || activeTab.url.toLowerCase().includes('/pdf/'))) {
      if (pdfBanner) pdfBanner.classList.remove('hidden');
    }
  } catch (err) {}

  // Helper to fetch session token directly from Chrome Cookies
  async function getAuthToken(targetApiUrl) {
    try {
      // Try the configured API URL first
      let cookie = await chrome.cookies.get({ url: targetApiUrl, name: 'td_session' });
      // Then try the live server
      if (!cookie) {
        cookie = await chrome.cookies.get({ url: 'https://talentdesk-react.onrender.com', name: 'td_session' });
      }
      // Fallbacks for local development
      if (!cookie) {
        cookie = await chrome.cookies.get({ url: 'http://localhost:5173', name: 'td_session' });
      }
      if (!cookie) {
        cookie = await chrome.cookies.get({ url: 'http://localhost:4000', name: 'td_session' });
      }
      return cookie ? cookie.value : null;
    } catch (err) {
      console.warn('Cookie retrieval error:', err);
      return null;
    }
  }

  async function getAuthHeaders(targetApiUrl) {
    const headers = { 'Content-Type': 'application/json' };
    const token = await getAuthToken(targetApiUrl);
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  // Save Settings handler
  saveConfigBtn.addEventListener('click', async () => {
    const newApiUrl = apiUrlInput.value.trim().replace(/\/$/, '');
    const newOrgId = orgIdInput.value.trim();
    await chrome.storage.local.set({ apiUrl: newApiUrl, orgId: newOrgId });
    showToast('Settings saved successfully', 'success');
    checkConnectionAndLoadJobs();
  });

  // Initial connection check & jobs load
  await checkConnectionAndLoadJobs();

  // Auto-extract on load if side panel opened on active tab
  extractActiveTabProfile(false);

  async function checkConnectionAndLoadJobs() {
    const currentApiUrl = apiUrlInput.value.trim().replace(/\/$/, '');
    const currentOrgId = orgIdInput.value.trim();

    try {
      const headers = await getAuthHeaders(currentApiUrl);
      
      const jobsRes = await fetch(`${currentApiUrl}/api/data/jobs?org_id=${currentOrgId}`, {
        method: 'GET',
        headers,
        credentials: 'include'
      });

      if (jobsRes.ok) {
        statusDot.classList.add('online');
        if (statusText) statusText.textContent = 'Online';
        statusDot.title = 'Connected to TalentDesk API';
        const result = await jobsRes.json();
        
        let jobs = [];
        if (Array.isArray(result)) {
          jobs = result;
        } else if (result && Array.isArray(result.data)) {
          jobs = result.data;
        }

        jobSelect.innerHTML = '<option value="">-- General Pool (No Specific Job) --</option>';
        if (Array.isArray(jobs)) {
          jobs.forEach(job => {
            const opt = document.createElement('option');
            opt.value = job.id;
            opt.textContent = `${job.job_id || ''} ${job.title || job.job_title || 'Requisition'} (${job.client || 'Client'})`;
            jobSelect.appendChild(opt);
          });
        }
      } else {
        const errJson = await jobsRes.json().catch(() => ({}));
        if (jobsRes.status === 401) {
          showToast('🔒 Please log into TalentDesk app first', 'error');
        }
        throw new Error(errJson.error || 'Server returned non-200 status');
      }

      // Pre-fetch candidates list for duplicate checking
      const candRes = await fetch(`${currentApiUrl}/api/data/candidates?org_id=${currentOrgId}`, {
        method: 'GET',
        headers,
        credentials: 'include'
      });

      if (candRes.ok) {
        const result = await candRes.json();
        if (Array.isArray(result)) {
          existingCandidates = result;
        } else if (result && Array.isArray(result.data)) {
          existingCandidates = result.data;
        } else {
          existingCandidates = [];
        }
      }
    } catch (err) {
      statusDot.classList.remove('online');
      if (statusText) statusText.textContent = 'Offline';
      statusDot.title = 'Disconnected from TalentDesk API';
      console.warn('API connection check:', err.message);
    }
  }

  // Scrape Profile button handlers
  scrapeBtn.addEventListener('click', () => {
    extractActiveTabProfile(false);
  });

  deepScanBtn.addEventListener('click', () => {
    extractActiveTabProfile(true);
  });

  aiParseBtn.addEventListener('click', () => {
    extractWithGeminiAI();
  });

  async function extractActiveTabProfile(deepScan = false) {
    const activeBtn = deepScan ? deepScanBtn : scrapeBtn;
    const origText = activeBtn.innerHTML;
    activeBtn.disabled = true;
    activeBtn.innerHTML = deepScan ? '⚡ Scanning...' : 'Extracting...';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        showToast('No active tab detected', 'error');
        return;
      }

      const isPdfTab = tab.url && (tab.url.toLowerCase().includes('.pdf') || tab.url.toLowerCase().includes('/pdf/'));

      if (isPdfTab) {
        activeBtn.disabled = false;
        activeBtn.innerHTML = origText;
        return extractWithGeminiAI();
      }

      const msgPayload = { type: 'PARSE_PROFILE', deepScan };

      chrome.tabs.sendMessage(tab.id, msgPayload, async (response) => {
        const domProf = response?.profile;

        if (!domProf || !domProf.rawPageText || (domProf.rawPageText.length < 30 && !domProf.name)) {
          activeBtn.disabled = false;
          activeBtn.innerHTML = origText;
          return extractWithGeminiAI();
        }

        if (response && response.success) {
          renderProfileCard(domProf);
        } else {
          extractWithGeminiAI();
        }
      });
    } catch (err) {
      extractWithGeminiAI();
    } finally {
      activeBtn.disabled = false;
      activeBtn.innerHTML = origText;
    }
  }

  // AI Smart Parsing using Gemini API with Fallback Merging
  async function extractWithGeminiAI() {
    aiParseBtn.disabled = true;
    aiParseBtn.innerHTML = '🤖 AI Extracting...';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        showToast('No active tab detected', 'error');
        return;
      }

      chrome.tabs.sendMessage(tab.id, { type: 'PARSE_PROFILE', deepScan: true }, async (response) => {
        const domProf = (response && response.success && response.profile)
          ? response.profile
          : { sourceUrl: tab.url || '', rawPageText: '', name: 'PDF Candidate' };

        const isPdfTab = (tab.url && (tab.url.toLowerCase().includes('.pdf') || tab.url.toLowerCase().includes('/pdf/'))) ||
                         (domProf.sourceUrl && domProf.sourceUrl.toLowerCase().includes('.pdf'));

        if (!domProf.rawPageText && !isPdfTab) {
          showToast('Could not extract page content for AI', 'error');
          aiParseBtn.disabled = false;
          aiParseBtn.innerHTML = '🤖 AI Smart Parse';
          return;
        }

        const currentApiUrl = apiUrlInput.value.trim().replace(/\/$/, '');
        const headers = await getAuthHeaders(currentApiUrl);

        showToast(isPdfTab ? '📄 AI fetching & parsing PDF resume document...' : '🤖 AI model analyzing full profile text...', 'success');

        const aiRes = await fetch(`${currentApiUrl}/api/ai/parse-web-profile`, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({
            pageText: domProf.rawPageText,
            pageUrl: domProf.sourceUrl
          })
        });

        if (aiRes.ok) {
          const aiJson = await aiRes.json();
          if (aiJson.success && aiJson.profile) {
            const aiProf = aiJson.profile;

            // Merge DOM client data with AI data so no fields are lost
            aiProf.name = (aiProf.name && aiProf.name.length >= 2) ? aiProf.name : (aiProf.full_name || aiProf.candidate_name || domProf.name || 'Candidate');
            aiProf.title = aiProf.title || aiProf.headline || aiProf.job_title || domProf.title || '';
            aiProf.company = aiProf.company || aiProf.current_company || domProf.company || '';
            aiProf.location = aiProf.location || aiProf.city || domProf.location || '';
            
            aiProf.sourceUrl = domProf.sourceUrl;
            aiProf.avatarUrl = domProf.avatarUrl;
            aiProf.source = domProf.source || 'AI Sourced';

            // Merge DOM experience timeline if AI returned fewer or incomplete experience entries
            const aiExp = Array.isArray(aiProf.experience) ? aiProf.experience : [];
            const domExp = Array.isArray(domProf.experience) ? domProf.experience : [];
            const activeExperience = domExp.length >= aiExp.length ? domExp : aiExp;

            const activeEducation = (aiProf.education && aiProf.education.length > 0)
              ? aiProf.education
              : (domProf.education || []);

            aiProf.experience = activeExperience;
            aiProf.education = activeEducation;

            if (!aiProf.skills || aiProf.skills.length === 0) {
              aiProf.skills = domProf.skills || [];
            }

            // Build full multi-line resume text for ABOUT / SUMMARY textarea
            let fullResume = `==================================================\n`;
            fullResume += `CANDIDATE: ${aiProf.name}\n`;
            fullResume += `Headline: ${aiProf.title}\n`;
            fullResume += `Location: ${aiProf.location}\n`;
            fullResume += `Company: ${aiProf.company}\n`;
            fullResume += `Source: ${aiProf.sourceUrl}\n`;
            fullResume += `==================================================\n\n`;

            if (aiProf.summary && typeof aiProf.summary === 'string' && !aiProf.summary.includes('WORK EXPERIENCE TIMELINE')) {
              fullResume += `ABOUT BIO:\n${aiProf.summary}\n\n`;
            }

            if (activeExperience.length > 0) {
              fullResume += `WORK EXPERIENCE TIMELINE:\n`;
              activeExperience.forEach((e, idx) => {
                fullResume += `${idx + 1}. ${e.role || 'Role'}${e.company ? ' at ' + e.company : ''}\n`;
                if (e.dates) fullResume += `   Dates & Duration: ${e.dates}\n`;
                if (e.location) fullResume += `   Location: ${e.location}\n`;
                if (e.description) fullResume += `   Details: ${e.description.replace(/\n+/g, ' ')}\n`;
                fullResume += `\n`;
              });
            }

            if (activeEducation.length > 0) {
              fullResume += `EDUCATION:\n`;
              activeEducation.forEach((ed, idx) => {
                fullResume += `${idx + 1}. ${ed.school || 'School'}${ed.degree ? ' - ' + ed.degree : ''} ${ed.dates ? '(' + ed.dates + ')' : ''}\n`;
              });
              fullResume += `\n`;
            }

            if (aiProf.skills && aiProf.skills.length > 0) {
              fullResume += `SKILLS:\n${aiProf.skills.join(', ')}\n`;
            }

            aiProf.summary = fullResume;
            aiProf.resume_text = fullResume;

            showToast('✨ AI successfully extracted complete candidate profile!', 'success');
            renderProfileCard(aiProf);
          } else {
            showToast(aiJson.error || 'AI parsing returned unexpected format', 'error');
          }
        } else {
          const errJson = await aiRes.json().catch(() => ({}));
          showToast(errJson.error || 'AI endpoint error', 'error');
        }

        aiParseBtn.disabled = false;
        aiParseBtn.innerHTML = '🤖 AI Smart Parse';
      });
    } catch (err) {
      showToast('AI Parsing failed: ' + err.message, 'error');
      aiParseBtn.disabled = false;
      aiParseBtn.innerHTML = '🤖 AI Smart Parse';
    }
  }

  function renderProfileCard(profile) {
    currentProfileData = profile;

    candName.value = profile.name || '';
    candTitle.value = profile.title || '';
    candCompany.value = profile.company || '';
    candLocation.value = profile.location || '';
    candSource.value = profile.source || 'Web Import';
    
    candEmail.value = profile.email || '';
    candEmail.placeholder = profile.email ? 'Email' : 'Click "Contact info" on LinkedIn to populate';

    candPhone.value = profile.phone || '';
    candPhone.placeholder = profile.phone ? 'Phone' : 'Click "Contact info" on LinkedIn to populate';

    candSummary.value = profile.summary || profile.resume_text || '';

    if (profile.avatarUrl) {
      candAvatar.src = profile.avatarUrl;
    } else {
      candAvatar.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%236b7280' d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";
    }

    candSourceUrl.href = profile.sourceUrl || '#';
    candSourceUrl.textContent = profile.sourceUrl || '';

    // Render Skills tags
    candSkills.innerHTML = '';
    const skills = profile.skills && profile.skills.length > 0 ? profile.skills : ['Sourcing', 'Engineering'];
    skills.forEach(skill => {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = skill;
      candSkills.appendChild(tag);
    });

    // Render Experience List
    candExperience.innerHTML = '';
    if (profile.experience && profile.experience.length > 0) {
      experienceGroup.classList.remove('hidden');
      profile.experience.forEach(exp => {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `<div class="history-title">${exp.role || 'Role'}</div><div class="history-sub">${exp.company || ''} ${exp.dates ? '• ' + exp.dates : ''}</div>${exp.location ? `<div class="history-sub">${exp.location}</div>` : ''}${exp.description ? `<div class="history-desc">${exp.description.substring(0, 140)}...</div>` : ''}`;
        candExperience.appendChild(item);
      });
    } else {
      experienceGroup.classList.add('hidden');
    }

    // Render Education List
    candEducation.innerHTML = '';
    if (profile.education && profile.education.length > 0) {
      educationGroup.classList.remove('hidden');
      profile.education.forEach(edu => {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `<div class="history-title">${edu.school || 'School'}</div><div class="history-sub">${edu.degree || ''} ${edu.dates ? '• ' + edu.dates : ''}</div>`;
        candEducation.appendChild(item);
      });
    } else {
      educationGroup.classList.add('hidden');
    }

    previewCard.classList.remove('hidden');
    checkForDuplicates(profile);
  }

  const closeDuplicateAlertBtn = document.getElementById('closeDuplicateAlertBtn');
  if (closeDuplicateAlertBtn) {
    closeDuplicateAlertBtn.addEventListener('click', () => {
      duplicateAlert.classList.add('hidden');
    });
  }

  function normalizeUrl(url) {
    if (!url) return '';
    return url.toLowerCase().trim()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/$/, '')
      .split('?')[0];
  }

  function checkForDuplicates(profile) {
    duplicateAlert.classList.add('hidden');
    if (!Array.isArray(existingCandidates) || existingCandidates.length === 0) return;

    const normName = (profile.name || '').toLowerCase().trim();
    const normEmail = (profile.email || '').toLowerCase().trim();
    const normPhone = (profile.phone || '').replace(/\D/g, '');
    const normUrl = normalizeUrl(profile.sourceUrl || profile.linkedin);
    const normCompany = (profile.company || profile.currentCompany || '').toLowerCase().trim();

    // Skip duplicate check for sample/demo resume websites (resumod.co, resume.com, /sample/, /demo/)
    if (normUrl.includes('sample') || normUrl.includes('demo') || normUrl.includes('resumod.co') || normUrl.includes('resume.com')) return;

    // Skip duplicate check for generic fallback & template names
    const genericNames = [
      'candidate', 'web candidate profile', 'pdf resume candidate', 'web import',
      'nameless penguin', 'anonymous bird', 'anonymous candidate', 'sample candidate',
      'john doe', 'jane doe', 'candidate name', 'your name', 'skip to main content'
    ];
    if (!normName || genericNames.some(gn => normName.includes(gn))) return;

    // Generic dummy sample emails used in template sites (e.g. resume.com)
    const genericEmails = [
      'example@email.com',
      'user@example.com',
      'email@example.com',
      'test@example.com',
      'sample@example.com',
      'john.doe@example.com',
      'candidate@example.com',
      'mail@example.com',
      'your.email@example.com'
    ];

    const isGenericEmail = genericEmails.includes(normEmail);

    const dup = existingCandidates.find(c => {
      const cFirstName = (c.first_name || '').toLowerCase().trim();
      const cLastName = (c.last_name || '').toLowerCase().trim();
      const cFullName = `${cFirstName} ${cLastName}`.trim();
      const cEmail = (c.email || '').toLowerCase().trim();
      const cPhone = (c.phone || '').replace(/\D/g, '');
      const cUrl = normalizeUrl(c.linkedin || c.source_url);
      const cCompany = (c.current_company || c.company || '').toLowerCase().trim();

      // 1. Exact Email Match (strong, unless it's a dummy sample template email like example@email.com)
      if (normEmail && cEmail && normEmail === cEmail && !isGenericEmail) return true;

      // 2. Exact Source / LinkedIn URL Match (strong)
      if (normUrl && cUrl && normUrl === cUrl && normUrl.length > 5) return true;

      // 3. Exact Phone Match (strong)
      if (normPhone && cPhone && normPhone.length >= 7 && normPhone === cPhone) return true;

      // If URLs both exist and are different -> NOT a duplicate (different LinkedIn/web profiles)
      if (normUrl && cUrl && normUrl !== cUrl) return false;

      // If Emails both exist and are different -> NOT a duplicate
      if (normEmail && cEmail && normEmail !== cEmail && !isGenericEmail) return false;

      // If Companies both exist and are different -> NOT a duplicate
      if (normCompany && cCompany && normCompany !== cCompany) return false;

      // 4. Full Name Match (only if supported by matching company or neither profile has conflicting details)
      if (normName && cFullName && normName === cFullName && normName.split(' ').length >= 2) {
        if (normCompany && cCompany && normCompany === cCompany) return true;
        if (!normUrl && !cUrl && !normEmail && !cEmail) return true;
      }

      return false;
    });

    if (dup) {
      const dupName = [dup.first_name, dup.last_name].filter(Boolean).join(' ') || 'Candidate';
      duplicateTitle.textContent = `Potential Duplicate Found: ${dupName}`;
      duplicateDesc.textContent = `Already listed in TalentDesk (${dup.job_title || 'Candidate'} • ${dup.internal_status || 'Sourced'}).`;
      duplicateAlert.classList.remove('hidden');
    }
  }

  // 1-Click Import Handler
  importBtn.addEventListener('click', async () => {
    if (!currentProfileData) return;

    importBtn.disabled = true;
    importBtn.innerHTML = 'Importing...';

    const currentApiUrl = apiUrlInput.value.trim().replace(/\/$/, '');
    const currentOrgId = orgIdInput.value.trim();
    const selectedJobId = jobSelect.value;

    const fullRawName = candName.value.trim() || 'Imported Candidate';
    const nameParts = fullRawName.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Use full structured resume_text string containing all work experience & education
    const fullResumeNotes = candSummary.value.trim() || currentProfileData.resume_text || '';

    const candidatePayload = {
      org_id: currentOrgId || null,
      first_name: firstName,
      last_name: lastName,
      name: fullRawName,
      email: candEmail.value.trim() || null,
      phone: candPhone.value.trim() || null,
      job_title: candTitle.value.trim() || null,
      title: candTitle.value.trim() || null,
      client: candCompany.value.trim() || null,
      company: candCompany.value.trim() || null,
      location: candLocation.value.trim() || null,
      linkedin: candSourceUrl.href || null,
      source_url: candSourceUrl.href || null,
      notes: fullResumeNotes,
      resume_text: fullResumeNotes,
      skills: Array.from(candSkills.querySelectorAll('.tag')).map(t => t.textContent),
      job_id: selectedJobId || null,
      internal_status: 'Sourced'
    };

    try {
      const headers = await getAuthHeaders(currentApiUrl);
      const res = await fetch(`${currentApiUrl}/api/data/candidates`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify(candidatePayload)
      });

      const responseBody = await res.json().catch(() => ({}));

      if (res.ok) {
        const savedCand = responseBody.data ? (Array.isArray(responseBody.data) ? responseBody.data[0] : responseBody.data) : responseBody;
        const savedName = [savedCand.first_name, savedCand.last_name].filter(Boolean).join(' ') || savedCand.name || 'Candidate';
        showToast(`🎉 ${savedName} imported to TalentDesk!`, 'success');
        
        if (Array.isArray(existingCandidates)) {
          existingCandidates.push(savedCand);
        }
        duplicateAlert.classList.add('hidden');

        if (openAppBtn) {
          // Derive the frontend URL from the configured API URL.
          // Render deploys frontend + backend together; adjust if split-deployed.
          const frontendBase = currentApiUrl
            .replace(':4000', ':5173')
            .replace('/api', '');
          openAppBtn.href = `${frontendBase}/sourced-candidates`;
          openAppBtn.classList.remove('hidden');
        }
      } else {
        const errMsg = responseBody.error || responseBody.message || 'Failed to import candidate';
        showToast(errMsg, 'error');
      }
    } catch (err) {
      showToast('Network error during import: ' + err.message, 'error');
    } finally {
      importBtn.disabled = false;
      importBtn.innerHTML = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4v16m8-8H4"/></svg> 1-Click Import to TalentDesk`;
    }
  });

  function showToast(message, type = 'success') {
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.remove('hidden');
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 5000);
  }
});
