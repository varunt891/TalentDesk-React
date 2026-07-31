import { useState, useRef, useEffect, useMemo } from 'react'
import { Icon } from './icons'
import { cn } from './utils'

/**
 * Combobox dropdown with type-to-filter search. Accepts string arrays
 * (['Team A', 'Team B']) or object arrays ([{ id, name, role, email }]).
 */
export default function SearchableSelect({
  options = [],
  value = 'all',
  onChange,
  placeholder = 'Type to search...',
  allLabel = 'All',
  fullWidth = true,
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  const normalizedOptions = useMemo(() => (options || []).map(opt => {
    if (typeof opt === 'string') return { id: opt, name: opt }
    return {
      id: opt.id ?? opt.name,
      name: opt.name || opt.full_name || opt.label || opt.email || String(opt.id),
      role: opt.role,
      email: opt.email,
    }
  }), [options])

  const selectedItem = useMemo(() => {
    if (!value || String(value).toLowerCase() === 'all') return null
    return normalizedOptions.find(o => String(o.id) === String(value))
  }, [normalizedOptions, value])

  const filteredOptions = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return normalizedOptions
    return normalizedOptions.filter(o =>
      String(o.name || '').toLowerCase().includes(q) ||
      String(o.email || '').toLowerCase().includes(q) ||
      String(o.role || '').toLowerCase().includes(q)
    )
  }, [normalizedOptions, search])

  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e) => { if (containerRef.current && !containerRef.current.contains(e.target)) setIsOpen(false) }
    const handleKeyDown = (e) => { if (e.key === 'Escape') setIsOpen(false) }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 40)
    else setSearch('')
  }, [isOpen])

  const handleSelect = (id) => { onChange?.(id); setIsOpen(false) }
  const isAllSelected = !value || String(value).toLowerCase() === 'all'

  return (
    <div ref={containerRef} className={cn('relative', fullWidth ? 'w-full' : 'inline-block', className)}>
      <button
        type="button"
        onClick={() => setIsOpen(p => !p)}
        className={cn(
          'w-full h-9 flex items-center justify-between gap-2 px-3 rounded-[var(--radius-sm)] border bg-surface2 text-text text-sm font-semibold',
          'transition-colors duration-[var(--duration-fast)]',
          isOpen ? 'border-accent ring-2 ring-accent/15' : 'border-border'
        )}
      >
        <span className="flex items-center gap-2 overflow-hidden">
          <Icon name="users" size={13} className="text-text3 shrink-0" />
          <span className="truncate">{selectedItem ? selectedItem.name : allLabel}</span>
        </span>
        <Icon name="chevronDown" size={12} className={cn('shrink-0 text-text3 transition-transform duration-[var(--duration-fast)]', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div
          className="absolute left-0 right-0 top-[calc(100%+6px)] min-w-[240px] flex flex-col gap-1.5 bg-surface border border-border rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] p-2"
          style={{ zIndex: 'var(--z-dropdown)' }}
        >
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-sm)] bg-surface2 border border-border focus-within:border-accent transition-all">
            <Icon name="search" size={13} className="text-text3 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={placeholder}
              className="filter-search-input"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="text-text3 hover:text-text">
                <Icon name="x" size={12} />
              </button>
            )}
          </div>

          <div className="max-h-56 overflow-y-auto flex flex-col gap-0.5">
            <div
              onClick={() => handleSelect('all')}
              className={cn(
                'px-2.5 py-2 rounded-[var(--radius-sm)] text-xs cursor-pointer flex items-center justify-between',
                isAllSelected ? 'bg-accent/10 text-accent font-bold' : 'text-text font-medium hover:bg-surface2'
              )}
            >
              <span>{allLabel}</span>
              {isAllSelected && <Icon name="check" size={12} />}
            </div>

            {filteredOptions.length === 0 ? (
              <div className="px-2.5 py-3 text-xs text-text3 text-center">No match for "{search}"</div>
            ) : (
              filteredOptions.map(opt => {
                const isSelected = String(value) === String(opt.id)
                return (
                  <div
                    key={opt.id}
                    onClick={() => handleSelect(opt.id)}
                    className={cn(
                      'px-2.5 py-2 rounded-[var(--radius-sm)] text-xs cursor-pointer flex items-center justify-between gap-2',
                      isSelected ? 'bg-accent/10 text-accent font-bold' : 'text-text font-medium hover:bg-surface2'
                    )}
                  >
                    <span className="flex flex-col gap-0.5 min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate">{opt.name}</span>
                        {opt.role && (
                          <span className="shrink-0 text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-ai-soft text-ai uppercase tracking-wide">
                            {opt.role}
                          </span>
                        )}
                      </span>
                      {opt.email && opt.name !== opt.email && (
                        <span className="text-[10.5px] text-text3 truncate">{opt.email}</span>
                      )}
                    </span>
                    {isSelected && <Icon name="check" size={12} className="shrink-0" />}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
