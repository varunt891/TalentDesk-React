import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { chromium } from 'playwright'

test('Pipeline Studio preserves stage moves, filters, drawers, and independent scrolling', async t => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } })
  await server.listen()
  t.after(() => server.close())
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const organization = { id: 'pipeline-test-org', name: 'Test Workspace' }
  const rows = Array.from({ length: 10 }, (_, index) => ({
    id: `candidate-${index}`, first_name: `Test${index}`, last_name: 'Candidate',
    org_id: organization.id, internal_status: 'Submitted',
    external_status: index < 8 ? 'Submitted' : index === 8 ? 'Shortlisted' : 'Offer Extended',
    email: `candidate-${index}@example.test`, phone: '+1 202 555 0100',
    skills: ['React', 'SQL', 'TypeScript'], job_title: 'Software Engineer',
    client: 'Demo Client', location: 'Austin, TX', experience: '6',
    recruiter_name: 'Test Owner', rate: '$85/hr', priority: 'High',
    submission_date: new Date().toISOString().slice(0, 10),
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }))
  const moves = []
  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    let json = { data: [], ok: true }
    if (path.endsWith('/auth/session')) json = {
      user: { id: 'test-owner', email: 'test@example.test' },
      profile: { id: 'test-owner', full_name: 'Test Owner', org_id: organization.id, role: 'OWNER' }, organization,
    }
    else if (path.endsWith('/data/candidates')) json = { data: rows }
    else if (path.includes('/data/candidates/') && request.method() === 'PUT') {
      const candidate = rows.find(row => path.endsWith(`/${row.id}`))
      const patch = request.postDataJSON()
      Object.assign(candidate, patch)
      moves.push(patch)
      json = { data: [candidate], collisions: [] }
    }
    await route.fulfill({ status: 200, json })
  })
  // Ignore the legacy saved compact preference when opening Pipeline.
  await page.addInitScript(() => localStorage.setItem('td_pipeline_compact_header', 'true'))
  await page.goto(server.resolvedUrls.local[0])
  await page.getByRole('button', { name: 'Pipeline', exact: true }).first().click()
  await page.locator('.pipeline-person-card').first().waitFor()
  assert.equal(await page.locator('.pipeline-studio').getAttribute('data-board-focus'), 'false')
  assert.ok(await page.locator('.pipeline-stage-map').isVisible())
  const submitted = page.locator('.pipeline-lane[data-stage="Submitted"]')
  const shortlisted = page.locator('.pipeline-lane[data-stage="Shortlisted"]')
  assert.equal(await submitted.locator('.pipeline-person-card').count(), 8)
  assert.equal(await shortlisted.locator('.pipeline-person-card').count(), 1)

  await submitted.locator('[data-candidate-id="candidate-0"]').dragTo(shortlisted.locator('.pipeline-lane-heading'))
  await shortlisted.locator('[data-candidate-id="candidate-0"]').waitFor()
  assert.deepEqual(moves, [{ external_status: 'Shortlisted' }])
  assert.equal(rows[0].internal_status, 'Submitted')

  await page.getByRole('button', { name: 'View Hired stage', exact: true }).click()
  await page.waitForTimeout(450)
  const hiredBox = await page.locator('.pipeline-lane[data-stage="Hired"]').boundingBox()
  const boardBox = await page.locator('.pipeline-board-scroll').boundingBox()
  assert.ok(hiredBox.x >= boardBox.x && hiredBox.x + hiredBox.width <= boardBox.x + boardBox.width + 1)
  await page.getByRole('button', { name: 'View Submitted stage', exact: true }).click()
  await page.waitForTimeout(450)

  const stages = ['Submitted', 'Shortlisted', 'Interview Scheduled', 'Interview Done', 'Offer Extended', 'Hired', 'Rejected']
  for (const stage of stages.slice(1)) {
    await page.getByRole('button', { name: 'Scroll stages right', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: `View ${stage} stage`, exact: true }).getAttribute('aria-current'), 'step')
  }
  await page.waitForFunction(() => {
    const board = document.querySelector('.pipeline-board-scroll')
    return Math.abs(board.scrollLeft - (board.scrollWidth - board.clientWidth)) < 2
  })
  assert.equal(await page.getByRole('button', { name: 'View Rejected stage', exact: true }).getAttribute('aria-current'), 'step')
  assert.ok(await page.getByRole('button', { name: 'Scroll stages right', exact: true }).isDisabled())
  const rejectedBox = await page.locator('.pipeline-lane[data-stage="Rejected"]').boundingBox()
  assert.ok(rejectedBox.x >= boardBox.x && rejectedBox.x + rejectedBox.width <= boardBox.x + boardBox.width + 1)
  for (const stage of stages.slice(0, -1).reverse()) {
    await page.getByRole('button', { name: 'Scroll stages left', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: `View ${stage} stage`, exact: true }).getAttribute('aria-current'), 'step')
  }
  await page.waitForTimeout(450)
  assert.ok(await page.getByRole('button', { name: 'Scroll stages left', exact: true }).isDisabled())

  // Dragging the horizontal scrollbar must visit the same seven positions,
  // including Offer Extended and Hired before reaching the final stage.
  const scrollBoard = page.locator('.pipeline-board-scroll')
  await scrollBoard.dispatchEvent('pointerdown')
  for (const [index, stage] of stages.entries()) {
    await scrollBoard.evaluate((el, step) => {
      el.scrollTo({ left: (el.scrollWidth - el.clientWidth) * step / 6, behavior: 'instant' })
    }, index)
    await page.waitForFunction(stageId => document.querySelector(`.pipeline-stage-map button[aria-current="step"]`)?.title === stageId, stage)
  }
  await page.getByRole('button', { name: 'View Submitted stage', exact: true }).click()
  await page.waitForTimeout(450)

  await submitted.locator('[data-candidate-id="candidate-1"]').click()
  await page.locator('.workspace-drawer').waitFor()
  await page.keyboard.press('Escape')
  await page.locator('.workspace-drawer').waitFor({ state: 'hidden' })

  await page.getByRole('button', { name: 'Filters & views', exact: true }).click()
  await page.getByRole('button', { name: 'Offers Pending', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('.pipeline-person-card').length === 1)
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click()
  await page.getByRole('button', { name: 'Hide filters', exact: true }).click()

  const list = submitted.locator('[data-pipeline-card-list]')
  await list.evaluate(el => { el.scrollTop = 250 })
  assert.ok(await list.evaluate(el => el.scrollTop > 0))
  assert.equal(await page.locator('.app-main').evaluate(el => el.scrollTop), 0)
  assert.equal(await page.evaluate(() => window.scrollY), 0)

  await page.getByRole('button', { name: 'Compact View', exact: true }).click()
  const animationHeights = await page.locator('.pipeline-board-frame').evaluate(el => new Promise(resolve => {
    const heights = []
    const start = performance.now()
    const sample = () => {
      heights.push(Math.round(el.getBoundingClientRect().height))
      if (performance.now() - start < 220) requestAnimationFrame(sample)
      else resolve(heights)
    }
    requestAnimationFrame(sample)
  }))
  assert.ok(new Set(animationHeights).size > 3, 'The board should grow across multiple frames, not jump instantly')
  await page.waitForFunction(() => document.querySelector('.pipeline-overview-motion').dataset.transitioning === 'false')
  const compactHeight = await page.locator('.pipeline-board-frame').evaluate(el => el.clientHeight)
  await page.getByRole('button', { name: 'Expand View', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.pipeline-overview-motion').dataset.transitioning === 'false')
  assert.ok(compactHeight > await page.locator('.pipeline-board-frame').evaluate(el => el.clientHeight))

  // A downward wheel gesture should expose the full board, not squeeze it
  // beneath the overview. Lane scrolling must not immediately reopen it.
  await submitted.locator('.pipeline-lane-heading').hover()
  await page.mouse.wheel(0, 120)
  await page.waitForFunction(() => document.querySelector('.pipeline-studio').dataset.boardFocus === 'true')
  await page.waitForFunction(() => document.querySelector('.pipeline-overview-motion').dataset.transitioning === 'false')
  assert.equal(await page.locator('.pipeline-stage-map').isVisible(), false)
  const focusedHeight = await page.locator('.pipeline-board-frame').evaluate(el => el.clientHeight)
  const workspaceHeight = await page.locator('.app-main').evaluate(el => el.clientHeight)
  assert.ok(focusedHeight >= workspaceHeight - 100)
  await list.evaluate(el => { el.scrollTop = 80 })
  await list.hover({ position: { x: 100, y: 100 } })
  await page.mouse.wheel(0, -20)
  await page.waitForFunction(() => document.querySelector('[data-stage="Submitted"] [data-pipeline-card-list]').scrollTop < 80)
  assert.equal(await page.locator('.pipeline-studio').getAttribute('data-board-focus'), 'true')
  await list.evaluate(el => { el.scrollTop = 0 })
  await page.mouse.wheel(0, -120)
  await page.waitForFunction(() => document.querySelector('.pipeline-studio').dataset.boardFocus === 'false')
  await page.waitForFunction(() => document.querySelector('.pipeline-overview-motion').dataset.transitioning === 'false')
  assert.equal(await page.locator('.app-main').evaluate(el => el.scrollTop), 0)
  assert.equal(await page.evaluate(() => window.scrollY), 0)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Filters', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Filters & views', exact: true }).isVisible(), false)
  assert.ok(await page.locator('.pipeline-board-frame').evaluate(el => el.clientHeight > 200))
  assert.equal(await page.evaluate(() => window.scrollY), 0)
  await page.setViewportSize({ width: 1440, height: 950 })
  await page.getByRole('button', { name: 'Compact View', exact: true }).click()
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
  await page.getByRole('button', { name: 'Pipeline', exact: true }).first().click()
  assert.equal(await page.locator('.pipeline-studio').getAttribute('data-board-focus'), 'false')
  assert.ok(await page.locator('.pipeline-stage-map').isVisible())
  assert.deepEqual(errors, [])
})
