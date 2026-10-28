import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { AI_ACTIONS } from '../src/lib/ai/prompts.js'
import { AI_CATEGORIES } from '../src/lib/ai/categories.js'
import { HIRING_USE_CASES, hiringRunLabel } from '../src/lib/ai/hiringTools.js'

test('Hiring tools isolates actions, runs five CRM scenarios, and restores saved comparisons', { timeout: 90000 }, async t => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } })
  await server.listen()
  t.after(() => server.close())
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(10000)
  const errors = [], requests = [], notes = [], tasks = []
  page.on('pageerror', err => errors.push(err.message))
  const candidates = [
    { id: 'candidate-1', first_name: 'Alex', last_name: 'Rivera', internal_status: 'Submitted', external_status: 'Interview Done', job_id: 'REQ-101', job_title: 'React Engineer', skills: ['React', 'SQL'], resume_text: 'Built accessible React interfaces.', notes: 'Original notes.' },
    { id: 'candidate-2', first_name: 'Jamie', last_name: 'Chen', internal_status: 'Submitted', external_status: 'Shortlisted', skills: ['Java'] },
    { id: 'sourced-1', first_name: 'Sam', last_name: 'Patel', internal_status: 'Sourced', skills: ['Python'] },
  ]
  const jobs = [
    { id: 'job-1', job_id: 'REQ-101', title: 'React Engineer', description: 'Build accessible interfaces.', skills: ['React', 'SQL'], status: 'Open', notes: 'Keep existing job notes.' },
    { id: 'job-2', job_id: 'REQ-102', title: 'Java Backend Engineer', description: 'Build Java services.', skills: ['Java', 'Spring'], status: 'Open', notes: 'Keep existing job notes.' },
    { id: 'job-3', job_id: 'REQ-103', title: 'Data Engineer', description: 'Build data pipelines.', skills: ['Python', 'SQL', 'Airflow'], status: 'Open', notes: 'Keep existing job notes.' },
  ]
  let failAI = false, failRecords = false, incomplete = false, holdAI = false, heldRoute
  const responseBody = () => {
    const text = requests.at(-1)?.prompt?.includes('Recruiter instructions: create linkedin search as well')
      ? '## LinkedIn People Keyword Query\n```text\n("Data Engineer" OR "Data Developer") AND SQL\n```\n[LinkedIn people search](https://www.linkedin.com/search/results/people/?keywords=wrong)\n\n## Google X-ray Query\n```text\nsite:linkedin.com/in ("Data Engineer" OR "Data Developer") AND SQL\n```\n'
      : `## Reviewed draft ${requests.length}\nEvidence from the selected records. Verify missing details before use.`
    return `data: ${JSON.stringify({ delta: text })}\n\n${incomplete ? '' : `data: ${JSON.stringify({ done: true, provider: 'test', model: 'test' })}\n\n`}`
  }
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    let json = { data: [], ok: true }
    if (path.endsWith('/auth/session')) json = { user: { id: 'owner-1', email: 'owner@example.test' }, profile: { id: 'owner-1', full_name: 'Test Recruiter', org_id: 'hiring-org', role: 'OWNER' }, organization: { id: 'hiring-org', name: 'Hiring QA', timezone: 'Asia/Kolkata' } }
    else if (/\/ai\/(generate|action)\/stream$/.test(path)) {
      requests.push({ ...request.postDataJSON(), path })
      if (holdAI) { heldRoute = route; return }
      if (failAI) return route.fulfill({ status: 503, json: { error: 'Provider unavailable. Retry shortly.' } })
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: responseBody() })
    } else if (/\/data\/(jobs|candidates)\/[^/]+\/notes$/.test(path)) {
      const body = request.postDataJSON(), table = path.includes('/jobs/') ? jobs : candidates
      const record = table.find(row => path.includes(`/${row.id}/`))
      notes.push({ path, ...body }); record.notes += `\n${body.content}`
      json = { data: [record] }
    } else if (path.endsWith('/data/tasks') && request.method() === 'POST') {
      tasks.push(request.postDataJSON()); json = { data: [{ id: `task-${tasks.length}`, ...tasks.at(-1) }] }
    } else if (path.endsWith('/data/candidates')) {
      if (failRecords) return route.fulfill({ status: 503, json: { error: 'Records temporarily unavailable.' } })
      json = { data: candidates }
    } else if (path.endsWith('/data/jobs')) json = { data: jobs }
    else if (path.endsWith('/data/tasks')) json = { data: tasks }
    await route.fulfill({ status: 200, json })
  })
  await page.goto(server.resolvedUrls.local[0])
  await page.getByRole('button', { name: 'AI Center', exact: true }).click()
  const sections = page.getByRole('navigation', { name: 'AI Center sections' })
  await sections.getByRole('button', { name: 'Hiring tools', exact: true }).click()
  const panel = page.locator('.hiring-tool-panel'), nav = page.getByRole('navigation', { name: 'Hiring actions' })
  await page.getByLabel('Source text', { exact: true }).fill('General summary source')
  await page.getByLabel('Additional instructions (optional)', { exact: true }).fill('General summary instructions')
  const choose = async id => {
    await page.getByRole('button', { name: 'Browse workflows', exact: true }).click()
    await page.getByRole('button', { name: `Use ${AI_CATEGORIES.find(row => row.id === id).label}`, exact: true }).click()
    assert.equal(await panel.getAttribute('data-tool-id'), id)
    assert.equal(await nav.locator('button[aria-pressed="true"]').count(), id === 'boolean_search' ? 1 : 0)
  }
  await page.getByRole('button', { name: 'Browse workflows', exact: true }).click()
  assert.equal(await page.locator('.hiring-use-cases > button').count(), 5)
  await page.getByRole('searchbox', { name: 'Search hiring workflows' }).fill('Boolean')
  assert.equal(await page.locator('.hiring-browser-row').count(), 1)
  await page.getByRole('button', { name: 'Favorite Boolean Search Builder', exact: true }).click()
  await page.getByRole('button', { name: 'Favorites', exact: true }).click()
  assert.equal(await page.locator('.hiring-browser-row').count(), 1)
  await page.getByRole('searchbox', { name: 'Search hiring workflows' }).fill('')
  await page.getByRole('button', { name: 'All workflows', exact: true }).click()
  await page.getByRole('button', { name: 'Use Job Description Generator', exact: true }).click()
  assert.ok(await page.getByRole('button', { name: 'Generate job description', exact: true }).isDisabled())
  await page.getByLabel('Job requisition (required)', { exact: true }).selectOption('job-2')
  await page.getByLabel('Additional instructions (optional)', { exact: true }).fill('JD-specific instructions')
  await page.getByRole('button', { name: 'Generate job description', exact: true }).click()
  await page.getByRole('button', { name: 'Save to CRM', exact: true }).waitFor()
  assert.match(requests.at(-1).prompt, /Java Backend Engineer/)
  assert.match(requests.at(-1).prompt, /structured job description/)
  assert.equal(notes.length + tasks.length, 0, 'Generation never writes a record or task')
  await page.getByRole('button', { name: 'Save to CRM', exact: true }).click()
  assert.equal(await page.getByLabel('Save to record', { exact: true }).inputValue(), 'job-2')
  await page.getByLabel('Reviewed draft', { exact: true }).fill('Reviewed Java JD. Confirm compensation with the account manager.')
  await page.getByRole('button', { name: 'Confirm & save note', exact: true }).click()
  await page.getByRole('button', { name: 'Saved to CRM', exact: true }).waitFor()
  assert.match(await page.locator('.hiring-save-success').innerText(), /Saved to Jobs → REQ-102 — Java Backend Engineer → Remarks/)
  await page.getByRole('button', { name: 'Open saved record', exact: true }).waitFor()
  assert.match(notes[0].path, /jobs\/job-2\/notes$/)
  assert.match(jobs[1].notes, /^Keep existing job notes/)
  assert.equal(jobs[1].status, 'Open')

  // Every displayed text action leaves the workflow and restores only its own state.
  for (const action of AI_ACTIONS.filter(item => item.id !== 'recommend')) {
    await nav.getByRole('button', { name: action.label, exact: true }).click()
    assert.equal(await panel.getAttribute('data-tool-kind'), 'action')
    assert.equal(await panel.getAttribute('data-tool-id'), action.id)
    assert.equal(await nav.locator('button[aria-pressed="true"]').count(), 1)
    assert.equal(await page.locator('.hiring-result').innerText(), '')
    assert.equal(await page.getByLabel('Additional instructions (optional)', { exact: true }).inputValue(), action.id === 'summarize' ? 'General summary instructions' : '')
  }
  await nav.getByRole('button', { name: 'Rewrite', exact: true }).click()
  await page.getByLabel('Source text', { exact: true }).fill('Please share the candidate’s interview feedback.')
  await page.getByRole('button', { name: 'Run Rewrite', exact: true }).click()
  await page.getByRole('button', { name: 'Save to CRM', exact: true }).waitFor()
  assert.equal(requests.at(-1).action, 'rewrite')
  assert.doesNotMatch(requests.at(-1).context, /JD-specific|structured job description|Boolean search string/)
  assert.equal(await nav.getByRole('button', { name: 'Recommend', exact: true }).count(), 0)
  await nav.getByRole('button', { name: 'Boolean', exact: true }).click()
  assert.equal(await panel.getAttribute('data-tool-id'), 'boolean_search')
  assert.equal(await nav.getByRole('button', { name: 'Boolean', exact: true }).getAttribute('aria-pressed'), 'true')
  await page.getByRole('button', { name: 'Build Boolean search', exact: true }).waitFor()
  await choose('jd_generator')
  assert.equal(await page.getByLabel('Job requisition (required)', { exact: true }).inputValue(), 'job-2')
  assert.equal(await page.getByLabel('Additional instructions (optional)', { exact: true }).inputValue(), 'JD-specific instructions')
  await page.getByRole('button', { name: 'Saved to CRM', exact: true }).waitFor()
  assert.match(await page.locator('.hiring-save-success').innerText(), /Jobs → REQ-102 — Java Backend Engineer → Remarks/)

  for (const scenario of HIRING_USE_CASES.slice(1)) {
    await choose(scenario.id)
    if (scenario.candidate) {
      await page.getByLabel('Candidate (required)', { exact: true }).selectOption('candidate-1')
      assert.equal(await page.getByLabel(`Job requisition (${scenario.job ? 'required' : 'optional'})`, { exact: true }).inputValue(), 'job-1')
    }
    if (scenario.job) await page.getByLabel('Job requisition (required)', { exact: true }).selectOption(scenario.id === 'boolean_search' ? 'job-3' : 'job-1')
    if (scenario.id === 'boolean_search') await page.getByLabel('Additional instructions (optional)', { exact: true }).fill('create linkedin search as well')
    await page.getByRole('button', { name: hiringRunLabel({ kind: 'workflow', id: scenario.id, actionId: scenario.id === 'candidate_comparison' ? 'compare' : 'draft' }), exact: true }).click()
    await page.getByRole('button', { name: 'Save to CRM', exact: true }).waitFor()
    const prompt = requests.at(-1).prompt
    assert.equal(requests.at(-1).toolId, 'recruiting_workbench')
    assert.doesNotMatch(prompt, /JD-specific instructions/)
    if (scenario.candidate) { assert.match(prompt, /Alex Rivera/); assert.match(prompt, /Interview Done/) }
    if (scenario.id === 'boolean_search') {
      assert.match(prompt, /REQ-103/); assert.match(prompt, /Boolean search string/); assert.match(prompt, /Recruiter instructions: create linkedin search as well/); assert.match(prompt, /LinkedIn people keyword query/); assert.doesNotMatch(prompt, /Alex Rivera/)
      const link = new URL(await page.getByRole('link', { name: /^LinkedIn people search/ }).getAttribute('href'))
      assert.equal(link.searchParams.get('keywords'), '("Data Engineer" OR "Data Developer") AND SQL')
      await page.getByRole('link', { name: /^Open Google X-ray search/ }).waitFor()
    }
    if (scenario.id === 'interview_questions') assert.match(prompt, /unfilled evaluation scorecard/)
    if (scenario.id === 'candidate_comparison' || scenario.id === 'followup_generator') {
      await page.getByRole('button', { name: 'Create follow-up task', exact: true }).click()
      await page.getByLabel('Task title', { exact: true }).fill(scenario.id === 'candidate_comparison' ? 'Verify Alex SQL evidence before submission' : 'Send Alex reviewed interview follow-up')
      await page.getByRole('button', { name: 'Confirm & create task', exact: true }).click()
      await page.getByRole('button', { name: 'Task created', exact: true }).waitFor()
      assert.equal(tasks.at(-1).assigned_to, 'owner-1')
      assert.equal(tasks.at(-1).req_id, 'REQ-101')
    }
  }
  assert.equal(requests.length, 6)
  assert.equal(candidates[0].external_status, 'Interview Done')
  assert.equal(candidates[0].internal_status, 'Submitted')

  // Comparison modes and sourced pools must remain separate and saved prompts keep both documents.
  await choose('candidate_comparison')
  await page.getByRole('button', { name: 'Candidate vs Candidate', exact: true }).click()
  assert.equal(await page.getByLabel('Candidate (required)', { exact: true }).inputValue(), '')
  await page.getByLabel('Candidate (required)', { exact: true }).selectOption('candidate-1')
  await page.waitForFunction(() => document.querySelector('select[aria-label="Second candidate (required)"] option[value="candidate-1"]').disabled)
  assert.ok(await page.getByLabel('Second candidate (required)', { exact: true }).locator('option[value="candidate-1"]').evaluate(option => option.disabled))
  await page.getByRole('button', { name: 'Sourced pool', exact: true }).click()
  assert.deepEqual(await page.getByLabel('Candidate (required)', { exact: true }).locator('option').evaluateAll(rows => rows.map(row => row.value)), ['', 'sourced-1'])
  await page.getByRole('button', { name: 'Resume vs Job Description', exact: true }).click()
  assert.equal(await page.getByLabel('Candidate (required)', { exact: true }).inputValue(), 'candidate-1')
  await page.getByRole('button', { name: 'Paste text', exact: true }).click()
  await page.getByLabel('Resume', { exact: true }).fill('Saved resume: React developer with SQL experience.')
  await page.getByLabel('Job description', { exact: true }).fill('Saved requisition: accessible React and SQL interfaces.')
  await page.getByLabel('Additional instructions (optional)', { exact: true }).fill('Keep an evidence table.')
  await page.getByRole('button', { name: 'Save prompt', exact: true }).click()
  await nav.getByRole('button', { name: 'Draft', exact: true }).click()
  await page.getByRole('button', { name: 'Open history and saved prompts', exact: true }).click()
  await page.locator('.workspace-drawer').getByText(/^Saved resume:/).click()
  await page.getByText('Saved requisition: accessible React and SQL interfaces.', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.hiring-tool-panel').dataset.toolKind === 'workflow')
  assert.equal(await panel.getAttribute('data-tool-kind'), 'workflow')
  assert.equal(await page.getByLabel('Resume', { exact: true }).inputValue(), 'Saved resume: React developer with SQL experience.')
  assert.equal(await page.getByLabel('Job description', { exact: true }).inputValue(), 'Saved requisition: accessible React and SQL interfaces.')
  assert.equal(await page.getByLabel('Additional instructions (optional)', { exact: true }).inputValue(), 'Keep an evidence table.')

  // Failures and tool switches must never leave a stale result that can be saved.
  failAI = true
  await page.getByRole('button', { name: 'Review candidate fit', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Provider unavailable' }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Save to CRM', exact: true }).count(), 0)
  failAI = false; incomplete = true
  await page.getByRole('button', { name: 'Review candidate fit', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'before the response completed' }).waitFor()
  incomplete = false; holdAI = true
  await page.getByRole('button', { name: 'Review candidate fit', exact: true }).click()
  await page.getByRole('button', { name: 'Stop generating', exact: true }).waitFor()
  await page.waitForFunction(() => document.querySelector('.hiring-run-bar').textContent.includes('Stop generating'))
  await Promise.race([new Promise(resolve => { const poll = () => heldRoute ? resolve() : setTimeout(poll, 10); poll() }), new Promise((_, reject) => setTimeout(() => reject(new Error('AI request did not start')), 3000))])
  await nav.getByRole('button', { name: 'Translate', exact: true }).click()
  await heldRoute.fulfill({ status: 200, contentType: 'text/event-stream', body: responseBody() }).catch(() => {})
  holdAI = false
  assert.equal(await page.locator('.hiring-result').innerText(), '')
  assert.equal(await panel.getAttribute('data-tool-id'), 'translate')
  await choose('boolean_search')
  failRecords = true
  const before = requests.length
  await page.getByRole('button', { name: 'Build Boolean search', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'temporarily unavailable' }).first().waitFor()
  assert.equal(requests.length, before)
  failRecords = false
  await page.getByRole('button', { name: 'Refresh records', exact: true }).click()
  await page.getByRole('button', { name: 'Build Boolean search', exact: true }).waitFor({ state: 'visible' })
  await page.waitForFunction(() => !document.querySelector('.hiring-crm-status button').disabled)
  await page.getByRole('button', { name: 'Build Boolean search', exact: true }).click()
  await page.getByRole('button', { name: 'Save to CRM', exact: true }).waitFor()
  await page.locator('.ai-studio-canvas').evaluate(element => { element.scrollTop = 0 })
  await page.screenshot({ path: 'tests/hiring-tools-desktop.png' })
  for (const theme of ['dark', 'light']) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value }, theme)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(250)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.body.scrollHeight <= innerHeight))
    assert.ok(await panel.evaluate(element => element.scrollWidth <= element.clientWidth))
    await page.screenshot({ path: `tests/hiring-tools-mobile-${theme}.png` })
  }
  assert.deepEqual(errors, [])
})
