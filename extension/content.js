// TalentDesk Content Script for Profile Sourcing (Grouped & Single Experience Parser)

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'PARSE_PROFILE') {
    if (request.deepScan) {
      performDeepScroll().then(() => {
        try {
          const data = extractProfileData();
          sendResponse({ success: true, profile: data });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      });
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
  return true;
});

async function performDeepScroll() {
  return new Promise((resolve) => {
    const expAnchor = document.querySelector('#experience') || 
                      document.querySelector('[id*="experience"]') || 
                      getSectionByHeader(['experience']);

    const eduAnchor = document.querySelector('#education') || 
                      document.querySelector('[id*="education"]') || 
                      getSectionByHeader(['education']);

    if (expAnchor) {
      expAnchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      window.scrollTo({ top: 1400, behavior: 'smooth' });
    }

    const hasExpItems = () => {
      const sec = getSectionByHeader(['experience']);
      if (!sec) return false;
      const items = sec.querySelectorAll('li, div.pvs-entity, [class*="pvs-list"] li');
      return items.length > 0;
    };

    let attempts = 0;
    const maxAttempts = 20; // 2.0 seconds max wait

    const checkInterval = setInterval(() => {
      attempts++;

      // Dispatch scroll event to window & document to trigger LinkedIn IntersectionObservers
      window.dispatchEvent(new Event('scroll'));
      document.dispatchEvent(new Event('scroll'));

      if (hasExpItems() || attempts >= maxAttempts) {
        clearInterval(checkInterval);

        if (eduAnchor && attempts < maxAttempts) {
          eduAnchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
          window.dispatchEvent(new Event('scroll'));
          document.dispatchEvent(new Event('scroll'));
        }

        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: 'instant' });
          setTimeout(resolve, 300);
        }, 300);
      } else {
        window.scrollBy(0, 350);
      }
    }, 100);
  });
}

