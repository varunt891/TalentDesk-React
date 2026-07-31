import { useCallback, useState } from 'react'

function read(key) {
  try {
    const saved = localStorage.getItem(key)
    const parsed = saved ? JSON.parse(saved) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function write(key, views) {
  try { localStorage.setItem(key, JSON.stringify(views)) } catch { /* ignore quota errors */ }
}

/**
 * Named, persisted filter presets ("Saved Views") for a workspace page.
 * `storageKey` should be unique per page, e.g. 'td_views_candidates'.
 */
export function useSavedViews(storageKey) {
  const [views, setViews] = useState(() => read(storageKey))

  const saveView = useCallback((name, filters) => {
    setViews(prev => {
      const next = [...prev.filter(v => v.name !== name), { name, filters, id: `${Date.now()}` }]
      write(storageKey, next)
      return next
    })
  }, [storageKey])

  const deleteView = useCallback((id) => {
    setViews(prev => {
      const next = prev.filter(v => v.id !== id)
      write(storageKey, next)
      return next
    })
  }, [storageKey])

  return { views, saveView, deleteView }
}
