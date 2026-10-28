import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import express from 'express'
import cookieParser from 'cookie-parser'
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

test('Copilot executor persists tasks, follow-ups and interviews through authenticated API to a disposable database', async t => {
  const database = await PGlite.create()
  const socket = new PGLiteSocketServer({ db: database, host: '127.0.0.1', port: 0, maxConnections: 4 })
  await socket.start()
  process.env.DATABASE_URL = `postgresql://postgres:postgres@${socket.getServerConn()}/postgres?connection_limit=1&sslmode=disable&pgbouncer=true`
  process.env.JWT_SECRET = 'disposable-copilot-api-test-secret'
  const child = spawn(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate', '--schema', 'server/prisma/schema.prisma'], { env: process.env, stdio: 'pipe', windowsHide: true })
  let output = ''; child.stderr.on('data', chunk => { output += chunk }); child.stdout.resume()
  assert.equal((await once(child, 'exit'))[0], 0, output)
  await database.exec('DEALLOCATE ALL')
  const { prisma } = await import('../server/src/prisma.js')
  let http, browser, vite
  t.after(async () => {
    await browser?.close(); await vite?.close()
    if (http) { http.closeAllConnections(); await new Promise(resolve => http.close(resolve)) }
    await prisma.$disconnect(); await socket.stop(); await database.close()
  })
  const { default: dataRoutes } = await import('../server/src/routes/data.routes.js')
  const { signSession } = await import('../server/src/auth.js')
  const org = await prisma.organization.create({ data: { name: 'Copilot QA', slug: 'disposable-copilot' } })
  const user = await prisma.profile.create({ data: { email: 'owner@example.test', full_name: 'QA Owner', role: 'OWNER', org_id: org.id } })
  await prisma.organizationMember.create({ data: { user_id: user.id, organization_id: org.id, role: 'OWNER' } })
  const candidate = await prisma.candidate.create({ data: { org_id: org.id, user_id: user.id, first_name: 'Avery', last_name: 'Patel', internal_status: 'Submitted', job_id: 'REQ-101' } })
  const job = await prisma.job.create({ data: { org_id: org.id, user_id: user.id, job_id: 'REQ-101', title: 'React Engineer', status: 'Open' } })
  const app = express(); app.use(express.json(), cookieParser()); app.use('/api/data', dataRoutes)
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }))
  http = app.listen(0, '127.0.0.1'); await once(http, 'listening')
  const origin = `http://127.0.0.1:${http.address().port}`, token = signSession(user)
  vite = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } }); await vite.listen()
  browser = await chromium.launch({ headless: true }); const page = await browser.newPage()
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.pathname === '/api/auth/session') return route.fulfill({ json: { user: { id: user.id, email: user.email }, profile: user, organization: org } })
    if (!url.pathname.startsWith('/api/data/')) return route.fulfill({ json: { data: [], ok: true } })
    const response = await route.fetch({ url: `${origin}${url.pathname}${url.search}`, headers: { ...request.headers(), authorization: `Bearer ${token}` } })
    await route.fulfill({ response })
  })
  await page.goto(vite.resolvedUrls.local[0])
  const context = { userId: user.id, orgId: org.id, profile: user, organization: { timezone: 'Asia/Kolkata' }, candidates: [candidate], jobs: [job] }
  const execute = action => page.evaluate(async ({ action, context }) => { const { executeCrmAction } = await import('/src/lib/executeCrmAction.js'); return executeCrmAction(action, context) }, { action, context })
  const task = await execute({ type: 'create_task', params: { title: 'Review candidate availability', due_date: '2026-11-12' } })
  assert.equal(task.success, true, task.error)
  const storedTask = await prisma.task.findFirst({ where: { org_id: org.id } })
  assert.equal(storedTask.title, 'Review candidate availability'); assert.equal(storedTask.assigned_to, user.id); assert.equal(storedTask.due_date, '2026-11-12')
  const followup = await execute({ type: 'create_followup', entityName: 'Avery Patel', params: { date: '2026-11-13', notes: 'Client feedback' } })
  assert.equal(followup.success, true, followup.error)
  assert.equal((await prisma.followup.findFirst({ where: { org_id: org.id } })).candidate_name, 'Avery Patel')
  const interview = await execute({ type: 'schedule_interview', entityId: candidate.id, params: { interview_date: '2026-11-14', interview_time: '2:00 PM', interview_type: 'Video Call' } })
  assert.equal(interview.success, true, interview.error)
  assert.equal((await prisma.candidate.findUnique({ where: { id: candidate.id } })).internal_status, 'Interview Scheduled')
  const callback = await prisma.callback.findFirst({ where: { org_id: org.id } })
  assert.equal(callback.candidate_name, 'Avery Patel'); assert.equal(callback.scheduled_at_utc.toISOString(), '2026-11-14T08:30:00.000Z')
  assert.equal((await execute({ type: 'schedule_interview', entityId: candidate.id, params: { interview_date: '2026-11-14', interview_time: '3:00 PM', interview_type: 'Video Call' } })).success, true)
  assert.equal(await prisma.callback.count({ where: { org_id: org.id } }), 1, 'Rescheduling must update the existing interview callback')
  const close = await execute({ type: 'close_job', entityName: 'REQ-101' })
  assert.equal(close.success, true, close.error); assert.equal((await prisma.job.findUnique({ where: { id: job.id } })).status, 'Closed')
  const foreignOrg = await prisma.organization.create({ data: { name: 'Other Org', slug: 'copilot-other' } })
  const foreignJob = await prisma.job.create({ data: { org_id: foreignOrg.id, user_id: user.id, title: 'Private requisition', status: 'Open' } })
  context.jobs = [foreignJob]
  const blocked = await execute({ type: 'close_job', entityId: foreignJob.id })
  assert.equal(blocked.success, false); assert.equal((await prisma.job.findUnique({ where: { id: foreignJob.id } })).status, 'Open')
})
