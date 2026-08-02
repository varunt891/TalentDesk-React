import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './icons'
import { cn } from './utils'

const ToastContext = createContext(null)

const TONE = {
  success: { icon: 'checkCircle', cls: 'text-green' },
  error: { icon: 'xCircle', cls: 'text-red' },
  warning: { icon: 'alertCircle', cls: 'text-yellow' },
  info: { icon: 'info', cls: 'text-accent' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = useCallback((opts) => {
    const id = opts.id || `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const entry = { id, tone: 'info', duration: 4000, ...opts }
    setToasts(prev => [...prev, entry])
    if (entry.duration !== Infinity) {
      setTimeout(() => dismiss(id), entry.duration)
    }
    return id
  }, [dismiss])

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div
          className="fixed bottom-4 right-4 flex flex-col gap-2 w-[min(360px,calc(100vw-2rem))]"
          style={{ zIndex: 'var(--z-toast)' }}
        >
          {toasts.map(t => {
            const tone = TONE[t.tone] || TONE.info
            return (
              <div
                key={t.id}
                className="flex items-start gap-2.5 bg-surface border border-border rounded-[var(--radius-md)] shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset,var(--shadow-lg)] p-3 animate-[toast-in_var(--duration-base)_var(--ease-standard)]"
              >
                <Icon name={tone.icon} size={16} className={cn('shrink-0 mt-0.5', tone.cls)} />
                <div className="min-w-0 flex-1">
                  {t.title && <p className="text-sm font-bold text-text">{t.title}</p>}
                  {t.description && <p className="text-xs text-text3 mt-0.5">{t.description}</p>}
                </div>
                <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="focus-ring shrink-0 rounded-[var(--radius-sm)] text-text3 hover:text-text">
                  <Icon name="x" size={13} />
                </button>
              </div>
            )
          })}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
