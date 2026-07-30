import { useEffect, useRef, useState } from 'react'

/**
 * Custom-styled select. Replaces native <select> where the browser's native
 * option popup can render wider than its trigger and overflow parents (e.g.
 * inside a narrow modal column) — the panel here is always clamped to the
 * trigger's own width, so it can never escape its container.
 */
export default function Select({ value, onChange, options, disabled, placeholder = 'Select...' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const handleKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const selected = options.find(o => o.value === value)

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          background: 'var(--surface2)',
          border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: '8px',
          padding: '10px 14px',
          color: selected ? 'var(--text)' : 'var(--text3)',
          fontSize: '14px',
          fontFamily: 'inherit',
          textAlign: 'left',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          boxSizing: 'border-box',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : placeholder}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease', color: 'var(--text3)' }}>
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            width: '100%',
            maxHeight: '260px',
            overflowY: 'auto',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
            zIndex: 2000,
            boxSizing: 'border-box',
            padding: '6px',
          }}
        >
          {options.map(o => (
            <div
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false) }}
              style={{
                padding: '9px 10px',
                borderRadius: '7px',
                fontSize: '13px',
                fontWeight: o.value === value ? '700' : '500',
                color: o.value === value ? 'var(--accent)' : 'var(--text)',
                background: o.value === value ? 'rgba(79,124,255,0.10)' : 'transparent',
                cursor: 'pointer',
                whiteSpace: 'normal',
                wordBreak: 'break-word',
                lineHeight: '1.35',
              }}
              onMouseEnter={e => { if (o.value !== value) e.currentTarget.style.background = 'var(--surface2)' }}
              onMouseLeave={e => { if (o.value !== value) e.currentTarget.style.background = 'transparent' }}
            >
              <div>{o.label}</div>
              {o.desc && (
                <div style={{ fontSize: '11.5px', color: 'var(--text3)', fontWeight: '400', marginTop: '2px' }}>{o.desc}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
