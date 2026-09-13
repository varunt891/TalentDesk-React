import Avatar from '../ui/Avatar'
import Badge from '../ui/Badge'
import StatusBadge from './StatusBadge'
import { cn } from '../ui'

/**
 * A member/user row — fully responsive two-row layout so names are never
 * truncated to 1–2 characters in narrow containers (modal, mobile).
 *
 * Row 1:  [Avatar]  Name · dept/team pill          [role badge] [status]
 * Row 2 (xs only):  email
 */
export default function ProfileCard({ name, email, roleLabel, department, team, status, actions, className }) {
  const deptTeam = [department, team].filter(Boolean).join(' · ')

  return (
    <div
      className={cn(
        'flex items-start gap-3 py-3',
        'transition-colors duration-[var(--duration-fast)]',
        'hover:bg-surface2/50 -mx-2 px-2 rounded-[var(--radius-sm)]',
        className
      )}
    >
      {/* Avatar */}
      <Avatar name={name || email || '?'} className="shrink-0 mt-0.5" />

      {/* Body */}
      <div className="min-w-0 flex-1">
        {/* Top line: name + optional dept pill */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-semibold text-text leading-snug break-words">
            {name || 'Unnamed User'}
          </span>
          {deptTeam && (
            <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-surface3 text-text3 whitespace-nowrap shrink-0">
              {deptTeam}
            </span>
          )}
        </div>
        {/* Email */}
        <div className="text-[11px] text-text3 mt-0.5 truncate leading-snug" title={email || ''}>
          {email || 'No email on file'}
        </div>
      </div>

      {/* Right side: role + status + actions */}
      <div className="flex flex-col items-end gap-1.5 shrink-0 pt-0.5">
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {roleLabel && <Badge tone="accent" size="sm">{roleLabel}</Badge>}
          {status && <StatusBadge status={status} />}
        </div>
        {actions && <div className="flex items-center gap-1">{actions}</div>}
      </div>
    </div>
  )
}
