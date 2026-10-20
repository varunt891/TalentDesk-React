// TalentDesk Content Script for Profile Sourcing (Grouped & Single Experience Parser)

if (globalThis.talentDeskCaptureListener) chrome.runtime.onMessage.removeListener(globalThis.talentDeskCaptureListener);
globalThis.talentDeskCaptureListener = (request, sender, sendResponse) => {
  if (request.type === 'PARSE_PROFILE') {
    if (request.deepScan) {
      performDeepScroll().then(() => {
        try {
          const data = extractProfileData();
          sendResponse({ success: true, profile: data });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      }).catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    } else {
      try {
        const data = extractProfileData();
        sendResponse({ success: true, profile: data });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    }
  }
  return false;
};
chrome.runtime.onMessage.addListener(globalThis.talentDeskCaptureListener);

async function performDeepScroll() {
  const originalPosition = { top: window.scrollY, left: window.scrollX };
  const maxScroll = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0);
  const step = Math.max(window.innerHeight * 0.75, 400);
  for (let top = 0; top <= maxScroll; top += step) {
    window.scrollTo({ top, behavior: 'instant' });
    window.dispatchEvent(new Event('scroll'));
    document.dispatchEvent(new Event('scroll'));
    await new Promise(resolve => setTimeout(resolve, 180));
  }
  window.scrollTo({ top: maxScroll, behavior: 'instant' });
  await new Promise(resolve => setTimeout(resolve, 250));
  window.scrollTo({ ...originalPosition, behavior: 'instant' });
  await new Promise(resolve => setTimeout(resolve, 350));
}

function extractProfileData() {
  const url = window.location.href;
  const hostname = window.location.hostname;
  const isHost = domain => hostname === domain || hostname.endsWith(`.${domain}`);
  const selection = window.getSelection()?.toString().trim() || '';
  
  let rawText = '';
  if (document.body) {
    if (isHost('linkedin.com')) {
      const mainContent = document.querySelector('main.scaffold-layout__main') || 
                          document.querySelector('main') || 
                          document.querySelector('.profile-detail') ||
                          document.body;
      rawText = captureLinkedInProfileText(mainContent);
    } else {
      const root = document.querySelector('main, [role="main"], article') || document.body;
      rawText = root.innerText || root.textContent || '';
      // Accessible embedded viewers and open shadow roots expose text outside the main DOM.
      document.querySelectorAll('iframe').forEach(frame => {
        try { rawText += '\n' + (frame.contentDocument?.body?.innerText || ''); } catch { /* Cross-origin frames require uploading the original document. */ }
      });
      document.querySelectorAll('*').forEach(el => {
        if (el.shadowRoot) rawText += '\n' + (el.shadowRoot.textContent || '');
      });
    }
  }
  const pdfViewer = document.querySelector('pdf-viewer, embed[type="application/pdf"]');
  if (pdfViewer && pdfViewer.shadowRoot) {
    rawText += '\n' + (pdfViewer.shadowRoot.textContent || '');
  }

  let profile = {
    source: 'web',
    sourceUrl: url,
    rawPageText: rawText.trim(),
    name: '',
    email: '',
    phone: '',
    title: '',
    company: '',
    location: '',
    avatarUrl: '',
    skills: [],
    experience: [],
    education: [],
    summary: '',
    resume_text: ''
  };

  if (selection.length >= 30) {
    profile.rawPageText = selection;
    profile.resume_text = selection;
    profile.source = 'Selected text';
    return profile;
  }

  if (isHost('linkedin.com')) {
    parseLinkedInProfile(profile);
  } else if (isHost('github.com')) {
    parseGitHubProfile(profile);
  } else if (isHost('indeed.com')) {
    parseIndeedProfile(profile);
  } else {
    parseGenericProfile(profile);
  }

  // Final cleanup & formatting
  profile.name = cleanText(profile.name);
  profile.title = cleanText(profile.title);
  profile.company = cleanText(profile.company);
  profile.location = cleanText(profile.location);

  return profile;
}

function cleanText(str) {
  if (!str) return '';
  return str.replace(/\s+/g, ' ')
            .replace(/^\s*\(\d+\+?\)\s*/, '')
            .replace(/\s*[\(\·\•\-]?\s*(He\/Him|She\/Her|They\/Them|1st|2nd|3rd\+?|Verified)\s*[\)]?/gi, '')
            .trim();
}

function nodeText(el) {
  return (el?.innerText || el?.textContent || '').trim();
}

function captureLinkedInProfileText(mainContent) {
  const blocks = [];
  const seen = new Set();
  const noiseSelector = [
    'button', 'nav', 'footer', 'select', 'option', 'input', 'textarea',
    '[role="button"]', '[role="menu"]', '[role="listbox"]', '[role="option"]',
    '[role="combobox"]', '[role="dialog"]',
    '[aria-label*="language" i]', '[aria-label*="locale" i]',
    '[id*="language" i]', '[id*="locale" i]', '[id*="global-footer" i]',
    '[class*="language" i]', '[class*="locale" i]', '[class*="dropdown" i]',
    '[class*="recommendation" i]', '[class*="aside" i]', '[class*="global-footer" i]',
    '[class*="activity" i]', '[class*="feed-shared" i]', '[class*="social-details" i]',
    'script', 'style'
  ].join(', ');

  const cleanClone = element => {
    const clone = element.cloneNode(true);
    clone.querySelectorAll(noiseSelector).forEach(node => node.remove());
    return clone;
  };

  const append = element => {
    if (!element || seen.has(element)) return;
    seen.add(element);
    const clone = cleanClone(element);
    const text = nodeText(clone);
    if (text) blocks.push(text);
  };

  append(mainContent.querySelector('.pv-top-card') || mainContent.querySelector('.ph5') || mainContent.querySelector('section.artdeco-card'));
  [
    ['about'], ['experience'], ['education'], ['skills'],
    ['licenses & certifications', 'certifications', 'licenses'],
    ['projects'], ['volunteering'], ['publications'], ['honors'], ['courses'],
  ].forEach(keywords => append(getSectionByHeader(keywords)));

  return blocks.join('\n\n');
}

function getSectionByHeader(keywords) {
  // 1. Exact ID anchor search (<div id="experience">, <div id="education">, etc.)
  for (const kw of keywords) {
    const anchor = document.getElementById(kw) || document.querySelector(`[id="${kw}"]`) || document.querySelector(`a[name="${kw}"]`);
    if (anchor) {
      let cur = anchor;
      while (cur && cur !== document.body) {
        if (cur.tagName === 'SECTION' || (cur.classList && (cur.classList.contains('artdeco-card') || cur.classList.contains('pv-profile-card')))) {
          return cur;
        }
        cur = cur.parentElement;
      }
      if (anchor.parentElement) return anchor.parentElement;
    }
  }

  // 2. Card container search using firstWord matching to handle duplicated screen-reader headers
  const cards = document.querySelectorAll('section, div.artdeco-card, div.pv-profile-card');
  for (const card of cards) {
    const cardId = (card.id || '').toLowerCase();
    const cardClass = (card.className || '').toLowerCase();

    // Skip non-work section cards
    if (cardId.includes('featured') || cardId.includes('activity') || cardId.includes('recommendation') || cardId.includes('post') || cardId.includes('skill') || cardId.includes('interest') ||
        cardClass.includes('featured') || cardClass.includes('activity') || cardClass.includes('recommendation') || cardClass.includes('post') || cardClass.includes('skill') || cardClass.includes('interest')) {
      continue;
    }

    const headers = card.querySelectorAll('h2, h3, h4, .pvs-header__title, [class*="pvs-header"]');
    for (const h of headers) {
      const rawTxt = nodeText(h).toLowerCase();
      const words = rawTxt.split(/\s+/);
      const firstWord = words[0] || '';

      const isMatch = keywords.some(k => 
        firstWord === k || 
        rawTxt === k || 
        rawTxt === 'work experience' ||
        rawTxt === 'academic education'
      );

      if (isMatch && !rawTxt.includes('featured') && !rawTxt.includes('activity') && !rawTxt.includes('recommendation') && !rawTxt.includes('volunteering') && !rawTxt.includes('project')) {
        return card;
      }
    }
  }
  return null;
}

function parseLinkedInProfile(p) {
  p.source = 'LinkedIn';

  // 1. Candidate Name
  const nameElements = document.querySelectorAll('h1.text-heading-xlarge, .pv-text-details__left-panel h1, h1.v-card-name, .ph5 h1, div.pv-top-card-v2 h1, h1');
  for (const el of nameElements) {
    const text = nodeText(el).split('\n')[0].replace(/^\s*\(\d+\+?\)\s*/, '').trim();
    if (text && text.length > 1 && !text.includes('LinkedIn') && !text.includes('Search')) {
      p.name = text;
      break;
    }
  }

  const ogTitle = document.querySelector('meta[property="og:title"]');
  const pageTitle = document.title;
  const rawTitle = ogTitle ? ogTitle.content : pageTitle;

  if (!p.name || p.name.length < 2) {
    if (rawTitle) {
      const namePart = rawTitle.replace(/^\s*\(\d+\+?\)\s*/, '').split('-')[0].split('|')[0].split('–')[0].trim();
      if (namePart && namePart !== 'LinkedIn') {
        p.name = namePart;
      }
    }
  }

  // 2. Headline / Role Title
  const topCardRoot = document.querySelector('.ph5, .pv-text-details__left-panel, .pv-top-card-v2-ctas, section.artdeco-card:first-of-type') || document;
  const headlineElements = topCardRoot.querySelectorAll('.pv-text-details__left-panel .text-body-medium, .top-card-layout__headline, .ph5 .text-body-medium, .text-body-medium, div.pv-top-card-v2-ctas div.text-body-small, div.text-body-medium');
  for (const el of headlineElements) {
    const text = nodeText(el);
    if (text && text.length > 2 && 
        !text.includes('connection') && 
        !text.includes('follower') && 
        !text.includes('mutual') &&
        !text.includes('Contact info') &&
        !looksLikeCredential(text) &&
        text.toLowerCase() !== 'linkedin') {
      p.title = text;
      break;
    }
  }

  if ((!p.title || p.title.length < 3) && rawTitle && rawTitle.includes('-')) {
    const parts = rawTitle.split('-');
    if (parts.length > 1) {
      const headlineCandidate = parts[1].split('|')[0].trim();
      if (headlineCandidate && headlineCandidate.toLowerCase() !== 'linkedin') {
        p.title = headlineCandidate;
      }
    }
  }

  // 3. Location
  const locationElements = document.querySelectorAll('.pv-text-details__left-panel span.text-body-small, span.text-body-small.inline, span.text-body-small, .top-card-layout__first-subheadline, .ph5 span.text-body-small');
  for (const el of locationElements) {
    const text = nodeText(el);
    if (text && text.length > 2 && 
        !text.includes('connection') && 
        !text.includes('follower') && 
        !text.includes('mutual') &&
        !text.includes('following') &&
        !text.includes('Show all')) {
      const cleanLoc = text.split('·')[0].replace('Contact info', '').trim();
      if (cleanLoc && cleanLoc.length > 2 && !cleanLoc.includes('followers')) {
        p.location = cleanLoc;
        break;
      }
    }
  }

  // 4. Current Company — scoped strictly to the profile top-card header area
  // to avoid picking up company links from the sidebar or suggested profiles
  const profileTopCard = document.querySelector(
    '.pv-top-card-v2-ctas, .ph5, .pv-top-card--list, .pv-text-details__left-panel, ' +
    '.pv-text-details__right-panel, section.artdeco-card:first-of-type'
  );
  const companySearchRoot = profileTopCard || document.body;

  // Try the most reliable selectors first, all scoped to the top card
  const companySelectors = [
    'button[aria-label*="Current company"]',
    'div[aria-label="Current company"]',
    'span[aria-label*="Current company"]',
    'ul.pv-text-details__right-panel li',
    '.pv-text-details__right-panel span',
  ];

  for (const sel of companySelectors) {
    const els = companySearchRoot.querySelectorAll(sel);
    for (const el of els) {
      const text = nodeText(el).split('\n')[0].trim();
      if (text && text.length > 1 &&
          text.toLowerCase() !== 'linkedin' &&
          !text.includes('connection') &&
          !text.includes('follower') &&
          !text.includes('Follow') &&
          !text.includes('Message') &&
          !text.includes('Connect') &&
          !text.includes('See all')) {
        p.company = text;
        break;
      }
    }
    if (p.company) break;
  }

  // 5. Avatar Image
  const avatarEl = document.querySelector('img.pv-top-card-profile-picture__image') || 
                   document.querySelector('img.pv-top-card-profile-picture__image--show') ||
                   document.querySelector('img.top-card__profile-image') ||
                   document.querySelector('img[alt*="profile picture"]') ||
                   document.querySelector('img[alt*="Profile"]');
  if (avatarEl) {
    p.avatarUrl = avatarEl.src;
  }

  // 6. About Section
  const aboutSection = getSectionByHeader(['about']);
  let bioSummaryText = '';
  if (aboutSection) {
    const aboutText = aboutSection.querySelector('.inline-show-more-text, span[aria-hidden="true"]');
    if (aboutText) bioSummaryText = nodeText(aboutText);
  }

  // 7. Robust Multi-Company & Grouped Experience Scraper
  const experiences = extractLinkedInExperiences();
  if (experiences.length === 0) {
    experiences.push(...parseExperienceFromRawText(p.rawPageText));
  }
  p.experience = experiences;

  let expTextFormatted = '';
  if (experiences.length > 0) {
    experiences.forEach((exp, idx) => {
      expTextFormatted += `${idx + 1}. ${exp.role || 'Role'}${exp.company ? ' at ' + exp.company : ''}\n`;
      if (exp.dates) expTextFormatted += `   Dates & Duration: ${exp.dates}\n`;
      if (exp.location) expTextFormatted += `   Location: ${exp.location}\n`;
      if (exp.description) expTextFormatted += `   Details: ${exp.description.replace(/\n+/g, ' ')}\n`;
      expTextFormatted += `\n`;
    });

    // Fallbacks if top card extraction missed company, title, or location
    const topExp = experiences[0];
    if (topExp) {
      if (!p.title || p.title.length < 3 || looksLikeCredential(p.title)) p.title = topExp.role;
      if (!p.company || p.company.toLowerCase() === 'linkedin') p.company = topExp.company;
      if (!p.location && topExp.location) p.location = topExp.location;
    }
  }

  // 8. Education Section Extraction
  const eduSection = getSectionByHeader(['education']);
  const educations = [];
  let eduTextFormatted = '';

  if (eduSection) {
    const mainEduUl = eduSection.querySelector('.pvs-list__outer-container > ul') || 
                      eduSection.querySelector('ul.pvs-list') || 
                      eduSection.querySelector('ul[class*="pvs-list"]') ||
                      Array.from(eduSection.querySelectorAll('ul')).find(u => 
                        !u.className.includes('action') && 
                        !u.className.includes('header') && 
                        u.querySelectorAll('li').length > 0
                      );
    if (mainEduUl) {
      const eduItems = Array.from(mainEduUl.children).filter(el => el.tagName === 'LI');
      eduItems.forEach((item) => {
        const spans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
          .filter(span => span.closest('ul') === mainEduUl)
          .map(s => nodeText(s))
          .filter(Boolean)
          .filter(txt => !txt.includes('Show all'));
        const uniqueSpans = spans.filter((txt, idx, arr) => arr.indexOf(txt) === idx);

        if (uniqueSpans.length >= 1) {
          const parsedEdu = parseEduSpans(uniqueSpans);
          if (parsedEdu.school && !educations.some(ed => ed.school === parsedEdu.school)) {
            educations.push(parsedEdu);
            eduTextFormatted += `${educations.length}. ${parsedEdu.school}${parsedEdu.degree ? ' - ' + parsedEdu.degree : ''} ${parsedEdu.dates ? '(' + parsedEdu.dates + ')' : ''}\n`;
          }
        }
      });
      p.education = educations;
    }
  }

  if (educations.length === 0) {
    const rawEdus = parseEducationFromRawText(eduSection ? nodeText(eduSection) : (p.rawPageText || ''));
    rawEdus.forEach(ed => {
      educations.push(ed);
      eduTextFormatted += `${educations.length}. ${ed.school}${ed.degree ? ' - ' + ed.degree : ''} ${ed.dates ? '(' + ed.dates + ')' : ''}\n`;
    });
    p.education = educations;
  }

  // 9. Skills Section
  const skillsSection = getSectionByHeader(['skills']);
  const skillSet = new Set(p.skills || []);
  if (skillsSection) {
    const skillSpans = skillsSection.querySelectorAll('span[aria-hidden="true"]');
    skillSpans.forEach(s => {
      const txt = nodeText(s);
      if (txt && txt.length < 50 && 
          !txt.includes('endorsement') && 
          !txt.includes('Skill') && 
          !txt.includes('Show all') &&
          !txt.includes('passed')) {
        skillSet.add(txt);
      }
    });
  }
  p.skills = Array.from(skillSet);

  // Compile Comprehensive Resume Text for ATS & ABOUT box
  let resumeBlock = `==================================================\n`;
  resumeBlock += `CANDIDATE: ${p.name}\n`;
  if (p.title) resumeBlock += `Headline: ${p.title}\n`;
  if (p.location) resumeBlock += `Location: ${p.location}\n`;
  if (p.company) resumeBlock += `Company: ${p.company}\n`;
  resumeBlock += `Source URL: ${p.sourceUrl}\n`;
  resumeBlock += `==================================================\n\n`;

  if (bioSummaryText) {
    resumeBlock += `ABOUT BIO:\n${bioSummaryText}\n\n`;
  }

  if (expTextFormatted) {
    resumeBlock += `WORK EXPERIENCE TIMELINE:\n${expTextFormatted}\n`;
  }

  if (eduTextFormatted) {
    resumeBlock += `EDUCATION:\n${eduTextFormatted}\n`;
  }

  if (p.skills.length > 0) {
    resumeBlock += `SKILLS:\n${p.skills.join(', ')}\n`;
  }

  p.summary = resumeBlock;
  p.resume_text = resumeBlock;

}

function parseJobSpans(spans) {
  let role = '';
  let company = '';
  let dates = '';
  let location = '';
  let description = '';

  const dateRegex = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December|\d{4}|Present|Current)\b/i;
  const durationRegex = /\b(\d+\s*(yrs?|years?|mos?|months?))\b/i;
  const empTypeRegex = /^\s*(Full-time|Part-time|Contract|Freelance|Self-employed|Internship|Apprenticeship|Seasonal)\s*$/i;
  const locationish = s => /(Remote|Hybrid|On-site|India|United States|USA|Canada|Europe|Maharashtra|District|Area|Nashik|Pune|Mumbai|Delhi|Bengaluru|Bangalore|Hyderabad|Chennai|Kolkata)/i.test(s);
  const skillish = s => /\b(skills?|accounting|reporting|taxation|power bi|sql|excel|problem solving|negotiation)\b/i.test(s);

  const remaining = [];

  for (const s of spans) {
    if (s.startsWith('Skills:') || s.startsWith('Skills :') || skillish(s)) {
      description = s;
    } else if (!dates && (dateRegex.test(s) || durationRegex.test(s))) {
      dates = s;
    } else if (empTypeRegex.test(s)) {
      // skip standalone emp type label
    } else {
      remaining.push(s);
    }
  }

  if (remaining.length > 0) role = remaining[0];
  if (remaining.length > 1) {
    const second = remaining[1];
    if (locationish(second)) {
      location = second.split('·')[0].trim();
    } else {
      company = second.split('·')[0].split('(')[0].trim();
    }
  }
  if (remaining.length > 2) {
    const candidateLoc = remaining[2];
    if (!candidateLoc.startsWith('Skills:') && !skillish(candidateLoc) && candidateLoc.length < 80) {
      location = candidateLoc.split('·')[0].trim();
    }
  }

  // Reject non-job items (e.g. hashtags, post prose, recommendation text)
  if (role.includes('#') || role.length > 120 || (company && company.includes('#')) || isLinkedInEngagementText(role) || isLinkedInEngagementText(company)) {
    return { role: '', company: '', dates: '', location: '', description: '' };
  }

  return { role, company, dates, location, description };
}

