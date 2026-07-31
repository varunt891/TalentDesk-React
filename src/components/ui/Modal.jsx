import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './icons'
import { cn } from './utils'

function useOverlayBehavior(open, onClose) {
  useEffect(() => {
    if (!open) return
    const handleKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', handleKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])
}

function Header({ title, subtitle, onClose }) {
  if (!title && !onClose) return null
  return (
    <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-border shrink-0">
      <div className="min-w-0">
        {title && <h2 className="text-[17px] font-bold text-text tracking-tight truncate">{title}</h2>}
        {subtitle && <p className="text-[13px] text-text3 mt-1 leading-relaxed">{subtitle}</p>}
      </div>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Close" className="focus-ring shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-text3 hover:bg-surface2 hover:text-text transition-colors duration-[var(--duration-fast)]">
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  )
}

const MODAL_SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }

export default function Modal({ open, onClose, title, subtitle, size = 'md', footer, hideHeader = false, children, className = '' }) {
  useOverlayBehavior(open, onClose)
  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-4 bg-[#0b0d14]/55 backdrop-blur-sm"
      style={{ zIndex: 'var(--z-modal)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div
        className={cn(
          'w-full bg-surface border border-border rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] max-h-[90vh] flex flex-col',
          'animate-[modal-in_var(--duration-base)_var(--ease-standard)]',
          MODAL_SIZES[size] || MODAL_SIZES.md,
          className
        )}
      >
        {hideHeader ? children : (
          <>
            <Header title={title} subtitle={subtitle} onClose={onClose} />
            <div className="px-6 py-5 overflow-y-auto flex-1">{children}</div>
            {footer && <div className="px-6 py-4 border-t border-border bg-surface2/50 rounded-b-[var(--radius-lg)] flex items-center justify-end gap-2 shrink-0">{footer}</div>}
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

const DRAWER_SIZES = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-xl' }

export function Drawer({ open, onClose, title, subtitle, size = 'md', side = 'right', footer, hideHeader = false, children, className = '' }) {
  useOverlayBehavior(open, onClose)
  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 flex bg-[#0b0d14]/55 backdrop-blur-sm"
      style={{ zIndex: 'var(--z-modal)', justifyContent: side === 'right' ? 'flex-end' : 'flex-start' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div
        className={cn(
          'w-full h-full bg-surface border-border flex flex-col shadow-[var(--shadow-lg)]',
          side === 'right' ? 'border-l animate-[drawer-in-right_var(--duration-base)_var(--ease-standard)]' : 'border-r animate-[drawer-in-left_var(--duration-base)_var(--ease-standard)]',
          DRAWER_SIZES[size] || DRAWER_SIZES.md,
          className
        )}
      >
        {hideHeader ? children : (
          <>
            <Header title={title} subtitle={subtitle} onClose={onClose} />
            <div className="px-6 py-5 overflow-y-auto flex-1">{children}</div>
            {footer && <div className="px-6 py-4 border-t border-border bg-surface2/50 flex items-center justify-end gap-2 shrink-0">{footer}</div>}
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
