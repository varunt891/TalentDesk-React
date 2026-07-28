import { useState, useRef, useEffect, useMemo } from 'react'

/**
 * SearchableSelect — A modern combobox dropdown component that allows users
 * to search/type names to quickly filter and select.
 * 
 * Supports both string arrays (e.g. ['Team A', 'Team B']) and object arrays (e.g. [{ id, name, role, email }]).
 * Supports fullWidth (100% container width) for clean responsive form layouts.
 */
export default function SearchableSelect({
  options = [],
  value = 'all',
  onChange,
  placeholder = 'Type to search...',
  allLabel = 'All Options',
  icon = '👤',
  fullWidth = true,
  className = ''
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  // Normalize options array to uniform objects
  const normalizedOptions = useMemo(() => {
    return (options || []).map(opt => {
      if (typeof opt === 'string') {
        return { id: opt, name: opt }
      }
      return {
        id: opt.id ?? opt.name,
        name: opt.name || opt.full_name || opt.label || opt.email || String(opt.id),
        role: opt.role,
        email: opt.email
      }
    })
  }, [options])

  // Selected item object
  const selectedItem = useMemo(() => {
    if (!value || String(value).toLowerCase() === 'all') return null
    return normalizedOptions.find(o => String(o.id) === String(value))
  }, [normalizedOptions, value])

  // Filtered options based on typing
  const filteredOptions = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return normalizedOptions
    return normalizedOptions.filter(o => {
      const name = String(o.name || '').toLowerCase()
      const email = String(o.email || '').toLowerCase()
      const role = String(o.role || '').toLowerCase()
      return name.includes(q) || email.includes(q) || role.includes(q)
    })
  }, [normalizedOptions, search])

  // Close on outside click or Escape key
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  // Auto focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 40)
    } else {
      setSearch('')
    }
  }, [isOpen])

  const handleSelect = (id) => {
    onChange?.(id)
    setIsOpen(false)
  }

  return (
    <div
      ref={containerRef}
      className={`searchable-select-wrap ${className}`}
      style={{
        position: 'relative',
        display: fullWidth ? 'block' : 'inline-block',
        width: fullWidth ? '100%' : 'auto',
        boxSizing: 'border-box'
      }}
    >
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="searchable-select-trigger"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          padding: '10px 14px',
          borderRadius: '10px',
          border: '1px solid var(--border)',
          background: 'var(--surface2)',
          color: 'var(--text)',
          fontSize: '13px',
          fontWeight: '600',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          boxSizing: 'border-box',
          minHeight: '40px',
          transition: 'all 0.15s ease'
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <span style={{ fontSize: '13px', opacity: 0.9, flexShrink: 0 }}>{icon}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selectedItem
              ? selectedItem.name
              : allLabel}
          </span>
        </span>
        <span style={{ fontSize: '10px', opacity: 0.6, marginLeft: '6px', flexShrink: 0 }}>▼</span>
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          className="searchable-select-panel"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 99999,
            width: '100%',
            minWidth: '240px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            boxShadow: '0 12px 36px rgba(0,0,0,0.35)',
            padding: '8px',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}
        >
          {/* Typing Search Input */}
          <div
            className="searchable-select-input-box"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 10px',
              borderRadius: '8px',
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              transition: 'all 0.15s ease'
            }}
          >
            <span style={{ fontSize: '12px', opacity: 0.6 }}>🔍</span>
            <input
              ref={inputRef}
              type="text"
              className="searchable-select-input"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={placeholder}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                boxShadow: 'none',
                color: 'var(--text)',
                fontSize: '12.5px',
                fontFamily: 'inherit'
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text3)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  padding: '0 2px'
                }}
              >
                ×
              </button>
            )}
          </div>

          {/* Options List */}
          <div
            style={{
              maxHeight: '220px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px'
            }}
          >
            {/* All Option */}
            {(() => {
              const isAllSelected = !value || String(value).toLowerCase() === 'all'
              return (
                <div
                  onClick={() => handleSelect('all')}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12.5px',
                    fontWeight: isAllSelected ? '700' : '500',
                    color: isAllSelected ? 'var(--accent)' : 'var(--text)',
                    background: isAllSelected ? 'rgba(79, 124, 255, 0.12)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                  onMouseEnter={e => {
                    if (!isAllSelected) e.currentTarget.style.background = 'var(--surface2)'
                  }}
                  onMouseLeave={e => {
                    if (!isAllSelected) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <span>🌐 {allLabel}</span>
                  {isAllSelected && <span style={{ fontSize: '11px', fontWeight: '800' }}>✓</span>}
                </div>
              )
            })()}

            {/* Filtered List */}
            {filteredOptions.length === 0 ? (
              <div style={{ padding: '12px 10px', fontSize: '12px', color: 'var(--text3)', textAlign: 'center' }}>
                No match found for "{search}"
              </div>
            ) : (
              filteredOptions.map(opt => {
                const optId = String(opt.id)
                const isSelected = String(value) === optId
                const name = opt.name
                const role = opt.role ? String(opt.role).toUpperCase() : null

                return (
                  <div
                    key={opt.id}
                    onClick={() => handleSelect(opt.id)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '12.5px',
                      fontWeight: isSelected ? '700' : '500',
                      color: isSelected ? 'var(--accent)' : 'var(--text)',
                      background: isSelected ? 'rgba(79, 124, 255, 0.12)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px'
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) e.currentTarget.style.background = 'var(--surface2)'
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: isSelected ? '700' : '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {name}
                        </span>
                        {role && (
                          <span style={{ fontSize: '9px', fontWeight: '800', padding: '1px 5px', borderRadius: '4px', background: 'rgba(124, 92, 255, 0.15)', color: '#7c5cff' }}>
                            {role}
                          </span>
                        )}
                      </div>
                      {opt.email && opt.name !== opt.email && (
                        <small style={{ fontSize: '10.5px', color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {opt.email}
                        </small>
                      )}
                    </div>
                    {isSelected && <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--accent)' }}>✓</span>}
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
