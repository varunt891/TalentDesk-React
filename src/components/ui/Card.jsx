import { Icon } from './icons'
import { cn } from './utils'

export function Card({ as: As = 'div', padding = 'md', hoverable = false, className = '', children, ...rest }) {
  const padCls = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-6' }[padding] ?? 'p-4'
  return (
    <As
      className={cn(
        'td-card bg-surface border border-border rounded-[var(--radius-lg)] shadow-xs',
        hoverable && 'transition-[box-shadow,border-color,transform] duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:border-accent/30 hover:shadow-[0_10px_28px_-12px_color-mix(in_srgb,var(--accent)_25%,transparent)] hover:-translate-y-px cursor-pointer',
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
    <div className={cn('td-card-heading flex flex-wrap items-start justify-between gap-3 mb-5', className)}>
      <div className="min-w-0 flex-1">
        <h3 className="text-[14px] font-semibold text-text tracking-tight">{title}</h3>
        {subtitle && <p className="text-xs text-text3 mt-1 leading-relaxed">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}


const TREND_TONE = { up: 'text-green', down: 'text-red', flat: 'text-text3' }

export function KPICard({ label, title, value, icon, trend, trendValue, tone = 'accent', helper, subtitle, className = '', compact = false, live = true }) {
  const displayLabel = label || title
  const displayHelper = helper || subtitle
  return (
    <Card
      padding="none"
      data-compact={compact ? 'true' : 'false'}
      className={cn(
        'td-kpi group relative overflow-hidden transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
        compact ? 'p-3 flex flex-col gap-2' : 'p-5 flex flex-col gap-3',
        className
      )}
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {live && (
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--accent)' }} title="Live real-time metric" />
          )}
          <span className="text-xs font-medium text-text2 leading-snug truncate" title={displayLabel}>{displayLabel}</span>
        </div>
        {icon && (
          <span
            className={cn(
              'rounded-[var(--radius-sm)] flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110',
              compact ? 'w-5 h-5' : 'w-6 h-6'
            )}
            style={{
              background: 'var(--surface2)',
              color: `var(--${tone})`,
            }}
          >
            <Icon name={icon} size={compact ? 12 : 13} strokeWidth={2.4} />
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className={cn('font-medium text-text leading-none tracking-[-0.05em] tabular-nums', compact ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl')}>{value}</span>
        {trend && (
          <span className={cn('inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-surface2/60 border border-border/50', TREND_TONE[trend] || TREND_TONE.flat)}>
            {trend !== 'flat' && <Icon name={trend === 'up' ? 'trendUp' : 'trendDown'} size={9} />}
            {trendValue}
          </span>
        )}
      </div>
      {displayHelper && <span className="text-[10px] text-text3 leading-tight truncate">{displayHelper}</span>}
    </Card>
  )
}