function isLinkedInEngagementText(value) {
  const text = String(value || '').trim();
  return /\b\d[\d,.]*\s*[·•-]\s*\d[\d,.]*\s+comments?\b/i.test(text) ||
    (/\b(?:comments?|reactions?|likes?|reposts?)\b/i.test(text) && /^\s*\d[\d,.]*/.test(text));
}

function looksLikeCredential(text) {
  const lower = String(text || '').toLowerCase();
  return /\b(certificate|certification|credential|license|licence|course|learning|issued by|certx|live)\b/.test(lower);
}

function parseEduSpans(spans) {
  let school = '';
  let degree = '';
  let dates = '';

  const dateRegex = /\b(\d{4})\b/;
  const remaining = [];

  if (spans.some(isLinkedInEngagementText)) return { school: '', degree: '', dates: '' };

  for (const s of spans) {
    if (!dates && dateRegex.test(s)) {
      dates = s;
    } else {
      remaining.push(s);
    }
  }

  if (remaining.length > 0) school = remaining[0];
  if (remaining.length > 1) degree = remaining[1];

  if (isLinkedInEngagementText(school) || /^grade\s*:?\s*[a-f][+-]?$/i.test(school)) {
    return { school: '', degree: '', dates: '' };
  }

  return { school, degree, dates };
}

