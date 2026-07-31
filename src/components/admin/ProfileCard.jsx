import Avatar from '../ui/Avatar'
import Badge from '../ui/Badge'
import StatusBadge from './StatusBadge'

/**
 * A member/user row — avatar, name, email, department/team, role badge,
 * status, and trailing actions. Shared between the Teams and Users tabs so
 * a person looks the same everywhere in Settings.
 */
export default function ProfileCard({ name, email, roleLabel, department, team, status, actions }) {
  return (
    <div className="flex items-center gap-3 py-3 flex-wrap transition-colors duration-[var(--duration-fast)] hover:bg-surface2/50 -mx-2 px-2 rounded-[var(--radius-sm)]">
      <Avatar name={name || email || '?'} />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-text truncate">{name || 'Unnamed'}</div>
        <div className="text-xs text-text3 truncate mt-0.5">{email || 'No email on file'}</div>
      </div>
      {(department || team) && <span className="text-xs text-text3 hidden sm:block shrink-0">{[department, team].filter(Boolean).join(' · ')}</span>}
      {roleLabel && <Badge tone="accent" size="sm" className="shrink-0">{roleLabel}</Badge>}
      {status && <StatusBadge status={status} />}
      {actions && <div className="shrink-0 flex items-center gap-1.5">{actions}</div>}
    </div>
  )
}
