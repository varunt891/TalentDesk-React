import { Icon } from './icons'
import { cn } from './utils'
import Button from './Button'

export default function EmptyState({ icon = 'inbox', title, description, action, actionLabel, onAction, className = '' }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center gap-2.5 py-16 px-6', className)}>
      <span className="w-12 h-12 rounded-[var(--radius-lg)] bg-surface2 border border-border shadow-xs flex items-center justify-center text-text3 mb-1.5">
        <Icon name={icon} size={20} strokeWidth={1.8} />
      </span>
      <h3 className="text-[13.5px] font-bold text-text tracking-tight">{title}</h3>
      {description && <p className="text-[12.5px] text-text3 max-w-sm leading-relaxed">{description}</p>}
      {action || (actionLabel && (
        <Button size="sm" variant="secondary" className="mt-3" onClick={onAction}>
          {actionLabel}
        </Button>
      ))}
    </div>
  )
}
