import { Icon } from './icons'
import { cn } from './utils'
import Button from './Button'

export default function EmptyState({ icon = 'inbox', title, description, action, actionLabel, onAction, className = '' }) {
  return (
    <div className={cn('relative flex flex-col items-center justify-center text-center gap-2.5 py-16 px-6', className)}>
      <span aria-hidden="true" className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-6 w-32 h-32 rounded-full opacity-[0.14] blur-[48px] bg-accent" />
      <span className="relative w-14 h-14 rounded-[var(--radius-lg)] bg-gradient-to-br from-accent/15 via-surface2 to-ai/10 border border-border shadow-[0_8px_20px_-8px_color-mix(in_srgb,var(--accent)_35%,transparent)] flex items-center justify-center text-accent mb-1.5">
        <Icon name={icon} size={22} strokeWidth={1.8} />
      </span>
      <h3 className="relative text-[13.5px] font-bold text-text tracking-tight">{title}</h3>
      {description && <p className="text-[12.5px] text-text3 max-w-sm leading-relaxed">{description}</p>}
      {action || (actionLabel && (
        <Button size="sm" variant="secondary" className="mt-3" onClick={onAction}>
          {actionLabel}
        </Button>
      ))}
    </div>
  )
}
