import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.SOURCING_TEST_URL || 'http://127.0.0.1:5174';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const session = { user: { id: 'user', email: 'test@example.org' }, profile: { id: 'user', org_id: 'org', role: 'ADMIN', full_name: 'Test Recruiter' }, organization: { id: 'org', name: 'Test Workspace' } };
const rows = [{ id: 'sourced', first_name: 'Avery', last_name: 'Patel', internal_status: 'Sourced', email: 'avery@example.org', skills: ['SQL'], resume_text: 'Employment history', created_at: new Date().toISOString(), experience: '8', interview_date: '2026-12-01' }, { id: 'active', first_name: 'Jordan', last_name: 'Lee', internal_status: 'Pending' }];
const writes = [];
const updates = [];
let failPromotion = true;
await page.route('**/api/**', async route => {
  const req = route.request();
  const url = req.url();
  let body = { data: [] };
  if (url.includes('/auth/session')) body = session;
  else if (url.includes('/data/candidates')) {
    if (req.method() === 'PUT') {
      const raw = req.postDataJSON();
      updates.push(raw.data || raw);
      if (failPromotion) return route.fulfill({ status: 400, json: { error: 'Promotion temporarily unavailable' } });
      Object.assign(rows[0], raw.data || raw);
      return route.fulfill({ json: { data: [rows[0]] } });
    }
    if (req.method() === 'POST') {
      const raw = req.postDataJSON();
      const payload = Array.isArray(raw) ? raw : raw.data || raw;
      writes.push(payload);
      body = { data: (Array.isArray(payload) ? payload : [payload]).map((r, i) => ({ ...r, id: `new-${i}` })) };
    } else body = { data: rows };
  } else if (url.includes('/organization')) body = { data: session.organization };
  await route.fulfill({ json: body });
});
try {
  await page.goto(`${base}/sourced-candidates`);
  await page.getByRole('heading', { name: 'Sourced Candidates', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Add Sourced Candidate', exact: true }).click();
  await page.getByRole('heading', { name: 'Add Sourced Candidate', exact: true }).waitFor();
  await page.locator('input').filter({ visible: true }).count();
  const firstName = page.getByPlaceholder('John', { exact: true });
  await firstName.fill('Morgan');
  await page.getByRole('button', { name: /Add Candidate|Save Candidate/ }).last().click();
  await page.waitForFunction(() => !Array.from(document.querySelectorAll('h2')).some(el => el.textContent === 'Add Sourced Candidate'));
  assert.equal(writes.length, 1);
  const created = Array.isArray(writes[0]) ? writes[0][0] : writes[0];
  assert.equal(created.internal_status, 'Sourced');
  assert.equal(created.submission_date, null);
  assert.ok(!created.job_id);
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Page overflow at ${width}`);
    await page.screenshot({ path: `tests/sourced-pool-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByTitle('Promote to Active Candidate', { exact: true }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: 'Confirm & Promote Candidate(s)' }).click();
  await page.getByText('1 promotion(s) failed. Review and retry.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Confirm & Promote Candidate(s)' }).isVisible(), true);
  failPromotion = false;
  await page.getByRole('button', { name: 'Confirm & Promote Candidate(s)' }).click();
  await page.getByRole('button', { name: 'Confirm & Promote Candidate(s)' }).waitFor({ state: 'hidden' });
  assert.equal(Object.hasOwn(updates[1], 'experience'), false);
  assert.equal(Object.hasOwn(updates[1], 'interview_date'), false);
  await page.getByRole('button', { name: /All Database Records/ }).click();
  await page.getByText('Avery Patel', { exact: true }).first().waitFor();
  await page.getByText('Jordan Lee', { exact: true }).first().waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: direct sourced route, manual unassigned sourced save, responsive pool, failed promotion retry, preservation of untouched fields and all-records navigation.');
} finally { await browser.close(); }
