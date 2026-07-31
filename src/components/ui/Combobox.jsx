import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './icons'
import { cn } from './utils'

/**
 * Free-text input with a type-to-filter suggestions dropdown drawn from
 * existing values already on file (e.g. past locations, job titles,
 * recruiter names). Lets people find and reuse an existing value instead of
 * retyping it from scratch, while still allowing an entirely new value —
 * unlike SearchableSelect, nothing here is forced to match the list.
 */
export default function Combobox({ value = '', onChange, options = [], placeholder = '', size = 'md', className = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const sizeCls = size === 'sm' ? 'h-8 text-xs pl-7 pr-2.5' : 'h-9 text-sm pl-8 pr-3'

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const filtered = useMemo(() => {
    const list = [...new Set((options || []).filter(Boolean).map(String))]
    const q = String(value || '').toLowerCase().trim()
    if (!q) return list.slice(0, 30)
    return list.filter(o => o.toLowerCase().includes(q) && o.toLowerCase() !== q).slice(0, 30)
  }, [options, value])

  return (
    <div ref={ref} className={cn('relative w-full', className)}>
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text3">
        <Icon name="search" size={13} />
      </span>
      <input
        type="text"
        value={value}
        onChange={e => { onChange?.(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className={cn(
          'w-full bg-surface2 border border-border rounded-[var(--radius-sm)] text-text placeholder:text-text3',
          'focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-colors duration-[var(--duration-fast)]',
          sizeCls
        )}
      />
      {open && filtered.length > 0 && (
        <div
          className="absolute left-0 right-0 top-[calc(100%+4px)] max-h-52 overflow-y-auto bg-surface border border-border rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] p-1.5"
          style={{ zIndex: 'var(--z-dropdown)' }}
        >
          {filtered.map(opt => (
            <button
              key={opt}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange?.(opt); setOpen(false) }}
              className="w-full text-left px-2.5 py-2 rounded-[var(--radius-sm)] text-sm text-text hover:bg-surface2 truncate"
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
