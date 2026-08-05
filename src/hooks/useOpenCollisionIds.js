import { useState, useEffect } from 'react'
import { db } from '../lib/api'

// Candidate ids currently involved in an open submission collision, shared
// between Candidates.jsx (table badge) and Pipeline.jsx (kanban card icon)
// so both read the same lightweight fetch instead of duplicating it.
export function useOpenCollisionIds() {
  const [ids, setIds] = useState(new Set())

  useEffect(() => {
    db.from('submission_collisions').select('*').eq('status', 'open').then(({ data }) => {
      const next = new Set()
      ;(data || []).forEach(row => {
        if (row.candidate_id) next.add(row.candidate_id)
        if (row.matched_candidate_id) next.add(row.matched_candidate_id)
      })
      setIds(next)
    }).catch(() => { /* badge is supplementary; ignore failures */ })
  }, [])

  return ids
}
