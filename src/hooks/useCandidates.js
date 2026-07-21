import { useState, useEffect, useCallback } from 'react'
import { db } from '../lib/api'
import { useAuth } from '../context/AuthContext'

export function useCandidates() {
  const { user, profile } = useAuth()
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    try {
      setLoading(true)
      console.log('[useCandidates] Fetching candidates for user:', user?.id)
      const { data, error } = await db
        .from('candidates')
        .select('*')
        .order('created_at', { ascending: false })
      
      console.log('[useCandidates] Fetch response:', { data, error })
      
      if (!error) {
        setCandidates(data || [])
        console.log('[useCandidates] Candidates set:', data?.length || 0, 'items')
      } else {
        console.error('[useCandidates] Fetch error:', error)
      }
      setLoading(false)
    } catch (err) {
      console.error('[useCandidates] Exception:', err)
      setLoading(false)
    }
  }, [user])

  useEffect(() => { 
    console.log('[useCandidates] useEffect triggered, user:', user?.id)
    if (user) fetch() 
  }, [user, fetch])

  const cleanDates = (data) => {
    const dateFields = ['submission_date', 'interview_date', 'followup_date']
    const cleaned = { ...data }
    dateFields.forEach(f => {
      if (!cleaned[f] || cleaned[f] === '') cleaned[f] = null
    })
    return cleaned
  }

  const addCandidate = async (candidate) => {
    const { data, error } = await db
      .from('candidates')
      .insert([{
        ...cleanDates(candidate),
        user_id: user.id,
        org_id: profile?.org_id
      }])
      .select()
    if (!error) setCandidates(prev => [data[0], ...prev])
    return { data, error }
  }

  const updateCandidate = async (id, updates) => {
    const { data, error } = await db
      .from('candidates')
      .update(cleanDates(updates))
      .eq('id', id)
      .select()
    if (!error) setCandidates(prev => prev.map(c => c.id === id ? data[0] : c))
    return { data, error }
  }

  const deleteCandidate = async (id) => {
    const { error } = await db.from('candidates').delete().eq('id', id)
    if (!error) setCandidates(prev => prev.filter(c => c.id !== id))
    return { error }
  }

  return { candidates, loading, addCandidate, updateCandidate, deleteCandidate, refetch: fetch }
}
