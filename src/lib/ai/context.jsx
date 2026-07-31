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
    setPageContext(prev => ({ ...prev, ...partial }))
  }, [])

  // Removes only the keys a given publisher contributed, rather than
  // wiping the whole shared context — important once more than one
  // component on a page publishes context at once (e.g. the page itself
  // plus an open EntityDrawer), so one unmounting doesn't clobber another.
  const unsetContext = useCallback((partial) => {
    setPageContext(prev => {
      const next = { ...prev }
      Object.keys(partial || {}).forEach(key => { delete next[key] })
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
  const key = JSON.stringify(partial || {})
  useEffect(() => {
    if (!partial) return
    setContext(partial)
    return () => unsetContext(partial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}
