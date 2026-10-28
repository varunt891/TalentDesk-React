import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { chromium } from 'playwright'

test('job details preserve linked records, notes edits, navigation and responsive views', async t => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } })
  await server.listen()
  t.after(() => server.close())
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(10000)
  const now = new Date().toISOString()
  const originalNotes = '## Sourcing plan\n[LinkedIn search](https://www.linkedin.com/search/results/people/?keywords=React)\nReviewed requisition context.'
  const job = { id: '10000000-0000-4000-8000-000000000001', job_id: 'REQ-101', title: 'Full Stack Engineer', client: 'Example Client', location: 'New York, NY', work_mode: 'Remote', type: 'Full-time', experience_level: 'Senior', openings: 2, bill_rate: '$123/hr', pay_rate: '$98/hr', status: 'Open', priority: 'High', open_date: '2026-10-04', end_date: '2027-04-26', submittal_due: '2026-11-04', max_submittals: 6, optional_ref: 'CLIENT-12', workers_comp_code: 'TECH-01', assigned_to: ['owner'], contact_name: 'Hiring Contact', skills: '["React","Node.js"]', description: '## Role overview\n' + 'Build accessible recruiting tools and document platform changes.\n\n'.repeat(24), notes: originalNotes, created_at: now, updated_at: now }
  const jobs = [job, { id: '10000000-0000-4000-8000-000000000002', job_id: 'REQ-EMPTY', title: 'New requisition', status: 'Open' }]
  const candidates = ['Submitted', 'Interview Scheduled', 'Offer Extended', 'Hired'].map((status, i) => ({ id: `candidate-${i}`, job_id: job.job_id, first_name: `Candidate ${i}`, last_name: 'Example', email: `candidate${i}@example.test`, internal_status: status, recruiter_name: 'Test Owner', submission_date: '2026-10-20', notes: i === 0 ? 'Available after two weeks.' : '', created_at: now }))
  candidates.push({ id: 'unrelated', job_id: 'OTHER', first_name: 'Unrelated', last_name: 'Candidate', internal_status: 'Hired' })
  const logs = [
    { id: 'job-log', entity: 'jobs', entity_id: job.id, action: 'updated', actor_name: 'Test Owner', summary: 'Confirmed hiring terms', created_at: now },
    { id: 'candidate-log', entity: 'candidates', entity_id: candidates[0].id, action: 'created', actor_name: 'Test Owner', summary: 'Submitted profile', created_at: now },
    { id: 'other-log', entity: 'jobs', entity_id: 'OTHER', action: 'updated', summary: 'Unrelated activity', created_at: now },
  ]
  const errors = [], writes = []
  let failSave = false
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname
    let json = { data: [], ok: true }, status = 200
    const filtered = rows => rows.filter(row => JSON.parse(url.searchParams.get('filter') || '[]').every(filter => filter.op !== 'eq' || row[filter.column] === filter.value))
    if (request.method() !== 'GET') writes.push({ path, method: request.method(), body: request.postDataJSON() })
    if (path.endsWith('/auth/session')) json = { user: { id: 'owner', email: 'owner@example.test' }, profile: { id: 'owner', full_name: 'Test Owner', role: 'OWNER', org_id: 'job-org' }, organization: { id: 'job-org', name: 'Job QA' } }
    else if (path.endsWith('/data/jobs')) json = { data: filtered(jobs) }
    else if (path.endsWith('/data/candidates')) json = { data: filtered(candidates) }
    else if (path.endsWith('/data/profiles')) json = { data: [{ id: 'owner', full_name: 'Test Owner' }] }
    else if (path.endsWith('/data/activity_logs')) json = { data: logs }
    else if (path === `/api/data/jobs/${job.id}/remarks`) {
      if (failSave) { status = 403; json = { error: 'Save denied for test' } }
      else { job.notes = request.postDataJSON().notes; json = { data: { ...job } } }
    }
    await route.fulfill({ status, json })
  })
  await page.goto(server.resolvedUrls.local[0])
  const openFull = async title => {
    await page.locator('.app-topbar').getByRole('button', { name: 'Jobs', exact: true }).click()
    await page.getByRole('row').filter({ hasText: title }).first().click()
    await page.locator('.job-preview-drawer').getByRole('button', { name: 'View full details', exact: true }).click()
    await page.locator('.job-detail-page').waitFor()
  }
  await openFull(job.title)
  const detail = page.locator('.job-detail-page'), views = detail.getByRole('navigation', { name: 'Job detail views' })
  assert.deepEqual(await detail.locator('.job-detail-summary strong').allTextContents(), ['4', '1', '1', '1 / 2'])
  assert.equal(await detail.locator('.job-detail-skill-list .td-badge').count(), 2)
  assert.match(await detail.locator('.job-detail-ownership').innerText(), /Test Owner[\s\S]*Hiring Contact/)
  await detail.getByText('Additional requisition details', { exact: true }).click()
  assert.match(await detail.locator('.job-detail-additional').innerText(), /CLIENT-12[\s\S]*TECH-01[\s\S]*04\/26\/2027[\s\S]*11\/04\/2026/)
  const readMore = detail.getByRole('button', { name: 'Read full description', exact: true })
  assert.equal(await readMore.getAttribute('aria-expanded'), 'false')
  await readMore.click()
  assert.equal(await detail.getByRole('button', { name: 'Show less', exact: true }).getAttribute('aria-expanded'), 'true')
  await detail.getByRole('button', { name: 'Show less', exact: true }).click()
  assert.equal(await detail.locator('.job-detail-remarks-body a').getAttribute('href'), 'https://www.linkedin.com/search/results/people/?keywords=React')
  await detail.locator('.job-detail-candidate-notes summary').click()
  await detail.getByText('Available after two weeks.', { exact: true }).waitFor()

  await detail.getByRole('button', { name: 'Edit remarks', exact: true }).click()
  const notes = detail.getByLabel('Requisition remarks', { exact: true })
  await notes.fill('Unsaved draft')
  await views.getByRole('button', { name: /^Submissions/ }).click()
  assert.equal(await detail.locator('.job-detail-submissions tbody tr').count(), 4)
  assert.doesNotMatch(await detail.locator('.job-detail-submissions').innerText(), /Unrelated Candidate/)
  assert.equal(await notes.inputValue(), 'Unsaved draft', 'Switching views must keep the draft')
  await detail.getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal(writes.length, 0)
  await views.getByRole('button', { name: /^Activity/ }).click()
  assert.equal(await detail.locator('.job-detail-timeline-item').count(), 2)
  assert.doesNotMatch(await detail.locator('.job-detail-timeline').innerText(), /Unrelated activity/)
  await detail.getByRole('button', { name: 'Edit remarks', exact: true }).click()
  assert.equal(await notes.inputValue(), originalNotes)
  await notes.fill('Reviewed sourcing plan, saved from job details.')
  await detail.getByRole('button', { name: 'Save Remarks', exact: true }).click()
  await detail.getByRole('button', { name: 'Edit remarks', exact: true }).waitFor()
  assert.deepEqual(writes, [{ path: `/api/data/jobs/${job.id}/remarks`, method: 'PATCH', body: { notes: 'Reviewed sourcing plan, saved from job details.' } }])
  failSave = true
  await detail.getByRole('button', { name: 'Edit remarks', exact: true }).click()
  await notes.fill('Retain this draft after failure')
  await detail.getByRole('button', { name: 'Save Remarks', exact: true }).click()
  await page.getByText('Failed to save remarks', { exact: true }).waitFor()
  assert.equal(await notes.inputValue(), 'Retain this draft after failure')
  await detail.getByRole('button', { name: 'Cancel', exact: true }).click()

  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      for (const view of ['Overview', 'Submissions', 'Activity']) {
        await views.getByRole('button', { name: new RegExp(`^${view}`) }).click()
        assert.ok(await detail.evaluate(element => element.scrollWidth <= element.clientWidth), `${theme} ${width}px ${view} must fit`)
        assert.equal(await page.evaluate(() => window.scrollY), 0)
        if (width === 390 && view === 'Submissions') assert.equal(await detail.locator('.job-detail-mobile-candidate:visible').count(), 4)
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await detail.getByRole('button', { name: 'Edit Job', exact: true }).click()
  await page.getByRole('heading', { name: 'Edit Job', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal(writes.length, 2, 'Edit/cancel must not write to the API')
  await detail.getByRole('button', { name: 'Back to Jobs', exact: true }).click()
  await page.getByRole('heading', { name: 'Jobs', exact: true }).waitFor()
  await openFull('New requisition')
  assert.deepEqual(await detail.locator('.job-detail-summary strong').allTextContents(), ['0', '0', '0', '0'])
  await detail.getByText('Openings not recorded', { exact: true }).waitFor()
  await detail.getByRole('button', { name: 'Add remarks', exact: true }).waitFor()
  await views.getByRole('button', { name: /^Submissions/ }).click()
  await detail.getByRole('heading', { name: 'No submissions yet', exact: true }).waitFor()
  assert.deepEqual(errors, [])
})
