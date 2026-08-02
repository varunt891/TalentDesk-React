import { useEffect, useRef, useState, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './icons'
import { cn } from './utils'

/**
 * Generic popover menu: pass a `trigger` render-prop (receives { open,
 * toggle }) and `items` ({ label, icon, onClick, danger, disabled } | 'divider').
 * Renders via React portal with dynamic viewport positioning so it opens upwards
 * when near the bottom of the table or window, preventing overflow clipping.
 */
export default function Menu({ trigger, items = [], align = 'end', className = '' }) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState(null)
  const ref = useRef(null)
  const menuRef = useRef(null)

  const updatePosition = () => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top

    const menuHeight = menuRef.current ? menuRef.current.offsetHeight : 220
    const menuWidth = menuRef.current ? menuRef.current.offsetWidth : 190
    const openUp = spaceBelow < menuHeight && spaceAbove > spaceBelow

    const style = {
      position: 'fixed',
      zIndex: 'var(--z-dropdown, 9999)',
    }

    if (openUp) {
      style.bottom = `${Math.max(8, window.innerHeight - rect.top + 6)}px`
      style.maxHeight = `${Math.min(rect.top - 16, 360)}px`
    } else {
      style.top = `${Math.max(8, rect.bottom + 6)}px`
      style.maxHeight = `${Math.min(window.innerHeight - rect.bottom - 16, 360)}px`
    }

    let leftPos = rect.left
    if (align === 'end') {
      leftPos = rect.right - menuWidth
    }

    // Clamp to viewport edges with 8px margin
    leftPos = Math.max(8, Math.min(leftPos, window.innerWidth - menuWidth - 8))
    style.left = `${leftPos}px`

    setCoords(style)
  }

  useLayoutEffect(() => {
    if (open) {
      updatePosition()
    } else {
      setCoords(null)
    }
  }, [open, align])

  useEffect(() => {
    if (!open) return

    const handleClick = (e) => {
      if (
        ref.current && !ref.current.contains(e.target) &&
        menuRef.current && !menuRef.current.contains(e.target)
      ) {
        setOpen(false)
      }
    }

    const handleKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }

    const handleScrollOrResize = () => {
      updatePosition()
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    window.addEventListener('scroll', handleScrollOrResize, true)
    window.addEventListener('resize', handleScrollOrResize)

    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
      window.removeEventListener('scroll', handleScrollOrResize, true)
      window.removeEventListener('resize', handleScrollOrResize)
    }
  }, [open])

  return (
    <div ref={ref} className={cn('relative inline-block', className)}>
      {trigger({ open, toggle: () => setOpen(o => !o) })}
      {open && coords && createPortal(
        <div
          ref={menuRef}
          className="fixed min-w-[180px] overflow-y-auto bg-surface border border-border rounded-[var(--radius-md)] shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset,var(--shadow-lg)] p-1.5 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-100"
          style={coords}
        >
          {items.map((item, i) =>
            item === 'divider' ? (
              <div key={i} className="h-px bg-border my-1" />
            ) : (
              <button
                key={typeof item === 'object' && item.label ? item.label : i}
                type="button"
                disabled={item.disabled}
                onClick={(e) => {
                  e.stopPropagation()
                  item.onClick?.()
                  setOpen(false)
                }}
                className={cn(
                  'focus-ring flex items-center gap-2 px-2.5 py-2 rounded-[var(--radius-sm)] text-sm font-medium text-left transition-colors duration-[var(--duration-fast)]',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                  item.danger ? 'text-red hover:bg-red/10' : 'text-text hover:bg-surface2'
                )}
              >
                {item.icon && <Icon name={item.icon} size={13} />}
                {item.label}
              </button>
            )
          )}
        </div>,
        document.body
      )}
    </div>
  )
}

export function MenuTrigger({ open, toggle, className = '' }) {
  return (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={open}
      className={cn('focus-ring w-7 h-7 rounded-full flex items-center justify-center text-text3 hover:bg-surface2 hover:text-text transition-colors duration-[var(--duration-fast)]', className)}
    >
      <Icon name="moreHorizontal" size={15} />
    </button>
  )
}

