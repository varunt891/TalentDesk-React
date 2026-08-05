import { useEffect, useRef, useState } from 'react'
import { Icon } from './icons'
import Avatar from './Avatar'
import Badge from './Badge'

// Searchable multi-select for assigning real org users to a record (e.g. a
// job requisition). Combines SearchBar.jsx's MultiSelect stay-open/toggle
// mechanics with SearchableSelect.jsx's user-row layout (name + role badge),
// upgraded with an Avatar per row/chip. Neither existing component alone
// covers "multi-select of user objects with avatars" — see UserMultiSelect
// usage in JobFormDrawer for the read-only vs interactive split.
export default function UserMultiSelect({ users = [], selected = [], onChange, readOnly = false, placeholder = 'Assign users...' }) {
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

  const selectedUsers = selected.map(id => users.find(u => u.id === id)).filter(Boolean)

  const toggle = (id) => {
    onChange(selected.includes(id) ? selected.filter(v => v !== id) : [...selected, id])
  }

  const q = search.trim().toLowerCase()
  const filteredUsers = q
    ? users.filter(u => (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q) || (u.role || '').toLowerCase().includes(q))
    : users

  const chips = (list, max) => (
    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
      {list.length === 0 ? (
        <span className="text-text3 text-sm">{readOnly ? 'Unassigned' : placeholder}</span>
      ) : (
        <>
          {list.slice(0, max).map(u => (
            <span key={u.id} className="inline-flex items-center gap-1.5 bg-surface3 rounded-full pl-0.5 pr-2 py-0.5">
              <Avatar name={u.full_name || u.email || '?'} size="xs" />
              <span className="text-[12px] text-text font-medium truncate max-w-[120px]">{u.full_name || u.email}</span>
            </span>
          ))}
          {list.length > max && <Badge size="sm" tone="neutral">+{list.length - max}</Badge>}
        </>
      )}
    </div>
  )

  if (readOnly) {
    return <div className="min-h-[38px] flex items-center">{chips(selectedUsers, 6)}</div>
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full min-h-[38px] flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[var(--radius-sm)] border border-border bg-surface2 hover:border-border-strong transition-colors text-left"
      >
        {chips(selectedUsers, 4)}
        <Icon name="chevronDown" size={14} className="text-text3 shrink-0" />
      </button>

      {open && (
        <div
          className="absolute left-0 top-[calc(100%+6px)] w-full min-w-[280px] flex flex-col bg-surface border border-border rounded-[var(--radius-md)] shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset,var(--shadow-lg)] p-1.5 gap-1"
          style={{ zIndex: 'var(--z-dropdown)' }}
        >
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-[var(--radius-sm)] bg-surface2">
            <Icon name="search" size={12} className="text-text3 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search users..."
              className="bg-transparent border-none outline-none text-sm text-text placeholder:text-text3 w-full"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="text-text3 hover:text-text shrink-0">
                <Icon name="x" size={11} />
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto flex flex-col">
            {filteredUsers.length === 0 ? (
              <div className="px-2.5 py-3 text-xs text-text3 text-center">
                {users.length === 0 ? 'No users found' : `No match for "${search}"`}
              </div>
            ) : (
              filteredUsers.map(u => {
                const checked = selected.includes(u.id)
                return (
                  <label
                    key={u.id}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-[var(--radius-sm)] cursor-pointer hover:bg-surface2"
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggle(u.id)} className="w-3.5 h-3.5 rounded accent-accent shrink-0" />
                    <Avatar name={u.full_name || u.email || '?'} size="xs" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="text-sm text-text font-medium truncate">{u.full_name || 'Unnamed'}</span>
                        {u.role && <Badge size="xs" tone="ai">{u.role.replace(/_/g, ' ')}</Badge>}
                      </span>
                      {u.email && <span className="block text-[11px] text-text3 truncate">{u.email}</span>}
                    </span>
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
