import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { chromium } from 'playwright'

test('candidate detail keeps notes, interview scheduling, resumes, AI and linked records working', async t => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } })
  await server.listen()
  t.after(() => server.close())
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(10000)
  const now = new Date().toISOString()
  const originalNotes = '## Recruiter context\n[Portfolio](https://example.test/avery)\nAvailable after two weeks.'
  const candidate = { id: 'candidate-primary', user_id: 'owner', org_id: 'candidate-org', first_name: 'Avery', last_name: 'Patel', email: 'avery@example.test', phone: '+1 202 555 0101', location: 'Austin, TX', work_auth: 'US Citizen', experience: 5, linkedin: 'linkedin.com/in/avery-example', relocation: 'No', submission_date: '2026-10-20', job_id: 'REQ-101', job_title: 'Senior React Engineer', client: 'Example Client', rate: '$98/hr', internal_status: 'Submitted', external_status: 'Pending', feedback_status: 'Awaiting', priority: 'High', fe_name: 'Account Team', fe_extension: '200', recruiter_name: 'Test Owner', account_manager: 'Hiring Manager', skills: '["React","TypeScript","Accessibility"]', notes: originalNotes, followup_date: '2026-11-04', resume_text: '## Avery Patel\nBuilt an accessible component library with React.', resume_file_name: 'Avery-Patel.pdf', resume_file_size: 24576, created_at: now, updated_at: now }
  const other = { ...candidate, id: 'candidate-other', job_id: 'REQ-102', job_title: 'Frontend Engineer', internal_status: 'Shortlisted', notes: 'Separate submission context.' }
  const empty = { id: 'candidate-empty', user_id: 'owner', first_name: 'Jamie', last_name: 'Chen', email: '', job_id: 'REQ-EMPTY', internal_status: 'Pending', experience: 0, created_at: now }
  const candidates = [candidate, other, empty]
  const callbacks = [{ id: 'callback-1', candidate_name: 'Avery Patel', job: 'Recruiter screening', date: '2026-10-22', notes: 'Confirmed availability.', status: 'done' }]
  const followups = [{ id: 'followup-1', candidate_name: 'Avery Patel', type: 'Client feedback', date: '2026-10-23', notes: 'Sent the technical profile.', status: 'pending' }]
  const logs = [{ id: 'activity-1', entity_id: candidate.id, action: 'updated', actor_name: 'Test Owner', details: { updates: { rate: '$98/hr' } }, created_at: now }]
  const jobs = [{ id: '10000000-0000-4000-8000-000000000001', job_id: 'REQ-101', title: 'Senior React Engineer', client: 'Example Client', status: 'Open', skills: ['React'], created_at: now }]
  const errors = [], writes = [], aiRequests = []
  let failNotes = false, resumeRequests = 0
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname
    let json = { data: [], ok: true }, status = 200
    const filters = JSON.parse(url.searchParams.get('filter') || '[]')
    const filtered = rows => rows.filter(row => filters.every(filter => filter.op !== 'eq' || row[filter.column] === filter.value))
    if (request.method() !== 'GET' && !path.includes('/ai/')) writes.push({ path, method: request.method(), body: request.postDataJSON() })
    if (path.endsWith('/auth/session')) json = { user: { id: 'owner', email: 'owner@example.test' }, profile: { id: 'owner', full_name: 'Test Owner', role: 'OWNER', org_id: 'candidate-org' }, organization: { id: 'candidate-org', name: 'Candidate QA', timezone: 'America/New_York' } }
    else if (path === '/api/data/candidates') json = { data: filtered(candidates) }
    else if (path.startsWith('/api/data/candidates/') && request.method() === 'PUT') {
      const body = request.postDataJSON(), row = candidates.find(item => path.endsWith(`/${item.id}`))
      if (failNotes && Object.hasOwn(body, 'notes')) { status = 403; json = { error: 'Save denied for test' } }
      else { Object.assign(row, body); json = { data: [{ ...row }] } }
    }
    else if (path === '/api/data/jobs') json = { data: filtered(jobs) }
    else if (path === '/api/data/callbacks' && request.method() === 'POST') { const callback = { id: 'interview-callback', ...request.postDataJSON()[0] }; callbacks.push(callback); json = { data: [callback] } }
    else if (path === '/api/data/callbacks') json = { data: filtered(callbacks) }
    else if (path === '/api/data/followups') json = { data: filtered(followups) }
    else if (path === '/api/data/activity_logs') json = { data: filtered(logs) }
    else if (path === `/api/upload/resume-url/${candidate.id}`) { resumeRequests++; json = { success: true, url: 'data:application/pdf;base64,JVBERi0xLjQK', fileName: candidate.resume_file_name } }
    else if (path.endsWith('/ai/action')) { aiRequests.push(request.postDataJSON()); json = { success: true, text: '## Candidate summary\nRecorded React and accessibility experience.', provider: 'test', model: 'test' } }
    await route.fulfill({ status, json })
  })
  await page.goto(server.resolvedUrls.local[0])
  const openCandidate = async name => {
    await page.locator('.app-topbar').getByRole('button', { name: 'Candidates', exact: true }).click()
    await page.getByPlaceholder('Name, job, client, skill...', { exact: true }).fill(name)
    await page.getByRole('row').filter({ hasText: name }).first().click()
    await page.getByRole('button', { name: 'View Full Details', exact: true }).click()
    await page.locator('.candidate-detail-page').waitFor()
  }
  await openCandidate('Avery Patel')
  const detail = page.locator('.candidate-detail-page'), views = detail.getByRole('navigation', { name: 'Candidate detail views' })
  assert.deepEqual((await detail.locator('.job-detail-summary strong').allTextContents()).slice(0, 2), ['1', '1'])
  assert.equal(await detail.getByRole('link', { name: 'LinkedIn profile', exact: true }).getAttribute('href'), 'https://linkedin.com/in/avery-example')
  assert.equal(await detail.getByRole('link', { name: candidate.email, exact: true }).getAttribute('href'), `mailto:${candidate.email}`)
  assert.equal(await detail.locator('.candidate-detail-skills .td-badge').count(), 3)
  assert.equal(await detail.locator('.job-detail-remarks-body a').getAttribute('href'), 'https://example.test/avery')
  assert.match(await detail.locator('.candidate-detail-team').innerText(), /Account Team[\s\S]*200[\s\S]*Test Owner[\s\S]*Hiring Manager/)
  assert.equal(await detail.locator('.candidate-detail-status details').getAttribute('open'), null)

  await detail.getByRole('button', { name: 'Edit notes', exact: true }).click()
  const notes = detail.getByLabel('Candidate notes', { exact: true })
  await notes.fill('Unsaved notes')
  await views.getByRole('button', { name: /^Submissions/ }).click()
  assert.equal(await detail.locator('.candidate-detail-submission-row').count(), 2)
  assert.equal(await notes.inputValue(), 'Unsaved notes')
  await detail.getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal(writes.length, 0)
  await detail.getByRole('button', { name: 'Edit notes', exact: true }).click()
  assert.equal(await notes.inputValue(), originalNotes)
  await notes.fill('Reviewed candidate notes saved from the full view.')
  await detail.getByRole('button', { name: 'Save Notes', exact: true }).click()
  await detail.getByRole('button', { name: 'Edit notes', exact: true }).waitFor()
  assert.deepEqual(writes[0], { path: `/api/data/candidates/${candidate.id}`, method: 'PUT', body: { notes: 'Reviewed candidate notes saved from the full view.' } })
  failNotes = true
  await detail.getByRole('button', { name: 'Edit notes', exact: true }).click()
  await notes.fill('Keep this draft if save fails')
  await detail.getByRole('button', { name: 'Save Notes', exact: true }).click()
  await page.getByText('Failed to save notes', { exact: true }).waitFor()
  assert.equal(await notes.inputValue(), 'Keep this draft if save fails')
  await detail.getByRole('button', { name: 'Cancel', exact: true }).click()
  failNotes = false

  await views.getByRole('button', { name: /^Activity/ }).click()
  assert.equal(await detail.locator('.candidate-detail-timeline-item').count(), 2)
  assert.match(await detail.locator('.candidate-detail-activity').innerText(), /Test Owner[\s\S]*updated rate/)
  await detail.locator('.candidate-detail-status summary').click()
  await detail.getByRole('group', { name: 'Internal', exact: true }).getByRole('button').click()
  await detail.getByRole('option', { name: 'Interview Scheduled', exact: true }).click()
  await detail.getByRole('button', { name: 'Save Status', exact: true }).click()
  await page.getByText('Interview date required', { exact: true }).waitFor()
  assert.equal(writes.length, 2, 'An incomplete interview must not save')
  await detail.getByRole('group', { name: 'Interview Date', exact: true }).locator('input').fill('2026-11-10')
  await detail.getByRole('button', { name: 'Save Status', exact: true }).click()
  await page.getByText('Status updated and callback scheduled', { exact: true }).waitFor()
  assert.equal(writes[2].path, `/api/data/candidates/${candidate.id}`)
  assert.equal(writes[2].body.internal_status, 'Interview Scheduled')
  assert.equal(writes[2].body.interview_time, '10:00 AM')
  assert.equal(writes[2].body.interview_type, 'Video Call')
  assert.equal(writes[3].path, '/api/data/callbacks')
  assert.equal(writes[3].body[0].candidate_name, 'Avery Patel')
  assert.match(writes[3].body[0].notes, /Candidate ID: candidate-primary/)
  assert.equal(await detail.locator('.candidate-detail-timeline-item').count(), 3)
  await detail.locator('.candidate-detail-status summary').click()

  await views.getByRole('button', { name: 'Resume', exact: true }).click()
  assert.match(await detail.locator('.candidate-detail-resume-text').innerText(), /accessible component library/)
  const downloadEvent = page.waitForEvent('download')
  await detail.getByRole('button', { name: 'Download Resume', exact: true }).click()
  await downloadEvent
  assert.equal(resumeRequests, 1)
  await views.getByRole('button', { name: 'AI', exact: true }).click()
  assert.equal(aiRequests.length, 0, 'Opening AI must not generate automatically')
  await detail.locator('.candidate-detail-ai > .td-card').first().getByRole('button', { name: 'Generate', exact: true }).click()
  await detail.getByRole('heading', { name: 'Candidate summary', exact: true }).waitFor()
  assert.match(aiRequests[0].content, /Avery Patel[\s\S]*React[\s\S]*Reviewed candidate notes/)

  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      for (const view of ['Overview', 'Submissions', 'Activity', 'Resume', 'AI']) {
        await views.getByRole('button', { name: new RegExp(`^${view}`) }).click()
        assert.ok(await detail.evaluate(element => element.scrollWidth <= element.clientWidth), `${theme} ${width}px ${view} must fit`)
        assert.equal(await page.evaluate(() => window.scrollY), 0)
      }
      await detail.locator('.candidate-detail-status summary').click()
      assert.ok(await detail.evaluate(element => element.scrollWidth <= element.clientWidth), `${theme} ${width}px scheduling must fit`)
      await detail.locator('.candidate-detail-status summary').click()
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await detail.getByRole('button', { name: 'Edit Candidate', exact: true }).click()
  await page.getByRole('heading', { name: 'Edit Candidate', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal(writes.length, 4, 'Opening and cancelling the editor must not write')
  await views.getByRole('button', { name: /^Submissions/ }).click()
  await detail.getByRole('button', { name: 'View submission', exact: true }).click()
  await detail.getByRole('heading', { name: 'Personal Info', exact: true }).waitFor()
  assert.match(await detail.locator('.job-detail-remarks-body').innerText(), /Separate submission context/)
  await views.getByRole('button', { name: /^Submissions/ }).click()
  await detail.getByRole('button', { name: 'REQ-101', exact: true }).click()
  await page.locator('.job-detail-page').getByRole('heading', { name: 'Job Details', exact: true }).waitFor()
  await openCandidate('Jamie Chen')
  assert.equal(await detail.locator('.candidate-detail-personal').getByText('0 years', { exact: true }).count(), 1)
  await detail.getByRole('button', { name: 'Add notes', exact: true }).waitFor()
  await views.getByRole('button', { name: 'Resume', exact: true }).click()
  await detail.getByRole('heading', { name: 'No resume on file', exact: true }).waitFor()
  await detail.locator('#candidate-detail-content').getByRole('button', { name: 'Edit Candidate', exact: true }).click()
  await page.getByRole('heading', { name: 'Edit Candidate', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await detail.getByRole('button', { name: 'Back to Candidates', exact: true }).click()
  await page.getByRole('heading', { name: 'Candidates', exact: true }).waitFor()
  assert.equal(writes.length, 4)
  assert.deepEqual(errors, [])
})
