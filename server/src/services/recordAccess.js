import { prisma } from '../prisma.js'
export const ownedTables = ['candidates', 'jobs', 'callbacks', 'followups', 'postings']
function coerce(value) { return value === 'true' ? true : value === 'false' ? false : value === 'null' ? null : value }
async function getDescendantProfileIds(managerId, orgId) {
  const allOrgProfiles = await prisma.profile.findMany({
    where: { memberships: { some: { organization_id: orgId, status: 'ACTIVE' } } },
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
    where: { memberships: { some: { organization_id: orgId, status: 'ACTIVE' } }, OR: whereConditions },
    select: { id: true },
  })
  return teamProfiles.map(p => p.id)
}

function isRMRole(profile) {
  if (!profile) return false
  const role = String(profile.role || '').toLowerCase()
  if (['recruitment_manager', 'operations_manager', 'hr_manager'].includes(role)) return true
  if (String(profile.role || '').toLowerCase() === 'manager' && !profile.manager_id) return true
  return false
}

function isAMRole(profile) {
  if (!profile) return false
  if (String(profile.role || '').toLowerCase() === 'account_manager') return true
  if (String(profile.role || '').toLowerCase() === 'manager' && !!profile.manager_id) return true
  return false
}

// req.profile.role / req.memberRole are always the UPPERCASE OrganizationMember
// role (requireAuth overwrites profile.role with it) — unlike isRMRole/isAMRole
// above, this compares uppercase-to-uppercase deliberately.
const JOB_CREATE_ROLES = ['ACCOUNT_MANAGER', 'RECRUITMENT_MANAGER', 'OPERATIONS_MANAGER', 'MANAGER', 'ADMIN', 'SUPERADMIN', 'OWNER']
export function canManageJobAssignment(req) {
  const role = (req.memberRole || req.profile?.role || '').toUpperCase()
  return JOB_CREATE_ROLES.includes(role)
}

export async function visibleOwnerIds(req) {
  const role = (req.memberRole || req.profile?.role || '').toLowerCase()
  if (['admin', 'superadmin', 'owner', 'viewer'].includes(role)) return null

  if (isRMRole(req.profile)) {
    return await getDescendantProfileIds(req.user.id, (req.organizationId || req.profile.org_id))
  }

  if (isAMRole(req.profile)) {
    return await getDirectTeamProfileIds(req.user.id, req.profile.org_id, req.profile.team)
  }

  return [req.user.id]
}

function isSuperAdminUser(req) {
  return req.isPlatformAdmin === true
}

export async function buildWhere(req, table, config) {
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
    where.org_id = requestedOrgId !== undefined ? coerce(requestedOrgId) : (req.organizationId || req.tenantOrg?.id || (req.organizationId || req.profile.org_id))
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
      const allowedIds = await getDescendantProfileIds(req.user.id, req.organizationId || (req.organizationId || req.profile.org_id))
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

  if (table === 'notifications') where.user_id = req.user.id
  if (table === 'organizations' && !isSuper) where.id = req.organizationId
  if (table === 'task_comments') where.task = await buildWhere({ ...req, query: {} }, 'tasks', { orgScoped: true })
  if (table === 'profiles') {
    delete where.org_id
    where.memberships = { some: { organization_id: requestedOrgId !== undefined ? coerce(requestedOrgId) : req.organizationId, status: { not: 'REVOKED' } } }
  }

  return where
}

export async function scopedRowWhere(req, table, config, id) {
  const where = { id }

  if (['tasks', 'task_comments', 'notifications', 'profiles'].includes(table)) return { ...await buildWhere({ ...req, query: {} }, table, config), id }
  if (table === 'organizations' && !isSuperAdminUser(req) && id !== req.organizationId) return { id: '00000000-0000-0000-0000-000000000000' }

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
