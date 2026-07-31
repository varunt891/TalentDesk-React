import { useEffect, useRef, useState } from 'react'
import { Icon } from './icons'
import { cn } from './utils'

/**
 * Custom-styled select. The panel is clamped to the trigger's own width so it
 * can never overflow a narrow parent (e.g. a modal column) the way a native
 * <select> popup can.
 */
export default function Select({ value, onChange, options, disabled, placeholder = 'Select...', size = 'md', className = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const handleKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const selected = options.find(o => o.value === value)
  const sizeCls = size === 'sm' ? 'h-8 text-xs px-2.5' : 'h-9 text-sm px-3'

  return (
    <div ref={ref} className={cn('relative w-full', className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className={cn(
          'w-full flex items-center justify-between gap-2 bg-surface2 border rounded-[var(--radius-sm)]',
          'transition-colors duration-[var(--duration-fast)] disabled:opacity-50 disabled:cursor-not-allowed',
          open ? 'border-accent ring-2 ring-accent/15' : 'border-border',
          sizeCls
        )}
      >
        <span className={cn('truncate text-left', selected ? 'text-text' : 'text-text3')}>
          {selected ? selected.label : placeholder}
        </span>
        <Icon name="chevronDown" size={12} className={cn('shrink-0 text-text3 transition-transform duration-[var(--duration-fast)]', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-[calc(100%+6px)] w-full max-h-64 overflow-y-auto bg-surface border border-border rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] p-1.5"
          style={{ zIndex: 'var(--z-dropdown)' }}
        >
          {options.map(o => {
            const active = o.value === value
            return (
              <div
                key={o.value}
                role="option"
                aria-selected={active}
                onClick={() => { onChange(o.value); setOpen(false) }}
                className={cn(
                  'px-2.5 py-2 rounded-[var(--radius-sm)] text-sm cursor-pointer break-words leading-snug',
                  active ? 'bg-accent/10 text-accent font-semibold' : 'text-text hover:bg-surface2 font-medium'
                )}
              >
                <div>{o.label}</div>
                {o.desc && <div className="text-xs text-text3 font-normal mt-0.5">{o.desc}</div>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
