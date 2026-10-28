import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { DEFAULT_AI_POLICY, mergeAiPolicy } from '../shared/aiPolicy.js'

test('Viewer controls stay read-only and company AI policy loads in a separate browser', async t => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } })
  await server.listen(); t.after(() => server.close())
  const browser = await chromium.launch({ headless: true }); t.after(() => browser.close())
  let policy = structuredClone(DEFAULT_AI_POLICY), saves = 0
  const open = async role => {
    const context = await browser.newContext()
    const page = await context.newPage()
    page.setDefaultTimeout(10000)
    await page.route('**/api/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname
      let json = { data: [] }
      if (path.endsWith('/auth/session')) json = { user: { id: role, email: `${role}@example.test` }, profile: { id: role, full_name: `Test ${role}`, role, org_id: 'access-ui-org' }, organization: { id: 'access-ui-org', name: 'Access UI QA' } }
      if (path.endsWith('/organization/ai-policy')) {
        if (request.method() === 'PUT') { policy = mergeAiPolicy(policy, request.postDataJSON()); saves++ }
        json = { organization_id: 'access-ui-org', data: policy }
      }
      await route.fulfill({ json })
    })
    await page.goto(server.resolvedUrls.local[0])
    await page.locator('.app-topbar').waitFor()
    return page
  }
  const viewer = await open('VIEWER')
  await viewer.locator('.app-topbar').getByRole('button', { name: 'Candidates', exact: true }).click()
  await viewer.getByRole('heading', { name: 'Candidates', exact: true }).waitFor()
  assert.equal(await viewer.getByRole('button', { name: 'Add Candidate', exact: true }).count(), 0)
  assert.equal(await viewer.getByRole('button', { name: 'Bulk Upload', exact: true }).count(), 0)
  assert.equal(await viewer.getByRole('button', { name: 'AI Center', exact: true }).count(), 0)
  const preferences = async page => {
    await page.getByRole('button', { name: 'AI Center', exact: true }).click()
    await page.getByRole('navigation', { name: 'AI Center sections' }).getByRole('button', { name: 'Preferences', exact: true }).click()
    return page.getByRole('switch').first()
  }
  const owner = await open('OWNER'), ownerChat = await preferences(owner)
  assert.equal(await ownerChat.getAttribute('aria-checked'), 'true')
  await ownerChat.click()
  await owner.waitForFunction(() => JSON.parse(localStorage.getItem('td_ai_governance_access-ui-org')).features.chat === false)
  assert.equal(saves, 1)
  const recruiter = await open('RECRUITER'), recruiterChat = await preferences(recruiter)
  assert.equal(await recruiterChat.getAttribute('aria-checked'), 'false')
  assert.equal(await recruiterChat.isDisabled(), true)
  assert.equal(saves, 1, 'Loading policy in a separate browser must not overwrite it')
})
