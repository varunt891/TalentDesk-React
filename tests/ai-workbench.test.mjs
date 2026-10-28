import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { RECRUITING_WORKFLOWS } from '../src/lib/ai/recruitingWorkbench.js'
import { DEFAULT_AI_POLICY, mergeAiPolicy } from '../shared/aiPolicy.js'

test('recruiting workbench generates from CRM records, separates pools, and saves reviewed work', async t => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } })
  await server.listen()
  t.after(() => server.close())
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', err => errors.push(err.message))
  const org = { id: 'workbench-org', name: 'Recruiting Test', timezone: 'Asia/Kolkata' }
  const candidates = [
    { id: 'candidate-1', first_name: 'Alex', last_name: 'Rivera', internal_status: 'Submitted', external_status: 'Shortlisted', job_id: 'REQ-101', job_title: 'React Engineer', skills: ['React.js', 'Node.js'], resume_text: 'Built React interfaces.', notes: 'Original recruiter notes', followup_date: '2000-01-01' },
    { id: 'sourced-1', first_name: 'Sam', last_name: 'Chen', internal_status: 'Sourced', external_status: 'Pending', skills: ['Python'] },
  ]
  const jobs = [{ id: 'job-1', job_id: 'REQ-101', title: 'Senior React Engineer', skills: ['React', 'SQL'], description: 'Build accessible interfaces.', status: 'Open' }]
  const requests = [], writes = [], tasks = []
  let failAI = false, incompleteAI = false, failRecords = false
  let policy = structuredClone(DEFAULT_AI_POLICY)
  const output = '## Candidate evidence\nAlex Rivera has recorded React skills for REQ-101. SQL experience needs verification.\n\n### Next steps\n- Ask for an example of SQL work.'
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    let json = { data: [], ok: true }
    if (path.endsWith('/auth/session')) json = { user: { id: 'recruiter-1', email: 'recruiter@example.test' }, profile: { id: 'recruiter-1', full_name: 'Test Recruiter', org_id: org.id, role: 'OWNER' }, organization: org }
    else if (path.endsWith('/organization/ai-policy')) {
      if (request.method() === 'PUT') policy = mergeAiPolicy(policy, request.postDataJSON())
      json = { organization_id: org.id, data: policy }
    }
    else if (path.endsWith('/ai/generate/stream')) {
      requests.push(request.postDataJSON())
      if (failAI) return route.fulfill({ status: 503, json: { error: 'AI provider temporarily unavailable.' } })
      const body = `data: ${JSON.stringify({ delta: output })}\r\n\r\n${incompleteAI ? '' : `data: ${JSON.stringify({ done: true, provider: 'test', model: 'test-model' })}`}`
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body })
    } else if (path.endsWith('/data/candidates/candidate-1/notes')) {
      const body = request.postDataJSON()
      writes.push(body)
      candidates[0].notes += `\n\n${body.content}`
      json = { data: [candidates[0]] }
    } else if (path.endsWith('/data/tasks') && request.method() === 'POST') {
      tasks.push(request.postDataJSON())
      json = { data: [{ id: 'task-1', ...tasks.at(-1) }] }
    } else if (path.endsWith('/data/candidates')) {
      if (failRecords) return route.fulfill({ status: 503, json: { error: 'Database temporarily unavailable.' } })
      json = { data: candidates }
    } else if (path.endsWith('/data/jobs')) json = { data: jobs }
    else if (path.endsWith('/data/tasks')) json = { data: tasks }
    await route.fulfill({ status: 200, json })
  })
  await page.addInitScript(() => localStorage.setItem('td_sidebar_collapsed', 'false'))
  await page.goto(server.resolvedUrls.local[0])
  await page.getByRole('button', { name: 'AI Center', exact: true }).click()
  await page.locator('.recruiting-metrics strong').filter({ hasText: '1' }).first().waitFor()
  assert.equal(await page.locator('.recruiting-workflow-card').count(), 8)
  assert.deepEqual(await page.locator('.recruiting-metrics strong').allTextContents(), ['1', '1', '1', '1'])
  await page.mouse.move(600, 100)
  const hoverSurface = page.locator('.ai-hover-navigation-surface')
  assert.equal(await page.locator('#workspace-navigation').getAttribute('aria-hidden'), null)
  assert.equal(await page.locator('.app-sidebar').getAttribute('data-collapsed'), 'true')
  const shell = await page.locator('.app-shell').boundingBox()
  const main = await page.locator('.app-main').boundingBox()
  assert.equal(main.x, shell.x + 81)
  assert.equal(main.width, shell.width - 82, 'AI Center reserves only the collapsed icon rail')
  const dashboardBeforeHover = await page.getByRole('button', { name: 'Dashboard', exact: true }).boundingBox()
  await hoverSurface.hover()
  await page.waitForFunction(() => document.querySelector('.ai-hover-navigation-surface').getBoundingClientRect().width === 240)
  assert.equal(await page.locator('.app-sidebar').getAttribute('data-collapsed'), 'false')
  assert.equal((await page.getByRole('button', { name: 'Dashboard', exact: true }).boundingBox()).y, dashboardBeforeHover.y, 'Navigation icons stay in place when labels expand')
  assert.deepEqual(await page.locator('.app-main').boundingBox(), main, 'Hover expansion must not shift the AI workspace')
  await page.mouse.move(600, 100)
  await page.waitForFunction(() => document.querySelector('.ai-hover-navigation-surface').getBoundingClientRect().width === 80)
  assert.equal(await page.locator('.app-sidebar').getAttribute('data-collapsed'), 'true')
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).focus()
  await page.keyboard.press('Tab')
  assert.equal(await hoverSurface.getAttribute('data-expanded'), 'true', 'Keyboard navigation can expand the labels too')
  await page.keyboard.press('Escape')
  assert.equal(await hoverSurface.getAttribute('data-expanded'), 'false')
  await page.getByLabel('Ask Copilot', { exact: true }).fill('Which candidates need a follow-up today?')
  await page.getByRole('button', { name: 'Ask Copilot', exact: true }).click()
  assert.equal(await page.getByPlaceholder('Ask Copilot anything about your workspace...').inputValue(), 'Which candidates need a follow-up today?')
  assert.equal(requests.length, 0, 'The prompt can be reviewed before sending to Copilot')
  await page.getByRole('navigation', { name: 'AI Center sections' }).getByRole('button', { name: 'Workbench', exact: true }).click()

  await page.getByRole('button', { name: 'Source', exact: true }).click()
  assert.equal(await page.locator('.recruiting-workflow-card').count(), 2)
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await page.getByRole('searchbox', { name: 'Search workflows', exact: true }).fill('interview')
  assert.equal(await page.locator('.recruiting-workflow-card').count(), 1)
  await page.getByRole('searchbox', { name: 'Search workflows', exact: true }).fill('')
  assert.equal(await page.getByRole('complementary', { name: 'Recruiting workflows' }).count(), 0, 'The overview should not repeat the workflow library in a sidebar')
  await page.locator('.recruiting-workflow-card').first().click()
  const rail = page.getByRole('complementary', { name: 'Recruiting workflows' })
  assert.ok(await page.getByRole('button', { name: 'Generate fit review', exact: true }).isDisabled())
  assert.match(await page.locator('#recruiting-generation-help').innerText(), /Select a candidate and a job requisition/)
  await page.getByRole('button', { name: 'Select candidate', exact: true }).click()
  assert.ok(await page.locator('#recruiting-candidate').evaluate(element => element === document.activeElement))
  await page.locator('#recruiting-candidate').selectOption('candidate-1')
  assert.equal(await page.locator('#recruiting-job').inputValue(), 'job-1', 'Use the candidate’s linked requisition when no job was chosen')
  assert.ok(await page.getByRole('button', { name: 'Generate fit review', exact: true }).isEnabled())
  await page.locator('#recruiting-job').selectOption('')
  assert.match(await page.locator('#recruiting-generation-help').innerText(), /Select a job requisition above/)
  assert.ok(await page.getByRole('button', { name: 'Generate fit review', exact: true }).isDisabled())
  await page.getByRole('button', { name: 'Select job requisition', exact: true }).click()
  assert.ok(await page.locator('#recruiting-job').evaluate(element => element === document.activeElement))
  await page.locator('#recruiting-job').selectOption('job-1')
  await page.locator('.ai-studio-canvas').evaluate(element => { element.scrollTop = 0 })
  const generateButton = await page.getByRole('button', { name: 'Generate fit review', exact: true }).boundingBox()
  assert.ok(generateButton.y + generateButton.height <= 1000, 'The Generate action should be visible before optional details are expanded')
  await page.locator('.recruiting-source-details summary').click()
  assert.match(await page.locator('.recruiting-skill-coverage').innerText(), /1\/2/)
  await page.getByRole('button', { name: 'Generate fit review', exact: true }).click()
  await page.getByRole('button', { name: 'Save to candidate notes', exact: true }).waitFor()
  assert.equal(requests[0].toolId, 'recruiting_workbench')
  assert.match(requests[0].prompt, /Built React interfaces/)
  assert.match(requests[0].prompt, /Build accessible interfaces/)
  assert.match(requests[0].prompt, /REQ-101/)
  assert.equal(writes.length, 0)

  await page.getByRole('button', { name: 'Save to candidate notes', exact: true }).click()
  await page.locator('#recruiting-reviewed-draft').fill('Reviewed candidate brief. Verify SQL experience.')
  await page.getByRole('button', { name: 'Confirm & save note', exact: true }).click()
  await page.getByRole('button', { name: 'Saved to record', exact: true }).waitFor()
  assert.equal(writes[0].content, 'Reviewed candidate brief. Verify SQL experience.')
  assert.ok(candidates[0].notes.startsWith('Original recruiter notes'))
  assert.equal(candidates[0].internal_status, 'Submitted')
  assert.equal(candidates[0].external_status, 'Shortlisted')

  await page.getByRole('button', { name: 'Create task', exact: true }).click()
  await page.getByLabel('Task title', { exact: true }).fill('Verify Alex SQL experience')
  await page.getByRole('button', { name: 'Confirm & create task', exact: true }).click()
  await page.getByRole('button', { name: 'Task created', exact: true }).waitFor()
  assert.equal(tasks[0].assigned_to, 'recruiter-1')
  assert.equal(tasks[0].req_id, 'REQ-101')
  assert.equal(tasks[0].title, 'Verify Alex SQL experience')

  await page.getByRole('button', { name: 'Sourced pool', exact: true }).click()
  assert.equal(await page.locator('#recruiting-candidate').inputValue(), '')
  assert.deepEqual(await page.locator('#recruiting-candidate option').evaluateAll(options => options.map(option => option.value)), ['', 'sourced-1'])
  await page.getByRole('button', { name: 'Candidates', exact: true }).last().click()
  await page.locator('#recruiting-candidate').selectOption('candidate-1')

  for (const workflow of RECRUITING_WORKFLOWS.slice(1)) {
    await rail.getByRole('button', { name: workflow.shortLabel, exact: true }).click()
    await page.getByRole('button', { name: `Generate ${workflow.shortLabel.toLowerCase()}`, exact: true }).click()
    await page.getByRole('button', { name: 'Copy draft', exact: true }).waitFor()
    assert.match(await page.locator('.recruiting-result-body').innerText(), /SQL experience needs verification/)
  }
  assert.equal(requests.length, 8)

  failAI = true
  await rail.getByRole('button', { name: 'Fit review', exact: true }).click()
  await page.getByRole('button', { name: 'Generate fit review', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'AI provider temporarily unavailable' }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Save to candidate notes', exact: true }).count(), 0)
  failAI = false; incompleteAI = true
  await page.getByRole('button', { name: 'Generate fit review', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'before the response completed' }).waitFor()
  incompleteAI = false; failRecords = true
  const before = requests.length
  await page.getByRole('button', { name: 'Generate fit review', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Database temporarily unavailable' }).waitFor()
  assert.equal(requests.length, before, 'Failed database reads must not start AI generation')
  failRecords = false
  await page.getByRole('button', { name: 'Refresh data', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('.recruiting-connection button').disabled)

  const sections = page.getByRole('navigation', { name: 'AI Center sections' })
  await sections.getByRole('button', { name: 'Preferences', exact: true }).click()
  await page.locator('input[type="number"]').fill('1')
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('td_ai_governance_workbench-org')).dailyRequestLimit === 1)
  await sections.getByRole('button', { name: 'Workbench', exact: true }).click()
  assert.ok(await page.getByRole('button', { name: 'Generate fit review', exact: true }).isDisabled())
  assert.match(await page.locator('.recruiting-workbench-main').innerText(), /daily AI request limit has been reached/)

  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(250)
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
    await page.getByRole('button', { name: 'Close navigation', exact: true }).click()
    assert.equal(await page.locator('#workspace-navigation').getAttribute('aria-hidden'), 'true')
    const activeTab = await page.locator('.ai-studio-modes button[aria-current="page"]').evaluate(element => {
      const style = getComputedStyle(element)
      return { background: style.backgroundColor, color: style.color }
    })
    assert.equal(activeTab.color, 'rgb(255, 255, 255)')
    assert.notEqual(activeTab.background, 'rgb(255, 255, 255)', 'The selected mode must stay readable in both themes')
    await page.locator('.recruiting-output').scrollIntoViewIfNeeded()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    assert.equal(await page.evaluate(() => window.scrollY), 0)
    assert.ok(await page.locator('.app-topbar').isVisible())
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await hoverSurface.hover()
  await page.mouse.move(600, 100)
  assert.equal(await hoverSurface.getAttribute('data-expanded'), 'false')
  await hoverSurface.hover()
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.navigation-rail').getBoundingClientRect().width === 240)
  assert.equal(await page.locator('#workspace-navigation').getAttribute('aria-hidden'), null)
  assert.equal(await page.evaluate(() => localStorage.getItem('td_sidebar_collapsed')), 'false')
  assert.deepEqual(errors, [])
})
