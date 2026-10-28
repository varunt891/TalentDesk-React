import { Router } from 'express'
import { requireAdmin, requireAuth } from '../auth.js'
import { prisma } from '../prisma.js'
import { storageService } from '../services/storageService.js'
import { detectAndRecordCollisions } from '../services/collisionService.js'
import { appendRecordNote } from '../services/recordNotesService.js'

const router = Router()

const tables = {
  organizations: { model: 'organization', orgScoped: false, adminWrite: true, adminRead: true },
  profiles: { model: 'profile', orgScoped: true, adminWrite: true },
  candidates: { model: 'candidate', orgScoped: true },
  jobs: { model: 'job', orgScoped: true },
  callbacks: { model: 'callback', orgScoped: true },
  followups: { model: 'followup', orgScoped: true },
  postings: { model: 'posting', orgScoped: true },
  tasks: { model: 'task', orgScoped: true },
  task_comments: { model: 'taskComment', orgScoped: false },
  notifications: { model: 'notification', orgScoped: true },
  user_invitations: { model: 'userInvitation', orgScoped: true, adminWrite: true, adminRead: true },
  admin_audit_log: { model: 'adminAuditLog', orgScoped: true, readOnly: true, adminRead: true },
  activity_logs: { model: 'activityLog', orgScoped: true, readOnly: true },
  submission_collisions: { model: 'submissionCollision', orgScoped: true, readOnly: true },
}

const publicFields = {
  profiles: ['id', 'org_id', 'email', 'full_name', 'phone', 'extension', 'role', 'team', 'department', 'manager_id', 'is_active', 'created_at', 'updated_at'],
}

import { ownedTables, buildWhere, scopedRowWhere, canManageJobAssignment, visibleOwnerIds } from '../services/recordAccess.js'
import { TABLE_MODULES, assertModule, isCompanyAdmin, forbidden, roleOf, assertRoleChange } from '../access.js'
import { updateMemberRole, removeMember } from '../services/memberAccess.js'

function configFor(table) {
  const config = tables[table]
  if (!config) {
    const error = new Error(`Unknown table: ${table}`)
    error.status = 404
    throw error
  }
  return config
}

function sanitize(table, row) {
  if (!row) return row
  if (Array.isArray(row)) return row.map(item => sanitize(table, item))
  const allowed = publicFields[table]
  if (!allowed) return row
  return Object.fromEntries(allowed.map(key => [key, row[key]]))
}

function buildOrder(req) {
  if (!req.query.order) return undefined
  const order = JSON.parse(req.query.order)
  return { [order.column]: order.ascending ? 'asc' : 'desc' }
}

function withOwnership(req, table, body, current) {
  const data = { ...body }
  delete data.id
  delete data.created_at
  delete data.updated_at

  const activeOrgId = req.organizationId || req.tenantOrg?.id || req.profile?.org_id

  if (tables[table]?.orgScoped) {
    // Always enforce the server-side active org — never trust the client-supplied
    // org_id, which can be stale after an org-switch (e.g. bransarv user still
    // holding TalentDesk's org_id in their React state).
    if (activeOrgId) {
      data.org_id = current?.org_id || activeOrgId
    }
  } else {
    delete data.org_id
  }

  if (ownedTables.includes(table)) {
    if (!current) data.user_id ||= req.user.id
  }

  if (table === 'candidates') {
    if (data.name && (!data.first_name || !data.last_name)) {
      const parts = data.name.trim().split(' ')
      data.first_name ||= parts[0] || ''
      data.last_name ||= parts.slice(1).join(' ') || ''
    }
    delete data.name

    if (data.title && !data.job_title) data.job_title = data.title
    delete data.title

    if (data.company && !data.client) data.client = data.company
    delete data.company

    if (data.source_url && !data.linkedin) data.linkedin = data.source_url
    delete data.source_url

    if (data.summary && !data.notes) data.notes = data.summary
    delete data.summary

    if (data.stage && !data.internal_status) data.internal_status = data.stage
    delete data.stage

    delete data.avatar_url
    delete data.source
  }

  if (table === 'profiles') {
    const fields = ['full_name', 'email', 'phone', 'extension', 'department', 'team', 'manager_id']
    return { ...Object.fromEntries(Object.entries(data).filter(([key]) => fields.includes(key))), ...(!current ? { org_id: activeOrgId } : {}) }
  }

  return data
}

