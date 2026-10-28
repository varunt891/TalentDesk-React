import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { chromium } from 'playwright'

test('job preview keeps profiles, tabs, edit/delete confirmation and full details usable in both themes', async t => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } })
  await server.listen()
  t.after(() => server.close())
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(10000)
  const created = new Date().toISOString()
  const title = 'Senior Full Stack Engineer — Enterprise Applications and Platform Services'
  const job = { id: '10000000-0000-4000-8000-000000000001', job_id: 'REQ-101', title, client: 'Example Client', status: 'Open', location: 'New York, NY', rate: '$98/hr', type: 'Full-time', priority: 'High', work_mode: 'Remote', open_date: '2026-10-04', updated_at: created, created_at: created, skills: '["React","Node.js","TypeScript","PostgreSQL"]', description: '## Role overview\nBuild accessible recruiting tools.\n\n## Requirements\nDocumented React and Node.js experience.', notes: 'Reviewed Boolean search saved from AI Center.', assigned_to: ['owner'] }
  const jobs = [job, { id: '10000000-0000-4000-8000-000000000002', title: 'New requisition', status: 'Open' }]
  const names = ['Avery Patel', 'Jamie Chen', 'Sam Rivera', 'Robin Davis', 'Taylor Stone', 'Jordan Lee']
  const candidates = names.map((name, i) => ({ id: `candidate-${i}`, first_name: name.split(' ')[0], last_name: name.split(' ')[1], email: `candidate${i}@example.test`, job_id: job.job_id, job_title: 'Full Stack Engineer', internal_status: i === 0 ? 'Interview Scheduled' : i === 1 ? 'Offer Extended' : 'Submitted', skills: ['React', 'Node.js'], created_at: created }))
  const errors = [], writes = [], aiRequests = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => localStorage.setItem('td_sidebar_collapsed', 'false'))
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname
    let json = { data: [], ok: true }
    if (request.method() !== 'GET' && !path.includes('/ai/')) writes.push(path)
    if (path.endsWith('/auth/session')) json = { user: { id: 'owner', email: 'owner@example.test' }, profile: { id: 'owner', full_name: 'Test Owner', role: 'OWNER', org_id: 'job-org' }, organization: { id: 'job-org', name: 'Job QA' } }
    else if (path.endsWith('/data/jobs')) {
      const filters = JSON.parse(url.searchParams.get('filter') || '[]')
      json = { data: jobs.filter(row => filters.every(filter => filter.op !== 'eq' || row[filter.column] === filter.value)) }
    } else if (path.endsWith('/data/candidates')) json = { data: candidates }
    else if (path.endsWith('/data/profiles')) json = { data: [{ id: 'owner', full_name: 'Test Owner' }] }
    else if (path.endsWith('/ai/action')) { aiRequests.push(request.postDataJSON()); json = { success: true, text: '## Requisition summary\nReact and Node.js experience is recorded for this role.', provider: 'test', model: 'test' } }
    await route.fulfill({ status: 200, json })
  })
  await page.goto(server.resolvedUrls.local[0])
  await page.locator('.app-topbar').getByRole('button', { name: 'Jobs', exact: true }).click()
  const open = async (name = title) => {
    await page.getByRole('row').filter({ hasText: name }).first().click()
    await page.locator('.job-preview-drawer').waitFor()
  }
  await open()
  const drawer = page.locator('.job-preview-drawer'), body = drawer.locator('.entity-drawer-body')
  assert.deepEqual(await drawer.locator('.job-preview-stats strong').allTextContents(), ['6', '1', '1', '0'])
  assert.equal(await drawer.locator('.job-preview-skills .td-badge').count(), 4)
  assert.match(await drawer.locator('.job-preview-facts').innerText(), /Test Owner/)
  assert.equal(await drawer.locator('.job-preview-person:visible').count(), 4)
  const avatar = await drawer.locator('.job-preview-person > span:first-child').first().boundingBox()
  assert.ok(avatar.width <= 32, 'Candidate avatars must remain icons, not stretch across the row')
  await drawer.getByText('View 2 more candidates', { exact: true }).click()
  assert.equal(await drawer.locator('.job-preview-person:visible').count(), 6)
  await drawer.locator('.job-preview-person').filter({ hasText: 'Taylor Stone' }).click()
  await page.locator('.workspace-dialog').getByRole('heading', { name: 'Taylor Stone', exact: true }).waitFor()
  await page.locator('.workspace-dialog').getByRole('button', { name: 'Close', exact: true }).last().click()
  await drawer.getByRole('button', { name: 'Read full description', exact: true }).click()
  await page.locator('.workspace-dialog').getByRole('heading', { name: `Job Description — ${title}`, exact: true }).waitFor()
  await page.locator('.workspace-dialog').getByRole('button', { name: 'Close', exact: true }).last().click()
  await drawer.getByText('Internal remarks', { exact: true }).click()
  await drawer.getByText('Reviewed Boolean search saved from AI Center.', { exact: true }).waitFor()

  await drawer.getByRole('tab', { name: /^Pipeline/ }).click()
  assert.equal(await drawer.getByRole('button', { name: 'Profile', exact: true }).count(), 6)
  await drawer.getByRole('tab', { name: /^Activity/ }).click()
  assert.equal(await drawer.locator('.job-preview-activity > div').count(), 6)
  await drawer.getByRole('tab', { name: 'AI', exact: true }).click()
  await drawer.locator('.job-preview-ai .td-card').first().getByRole('button', { name: 'Generate', exact: true }).click()
  await drawer.getByRole('heading', { name: 'Requisition summary', exact: true }).waitFor()
  assert.equal(aiRequests.length, 1)
  assert.match(aiRequests[0].content, /REQ|Enterprise Applications/)

  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      for (const tab of ['Overview', 'Pipeline', 'Activity', 'AI']) {
        await drawer.getByRole('tab', { name: tab === 'Pipeline' || tab === 'Activity' ? new RegExp(`^${tab}`) : tab, exact: tab !== 'Pipeline' && tab !== 'Activity' }).click()
        await page.waitForTimeout(100)
        assert.ok(await drawer.evaluate(element => element.scrollWidth <= element.clientWidth), `${theme} ${width}px ${tab}`)
        assert.equal(await page.evaluate(() => window.scrollY), 0)
        const header = await drawer.locator('.entity-drawer-header').boundingBox(), footer = await drawer.locator('.entity-drawer-footer').boundingBox()
        await body.evaluate(element => { element.scrollTop = element.scrollHeight })
        assert.deepEqual(await drawer.locator('.entity-drawer-header').boundingBox(), header)
        assert.deepEqual(await drawer.locator('.entity-drawer-footer').boundingBox(), footer)
        assert.ok(footer.y + footer.height <= (width === 390 ? 844 : 1000))
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await drawer.getByRole('button', { name: 'View in full screen', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.job-preview-drawer').getBoundingClientRect().width > 1000)
  await drawer.getByRole('button', { name: 'Restore side view', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.job-preview-drawer').getBoundingClientRect().width === 640)
  await drawer.getByRole('button', { name: 'Edit job', exact: true }).click()
  await page.getByRole('heading', { name: 'Edit Job', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await open()
  await drawer.getByRole('button', { name: 'More job actions', exact: true }).click()
  await page.getByRole('button', { name: 'Delete job', exact: true }).click()
  await page.getByRole('heading', { name: 'Delete job?', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await open()
  await drawer.getByRole('button', { name: 'View full details', exact: true }).click()
  await page.getByRole('heading', { name: 'Job Details', exact: true }).waitFor()
  await page.locator('.app-topbar').getByRole('button', { name: 'Jobs', exact: true }).click()
  await open('New requisition')
  assert.match(await drawer.locator('.job-preview-facts').innerText(), /Not recorded/)
  assert.match(await drawer.locator('.job-preview-overview').innerText(), /No skills recorded|No candidates have been submitted/)
  assert.equal(writes.length, 0, 'Previewing, editing then cancelling, and cancelling deletion must not mutate CRM records')
  assert.deepEqual(errors, [])
})
