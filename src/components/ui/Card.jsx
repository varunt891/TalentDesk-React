import { Icon } from './icons'
import { cn } from './utils'

export function Card({ as: As = 'div', padding = 'md', hoverable = false, className = '', children, ...rest }) {
  const padCls = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-6' }[padding] ?? 'p-4'
  return (
    <As
      className={cn(
        'bg-surface border border-border rounded-[var(--radius-lg)] shadow-xs',
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
    <div className={cn('flex items-start justify-between gap-3 mb-3.5', className)}>
      <div className="min-w-0 flex-1">
        <h3 className="text-[13px] font-bold text-text tracking-tight">{title}</h3>
        {subtitle && <p className="text-xs text-text3 mt-1 leading-relaxed">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}


const TREND_TONE = { up: 'text-green', down: 'text-red', flat: 'text-text3' }

export function KPICard({ label, value, icon, trend, trendValue, tone = 'accent', helper, className = '', compact = false, live = true }) {
  return (
    <Card
      padding="none"
      className={cn(
        'group relative overflow-hidden transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:shadow-[0_14px_28px_-12px_var(--glow)]',
        compact ? 'p-2.5 flex flex-col gap-1' : 'p-3 sm:p-3.5 flex flex-col gap-2',
        className
      )}
      style={{
        background: `linear-gradient(160deg, color-mix(in srgb, var(--${tone}) 13%, var(--surface)), var(--surface) 65%)`,
        borderColor: `color-mix(in srgb, var(--${tone}) 22%, var(--border))`,
        '--glow': `color-mix(in srgb, var(--${tone}) 40%, transparent)`,
      }}
    >
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {live && (
            <span className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse" style={{ background: `var(--${tone})` }} title="Live real-time metric" />
          )}
          <span className="text-[10px] sm:text-[10.5px] font-bold text-text3 uppercase tracking-wider leading-snug truncate" title={label}>{label}</span>
        </div>
        {icon && (
          <span
            className={cn(
              'rounded-[var(--radius-sm)] flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110',
              compact ? 'w-5 h-5' : 'w-6 h-6'
            )}
            style={{
              background: `color-mix(in srgb, var(--${tone}) 20%, transparent)`,
              color: `var(--${tone})`,
              boxShadow: `inset 0 0 0 1px color-mix(in srgb, var(--${tone}) 32%, transparent), 0 2px 8px -2px color-mix(in srgb, var(--${tone}) 45%, transparent)`,
            }}
          >
            <Icon name={icon} size={compact ? 12 : 13} strokeWidth={2.4} />
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className={cn('font-extrabold text-text leading-none tracking-tight font-[var(--mono)] tabular-nums', compact ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl')}>{value}</span>
        {trend && (
          <span className={cn('inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-surface2/60 border border-border/50', TREND_TONE[trend] || TREND_TONE.flat)}>
            {trend !== 'flat' && <Icon name={trend === 'up' ? 'trendUp' : 'trendDown'} size={10} />}
            {trendValue}
          </span>
        )}
      </div>
      {helper && <span className="text-[10.5px] text-text3 leading-tight truncate">{helper}</span>}
      <div
        className="absolute left-0 right-0 bottom-0 h-[2px] opacity-70 transition-all duration-300 group-hover:h-[3px] group-hover:opacity-100"
        style={{
          background: `linear-gradient(90deg, transparent, var(--${tone}), transparent)`,
        }}
      />
    </Card>
  )
}