function parseEducationFromRawText(text) {
  const educations = [];
  if (!text) return educations;

  const match = text.match(/(?:Education|Qualifications|Academic History)\s*\n([\s\S]*?)(?=\n(?:Skills|Licenses|Certifications|Languages|Projects|Honors|Volunteering|Experience)|$)/i);
  if (!match) return educations;

  const lines = match[1].split('\n').map(l => l.trim()).filter(Boolean);
  let cur = null;

  for (const line of lines) {
    if (line.includes('Show all') || line.length < 2) continue;
    if (isLinkedInEngagementText(line) || /^grade\s*:?\s*[a-f][+-]?$/i.test(line)) continue;

    if (/\b(\d{4})\b/.test(line)) {
      if (cur && !cur.dates) cur.dates = line;
    } else if (line.length <= 100) {
      if (!cur) {
        cur = { school: line, degree: '', dates: '' };
        educations.push(cur);
      } else if (!cur.degree && line !== cur.school) {
        cur.degree = line;
      } else {
        cur = { school: line, degree: '', dates: '' };
        educations.push(cur);
      }
    }
  }
  return educations;
}

function looksLikeExperienceRole(value) {
  const role = String(value || '').trim();
  if (!role || role.length > 90) return false;
  if (/^(?:united states|usa|canada|india|united kingdom|remote|hybrid|on-site)(?:\s*[·,|-].*)?$/i.test(role)) return false;
  if (/^(?:at\b|i\b|my\b|in my\b|as a\b|as an\b|responsible for\b|spearheaded\b|developed\b|helped\b|led\b|focused on\b)/i.test(role)) return false;
  if (/\bI\s+(?:play|am|have|lead|manage|work|focus|help|develop|drive)\b/i.test(role)) return false;
  if (/[.!?]/.test(role)) return false;
  return true;
}

