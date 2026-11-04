import test from 'node:test'
import assert from 'node:assert/strict'
import { build, preview } from 'vite'
import { chromium } from 'playwright'

test('production requires live login by default and ignores the cached demo identity', async t => {
  const outDir = '.talentdesk-local/hosted-login-build'
  await build({ logLevel: 'silent', define: { 'import.meta.env.VITE_DEMO_MODE': 'undefined' }, build: { outDir, emptyOutDir: false } })
  const server = await preview({ build: { outDir }, preview: { host: '127.0.0.1', port: 0, open: false } })
  t.after(() => new Promise(resolve => server.httpServer.close(resolve)))
  const browser = await chromium.launch({ headless: true }); t.after(() => browser.close())
  const page = await browser.newPage(), requests = []
  await page.addInitScript(() => {
    localStorage.setItem('talentdesk_demo_session', JSON.stringify({ user: { id: 'cached-demo' }, profile: { id: 'cached-demo', role: 'SUPERADMIN' }, organization: { id: 'demo-org' } }))
    localStorage.setItem('td_browser_demo_v1', JSON.stringify({ version: 1, tables: { candidates: [{ id: 'fictional-candidate' }] } }))
  })
  await page.route('**/api/**', route => {
    requests.push(new URL(route.request().url()).pathname)
    return route.fulfill({ status: 401, json: { error: 'Not authenticated' } })
  })
  await page.goto(server.resolvedUrls.local[0])
  await page.getByRole('heading', { name: 'Sign in to TalentDesk', exact: true }).waitFor()
  assert.ok(requests.includes('/api/auth/session'), 'Production must check the real session instead of issuing a demo identity')
  assert.equal(await page.locator('.demo-notice').count(), 0)
  assert.equal(await page.locator('input[type=password]').count(), 1)
  assert.ok(await page.evaluate(() => localStorage.getItem('talentdesk_demo_session')), 'Demo data stays separate and is not destroyed')
})
