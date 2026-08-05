import { Router } from 'express'
import { requireAdmin, requireAuth } from '../auth.js'
import { prisma } from '../prisma.js'
import { storageService } from '../services/storageService.js'
import { detectAndRecordCollisions } from '../services/collisionService.js'

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
  admin_audit_log: { model: 'adminAuditLog', orgScoped: true, adminWrite: true, adminRead: true },
  activity_logs: { model: 'activityLog', orgScoped: true, readOnly: true },
  submission_collisions: { model: 'submissionCollision', orgScoped: true, readOnly: true },
}

const publicFields = {
  profiles: ['id', 'org_id', 'email', 'full_name', 'phone', 'extension', 'role', 'team', 'department', 'manager_id', 'is_active', 'created_at', 'updated_at'],
}

const ownedTables = ['candidates', 'jobs', 'callbacks', 'followups', 'postings']

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

function coerce(value) {
  if (value === 'true') return true
  if (value === 'false') return false
  if (value === 'null') return null
  return value
}

async function getDescendantProfileIds(managerId, orgId) {
  const allOrgProfiles = await prisma.profile.findMany({
    where: { org_id: orgId },
    select: { id: true, manager_id: true, team: true },
  })

  const descendantIds = new Set([managerId])
  let added = true
  while (added) {
    added = false
    for (const p of allOrgProfiles) {
      if (!descendantIds.has(p.id) && p.manager_id && descendantIds.has(p.manager_id)) {
        descendantIds.add(p.id)
        added = true
      }
    }
  }
  return Array.from(descendantIds)
}

async function getDirectTeamProfileIds(managerId, orgId, team) {
  const whereConditions = [{ manager_id: managerId }, { id: managerId }]
  if (team) whereConditions.push({ team })

  const teamProfiles = await prisma.profile.findMany({
    where: { org_id: orgId, OR: whereConditions },
    select: { id: true },
  })
  return teamProfiles.map(p => p.id)
}

function isRMRole(profile) {
  if (!profile) return false
  if (['recruitment_manager', 'operations_manager'].includes(profile.role)) return true
  if (profile.role === 'manager' && !profile.manager_id) return true
  return false
}

function isAMRole(profile) {
  if (!profile) return false
  if (profile.role === 'account_manager') return true
  if (profile.role === 'manager' && !!profile.manager_id) return true
  return false
}

// req.profile.role / req.memberRole are always the UPPERCASE OrganizationMember
// role (requireAuth overwrites profile.role with it) — unlike isRMRole/isAMRole
// above, this compares uppercase-to-uppercase deliberately.
const JOB_CREATE_ROLES = ['ACCOUNT_MANAGER', 'RECRUITMENT_MANAGER', 'OPERATIONS_MANAGER', 'MANAGER', 'ADMIN', 'SUPERADMIN', 'OWNER']
function canManageJobAssignment(req) {
  const role = (req.memberRole || req.profile?.role || '').toUpperCase()
  return JOB_CREATE_ROLES.includes(role)
}

async function visibleOwnerIds(req) {
  const role = (req.memberRole || req.profile?.role || '').toLowerCase()
  if (['admin', 'superadmin', 'owner'].includes(role)) return null

  if (isRMRole(req.profile)) {
    return await getDescendantProfileIds(req.user.id, req.profile.org_id)
  }

  if (isAMRole(req.profile)) {
    return await getDirectTeamProfileIds(req.user.id, req.profile.org_id, req.profile.team)
  }

  return [req.user.id]
}

function isSuperAdminUser(req) {
  const role = (req.memberRole || req.profile?.role || '').toLowerCase()
  return role === 'superadmin'
}

