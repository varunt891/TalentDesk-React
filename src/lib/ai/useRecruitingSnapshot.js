import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchWorkspaceSnapshot } from './workspaceSnapshot'

export function useRecruitingSnapshot(orgId, userId) {
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const generation = useRef(0)
  const refresh = useCallback(async () => {
    const request = ++generation.current
    setLoading(true)
    setError(null)
    try {
      const next = await fetchWorkspaceSnapshot()
      if (request !== generation.current) return null
      setSnapshot(next)
      return next
    } catch (err) {
      if (request === generation.current) setError(err.message || 'Could not load recruiting records.')
      return null
    } finally {
      if (request === generation.current) setLoading(false)
    }
  }, [])
  useEffect(() => {
    setSnapshot(null)
    if (orgId && userId) refresh()
    return () => { generation.current += 1 }
  }, [orgId, userId, refresh])
  return { snapshot, loading, error, refresh }
}
