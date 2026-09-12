import { ROLES, MODULES, getPermission } from '../../lib/admin/permissions'

// Icon SVGs inline — no extra dependencies
function CheckIcon({ size = 14, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8.5l3.5 3.5 6.5-7" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function EditIcon({ size = 13, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function EyeIcon({ size = 13, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <ellipse cx="8" cy="8" rx="6" ry="4" stroke={color} strokeWidth="1.6" />
      <circle cx="8" cy="8" r="1.5" fill={color} />
    </svg>
  )
}

const LEVEL_CONFIG = {
  full: {
    icon: (s) => <CheckIcon size={s} color="var(--green)" />,
    label: 'Full',
    color: 'var(--green)',
    bg: 'rgba(16,185,129,0.08)',
  },
  edit: {
    icon: (s) => <EditIcon size={s} color="var(--accent)" />,
    label: 'Edit',
    color: 'var(--accent)',
    bg: 'rgba(13,148,136,0.08)',
  },
  view: {
    icon: (s) => <EyeIcon size={s} color="var(--yellow)" />,
    label: 'View',
    color: 'var(--yellow)',
    bg: 'rgba(245,158,11,0.08)',
  },
  none: {
    icon: null,
    label: '—',
    color: 'var(--text3)',
    bg: 'transparent',
  },
}

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
            <th className="text-left text-text3 font-semibold uppercase tracking-wide pb-3 pr-4 whitespace-nowrap">Role</th>
            {MODULES.map(m => (
              <th key={m} className="text-center text-text3 font-semibold uppercase tracking-wide pb-3 px-2 whitespace-nowrap">
                {m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROLES.map((role, ri) => (
            <tr key={role.id} className="border-t border-border group">
              <td className="py-3 pr-4 align-middle">
                <div className="font-semibold text-text whitespace-nowrap">{role.label}</div>
                <div className="text-text3 text-[10px] max-w-[200px] mt-0.5 leading-snug">{role.description}</div>
              </td>
              {MODULES.map(m => {
                const level = getPermission(role.id, m)
                const cfg = LEVEL_CONFIG[level] || LEVEL_CONFIG.none
                return (
                  <td key={m} className="text-center py-3 px-2 align-middle">
                    {level === 'none' ? (
                      <span className="text-text3 text-xs select-none">—</span>
                    ) : (
                      <span
                        className="inline-flex flex-col items-center justify-center gap-0.5"
                        title={`${role.label}: ${cfg.label} access to ${m}`}
                      >
                        <span
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-transform duration-150 group-hover:scale-110"
                          style={{ background: cfg.bg }}
                        >
                          {cfg.icon(14)}
                        </span>
                        <span
                          className="text-[9px] font-semibold uppercase tracking-wide leading-none"
                          style={{ color: cfg.color }}
                        >
                          {cfg.label}
                        </span>
                      </span>
                    )}
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
