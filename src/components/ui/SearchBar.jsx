import { useEffect, useRef, useState } from 'react'
import { Icon } from './icons'
import { cn } from './utils'

export function SearchBar({ value, onChange, placeholder = 'Search...', className = '', size = 'md' }) {
  const sizeCls = size === 'sm' ? 'h-8 text-xs' : 'h-9 text-sm'
  return (
    <div className={cn('relative w-full', className)}>
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text3">
        <Icon name="search" size={14} />
      </span>
      <input
        type="text"
        value={value}
        onChange={e => onChange?.(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full bg-surface2 border border-border rounded-[var(--radius-sm)] pl-8 pr-8 text-text placeholder:text-text3',
          'focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-colors duration-[var(--duration-fast)]',
          sizeCls
        )}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange?.('')}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-text3 hover:text-text p-0.5"
        >
          <Icon name="x" size={13} />
        </button>
      )}
    </div>
  )
}

export function FilterChip({ label, active = false, count, onClick, onClear }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'focus-ring inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold border transition-colors duration-[var(--duration-fast)]',
        active
          ? 'bg-accent/10 border-accent/40 text-accent'
          : 'bg-surface2 border-border text-text2 hover:text-text hover:border-text3'
      )}
    >
      {label}
      {typeof count === 'number' && count > 0 && (
        <span className="text-[10px] font-extrabold bg-current/15 rounded-full px-1.5 leading-4">{count}</span>
      )}
      {active && onClear && (
        <span
          role="button"
          tabIndex={-1}
          onClick={(e) => { e.stopPropagation(); onClear() }}
          className="ml-0.5"
        >
          <Icon name="x" size={11} />
        </span>
      )}
    </button>
  )
}

export function FilterBar({ children, onClearAll, className = '' }) {
  const hasActive = Array.isArray(children) ? children.some(Boolean) : Boolean(children)
  return (
    <div className={cn('flex items-center gap-2 flex-wrap', className)}>
      {children}
      {onClearAll && hasActive && (
        <button type="button" onClick={onClearAll} className="text-xs font-semibold text-text3 hover:text-red px-1">
          Clear all
        </button>
      )}
    </div>
  )
}

export function MultiSelect({ label, options = [], selected = [], onChange, className = '', searchable = true }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 40)
    else setSearch('')
  }, [open])

  const toggle = (val) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val])
  }

  const normalized = options.map(opt => ({
    value: typeof opt === 'string' ? opt : opt.value,
    label: typeof opt === 'string' ? opt : opt.label,
  }))
  const q = search.trim().toLowerCase()
  const filteredOptions = q ? normalized.filter(o => String(o.label).toLowerCase().includes(q)) : normalized

  return (
    <div ref={ref} className={cn('relative', className)}>
      <FilterChip
        label={label}
        active={selected.length > 0}
        count={selected.length}
        onClick={() => setOpen(o => !o)}
        onClear={selected.length > 0 ? () => onChange([]) : undefined}
      />
      {open && (
        <div
          className="absolute left-0 top-[calc(100%+6px)] min-w-[220px] flex flex-col bg-surface border border-border rounded-[var(--radius-md)] shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset,var(--shadow-lg)] p-1.5 gap-1"
          style={{ zIndex: 'var(--z-dropdown)' }}
        >
          {searchable && options.length > 0 && (
            <div className="filter-search-shell flex items-center gap-1.5 px-2 py-1.5 rounded-[var(--radius-sm)] bg-surface2 transition-all">
              <Icon name="search" size={12} className="text-text3 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}...`}
                className="filter-search-input"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="text-text3 hover:text-text shrink-0">
                  <Icon name="x" size={11} />
                </button>
              )}
            </div>
          )}
          <div className="max-h-56 overflow-y-auto flex flex-col">
            {filteredOptions.length === 0 ? (
              <div className="px-2.5 py-3 text-xs text-text3 text-center">
                {options.length === 0 ? 'No options yet' : `No match for "${search}"`}
              </div>
            ) : (
              filteredOptions.map(opt => {
                const checked = selected.includes(opt.value)
                return (
                  <label
                    key={opt.value}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-[var(--radius-sm)] text-sm text-text cursor-pointer hover:bg-surface2"
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggle(opt.value)} className="w-3.5 h-3.5 rounded accent-accent shrink-0" />
                    <span className="truncate">{opt.label}</span>
                  </label>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
