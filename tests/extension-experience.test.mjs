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

  for (const structured of [false, true]) {
    await t.test(`mixed employers and nested Abacus roles (${structured ? 'DOM list' : 'text fallback'})`, async () => {
      const result = await page.evaluate(structured => {
        const block = values => values.map(v => `<div${/\.$/.test(v) ? ' class="inline-show-more-text"' : ''}><span aria-hidden="true">${v}</span></div>`).join('');
        const single = (values) => `<${structured ? 'li' : 'div'}>${block(values)}</${structured ? 'li' : 'div'}>`;
        const roles = [
          ['Senior Key Accounts Manager @ Abacus Cambridge Partners Middle East Ltd', 'Apr 2021 - Mar 2024 · 3 yrs', 'Hybrid'],
          ['Key Account Manager', 'Apr 2021 - Feb 2024 · 2 yrs 11 mos', 'Expanding relationships with existing customers.'],
        ];
        const group = block(['Abacus Middle East', 'Full-time · 3 yrs', 'United Arab Emirates']) +
          (structured ? `<ul>${roles.map(single).join('')}</ul>` : roles.map(single).join(''));
        const content = single(['Growth Manager - Vendor partnerships', 'Ignyte · Full-time', 'Sep 2024 - Jan 2026 · 1 yr 5 mos', 'United Arab Emirates · On-site', 'Manage vendor partnerships.']) +
          `<${structured ? 'li' : 'div'}>${group}</${structured ? 'li' : 'div'}>` +
          single(['Business Development Manager', 'WMS - SAP Gold Partner · Full-time', 'Jun 2018 - Mar 2021 · 2 yrs 10 mos', 'Managed business development.']);
        document.getElementById('jobs').innerHTML = structured ? `<ul class="pvs-list">${content}</ul>` : content;
        return extractProfileData();
      }, structured);
      assert.deepEqual(result.experience.map(e => [e.role, e.company, e.dates]), [
        ['Growth Manager - Vendor partnerships', 'Ignyte', 'Sep 2024 - Jan 2026 · 1 yr 5 mos'],
        ['Senior Key Accounts Manager @ Abacus Cambridge Partners Middle East Ltd', 'Abacus Middle East', 'Apr 2021 - Mar 2024 · 3 yrs'],
        ['Key Account Manager', 'Abacus Middle East', 'Apr 2021 - Feb 2024 · 2 yrs 11 mos'],
        ['Business Development Manager', 'WMS - SAP Gold Partner', 'Jun 2018 - Mar 2021 · 2 yrs 10 mos'],
      ]);
      assert.equal(result.experience[0].description, 'Manage vendor partnerships.');
      assert.equal(result.experience[2].description, 'Expanding relationships with existing customers.');
      assert.equal(result.experience[3].description, 'Managed business development.');
      assert.doesNotMatch(result.experience[0].description, /Abacus|Full-time|3 yrs/);
    });
  }

  await t.test('multiple company groups do not leak into subsequent standalone jobs', async () => {
    const result = await page.evaluate(() => parseExperienceFromSectionText([
      'Experience', 'Example A', 'Full-time · 4 yrs', 'London',
      'Sales Lead', 'Jan 2020 - Dec 2022', 'Full-time',
      'Sales Associate', 'Jan 2018 - Dec 2019',
      'Example B', '2 yrs 6 mos', 'Berlin',
      'Account Lead', 'Full-time', 'Jan 2016 - Dec 2017', 'Managed client relationships',
      'Account Associate', 'Jun 2015 - Dec 2015',
      'Business Development Manager', 'Example C · Contract', 'Jan 2014 - May 2015',
      'Promoted strategic partnerships.',
    ].join('\n')));
    assert.deepEqual(result.map(e => [e.role, e.company]), [
      ['Sales Lead', 'Example A'], ['Sales Associate', 'Example A'],
      ['Account Lead', 'Example B'], ['Account Associate', 'Example B'],
      ['Business Development Manager', 'Example C'],
    ]);
    assert.equal(result[2].description, 'Managed client relationships');
  });
});
