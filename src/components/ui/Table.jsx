import { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { Icon } from './icons'
import { cn } from './utils'
import { Checkbox } from './Input'
import EmptyState from './EmptyState'
import { Skeleton } from './Skeleton'
import Menu from './Menu'

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' }
const MIN_COL_WIDTH = 72

/**
 * Shared data table: sticky header, sortable/resizable/hideable columns, row
 * selection, bulk actions, keyboard navigation, right-click context menu,
 * opt-in inline cell editing, and an automatic stacked-card fallback below md
 * so nothing requires horizontal scrolling on mobile. Replaces the per-page
 * mix of <table>, div-grids and card-grids used for tabular data before this.
 *
 * All of the below are additive/opt-in — existing callers (e.g. Dashboard's
 * recruiter leaderboard) are unaffected unless they pass the new props.
 */
export default function Table({
  columns,
  data = [],
  getRowId = (row) => row.id,
  onRowClick,
  selectable = false,
  selectedIds = [],
  onSelectionChange,
  sortKey,
  sortDir = 'asc',
  onSortChange,
  loading = false,
  emptyState,
  bulkActions,
  rowActions,
  contextMenuItems,
  onCellEdit,
  resizable = false,
  keyboardNav = true,
  mobileCard,
  className = '',
}) {
  const [internalSort, setInternalSort] = useState({ key: sortKey, dir: sortDir })
  const activeSort = useMemo(
    () => (onSortChange ? { key: sortKey, dir: sortDir } : internalSort),
    [onSortChange, sortKey, sortDir, internalSort]
  )

  const columnVisibility = columns.some(c => c.hideable)
  const [hiddenKeys, setHiddenKeys] = useState(() => new Set(columns.filter(c => c.hideable && c.defaultHidden).map(c => c.key)))
  
  useEffect(() => {
    setHiddenKeys(new Set(columns.filter(c => c.hideable && c.defaultHidden).map(c => c.key)))
  }, [columns])

  const visibleColumns = useMemo(() => columns.filter(c => !(c.hideable && hiddenKeys.has(c.key))), [columns, hiddenKeys])
  const toggleColumn = (key) => {
    setHiddenKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const [colWidths, setColWidths] = useState({})
  const resizeState = useRef(null)

  const startResize = useCallback((e, key, currentWidth) => {
    e.preventDefault()
    e.stopPropagation()
    resizeState.current = { key, startX: e.clientX, startWidth: currentWidth }
    const onMove = (ev) => {
      if (!resizeState.current) return
      const delta = ev.clientX - resizeState.current.startX
      const next = Math.max(MIN_COL_WIDTH, resizeState.current.startWidth + delta)
      setColWidths(prev => ({ ...prev, [resizeState.current.key]: next }))
    }
    const onUp = () => {
      resizeState.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [])

  const widthFor = (col) => colWidths[col.key] || (typeof col.width === 'number' ? col.width : col.width ? parseInt(col.width, 10) : undefined) || 160

  const handleSort = (col) => {
    if (!col.sortable) return
    if (onSortChange) return onSortChange(col.key)
    setInternalSort(prev => ({
      key: col.key,
      dir: prev.key === col.key && prev.dir === 'asc' ? 'desc' : 'asc',
    }))
  }

  const sortedData = useMemo(() => {
    if (onSortChange || !activeSort.key) return data
    const col = columns.find(c => c.key === activeSort.key)
    if (!col) return data
    const sorted = [...data].sort((a, b) => {
      const av = col.sortValue ? col.sortValue(a) : a[col.key]
      const bv = col.sortValue ? col.sortValue(b) : b[col.key]
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'number' && typeof bv === 'number') return av - bv
      return String(av).localeCompare(String(bv))
    })
    return activeSort.dir === 'desc' ? sorted.reverse() : sorted
  }, [data, columns, activeSort, onSortChange])

  const allSelected = selectable && data.length > 0 && selectedIds.length === data.length
  const someSelected = selectable && selectedIds.length > 0 && !allSelected

  const toggleAll = () => {
    if (!onSelectionChange) return
    onSelectionChange(allSelected ? [] : data.map(getRowId))
  }
  const toggleOne = (id) => {
    if (!onSelectionChange) return
    onSelectionChange(selectedIds.includes(id) ? selectedIds.filter(i => i !== id) : [...selectedIds, id])
  }

  // Keyboard navigation: arrow keys move a focused-row highlight, Enter activates it
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const handleContainerKeyDown = (e) => {
    if (!keyboardNav || sortedData.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIndex(prev => Math.min(sortedData.length - 1, prev + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIndex(prev => Math.max(0, prev - 1))
    } else if (e.key === 'Enter' && focusedIndex >= 0) {
      onRowClick?.(sortedData[focusedIndex])
    }
  }

  // Right-click context menu
  const [contextMenu, setContextMenu] = useState(null)
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    document.addEventListener('mousedown', close)
    document.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('scroll', close, true)
    }
  }, [contextMenu])
  const openContextMenu = (e, row) => {
    if (!contextMenuItems) return
    e.preventDefault()
    setContextMenu({ row, x: e.clientX, y: e.clientY })
  }

  // Inline cell editing
  const [editingCell, setEditingCell] = useState(null)
  const commitEdit = (row, col, value) => {
    setEditingCell(null)
    if (value !== row[col.key]) onCellEdit?.(row, col.key, value)
  }

  if (!loading && data.length === 0) {
    return emptyState || <EmptyState title="Nothing here yet" />
  }

  return (
    <div className={cn('w-full', className)}>
      {(columnVisibility || (selectable && selectedIds.length > 0 && bulkActions)) && (
        <div className="flex items-center gap-3 mb-3">
          {selectable && selectedIds.length > 0 && bulkActions && (
            <div className="flex items-center gap-3 bg-accent/8 border border-accent/25 shadow-xs rounded-[var(--radius-md)] px-3.5 py-2.5 flex-1">
              <span className="text-xs font-bold text-accent">{selectedIds.length} selected</span>
              <div className="flex items-center gap-2 ml-auto">{bulkActions}</div>
            </div>
          )}
          {columnVisibility && (
            <Menu
              align="end"
              className={selectable && selectedIds.length > 0 && bulkActions ? '' : 'ml-auto'}
              trigger={({ toggle }) => (
                <button type="button" onClick={toggle} className="focus-ring h-8 px-2.5 rounded-[var(--radius-sm)] border border-border bg-surface2 shadow-xs text-xs font-semibold text-text2 hover:text-text hover:bg-surface3 transition-colors duration-[var(--duration-fast)] flex items-center gap-1.5">
                  <Icon name="grip" size={12} /> Columns
                </button>
              )}
              items={columns.filter(c => c.hideable).map(c => ({
                label: (hiddenKeys.has(c.key) ? '☐ ' : '☑ ') + c.header,
                onClick: () => toggleColumn(c.key),
              }))}
            />
          )}
        </div>
      )}

      {/* Desktop / tablet: real table, sticky header, no horizontal scroll trap */}
      <div className="hidden md:block border border-border rounded-[var(--radius-lg)] shadow-xs overflow-hidden mb-6" style={{ borderRadius: 'var(--radius-md)' }}>
        <div
          className="overflow-x-auto"
          tabIndex={keyboardNav ? 0 : undefined}
          onKeyDown={handleContainerKeyDown}
        >
          <table className="w-full border-collapse" style={resizable ? { tableLayout: 'fixed' } : undefined}>
            <thead className="sticky top-0 bg-surface2/98 backdrop-blur-sm border-b border-border" style={{ zIndex: 'var(--z-sticky)' }}>
              <tr>
                {selectable && (
                  <th className="w-10 px-3 py-2.5">
                    <Checkbox checked={allSelected} ref={(el) => { if (el) el.indeterminate = someSelected }} onChange={toggleAll} />
                  </th>
                )}
                {visibleColumns.map(col => (
                  <th
                    key={col.key}
                    className={cn(
                      'relative px-3 py-2.5 text-[10px] font-bold text-text3 uppercase tracking-wider whitespace-nowrap',
                      ALIGN[col.align] || ALIGN.left,
                      col.sortable && 'cursor-pointer select-none hover:text-text transition-colors duration-[var(--duration-fast)]'
                    )}
                    style={resizable ? { width: widthFor(col) } : col.width ? { width: col.width } : undefined}
                    onClick={() => handleSort(col)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.header}
                      {col.sortable && (
                        <Icon
                          name={activeSort.key === col.key ? (activeSort.dir === 'asc' ? 'chevronUp' : 'chevronDown') : 'chevronsUpDown'}
                          size={11}
                          className={activeSort.key === col.key ? 'text-accent' : 'text-text3/60'}
                        />
                      )}
                    </span>
                    {resizable && (
                      <span
                        onMouseDown={(e) => startResize(e, col.key, widthFor(col))}
                        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-accent/40"
                        aria-hidden="true"
                      />
                    )}
                  </th>
                ))}
                {rowActions && <th className="w-10 px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {loading
                  ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      {selectable && <td className="px-3 py-2.5"><Skeleton className="w-4 h-4 rounded" /></td>}
                      {visibleColumns.map(col => (
                        <td key={col.key} className="px-3 py-2.5"><Skeleton className="h-3.5 w-4/5 rounded" /></td>
                      ))}
                      {rowActions && <td className="px-3 py-2.5" />}
                    </tr>
                  ))
                : sortedData.map((row, i) => {
                    const id = getRowId(row)
                    return (
                      <tr
                        key={id}
                        onClick={() => onRowClick?.(row)}
                        onContextMenu={(e) => openContextMenu(e, row)}
                        className={cn(
                          'border-b border-border/60 last:border-0 transition-colors duration-[var(--duration-fast)] group',
                          onRowClick && 'cursor-pointer hover:bg-accent/5',
                          i % 2 === 0 ? '' : 'bg-surface2/30',
                          focusedIndex === i && 'bg-accent/8 ring-1 ring-inset ring-accent/30'
                        )}
                      >
                        {selectable && (
                          <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                            <Checkbox checked={selectedIds.includes(id)} onChange={() => toggleOne(id)} />
                          </td>
                        )}
                        {visibleColumns.map(col => {
                          const isEditing = editingCell && editingCell.rowId === id && editingCell.key === col.key
                          return (
                            <td
                              key={col.key}
                              className={cn('px-3 py-2 text-[12.5px] text-text', ALIGN[col.align] || ALIGN.left, col.className)}
                              onDoubleClick={(e) => {
                                if (!col.editable) return
                                e.stopPropagation()
                                setEditingCell({ rowId: id, key: col.key })
                              }}
                            >
                              {isEditing ? (
                                col.editType === 'select' ? (
                                  <select
                                    autoFocus
                                    defaultValue={row[col.key]}
                                    onClick={(e) => e.stopPropagation()}
                                    onBlur={(e) => commitEdit(row, col, e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Escape') setEditingCell(null) }}
                                    className="w-full h-7 px-1.5 rounded-[var(--radius-sm)] border border-accent bg-surface text-xs text-text outline-none"
                                  >
                                    {(col.options || []).map(opt => <option key={opt.value ?? opt} value={opt.value ?? opt}>{opt.label ?? opt}</option>)}
                                  </select>
                                ) : (
                                  <input
                                    autoFocus
                                    defaultValue={row[col.key]}
                                    onClick={(e) => e.stopPropagation()}
                                    onBlur={(e) => commitEdit(row, col, e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') e.currentTarget.blur()
                                      if (e.key === 'Escape') setEditingCell(null)
                                    }}
                                    className="w-full h-7 px-1.5 rounded-[var(--radius-sm)] border border-accent bg-surface text-xs text-text outline-none"
                                  />
                                )
                              ) : (
                                col.render ? col.render(row) : row[col.key]
                              )}
                            </td>
                          )
                        })}
                        {rowActions && (
                          <td className="px-3 py-2 text-right opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                            {rowActions(row)}
                          </td>
                        )}
                      </tr>
                    )
                  })}
            </tbody>
          </table>
        </div>
      </div>

      {contextMenu && (() => {
        const top = contextMenu.y + 200 > window.innerHeight ? Math.max(8, contextMenu.y - 180) : contextMenu.y
        const left = contextMenu.x + 180 > window.innerWidth ? Math.max(8, contextMenu.x - 180) : contextMenu.x
        return (
          <div
            className="fixed min-w-[180px] bg-surface border border-border rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] p-1.5 flex flex-col gap-0.5"
            style={{ top, left, zIndex: 'var(--z-dropdown)' }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {contextMenuItems(contextMenu.row).map((item, i) =>
              item === 'divider' ? (
                <div key={i} className="h-px bg-border my-1" />
              ) : (
                <button
                  key={typeof item === 'object' && item.label ? item.label : i}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); item.onClick?.(); setContextMenu(null) }}
                  className={cn(
                    'focus-ring flex items-center gap-2 px-2.5 py-2 rounded-[var(--radius-sm)] text-sm font-medium text-left transition-colors duration-[var(--duration-fast)]',
                    item.danger ? 'text-red hover:bg-red/10' : 'text-text hover:bg-surface2'
                  )}
                >
                  {item.icon && <Icon name={item.icon} size={13} />}
                  {item.label}
                </button>
              )
            )}
          </div>
        )
      })()}

      {/* Mobile: stacked cards, no table at all */}
      <div className="md:hidden flex flex-col gap-2">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-[var(--radius-lg)]" />)
          : sortedData.map(row => {
              const id = getRowId(row)
              if (mobileCard) return <div key={id} onClick={() => onRowClick?.(row)}>{mobileCard(row)}</div>
              return (
                <div
                  key={id}
                  onClick={() => onRowClick?.(row)}
                  onContextMenu={(e) => openContextMenu(e, row)}
                  className={cn('bg-surface border border-border rounded-[var(--radius-lg)] p-3 flex flex-col gap-1.5', onRowClick && 'cursor-pointer')}
                >
                  {selectable && (
                    <div onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selectedIds.includes(id)} onChange={() => toggleOne(id)} />
                    </div>
                  )}
                  {visibleColumns.map(col => (
                    <div key={col.key} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-xs font-semibold text-text3">{col.header}</span>
                      <span className="text-text text-right">{col.render ? col.render(row) : row[col.key]}</span>
                    </div>
                  ))}
                  {rowActions && <div className="pt-1.5 border-t border-border mt-1 flex justify-end" onClick={(e) => e.stopPropagation()}>{rowActions(row)}</div>}
                </div>
              )
            })}
      </div>
    </div>
  )
}
