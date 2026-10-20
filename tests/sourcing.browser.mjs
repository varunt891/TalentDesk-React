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
await page.addInitScript(profile => {
  window.fixtureProfile = profile;
  window.chrome = {
    windows: { getCurrent: async () => ({ id: 7 }) },
    storage: { local: { get: async () => ({ apiUrl: 'http://127.0.0.1:5174' }), set: async () => {} } },
    cookies: { get: async () => null }, runtime: {},
    tabs: {
      query: async query => { if (query.windowId !== 7) throw new Error('Wrong window'); return [{ id: 1, url: 'https://example.org/avery' }]; },
      sendMessage: async () => { if (window.captureDelay) await new Promise(r => setTimeout(r, window.captureDelay)); return { success: true, profile: window.fixtureProfile }; },
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
  if (url.includes('/parse-web-profile')) data = { success: true, profile: aiResponseProfile };
  if (url.includes('/upload/resume')) data = { success: true, profile: { first_name: 'Jordan', last_name: 'Lee', skills: ['SQL'] }, extractedText: 'Jordan Lee complete document text', resume_file_key: 'resumes/example', resume_file_name: 'resume.docx', resume_file_size: 123 };
  await route.fulfill({ json: data });
});
try {
  await page.goto(`${base}/extension/sidepanel/sidepanel.html`);
  await page.locator('#previewCard:not(.hidden)').waitFor();
  assert.equal(await page.locator('#candName').inputValue(), 'Avery Patel');
  assert.equal(await page.locator('#skillsInput').inputValue(), '');
  assert.equal(await page.locator('#candExperience img').count(), 0, 'Extracted markup must render as text');
  assert.match(await page.locator('#candSummary').inputValue(), /Full employment history/);
  await page.locator('#skillsInput').fill('React, SQL, react');
  await page.locator('#importBtn').click();
  await page.waitForFunction(() => document.querySelector('#importBtn').textContent === 'Imported');
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].skills, ['react', 'SQL']);
  assert.equal(saved[0].internal_status, 'Sourced');
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
  await source.setContent('<main><h1>Avery Patel</h1><p>avery@example.org</p><p>Software Engineer with SQL experience</p></main>');
  await source.evaluate(() => {
    window.captureListeners = new Set();
    window.chrome = { runtime: { onMessage: { addListener: fn => window.captureListeners.add(fn), removeListener: fn => window.captureListeners.delete(fn) } } };
  });
  await source.addScriptTag({ path: 'extension/content.js' });
  await source.addScriptTag({ path: 'extension/content.js' });
  const extracted = await source.evaluate(() => ({ profile: extractProfileData(), listeners: window.captureListeners.size, roles: cleanExperienceArray([{ role: 'C# Developer', company: 'Baltimore Software' }]) }));
  assert.equal(extracted.listeners, 1);
  assert.equal(extracted.profile.name, 'Avery Patel');
  assert.equal(extracted.profile.email, 'avery@example.org');
  assert.equal(extracted.roles.length, 1);
  await source.close();

  const linkedin = await browser.newPage();
  await linkedin.route('https://www.linkedin.com/in/alok-juneja/', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<!doctype html><html><head><title>Dr. Alok Juneja | LinkedIn</title></head><body>
      <main class="scaffold-layout__main">
        <section class="pv-top-card"><h1>Dr. Alok Juneja</h1><p>Consultant | Motivational Speaker</p></section>
        <section id="experience" class="artdeco-card"><h2>Experience</h2>
          <div class="pvs-list__outer-container"><ul class="pvs-list"><li>
            <span aria-hidden="true">BAIF Development Research Foundation</span>
            <ul><li><span aria-hidden="true">Ex Senior advisor</span><span aria-hidden="true">Part-time</span><span aria-hidden="true">Nov 2024 - Oct 2025 · 1 yr</span><span aria-hidden="true">Hybrid</span><span class="inline-show-more-text"><span aria-hidden="true">Actual work history from LinkedIn Experience.</span></span></li>
              <li><span aria-hidden="true">Ex Vice President BAIF Development Research Foundation</span><span aria-hidden="true">Full-time</span><span aria-hidden="true">Apr 2016 - Oct 2024 · 8 yrs 7 mos</span><span aria-hidden="true">Pune District, Maharashtra, India</span></li></ul>
          </li></ul></div>
        </section>
        <section id="education" class="artdeco-card"><h2>Education</h2><div class="pvs-list__outer-container"><ul class="pvs-list"><li><span aria-hidden="true">University of Rajasthan</span><span aria-hidden="true">Bachelor of Veterinary Science</span><span aria-hidden="true">1980 - 1985</span></li></ul></div></section>
        <section class="profile-activity artdeco-card"><h2>Activity</h2><div class="feed-shared-update-v2">Desi Nasl Sudhaar: Why Indigenous Cattle Breeds Matter · LIVE · unrelated comments</div></section>
        <div class="language-picker" aria-label="Language selection"><p>English (English)</p><p>Marathi (Marathi)</p><p>Français (French)</p></div>
        <footer><p>Help Center Privacy &amp; Terms LinkedIn Corporation © 2026</p><select><option>English (English)</option><option>Marathi (Marathi)</option></select></footer>
      </main></body></html>`
  }));
  await linkedin.goto('https://www.linkedin.com/in/alok-juneja/');
  await linkedin.addScriptTag({ path: 'extension/content.js' });
  const linkedinProfile = await linkedin.evaluate(() => extractProfileData());
  assert.equal(linkedinProfile.name, 'Dr. Alok Juneja');
  assert.match(linkedinProfile.rawPageText, /Ex Senior advisor/);
  assert.equal(linkedinProfile.experience.length, 2);
  assert.equal(linkedinProfile.experience[0].company, 'BAIF Development Research Foundation');
  assert.equal(linkedinProfile.education.length, 1);
  assert.equal(linkedinProfile.education[0].school, 'University of Rajasthan');
  assert.doesNotMatch(linkedinProfile.rawPageText, /Help Center|Privacy & Terms|English \(English\)|Marathi \(Marathi\)|unrelated comments/i);
  assert.doesNotMatch(linkedinProfile.resume_text, /Help Center|Privacy & Terms|English \(English\)|Marathi \(Marathi\)|unrelated comments/i);
  await linkedin.close();
  console.log('PASS: sourcing flows, responsive widths, LinkedIn profile-section parsing, duration dates, AI/DOM priority, and footer/activity exclusion.');
} finally { await browser.close(); }
