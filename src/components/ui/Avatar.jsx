import { cn } from './utils'

const SIZES = { xs: 'w-6 h-6 text-[10px]', sm: 'w-7 h-7 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-12 h-12 text-base' }
const PALETTE = ['#4f7cff', '#a855f7', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#7c5cff']

function colorFor(seed) {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

export default function Avatar({ name = '', src, size = 'md', status, className = '' }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase() || '?'
  return (
    <span className={cn('relative inline-flex shrink-0', SIZES[size] || SIZES.md, className)}>
      {src ? (
        <img src={src} alt={name} className="w-full h-full rounded-full object-cover" />
      ) : (
        <span
          className="w-full h-full rounded-full flex items-center justify-center font-bold text-white"
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