async function validateWrite(req, table, body, current) {
  if (table === 'candidates' && body.resume_file_key && body.resume_file_key !== current?.resume_file_key) {
    const prefix = `resumes/${current?.org_id || req.organizationId}/`
    if (!body.resume_file_key.startsWith(prefix) || body.resume_file_key.includes('..')) throw forbidden('Resume files must belong to this company')
  }
  const activeMember = async id => {
    if (!id) return
    if (!await prisma.organizationMember.findFirst({ where: { user_id: id, organization_id: current?.org_id || req.organizationId, status: 'ACTIVE', user: { is_active: true } } })) throw forbidden('Assignments must reference an active member of this company')
  }
  const owners = await visibleOwnerIds(req)
  for (const id of [body.user_id, ...(table === 'jobs' && Array.isArray(body.assigned_to) ? body.assigned_to : []), ...(table === 'tasks' ? [body.assigned_to] : []), ...(table === 'profiles' ? [body.manager_id] : [])].filter(Boolean)) {
    await activeMember(id)
    if (ownedTables.includes(table) && owners && !owners.includes(id)) throw forbidden('You cannot assign records outside your team')
  }
  if (table === 'tasks') {
    if (body.assigned_by && body.assigned_by !== (current?.assigned_by || req.user.id)) throw forbidden('Task creator cannot be changed')
    if (!current) body.assigned_by = req.user.id
    if (body.assigned_to && owners && !owners.includes(body.assigned_to)) throw forbidden('You cannot assign tasks outside your team')
  }
  if (table === 'task_comments') {
    const taskId = current?.task_id || body.task_id
    if (current && body.task_id && body.task_id !== current.task_id) throw forbidden('A comment cannot be moved to another task')
    if (!taskId || !await prisma.task.findFirst({ where: await scopedRowWhere(req, 'tasks', tables.tasks, taskId) })) throw forbidden('Task access required')
    body.user_id = current?.user_id || req.user.id
    body.user_name = current?.user_name || req.profile.full_name
    if (current && current.user_id !== req.user.id && !isCompanyAdmin(req)) throw forbidden('Only the author can edit this comment')
  }
  if (table === 'notifications') {
    if (!current) { await activeMember(body.user_id); assertModule(req, 'Tasks', 'edit') }
    else if (body.user_id && body.user_id !== req.user.id) throw forbidden('Notification recipient cannot be changed')
  }
  if (table === 'profiles') {
    if ('passwordHash' in body || 'token_version' in body) throw forbidden('Use the account security endpoints')
    if (current) {
      const membership = await prisma.organizationMember.findUnique({ where: { user_id_organization_id: { user_id: current.id, organization_id: req.organizationId } } })
      assertRoleChange(req, current.role?.toUpperCase() === 'SUPERADMIN' ? 'SUPERADMIN' : membership?.role, body.role || membership?.role)
    } else assertRoleChange(req, 'RECRUITER', body.role || 'RECRUITER')
  }
  if (table === 'organizations') {
    if (!req.isPlatformAdmin && Object.keys(body).some(key => ['candidate_limit', 'ai_credit_limit', 'slug', 'subdomain', 'email_domain', 'is_active', 'plan'].includes(key))) throw forbidden('Platform administration required for these company fields')
    if ('subscription_plan' in body && !['OWNER', 'SUPERADMIN'].includes(roleOf(req))) throw forbidden('Only an Owner can change the plan')
  }
}

