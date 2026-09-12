// Phase 6 — the reusable Roles & Permissions architecture. Pure
// configuration, no UI, no server calls: a single source of truth for
// "what can this role do" that the rest of the app can grow into. Role ids
// are the REAL uppercase values already used by OrganizationMember.role /
// server/src/auth.js's mapProfileRole() — nothing invented here. Not yet
// enforced server-side (no Role/Permission table exists), so this
// currently governs UI presentation only; hasPermission() is the one
// function future code should call instead of scattering
// `profile.role === '...'` checks throughout the UI.
export const LEVELS = { NONE: 'none', VIEW: 'view', EDIT: 'edit', FULL: 'full' }
const ORDER = [LEVELS.NONE, LEVELS.VIEW, LEVELS.EDIT, LEVELS.FULL]

export const ALL_SYSTEM_ROLES = [
  { value: 'OWNER', label: 'Owner', desc: 'Full billing, user, and workspace administration' },
  { value: 'ADMIN', label: 'Admin', desc: 'Manage users, team members, and view reports' },
  { value: 'RECRUITMENT_MANAGER', label: 'Recruitment Manager', desc: 'Manage recruiters, requisitions, and teams' },
  { value: 'ACCOUNT_MANAGER', label: 'Account Manager', desc: 'Client relations and team job requisitions' },
  { value: 'RECRUITER', label: 'Recruiter', desc: 'Manage candidates, jobs, submissions, and AI tools' },
  { value: 'HR_MANAGER', label: 'HR Manager', desc: 'Manage HR team and hiring workflow' },
  { value: 'HR_TEAM', label: 'HR Team Member', desc: 'HR operations reporting to HR Manager' },
  { value: 'OPERATIONS_MANAGER', label: 'Operations Manager', desc: 'Operations management and team coordination' },
  { value: 'MANAGER', label: 'Manager', desc: 'Departmental management' },
  { value: 'EMPLOYEE', label: 'Employee', desc: 'General employee member' },
  { value: 'VIEWER', label: 'Viewer', desc: 'Read-only access across company records' },
  { value: 'SUPERADMIN', label: 'Super Admin', desc: 'Cross-tenant platform administration' },
]

export const ROLES = [
  { id: 'OWNER', label: 'Owner', description: 'Full billing, user, and workspace administration.' },
  { id: 'ADMIN', label: 'Organization Admin', description: 'Full access to every module, user management, and organization settings.' },
  { id: 'RECRUITMENT_MANAGER', label: 'Recruiting Manager', description: 'Manages recruiters, jobs, and pipeline strategy across the team.' },
  { id: 'ACCOUNT_MANAGER', label: 'Account Manager', description: 'Client relations and team job requisitions.' },
  { id: 'RECRUITER', label: 'Recruiter', description: 'Day-to-day candidate sourcing, submissions, and pipeline management.' },
  { id: 'HR_MANAGER', label: 'HR Manager', description: "Reviews candidates and pipeline for their own team's requisitions." },
  { id: 'HR_TEAM', label: 'HR Team Member', description: 'Supports scheduling, communication, and candidate coordination.' },
  { id: 'OPERATIONS_MANAGER', label: 'Operations Manager', description: 'Operations management and team coordination.' },
  { id: 'MANAGER', label: 'Manager', description: 'Departmental management.' },
  { id: 'EMPLOYEE', label: 'Employee', description: 'General employee workspace member.' },
  { id: 'VIEWER', label: 'Read Only', description: 'Can view workspace data without making changes.' },
  { id: 'SUPERADMIN', label: 'Super Admin', description: 'Cross-tenant platform administration.' },
]

export const MODULES = ['Dashboard', 'Candidates', 'Jobs', 'Pipeline', 'Tasks', 'Communication', 'AI', 'Reports', 'Administration', 'Settings']

const { NONE, VIEW, EDIT, FULL } = LEVELS
export const PERMISSION_MATRIX = {
  OWNER: { Dashboard: FULL, Candidates: FULL, Jobs: FULL, Pipeline: FULL, Tasks: FULL, Communication: FULL, AI: FULL, Reports: FULL, Administration: FULL, Settings: FULL },
  SUPERADMIN: { Dashboard: FULL, Candidates: FULL, Jobs: FULL, Pipeline: FULL, Tasks: FULL, Communication: FULL, AI: FULL, Reports: FULL, Administration: FULL, Settings: FULL },
  ADMIN: { Dashboard: FULL, Candidates: FULL, Jobs: FULL, Pipeline: FULL, Tasks: FULL, Communication: FULL, AI: FULL, Reports: FULL, Administration: FULL, Settings: FULL },
  RECRUITMENT_MANAGER: { Dashboard: FULL, Candidates: FULL, Jobs: FULL, Pipeline: FULL, Tasks: FULL, Communication: FULL, AI: EDIT, Reports: FULL, Administration: VIEW, Settings: VIEW },
  ACCOUNT_MANAGER: { Dashboard: FULL, Candidates: FULL, Jobs: FULL, Pipeline: FULL, Tasks: FULL, Communication: FULL, AI: EDIT, Reports: FULL, Administration: VIEW, Settings: VIEW },
  OPERATIONS_MANAGER: { Dashboard: FULL, Candidates: FULL, Jobs: FULL, Pipeline: FULL, Tasks: FULL, Communication: FULL, AI: EDIT, Reports: FULL, Administration: VIEW, Settings: VIEW },
  MANAGER: { Dashboard: FULL, Candidates: FULL, Jobs: FULL, Pipeline: FULL, Tasks: FULL, Communication: FULL, AI: EDIT, Reports: FULL, Administration: VIEW, Settings: VIEW },
  RECRUITER: { Dashboard: VIEW, Candidates: EDIT, Jobs: EDIT, Pipeline: EDIT, Tasks: EDIT, Communication: EDIT, AI: EDIT, Reports: VIEW, Administration: NONE, Settings: NONE },
  HR_TEAM: { Dashboard: VIEW, Candidates: EDIT, Jobs: VIEW, Pipeline: EDIT, Tasks: EDIT, Communication: EDIT, AI: VIEW, Reports: VIEW, Administration: NONE, Settings: NONE },
  HR_MANAGER: { Dashboard: VIEW, Candidates: VIEW, Jobs: VIEW, Pipeline: VIEW, Tasks: NONE, Communication: VIEW, AI: NONE, Reports: VIEW, Administration: NONE, Settings: NONE },
  EMPLOYEE: { Dashboard: VIEW, Candidates: VIEW, Jobs: VIEW, Pipeline: VIEW, Tasks: EDIT, Communication: EDIT, AI: VIEW, Reports: VIEW, Administration: NONE, Settings: NONE },
  VIEWER: { Dashboard: VIEW, Candidates: VIEW, Jobs: VIEW, Pipeline: VIEW, Tasks: VIEW, Communication: VIEW, AI: NONE, Reports: VIEW, Administration: NONE, Settings: NONE },
}

export function getRole(id) {
  const key = (id || '').toUpperCase()
  const systemRole = ALL_SYSTEM_ROLES.find(r => r.value === key)
  if (systemRole) return { id: systemRole.value, label: systemRole.label, description: systemRole.desc }
  return ROLES.find(r => r.id === key) || null
}

export function getPermission(role, moduleName) {
  const key = (role || '').toUpperCase()
  return PERMISSION_MATRIX[key]?.[moduleName] || NONE
}

export function hasPermission(role, moduleName, minLevel = VIEW) {
  return ORDER.indexOf(getPermission(role, moduleName)) >= ORDER.indexOf(minLevel)
}
