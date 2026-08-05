// Frontend mirror of the backend's JOB_CREATE_ROLES allow-list
// (server/src/routes/data.routes.js). Frontend profile.role arrives lowercase
// (see AuthContext/session), unlike the backend's always-uppercase
// req.memberRole — keep this normalized to lowercase, don't copy the backend's
// uppercase idiom here.
const JOB_MANAGE_ROLES = ['account_manager', 'recruitment_manager', 'operations_manager', 'manager', 'admin', 'superadmin', 'owner']

export function canManageJobAssignment(role) {
  return JOB_MANAGE_ROLES.includes((role || '').toLowerCase())
}
