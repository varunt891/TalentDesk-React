import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { chromium } from 'playwright'

test('workspace scrolls internally while the document and navigation stay fixed', async t => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } })
  await server.listen()
  t.after(() => server.close())
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())

  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await t.test(`${viewport.width}px viewport`, async () => {
      const page = await browser.newPage({ viewport })
      try {
        const organization = { id: 'scroll-test-org', name: 'Test Workspace' }
        await page.route('**/api/**', route => route.fulfill({
          status: 200,
          json: route.request().url().includes('/auth/session')
            ? {
                user: { id: 'scroll-test-user', email: 'test@example.test' },
                profile: { id: 'scroll-test-user', full_name: 'Test Owner', org_id: organization.id, role: 'OWNER' },
                organization,
              }
            : { data: [], ok: true },
        }))
        await page.goto(server.resolvedUrls.local[0])
        await page.locator('.overview-welcome').waitFor()
        const headerBefore = await page.locator('.app-topbar').boundingBox()
        const shell = await page.locator('.app-shell').boundingBox()
        const inset = viewport.width >= 1024 ? 6 : 0
        assert.deepEqual(shell, { x: inset, y: inset, width: viewport.width - inset * 2, height: viewport.height - inset * 2 })

        await page.evaluate(() => window.scrollTo(0, 10000))
        assert.equal(await page.evaluate(() => window.scrollY), 0)
        assert.equal(await page.evaluate(() => document.scrollingElement.scrollHeight > innerHeight), false)

        await page.mouse.move(viewport.width - 60, viewport.height / 2)
        await page.mouse.wheel(0, 600)
        await page.waitForFunction(() => document.querySelector('.app-main').scrollTop > 0)
        assert.equal(await page.evaluate(() => window.scrollY), 0)
        assert.deepEqual(await page.locator('.app-topbar').boundingBox(), headerBefore)

        // Scrolling past the end must not transfer scrolling to the document.
        await page.locator('.app-main').evaluate(el => { el.scrollTop = el.scrollHeight })
        await page.mouse.wheel(0, 1200)
        assert.equal(await page.evaluate(() => window.scrollY), 0)
      } finally {
        await page.close()
      }
    })
  }
})
