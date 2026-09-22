// AI Context Awareness — a lightweight global store the Copilot reads from
// so it knows what the recruiter is looking at without being told. Wired
// at the App level for page identity today (currentPage/org/user); any
// page CAN additionally call useAISetContext({...}) to publish finer-grained
// context (current entity, filters, selection) once that module is ready
// for AI integration — none do yet, this phase only builds the mechanism.
import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react'

const AIContext = createContext(null)

export function AIContextProvider({ currentPage, children }) {
  const [pageContext, setPageContext] = useState({})

  const setContext = useCallback((partial) => {
    if (!partial) return
    setPageContext(prev => {
      let changed = false
      for (const [k, v] of Object.entries(partial)) {
        if (prev[k] !== v) { changed = true; break }
      }
      if (!changed) return prev
      return { ...prev, ...partial }
    })
  }, [])

  const unsetContext = useCallback((partial) => {
    if (!partial) return
    setPageContext(prev => {
      let changed = false
      for (const k of Object.keys(partial)) {
        if (k in prev) { changed = true; break }
      }
      if (!changed) return prev
      const next = { ...prev }
      Object.keys(partial).forEach(key => { delete next[key] })
      return next
    })
  }, [])

  const clearContext = useCallback(() => setPageContext({}), [])

  const value = useMemo(() => ({ currentPage, pageContext, setContext, unsetContext, clearContext }), [currentPage, pageContext, setContext, unsetContext, clearContext])

  return <AIContext.Provider value={value}>{children}</AIContext.Provider>
}

export function useAIWorkspaceContext() {
  const ctx = useContext(AIContext)
  if (!ctx) return { currentPage: null, pageContext: {}, setContext: () => {}, unsetContext: () => {}, clearContext: () => {} }
  return ctx
}

// Opt-in hook for pages/components to publish page-specific AI context
// (current candidate, job, stage, filters, selection...) so the Copilot
// can reason about what the recruiter is looking at without being told.
export function useAISetContext(partial) {
  const { setContext, unsetContext } = useAIWorkspaceContext()
  const serialized = partial ? JSON.stringify(partial) : ''

  useEffect(() => {
    if (!partial || Object.keys(partial).length === 0) return
    setContext(partial)
    return () => {
      unsetContext(partial)
    }
  }, [serialized, setContext, unsetContext])
}
