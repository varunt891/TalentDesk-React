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
    const totalHeight = document.body.scrollHeight;
    let distance = 350;
    let scrolled = 0;
    
    const timer = setInterval(() => {
      window.scrollBy(0, distance);
      scrolled += distance;
      
      if (scrolled >= totalHeight || scrolled >= 4000) {
        clearInterval(timer);
        window.scrollTo(0, 0);
        setTimeout(resolve, 450);
      }
    }, 100);
  });
}

function extractProfileData() {
  const url = window.location.href;
  
  let rawText = '';
  if (document.body) {
    rawText = document.body.innerText || document.body.textContent || '';
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
            .replace(/He\/Him|She\/Her|They\/Them|1st|2nd|3rd\+|Verified/gi, '')
            .trim();
}

function getSectionByHeader(keywords) {
  const sections = document.querySelectorAll('section, div.pv-profile-card');
  for (const sec of sections) {
    const h2 = sec.querySelector('h2, h3, div.pvs-header__title, span.pvs-header__title');
    if (h2) {
      const txt = h2.innerText.toLowerCase();
      if (keywords.some(k => txt.includes(k))) {
        return sec;
      }
    }
  }
  for (const kw of keywords) {
    const anchor = document.querySelector(`#${kw}`) || document.querySelector(`[id*="${kw}"]`);
    if (anchor) {
      return anchor.closest('section') || anchor.closest('div.pv-profile-card') || anchor.parentElement;
    }
  }
  return null;
}

function parseLinkedInProfile(p) {
  p.source = 'LinkedIn';

  // 1. Candidate Name
  const nameElements = document.querySelectorAll('h1.text-heading-xlarge, .pv-text-details__left-panel h1, h1.v-card-name, .ph5 h1, div.pv-top-card-v2 h1, h1');
  for (const el of nameElements) {
    const text = el.innerText.split('\n')[0].trim();
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
      const namePart = rawTitle.split('-')[0].split('|')[0].split('–')[0].trim();
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

  // 4. Current Company
  const companyElements = document.querySelectorAll('button[aria-label*="Current company"], div[aria-label="Current company"], ul.pv-text-details__right-panel li, .pv-text-details__right-panel span, a[href*="/company/"]');
  for (const el of companyElements) {
    const text = el.innerText.split('\n')[0].trim();
    if (text && text.length > 1 && 
        text.toLowerCase() !== 'linkedin' && 
        !text.includes('connection') && 
        !text.includes('follower') &&
        !text.includes('Follow') &&
        !text.includes('Message')) {
      p.company = text;
      break;
    }
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
      expTextFormatted += `${idx + 1}. ${exp.role}\n`;
      if (exp.company) expTextFormatted += `   Company: ${exp.company}\n`;
      if (exp.dates) expTextFormatted += `   Dates & Duration: ${exp.dates}\n`;
      if (exp.location) expTextFormatted += `   Location: ${exp.location}\n`;
      if (exp.description) expTextFormatted += `   Details: ${exp.description.replace(/\n+/g, ' ')}\n`;
      expTextFormatted += `\n`;
    });

    // Fallbacks if top card extraction missed company, title, or location
    const topExp = experiences[0];
    if (!p.title || p.title.length < 3) p.title = topExp.role;
    if (!p.company || p.company.toLowerCase() === 'linkedin') p.company = topExp.company.split('·')[0].split('(')[0].trim();
    if (!p.location && topExp.location) p.location = topExp.location.split('·')[0].trim();
  }

  // 8. Education Section Extraction
  const eduSection = getSectionByHeader(['education']);
  const educations = [];
  let eduTextFormatted = '';

  if (eduSection) {
    const mainEduUl = eduSection.querySelector('div.pvs-list__outer-container > ul') || 
                      eduSection.querySelector('ul.pvs-list') || 
                      eduSection.querySelector('ul');
    if (mainEduUl) {
      const eduItems = Array.from(mainEduUl.children).filter(el => el.tagName === 'LI');
      eduItems.forEach((item) => {
        const spans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
          .map(s => s.innerText.trim())
          .filter(Boolean)
          .filter(txt => !txt.includes('Show all'));
        const uniqueSpans = spans.filter((txt, idx, arr) => arr.indexOf(txt) === idx);

        if (uniqueSpans.length >= 1) {
          const school = uniqueSpans[0] || 'Institution';
          const degree = uniqueSpans[1] || '';
          const dates = uniqueSpans[2] || '';
          if (school && !educations.some(ed => ed.school === school)) {
            educations.push({ school, degree, dates });
            eduTextFormatted += `${educations.length}. ${school}${degree ? ' - ' + degree : ''} ${dates ? '(' + dates + ')' : ''}\n`;
          }
        }
      });
      p.education = educations;
    }
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

  // 10. STRICT Contact Info Modal Extraction ONLY
  const contactModal = document.querySelector('.pv-contact-info') || document.querySelector('.artdeco-modal');
  if (contactModal) {
    const emailLink = contactModal.querySelector('.ci-email .pv-contact-info__contact-link, a[href^="mailto:"]');
    if (emailLink) {
      p.email = emailLink.innerText.trim() || emailLink.href.replace('mailto:', '').split('?')[0];
    }
    const phoneSpan = contactModal.querySelector('.ci-phone .pv-contact-info__contact-link');
    if (phoneSpan) {
      p.phone = phoneSpan.innerText.trim();
    }
  }
}

function extractLinkedInExperiences() {
  const experiences = [];
  const expSection = getSectionByHeader(['experience']);
  
  if (!expSection) return experiences;

  const mainUl = expSection.querySelector('div.pvs-list__outer-container > ul') || 
                 expSection.querySelector('ul.pvs-list') || 
                 expSection.querySelector('ul');
  
  if (!mainUl) return experiences;

  const topListItems = Array.from(mainUl.children).filter(el => el.tagName === 'LI');

  topListItems.forEach(topLi => {
    const nestedUl = topLi.querySelector('ul');

    if (nestedUl) {
      const allSpans = Array.from(topLi.querySelectorAll('span[aria-hidden="true"], div.display-flex span'));
      const headerSpans = allSpans
        .filter(el => !nestedUl.contains(el))
        .map(el => el.innerText.trim())
        .filter(txt => txt.length > 0 && 
                       !txt.includes('Show all') && 
                       !txt.includes('skills') &&
                       !txt.includes('endorsement'));

      const uniqueHeaderSpans = headerSpans.filter((txt, idx, arr) => arr.indexOf(txt) === idx);

      const companyName = uniqueHeaderSpans[0] || 'Company';
      const totalDuration = uniqueHeaderSpans[1] || '';

      const subListItems = Array.from(nestedUl.children).filter(el => el.tagName === 'LI');

      subListItems.forEach(subLi => {
        const subSpans = Array.from(subLi.querySelectorAll('span[aria-hidden="true"]'))
          .map(s => s.innerText.trim())
          .filter(Boolean)
          .filter(txt => !txt.includes('skills') && !txt.includes('Show all'));

        const uniqueSubSpans = subSpans.filter((txt, idx, arr) => arr.indexOf(txt) === idx);

        if (uniqueSubSpans.length >= 1) {
          const role = uniqueSubSpans[0];
          const dates = uniqueSubSpans[1] || '';
          const locOrDesc = uniqueSubSpans[2] || '';

          const descNode = subLi.querySelector('.inline-show-more-text span[aria-hidden="true"], .inline-show-more-text');
          const desc = descNode ? descNode.innerText.trim() : '';

          if (role && role.length > 1 && !experiences.some(e => e.role === role && e.company.includes(companyName))) {
            experiences.push({
              role: role,
              company: `${companyName}${totalDuration ? ' (' + totalDuration + ')' : ''}`.trim(),
              dates: dates,
              location: locOrDesc.includes('·') || locOrDesc.includes(',') || locOrDesc.includes('Area') || locOrDesc.includes('State') ? locOrDesc : '',
              description: desc
            });
          }
        }
      });
    } else {
      const spans = Array.from(topLi.querySelectorAll('span[aria-hidden="true"]'))
        .map(s => s.innerText.trim())
        .filter(Boolean)
        .filter(txt => !txt.includes('skills') && !txt.includes('Show all'));

      const uniqueSpans = spans.filter((txt, idx, arr) => arr.indexOf(txt) === idx);

      if (uniqueSpans.length >= 1) {
        const role = uniqueSpans[0];
        const comp = uniqueSpans[1] || '';
        const dates = uniqueSpans[2] || '';
        const loc = uniqueSpans[3] || '';

        const descNode = topLi.querySelector('.inline-show-more-text span[aria-hidden="true"], .inline-show-more-text');
        const desc = descNode ? descNode.innerText.trim() : '';

        if (role && role.length > 1 && !experiences.some(e => e.role === role && e.company === comp)) {
          experiences.push({
            role: role,
            company: comp,
            dates: dates,
            location: loc,
            description: desc
          });
        }
      }
    }
  });

  return experiences;
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
