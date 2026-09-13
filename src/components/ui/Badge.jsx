import { cn } from './utils'

// Color config — soft tinted background + text + border per tone
const TONES = {
  neutral: {
    bg: 'color-mix(in srgb, var(--text3) 12%, var(--surface))',
    text: 'var(--text2)',
    border: 'color-mix(in srgb, var(--text3) 25%, transparent)',
    dot: 'var(--text3)',
  },
  accent: {
    bg: 'color-mix(in srgb, var(--accent) 12%, var(--surface))',
    text: 'var(--accent)',
    border: 'color-mix(in srgb, var(--accent) 30%, transparent)',
    dot: 'var(--accent)',
  },
  green: {
    bg: 'color-mix(in srgb, var(--green) 12%, var(--surface))',
    text: 'var(--green)',
    border: 'color-mix(in srgb, var(--green) 30%, transparent)',
    dot: 'var(--green)',
  },
  yellow: {
    bg: 'color-mix(in srgb, var(--yellow) 14%, var(--surface))',
    text: 'var(--yellow)',
    border: 'color-mix(in srgb, var(--yellow) 30%, transparent)',
    dot: 'var(--yellow)',
  },
  orange: {
    bg: 'color-mix(in srgb, var(--orange) 14%, var(--surface))',
    text: 'var(--orange)',
    border: 'color-mix(in srgb, var(--orange) 30%, transparent)',
    dot: 'var(--orange)',
  },
  red: {
    bg: 'color-mix(in srgb, var(--red) 12%, var(--surface))',
    text: 'var(--red)',
    border: 'color-mix(in srgb, var(--red) 30%, transparent)',
    dot: 'var(--red)',
  },
  ai: {
    bg: 'color-mix(in srgb, var(--ai) 12%, var(--surface))',
    text: 'var(--ai)',
    border: 'color-mix(in srgb, var(--ai) 30%, transparent)',
    dot: 'var(--ai)',
  },
}

export default function Badge({ tone = 'neutral', size = 'sm', dot = false, className = '', children }) {
  const colors = TONES[tone] || TONES.neutral
  const sizeClasses =
    size === 'xs'
      ? 'text-[10px] px-1.5 py-0.5'
      : size === 'sm'
      ? 'text-[11px] px-2.5 py-0.5'
      : 'text-[12px] px-3 py-1'
  const dotSize = size === 'xs' ? 5 : 6

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-semibold rounded-full border whitespace-nowrap leading-none transition-colors select-none max-w-full shrink-0',
        sizeClasses,
        className
      )}
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        borderColor: colors.border,
      }}
    >
      {dot && (
        <span
          className="shrink-0 rounded-full"
          style={{ width: dotSize, height: dotSize, background: colors.dot }}
        />
      )}
      <span className="truncate max-w-full">{children}</span>
    </span>
  )
}

// ── Status tone map ────────────────────────────────────────────────────────────
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

// ── StatusPill ────────────────────────────────────────────────────────────────
export function StatusPill({ status, label, tone, size = 'sm', className = '' }) {
  const resolvedTone = tone || statusTone(status)
  return (
    <Badge tone={resolvedTone} size={size} className={className}>
      {label || status}
    </Badge>
  )
}