function cleanExperienceArray(expList) {
  if (!Array.isArray(expList)) return [];

  const junkRoleTerms = [
    'happy for you', 'deserves this', 'congrats', 'congratulations', 
    'book an appointment', 'appointment', 'like', 'comment', 'repost', 
    'more', '... more', 'edited', '2nd', '3rd', '1st', 'follower', 'connection', 
    'messaging', 'notifications', 'show all'
  ];

  return expList.filter(e => {
    const r = (e.role || '').toLowerCase().trim();
    const c = (e.company || '').toLowerCase().trim();
    const combined = `${r} ${c} ${(e.dates || '').toLowerCase()} ${(e.description || '').toLowerCase()}`;

    if (!r || r.length < 2) return false;
    if (isLinkedInEngagementText(r) || isLinkedInEngagementText(c) || isLinkedInEngagementText(e.dates)) return false;
    if (looksLikeCredential(combined)) return false;

    // LinkedIn activity cards can leak into the Experience card on some layouts.
    // They tend to contain prose and relative post ages rather than employment dates.
    if (!/\b(?:19|20)\d{2}\b/.test(String(e.dates || '')) && /\b\d+\s*(?:s|m|h|d|w|mo|mos|yr|yrs)\s*[·•-]?\s*$/i.test(String(e.dates || ''))) return false;
    if (!looksLikeExperienceRole(r) || /[!?]/.test(r) || /(^|\s)#\w+|\b(reposted|captured by|visit website)/i.test(r)) return false;

    // Reject exact button labels like "more", "... more", "show all", "comment"
    if (r === 'more' || r === '... more' || r === 'show all' || r === 'comment' || r === 'like' || r === 'repost') {
      return false;
    }

    // Reject connection badges or time tags at start of role or company (e.g. • 1st, • 2nd, 1w •)
    if (/^[\*\•\-\·\s]*(1st|2nd|3rd|\d+w|\d+d|\d+m)\b/i.test(r) || /^[\*\•\-\·\s]*(1st|2nd|3rd|\d+w|\d+d|\d+m)\b/i.test(c)) {
      return false;
    }

    // Reject role titles that match junk social comment phrases
    if (junkRoleTerms.some(t => r === t || r.startsWith(t + ' ') || r.includes('happy for you') || r.includes('deserves this'))) {
      return false;
    }

    // Reject hashtags or emojis in role or company
    if (r.startsWith('#') || c.startsWith('#')) return false;
    if (/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u.test(r) ||
        /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u.test(c)) {
      return false;
    }

    // Reject full sentences as role titles (job titles aren't >100 chars or full sentences with exclamation marks)
    if (r.length > 100 || r.includes('!')) return false;

    return true;
  });
}

function prepareResumeText(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/(Show all|reactions)(Experience|Education|Skills)(?=[A-Z])/gi, '$1\n$2:')
    .replace(/(Experience|Education|Skills)(?=[A-Z][a-z])/g, '$1:\n')
    .replace(/([a-z)])(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})/g, '$1\n$2 $3')
    .replace(/(Remote|Hybrid|On-site)(?=[A-Z])/g, '$1\n')
    .replace(/\b(\d+\s*(?:years?|yrs|yr|months?|mos|mo)(?:\s+\d+\s*(?:years?|yrs|yr|months?|mos|mo))*)(?=(?:Remote|Hybrid|On-site|[A-Z][a-z]))/gi, '$1\n')
    .replace(/([.!?])([A-Z][A-Za-z0-9&@.,'() /+-]{2,140}?\s*·\s*(?:Full-time|Part-time|Contract|Freelance|Self-employed|Internship|Apprenticeship|Seasonal))/g, '$1\n$2')
    .replace(/\s+(ABOUT|ABOUT BIO|SUMMARY|WORK EXPERIENCE(?: TIMELINE)?|EXPERIENCE|EMPLOYMENT HISTORY|PROFESSIONAL EXPERIENCE|EDUCATION|SKILLS):/gi, '\n$1:')
    .replace(/\s+(\d+\.\s+)/g, '\n$1')
    .replace(/\s+(Dates? & Duration:|Dates?:|Duration:|Location:|Details?:)/gi, '\n   $1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitCompactExperienceLine(line) {
  const employmentTypes = '(Full-time|Part-time|Contract|Freelance|Self-employed|Internship|Apprenticeship|Seasonal)';
  const match = String(line || '').match(new RegExp(`^(.+?)\\s*·\\s*${employmentTypes}$`));
  if (!match) return null;
  const combined = match[1].trim();
  const boundary = findRoleCompanyBoundary(combined);
  if (!boundary) return null;
  return {
    role: boundary.role,
    company: boundary.company
  };
}

function findRoleCompanyBoundary(combined) {
  const roleTail = /\b(associate|assistant|executive|specialist|manager|lead|director|head|trainee|intern|analyst|consultant|engineer|developer|artist|educator|strategist|writer|coordinator|administrator|recruiter|designer|architect|supervisor|officer|sde|scm|hr|sales|marketing|operations|supply chain)\b/i;
  const companyHint = /\b(inc|llc|ltd|limited|pvt|private|technologies|technology|systems|solutions|services|media|steel|amazon|flipkart|direct)\b/i;
  const candidates = [];

  for (let i = 2; i < combined.length - 1; i++) {
    const prev = combined[i - 1];
    const cur = combined[i];
    const next = combined[i + 1] || '';
    const isBoundary = prev !== ' ' && /[A-Z]/.test(cur) && /[a-z]/.test(next);
    if (!isBoundary) continue;

    const role = combined.slice(0, i).trim();
    const company = combined.slice(i).trim();
    if (role.length < 2 || role.length > 120 || company.length < 2 || company.length > 90) continue;
    if (!/[a-zA-Z]/.test(role) || !/[a-zA-Z]/.test(company)) continue;

    let score = 0;
    if (roleTail.test(role)) score += 10;
    if (companyHint.test(company)) score += 4;
    if (/^[A-Z][A-Za-z0-9&@.,'() /+-]+$/.test(company)) score += 2;
    if (role.split(/\s+/).length >= 2) score += 1;
    score -= Math.abs(company.split(/\s+/).length - 2) * 0.25;
    candidates.push({ role, company, score });
  }

  candidates.sort((a, b) => b.score - a.score || a.role.length - b.role.length);
  return candidates[0] || null;
}

function parseExperienceLines(lines) {
  const result = [];
  let cur = null;
  const push = () => {
    if (cur && cur.role) result.push(cur);
    cur = null;
  };

  lines.forEach(line => {
    const clean = line.replace(/^\d+\.\s*/, '').replace(/^\s*[-*]\s*/, '').trim();
    if (!clean) return;

    const compact = splitCompactExperienceLine(clean);
    const atMatch = clean.match(/^(.+?)\s+at\s+(.+)$/i);
    if (compact || atMatch) {
      push();
      cur = compact
        ? { role: compact.role, company: compact.company, dates: '', location: '', description: '' }
        : { role: atMatch[1].trim(), company: atMatch[2].trim(), dates: '', location: '', description: '' };
      return;
    }

    if (!cur) {
      cur = { role: clean, company: '', dates: '', location: '', description: '' };
      return;
    }

    if (/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December|\d{4}|Present|Current|yrs?|years?|mos?|months?)\b/i.test(clean) && !cur.dates) {
      cur.dates = clean;
    } else if (/(^|\s·\s)(Remote|Hybrid|On-site)$/i.test(clean) && !cur.location) {
      cur.location = clean;
    } else if (!cur.company && clean.length < 100 && !/^skills?:/i.test(clean)) {
      cur.company = clean.split(/[•·]/)[0].trim();
    } else {
      cur.description = [cur.description, clean].filter(Boolean).join('\n');
    }
  });

  push();
  return result;
}

function parseExperienceFromRawText(text) {
  const result = [];
  const prepared = prepareResumeText(text);
  const match = prepared.match(/(?:^|\n)(?:WORK EXPERIENCE(?: TIMELINE)?|EXPERIENCE|EMPLOYMENT HISTORY|PROFESSIONAL EXPERIENCE)\s*:?\s*([\s\S]*?)(?=\n(?:EDUCATION|SKILLS|LICENSES|CERTIFICATIONS|LANGUAGES|PROJECTS|HONORS|VOLUNTEERING)\b|$)/i);
  if (!match) return result;

  const section = match[1].trim();
  result.push(...parseExperienceLines(section.split('\n').map(line => line.trim()).filter(Boolean)));
  return cleanExperienceArray(result);
}

function parseExperienceFromSectionText(text) {
  const lines = String(text || '')
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter(line => !/^experience$/i.test(line) && !/^show all/i.test(line));

  const result = [];
  if (lines.length === 0) return result;

  const dateLine = line => /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)\s+\d{4}\s*[-–]\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)\s+\d{4}|Present|Current)|\b\d{4}\s*[-–]\s*(?:\d{4}|Present|Current)\b/i.test(line);
  const employmentLine = line => /\b(Full-time|Part-time|Contract|Freelance|Self-employed|Internship|Apprenticeship|Seasonal)\b/i.test(line);
  const locationLine = line => /(Remote|Hybrid|On-site|India|United States|USA|Canada|Europe|Maharashtra|District|Area|Nashik|Pune|Mumbai|Delhi|Bengaluru|Bangalore|Hyderabad|Chennai|Kolkata)/i.test(line);
  const skipLine = line => /^(helped me get this job|skills?:|financial accounting|taxation|problem solving|show all|linkedin)$/i.test(line) || looksLikeCredential(line);

  let defaultCompany = '';
  let startIndex = 0;
  if (lines.length >= 3 && !dateLine(lines[0]) && employmentLine(lines[1])) {
    defaultCompany = lines[0].split('·')[0].trim();
    startIndex = 2;
    while (startIndex < lines.length && (employmentLine(lines[startIndex]) || locationLine(lines[startIndex])) && !dateLine(lines[startIndex])) {
      startIndex++;
    }
  }

  let cur = null;
  const push = () => {
    const plausibleRole = looksLikeExperienceRole(cur?.role) && !/[!?#]/.test(cur.role) && !/\b(reposted|captured by|visit website|#\w+)/i.test(cur.role);
    if (plausibleRole && cur.company && dateLine(cur.dates) && !looksLikeCredential(`${cur.role} ${cur.company} ${cur.description}`)) result.push(cur);
    cur = null;
  };

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    if (skipLine(line)) continue;

    const next = lines[i + 1] || '';
    const after = lines[i + 2] || '';
    const looksLikeRole = !dateLine(line) && line.length <= 90 && (dateLine(next) || (employmentLine(next) && dateLine(after)));

    if (looksLikeRole) {
      push();
      let company = defaultCompany;
      if (employmentLine(next) && !dateLine(next)) {
        company = next.split('·')[0].trim() || company;
        i++;
      }
      cur = { role: line, company, dates: '', location: '', description: '' };
      continue;
    }

    if (!cur) continue;
    if (dateLine(line) && !cur.dates) {
      cur.dates = line;
    } else if (locationLine(line) && !cur.location && line.length <= 120) {
      cur.location = line;
    } else {
      cur.description = [cur.description, line.replace(/^\u2022\s*/, '')].filter(Boolean).join('\n');
    }
  }
  push();

  return cleanExperienceArray(result);
}

function extractLinkedInExperiences() {
  const experiences = [];
  const expSection = getSectionByHeader(['experience']);
  
  if (!expSection) return experiences;

  // Target the real list <ul> while ignoring header action bars (ul.pvs-header__actions)
  const mainUl = expSection.querySelector('.pvs-list__outer-container > ul') || 
                 expSection.querySelector('ul.pvs-list') || 
                 expSection.querySelector('ul[class*="pvs-list"]') ||
                 Array.from(expSection.querySelectorAll('ul')).find(u => 
                   !u.className.includes('action') && 
                   !u.className.includes('header') && 
                   u.querySelectorAll('li').length > 0
                 );
  
  if (!mainUl) return parseExperienceFromSectionText(nodeText(expSection));

  const topListItems = Array.from(mainUl.children).filter(el => el.tagName === 'LI');
  const hasEmploymentDateRange = value =>
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)\s+\d{4}\s*[-–]\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)\s+\d{4}|Present|Current)|\b(?:19|20)\d{2}\s*[-–]\s*(?:(?:19|20)\d{2}|Present|Current)\b/i.test(String(value || ''));

  topListItems.forEach(topLi => {
    const nestedUl = topLi.querySelector('ul');
    
    // A nested list is a sub-roles list ONLY if its items contain dates or durations
    const subListItems = nestedUl ? Array.from(nestedUl.children).filter(el => el.tagName === 'LI') : [];
    const isSubRolesList = subListItems.some(subLi => {
      const spans = Array.from(subLi.querySelectorAll('span[aria-hidden="true"]')).map(nodeText).filter(Boolean);
      const parsed = parseJobSpans([...new Set(spans)]);
      return looksLikeExperienceRole(parsed.role) && hasEmploymentDateRange(parsed.dates);
    });

    if (isSubRolesList) {
      const allSpans = Array.from(topLi.querySelectorAll('span[aria-hidden="true"], div.display-flex span'));
      const headerSpans = allSpans
        .filter(el => !nestedUl.contains(el))
        .map(el => nodeText(el))
        .filter(txt => txt.length > 0 && 
                       !txt.includes('Show all') && 
                       !txt.includes('skills') &&
                       !txt.includes('endorsement'));

      const uniqueHeaderSpans = headerSpans.filter((txt, idx, arr) => arr.indexOf(txt) === idx);

      const rawCompanyName = uniqueHeaderSpans[0] || 'Company';
      const companyName = rawCompanyName.split('·')[0].split('(')[0].trim();

      subListItems.forEach(subLi => {
        const subSpans = Array.from(subLi.querySelectorAll('span[aria-hidden="true"]'))
          .map(s => nodeText(s))
          .filter(Boolean)
          .filter(txt => !txt.includes('Show all'));

        const uniqueSubSpans = subSpans.filter((txt, idx, arr) => arr.indexOf(txt) === idx);

        if (uniqueSubSpans.length >= 1) {
          const parsed = parseJobSpans(uniqueSubSpans);
          
          const descNode = subLi.querySelector('.inline-show-more-text span[aria-hidden="true"], .inline-show-more-text');
          const desc = descNode ? nodeText(descNode) : '';

          if (looksLikeExperienceRole(parsed.role) && hasEmploymentDateRange(parsed.dates)) {
            experiences.push({
              role: parsed.role,
              company: companyName,
              dates: parsed.dates,
              location: parsed.location,
              description: desc || parsed.description
            });
          }
        }
      });
    } else {
      const spans = Array.from(topLi.querySelectorAll('span[aria-hidden="true"]'))
        .filter(el => !nestedUl || !nestedUl.contains(el))
        .map(s => nodeText(s))
        .filter(Boolean)
        .filter(txt => !txt.includes('Show all'));

      const uniqueSpans = spans.filter((txt, idx, arr) => arr.indexOf(txt) === idx);

      if (uniqueSpans.length >= 1) {
        const parsed = parseJobSpans(uniqueSpans);
        
        const descNode = topLi.querySelector('.inline-show-more-text span[aria-hidden="true"], .inline-show-more-text');
        const desc = descNode ? nodeText(descNode) : '';

        if (looksLikeExperienceRole(parsed.role) && hasEmploymentDateRange(parsed.dates)) {
          experiences.push({
            role: parsed.role,
            company: parsed.company,
            dates: parsed.dates,
            location: parsed.location,
            description: desc || parsed.description
          });
        }
      }
    }
  });

  const cleaned = cleanExperienceArray(experiences);
  return cleaned.length > 0 ? cleaned : parseExperienceFromSectionText(nodeText(expSection));
}

