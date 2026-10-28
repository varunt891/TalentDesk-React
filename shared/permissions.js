// Shared UI and API authorization levels. Changing a level changes both surfaces.
const NONE = 'none', VIEW = 'view', EDIT = 'edit', FULL = 'full'
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
export function hasModulePermission(role, moduleName, minimum = 'view') {
  const levels = ['none', 'view', 'edit', 'full']
  return levels.indexOf(PERMISSION_MATRIX[String(role || '').toUpperCase()]?.[moduleName] || 'none') >= levels.indexOf(minimum)
}
