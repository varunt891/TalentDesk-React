import Badge from '../ui/Badge'
import { ROLES, MODULES, getPermission } from '../../lib/admin/permissions'

const LEVEL_TONE = { full: 'green', edit: 'accent', view: 'yellow', none: 'neutral' }
const LEVEL_LABEL = { full: 'Full', edit: 'Edit', view: 'View', none: '—' }

/**
 * Read-only render of the shared PERMISSION_MATRIX config
 * (src/lib/admin/permissions.js) — every role × module access level in one
 * grid. Not enforced server-side yet (no Role/Permission table exists);
 * this is the intended model, documented and centralized rather than
 * scattered across per-page role checks.
 */
export default function PermissionMatrix() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse min-w-[760px]">
        <thead>
          <tr>
            <th className="text-left text-text3 font-semibold uppercase tracking-wide pb-2 pr-3 whitespace-nowrap">Role</th>
            {MODULES.map(m => (
              <th key={m} className="text-center text-text3 font-semibold uppercase tracking-wide pb-2 px-1.5 whitespace-nowrap">{m}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROLES.map(role => (
            <tr key={role.id} className="border-t border-border">
              <td className="py-2.5 pr-3 align-top">
                <div className="font-semibold text-text whitespace-nowrap">{role.label}</div>
                <div className="text-text3 text-[10px] max-w-[220px]">{role.description}</div>
              </td>
              {MODULES.map(m => {
                const level = getPermission(role.id, m)
                return (
                  <td key={m} className="text-center py-2.5 px-1.5">
                    <Badge tone={LEVEL_TONE[level]} size="sm">{LEVEL_LABEL[level]}</Badge>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