function extractProfileData() {
  const url = window.location.href;
  
  let rawText = '';
  if (document.body) {
    if (url.includes('linkedin.com')) {
      const mainContent = document.querySelector('main.scaffold-layout__main') || 
                          document.querySelector('main') || 
                          document.querySelector('.profile-detail') ||
                          document.body;
      const clone = mainContent.cloneNode(true);
      clone.querySelectorAll('aside, .scaffold-layout__aside, .comments-list, .feed-shared-update-v2, [class*="comment"], [class*="recommendation"], [class*="aside"]').forEach(el => el.remove());
      rawText = clone.innerText || clone.textContent || '';
    } else {
      rawText = document.body.innerText || document.body.textContent || '';
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

  if (url.includes('linkedin.com')) {
    parseLinkedInProfile(profile);
  } else if (url.includes('github.com')) {
    parseGitHubProfile(profile);
  } else if (url.includes('indeed.com')) {
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
      const rawTxt = (h.innerText || h.textContent || '').trim().toLowerCase();
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
    const text = el.innerText.split('\n')[0].replace(/^\s*\(\d+\+?\)\s*/, '').trim();
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
  const headlineElements = document.querySelectorAll('.pv-text-details__left-panel .text-body-medium, div.text-body-medium, .top-card-layout__headline, .ph5 .text-body-medium, div.pv-top-card-v2-ctas div.text-body-small');
  for (const el of headlineElements) {
    const text = el.innerText.trim();
    if (text && text.length > 2 && 
        !text.includes('connection') && 
        !text.includes('follower') && 
        !text.includes('mutual') &&
        !text.includes('Contact info') &&
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
    const text = el.innerText.trim();
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
      const text = el.innerText.split('\n')[0].trim();
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
    if (aboutText) bioSummaryText = aboutText.innerText.trim();
  }

  // 7. Robust Multi-Company & Grouped Experience Scraper
  const experiences = extractLinkedInExperiences();
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
      if (!p.title || p.title.length < 3) p.title = topExp.role;
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
          .map(s => s.innerText.trim())
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
    const rawEdus = parseEducationFromRawText(eduSection ? eduSection.innerText : (document.body ? document.body.innerText : ''));
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
      const txt = s.innerText.trim();
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

  // 10. Contact Info Modal Extraction (open "Contact info" popup first, then click Quick Extract)
  const contactModal =
    document.querySelector('.pv-contact-info') ||
    document.querySelector('.artdeco-modal--is-open') ||
    document.querySelector('.artdeco-modal') ||
    document.querySelector('[role="dialog"]');

  if (contactModal) {
    // Email — try multiple selector patterns (LinkedIn has changed these over time)
    const emailEl =
      contactModal.querySelector('a[href^="mailto:"]') ||
      contactModal.querySelector('.ci-email a') ||
      contactModal.querySelector('[class*="email"] a') ||
      contactModal.querySelector('.pv-contact-info__contact-link');
    if (emailEl) {
      p.email = (emailEl.innerText.trim() || emailEl.href.replace('mailto:', '').split('?')[0]).trim();
    }

    // Phone — try multiple selector patterns
    const phoneEl =
      contactModal.querySelector('.ci-phone .pv-contact-info__contact-link') ||
      contactModal.querySelector('[class*="phone"] a') ||
      contactModal.querySelector('[class*="phone"] span.t-14');
    if (phoneEl) {
      p.phone = phoneEl.innerText.trim();
    }
  }

  // Regex fallback: scan the full raw page text for email
  // This works when the Contact Info modal is open because its text is in document.body.innerText
  if (!p.email) {
    const allEmails = (p.rawPageText || '').match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g);
    if (allEmails) {
      const validEmail = allEmails.find(e =>
        !e.includes('linkedin.com') &&
        !e.includes('example.com') &&
        !e.endsWith('.png') &&
        !e.endsWith('.jpg') &&
        !e.endsWith('.svg')
      );
      if (validEmail) p.email = validEmail;
    }
  }
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

  const remaining = [];

  for (const s of spans) {
    if (s.startsWith('Skills:') || s.startsWith('Skills :')) {
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
  if (remaining.length > 1) company = remaining[1].split('·')[0].split('(')[0].trim();
  if (remaining.length > 2) {
    const candidateLoc = remaining[2];
    if (!candidateLoc.startsWith('Skills:') && candidateLoc.length < 80) {
      location = candidateLoc.split('·')[0].trim();
    }
  }

  // Reject non-job items (e.g. hashtags, post prose, recommendation text)
  if (role.includes('#') || role.length > 120 || (company && company.includes('#'))) {
    return { role: '', company: '', dates: '', location: '', description: '' };
  }

  return { role, company, dates, location, description };
}

function parseEduSpans(spans) {
  let school = '';
  let degree = '';
  let dates = '';

  const dateRegex = /\b(\d{4})\b/;
  const remaining = [];

  for (const s of spans) {
    if (!dates && dateRegex.test(s)) {
      dates = s;
    } else {
      remaining.push(s);
    }
  }

  if (remaining.length > 0) school = remaining[0];
  if (remaining.length > 1) degree = remaining[1];

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

    if (!r || r.length < 2) return false;

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
    if (r.includes('#') || c.includes('#')) return false;
    if (/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u.test(r) ||
        /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u.test(c)) {
      return false;
    }

    // Reject full sentences as role titles (job titles aren't >100 chars or full sentences with exclamation marks)
    if (r.length > 100 || r.includes('!')) return false;

    return true;
  });
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
  
  if (!mainUl) return experiences;

  const topListItems = Array.from(mainUl.children).filter(el => el.tagName === 'LI');

  topListItems.forEach(topLi => {
    const nestedUl = topLi.querySelector('ul');
    
    // A nested list is a sub-roles list ONLY if its items contain dates or durations
    const isSubRolesList = nestedUl && Array.from(nestedUl.querySelectorAll('span[aria-hidden="true"]')).some(s => 
      /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December|\d{4}|Present|Current|yrs?|mos?)\b/i.test(s.innerText)
    );

    if (isSubRolesList) {
      const allSpans = Array.from(topLi.querySelectorAll('span[aria-hidden="true"], div.display-flex span'));
      const headerSpans = allSpans
        .filter(el => !nestedUl.contains(el))
        .map(el => el.innerText.trim())
        .filter(txt => txt.length > 0 && 
                       !txt.includes('Show all') && 
                       !txt.includes('skills') &&
                       !txt.includes('endorsement'));

      const uniqueHeaderSpans = headerSpans.filter((txt, idx, arr) => arr.indexOf(txt) === idx);

      const rawCompanyName = uniqueHeaderSpans[0] || 'Company';
      const companyName = rawCompanyName.split('·')[0].split('(')[0].trim();

      const subListItems = Array.from(nestedUl.children).filter(el => el.tagName === 'LI');

      subListItems.forEach(subLi => {
        const subSpans = Array.from(subLi.querySelectorAll('span[aria-hidden="true"]'))
          .map(s => s.innerText.trim())
          .filter(Boolean)
          .filter(txt => !txt.includes('Show all'));

        const uniqueSubSpans = subSpans.filter((txt, idx, arr) => arr.indexOf(txt) === idx);

        if (uniqueSubSpans.length >= 1) {
          const parsed = parseJobSpans(uniqueSubSpans);
          
          const descNode = subLi.querySelector('.inline-show-more-text span[aria-hidden="true"], .inline-show-more-text');
          const desc = descNode ? descNode.innerText.trim() : '';

          if (parsed.role && parsed.role.length > 1) {
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
        .map(s => s.innerText.trim())
        .filter(Boolean)
        .filter(txt => !txt.includes('Show all'));

      const uniqueSpans = spans.filter((txt, idx, arr) => arr.indexOf(txt) === idx);

      if (uniqueSpans.length >= 1) {
        const parsed = parseJobSpans(uniqueSpans);
        
        const descNode = topLi.querySelector('.inline-show-more-text span[aria-hidden="true"], .inline-show-more-text');
        const desc = descNode ? descNode.innerText.trim() : '';

        if (parsed.role && parsed.role.length > 1) {
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

  return cleanExperienceArray(experiences);
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

  const emailEl = document.querySelector('li[itemprop="email"] a');
  if (emailEl) {
    p.email = emailEl.innerText.trim() || emailEl.href.replace('mailto:', '');
  }

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

  p.name = candName || 'Candidate';

  // 2. Email Extraction
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const emailMatch = (p.rawPageText || '').match(emailRegex);
  if (emailMatch) {
    p.email = emailMatch[0];
  }

  // 3. Phone Extraction
  const phoneRegex = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
  const phoneMatch = (p.rawPageText || '').match(phoneRegex);
  if (phoneMatch) {
    p.phone = phoneMatch[0];
  }

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
