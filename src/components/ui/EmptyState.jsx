import { Icon } from './icons'
import { cn } from './utils'
import Button from './Button'

export default function EmptyState({ icon = 'inbox', title, description, action, actionLabel, onAction, className = '' }) {
  return (
    <div className={cn('relative flex flex-col items-center justify-center text-center gap-2.5 py-16 px-6', className)}>
      <span className="relative w-14 h-14 rounded-full bg-surface2 flex items-center justify-center text-text2 mb-2">
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
