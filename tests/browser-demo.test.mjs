import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { chromium } from 'playwright'

test('browser demo bypasses login, persists only demo data, and never requests live APIs', async t => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false }, define: { 'import.meta.env.VITE_DEMO_MODE': JSON.stringify('true') } })
  await server.listen(); t.after(() => server.close())
  const browser = await chromium.launch({ headless: true }); t.after(() => browser.close())
  const context = await browser.newContext(), page = await context.newPage(), requests = [], errors = []
  page.setDefaultTimeout(10000)
  await context.route('**/api/**', async route => { requests.push(route.request().url()); await route.abort() })
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    if (!localStorage.getItem('td_session_token')) {
      localStorage.setItem('td_session_token', 'existing-live-session-must-stay-private')
      localStorage.setItem('talentdesk_session', JSON.stringify({ profile: { id: 'live-user' } }))
    }
  })
  await page.goto(server.resolvedUrls.local[0])
  await page.locator('.overview-welcome').waitFor()
  await page.getByRole('note').filter({ hasText: 'Temporary demo' }).waitFor()
  assert.equal(await page.locator('input[type=password]').count(), 0)
  const result = await page.evaluate(async () => {
    const { apiRequest, apiUpload, getAuthToken } = await import('/src/lib/api.js')
    const { streamAiGenerate } = await import('/src/lib/ai/aiClient.js')
    const { db } = await import('/src/lib/api.js')
    const candidates = await db.from('candidates').select('*')
    const created = await db.from('candidates').insert({ first_name: 'Browser', last_name: 'Only', internal_status: 'Pending' }).select('*').single()
    const updated = await db.from('candidates').update({ notes: 'Persist this browser-only note' }).eq('id', created.data.id).select('*').single()
    const attempts = []
    for (const fn of [() => apiRequest('/ai/generate', { method: 'POST', body: { prompt: 'Demo AI test' } }), () => streamAiGenerate({ toolId: 'boolean', prompt: 'Demo streaming test' }), () => apiUpload('/upload/resume', new FormData()), () => apiRequest('/auth/admin-reset-password', { method: 'POST', body: {} })]) {
      try { await fn(); attempts.push('unexpected success') } catch (error) { attempts.push(error.message) }
    }
    return { count: candidates.data.length, sourced: candidates.data.filter(c => c.internal_status === 'Sourced').length, created: created.data.id, notes: updated.data.notes, attempts, liveToken: localStorage.getItem('td_session_token'), tokenReturned: getAuthToken(), liveCache: JSON.parse(localStorage.getItem('talentdesk_session')).profile.id }
  })
  assert.equal(result.count, 33)
  assert.equal(result.sourced, 3)
  assert.equal(result.notes, 'Persist this browser-only note')
  assert.ok(result.attempts.every(message => message.startsWith('Unavailable in browser demo.')))
  assert.equal(result.liveToken, 'existing-live-session-must-stay-private')
  assert.equal(result.tokenReturned, null)
  assert.equal(result.liveCache, 'live-user')
  await page.reload(); await page.locator('.overview-welcome').waitFor()
  assert.equal(await page.evaluate(async id => (await (await import('/src/lib/api.js')).db.from('candidates').select('*').eq('id', id).single()).data.notes, result.created), result.notes)
  for (const [id, label] of [['candidates', 'Candidates'], ['jobs', 'Jobs'], ['pipeline', 'Pipeline'], ['ai_center', 'AI Center'], ['org_settings', 'Company Settings'], ['reports', 'Reports'], ['admin', 'Admin Panel']]) {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
    await page.locator('#workspace-navigation').getByText(label, { exact: true }).click()
    await page.locator(`.app-shell[data-page="${id}"]`).waitFor()
    assert.equal(await page.evaluate(() => document.scrollingElement.scrollWidth > innerWidth), false)
  }
  const second = await browser.newPage()
  await second.goto(server.resolvedUrls.local[0]); await second.locator('.overview-welcome').waitFor()
  assert.equal(await second.evaluate(async () => (await (await import('/src/lib/api.js')).db.from('candidates').select('*')).data.length), 33)
  await second.close()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click()
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('td_browser_demo_v1')).tables.candidates.length === 33)
  assert.deepEqual(requests, [])
  assert.deepEqual(errors, [])
})
