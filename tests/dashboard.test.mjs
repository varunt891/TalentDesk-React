import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { chromium } from 'playwright'

test('dashboard keeps recruiting actions, filters and local notes working across its focused views', async t => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } })
  await server.listen()
  t.after(() => server.close())
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  page.setDefaultTimeout(10000)
  const today = new Date().toISOString().slice(0, 10)
  const created = new Date().toISOString()
  const candidates = [
    { id: 'alex', first_name: 'Alex', last_name: 'Rivera', internal_status: 'Submitted', external_status: 'Interview Scheduled', job_title: 'React Engineer', recruiter_name: 'Test Owner', recruiter_id: 'owner', job_id: 'REQ-101', skills: ['React'], submission_date: today, created_at: created },
    { id: 'sam', first_name: 'Sam', last_name: 'Chen', internal_status: 'Submitted', external_status: 'Offer Extended', job_title: 'Java Engineer', recruiter_name: 'Test Owner', recruiter_id: 'owner', job_id: 'REQ-101', skills: ['Java'], submission_date: today, created_at: created },
    { id: 'jamie', first_name: 'Jamie', last_name: 'Patel', internal_status: 'Submitted', external_status: 'Rejected', recruiter_name: 'Test Owner', recruiter_id: 'owner', job_id: 'REQ-102', submission_date: today, created_at: created },
  ]
  const jobs = [{ id: 'job-1', job_id: 'REQ-101', title: 'React Engineer', status: 'Open', created_at: created }, { id: 'job-2', job_id: 'REQ-102', title: 'Java Engineer', status: 'Closed', created_at: created }]
  const callbacks = [{ id: 'cb-1', candidate_name: 'Alex Rivera', status: 'pending', date: today, time: '23:59', created_at: created }]
  const followups = [{ id: 'fu-1', candidate_name: 'Sam Chen', status: 'pending', date: '2000-01-01', created_at: created }]
  const errors = [], writes = [], aiRequests = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => localStorage.setItem('td_sidebar_collapsed', 'false'))
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    let json = { data: [], ok: true }
    if (path.endsWith('/auth/session')) json = { user: { id: 'owner', email: 'owner@example.test' }, profile: { id: 'owner', full_name: 'Test Owner', org_id: 'dashboard-org', role: 'OWNER' }, organization: { id: 'dashboard-org', name: 'Dashboard QA' } }
    else if (/\/data\/(callbacks|followups)\//.test(path) && request.method() === 'PUT') {
      const rows = path.includes('/callbacks/') ? callbacks : followups
      const row = rows.find(item => path.endsWith(`/${item.id}`))
      const body = request.postDataJSON()
      writes.push({ path, body }); Object.assign(row, body); json = { data: [row] }
    } else if (path.endsWith('/data/candidates')) json = { data: candidates }
    else if (path.endsWith('/data/jobs')) json = { data: jobs }
    else if (path.endsWith('/data/callbacks')) json = { data: callbacks }
    else if (path.endsWith('/data/followups')) json = { data: followups }
    else if (path.endsWith('/data/profiles')) json = { data: [{ id: 'owner', full_name: 'Test Owner' }] }
    else if (path.endsWith('/ai/action')) { aiRequests.push(request.postDataJSON()); json = { success: true, text: '## Recruiting plan\nReview the recorded offers and follow up on open requisitions.', provider: 'test', model: 'test' } }
    await route.fulfill({ status: 200, json })
  })
  await page.goto(server.resolvedUrls.local[0])
  const views = page.getByRole('navigation', { name: 'Dashboard views' })
  await page.locator('.dashboard-priority-row').filter({ hasText: 'Due Callbacks' }).getByText('1', { exact: true }).waitFor()
  const values = () => page.locator('.dashboard-metrics .td-kpi > div:nth-child(2) > span:first-child').allTextContents()
  assert.deepEqual(await values(), ['3', '2', '1', '1'])
  assert.equal(await page.getByRole('heading', { name: 'Recruiter Leaderboard', exact: true }).count(), 0)
  assert.equal(await page.getByPlaceholder('Add recruiter action item...').count(), 0)
  assert.equal(aiRequests.length + writes.length, 0, 'Opening the dashboard does not generate AI or write records')

  // Existing completion actions remain usable directly from the attention list.
  await page.getByTitle('Mark done', { exact: true }).first().click()
  await page.locator('.dashboard-priority-row').filter({ hasText: 'Due Callbacks' }).getByText('0', { exact: true }).waitFor()
  await page.getByTitle('Mark done', { exact: true }).click()
  await page.locator('.dashboard-priority-row').filter({ hasText: 'Overdue Follow-ups' }).getByText('0', { exact: true }).waitFor()
  assert.equal(writes.length, 2)
  assert.equal(callbacks[0].status, 'done')
  assert.equal(followups[0].status, 'done')

  await page.getByRole('button', { name: 'Filters', exact: true }).click()
  await page.getByLabel('Candidate stage', { exact: true }).selectOption('Offer Extended')
  await page.waitForFunction(() => document.querySelector('.dashboard-metrics .td-kpi > div:nth-child(2) > span:first-child').textContent === '1')
  assert.deepEqual(await values(), ['1', '1', '1', '1'])
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await page.getByRole('button', { name: 'Filters', exact: true }).click()

  // The checklist and scratchpad keep their existing browser-local persistence.
  await views.getByRole('button', { name: 'My day', exact: true }).click()
  await page.getByPlaceholder('Add recruiter action item...').fill('Verify candidate availability for REQ-101')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByText('Verify candidate availability for REQ-101', { exact: true }).waitFor()
  const scratchpad = page.getByPlaceholder('Type quick candidate numbers, interview notes, or call snippets here...')
  await scratchpad.fill('Account manager will confirm the interview panel tomorrow.')
  await views.getByRole('button', { name: 'Overview', exact: true }).click()
  await views.getByRole('button', { name: 'My day', exact: true }).click()
  assert.equal(await scratchpad.inputValue(), 'Account manager will confirm the interview panel tomorrow.')
  await page.reload()
  await views.getByRole('button', { name: 'My day', exact: true }).click()
  await page.getByText('Verify candidate availability for REQ-101', { exact: true }).waitFor()
  assert.equal(await scratchpad.inputValue(), 'Account manager will confirm the interview panel tomorrow.')

  await views.getByRole('button', { name: 'Insights', exact: true }).click()
  await page.getByRole('heading', { name: 'Recruiter Leaderboard', exact: true }).waitFor()
  assert.equal(await page.locator('.dashboard-metrics .td-kpi').count(), 6)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export XLSX', exact: true }).click()
  assert.match((await download).suggestedFilename(), /^Recruiter_Leaderboard_.*\.xlsx$/)
  await views.getByRole('button', { name: 'Overview', exact: true }).click()
  await page.getByRole('button', { name: 'Generate plan', exact: true }).click()
  await page.getByRole('heading', { name: 'Recruiting plan', exact: true }).waitFor()
  assert.equal(aiRequests.length, 1)
  assert.equal(aiRequests[0].action, 'analyze')

  // All three views fit light/dark desktop and mobile without window scrolling.
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
    for (const width of [1600, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      for (const view of ['Overview', 'My day', 'Insights']) {
        await views.getByRole('button', { name: view, exact: true }).click()
        await page.waitForTimeout(180)
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.scrollingElement.scrollHeight <= innerHeight), `${view}, ${theme}, ${width}px`)
        assert.ok(await page.locator('.dashboard-page').evaluate(element => element.scrollWidth <= element.clientWidth), `${view} does not overflow its page`)
      }
    }
  }
  await page.getByRole('button', { name: 'More dashboard actions', exact: true }).click()
  await page.getByRole('button', { name: 'Search workspace', exact: true }).click()
  await page.getByPlaceholder('Search candidates, jobs, clients, or run an action...').waitFor()
  await page.keyboard.press('Escape')
  assert.deepEqual(errors, [])
})
