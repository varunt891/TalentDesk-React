import { Icon } from './icons'
import { cn } from './utils'

export function Card({ as: As = 'div', padding = 'md', hoverable = false, className = '', children, ...rest }) {
  const padCls = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-6' }[padding] ?? 'p-4'
  return (
    <As
      className={cn(
        'bg-surface border border-border rounded-[var(--radius-lg)] shadow-xs',
        hoverable && 'transition-[box-shadow,border-color,transform] duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:border-border-strong hover:shadow-sm hover:-translate-y-px cursor-pointer',
        padCls,
        className
      )}
      {...rest}
    >
      {children}
    </As>
  )
}

export function CardHeader({ title, subtitle, action, className = '' }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 mb-3.5', className)}>
      <div className="min-w-0">
        <h3 className="text-[13px] font-bold text-text tracking-tight truncate">{title}</h3>
        {subtitle && <p className="text-xs text-text3 mt-1 leading-relaxed">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

const TREND_TONE = { up: 'text-green', down: 'text-red', flat: 'text-text3' }

export function KPICard({ label, value, icon, trend, trendValue, tone = 'accent', helper, className = '', compact = false }) {
  return (
    <Card
      padding="none"
      className={cn(
        'transition-[box-shadow,border-color] duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:shadow-sm hover:border-border-strong',
        compact ? 'p-2.5 flex flex-col gap-1' : 'p-3 sm:p-3.5 flex flex-col gap-2',
        className
      )}
    >
      <div className="flex items-start justify-between gap-1.5">
        <span className="text-[10px] sm:text-[10.5px] font-bold text-text3 uppercase tracking-wider leading-snug line-clamp-1" title={label}>{label}</span>
        {icon && (
          <span
            className={cn(
              'rounded-[var(--radius-sm)] flex items-center justify-center shrink-0',
              compact ? 'w-5 h-5' : 'w-6 h-6'
            )}
            style={{ background: `color-mix(in srgb, var(--${tone}) 12%, transparent)`, color: `var(--${tone})`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, var(--${tone}) 18%, transparent)` }}
          >
            <Icon name={icon} size={compact ? 12 : 13} strokeWidth={2.4} />
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className={cn('font-extrabold text-text leading-none tracking-tight font-[var(--mono)] tabular-nums', compact ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl')}>{value}</span>
        {trend && (
          <span className={cn('inline-flex items-center gap-0.5 text-[11px] font-bold', TREND_TONE[trend] || TREND_TONE.flat)}>
            {trend !== 'flat' && <Icon name={trend === 'up' ? 'trendUp' : 'trendDown'} size={10} />}
            {trendValue}
          </span>
        )}
      </div>
      {helper && <span className="text-[10.5px] text-text3 leading-tight truncate">{helper}</span>}
    </Card>
  )
}
