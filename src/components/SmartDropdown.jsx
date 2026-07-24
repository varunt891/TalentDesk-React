import { useEffect, useRef } from 'react'

/**
 * DropdownPanel — Dead-simple absolute-positioned dropdown.
 * Renders inline (no portal). The PARENT must have position:relative.
 * 
 * Zero coordinate calculation. Pure CSS. Always visible.
 */
export function DropdownPanel({ isOpen, onClose, children, width = 260, align = 'left' }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!isOpen) return

    const handleClick = (e) => {
      if (ref.current && ref.current.contains(e.target)) return
      onClose?.()
    }
    const handleKey = (e) => { if (e.key === 'Escape') onClose?.() }

    // Delay attaching so the click that opened the dropdown isn't immediately caught
    const t = setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
      document.addEventListener('keydown', handleKey)
    }, 50)

    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      ref={ref}
      data-dropdown-panel
      style={{
        position: 'absolute',
        top: 'calc(100% + 6px)',
        [align === 'right' ? 'right' : 'left']: 0,
        zIndex: 99999,
        minWidth: `${width}px`,
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        boxShadow: '0 12px 40px rgba(15, 23, 42, 0.20), 0 2px 8px rgba(15, 23, 42, 0.08)',
        overflow: 'hidden',
        animation: 'dropdownEnter 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  )
}

// Keep old name as alias so existing imports don't break during migration
export { DropdownPanel as SmartDropdown }
