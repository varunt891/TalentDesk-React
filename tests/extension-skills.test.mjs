import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import '../extension/sidepanel/profile-utils.js';

const { cleanSkills, mergeSkills, normalize } = globalThis.TalentDeskProfile;
const noise = ['LIVE', '-', '~', '11,061 · 91 comments', '6,671 · 83 comments', '1,747 · 13 comments', '1,205 · 18 comments', '3,982 · 71 comments', '500+ connections', '2 endorsements', 'Show all 15 skills', 'Endorsed by 3 colleagues', '2 experiences at Example Corp'];

test('skills reject screenshot activity counters and preserve real technical and domain names', () => {
  const skills = ['Brand Marketing', 'Customer Relationship Management (CRM)', 'C++', 'C#', '.NET', 'Node.js', 'D3.js', 'R', '3D Modeling', 'ISO 9001', 'Live Streaming', 'Live Sound', 'Media Relations', 'संचार'];
  assert.deepEqual(cleanSkills([...noise, ...skills]), skills);
  assert.deepEqual(normalize({ skills: noise }).skills, []);
  assert.deepEqual(cleanSkills('LIVE, -, 11,061 · 91 comments, SQL, C++'), ['SQL', 'C++']);
});

test('AI fallback discards dirty DOM values and requires candidate evidence on LinkedIn', () => {
  assert.deepEqual(mergeSkills(['Brand Marketing', 'Negotiation', 'LIVE', '11,061 · 91 comments'], noise, { isLinkedIn: true, evidenceText: 'Skills\nBrand Marketing\nExperience\nBrand Ambassador at Example Corp' }), ['Brand Marketing']);
  assert.deepEqual(mergeSkills(['Sales', 'Social Media Marketing'], noise, { isLinkedIn: true, evidenceText: 'Brand Ambassador at Example Corp' }), []);
  assert.deepEqual(mergeSkills(['C++', '.NET', 'R'], [], { isLinkedIn: true, evidenceText: 'Built C++ and .NET applications. Recruitment operations.' }), ['C++', '.NET']);
  assert.deepEqual(mergeSkills(['Made-up skill'], ['SQL', 'sql', ...noise], { isLinkedIn: true, evidenceText: '' }), ['sql']);
});

test('LinkedIn capture distinguishes Skills from nested work, education and activity cards', async t => {
  const browser = await chromium.launch({ headless: true }); t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('https://www.linkedin.com/in/skills-fixture/', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body>
    <main class="scaffold-layout__main"><section class="artdeco-card profile-wrapper">
      <section class="pv-top-card"><h1>Sri Krishna Das</h1><p>Brand Ambassador</p></section>
      <section class="artdeco-card" id="activity-card"><h2>Activity</h2><h3>Work experience</h3><span aria-hidden="true">LIVE</span><span aria-hidden="true">11,061 · 91 comments</span></section>
      <section class="artdeco-card" id="work-card"><h2>Work experience</h2><ul><li><span aria-hidden="true">Brand Ambassador</span><span aria-hidden="true">Example Corp</span><span aria-hidden="true">Jan 2022 - Present</span></li></ul></section>
      <section class="artdeco-card" id="school-card"><h2>Academic education</h2><span aria-hidden="true">Example University</span></section>
      <section class="pv-profile-card profile-skills" id="skill-card"><h2><span aria-hidden="true">Skills</span><span class="visually-hidden">Skills</span></h2><ul>
        <li><div class="t-bold"><span aria-hidden="true">Brand Marketing</span><span class="visually-hidden">Brand Marketing</span></div><span aria-hidden="true">2 endorsements</span><ul><li><span aria-hidden="true">Example Corp</span></li></ul></li>
        <li><span aria-hidden="true">Customer Relationship Management (CRM)</span><span aria-hidden="true">3 endorsements</span></li>
        <li><div class="t-bold"><span aria-hidden="true">Live Streaming</span></div></li>
        <li><div class="t-bold"><span aria-hidden="true">C++</span></div></li>
        <li><span aria-hidden="true">LIVE</span></li><li><span aria-hidden="true">11,061 · 91 comments</span></li>
      </ul><button>Show all 15 skills</button></section>
    </section></main><aside><section id="skills"><h2>Skills</h2><li><span aria-hidden="true">Unrelated sidebar skill</span></li></section></aside>
    </body></html>` }));
  await page.goto('https://www.linkedin.com/in/skills-fixture/');
  await page.evaluate(() => { window.chrome = { runtime: { onMessage: { addListener() {}, removeListener() {} } } }; });
  await page.addScriptTag({ path: 'extension/sidepanel/profile-utils.js' });
  await page.addScriptTag({ path: 'extension/content.js' });
  const result = await page.evaluate(() => ({ skillsCard: getSectionByHeader(['skills'])?.id, workCard: getSectionByHeader(['experience'])?.id, educationCard: getSectionByHeader(['education'])?.id, profile: extractProfileData() }));
  assert.equal(result.skillsCard, 'skill-card');
  assert.equal(result.workCard, 'work-card');
  assert.equal(result.educationCard, 'school-card');
  assert.deepEqual(result.profile.skills, ['Brand Marketing', 'Customer Relationship Management (CRM)', 'Live Streaming', 'C++']);
  assert.doesNotMatch(result.profile.resume_text, /LIVE|comments|endorsements|sidebar skill/);
  const missing = await page.evaluate(() => { document.getElementById('skill-card').remove(); return extractProfileData(); });
  assert.deepEqual(missing.skills, [], 'Missing skills must stay empty instead of taking activity or work labels');
});
