import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const latest = 'Founding Member & Vice President Business Operations - Unoah Union';
const jobs = [
  [latest, 'Unoah · Full-time', 'Sep 2026 - Present · 3 mos', 'Dubai, United Arab Emirates · On-site'],
  ['Regional Sales Director', 'Confidential · Full-time', 'Jan 2026 - Present · 11 mos', 'United Arab Emirates · Hybrid'],
  ['Growth Manager - Vendor partnerships', 'Ignyte · Full-time', 'Sep 2024 - Jan 2026 · 1 yr 5 mos', 'United Arab Emirates · On-site'],
];

test('LinkedIn keeps the first current experience in text and structured layouts', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('https://www.linkedin.com/in/experience-fixture/', route => route.fulfill({
    contentType: 'text/html',
    body: '<main><section class="pv-top-card"><h1>Pallavi Vinothkumar</h1></section><section id="experience"><h2>Experience</h2><div id="jobs"></div></section></main>',
  }));
  await page.goto('https://www.linkedin.com/in/experience-fixture/');
  await page.evaluate(() => { window.chrome = { runtime: { onMessage: { addListener() {}, removeListener() {} } } }; });
  await page.addScriptTag({ path: 'extension/sidepanel/profile-utils.js' });
  await page.addScriptTag({ path: 'extension/content.js' });

  for (const structured of [false, true]) {
    await t.test(structured ? 'list with current-role badge' : 'text-only experience section', async () => {
      const profile = await page.evaluate(({ jobs, structured }) => {
        const rows = jobs.map((fields, index) => {
          const lines = fields.map(value => `<div><span aria-hidden="true">${value}</span></div>`).join('');
          const badge = index < 2 ? '<div><span aria-hidden="true">Present</span></div>' : '';
          return structured ? `<li>${badge}${lines}</li>` : `<div>${lines}${badge}</div>`;
        }).join('');
        document.getElementById('jobs').innerHTML = structured ? `<ul class="pvs-list">${rows}</ul>` : rows;
        return extractProfileData();
      }, { jobs, structured });
      assert.deepEqual(profile.experience.map(e => e.role), jobs.map(e => e[0]));
      assert.deepEqual(profile.experience.map(e => e.company), ['Unoah', 'Confidential', 'Ignyte']);
      assert.deepEqual(profile.experience.map(e => e.dates), jobs.map(e => e[2]));
      assert.equal(profile.title, latest);
      assert.equal(profile.company, 'Unoah');
      assert.match(profile.resume_text, /1\. Founding Member & Vice President/);
    });
  }

  await t.test('company group still supplies the company to its roles', async () => {
    const result = await page.evaluate(() => parseExperienceFromSectionText([
      'Experience', 'Abacus Middle East', 'Full-time · 3 yrs', 'United Arab Emirates',
      'Sales Director', 'Jan 2023 - Jan 2026 · 3 yrs', 'Hybrid',
      'Sales Manager', 'Jan 2022 - Dec 2022 · 1 yr',
    ].join('\n')));
    assert.deepEqual(result.map(e => [e.role, e.company]), [
      ['Sales Director', 'Abacus Middle East'], ['Sales Manager', 'Abacus Middle East'],
    ]);
  });
});
