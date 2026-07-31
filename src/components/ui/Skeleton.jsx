import { Icon } from './icons'
import { cn } from './utils'

export function Skeleton({ className = '' }) {
  return <div className={cn('skeleton-shimmer rounded-[var(--radius-sm)]', className)} />
}

export function SkeletonText({ lines = 3, className = '' }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn('h-3', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  )
}

const SPINNER_SIZE = { sm: 14, md: 20, lg: 28 }

export function Spinner({ size = 'md', className = '' }) {
  return (
    <Icon
      name="loader"
      size={SPINNER_SIZE[size] || SPINNER_SIZE.md}
      strokeWidth={3}
      className={cn('animate-spin text-accent', className)}
    />
  )
}

export function PageSpinner({ label = 'Loading...' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-text3">
      <Spinner size="lg" />
      <span className="text-xs font-semibold">{label}</span>
    </div>
  )
}