function summarizeRow(table, row) {
  if (table === 'candidates') return [row.first_name, row.last_name, row.job_title].filter(Boolean).join(' - ')
  if (table === 'jobs') return [row.job_id, row.title, row.client].filter(Boolean).join(' - ')
  if (table === 'callbacks' || table === 'followups') return row.candidate_name || row.job || row.type || table
  if (table === 'postings') return [row.portal, row.job_title].filter(Boolean).join(' - ')
  if (table === 'profiles') return row.full_name || row.email || 'User'
  return table
}

async function logActivity(req, action, table, row, details = {}) {
  if (table === 'activity_logs' || table === 'admin_audit_log') return
  await prisma.activityLog.create({
    data: {
      org_id: req.tenantOrg?.id || req.profile.org_id,
      actor_id: req.user.id,
      actor_name: req.profile.full_name || req.user.email,
      action,
      entity: table,
      entity_id: row?.id,
      summary: summarizeRow(table, row),
      details,
    },
  })
}

router.use(requireAuth)
router.use((req, res, next) => {
  try {
    const table = req.path.split('/')[1]
    const moduleName = TABLE_MODULES[table]
    if (moduleName) assertModule(req, moduleName, req.method === 'GET' ? 'view' : 'edit')
    if (table === 'organizations' && req.method !== 'GET' && !isCompanyAdmin(req)) throw forbidden()
    if (table === 'organizations' && ['POST', 'DELETE'].includes(req.method) && !req.isPlatformAdmin) throw forbidden('Only a platform administrator can create or delete companies')
    next()
  } catch (error) { next(error) }
})

router.patch('/submission_collisions/:id/resolve', async (req, res, next) => {
  try {
    const { status } = req.body
    if (!['dismissed', 'confirmed'].includes(status)) {
      return res.status(400).json({ error: 'status must be "dismissed" or "confirmed"' })
    }
    const orgId = req.organizationId || req.profile?.org_id
    const current = await prisma.submissionCollision.findFirst({ where: { id: req.params.id, org_id: orgId } })
    if (!current) return res.status(404).json({ error: 'Record not found' })

    const updated = await prisma.submissionCollision.update({
      where: { id: req.params.id },
      data: { status, resolved_by: req.user.id, resolved_at: new Date() },
    })
    res.json({ data: updated })
  } catch (err) {
    next(err)
  }
})

// Job Remarks are deliberately org-wide collaborative notes (unlike the rest
// of a job's fields, which stay owner-scoped like every other job edit) — a
// recruiter working someone else's shared requisition still needs to be able
// to leave/read remarks on it. Narrow and purpose-built rather than loosening
// the generic PUT /jobs/:id owner-scoping, which would open up full editing
// of a colleague's job (title/status/rate) — a bigger policy change than "let
// the team leave notes on a shared req."
router.patch('/jobs/:id/remarks', async (req, res, next) => {
  try {
    const orgId = req.organizationId || req.profile?.org_id
    const current = await prisma.job.findFirst({ where: { id: req.params.id, org_id: orgId } })
    if (!current) return res.status(404).json({ error: 'Record not found' })

    const updated = await prisma.job.update({
      where: { id: req.params.id },
      data: { notes: req.body.notes ?? null },
    })
    await logActivity(req, 'updated', 'jobs', updated, { updates: { notes: '(remarks updated)' } })
    res.json({ data: updated })
  } catch (err) {
    next(err)
  }
})

router.get('/:table', async (req, res, next) => {
  try {
    const table = req.params.table
    const config = configFor(table)
    if (config.adminRead && !['ADMIN', 'SUPERADMIN', 'OWNER'].includes((req.memberRole || req.profile.role || '').toUpperCase())) {
      return res.status(403).json({ error: 'Admin or Owner access required' })
    }
    const model = prisma[config.model]

    const queryOptions = {
      where: await buildWhere(req, table, config),
      orderBy: buildOrder(req),
    }

    if (table === 'candidates') {
      queryOptions.include = {
        organization: {
          select: { id: true, name: true }
        }
      }
    }

    const rows = await model.findMany(queryOptions)
    if (table === 'profiles') {
      const members = await prisma.organizationMember.findMany({ where: { user_id: { in: rows.map(p => p.id) }, organization_id: req.organizationId } })
      const byUser = new Map(members.map(m => [m.user_id, m]))
      return res.json({ data: sanitize(table, rows.map(p => ({ ...p, org_id: req.organizationId, role: byUser.get(p.id)?.role?.toLowerCase() || 'viewer', is_active: p.is_active && byUser.get(p.id)?.status === 'ACTIVE' }))) })
    }
    const sanitized = sanitize(table, rows)

    if (table === 'candidates' && Array.isArray(sanitized)) {
      const mapped = sanitized.map((c, i) => ({
        ...c,
        org_name: rows[i]?.organization?.name || null
      }))
      return res.json({ data: mapped })
    }

    res.json({ data: sanitized })
  } catch (err) {
    next(err)
  }
})

