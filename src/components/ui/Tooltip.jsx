import { useState } from 'react'
import { cn } from './utils'

const SIDE_CLS = {
  top: 'bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2',
  bottom: 'top-[calc(100%+6px)] left-1/2 -translate-x-1/2',
  left: 'right-[calc(100%+6px)] top-1/2 -translate-y-1/2',
  right: 'left-[calc(100%+6px)] top-1/2 -translate-y-1/2',
}

export default function Tooltip({ label, side = 'top', children, className = '' }) {
  const [visible, setVisible] = useState(false)
  if (!label) return children

  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          className={cn(
            'absolute whitespace-nowrap px-2 py-1 rounded-[var(--radius-sm)] bg-surface3 border border-border text-text text-xs font-semibold shadow-[var(--shadow-md)] pointer-events-none',
            SIDE_CLS[side]
          )}
          style={{ zIndex: 'var(--z-tooltip)' }}
        >
          {label}
        </span>
      )}
    </span>
  )
}