function parseGitHubProfile(p) {
  p.source = 'GitHub';
  const nameEl = document.querySelector('.p-name') || document.querySelector('h1.vcard-names');
  const nicknameEl = document.querySelector('.p-nickname');
  p.name = nameEl ? nameEl.innerText.split('\n')[0].trim() : (nicknameEl ? nicknameEl.innerText.trim() : '');
  
  const bioEl = document.querySelector('.p-note') || document.querySelector('[data-bio-text]');
  p.summary = bioEl ? bioEl.innerText.trim() : '';
  p.title = p.summary || 'Software Developer';

  const companyEl = document.querySelector('li[itemprop="worksFor"] span') || document.querySelector('.p-org');
  p.company = companyEl ? companyEl.innerText.replace('@', '').trim() : '';

  const locationEl = document.querySelector('li[itemprop="homeLocation"] span') || document.querySelector('.p-label');
  p.location = locationEl ? locationEl.innerText.trim() : '';

  const avatarEl = document.querySelector('img.avatar-user') || document.querySelector('.avatar');
  p.avatarUrl = avatarEl ? avatarEl.src : '';

  const langEls = document.querySelectorAll('[itemprop="programmingLanguage"]');
  const skillsSet = new Set();
  langEls.forEach(el => {
    if (el.innerText.trim()) skillsSet.add(el.innerText.trim());
  });
  p.skills = Array.from(skillsSet);

  p.resume_text = `GitHub Profile: ${p.name}\nBio: ${p.summary}\nCompany: ${p.company}\nLocation: ${p.location}\nSkills: ${p.skills.join(', ')}`;
}