router.post('/:table', async (req, res, next) => {
  try {
    const table = req.params.table
    const config = configFor(table)
    if (config.readOnly) return res.status(405).json({ error: 'This table is read-only' })
    if (config.adminWrite) {
      const r = (req.memberRole || req.profile.role || '').toUpperCase()
      if (!['ADMIN', 'SUPERADMIN', 'OWNER'].includes(r)) return requireAdmin(req, res, () => {})
    }
    if (table === 'jobs' && !canManageJobAssignment(req)) {
      return res.status(403).json({ error: 'Only account managers and above can create job requisitions.' })
    }

    const model = prisma[config.model]
    const rows = Array.isArray(req.body) ? req.body : [req.body]

    if (table === 'candidates') {
      const orgId = req.organizationId || req.profile?.org_id
      if (orgId) {
        const org = await prisma.organization.findUnique({ where: { id: orgId } })
        const isEnterprise = (org?.subscription_plan || 'Growth') === 'Enterprise'
        if (!isEnterprise) {
          const count = await prisma.candidate.count({ where: { org_id: orgId } })
          const limit = org?.candidate_limit || (org?.subscription_plan === 'Starter' ? 2500 : 15000)
          if (count + rows.length > limit) {
            const remaining = Math.max(limit - count, 0)
            return res.status(403).json({ error: `Only ${remaining} of your ${rows.length} candidate${rows.length === 1 ? '' : 's'} fit under your ${org?.subscription_plan || 'Starter'} plan limit (${count}/${limit} used). Please upgrade under Organization Settings.` })
          }
        }
      }
    }

    const data = []
    const collisions = []

    for (const row of rows) {
      await validateWrite(req, table, row)
      const created = table === 'profiles' ? await prisma.$transaction(async tx => {
        const profile = await tx.profile.create({ data: { ...withOwnership(req, table, row), role: req.isPlatformAdmin && String(row.role).toUpperCase() === 'SUPERADMIN' ? 'superadmin' : 'recruiter' } })
        await tx.organizationMember.create({ data: { user_id: profile.id, organization_id: req.organizationId, role: assertRoleChange(req, 'RECRUITER', row.role || 'RECRUITER') } })
        return { ...profile, role: row.role || 'recruiter' }
      }) : await model.create({ data: withOwnership(req, table, row) })
      await logActivity(req, 'created', table, created)
      data.push(created)
      if (table === 'candidates') {
        const found = await detectAndRecordCollisions({ req, candidate: created, excludeId: created.id })
        collisions.push(...found)
      }
    }

    res.status(201).json({ data: sanitize(table, data), collisions })
  } catch (err) {
    next(err)
  }
})

router.post('/:table/:id/notes', async (req, res, next) => {
  try {
    const { table, id } = req.params
    if (!['candidates', 'jobs'].includes(table)) return res.status(400).json({ error: 'Notes can be saved to candidates or jobs.' })
    const { content, title } = req.body
    if (typeof content !== 'string' || !content.trim() || content.length > 40000) {
      return res.status(400).json({ error: 'Enter a note between 1 and 40,000 characters.' })
    }
    const config = configFor(table)
    const where = await scopedRowWhere(req, table, config, id)
    const label = typeof title === 'string' ? title.replace(/[\r\n]/g, ' ').slice(0, 160) : 'Recruiting note'
    const entry = `[${label} · ${new Date().toISOString()} · ${req.profile?.full_name || 'Recruiter'}]\n${content.trim()}`
    const data = await appendRecordNote(prisma[config.model], where, entry)
    await logActivity(req, 'updated', table, data, { updates: { notes: '(reviewed AI draft appended)' } })
    res.json({ data: [data] })
  } catch (err) { next(err) }
})

