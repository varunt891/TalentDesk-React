import { cn } from './utils'
import { CHART_COLORS } from '../../lib/chartColors'
import Tooltip from './Tooltip'

const SIZES = { xs: 'w-6 h-6 text-[10px]', sm: 'w-7 h-7 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-12 h-12 text-base' }

function colorFor(seed) {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  return CHART_COLORS[Math.abs(hash) % CHART_COLORS.length]
}

export default function Avatar({ name = '', src, size = 'md', status, className = '' }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase() || '?'
  return (
    <span className={cn('relative inline-flex shrink-0 select-none', SIZES[size] || SIZES.md, className)}>
      {src ? (
        <img src={src} alt={name} className="w-full h-full rounded-full object-cover" />
      ) : (
        <span
          className="w-full h-full rounded-full flex items-center justify-center font-bold text-white select-none"
          style={{ background: colorFor(name || 'U') }}
        >
          {initials}
        </span>
      )}
      {status && (
        <span
          className={cn(
            'absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-surface',
            status === 'online' ? 'bg-green' : status === 'busy' ? 'bg-red' : 'bg-text3'
          )}
        />
      )}
    </span>
  )
}

export function AvatarGroup({ members = [], max = 5, size = 'sm', className = '', onMemberClick, onOverflowClick }) {
  if (!members || members.length === 0) return null
  const visible = members.slice(0, max)
  const remaining = members.length - max

  const badgeSizeClass =
    size === 'xs'
      ? 'h-6 min-w-[1.6rem] text-[9px] px-1'
      : size === 'sm'
      ? 'h-7 min-w-[1.85rem] text-[10px] px-1.5'
      : 'h-9 min-w-[2.25rem] text-xs px-2'

  return (
    <div className={cn('flex items-center -space-x-2 shrink-0 overflow-visible py-0.5', className)}>
      {visible.map((m, idx) => {
        const name = m.full_name || m.name || m.email || 'Member'
        const role = m.role ? ` (${m.role.replace(/_/g, ' ')})` : ''
        return (
          <Tooltip key={m.id || m.email || idx} label={`${name}${role}`}>
            <span
              onClick={() => onMemberClick?.(m)}
              className="inline-flex shrink-0 transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:scale-110 hover:z-20 cursor-pointer shadow-xs rounded-full"
            >
              <Avatar
                name={name}
                src={m.avatar_url || m.src}
                size={size}
                className="ring-2 ring-surface shrink-0"
              />
            </span>
          </Tooltip>
        )
      })}
      {remaining > 0 && (
        <Tooltip label={`Click to view all ${members.length} members`}>
          <span
            onClick={onOverflowClick}
            className={cn(
              'shrink-0 rounded-full bg-surface2 hover:bg-surface3 text-text font-bold flex items-center justify-center ring-2 ring-surface select-none shadow-2xs transition-all duration-150 hover:-translate-y-0.5 hover:scale-105 hover:z-20 cursor-pointer',
              badgeSizeClass
            )}
          >
            +{remaining}
          </span>
        </Tooltip>
      )}
    </div>
  )
}
