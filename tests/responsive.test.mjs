import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { DEFAULT_AI_POLICY } from '../shared/aiPolicy.js'

const pages = [
  ['dashboard', 'Dashboard'], ['candidates', 'Candidates'], ['sourced_candidates', 'Sourced Candidates'],
  ['pipeline', 'Pipeline'], ['jobs', 'Jobs'], ['tasks', 'Tasks & Targets'], ['callbacks', 'Callbacks'],
  ['followups', 'Follow-ups'], ['resubmit', 'Re-submit Finder'], ['collisions', 'Collisions'],
  ['reports', 'Reports'], ['postings', 'Job Postings'], ['team_management', 'Team Management'],
  ['org_settings', 'Company Settings'], ['directory', 'Team Directory'], ['admin', 'Admin Panel'], ['ai_center', 'AI Center'],
]

test('recruiting workspaces fit phone, tablet and desktop viewports', async t => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } })
  await server.listen(); t.after(() => server.close())
  const browser = await chromium.launch({ headless: true }); t.after(() => browser.close())
  const dir = '.talentdesk-local/responsive'
  await mkdir(dir, { recursive: true })
  const now = new Date().toISOString(), today = now.slice(0, 10)
  const org = { id: 'responsive-org', name: 'Responsive Test Workspace', slug: 'responsive-test', currency: 'USD', date_format: 'MM/DD/YYYY', timezone: 'Asia/Kolkata', subscription_plan: 'Growth', is_active: true }
  const profile = { id: 'test-owner', full_name: 'Test Superadmin', email: 'admin@example.test', role: 'SUPERADMIN', org_id: org.id, is_active: true }
  const stages = ['Submitted', 'Shortlisted', 'Interview Scheduled', 'Interview Done', 'Offer Extended', 'Hired', 'Rejected']
  const candidates = Array.from({ length: 15 }, (_, i) => ({ id: `candidate-${i}`, org_id: org.id, user_id: profile.id, first_name: `Avery${i}`, last_name: 'Patel', email: `avery${i}@example.test`, phone: '+1 202 555 0100', job_id: 'REQ-101', job_title: 'Senior Full Stack Engineer', client: 'Example Technologies', skills: ['React', 'TypeScript', 'PostgreSQL'], internal_status: i === 14 ? 'Sourced' : 'Submitted', external_status: stages[i % 7], submission_date: today, location: 'New York, NY', created_at: now, updated_at: now, priority: 'High', recruiter_name: profile.full_name, recruiter_id: profile.id, resume_text: 'Fictional test resume.' }))
  const jobs = [{ id: '10000000-0000-4000-8000-000000000001', org_id: org.id, user_id: profile.id, job_id: 'REQ-101', title: 'Senior Full Stack Engineer', client: 'Example Technologies', location: 'New York, NY', status: 'Open', type: 'Full-time', skills: ['React', 'SQL'], rate: '$98/hr', created_at: now, open_date: today, assigned_to: [profile.id], priority: 'High', recruiter_name: profile.full_name, openings: 2 }]
  const tables = { candidates, jobs, profiles: [profile], organizations: [org], tasks: [{ id: 'task-1', org_id: org.id, title: 'Follow up with the hiring manager', status: 'Pending', priority: 'High', due_date: today, assigned_to: profile.id, assigned_by: profile.id }], callbacks: [{ id: 'callback-1', org_id: org.id, candidate_name: 'Avery0 Patel', job: 'REQ-101', date: today, time: '10:00', status: 'pending', phone: '+1 202 555 0100' }], followups: [{ id: 'followup-1', org_id: org.id, candidate_name: 'Avery0 Patel', date: today, status: 'pending' }], postings: [{ id: 'posting-1', org_id: org.id, portal: 'LinkedIn', job_title: jobs[0].title, job_id: jobs[0].job_id, status: 'Active', date: today }] }
  const observations = [], errors = []
  for (const width of process.env.RESPONSIVE_WIDTHS ? process.env.RESPONSIVE_WIDTHS.split(',').map(Number) : [320, 390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: width < 500 ? 844 : 1000 }, isMobile: width < 500, hasTouch: width < 1024 })
    page.setDefaultTimeout(10000)
    await page.addInitScript(() => localStorage.setItem('td_sidebar_collapsed', 'false'))
    page.on('pageerror', error => errors.push({ width, error: error.message }))
    await page.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname
      let json = { data: [], ok: true }
      if (path.endsWith('/auth/session')) json = { user: { id: profile.id, email: profile.email }, profile, organization: org }
      else if (path.endsWith('/organization/ai-policy')) json = { organization_id: org.id, data: DEFAULT_AI_POLICY }
      else if (path.endsWith('/organization/members')) json = { data: [{ ...profile, user_id: profile.id, status: 'ACTIVE' }] }
      else if (path.endsWith('/organization/all')) json = { data: [org] }
      else if (path.endsWith('/organization/ai-usage')) json = { data: { creditLimit: 1000, totalCreditsUsed: 0, percentUsed: 0, remainingCredits: 1000, totalChat: 0, totalAction: 0, totalRequests: 0, activeStaffCount: 0, totalStaffCount: 1, staffList: [] } }
      else if (path.endsWith('/organization')) json = { data: org }
      else if (path.includes('/data/')) {
        const [, table] = path.split('/data/')
        let rows = tables[table] || []
        for (const filter of JSON.parse(url.searchParams.get('filter') || '[]')) if (filter.op === 'eq') rows = rows.filter(row => row[filter.column] === filter.value)
        json = { data: rows }
      }
      await route.fulfill({ json })
    })
    await page.goto(server.resolvedUrls.local[0])
    await page.locator('.overview-welcome').waitFor()
    const inspect = async name => {
      await page.waitForTimeout(180)
      const layout = await page.evaluate(() => {
        const main = [...document.querySelectorAll('.workspace-dialog,.workspace-drawer')].at(-1) || document.querySelector('.app-main') || document.body
        const controls = [...main.querySelectorAll('button,input,select,textarea,[role="tab"]')].flatMap(element => {
          const r = element.getBoundingClientRect()
          if (!r.width || !r.height || element.closest('[inert]') || (r.left >= -1 && r.right <= innerWidth + 1)) return []
          for (let parent = element.parentElement; parent && parent !== main; parent = parent.parentElement) {
            if (['auto', 'scroll'].includes(getComputedStyle(parent).overflowX) && parent.scrollWidth > parent.clientWidth + 1) return []
          }
          return [{ text: (element.getAttribute('aria-label') || element.textContent || element.placeholder || element.tagName).trim().slice(0, 70), left: Math.round(r.left), right: Math.round(r.right) }]
        })
        return { documentOverflow: document.scrollingElement.scrollWidth > innerWidth + 1, mainOverflow: main.scrollWidth > main.clientWidth + 1, controls }
      })
      observations.push({ width, page: name, ...layout })
      if (layout.documentOverflow || layout.mainOverflow || layout.controls.length) console.log(JSON.stringify(observations.at(-1)))
      if (width === 390 || layout.mainOverflow || layout.controls.length) await page.screenshot({ path: `${dir}/${name}-${width}.png` })
      if (layout.mainOverflow) console.log(await page.locator('.app-main').evaluate(main => [...main.querySelectorAll('div,section,nav')].filter(e => e.getBoundingClientRect().right > innerWidth + 1 && e.getBoundingClientRect().width > 0).slice(0, 10).map(e => ({ className: e.className, right: Math.round(e.getBoundingClientRect().right) }))))
    }
    for (const [id, label] of pages) {
      if (process.env.RESPONSIVE_PAGES && !process.env.RESPONSIVE_PAGES.split(',').includes(id)) continue
      if (width < 1024) await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
      await page.locator('#workspace-navigation').getByText(label, { exact: true }).click()
      await page.locator(`.app-shell[data-page="${id}"]`).waitFor()
      await inspect(id)
      if (id === 'candidates' || id === 'jobs') {
        await page.getByRole('button', { name: id === 'candidates' ? 'Add Candidate' : 'New Job', exact: true }).first().click()
        await page.locator('.workspace-dialog,.workspace-drawer').waitFor()
        await inspect(`${id}-form`)
        await page.keyboard.press('Escape')
        await page.locator('.workspace-dialog,.workspace-drawer').waitFor({ state: 'detached' })
        await page.getByText(id === 'candidates' ? 'Avery0 Patel' : 'Senior Full Stack Engineer', { exact: true }).filter({ visible: true }).first().click()
        await page.locator('.entity-drawer').waitFor()
        await inspect(`${id}-preview`)
        await page.getByRole('button', { name: /^view full details$/i }).click()
        await page.locator(id === 'candidates' ? '.candidate-detail-page' : '.job-detail-page').waitFor()
        await inspect(`${id}-detail`)
      }
      if (id === 'ai_center') {
        const sections = page.getByRole('navigation', { name: 'AI Center sections' })
        for (const tab of ['Copilot', 'Hiring tools', 'Usage', 'Briefings', 'Preferences']) {
          await sections.getByRole('button', { name: tab, exact: true }).click()
          await inspect(`ai-${tab.toLowerCase().replaceAll(' ', '-')}`)
        }
      }
      if (id === 'org_settings') {
        for (const tab of ['General', 'Teams', 'Users', 'Roles & Permissions', 'AI', 'Notifications', 'Workspace', 'Audit & Activity', 'Security', 'Integrations', 'Billing']) {
          await page.getByRole('tab', { name: tab, exact: true }).click()
          await inspect(`settings-${tab.toLowerCase().replaceAll(' ', '-')}`)
        }
      }
      if (id === 'reports') {
        for (const tab of ['Pipeline & Conversion', 'Recruiters & Teams', 'Time & Velocity', 'Activity & Tasks', 'AI Usage']) {
          await page.getByRole('tab', { name: tab, exact: true }).click()
          await inspect(`reports-${tab.toLowerCase().replaceAll(' ', '-')}`)
        }
      }
      if (id === 'pipeline' && width < 1024) {
        await page.getByRole('button', { name: 'Scroll stages right', exact: true }).click()
        await page.waitForFunction(() => document.querySelector('.pipeline-board-scroll').scrollLeft > 0)
        await page.getByRole('button', { name: 'Compact View', exact: true }).click()
        await page.waitForTimeout(460)
        await inspect('pipeline-focused')
        await page.getByRole('button', { name: 'Expand View', exact: true }).filter({ visible: true }).click()
      }
    }
    if (!process.env.RESPONSIVE_PAGES) {
      await page.route('**/api/auth/session', route => route.fulfill({ json: { user: null, profile: null, organization: null } }))
      await page.goto(`${server.resolvedUrls.local[0]}login`)
      await page.getByRole('heading', { name: 'Sign in to TalentDesk', exact: true }).waitFor()
      await inspect('login')
      await page.getByRole('button', { name: 'Forgot password?', exact: true }).click()
      await page.locator('.workspace-dialog').waitFor()
      await inspect('password-recovery')
      await page.keyboard.press('Escape')
      await page.goto(`${server.resolvedUrls.local[0]}signup`)
      await page.getByRole('heading', { name: 'Personnel Onboarding', exact: true }).waitFor()
      await inspect('signup')
      await page.goto(`${server.resolvedUrls.local[0]}signup?invite_token=responsive-test-only`)
      await page.getByRole('heading', { name: 'Create your account', exact: true }).waitFor()
      await inspect('signup-invitation')
    }
    await page.close()
  }
  await writeFile(`${dir}/report.json`, JSON.stringify({ observations, errors }, null, 2))
  const failures = observations.filter(row => row.documentOverflow || row.mainOverflow || row.controls.length)
  for (const row of failures) console.log(JSON.stringify(row))
  assert.deepEqual(errors, [], 'No workspace should crash at a tested viewport')
  assert.deepEqual(failures, [], 'Page content and controls must fit; tables/boards may scroll within their own container')
})
