import { useEffect, useRef, useState } from 'react'
import { Icon } from '../ui/icons'
import { cn } from '../ui/utils'

function readList(key) {
  try {
    const saved = localStorage.getItem(key)
    const parsed = saved ? JSON.parse(saved) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeList(key, list) {
  try { localStorage.setItem(key, JSON.stringify(list)) } catch { /* ignore quota errors */ }
}

/**
 * The one recruiter search experience every workspace page shares: debounced
 * input (so expensive filtering doesn't re-run per keystroke), recent +
 * saved searches persisted per page, and a focus shortcut. Each page still
 * supplies its own field-matching predicate against the debounced value —
 * there's no cross-entity backend search index to wire this into.
 */
export default function WorkspaceSearch({
  value = '',
  onChange,
  placeholder = 'Search...',
  storageKey,
  shortcutKey = '/',
  debounceMs = 250,
  className = '',
}) {
  const [text, setText] = useState(value)
  const [open, setOpen] = useState(false)
  const [recent, setRecent] = useState(() => (storageKey ? readList(`${storageKey}_recent`) : []))
  const [saved, setSaved] = useState(() => (storageKey ? readList(`${storageKey}_saved`) : []))
  const inputRef = useRef(null)
  const wrapRef = useRef(null)
  const debounceRef = useRef(null)
  const lastExternalValue = useRef(value)

  // Keep internal text in sync when the parent resets/overrides value externally
  useEffect(() => {
    if (value !== lastExternalValue.current) {
      lastExternalValue.current = value
      setText(value)
    }
  }, [value])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      lastExternalValue.current = text
      onChange?.(text)
    }, debounceMs)
    return () => clearTimeout(debounceRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key !== shortcutKey) return
      const el = document.activeElement
      const isTyping = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      if (isTyping) return
      e.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [shortcutKey])

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const commit = (term) => {
    const trimmed = (term || '').trim()
    if (!trimmed || !storageKey) return
    const next = [trimmed, ...recent.filter(t => t.toLowerCase() !== trimmed.toLowerCase())].slice(0, 6)
    setRecent(next)
    writeList(`${storageKey}_recent`, next)
  }

  const applyTerm = (term) => {
    setText(term)
    lastExternalValue.current = term
    onChange?.(term)
    commit(term)
    setOpen(false)
  }

  const toggleSaved = () => {
    const trimmed = text.trim()
    if (!trimmed || !storageKey) return
    const exists = saved.includes(trimmed)
    const next = exists ? saved.filter(s => s !== trimmed) : [trimmed, ...saved].slice(0, 8)
    setSaved(next)
    writeList(`${storageKey}_saved`, next)
  }

  const isSaved = text.trim() && saved.includes(text.trim())
  const showDropdown = open && !text && (recent.length > 0 || saved.length > 0)

  return (
    <div ref={wrapRef} className={cn('relative w-full', className)}>
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text3">
        <Icon name="search" size={14} />
      </span>
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(text)
          if (e.key === 'Escape') { setText(''); onChange?.(''); inputRef.current?.blur() }
        }}
        placeholder={placeholder}
        className={cn(
          'w-full h-9 bg-surface2 border border-border rounded-[var(--radius-sm)] pl-8 text-sm text-text placeholder:text-text3',
          'focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-colors duration-[var(--duration-fast)]',
          storageKey ? 'pr-16' : 'pr-8'
        )}
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
        {!text && shortcutKey && (
          <kbd className="hidden sm:inline text-[10px] font-bold text-text3 bg-surface3 border border-border rounded px-1.5 py-0.5">{shortcutKey}</kbd>
        )}
        {text && (
          <>
            {storageKey && (
              <button type="button" onClick={toggleSaved} title={isSaved ? 'Remove saved search' : 'Save this search'} className={cn('p-1', isSaved ? 'text-yellow' : 'text-text3 hover:text-text')}>
                <Icon name="sparkles" size={13} />
              </button>
            )}
            <button type="button" onClick={() => applyTerm('')} aria-label="Clear search" className="p-1 text-text3 hover:text-text">
              <Icon name="x" size={13} />
            </button>
          </>
        )}
      </div>

      {showDropdown && (
        <div
          className="absolute left-0 right-0 top-[calc(100%+6px)] bg-surface border border-border rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] p-2.5 flex flex-col gap-2.5"
          style={{ zIndex: 'var(--z-dropdown)' }}
        >
          {saved.length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-text3 uppercase tracking-wide mb-1.5">Saved Searches</div>
              <div className="flex flex-wrap gap-1.5">
                {saved.map(term => (
                  <button key={term} type="button" onClick={() => applyTerm(term)} className="text-xs font-medium text-yellow bg-yellow/10 rounded-full px-2.5 py-1">
                    ★ {term}
                  </button>
                ))}
              </div>
            </div>
          )}
          {recent.length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-text3 uppercase tracking-wide mb-1.5">Recent</div>
              <div className="flex flex-wrap gap-1.5">
                {recent.map(term => (
                  <button key={term} type="button" onClick={() => applyTerm(term)} className="text-xs font-medium text-text2 bg-surface2 border border-border rounded-full px-2.5 py-1 hover:text-text">
                    {term}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
