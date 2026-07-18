import { Router } from 'express'
import { requireAdmin, requireAuth } from '../auth.js'
import { prisma } from '../prisma.js'

const router = Router()

const tables = {
  organizations: { model: 'organization', orgScoped: false, adminWrite: true },
  profiles: { model: 'profile', orgScoped: true, adminWrite: true },
  candidates: { model: 'candidate', orgScoped: true },
  jobs: { model: 'job', orgScoped: true },
  callbacks: { model: 'callback', orgScoped: true },
  followups: { model: 'followup', orgScoped: true },
  postings: { model: 'posting', orgScoped: true },
  user_invitations: { model: 'userInvitation', orgScoped: true, adminWrite: true },
  admin_audit_log: { model: 'adminAuditLog', orgScoped: true, adminWrite: true },
  activity_logs: { model: 'activityLog', orgScoped: true, readOnly: true },
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

async function visibleOwnerIds(req) {
  if (['admin', 'superadmin'].includes(req.profile.role)) return null

  if (req.profile.role === 'manager') {
    const reports = await prisma.profile.findMany({
      where: { org_id: req.profile.org_id, OR: [{ manager_id: req.user.id }, { id: req.user.id }] },
      select: { id: true },
    })
    return reports.map(report => report.id)
  }

  if (req.profile.role === 'recruiter') return [req.user.id]
  return [req.user.id]
}

async function buildWhere(req, table, config) {
  const filters = req.query.filter ? JSON.parse(req.query.filter) : []
  const where = {}

  for (const filter of filters) {
    if (filter.op === 'eq') where[filter.column] = coerce(filter.value)
  }

  if (config.orgScoped) {
    where.org_id = req.profile.org_id
  }

  if (ownedTables.includes(table)) {
    const ownerIds = await visibleOwnerIds(req)
    if (ownerIds) where.user_id = { in: ownerIds }
  }

  if (table === 'profiles') {
    if (req.profile.role === 'manager') {
      where.OR = [{ manager_id: req.user.id }, { id: req.user.id }]
    }
    if (!['admin', 'superadmin', 'manager'].includes(req.profile.role)) {
      where.id = req.user.id
    }
  }

  return where
}

async function scopedRowWhere(req, table, config, id) {
  const where = { id }

  if (config.orgScoped) {
    where.org_id = req.profile.org_id
  }

  if (ownedTables.includes(table)) {
    const ownerIds = await visibleOwnerIds(req)
    if (ownerIds) where.user_id = { in: ownerIds }
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

  if (ownedTables.includes(table)) {
    data.user_id ||= req.user.id
    data.org_id ||= req.profile.org_id
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
      org_id: req.profile.org_id,
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

router.get('/:table', async (req, res, next) => {
  try {
    const table = req.params.table
    const config = configFor(table)
    const model = prisma[config.model]
    const rows = await model.findMany({
      where: await buildWhere(req, table, config),
      orderBy: buildOrder(req),
    })

    res.json({ data: sanitize(table, rows) })
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
      return requireAdmin(req, res, () => {})
    }

    const model = prisma[config.model]
    const rows = Array.isArray(req.body) ? req.body : [req.body]
    const data = []

    for (const row of rows) {
      const created = await model.create({ data: withOwnership(req, table, row) })
      await logActivity(req, 'created', table, created)
      data.push(created)
    }

    res.status(201).json({ data: sanitize(table, data) })
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
      return requireAdmin(req, res, () => {})
    }

    const model = prisma[config.model]
    const current = await model.findFirst({ where: await scopedRowWhere(req, table, config, req.params.id) })
    if (!current) return res.status(404).json({ error: 'Record not found' })

    const data = await model.update({
      where: { id: req.params.id },
      data: withOwnership(req, table, req.body),
    })
    await logActivity(req, 'updated', table, data, { updates: req.body })
    res.json({ data: sanitize(table, [data]) })
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
      return requireAdmin(req, res, () => {})
    }

    const model = prisma[config.model]
    const current = await model.findFirst({ where: await scopedRowWhere(req, table, config, req.params.id) })
    if (!current) return res.status(404).json({ error: 'Record not found' })

    await model.delete({ where: { id: req.params.id } })
    await logActivity(req, 'deleted', table, current)
    res.json({ data: null })
  } catch (err) {
    next(err)
  }
})

export default router
