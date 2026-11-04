import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.SOURCING_TEST_URL || 'http://127.0.0.1:5174';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 380, height: 850 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const saved = [];
const profile = { name: 'Avery Patel', title: 'Software Engineer', email: 'avery@example.org', skills: [], rawPageText: 'Avery Patel\nSoftware Engineer\nWORK EXPERIENCE\nBuilt reliable services for Example Company.', resume_text: 'Avery Patel\nFull employment history and education retained.', sourceUrl: 'https://example.org/avery', experience: [{ role: '<img src=x onerror=alert(1)>', company: 'Example', description: 'Complete experience description' }] };
let aiResponseProfile = profile;
let aiRequests = 0;
let aiUnavailable = false;
await page.addInitScript(profile => {
  window.fixtureProfile = profile;
  window.captureRequests = [];
  window.chrome = {
    windows: { getCurrent: async () => ({ id: 7 }) },
    storage: { local: { get: async () => ({ apiUrl: 'http://127.0.0.1:5174' }), set: async () => {} } },
    cookies: { get: async () => null }, runtime: {},
    tabs: {
      query: async query => { if (query.windowId !== 7) throw new Error('Wrong window'); return [{ id: 1, url: 'https://example.org/avery' }]; },
      sendMessage: async (_id, request) => { window.captureRequests.push(request); if (window.captureDelay) await new Promise(r => setTimeout(r, window.captureDelay)); return { success: true, profile: request.deepScan && window.deepFixtureProfile ? window.deepFixtureProfile : window.fixtureProfile }; },
      onActivated: { addListener: fn => { window.changeTab = fn; } },
      onUpdated: { addListener: () => {} },
    },
    scripting: { executeScript: async () => [] },
  };
}, profile);
await page.route('**/api/**', async route => {
  const url = route.request().url();
  let data = { data: [] };
  if (url.includes('/data/candidates') && route.request().method() === 'POST') {
    const body = route.request().postDataJSON(); saved.push(body); data = { data: { id: 'saved', ...body } };
  }
  if (url.includes('/parse-web-profile')) {
    aiRequests++;
    if (aiUnavailable) return route.fulfill({ status: 503, json: { error: 'AI temporarily unavailable' } });
    data = { success: true, profile: aiResponseProfile };
  }
  if (url.includes('/upload/resume')) data = { success: true, profile: { first_name: 'Jordan', last_name: 'Lee', skills: ['SQL'] }, extractedText: 'Jordan Lee complete document text', resume_file_key: 'resumes/example', resume_file_name: 'resume.docx', resume_file_size: 123 };
  await route.fulfill({ json: data });
});
try {
  await page.goto(`${base}/extension/sidepanel/sidepanel.html`);
  await page.locator('#previewCard:not(.hidden)').waitFor();
  assert.equal(await page.locator('#candName').inputValue(), 'Avery Patel');
  assert.equal(await page.locator('#candEmail').inputValue(), '', 'Email must be entered by the recruiter');
  assert.equal(await page.locator('#candPhone').inputValue(), '', 'Phone must be entered by the recruiter');
  assert.equal(await page.locator('#skillsInput').inputValue(), '');
  assert.equal(await page.locator('#candExperience img').count(), 0, 'Extracted markup must render as text');
  assert.match(await page.locator('#candSummary').inputValue(), /Full employment history/);
  await page.locator('#candEmail').fill('recruiter-entered@example.org');
  await page.locator('#candPhone').fill('555-010-2020');
  await page.locator('#skillsInput').fill('React, SQL, react');
  await page.locator('#importBtn').click();
  await page.waitForFunction(() => document.querySelector('#importBtn').textContent === 'Imported');
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].skills, ['react', 'SQL']);
  assert.equal(saved[0].internal_status, 'Sourced');
  assert.equal(saved[0].email, 'recruiter-entered@example.org');
  assert.equal(saved[0].phone, '555-010-2020');
  assert.match(saved[0].resume_text, /Full employment history/);
  assert.equal(await page.locator('#importBtn').isDisabled(), true);

  aiResponseProfile = {
    name: 'Wrong Person', title: 'LIVE', company: 'CMSR Consultants',
    experience: [{ role: 'CMSR Consultants', company: 'CMSR Consultants', description: 'Desi Nasl Sudhaar video post' }],
    education: [{ school: 'Desi Nasl Sudhaar: Why Indigenous Cattle Breeds Matter' }],
    skills: ['Cattle Breeds'], summary: 'Unrelated LinkedIn post text'
  };
  await page.evaluate(() => {
    window.fixtureProfile = {
      ...window.fixtureProfile,
      name: 'Dr. Alok Juneja', source: 'LinkedIn', sourceUrl: 'https://www.linkedin.com/in/alok-juneja/',
      title: 'Consultant | Motivational Speaker', company: 'BAIF Development Research Foundation',
      experience: [
        { role: 'Ex Senior advisor', company: 'BAIF Development Research Foundation', dates: 'Nov 2024 - Oct 2025 · 1 yr', location: 'Hybrid', description: 'Actual work history from LinkedIn Experience.' },
        { role: 'Ex Vice President BAIF Development Research Foundation', company: 'BAIF Development Research Foundation', dates: 'Apr 2016 - Oct 2024 · 8 yrs 7 mos', location: 'Pune District, Maharashtra, India', description: 'Led organizational programs.' }
      ],
      education: [{ school: 'University of Rajasthan', degree: 'Bachelor of Veterinary Science', dates: '1980 - 1985' }],
      skills: ['Livestock Development']
    };
  });
  await page.locator('#aiParseBtn').click();
  await page.waitForFunction(() => document.querySelector('#candSummary').value.includes('Ex Senior advisor at BAIF Development Research Foundation'));
  const linkedinResume = await page.locator('#candSummary').inputValue();
  assert.match(linkedinResume, /University of Rajasthan/);
  assert.match(linkedinResume, /Livestock Development/);
  assert.match(linkedinResume, /Ex Vice President BAIF Development Research Foundation/);
  assert.equal(await page.locator('#candTitle').inputValue(), 'Consultant | Motivational Speaker');
  assert.doesNotMatch(linkedinResume, /CMSR Consultants|Desi Nasl Sudhaar|Unrelated LinkedIn post|FULL DOCUMENT|\bLIVE\b/i);

  await page.locator('#resumeFile').setInputFiles({ name: 'resume.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('fixture') });
  await page.waitForFunction(() => document.querySelector('#candName').value === 'Jordan Lee');
  await page.locator('#importBtn').click();
  await page.waitForFunction(() => document.querySelector('#importBtn').textContent === 'Imported');
  assert.equal(saved[1].resume_file_key, 'resumes/example');
  assert.equal(saved[1].linkedin, null);

  // Reproduce the reported LinkedIn activity counters, including an older
  // content-script result feeding bad DOM skills into AI Smart Parse.
  aiResponseProfile = { name: 'Sri Krishna Das', skills: ['Brand Marketing', 'Invented Skill', 'LIVE', '11,061 · 91 comments'] };
  await page.evaluate(() => {
    window.fixtureProfile = {
      name: 'Sri Krishna Das', title: 'Brand Ambassador', company: 'ONPASSIVE', source: 'LinkedIn',
      sourceUrl: 'https://www.linkedin.com/in/skills-fixture/',
      rawPageText: 'Sri Krishna Das\nBrand Ambassador\nExperience\nONPASSIVE\nSkills\nBrand Marketing',
      skills: ['LIVE', '-', '11,061 · 91 comments', '6,671 · 83 comments', '1,747 · 13 comments', '1,205 · 18 comments', '3,982 · 71 comments'],
      experience: [], education: []
    };
  });
  await page.locator('#aiParseBtn').click();
  await page.waitForFunction(() => document.querySelector('#skillsInput').value === 'Brand Marketing');
  assert.deepEqual(await page.locator('#candSkills .tag').allTextContents(), ['Brand Marketing']);
  assert.doesNotMatch(await page.locator('#candSummary').inputValue(), /LIVE|comments|Invented Skill/);
  await page.locator('#importBtn').click();
  await page.waitForFunction(() => document.querySelector('#importBtn').textContent === 'Imported');
  assert.deepEqual(saved[2].skills, ['Brand Marketing']);
  aiResponseProfile = { name: 'Sri Krishna Das', skills: ['Digital Marketing'] };
  await page.evaluate(() => { window.fixtureProfile.rawPageText = 'Sri Krishna Das\nBrand Ambassador\nExperience\nONPASSIVE'; });
  await page.locator('#aiParseBtn').click();
  await page.waitForFunction(() => document.querySelector('#skillsInput').value === '' && !document.querySelector('#aiParseBtn').disabled);
  assert.equal(await page.locator('#candSkills .tag').count(), 0, 'No skills evidence means an empty list, not guessed skills');
  for (const width of [320, 380, 768, 1280]) {
    await page.setViewportSize({ width, height: 850 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Overflow at ${width}`);
  }
  await page.setViewportSize({ width: 380, height: 850 });
  await page.screenshot({ path: 'tests/sourcing-panel.png', fullPage: true });
  await page.evaluate(() => { window.captureDelay = 400; });
  await page.locator('#scrapeBtn').click();
  await page.evaluate(() => window.changeTab({ windowId: 7, tabId: 2 }));
  await page.waitForFunction(() => !document.querySelector('#scrapeBtn').disabled);
  assert.equal(await page.locator('#previewCard').isVisible(), false, 'Stale result must not replace review');
  assert.deepEqual(errors, []);
  const source = await browser.newPage();
  await source.setContent('<main><h1>Avery Patel</h1><p>avery@example.org</p><p>703-496-5085</p><p>Software Engineer with SQL experience</p></main>');
  await source.evaluate(() => {
    window.captureListeners = new Set();
    window.chrome = { runtime: { onMessage: { addListener: fn => window.captureListeners.add(fn), removeListener: fn => window.captureListeners.delete(fn) } } };
  });
  await source.addScriptTag({ path: 'extension/sidepanel/profile-utils.js' });
  await source.addScriptTag({ path: 'extension/content.js' });
  await source.addScriptTag({ path: 'extension/content.js' });
  const extracted = await source.evaluate(() => ({ profile: extractProfileData(), listeners: window.captureListeners.size, roles: cleanExperienceArray([{ role: 'C# Developer', company: 'Baltimore Software' }]) }));
  assert.equal(extracted.listeners, 1);
  assert.equal(extracted.profile.name, 'Avery Patel');
  assert.equal(extracted.profile.email, '');
  assert.equal(extracted.profile.phone, '');
  assert.equal(extracted.roles.length, 1);
  assert.equal(await source.evaluate(() => looksLikeExperienceRole('United States · Remote')), false, 'Location text must not be accepted as a job title');
  await source.close();

  const linkedin = await browser.newPage();
  await linkedin.route('https://www.linkedin.com/in/alok-juneja/', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<!doctype html><html><head><meta charset="utf-8"><title>Dr. Alok Juneja | LinkedIn</title></head><body>
      <main class="scaffold-layout__main">
        <section class="pv-top-card"><h1>Dr. Alok Juneja</h1><p>Consultant | Motivational Speaker</p></section>
        <section id="experience" class="artdeco-card"><h2>Experience</h2>
          <div class="pvs-list__outer-container"><ul class="pvs-list"><li>
            <span aria-hidden="true">BAIF Development Research Foundation · 9 yrs 7 mos</span>
            <ul><li><span aria-hidden="true">Ex Senior advisor</span><span aria-hidden="true">Part-time</span><span aria-hidden="true">Nov 2024 - Oct 2025 · 1 yr</span><span aria-hidden="true">Hybrid</span><span class="inline-show-more-text"><span aria-hidden="true">Actual work history from LinkedIn Experience.</span></span></li>
              <li><span aria-hidden="true">Ex Vice President BAIF Development Research Foundation</span><span aria-hidden="true">Full-time</span><span aria-hidden="true">Apr 2016 - Oct 2024 · 8 yrs 7 mos</span><span aria-hidden="true">Pune District, Maharashtra, India</span></li></ul>
          </li></ul></div>
          <div class="profile-extra">Robotics Engineer (SLAM)<br>Full-time<br>Jan 2021 - Present</div>
        </section>
        <section id="education" class="artdeco-card"><h2>Education</h2><div class="pvs-list__outer-container"><ul class="pvs-list"><li><span aria-hidden="true">University of Rajasthan</span><span aria-hidden="true">Bachelor of Veterinary Science</span><span aria-hidden="true">1980 - 1985</span><ul><li><span aria-hidden="true">Robotics Engineer (SLAM)</span><span aria-hidden="true">ML Engineer I (Computer Vision)</span></li></ul></li></ul></div></section>
        <section class="profile-activity artdeco-card"><h2>Activity</h2><div class="feed-shared-update-v2">Desi Nasl Sudhaar: Why Indigenous Cattle Breeds Matter · LIVE · unrelated comments</div></section>
        <div class="language-picker" aria-label="Language selection"><p>English (English)</p><p>Marathi (Marathi)</p><p>Français (French)</p></div>
        <footer><p>Help Center Privacy &amp; Terms LinkedIn Corporation © 2026</p><select><option>English (English)</option><option>Marathi (Marathi)</option></select></footer>
      </main></body></html>`
  }));
  await linkedin.goto('https://www.linkedin.com/in/alok-juneja/');
  await linkedin.addScriptTag({ path: 'extension/sidepanel/profile-utils.js' });
  await linkedin.addScriptTag({ path: 'extension/content.js' });
  const linkedinProfile = await linkedin.evaluate(() => extractProfileData());
  assert.equal(linkedinProfile.name, 'Dr. Alok Juneja');
  assert.match(linkedinProfile.rawPageText, /Ex Senior advisor/);
  assert.equal(linkedinProfile.experience.length, 2);
  assert.ok(linkedinProfile.experience.every(entry => !/Robotics Engineer/.test(entry.role)), 'Flattened text outside the structured role list must not append guessed jobs');
  assert.equal(linkedinProfile.experience[0].company, 'BAIF Development Research Foundation');
  assert.equal(linkedinProfile.experience[0].dates, 'Nov 2024 - Oct 2025 · 1 yr');
  assert.equal(linkedinProfile.experience[1].dates, 'Apr 2016 - Oct 2024 · 8 yrs 7 mos');
  assert.ok(linkedinProfile.experience.every(entry => !entry.dates.includes('9 yrs 7 mos')), 'Grouped company tenure must not be assigned to nested roles');
  assert.equal(linkedinProfile.education.length, 1);
  assert.equal(linkedinProfile.education[0].school, 'University of Rajasthan');
  assert.doesNotMatch(linkedinProfile.rawPageText, /Help Center|Privacy & Terms|English \(English\)|Marathi \(Marathi\)|unrelated comments/i);
  assert.doesNotMatch(linkedinProfile.resume_text, /Help Center|Privacy & Terms|English \(English\)|Marathi \(Marathi\)|unrelated comments/i);
  await linkedin.close();

  const grouped = await browser.newPage();
  await grouped.route('https://www.linkedin.com/in/adriana-rivera/', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<!doctype html><html><head><meta charset="utf-8"><title>Adriana Rivera | LinkedIn</title></head><body>
      <main class="scaffold-layout__main">
        <section class="pv-top-card"><h1>Adriana Rivera</h1><p>Clinical Operations Specialist | Healthcare Operations</p></section>
        <section id="experience" class="artdeco-card"><h2>Experience</h2>
          <div class="pvs-list__outer-container"><ul class="pvs-list">
            <li><span aria-hidden="true">Care Coordinator</span><span aria-hidden="true">Atria Institute · Full-time</span><span aria-hidden="true">Sep 2024 - Nov 2025 · 1 yr 3 mos</span><span aria-hidden="true">United States · Remote</span></li>
            <li><span aria-hidden="true">Weill Cornell Medicine</span><span aria-hidden="true">8 yrs</span><ul>
              <li><span aria-hidden="true">Senior medical secretary</span><span aria-hidden="true">Full-time</span><span aria-hidden="true">Oct 2017 - Sep 2024 · 7 yrs</span><span aria-hidden="true">Remote</span><span aria-hidden="true">Electronic Medical Record (EMR), Administration and +9 skills</span></li>
              <li><span aria-hidden="true">Patient Coordinator</span><span aria-hidden="true">Oct 2016 - Sep 2024 · 8 yrs</span><span aria-hidden="true">Electronic Medical Record (EMR), Administration and +5 skills</span></li>
            </ul></li>
          </ul></div>
        </section>
        <section id="education" class="artdeco-card"><h2>Education</h2><div class="pvs-list__outer-container"><ul class="pvs-list"><li><span aria-hidden="true">Capella University</span><span aria-hidden="true">Bachelor's degree, Psychology</span><span aria-hidden="true">Oct 2023 - Mar 2025</span></li><li><span aria-hidden="true">Herbert H Lehman High School</span><span aria-hidden="true">2007 - 2010</span></li></ul></div></section>
      </main></body></html>`
  }));
  await grouped.goto('https://www.linkedin.com/in/adriana-rivera/');
  await grouped.addScriptTag({ path: 'extension/sidepanel/profile-utils.js' });
  await grouped.addScriptTag({ path: 'extension/content.js' });
  const groupedProfile = await grouped.evaluate(() => extractProfileData());
  assert.deepEqual(groupedProfile.experience.map(({ role, company }) => [role, company]), [
    ['Care Coordinator', 'Atria Institute'],
    ['Senior medical secretary', 'Weill Cornell Medicine'],
    ['Patient Coordinator', 'Weill Cornell Medicine']
  ]);
  assert.deepEqual(groupedProfile.education.map(({ school }) => school), ['Capella University', 'Herbert H Lehman High School']);

  // Exercise the screenshot's text-only layout through Quick Extract, AI review
  // and the final import payload, including skills loaded by the one-time retry.
  const mixedProfile = await grouped.evaluate(() => {
    document.querySelector('main').innerHTML = `<section class="pv-top-card"><h1>Pallavi Vinothkumar</h1></section>
      <section id="experience"><h2>Experience</h2>
        <div>Growth Manager - Vendor partnerships</div><div>Ignyte · Full-time</div><div>Sep 2024 - Jan 2026 · 1 yr 5 mos</div><div>United Arab Emirates · On-site</div><div>Manage vendor partnerships.</div>
        <div>Abacus Middle East</div><div>Full-time · 3 yrs</div><div>United Arab Emirates</div>
        <div>Senior Key Accounts Manager @ Abacus Cambridge Partners Middle East Ltd</div><div>Apr 2021 - Mar 2024 · 3 yrs</div><div>Hybrid</div>
        <div>Key Account Manager</div><div>Apr 2021 - Feb 2024 · 2 yrs 11 mos</div><div>Expanding relationships with existing customers.</div>
        <div>Business Development Manager</div><div>WMS - SAP Gold Partner · Full-time</div><div>Jun 2018 - Mar 2021 · 2 yrs 10 mos</div>
      </section><section id="skills"><h2>Skills</h2><div role="listitem"><h3>Vendor Management</h3><p>2 endorsements</p></div><div role="listitem"><p>Strategic Partnerships</p></div></section>`;
    return extractProfileData();
  });
  await page.evaluate(profile => {
    window.captureDelay = 0;
    window.captureRequests = [];
    window.fixtureProfile = { ...profile, skills: [] };
    window.deepFixtureProfile = profile;
  }, mixedProfile);
  await page.locator('#scrapeBtn').click();
  await page.waitForFunction(() => document.querySelector('#skillsInput').value === 'Vendor Management, Strategic Partnerships');
  assert.deepEqual(await page.evaluate(() => window.captureRequests.map(r => r.deepScan)), [false, true], 'Missing skills retry only once even when experience already exists');
  assert.equal(await page.locator('#candExperience > div').count(), 4);
  aiResponseProfile = { ...mixedProfile, experience: [{ role: 'Key Account Manager', company: 'Ignyte' }], skills: ['Wrong Skill'] };
  await page.locator('#aiParseBtn').click();
  await page.waitForFunction(() => !document.querySelector('#aiParseBtn').disabled);
  assert.equal(await page.locator('#candExperience > div').count(), 4);
  assert.deepEqual(await page.locator('#candSkills .tag').allTextContents(), ['Vendor Management', 'Strategic Partnerships']);
  await page.locator('#importBtn').click();
  await page.waitForFunction(() => document.querySelector('#importBtn').textContent === 'Imported');
  assert.match(saved.at(-1).resume_text, /Senior Key Accounts Manager @ Abacus Cambridge Partners Middle East Ltd at Abacus Middle East/);
  assert.match(saved.at(-1).resume_text, /Key Account Manager at Abacus Middle East/);
  assert.doesNotMatch(saved.at(-1).resume_text, /Key Account Manager at Ignyte|Manage vendor partnerships\. Abacus Middle East/);
  assert.deepEqual(saved.at(-1).skills, ['Vendor Management', 'Strategic Partnerships']);

  // Empty LinkedIn skills now trigger one automatic AI pass from experience,
  // preserving the source records and marking inferred suggestions on import.
  const responsibility = 'Negotiate supplier agreements and monitor vendor performance.';
  aiResponseProfile = {
    ...mixedProfile, skills: [], inferred_skills: [
      { skill: 'Contract Negotiation', evidence: responsibility },
      { skill: 'AWS', evidence: 'Deployed applications on AWS infrastructure.' },
    ],
  };
  await page.evaluate(({ profile, responsibility }) => {
    const inferredFixture = { ...profile, skills: [], rawPageText: `${profile.rawPageText}\n${responsibility}`, experience: profile.experience.map((e, i) => i === 0 ? { ...e, description: responsibility } : e) };
    window.fixtureProfile = inferredFixture;
    window.deepFixtureProfile = inferredFixture;
    window.captureRequests = [];
  }, { profile: mixedProfile, responsibility });
  const beforeAuto = aiRequests;
  await page.locator('#scrapeBtn').click();
  await page.waitForFunction(() => document.querySelector('#skillsInput').value === 'Contract Negotiation' && !document.querySelector('#aiParseBtn').disabled);
  assert.equal(aiRequests, beforeAuto + 1);
  assert.deepEqual(await page.evaluate(() => window.captureRequests.map(r => r.deepScan)), [false, true], 'Inference reuses the completed deep scan');
  assert.deepEqual(await page.locator('#candSkills .tag').allTextContents(), ['Contract Negotiation · AI inferred']);
  assert.match(await page.locator('#candSkills .tag').getAttribute('title'), /Negotiate supplier agreements/);
  assert.equal(await page.locator('#skillsInferenceHint').isVisible(), true);
  await page.locator('#importBtn').click();
  await page.waitForFunction(() => document.querySelector('#importBtn').textContent === 'Imported');
  assert.deepEqual(saved.at(-1).skills, ['Contract Negotiation']);
  assert.match(saved.at(-1).resume_text, /AI-INFERRED SKILLS \(suggestions from experience; review required\)/);
  assert.match(saved.at(-1).resume_text, /Evidence: Negotiate supplier agreements/);
  assert.doesNotMatch(saved.at(-1).resume_text, /\bAWS\b/);

  aiUnavailable = true;
  const beforeFailure = aiRequests;
  await page.locator('#scrapeBtn').click();
  await page.waitForFunction(() => !document.querySelector('#aiParseBtn').disabled && document.querySelector('#skillsInput').value === '');
  assert.equal(aiRequests, beforeFailure + 1);
  assert.equal(await page.locator('#candName').inputValue(), 'Pallavi Vinothkumar');
  assert.equal(await page.locator('#previewCard').isVisible(), true);
  assert.equal(await page.locator('#importBtn').isDisabled(), false, 'Failed AI must preserve the captured profile');
  assert.equal(await page.locator('#skillsInferenceHint').isVisible(), false);
  aiUnavailable = false;
  assert.deepEqual(errors, []);
  await grouped.close();
  console.log('PASS: sourcing flows, responsive widths, LinkedIn profile-section parsing, duration dates, AI/DOM priority, and footer/activity exclusion.');
} finally { await browser.close(); }