async function buildWhere(req, table, config) {
  const filters = req.query.filter ? JSON.parse(req.query.filter) : []
  const where = {}

  for (const filter of filters) {
    if (filter.op === 'eq') where[filter.column] = coerce(filter.value)
  }

  const isSuper = isSuperAdminUser(req)
  const wantsAllOrgs = isSuper && (req.query.all_orgs === 'true' || req.query.all_orgs === '1')
  // A superadmin inspecting another org from the admin panel explicitly filters by org_id;
  // honor that instead of forcing their own org, while non-superadmins can never override it.
  const requestedOrgId = isSuper ? filters.find(f => f.op === 'eq' && f.column === 'org_id')?.value : undefined

  if (config.orgScoped && !wantsAllOrgs) {
    where.org_id = requestedOrgId !== undefined ? coerce(requestedOrgId) : (req.organizationId || req.tenantOrg?.id || req.profile.org_id)
  }

  if (ownedTables.includes(table)) {
    // Narrow, deliberate exception: recruiters sharing one job requisition need
    // to see each other's submissions to it (this is exactly the scenario the
    // collision-detection feature exists to catch), and need to be able to open
    // the shared Job Detail page / look a job up by its exact Job ID even when
    // someone else created it — but only when the request is already scoped to
    // one specific job_id/candidates job_id/job row id, never as a blanket
    // org-wide dump. Requesting all_owners without one of those filters has no effect.
    const jobIdFilter = filters.find(f => f.op === 'eq' && f.column === 'job_id')?.value
    const jobRowIdFilter = filters.find(f => f.op === 'eq' && f.column === 'id')?.value
    const wantsAllOwners = (req.query.all_owners === 'true' || req.query.all_owners === '1') && (
      (table === 'candidates' && Boolean(jobIdFilter)) ||
      (table === 'jobs' && Boolean(jobIdFilter || jobRowIdFilter))
    )
    if (!wantsAllOwners) {
      const ownerIds = await visibleOwnerIds(req)
      if (ownerIds) {
        // Jobs are visible if you created them OR you're one of its assignees —
        // a plain owner-only check would hide a recruiter's own assigned jobs,
        // since only account_manager+ roles create jobs going forward.
        if (table === 'jobs') {
          where.OR = [{ user_id: { in: ownerIds } }, { assigned_to: { array_contains: req.user.id } }]
        } else {
          where.user_id = { in: ownerIds }
        }
      }
    }
  }

  if (table === 'tasks') {
    if (['ADMIN', 'SUPERADMIN', 'OWNER', 'admin', 'superadmin', 'owner'].includes(req.memberRole || req.profile.role)) {
      // Admins see all tasks in org
    } else if (isRMRole(req.profile)) {
      const allowedIds = await getDescendantProfileIds(req.user.id, req.organizationId || req.profile.org_id)
      where.OR = [
        { assigned_to: { in: allowedIds } },
        { assigned_by: { in: allowedIds } }
      ]
    } else if (isAMRole(req.profile)) {
      const allowedIds = await getDirectTeamProfileIds(req.user.id, req.organizationId || req.profile.org_id, req.profile.team)
      where.OR = [
        { assigned_to: { in: allowedIds } },
        { assigned_by: { in: allowedIds } }
      ]
    } else {
      where.OR = [
        { assigned_to: req.user.id },
        { assigned_by: req.user.id }
      ]
    }
  }

  if (table === 'profiles') {
    where.org_id = requestedOrgId !== undefined ? coerce(requestedOrgId) : (req.organizationId || req.profile.org_id)
  }

  return where
}

async function scopedRowWhere(req, table, config, id) {
  const where = { id }

  if (config.orgScoped && !isSuperAdminUser(req)) {
    where.org_id = req.organizationId || req.profile.org_id
  }

  if (ownedTables.includes(table)) {
    const ownerIds = await visibleOwnerIds(req)
    if (ownerIds) {
      if (table === 'jobs') {
        where.OR = [{ user_id: { in: ownerIds } }, { assigned_to: { array_contains: req.user.id } }]
      } else {
        where.user_id = { in: ownerIds }
      }
    }
  }

  return where
}

function buildOrder(req) {
  if (!req.query.order) return undefined
  const order = JSON.parse(req.query.order)
  return { [order.column]: order.ascending ? 'asc' : 'desc' }
}

function withOwnership(req, table, body) {
  const data = { ...body }
  delete data.id
  delete data.created_at
  delete data.updated_at

  const activeOrgId = req.organizationId || req.tenantOrg?.id || req.profile?.org_id

  if (tables[table]?.orgScoped) {
    if (!data.org_id && activeOrgId) {
      data.org_id = activeOrgId
    }
  } else {
    delete data.org_id
  }

  if (ownedTables.includes(table)) {
    data.user_id ||= req.user.id
  }

  if (table === 'profiles') delete data.passwordHash

  return data
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
    if (config.adminWrite && !['admin', 'superadmin'].includes(req.profile.role)) {
      return requireAdmin(req, res, () => { })
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
      const created = await model.create({ data: withOwnership(req, table, row) })
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

router.put('/:table/:id', async (req, res, next) => {
  try {
    const table = req.params.table
    const config = configFor(table)
    if (config.readOnly) return res.status(405).json({ error: 'This table is read-only' })
    if (config.adminWrite && !['admin', 'superadmin'].includes(req.profile.role)) {
      return requireAdmin(req, res, () => { })
    }

    if (table === 'jobs' && !canManageJobAssignment(req)) {
      delete req.body.assigned_to
    }

    const model = prisma[config.model]
    const current = await model.findFirst({ where: await scopedRowWhere(req, table, config, req.params.id) })
    if (!current) return res.status(404).json({ error: 'Record not found' })

    const data = await model.update({
      where: { id: req.params.id },
      data: withOwnership(req, table, req.body),
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
    if (config.adminWrite && !['admin', 'superadmin'].includes(req.profile.role)) {
      return requireAdmin(req, res, () => { })
    }

    const model = prisma[config.model]
    const current = await model.findFirst({ where: await scopedRowWhere(req, table, config, req.params.id) })
    if (!current) return res.status(404).json({ error: 'Record not found' })

    await model.delete({ where: { id: req.params.id } })
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
