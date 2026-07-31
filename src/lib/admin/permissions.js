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

export const ROLES = [
  { id: 'ADMIN', label: 'Organization Admin', description: 'Full access to every module, billing, and organization settings.' },
  { id: 'RECRUITMENT_MANAGER', label: 'Recruiting Manager', description: 'Manages recruiters, jobs, and pipeline strategy across the team.' },
  { id: 'RECRUITER', label: 'Recruiter', description: 'Day-to-day candidate sourcing, submissions, and pipeline management.' },
  { id: 'HR_TEAM', label: 'Coordinator', description: 'Supports scheduling, communication, and candidate coordination.' },
  { id: 'HR_MANAGER', label: 'Hiring Manager', description: "Reviews candidates and pipeline for their own team's requisitions." },
  { id: 'VIEWER', label: 'Read Only', description: 'Can view workspace data without making changes.' },
]

export const MODULES = ['Dashboard', 'Candidates', 'Jobs', 'Pipeline', 'Tasks', 'Communication', 'AI', 'Reports', 'Administration', 'Settings']

const { NONE, VIEW, EDIT, FULL } = LEVELS
export const PERMISSION_MATRIX = {
  ADMIN: { Dashboard: FULL, Candidates: FULL, Jobs: FULL, Pipeline: FULL, Tasks: FULL, Communication: FULL, AI: FULL, Reports: FULL, Administration: FULL, Settings: FULL },
  RECRUITMENT_MANAGER: { Dashboard: FULL, Candidates: FULL, Jobs: FULL, Pipeline: FULL, Tasks: FULL, Communication: FULL, AI: EDIT, Reports: FULL, Administration: VIEW, Settings: VIEW },
  RECRUITER: { Dashboard: VIEW, Candidates: EDIT, Jobs: EDIT, Pipeline: EDIT, Tasks: EDIT, Communication: EDIT, AI: EDIT, Reports: VIEW, Administration: NONE, Settings: NONE },
  HR_TEAM: { Dashboard: VIEW, Candidates: EDIT, Jobs: VIEW, Pipeline: EDIT, Tasks: EDIT, Communication: EDIT, AI: VIEW, Reports: VIEW, Administration: NONE, Settings: NONE },
  HR_MANAGER: { Dashboard: VIEW, Candidates: VIEW, Jobs: VIEW, Pipeline: VIEW, Tasks: NONE, Communication: VIEW, AI: NONE, Reports: VIEW, Administration: NONE, Settings: NONE },
  VIEWER: { Dashboard: VIEW, Candidates: VIEW, Jobs: VIEW, Pipeline: VIEW, Tasks: VIEW, Communication: VIEW, AI: NONE, Reports: VIEW, Administration: NONE, Settings: NONE },
}

export function getRole(id) {
  const key = (id || '').toUpperCase()
  return ROLES.find(r => r.id === key) || null
}

export function getPermission(role, moduleName) {
  const key = (role || '').toUpperCase()
  return PERMISSION_MATRIX[key]?.[moduleName] || NONE
}

export function hasPermission(role, moduleName, minLevel = VIEW) {
  return ORDER.indexOf(getPermission(role, moduleName)) >= ORDER.indexOf(minLevel)
}
