import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import express from 'express'
import cookieParser from 'cookie-parser'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

test('recruiting writes preserve notes and enforce existing tenant/owner scope; SSE completes', async t => {
  // A disposable in-memory database: never use .env or the user's database.
  const database = await PGlite.create()
  const socket = new PGLiteSocketServer({ db: database, host: '127.0.0.1', port: 0, maxConnections: 4 })
  await socket.start()
  process.env.DATABASE_URL = `postgresql://postgres:postgres@${socket.getServerConn()}/postgres?connection_limit=1&sslmode=disable&pgbouncer=true`
  process.env.JWT_SECRET = 'disposable-recruiting-workbench-test-secret'
  const child = spawn(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate', '--schema', 'server/prisma/schema.prisma'], { env: process.env, stdio: 'pipe', windowsHide: true })
  let stderr = ''
  child.stderr.on('data', chunk => { stderr += chunk })
  child.stdout.resume()
  assert.equal((await once(child, 'exit'))[0], 0, stderr)
  await database.exec('DEALLOCATE ALL')
  const { prisma } = await import('../server/src/prisma.js')
  let httpServer
  t.after(async () => {
    if (httpServer) { httpServer.closeAllConnections(); await new Promise(resolve => httpServer.close(resolve)) }
    await prisma.$disconnect()
    await socket.stop()
    await database.close()
  })
  const { default: dataRoutes } = await import('../server/src/routes/data.routes.js')
  const { default: aiRoutes } = await import('../server/src/routes/ai.routes.js')
  const { signSession } = await import('../server/src/auth.js')
  const { aiService } = await import('../server/src/services/aiService.js')
  const originalStream = aiService.generateStream
  t.after(() => { aiService.generateStream = originalStream })
  aiService.generateStream = async ({ signal, onDelta, toolId }) => {
    assert.equal(toolId, 'recruiting_workbench')
    await new Promise(resolve => setTimeout(resolve, 25))
    assert.equal(signal.aborted, false, 'Completing the request body must not cancel an SSE reply')
    onDelta('## Reviewed recruiting evidence')
    return { provider: 'test', model: 'test' }
  }
  const org = await prisma.organization.create({ data: { name: 'Test Org', slug: 'workbench-test' } })
  const otherOrg = await prisma.organization.create({ data: { name: 'Other Org', slug: 'other-workbench-test' } })
  const user = await prisma.profile.create({ data: { email: 'recruiter@example.test', org_id: org.id, role: 'recruiter', full_name: 'Test Recruiter' } })
  const teammate = await prisma.profile.create({ data: { email: 'teammate@example.test', org_id: org.id, role: 'recruiter' } })
  await prisma.organizationMember.create({ data: { user_id: user.id, organization_id: org.id, role: 'RECRUITER' } })
  const candidate = await prisma.candidate.create({ data: { user_id: user.id, org_id: org.id, first_name: 'Alex', notes: 'Existing note', internal_status: 'Submitted', external_status: 'Shortlisted' } })
  const teammateCandidate = await prisma.candidate.create({ data: { user_id: teammate.id, org_id: org.id, first_name: 'Private teammate' } })
  const foreignCandidate = await prisma.candidate.create({ data: { user_id: user.id, org_id: otherOrg.id, first_name: 'Private other org' } })
  const job = await prisma.job.create({ data: { user_id: user.id, org_id: org.id, title: 'React Engineer', job_id: 'REQ-101', notes: 'Existing job note' } })
  const app = express()
  app.use(express.json(), cookieParser())
  app.use('/api/data', dataRoutes)
  app.use('/api/ai', aiRoutes)
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }))
  httpServer = app.listen(0, '127.0.0.1')
  await once(httpServer, 'listening')
  const origin = `http://127.0.0.1:${httpServer.address().port}`
  const headers = { Authorization: `Bearer ${signSession(user)}`, 'Content-Type': 'application/json' }
  const note = (table, id, content, extra = {}) => fetch(`${origin}/api/data/${table}/${id}/notes`, { method: 'POST', headers, body: JSON.stringify({ title: 'Reviewed AI draft', content, ...extra }) })
  assert.equal((await fetch(`${origin}/api/data/candidates/${candidate.id}/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'No auth' }) })).status, 401)
  assert.equal((await note('candidates', teammateCandidate.id, 'Forbidden')).status, 404)
  assert.equal((await note('candidates', foreignCandidate.id, 'Forbidden')).status, 404)
  assert.equal((await note('tasks', candidate.id, 'Wrong table')).status, 400)
  assert.equal((await note('candidates', candidate.id, '')).status, 400)
  assert.equal((await note('candidates', candidate.id, 'x'.repeat(40001))).status, 400)
  const saved = await note('candidates', candidate.id, 'Reviewed evidence', { internal_status: 'Sourced', org_id: otherOrg.id })
  assert.equal(saved.status, 200, await saved.text())
  const row = await prisma.candidate.findUnique({ where: { id: candidate.id } })
  assert.ok(row.notes.startsWith('Existing note'))
  assert.ok(row.notes.includes('Reviewed evidence'))
  assert.equal(row.internal_status, 'Submitted')
  assert.equal(row.external_status, 'Shortlisted')
  assert.equal(row.org_id, org.id)
  assert.equal((await note('jobs', job.id, 'Reviewed sourcing query')).status, 200)
  assert.ok((await prisma.job.findUnique({ where: { id: job.id } })).notes.startsWith('Existing job note'))
  const streamed = await fetch(`${origin}/api/ai/generate/stream`, { method: 'POST', headers, body: JSON.stringify({ toolId: 'recruiting_workbench', prompt: 'Test using fictional records only.' }) })
  const output = await streamed.text()
  assert.match(output, /Reviewed recruiting evidence/)
  assert.match(output, /"done":true/)
  await new Promise(resolve => setTimeout(resolve, 100))
})
