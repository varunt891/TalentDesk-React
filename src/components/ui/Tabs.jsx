import { cn } from './utils'

export default function Tabs({ items, value, onChange, className = '' }) {
  return (
    <div className={cn('relative border-b border-border', className)}>
      {/* Fade mask hinting more tabs are scrollable on mobile */}
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-surface to-transparent z-10 md:hidden" />
      <div
        className="flex items-center gap-0.5 overflow-x-auto"
        role="tablist"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {items.map(item => {
          const active = item.id === value
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(item.id)}
              className={cn(
                'focus-ring relative flex items-center gap-1.5 px-3.5 h-10 text-[13px] font-semibold whitespace-nowrap rounded-t-[var(--radius-sm)] transition-colors duration-[var(--duration-fast)] shrink-0',
                active ? 'text-text' : 'text-text3 hover:text-text2 hover:bg-surface2/60'
              )}
            >
              {item.label}
              {typeof item.count === 'number' && (
                <span className={cn('text-[10px] font-extrabold rounded-full px-1.5 leading-4 tabular-nums', active ? 'bg-accent/15 text-accent' : 'bg-surface3 text-text3')}>
                  {item.count}
                </span>
              )}
              {active && <span className="absolute left-2.5 right-2.5 -bottom-px h-0.5 bg-accent rounded-full" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
