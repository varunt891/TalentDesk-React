// Read-only against the workspace: all API mutations below use a disposable
// in-memory PostgreSQL database. This audit records observed access failures;
// it does not change authorization policy or connect to .env/Neon databases.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { writeFile, mkdir } from 'node:fs/promises'
import express from 'express'
import cookieParser from 'cookie-parser'
import bcrypt from 'bcryptjs'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

const database = await PGlite.create()
const socket = new PGLiteSocketServer({ db: database, host: '127.0.0.1', port: 0, maxConnections: 4 })
await socket.start()
process.env.DATABASE_URL = `postgresql://postgres:postgres@${socket.getServerConn()}/postgres?connection_limit=1&sslmode=disable&pgbouncer=true`
process.env.JWT_SECRET = 'disposable-access-audit-secret'
const migration = spawn(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate', '--schema', 'server/prisma/schema.prisma'], { env: process.env, stdio: 'pipe', windowsHide: true })
let migrationError = ''; migration.stderr.on('data', chunk => { migrationError += chunk }); migration.stdout.resume()
assert.equal((await once(migration, 'exit'))[0], 0, migrationError)
await database.exec('DEALLOCATE ALL')
const { prisma } = await import('../server/src/prisma.js')
let http
const results = []
try {
  const { default: dataRoutes } = await import('../server/src/routes/data.routes.js')
  const { default: organizationRoutes } = await import('../server/src/routes/organization.routes.js')
  const { default: authRoutes } = await import('../server/src/routes/auth.routes.js')
  const { default: uploadRoutes } = await import('../server/src/routes/upload.routes.js')
  const { default: aiRoutes } = await import('../server/src/routes/ai.routes.js')
  const { aiService } = await import('../server/src/services/aiService.js')
  // No network/paid provider call: test only the API authorization gate.
  aiService.generate = async () => ({ success: true, text: 'Synthetic access-audit response', provider: 'audit', model: 'audit' })
  const { signSession } = await import('../server/src/auth.js')
  const { createPasswordResetToken } = await import('../server/src/services/passwordReset.js')
  const orgA = await prisma.organization.create({ data: { name: 'Audit Alpha', slug: 'audit-alpha', subdomain: 'audit-alpha' } })
  const orgB = await prisma.organization.create({ data: { name: 'Audit Beta', slug: 'audit-beta', subdomain: 'audit-beta' } })
  const orgOff = await prisma.organization.create({ data: { name: 'Audit Inactive', slug: 'audit-inactive', is_active: false } })
  const password = 'Disposable audit credential only'
  const passwordHash = await bcrypt.hash(password, 4)
  const makeUser = async (name, org, role, extra = {}, status = 'ACTIVE') => {
    const profile = await prisma.profile.create({ data: { email: `${name}@example.test`, full_name: name, role: role.toLowerCase(), org_id: org.id, passwordHash, ...extra } })
    const membership = await prisma.organizationMember.create({ data: { user_id: profile.id, organization_id: org.id, role, status } })
    return { ...profile, membership, token: signSession(profile) }
  }
  const ownerA = await makeUser('owner-alpha', orgA, 'OWNER')
  const ownerB = await makeUser('owner-beta', orgB, 'OWNER')
  const adminA = await makeUser('admin-alpha', orgA, 'ADMIN')
  const manager = await makeUser('recruiting-manager', orgA, 'RECRUITMENT_MANAGER')
  const recruiter = await makeUser('recruiter-alpha', orgA, 'RECRUITER', { manager_id: manager.id, team: 'Recruiting' })
  const viewer = await makeUser('viewer-alpha', orgA, 'VIEWER')
  const suspended = await makeUser('suspended-alpha', orgA, 'RECRUITER', {}, 'SUSPENDED')
  const inactive = await makeUser('inactive-profile', orgA, 'RECRUITER', { is_active: false })
  const inactiveCompanyUser = await makeUser('inactive-company-user', orgOff, 'OWNER')
  const promoted = await makeUser('promotion-target', orgA, 'RECRUITER')
  const multi = await makeUser('multi-member', orgA, 'RECRUITER')
  await prisma.organizationMember.create({ data: { user_id: multi.id, organization_id: orgB.id, role: 'VIEWER', status: 'ACTIVE' } })
  await prisma.organizationMember.create({ data: { user_id: suspended.id, organization_id: orgB.id, role: 'VIEWER', status: 'SUSPENDED' } })
  const alphaCandidate = await prisma.candidate.create({ data: { org_id: orgA.id, user_id: recruiter.id, first_name: 'Alpha Candidate', job_id: 'AUDIT-A', resume_text: 'Synthetic Alpha resume.' } })
  const betaCandidate = await prisma.candidate.create({ data: { org_id: orgB.id, user_id: ownerB.id, first_name: 'Beta Candidate', job_id: 'AUDIT-B', resume_text: 'Synthetic Beta resume.' } })
  const task = await prisma.task.create({ data: { org_id: orgA.id, title: 'Alpha recruiter task', assigned_to: recruiter.id, assigned_by: recruiter.id } })
  const betaTask = await prisma.task.create({ data: { org_id: orgB.id, title: 'Beta private task', assigned_to: ownerB.id } })
  const comment = await prisma.taskComment.create({ data: { task_id: betaTask.id, user_id: ownerB.id, comment: 'Synthetic Beta private comment' } })
  const notification = await prisma.notification.create({ data: { org_id: orgA.id, user_id: ownerA.id, title: 'Owner only', message: 'Synthetic owner notification' } })
  const invite = await prisma.organizationInvitation.create({ data: { organization_id: orgA.id, email: 'intended-recipient@example.test', role: 'RECRUITER', token: 'disposable-audit-invitation-token', expires_at: new Date(Date.now() + 86400000) } })
  const app = express(); app.use(express.json(), cookieParser())
  app.use('/api/auth', authRoutes); app.use('/api/data', dataRoutes)
  app.use('/api/organization', organizationRoutes); app.use('/api/upload', uploadRoutes)
  app.use('/api/ai', aiRoutes)
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }))
  http = app.listen(0, '127.0.0.1'); await once(http, 'listening')
  const origin = `http://127.0.0.1:${http.address().port}`
  const request = async (path, user, method = 'GET', body, headers = {}) => {
    const response = await fetch(`${origin}/api${path}`, { method, headers: { 'content-type': 'application/json', ...(user ? { authorization: `Bearer ${user.token}` } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    return { status: response.status, body: await response.json() }
  }
  const check = async (id, name, expected, operation, verdict) => {
    const observed = await operation()
    const pass = verdict(observed)
    results.push({ id, name, expected, status: observed.status, result: pass ? 'PASS' : 'FAIL' })
    console.log(`${pass ? 'PASS' : 'FAIL'} ${id}: ${name} (HTTP ${observed.status}; expected ${expected})`)
    return observed
  }
  const denied = response => [400, 401, 403, 404, 405].includes(response.status)
  const rows = response => response.body.data || []
  const eq = (column, value) => `?filter=${encodeURIComponent(JSON.stringify([{ op: 'eq', column, value }]))}`

  await check('A01', 'Anonymous requests require authentication', '401', () => request('/data/candidates'), r => r.status === 401)
  await check('A02', 'Inactive profiles cannot authenticate', '401', () => request('/auth/session', inactive), r => r.status === 401)
  await check('A03', 'Normal candidate reads stay inside the active company', 'only Alpha rows', () => request('/data/candidates', ownerA), r => r.status === 200 && rows(r).every(c => c.org_id === orgA.id))
  await check('A04', 'A client-supplied foreign organization filter is ignored', 'no Beta candidate', () => request('/data/candidates' + eq('org_id', orgB.id), ownerA), r => r.status === 200 && !rows(r).some(c => c.id === betaCandidate.id))
  await check('A05', 'Ordinary cross-company candidate updates are blocked', '404', () => request(`/data/candidates/${betaCandidate.id}`, ownerA, 'PUT', { notes: 'Unauthorized' }), r => r.status === 404)
  await check('A06', 'Recruiters cannot update company settings', '403', () => request('/organization', recruiter, 'PUT', { name: 'Unauthorized rename' }), r => r.status === 403)
  await check('A07', 'Owners can persist company regional settings', 'Alpha changed, Beta unchanged', () => request('/organization', ownerA, 'PUT', { currency: 'INR', timezone: 'Asia/Kolkata', date_format: 'DD/MM/YYYY' }), r => r.status === 200 && r.body.data.currency === 'INR')
  assert.equal((await prisma.organization.findUnique({ where: { id: orgB.id } })).currency, 'USD')
  await check('A08', 'Recruiters cannot create job requisitions', '403', () => request('/data/jobs', recruiter, 'POST', { title: 'Unauthorized job' }), r => r.status === 403)
  await check('F01', 'Tenant hostname requires membership in that company', 'deny nonmember Alpha owner on Beta host', () => request('/data/candidates', ownerA, 'GET', undefined, { 'x-forwarded-host': 'audit-beta.example.test' }), r => denied(r) || !rows(r).some(c => c.id === betaCandidate.id))
  await check('F02', 'Suspended membership blocks the session', '403 or 401', () => request('/auth/session', suspended), denied)
  await check('F03', 'Inactive company blocks its sessions', '403 or 401', () => request('/auth/session', inactiveCompanyUser), denied)
  await check('F04', 'Viewer cannot create candidate records', '403', () => request('/data/candidates', viewer, 'POST', { first_name: 'Viewer-created record' }), denied)
  await check('F05', 'Recruiting manager can see reporting recruiters candidates', 'includes Alpha candidate', () => request('/data/candidates', manager), r => r.status === 200 && rows(r).some(c => c.id === alphaCandidate.id))
  await check('F06', 'Recruiting manager can see reporting recruiters tasks', 'includes recruiter task', () => request('/data/tasks', manager), r => r.status === 200 && rows(r).some(c => c.id === task.id))
  await check('F07', 'Unrelated viewer cannot edit another users task', '403 or 404', () => request(`/data/tasks/${task.id}`, viewer, 'PUT', { title: 'Changed by unrelated viewer' }), denied)
  await check('F08', 'Task comments cannot leak across companies', 'no Beta comment', () => request('/data/task_comments', recruiter), r => r.status === 200 && !rows(r).some(c => c.id === comment.id))
  await check('F09', 'Notifications are scoped to their recipient', 'no owner notification for recruiter', () => request('/data/notifications', recruiter), r => r.status === 200 && !rows(r).some(c => c.id === notification.id))
  await check('F10', 'Resume download checks company and record access', '403 or 404', () => request(`/upload/resume-url/${betaCandidate.id}`, ownerA), denied)
  await check('R18', 'Candidate cannot reference another company resume file', '403', () => request(`/data/candidates/${alphaCandidate.id}`, recruiter, 'PUT', { resume_file_key: `resumes/${orgB.id}/foreign-resume.pdf` }), r => r.status === 403)
  await check('R19', 'Foreign task cannot receive a comment through the generic endpoint', '403', () => request('/data/task_comments', recruiter, 'POST', { task_id: betaTask.id, comment: 'Blocked foreign comment' }), r => r.status === 403)
  await check('F11', 'Company admins cannot enumerate platform organizations', '403', () => request('/organization/all', adminA), denied)
  await check('F12', 'Generic organization endpoint does not expose other companies', 'Alpha only or deny', () => request('/data/organizations', adminA), r => denied(r) || rows(r).every(o => o.id === orgA.id))
  await check('F13', 'Company admin cannot change the billing plan directly', '403', () => request('/organization', adminA, 'PUT', { subscription_plan: 'Enterprise' }), denied)
  await check('F14', 'Company owner cannot grant platform Superadmin', '403', () => request(`/organization/members/${promoted.membership.id}/role`, ownerA, 'PUT', { role: 'SUPERADMIN' }), denied)
  await check('F15', 'Company admin cannot revoke another company users sessions', '403 or 404', () => request('/auth/force-logout-user', adminA, 'POST', { memberId: ownerB.id }), denied)
  await check('F16', 'Company admin cannot reset another company users password', '403 or 404', () => request('/auth/admin-reset-password', adminA, 'POST', { memberId: ownerB.id, newPassword: 'Changed only in disposable database' }), denied)
  await check('F17', 'Invitation tokens are not exposed to ordinary recruiters', '403 or token omitted', () => request('/organization/invitations', recruiter), r => denied(r) || !rows(r).some(i => i.token))
  await check('F18', 'An invitation cannot be claimed using a different email', '400 or 403', () => request('/auth/signup', null, 'POST', { email: 'different-recipient@example.test', password, invite_token: invite.token }), denied)
  await check('F19', 'Company signup requires an invitation', '400 or 403', () => request('/auth/signup', null, 'POST', { email: 'uninvited@example.test', password }, { 'x-forwarded-host': 'audit-beta.example.test' }), denied)
  await check('F20', 'Suspended target membership cannot be selected', '403', () => request('/organization/switch', suspended, 'POST', { organization_id: orgB.id }), denied)
  await check('A09', 'Active multi-company member can switch workspaces', '200 with Viewer role', () => request('/organization/switch', multi, 'POST', { organization_id: orgB.id }), r => r.status === 200 && r.body.data.profile.role === 'VIEWER' && r.body.data.organization.id === orgB.id)
  await check('F21', 'Company member list includes members currently active elsewhere', 'includes multi-member in Alpha', () => request('/organization/members', ownerA), r => r.status === 200 && rows(r).some(m => m.user_id === multi.id))
  await check('F25', 'Viewer AI restriction is enforced at the API', '403', () => request('/ai/generate', viewer, 'POST', { prompt: 'Synthetic audit prompt', toolId: 'copilot' }), denied)
  const removed = await makeUser('removed-member', orgA, 'RECRUITER')
  const removedResponse = await request(`/organization/members/${removed.membership.id}`, ownerA, 'DELETE')
  assert.equal(removedResponse.status, 200)
  await check('F26', 'Removing a member prevents their next authenticated request', '403 or 401; membership remains removed', () => request('/auth/session', removed), denied)
  // Exercise every declared system role, including lowercase profile roles and
  // uppercase membership roles, against the main settings/write gates.
  const roles = ['OWNER', 'ADMIN', 'SUPERADMIN', 'RECRUITMENT_MANAGER', 'ACCOUNT_MANAGER', 'OPERATIONS_MANAGER', 'MANAGER', 'RECRUITER', 'HR_TEAM', 'HR_MANAGER', 'EMPLOYEE', 'VIEWER']
  const jobRoles = ['OWNER', 'ADMIN', 'SUPERADMIN', 'RECRUITMENT_MANAGER', 'ACCOUNT_MANAGER', 'OPERATIONS_MANAGER', 'MANAGER']
  const candidateWriteRoles = [...jobRoles, 'RECRUITER', 'HR_TEAM']
  for (const role of roles) {
    const account = await makeUser(`matrix-${role.toLowerCase()}`, orgA, role)
    const editOrg = ['OWNER', 'ADMIN', 'SUPERADMIN'].includes(role)
    await check(`ROLE-${role}-settings`, `${role} company-setting update gate`, editOrg ? '200' : '403', () => request('/organization', account, 'PUT', { industry: 'Audit recruiting' }), r => r.status === (editOrg ? 200 : 403))
    await check(`ROLE-${role}-jobs`, `${role} job-creation gate`, jobRoles.includes(role) ? '201' : '403', () => request('/data/jobs', account, 'POST', { title: `${role} disposable role probe` }), r => r.status === (jobRoles.includes(role) ? 201 : 403))
    await check(`ROLE-${role}-candidates`, `${role} candidate-write gate matches displayed permissions`, candidateWriteRoles.includes(role) ? '201' : '403', () => request('/data/candidates', account, 'POST', { first_name: `${role} disposable role probe` }), r => r.status === (candidateWriteRoles.includes(role) ? 201 : 403))
  }
  const reset = await check('F22', 'Public password-reset request does not return a usable secret', 'generic response without token', () => request('/auth/forgot-password', null, 'POST', { email: ownerA.email }), r => r.status === 200 && !r.body.token)
  assert.equal(reset.body.token, undefined)
  const resetToken = createPasswordResetToken(ownerA)
  await check('F23', 'Password-reset token cannot serve as a login session', '401', () => request('/auth/session', { token: resetToken }), r => r.status === 401)
  await check('R01', 'Correct invitation creates an active company member', '201', () => request('/auth/signup', null, 'POST', { email: invite.email, password, invite_token: invite.token }), r => r.status === 201 && r.body.membership.organization_id === orgA.id)
  await check('R02', 'Claimed invitation cannot be reused', 'deny', () => request('/auth/signup', null, 'POST', { email: 'reuse@example.test', password, invite_token: invite.token }), denied)
  await check('R03', 'Generic profile endpoint cannot grant platform authority', '403', () => request(`/data/profiles/${promoted.id}`, ownerA, 'PUT', { role: 'SUPERADMIN' }), denied)
  await check('R04', 'Company admin cannot modify Owner role', '403', () => request(`/organization/members/${ownerA.membership.id}/role`, adminA, 'PUT', { role: 'RECRUITER' }), denied)
  await check('R05', 'Owner can update a member role', '200', () => request(`/organization/members/${promoted.membership.id}/role`, ownerA, 'PUT', { role: 'EMPLOYEE' }), r => r.status === 200 && r.body.data.role === 'EMPLOYEE')
  await check('R06', 'Role changes are effective on the next request', '403 candidate write', () => request('/data/candidates', promoted, 'POST', { first_name: 'Blocked after demotion' }), r => r.status === 403)
  await check('R07', 'Owner can reset a same-company ordinary account', '200', () => request('/auth/admin-reset-password', ownerA, 'POST', { memberId: promoted.id, newPassword: password }), r => r.status === 200)
  await check('R08', 'Reset invalidates old sessions', '401', () => request('/auth/session', promoted), r => r.status === 401)
  await check('R09', 'A verified reset token can reset its account password', '200', () => request('/auth/reset-password', null, 'POST', { token: createPasswordResetToken(viewer), newPassword: password }), r => r.status === 200)
  await check('R10', 'Reset token is single-use', '400', () => request('/auth/reset-password', null, 'POST', { token: createPasswordResetToken(viewer), newPassword: password }), r => r.status === 400)
  await check('R11', 'Recruiter cannot change company AI policy', '403', () => request('/organization/ai-policy', recruiter, 'PUT', { features: { chat: false } }), r => r.status === 403)
  await check('R12', 'Owner can save shared AI policy', '200', () => request('/organization/ai-policy', ownerA, 'PUT', { features: { chat: false } }), r => r.status === 200 && r.body.data.features.chat === false)
  await check('R13', 'Another member reads the same company AI policy', 'chat disabled', () => request('/organization/ai-policy', recruiter), r => r.status === 200 && r.body.data.features.chat === false)
  await check('R14', 'Shared policy blocks direct Copilot API calls', '403', () => request('/ai/generate', recruiter, 'POST', { prompt: 'Policy test', toolId: 'copilot' }), r => r.status === 403)
  await check('R15', 'Company AI policy does not affect other companies', 'Beta chat enabled', () => request('/organization/ai-policy', ownerB), r => r.status === 200 && r.body.data.features.chat === true)
  await request('/organization/ai-policy', ownerA, 'PUT', { features: { chat: true }, dailyRequestLimit: 1 })
  await check('R16', 'First permitted AI request succeeds', '200', () => request('/ai/generate', recruiter, 'POST', { prompt: 'Quota test', toolId: 'copilot' }), r => r.status === 200)
  await check('R17', 'Daily policy limit is enforced by the API', '429', () => request('/ai/generate', recruiter, 'POST', { prompt: 'Second quota test', toolId: 'copilot' }), r => r.status === 429)
  const before = (await prisma.profile.findUnique({ where: { id: ownerB.id } })).token_version
  await check('F24', 'Company-wide force logout never touches another company', 'Beta token version unchanged', async () => {
    const response = await request('/auth/force-logout-all-users', ownerA, 'POST', {})
    return { ...response, foreignChanged: (await prisma.profile.findUnique({ where: { id: ownerB.id } })).token_version !== before }
  }, r => r.status === 200 && !r.foreignChanged)
  const report = { at: new Date().toISOString(), database: 'Disposable in-memory PGlite; no workspace or Neon records accessed', checks: results.length, passed: results.filter(r => r.result === 'PASS').length, failed: results.filter(r => r.result === 'FAIL').length, results }
  await mkdir('.talentdesk-local', { recursive: true })
  await writeFile('.talentdesk-local/access-audit.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ checks: report.checks, passed: report.passed, failed: report.failed }))
  if (report.failed) process.exitCode = 1
} finally {
  if (http) { http.closeAllConnections(); await new Promise(resolve => http.close(resolve)) }
  await prisma.$disconnect(); await socket.stop(); await database.close()
}
