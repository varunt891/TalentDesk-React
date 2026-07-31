import { useEffect, useRef, useState } from 'react'
import { Icon } from '../ui/icons'
import { cn } from '../ui/utils'
import Button from '../ui/Button'
import { FilterChip, MultiSelect } from '../ui/SearchBar'
import { Drawer } from '../ui/Modal'
import { useSavedViews } from './useSavedViews'

function isActiveValue(value) {
  if (Array.isArray(value)) return value.length > 0
  return Boolean(value) && value !== 'All' && value !== 'all'
}

function SelectPopover({ def, value, onChange }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef(null)
  const inputRef = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 40)
    else setSearch('')
  }, [open])

  const active = isActiveValue(value)
  const selectedLabel = def.options.find(o => (o.value ?? o) === value)
  const label = active ? `${def.label}: ${selectedLabel ? (selectedLabel.label ?? selectedLabel) : value}` : def.label

  const q = search.trim().toLowerCase()
  const filteredOptions = q ? def.options.filter(opt => String(opt.label ?? opt).toLowerCase().includes(q)) : def.options

  return (
    <div ref={ref} className="relative">
      <FilterChip label={label} active={active} onClick={() => setOpen(o => !o)} onClear={active ? () => onChange('All') : undefined} />
      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] min-w-[200px] flex flex-col bg-surface border border-border rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] p-1.5 gap-1" style={{ zIndex: 'var(--z-dropdown)' }}>
          {def.searchable !== false && def.options.length > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-[var(--radius-sm)] bg-surface2 border border-border focus-within:border-accent transition-all">
              <Icon name="search" size={12} className="text-text3 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={`Search ${def.label.toLowerCase()}...`}
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
            <button type="button" onClick={() => { onChange('All'); setOpen(false) }} className={cn('w-full text-left px-2.5 py-2 rounded-[var(--radius-sm)] text-sm', !active ? 'bg-accent/10 text-accent font-semibold' : 'text-text hover:bg-surface2')}>
              All {def.label}
            </button>
            {filteredOptions.length === 0 ? (
              <div className="px-2.5 py-3 text-xs text-text3 text-center">No match for "{search}"</div>
            ) : (
              filteredOptions.map(opt => {
                const optValue = opt.value ?? opt
                const optLabel = opt.label ?? opt
                return (
                  <button key={optValue} type="button" onClick={() => { onChange(optValue); setOpen(false) }} className={cn('w-full text-left px-2.5 py-2 rounded-[var(--radius-sm)] text-sm truncate', value === optValue ? 'bg-accent/10 text-accent font-semibold' : 'text-text hover:bg-surface2')}>
                    {optLabel}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function DatePopover({ def, value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const active = isActiveValue(value)
  return (
    <div ref={ref} className="relative">
      <FilterChip label={active ? `${def.label}: ${value}` : def.label} active={active} onClick={() => setOpen(o => !o)} onClear={active ? () => onChange('') : undefined} />
      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] bg-surface border border-border rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] p-2.5" style={{ zIndex: 'var(--z-dropdown)' }}>
          <input type="date" value={value || ''} onChange={(e) => onChange(e.target.value)} className="h-9 px-2.5 rounded-[var(--radius-sm)] border border-border bg-surface2 text-sm text-text outline-none" />
        </div>
      )}
    </div>
  )
}

function FilterField({ def, values, onChange }) {
  if (def.type === 'multiselect') {
    return <MultiSelect label={def.label} options={def.options} selected={values[def.key] || []} onChange={(val) => onChange(def.key, val)} searchable={def.searchable} />
  }
  if (def.type === 'date') {
    return <DatePopover def={def} value={values[def.key]} onChange={(val) => onChange(def.key, val)} />
  }
  return <SelectPopover def={def} value={values[def.key]} onChange={(val) => onChange(def.key, val)} />
}

/**
 * The one reusable filter experience every workspace page shares: a
 * definition-driven bar of filter chips (inline on desktop, a Drawer on
 * mobile), Quick Presets, and per-page persisted Saved Views.
 */
export default function FilterWorkspace({ filters, values, onChange, onReset, presets, storageKey, className = '' }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [savingView, setSavingView] = useState(false)
  const [viewName, setViewName] = useState('')
  const { views, saveView, deleteView } = useSavedViews(storageKey ? `td_views_${storageKey}` : 'td_views_default')

  const activeCount = filters.filter(f => isActiveValue(values[f.key])).length

  const applyPreset = (presetValues) => {
    Object.entries(presetValues).forEach(([key, val]) => onChange(key, val))
  }

  const handleSaveView = () => {
    if (!viewName.trim()) return
    saveView(viewName.trim(), values)
    setViewName('')
    setSavingView(false)
  }

  const body = (
    <div className="flex items-center gap-2 flex-wrap">
      {presets && presets.length > 0 && presets.map(preset => (
        <button
          key={preset.label}
          type="button"
          onClick={() => applyPreset(preset.values)}
          className="h-8 px-3 rounded-full text-xs font-semibold bg-ai-soft text-ai hover:brightness-110"
        >
          {preset.label}
        </button>
      ))}
      {views.map(view => (
        <span key={view.id} className="inline-flex items-center gap-1 h-8 pl-3 pr-1.5 rounded-full text-xs font-semibold bg-surface2 border border-border text-text2">
          <button type="button" onClick={() => applyPreset(view.filters)} className="hover:text-text">{view.name}</button>
          <button type="button" onClick={() => deleteView(view.id)} aria-label={`Delete saved view ${view.name}`} className="text-text3 hover:text-red p-0.5">
            <Icon name="x" size={10} />
          </button>
        </span>
      ))}

      {filters.map(def => <FilterField key={def.key} def={def} values={values} onChange={onChange} />)}

      {activeCount > 0 && (
        <button type="button" onClick={onReset} className="text-xs font-semibold text-text3 hover:text-red px-1">
          Clear all
        </button>
      )}

      {storageKey && (
        savingView ? (
          <span className="inline-flex items-center gap-1.5">
            <input
              autoFocus
              value={viewName}
              onChange={e => setViewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveView(); if (e.key === 'Escape') setSavingView(false) }}
              placeholder="View name..."
              className="h-8 px-2 w-32 rounded-[var(--radius-sm)] border border-accent bg-surface text-xs text-text outline-none"
            />
            <Button size="sm" variant="primary" onClick={handleSaveView}>Save</Button>
          </span>
        ) : (
          <button type="button" onClick={() => setSavingView(true)} className="h-8 px-2.5 rounded-[var(--radius-sm)] text-xs font-semibold text-text3 hover:text-accent flex items-center gap-1">
            <Icon name="plus" size={11} /> Save view
          </button>
        )
      )}
    </div>
  )

  return (
    <div className={className}>
      <div className="hidden md:block">{body}</div>
      <div className="md:hidden">
        <button type="button" onClick={() => setMobileOpen(true)} className="relative h-9 px-3.5 rounded-[var(--radius-sm)] border border-border bg-surface2 text-sm font-semibold text-text2 flex items-center gap-2">
          <Icon name="filter" size={13} /> Filters
          {activeCount > 0 && <span className="text-[10px] font-extrabold bg-accent text-white rounded-full w-4 h-4 flex items-center justify-center leading-none">{activeCount}</span>}
        </button>
        <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)} title="Filters" side="right">
          <div className="flex flex-col gap-3">{body}</div>
        </Drawer>
      </div>
    </div>
  )
}
