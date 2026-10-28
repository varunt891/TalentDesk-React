import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { chromium } from 'playwright'

test('AI generation reveals its output once, keeps the document fixed, and respects reader scrolling', async t => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } })
  await server.listen()
  t.after(() => server.close())
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  for (const config of [{ width: 1440, height: 900, reducedMotion: 'no-preference' }, { width: 390, height: 844, reducedMotion: 'no-preference' }, { width: 390, height: 844, reducedMotion: 'reduce' }]) {
    const page = await browser.newPage({ viewport: { width: config.width, height: config.height }, reducedMotion: config.reducedMotion })
    page.setDefaultTimeout(10000)
    await page.addInitScript(() => {
      localStorage.setItem('td_sidebar_collapsed', 'false')
      window.aiScrollCalls = []
      const original = Element.prototype.scrollTo
      Element.prototype.scrollTo = function (options, ...args) {
        if (this.classList.contains('ai-studio-canvas')) window.aiScrollCalls.push(options)
        return original.call(this, options, ...args)
      }
    })
    let resolveRequest
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      let json = { data: [], ok: true }
      if (path.endsWith('/auth/session')) json = { user: { id: 'owner', email: 'owner@example.test' }, profile: { id: 'owner', full_name: 'Test Recruiter', role: 'OWNER', org_id: 'scroll-org' }, organization: { id: 'scroll-org', name: 'Scroll QA' } }
      else if (/\/ai\/(action|generate)\/stream$/.test(path)) { resolveRequest(route); return }
      else if (path.endsWith('/data/candidates')) json = { data: [{ id: 'candidate', first_name: 'Alex', internal_status: 'Submitted', job_id: 'REQ-1', skills: ['React'] }] }
      else if (path.endsWith('/data/jobs')) json = { data: [{ id: 'job', job_id: 'REQ-1', title: 'React Engineer', skills: ['React'] }] }
      await route.fulfill({ status: 200, json })
    })
    await page.goto(server.resolvedUrls.local[0])
    if (config.width < 768) await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
    await page.getByRole('button', { name: 'AI Center', exact: true }).click()
    const sections = page.getByRole('navigation', { name: 'AI Center sections' })
    await sections.getByRole('button', { name: 'Hiring tools', exact: true }).click()
    await page.getByLabel('Source text', { exact: true }).fill('Summarize this fictional recruiting update.')
    await page.getByLabel('Source text', { exact: true }).evaluate(element => { element.style.height = '700px' })

    for (const kind of ['text', 'workbench']) {
      if (kind === 'workbench') {
        await sections.getByRole('button', { name: 'Workbench', exact: true }).click()
        await page.locator('.recruiting-workflow-card').first().click()
        await page.locator('#recruiting-candidate').selectOption('candidate')
        await page.locator('#recruiting-job').selectOption('job')
      }
      const outputSelector = kind === 'text' ? '.hiring-result .ai-result-card' : '.recruiting-output'
      const canvas = page.locator('.ai-studio-canvas')
      const before = await page.evaluate(() => window.aiScrollCalls.length)
      const request = new Promise(resolve => { resolveRequest = resolve })
      const header = await page.locator('.ai-studio-modes').boundingBox()
      await page.getByRole('button', { name: kind === 'text' ? 'Run Summarize' : 'Generate fit review', exact: true }).click()
      const route = await request
      await page.waitForFunction(({ selector, before }) => {
        const output = document.querySelector(selector), canvas = document.querySelector('.ai-studio-canvas')
        if (!output) return false
        const box = output.getBoundingClientRect(), viewport = canvas.getBoundingClientRect()
        return window.aiScrollCalls.length === before + 1 && box.top >= viewport.top - 1 && box.top < viewport.bottom - 30
      }, { selector: outputSelector, before })
      assert.equal(await page.evaluate(() => window.aiScrollCalls.at(-1).behavior), config.reducedMotion === 'reduce' ? 'instant' : 'smooth')
      assert.equal(await page.evaluate(() => window.scrollY), 0)
      assert.deepEqual(await page.locator('.ai-studio-modes').boundingBox(), header)
      // Reading elsewhere during generation must not be interrupted by tokens or completion.
      await canvas.evaluate(element => element.scrollTo({ top: 0, behavior: 'instant' }))
      const userPositionCalls = await page.evaluate(() => window.aiScrollCalls.length)
      const events = Array.from({ length: 6 }, (_, i) => `data: ${JSON.stringify({ delta: `\n## Evidence ${i + 1}\n${'Recorded recruiting detail. '.repeat(40)}\n` })}\n\n`).join('')
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: `${events}data: ${JSON.stringify({ done: true, provider: 'test', model: 'test' })}\n\n` })
      await page.getByRole('button', { name: kind === 'text' ? 'Save to CRM' : 'Copy draft', exact: true }).waitFor()
      assert.equal(await page.evaluate(() => window.aiScrollCalls.length), userPositionCalls)
      assert.equal(await canvas.evaluate(element => element.scrollTop), 0)
    }
    await page.close()
  }
})
