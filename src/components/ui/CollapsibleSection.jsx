import { useState } from 'react'
import { Icon } from './icons'
import { cn } from './utils'
import Badge from './Badge'
import { Card } from './Card'

const DOT_TONE = { red: 'var(--red)', green: 'var(--green)', accent: 'var(--accent)', yellow: 'var(--yellow)', neutral: 'var(--text3)' }

/**
 * A collapsible, badge-counted section inside a Card — the pattern
 * originally built independently for Tasks (TaskSection) and Communication
 * (CommSection). Shared here so new pages (starting with AI Center) don't
 * reintroduce it a third time.
 */
export default function CollapsibleSection({ title, subtitle, count, tone = 'neutral', action, children, loading, defaultOpen = true, className = '' }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Card className={className}>
      <div className="flex items-center justify-between gap-3 mb-3.5">
        <button type="button" onClick={() => setOpen(o => !o)} className="focus-ring flex-1 min-w-0 flex items-center justify-between gap-3 text-left rounded-[var(--radius-sm)] group/collapsible">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: DOT_TONE[tone] || DOT_TONE.neutral, boxShadow: `0 0 0 3px ${DOT_TONE[tone] || DOT_TONE.neutral}1f` }} />
            <div className="min-w-0">
              <h3 className="text-[13px] font-bold text-text tracking-tight truncate">{title}</h3>
              {subtitle && <p className="text-xs text-text3 mt-0.5">{subtitle}</p>}
            </div>
            {typeof count === 'number' && <Badge size="sm" tone="neutral">{count}</Badge>}
          </div>
          <Icon name={open ? 'chevronUp' : 'chevronDown'} size={14} className="text-text3 shrink-0 transition-colors duration-[var(--duration-fast)] group-hover/collapsible:text-text" />
        </button>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {open && (loading ? <div className="text-xs text-text3 py-6 text-center">Loading...</div> : <div className={cn('flex flex-col gap-2')}>{children}</div>)}
    </Card>
  )
}
