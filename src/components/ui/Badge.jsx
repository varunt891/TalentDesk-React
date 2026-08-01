import { cn } from './utils'

const TONES = {
  neutral: 'bg-surface3 text-text2',
  accent: 'bg-accent/12 text-accent',
  green: 'bg-green/12 text-green',
  yellow: 'bg-yellow/12 text-yellow',
  orange: 'bg-orange/12 text-orange',
  red: 'bg-red/12 text-red',
  ai: 'bg-ai-soft text-ai',
}

export default function Badge({ tone = 'neutral', size = 'md', dot = false, className = '', children }) {
  const sizeCls = size === 'sm' ? 'text-[10px] px-1.5 py-px gap-1' : size === 'xs' ? 'text-[9px] px-1 py-px gap-0.5' : 'text-[11px] px-1.5 py-0.5 gap-1'
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-bold uppercase tracking-wide leading-none whitespace-nowrap',
        TONES[tone] || TONES.neutral,
        sizeCls,
        className
      )}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />}
      {children}
    </span>
  )
}

// Best-effort status -> tone map for common recruiting workflow states.
// Pages can pass an explicit `tone` to override when their vocabulary differs.
// Purple/`ai` is reserved for AI-generated or AI-authored content only — it
// never appears here as a generic workflow-status color, so it stays a
// reliable visual signal for "AI touched this" everywhere else in the app.
const STATUS_TONE_MAP = {
  active: 'green', hired: 'green', completed: 'green', approved: 'green', won: 'green', open: 'green',
  pending: 'yellow', 'on hold': 'yellow', screening: 'yellow', review: 'yellow', waiting: 'yellow',
  interview: 'accent', 'in progress': 'accent', submitted: 'accent', scheduled: 'accent', applied: 'accent', shortlisted: 'accent',
  offer: 'orange',
  overdue: 'red', rejected: 'red', closed: 'red', cancelled: 'red', failed: 'red',
  draft: 'neutral', inactive: 'neutral', archived: 'neutral',
}

export function statusTone(status) {
  const key = String(status || '').trim().toLowerCase()
  return STATUS_TONE_MAP[key] || 'neutral'
}

const DOT_COLOR = {
  green:   '#16a34a',
  accent:  '#3b82f6',
  yellow:  '#f59e0b',
  orange:  '#f97316',
  red:     '#ef4444',
  ai:      '#8b5cf6',
  neutral: '#94a3b8',
}

const TEXT_COLOR = {
  green:   'var(--green)',
  accent:  'var(--accent)',
  yellow:  'var(--yellow)',
  orange:  'var(--orange)',
  red:     'var(--red)',
  ai:      'var(--ai)',
  neutral: 'var(--text2)',
}

export function StatusPill({ status, label, tone, size = 'sm', className = '' }) {
  const resolvedTone = tone || statusTone(status)
  const dot = DOT_COLOR[resolvedTone] || DOT_COLOR.neutral
  const textColor = TEXT_COLOR[resolvedTone] || TEXT_COLOR.neutral
  const textSize = size === 'xs' ? 'text-[9px]' : size === 'sm' ? 'text-[11px]' : 'text-[12px]'

  return (
    <span
      className={cn('inline-flex items-center gap-1.5 font-medium whitespace-nowrap', textSize, className)}
      style={{ color: textColor }}
    >
      <span className="rounded-full shrink-0" style={{ width: 7, height: 7, background: dot }} />
      {label || status}
    </span>
  )
}
