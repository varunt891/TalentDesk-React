import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { chromium } from 'playwright'

test('dashboard Copilot handles controls, chat, scoped history, proposals, errors and confirmed writes', async t => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } })
  await server.listen(); t.after(() => server.close())
  const browser = await chromium.launch({ headless: true }); t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(10000)
  const now = new Date().toISOString(), today = now.slice(0, 10)
  const jobs = [{ id: 'job-1', job_id: 'REQ-101', title: 'React Engineer', status: 'Open', created_at: now }, { id: 'job-2', job_id: 'REQ-102', title: 'React Engineer', status: 'Open', created_at: now }]
  const candidates = [{ id: 'candidate-1', first_name: 'Avery', last_name: 'Patel', internal_status: 'Submitted', job_id: 'REQ-101', recruiter_name: 'Test Owner', skills: ['React'], created_at: now, submission_date: today }]
  const callbacks = [{ id: 'callback-1', candidate_name: 'Avery Patel', date: today, status: 'pending' }]
  const followups = [{ id: 'followup-1', candidate_name: 'Sam Chen', status: 'pending', date: today }]
  const tasks = []
  const errors = [], writes = [], queries = []
  let response = { summary: 'The workspace has two open requisitions.', isAction: false }, aiStatus = 200, writeStatus = 200, replyGate = null, writeGate = null
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    let json = { data: [], ok: true }, status = 200
    if (path === '/api/auth/session') json = { user: { id: 'owner', email: 'owner@example.test' }, profile: { id: 'owner', org_id: 'copilot-org', full_name: 'Test Owner', role: 'OWNER' }, organization: { id: 'copilot-org', name: 'Copilot QA', timezone: 'Asia/Kolkata' } }
    else if (path === '/api/ai/generate') {
      queries.push(request.postDataJSON()); const answer = structuredClone(response), code = aiStatus
      if (replyGate) await replyGate
      status = code; json = code === 200 ? { success: true, text: typeof answer === 'string' ? answer : JSON.stringify(answer), provider: 'test', model: 'test' } : { error: 'Provider temporarily unavailable' }
    } else if (request.method() !== 'GET' && path.startsWith('/api/data/')) {
      const body = request.postDataJSON(); writes.push({ path, method: request.method(), body })
      if (writeGate) await writeGate
      status = writeStatus
      if (status !== 200) json = { error: 'Record access denied for test' }
      else if (path === '/api/data/tasks') { const task = { id: 'task-new', ...body }; tasks.push(task); json = { data: [task] } }
      else { const row = jobs.find(job => path.endsWith(`/${job.id}`)); if (row) Object.assign(row, body); json = { data: row ? [row] : [] } }
    } else if (path.endsWith('/data/jobs')) json = { data: jobs }
    else if (path.endsWith('/data/candidates')) json = { data: candidates }
    else if (path.endsWith('/data/callbacks')) json = { data: callbacks }
    else if (path.endsWith('/data/followups')) json = { data: followups }
    else if (path.endsWith('/data/tasks')) json = { data: tasks }
    else if (path.endsWith('/data/profiles')) json = { data: [{ id: 'owner', full_name: 'Test Owner' }] }
    await route.fulfill({ status, json })
  })
  await page.goto(server.resolvedUrls.local[0])
  const launcher = page.getByRole('button', { name: 'TalentDesk AI Copilot', exact: true })
  await launcher.click()
  const dialog = page.getByRole('dialog', { name: 'TalentDesk AI Copilot', exact: true }), input = dialog.getByRole('textbox', { name: 'Copilot message', exact: true })
  const send = async text => { await input.fill(text); await input.press('Enter'); await dialog.locator('.typing-indicator-card').waitFor({ state: 'hidden' }) }
  await dialog.getByTitle('Maximize', { exact: true }).click()
  await dialog.getByTitle('Restore', { exact: true }).click()
  await dialog.getByTitle('Minimize', { exact: true }).click()
  assert.equal(await dialog.count(), 0)
  await launcher.click()
  await dialog.getByTitle('Close', { exact: true }).click()
  await launcher.click()
  await dialog.getByRole('button', { name: 'Close job', exact: true }).click()
  assert.equal(await input.inputValue(), 'Close job ')
  assert.equal(queries.length, 0, 'Starter chips must not send fictional records')
  await send('What is our pipeline status?')
  await dialog.getByText(response.summary, { exact: true }).waitFor()
  assert.match(queries[0].prompt, /REQ-101[\s\S]*Avery Patel|Avery[\s\S]*REQ-101/)
  assert.match(queries[0].prompt, /Asia\/Kolkata[\s\S]*Follow-ups \(1\)/)
  assert.equal(writes.length, 0)
  await page.reload(); await launcher.click()
  await dialog.getByText(response.summary, { exact: true }).waitFor()
  await dialog.getByTitle('New chat', { exact: true }).click()
  assert.equal(await dialog.locator('.copilot-msg-bubble.user').count(), 0)
  await dialog.getByRole('button', { name: /Draft Follow-up Email/ }).click()
  assert.equal(await input.inputValue(), 'Draft a follow-up email for ')
  assert.equal(queries.length, 1)

  response = { summary: 'Close REQ-101?', isAction: true, pendingAction: { type: 'close_job', entityId: 'job-1', entityName: 'React Engineer', requiresConfirmation: false } }
  await send('Close job REQ-101')
  assert.equal(writes.length, 0)
  await dialog.getByRole('button', { name: '✕ Cancel', exact: true }).click()
  await dialog.locator('.copilot-action-cancelled-badge').waitFor()
  assert.equal(writes.length, 0)
  await send('Close job REQ-101')
  let releaseWrite
  writeGate = new Promise(resolve => { releaseWrite = resolve })
  await dialog.getByRole('button', { name: '✓ Confirm & Execute', exact: true }).click()
  await page.waitForTimeout(50)
  assert.equal(await dialog.getByTitle('New chat', { exact: true }).isDisabled(), true)
  assert.equal(await dialog.getByRole('button', { name: 'Saving…', exact: true }).isDisabled(), true)
  assert.equal(writes.length, 1)
  releaseWrite(); writeGate = null
  await dialog.getByText('Requisition updated to Closed.', { exact: false }).waitFor()
  assert.deepEqual(writes[0], { path: '/api/data/jobs/job-1', method: 'PUT', body: { status: 'Closed' } })
  assert.equal(jobs[1].status, 'Open')
  response = 'A text response rather than structured JSON.'
  await send('Create a task to review submittals tomorrow')
  await dialog.getByRole('button', { name: '✓ Confirm & Execute', exact: true }).click()
  await dialog.getByText('Task saved in Tasks & Targets.', { exact: false }).waitFor()
  assert.equal(writes[1].path, '/api/data/tasks')
  assert.equal(writes[1].body.title, 'review submittals')
  assert.equal(writes[1].body.assigned_to, 'owner')
  assert.match(writes[1].body.due_date, /^\d{4}-\d{2}-\d{2}$/)
  response = { summary: 'Reopen the requisition.', pendingAction: { type: 'reopen_job', entityId: 'job-1', entityName: 'React Engineer' } }
  writeStatus = 403
  await send('Reopen REQ-101')
  await dialog.getByRole('button', { name: '✓ Confirm & Execute', exact: true }).click()
  await dialog.getByText('Record access denied for test', { exact: false }).waitFor()
  assert.equal(await dialog.getByRole('button', { name: '✓ Confirm & Execute', exact: true }).isEnabled(), true)
  await dialog.getByRole('button', { name: '✕ Cancel', exact: true }).click()
  writeStatus = 200
  aiStatus = 503
  await send('Summarize open requisitions')
  await dialog.getByText('Provider temporarily unavailable', { exact: true }).waitFor()
  aiStatus = 200
  let releaseReply
  replyGate = new Promise(resolve => { releaseReply = resolve })
  response = { summary: 'Stale reply that must never enter the new chat.' }
  await input.fill('A delayed question'); await input.press('Enter')
  await dialog.locator('.typing-indicator-card').waitFor()
  await dialog.getByTitle('New chat', { exact: true }).click()
  releaseReply(); replyGate = null
  await page.waitForTimeout(100)
  assert.equal(await dialog.getByText('Stale reply that must never enter the new chat.', { exact: true }).count(), 0)
  response = { summary: '## Recruiter draft\nHello Avery, following up on the React role.' }
  await send('Draft a follow-up for Avery Patel')
  await dialog.getByRole('heading', { name: 'Recruiter draft', exact: true }).waitFor()
  assert.equal(writes.length, 3, 'Drafting must not send emails or mutate CRM')

  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      const box = await dialog.boundingBox()
      assert.ok(box.x >= 0 && box.x + box.width <= width + 1)
      assert.ok(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth))
      assert.equal(await page.evaluate(() => window.scrollY), 0)
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await dialog.getByTitle('New chat', { exact: true }).click()
  await dialog.getByRole('button', { name: /View Callbacks/ }).click()
  await page.getByRole('heading', { name: 'Communication', exact: true }).waitFor()
  await page.locator('.app-topbar').getByRole('button', { name: 'Overview', exact: true }).click()
  await launcher.click()
  await dialog.getByRole('button', { name: /Schedule Interviews/ }).click()
  await page.getByRole('heading', { name: 'Candidates', exact: true }).waitFor()
  await page.locator('.app-topbar').getByRole('button', { name: 'Overview', exact: true }).click()
  await launcher.click()
  response = { summary: 'Review REQ-101.', pendingAction: { type: 'reopen_job', entityId: 'job-1', entityName: 'React Engineer' } }
  await send('Reopen REQ-101')
  await page.evaluate(() => { localStorage.setItem('td_ai_governance_copilot-org', JSON.stringify({ features: { actions: false } })); window.dispatchEvent(new CustomEvent('td:ai-preferences', { detail: { orgId: 'copilot-org' } })) })
  await dialog.getByText('CRM actions are disabled in AI Preferences.', { exact: true }).waitFor()
  assert.equal(await dialog.getByRole('button', { name: '✓ Confirm & Execute', exact: true }).isDisabled(), true)
  await page.evaluate(() => { localStorage.setItem('td_ai_governance_copilot-org', JSON.stringify({ dailyRequestLimit: 1 })); window.dispatchEvent(new CustomEvent('td:ai-preferences', { detail: { orgId: 'copilot-org' } })) })
  await dialog.getByText('Daily AI request limit reached. Check AI Preferences or try again tomorrow.', { exact: true }).waitFor()
  assert.equal(await input.isDisabled(), true)
  await page.evaluate(() => { localStorage.setItem('td_ai_governance_copilot-org', JSON.stringify({ features: { chat: false } })); window.dispatchEvent(new CustomEvent('td:ai-preferences', { detail: { orgId: 'copilot-org' } })) })
  await dialog.getByText('Copilot chat is disabled in AI Preferences.', { exact: true }).waitFor()
  assert.equal(await input.isDisabled(), true)
  assert.deepEqual(errors, [])
})