function parseIndeedProfile(p) {
  p.source = 'Indeed';
  const nameEl = document.querySelector('h1') || document.querySelector('[data-testid="candidate-name"]');
  p.name = nameEl ? nameEl.innerText.trim() : '';

  const titleEl = document.querySelector('[data-testid="candidate-title"]') || document.querySelector('.resume-title');
  p.title = titleEl ? titleEl.innerText.trim() : '';

  const locationEl = document.querySelector('[data-testid="candidate-location"]') || document.querySelector('.location');
  p.location = locationEl ? locationEl.innerText.trim() : '';
  
  p.resume_text = `Indeed Resume: ${p.name}\nTitle: ${p.title}\nLocation: ${p.location}`;
}

function parseGenericProfile(p) {
  const isPdf = p.sourceUrl.toLowerCase().includes('.pdf') || document.title.toLowerCase().includes('.pdf');
  p.source = isPdf ? 'PDF Resume' : 'Web Profile';

  const navFilters = [
    'skip to main content', 'skip to content', 'skip navigation', 'navigation',
    'menu', 'sign in', 'log in', 'login', 'search', 'toggle', 'home', 'header',
    'footer', 'sidebar', 'resume.com', 'sample', 'template', 'privacy policy',
    'terms of service', 'cookie policy'
  ];

  function isInvalidName(str) {
    if (!str || str.length < 2 || str.length > 50) return true;
    const lower = str.toLowerCase().replace(/\s+/g, ' ').trim();
    return navFilters.some(filter => lower.includes(filter));
  }

  // 1. Candidate Name Extraction (Excluding nav/header/footer elements)
  let candName = '';
  const nameSelectors = document.querySelectorAll('.resume-header h1, .resume-name, [class*="candidate-name"], [class*="resume-title"]');
  for (const el of nameSelectors) {
    const txt = el.innerText.split('\n')[0].replace(/\s+/g, ' ').trim();
    if (!isInvalidName(txt)) {
      candName = txt;
      break;
    }
  }

  if (!candName) {
    const headings = document.querySelectorAll('h1, h2, h3, .name, [class*="name"], [id*="name"]');
    for (const h of headings) {
      if (h.closest('nav, header, footer, #header, #footer, .nav, .menu, .sr-only, .header, [aria-hidden="true"]')) {
        continue; // Skip any heading inside header, nav, or footer
      }
      const txt = h.innerText.split('\n')[0].replace(/\s+/g, ' ').trim();
      if (!isInvalidName(txt)) {
        candName = txt;
        break;
      }
    }
  }

  if (!candName) {
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const rawOg = ogTitle ? ogTitle.content : document.title;
    const cleanDoc = rawOg.replace(/\.pdf$/i, '').split('-')[0].split('|')[0].trim();
    if (!isInvalidName(cleanDoc)) {
      candName = cleanDoc;
    }
  }

  if (!candName) {
    const textLines = (p.rawPageText || '').split('\n')
      .map(l => l.replace(/\s+/g, ' ').trim())
      .filter(l => !isInvalidName(l) && l.length >= 3 && l.length <= 40 && !l.includes('http'));
    if (textLines.length > 0) {
      candName = textLines[0];
    }
  }

  p.name = candName;

  // 4. Location Extraction (City, State / Country)
  const locRegex = /([A-Z][a-zA-Z\s]+,\s*[A-Z]{2}(?:\s+[A-Z][a-zA-Z\s]+)?)/;
  const locMatch = (p.rawPageText || '').match(locRegex);
  if (locMatch && !isInvalidName(locMatch[1])) {
    p.location = locMatch[1].replace(/\s+/g, ' ').trim();
  }

  function isDateOrDuration(str) {
    if (!str) return false;
    const lower = str.toLowerCase().replace(/\s+/g, ' ').trim();
    const dateKeywords = [
      'present', 'current', 'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december',
      'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
      'yr', 'yrs', 'mo', 'mos', 'year', 'years', 'month', 'months'
    ];
    if (/\b(19|20)\d{2}\b/.test(lower) || dateKeywords.some(kw => lower.includes(kw))) {
      return true;
    }
    return false;
  }

  // 7. Experience Section Parsing (Company, Title, and Experience Text)
  let expTextFormatted = '';
  const expHeading = Array.from(document.querySelectorAll('h2, h3, h4, div, span')).find(el => {
    const t = el.innerText.trim().toLowerCase();
    return t === 'experience' || t === 'work experience' || t === 'employment history';
  });

  if (expHeading) {
    const expParent = expHeading.closest('section') || expHeading.parentElement;
    if (expParent) {
      expTextFormatted = expParent.innerText.replace(/^(experience|work experience|employment history)/i, '').trim();
      const subItems = Array.from(expParent.querySelectorAll('h3, h4, strong, b, div'))
        .map(i => i.innerText.replace(/\s+/g, ' ').trim())
        .filter(t => t.length >= 2 && t.length < 60 && !isInvalidName(t) && !isDateOrDuration(t) && t.toLowerCase() !== 'experience');

      if (subItems.length >= 1) p.company = subItems[0];
      if (subItems.length >= 2) {
        const rawRole = subItems[1].split('•')[0].split('·')[0].split('-')[0].trim();
        if (rawRole && !isDateOrDuration(rawRole)) {
          p.title = rawRole;
        }
      }
    }
  }

  // 8. Education Section Parsing
  let eduTextFormatted = '';
  const eduHeading = Array.from(document.querySelectorAll('h2, h3, h4, div, span')).find(el => {
    const t = el.innerText.trim().toLowerCase();
    return t === 'education' || t === 'academic history';
  });

  if (eduHeading) {
    const eduParent = eduHeading.closest('section') || eduHeading.parentElement;
    if (eduParent) {
      eduTextFormatted = eduParent.innerText.replace(/^(education|academic history)/i, '').trim();
    }
  }

  // 9. Summary Text Extraction
  let summaryText = '';
  const allElements = document.querySelectorAll('h2, h3, h4, strong, b, div');
  for (const el of allElements) {
    const txt = el.innerText.trim().toLowerCase();
    if (txt === 'summary' || txt === 'about' || txt === 'about me' || txt === 'profile') {
      const parent = el.closest('section') || el.parentElement;
      if (parent) {
        const nextP = parent.querySelector('p') || parent;
        if (nextP && nextP !== el) {
          summaryText = nextP.innerText.trim();
          break;
        }
      }
    }
  }

  // 10. Compile Full Structured Resume Payload for Sidepanel & ATS Candidate Profile
  let fullResume = `==================================================\n`;
  fullResume += `CANDIDATE: ${p.name}\n`;
  if (p.title) fullResume += `Headline: ${p.title}\n`;
  if (p.company) fullResume += `Company: ${p.company}\n`;
  if (p.location) fullResume += `Location: ${p.location}\n`;
  if (p.email) fullResume += `Email: ${p.email}\n`;
  if (p.phone) fullResume += `Phone: ${p.phone}\n`;
  fullResume += `Source: ${p.sourceUrl}\n`;
  fullResume += `==================================================\n\n`;

  if (summaryText) {
    fullResume += `SUMMARY:\n${summaryText}\n\n`;
  }

  if (expTextFormatted) {
    fullResume += `WORK EXPERIENCE:\n${expTextFormatted}\n\n`;
  }

  if (eduTextFormatted) {
    fullResume += `EDUCATION:\n${eduTextFormatted}\n\n`;
  }

  if (p.skills.length > 0) {
    fullResume += `SKILLS:\n${p.skills.join(', ')}\n\n`;
  }

  if (!expTextFormatted && p.rawPageText) {
    fullResume += `FULL DOCUMENT TEXT:\n${p.rawPageText.substring(0, 25000)}`;
  }

  p.summary = fullResume;
  p.resume_text = fullResume;
}
