import { hasModulePermission } from '../../shared/permissions.js'

export const SYSTEM_ROLES = ['SUPERADMIN', 'OWNER', 'ADMIN', 'RECRUITMENT_MANAGER', 'ACCOUNT_MANAGER', 'OPERATIONS_MANAGER', 'MANAGER', 'RECRUITER', 'HR_MANAGER', 'HR_TEAM', 'EMPLOYEE', 'VIEWER']
export const roleOf = req => String(req.memberRole || req.profile?.role || '').toUpperCase()
export const isCompanyAdmin = req => ['OWNER', 'ADMIN', 'SUPERADMIN'].includes(roleOf(req))
export function forbidden(message = 'Permission denied') { return Object.assign(new Error(message), { status: 403 }) }
export function assertModule(req, moduleName, level = 'view') {
  if (!hasModulePermission(roleOf(req), moduleName, level)) throw forbidden(`${level === 'view' ? 'View' : 'Edit'} access to ${moduleName} is required`)
}
export function requirePlatformAdmin(req, res, next) {
  if (!req.isPlatformAdmin) return res.status(403).json({ error: 'Platform Superadmin access required' })
  next()
}
export function assertRoleChange(req, targetRole, nextRole) {
  const next = String(nextRole || '').toUpperCase(), target = String(targetRole || '').toUpperCase()
  if (!SYSTEM_ROLES.includes(next)) throw Object.assign(new Error('Invalid member role'), { status: 400 })
  if (!isCompanyAdmin(req)) throw forbidden('Company administration access required')
  if ((next === 'SUPERADMIN' || target === 'SUPERADMIN') && !req.isPlatformAdmin) throw forbidden('Only a platform Superadmin can manage that role')
  if (roleOf(req) === 'ADMIN' && (next === 'OWNER' || target === 'OWNER')) throw forbidden('An Owner is required to manage company ownership')
  return next
}
export const TABLE_MODULES = { candidates: 'Candidates', jobs: 'Jobs', callbacks: 'Communication', followups: 'Communication', postings: 'Jobs', tasks: 'Tasks', task_comments: 'Tasks', activity_logs: 'Dashboard', submission_collisions: 'Candidates' }