test('shared action executor checks every supported action family and refuses incorrect or failed writes', async t => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } })
  await server.listen(); t.after(() => server.close())
  const browser = await chromium.launch({ headless: true }); t.after(() => browser.close())
  const page = await browser.newPage()
  const writes = [], callbacks = []
  let fail = null
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    let status = path === fail ? 403 : 200, json = status === 403 ? { error: 'Injected API failure' } : { data: [] }
    if (request.method() !== 'GET') {
      const body = request.postDataJSON(); writes.push({ path, method: request.method(), body })
      if (status === 200) {
        const row = { id: path.split('/').at(-1), ...(Array.isArray(body) ? body[0] : body) }
        json = { data: [row] }
        if (path === '/api/data/callbacks') callbacks.push({ ...row, id: 'synced-callback' })
      }
    } else if (path === '/api/data/callbacks') json = { data: callbacks }
    await route.fulfill({ status, json })
  })
  await page.goto(server.resolvedUrls.local[0])
  const ctx = { userId: 'owner', orgId: 'copilot-org', profile: { full_name: 'Test Owner' }, organization: { timezone: 'Asia/Kolkata', business_hours_start: '09:00' }, jobs: [{ id: 'job-1', job_id: 'REQ-101', title: 'React Engineer', status: 'Open' }, { id: 'job-2', job_id: 'REQ-102', title: 'React Engineer', status: 'Open' }], candidates: [{ id: 'candidate-1', first_name: 'Avery', last_name: 'Patel', job_id: 'REQ-101', internal_status: 'Submitted' }], callbacks: [{ id: 'callback-1', candidate_name: 'Avery Patel' }], followups: [{ id: 'followup-1', candidate_name: 'Avery Patel' }], tasks: [{ id: 'task-1', title: 'Review profiles' }] }
  const execute = action => page.evaluate(async ({ action, ctx }) => { const { executeCrmAction } = await import('/src/lib/executeCrmAction.js'); return executeCrmAction(action, ctx) }, { action, ctx })
  for (const type of ['close_job', 'archive_job', 'reopen_job', 'hold_job', 'fill_job', 'delete_job', 'remove_job']) {
    const result = await execute({ type, entityId: 'job-2' }); assert.equal(result.success, true, type); assert.ok(writes.at(-1).path.endsWith('/job-2'))
  }
  for (const action of [{ type: 'close_job' }, { type: 'close_job', entityName: 'React Engineer' }, { type: 'close_job', entityId: 'job-1', entityName: 'Unrelated role' }, { type: 'delete_job', entityId: 'missing' }, { type: 'complete_callback', entityName: 'Missing contact' }, { type: 'delete_followup', entityName: 'Missing contact' }, { type: 'unknown_action' }, { type: 'delete_note', entityName: '#1' }, { type: 'schedule_interview', entityId: 'candidate-1' }, { type: 'update_candidate_stage', entityId: 'candidate-1', params: { stage: 'Imaginary stage' } }]) {
    const before = writes.length, result = await execute(action)
    assert.equal(result.success, false, JSON.stringify(action)); assert.equal(writes.length, before, 'Invalid actions must not write')
  }
  assert.equal((await execute({ type: 'close_job', entityName: 'REQ-101' })).success, true)
  assert.equal(writes.at(-1).path, '/api/data/jobs/job-1')
  for (const type of ['create_job', 'post_job', 'add_job']) assert.equal((await execute({ type, entityName: 'New Engineer', params: { client: 'Example Client' } })).success, true)
  for (const type of ['create_candidate', 'add_candidate']) { assert.equal((await execute({ type, entityName: 'Robin Davis' })).success, true); assert.equal(writes.at(-1).body[0].email, '', 'Do not fabricate email addresses') }
  for (const type of ['update_candidate_stage', 'archive_candidate', 'assign_recruiter', 'delete_candidate', 'remove_candidate']) assert.equal((await execute({ type, entityId: 'candidate-1', params: { stage: 'Shortlisted', recruiter_name: 'Test Recruiter' } })).success, true, type)
  const before = writes.length
  const interview = { type: 'schedule_interview', entityId: 'candidate-1', params: { interview_date: '2026-11-10', interview_time: '14:30', interview_type: 'Video' } }
  const scheduled = await execute(interview)
  assert.equal(scheduled.success, true, scheduled.error)
  assert.equal(writes[before].body.interview_time, '02:30 PM')
  assert.equal(writes[before].body.interview_type, 'Video Call')
  assert.equal(writes[before + 1].body[0].scheduled_at_utc, '2026-11-10T09:00:00.000Z')
  fail = '/api/data/callbacks'
  const result = await execute(interview)
  assert.equal(result.success, false); assert.match(result.error, /status was saved, but/)
  fail = null
  assert.equal((await execute({ type: 'log_callback', entityName: 'Avery Patel', params: { date: '2026-11-11', time: '3pm', notes: 'Call about offer' } })).success, true)
  assert.equal(writes.at(-1).body.date, '2026-11-11'); assert.equal(writes.at(-1).body.time, '03:00 PM')
  for (const type of ['complete_callback', 'delete_callback', 'complete_followup', 'delete_followup']) {
    const id = type.endsWith('callback') ? 'callback-1' : 'followup-1'
    assert.equal((await execute({ type, entityId: id })).success, true)
    fail = `/api/data/${type.endsWith('callback') ? 'callbacks' : 'followups'}/${id}`
    assert.equal((await execute({ type, entityId: id })).success, false)
    fail = null
  }
  assert.equal((await execute({ type: 'create_followup', entityName: 'Avery Patel', params: { date: '2026-11-12', notes: 'Client review' } })).success, true)
  assert.equal(writes.at(-1).body.candidate_name, 'Avery Patel'); assert.equal(Object.hasOwn(writes.at(-1).body, 'title'), false)
  for (const type of ['create_task', 'add_task']) assert.equal((await execute({ type, entityName: 'Review profiles', params: { due_date: 'tomorrow' } })).success, true)
  assert.equal((await execute({ type: 'delete_task', entityId: 'task-1' })).success, true)
  const parsing = await page.evaluate(async () => {
    const { parseCopilotResponse } = await import('/src/lib/ai/copilotActions.js')
    const { normalizeDateString, extractInterviewTime } = await import('/src/lib/executeCrmAction.js')
    return { nullReply: parseCopilotResponse('null', 'What is open?'), arrayReply: parseCopilotResponse('[]', 'How do I close job REQ-101?'), task: parseCopilotResponse('plain text', 'Create a task to review profiles tomorrow'), invalidDate: normalizeDateString('2026-02-31'), invalidTime: extractInterviewTime('at 26:90'), weekend: normalizeDateString('next saturday') }
  })
  assert.equal(parsing.nullReply.isAction, false); assert.equal(parsing.arrayReply.isAction, false)
  assert.equal(parsing.task.pendingAction.type, 'create_task'); assert.equal(parsing.task.pendingAction.params.title, 'review profiles')
  assert.equal(parsing.invalidDate, null); assert.equal(parsing.invalidTime, null); assert.match(parsing.weekend, /^\d{4}-\d{2}-\d{2}$/)
})
