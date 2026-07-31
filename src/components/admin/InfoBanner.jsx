import { Icon } from '../ui/icons'
import { cn } from '../ui/utils'

const TONE_CLS = {
  info: 'bg-accent/8 border-accent/20',
  warn: 'bg-yellow/8 border-yellow/20',
  neutral: 'bg-surface2 border-border',
}

/**
 * Inline disclosure banner — used throughout Settings to honestly flag
 * graceful placeholders (features saved as preferences but not yet
 * enforced, or not backed by any table yet) instead of presenting them as
 * if they fully work.
 */
export default function InfoBanner({ tone = 'info', icon = 'info', children, className = '' }) {
  return (
    <div className={cn('flex items-start gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-xs leading-relaxed', TONE_CLS[tone] || TONE_CLS.neutral, className)}>
      <Icon name={icon} size={14} className="shrink-0 mt-0.5 text-text2" />
      <div className="text-text2">{children}</div>
    </div>
  )
}
