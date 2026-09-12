import { cn } from './utils'

// Color config — dot color + text color per tone
const TONES = {
  neutral: { dot: 'var(--text3)',    text: 'var(--text3)' },
  accent:  { dot: 'var(--accent)',   text: 'var(--accent)' },
  green:   { dot: 'var(--green)',    text: 'var(--green)' },
  yellow:  { dot: 'var(--yellow)',   text: 'var(--yellow)' },
  orange:  { dot: 'var(--orange)',   text: 'var(--orange)' },
  red:     { dot: 'var(--red)',      text: 'var(--red)' },
  ai:      { dot: 'var(--ai)',       text: 'var(--ai)' },
}

export default function Badge({ tone = 'neutral', size = 'md', dot = true, className = '', children }) {
  const colors = TONES[tone] || TONES.neutral
  const textSize = size === 'xs' ? 'text-[9px]' : size === 'sm' ? 'text-[10px]' : 'text-[11px]'
  const dotSize  = size === 'xs' ? 5 : size === 'sm' ? 6 : 7

  return (
    <span
      className={cn('inline-flex items-center gap-1.5 font-semibold uppercase tracking-wide whitespace-nowrap leading-none', textSize, className)}
      style={{ color: colors.text }}
    >
      {dot && (
        <span
          className="shrink-0 rounded-full"
          style={{ width: dotSize, height: dotSize, background: colors.dot, flexShrink: 0 }}
        />
      )}
      {children}
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

// ── StatusPill (dot + text, no uppercase) ─────────────────────────────────────
const DOT_COLOR = {
  green: 'var(--green)', accent: 'var(--accent)', yellow: 'var(--yellow)',
  orange: 'var(--orange)', red: 'var(--red)', ai: 'var(--ai)', neutral: 'var(--text3)',
}
const TEXT_COLOR = {
  green: 'var(--green)', accent: 'var(--accent)', yellow: 'var(--yellow)',
  orange: 'var(--orange)', red: 'var(--red)', ai: 'var(--ai)', neutral: 'var(--text3)',
}

export function StatusPill({ status, label, tone, size = 'sm', className = '' }) {
  const resolvedTone = tone || statusTone(status)
  const dot  = DOT_COLOR[resolvedTone]  || DOT_COLOR.neutral
  const text = TEXT_COLOR[resolvedTone] || TEXT_COLOR.neutral
  const textSize = size === 'xs' ? 'text-[9px]' : size === 'sm' ? 'text-[11px]' : 'text-[12px]'
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 font-medium whitespace-nowrap', textSize, className)}
      style={{ color: text }}
    >
      <span className="rounded-full shrink-0" style={{ width: 7, height: 7, background: dot }} />
      {label || status}
    </span>
  )
}