router.put('/:table/:id', async (req, res, next) => {
  try {
    const table = req.params.table
    const config = configFor(table)
    if (config.readOnly) return res.status(405).json({ error: 'This table is read-only' })
    if (config.adminWrite) {
      const r = (req.memberRole || req.profile.role || '').toUpperCase()
      if (!['ADMIN', 'SUPERADMIN', 'OWNER'].includes(r)) return requireAdmin(req, res, () => {})
    }

    if (table === 'jobs' && !canManageJobAssignment(req)) {
      delete req.body.assigned_to
    }

    const model = prisma[config.model]
    const current = await model.findFirst({ where: await scopedRowWhere(req, table, config, req.params.id) })
    if (!current) return res.status(404).json({ error: 'Record not found' })
    await validateWrite(req, table, req.body, current)

    const data = table === 'profiles' ? await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${req.organizationId}::uuid FOR UPDATE`
      if (req.body.role !== undefined) await updateMemberRole(req, current.id, req.body.role, tx)
      if (req.body.is_active !== undefined) {
        if (current.id === req.user.id && req.body.is_active === false) throw forbidden('You cannot suspend your own membership')
        const member = await tx.organizationMember.findUnique({ where: { user_id_organization_id: { user_id: current.id, organization_id: req.organizationId } } })
        if (member.role === 'OWNER' && req.body.is_active === false && await tx.organizationMember.count({ where: { organization_id: req.organizationId, role: 'OWNER', status: 'ACTIVE' } }) <= 1) throw forbidden('The company must retain an active Owner')
        await tx.organizationMember.update({ where: { id: member.id }, data: { status: req.body.is_active ? 'ACTIVE' : 'SUSPENDED' } })
      }
      return tx.profile.update({ where: { id: current.id }, data: withOwnership(req, table, req.body, current) })
    }) : await model.update({
      where: { id: req.params.id },
      data: withOwnership(req, table, req.body, current),
    })
    if (table === 'candidates' && current.resume_file_key && current.resume_file_key !== data.resume_file_key) {
      await storageService.deleteFile(current.resume_file_key)
    }
    await logActivity(req, 'updated', table, data, { updates: req.body })

    let collisions = []
    if (table === 'candidates') {
      collisions = await detectAndRecordCollisions({ req, candidate: data, excludeId: data.id })
    }
    res.json({ data: sanitize(table, [data]), collisions })
  } catch (err) {
    next(err)
  }
})

router.delete('/:table/:id', async (req, res, next) => {
  try {
    const table = req.params.table
    const config = configFor(table)
    if (config.readOnly) return res.status(405).json({ error: 'This table is read-only' })
    if (config.adminWrite) {
      const r = (req.memberRole || req.profile.role || '').toUpperCase()
      if (!['ADMIN', 'SUPERADMIN', 'OWNER'].includes(r)) return requireAdmin(req, res, () => {})
    }

    const model = prisma[config.model]
    const current = await model.findFirst({ where: await scopedRowWhere(req, table, config, req.params.id) })
    if (!current) return res.status(404).json({ error: 'Record not found' })

    await validateWrite(req, table, {}, current)
    if (table === 'profiles') {
      const member = await prisma.organizationMember.findUnique({ where: { user_id_organization_id: { user_id: current.id, organization_id: req.organizationId } } })
      await removeMember(req, member)
    } else await model.delete({ where: { id: req.params.id } })
    if (table === 'candidates' && current.resume_file_key) {
      await storageService.deleteFile(current.resume_file_key)
    }
    await logActivity(req, 'deleted', table, current)
    res.json({ data: null })
  } catch (err) {
    next(err)
  }
})

export default router
