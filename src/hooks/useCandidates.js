import { useState, useEffect, useCallback } from 'react'
import { db } from '../lib/api'
import { useAuth } from '../context/AuthContext'

export function useCandidates(options = {}) {
  const { allOrgs = false } = options
  const { user, profile } = useAuth()
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    try {
      setLoading(true)
      console.log('[useCandidates] Fetching candidates for user:', user?.id, 'allOrgs:', allOrgs)
      let query = db.from('candidates').select('*').order('created_at', { ascending: false })
      if (allOrgs) {
        query = query.param('all_orgs', 'true')
      }
      const { data, error } = await query
      
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
  }, [user, allOrgs])

  useEffect(() => { 
    console.log('[useCandidates] useEffect triggered, user:', user?.id, 'allOrgs:', allOrgs)
    if (user) fetch() 
  }, [user, fetch, allOrgs])

  const cleanDates = (data) => {
    const dateFields = ['submission_date', 'interview_date', 'followup_date']
    const cleaned = { ...data }
    dateFields.forEach(f => {
      if (!cleaned[f] || cleaned[f] === '') cleaned[f] = null
    })
    if (cleaned.experience !== undefined && cleaned.experience !== null && cleaned.experience !== '') {
      cleaned.experience = String(cleaned.experience)
    } else {
      cleaned.experience = null
    }
    return cleaned
  }

  const addCandidate = async (candidate) => {
    const payload = cleanDates(candidate)
    const { data, error } = await db
      .from('candidates')
      .insert([{
        ...payload,
        user_id: user.id,
        org_id: profile?.org_id
      }])
      .select()
    if (error) {
      console.error('[addCandidate] Error:', error)
      return { data: null, error }
    }
    const createdItem = Array.isArray(data) ? data[0] : data
    if (createdItem) {
      setCandidates(prev => [createdItem, ...prev])
    }
    return { data: createdItem, error: null }
  }

  const updateCandidate = async (id, updates) => {
    const payload = cleanDates(updates)
    const { data, error } = await db
      .from('candidates')
      .update(payload)
      .eq('id', id)
      .select()
    if (error) {
      console.error('[updateCandidate] Error:', error)
      return { data: null, error }
    }
    const updatedItem = Array.isArray(data) ? data[0] : data
    if (updatedItem) {
      setCandidates(prev => prev.map(c => c.id === id ? { ...c, ...updatedItem } : c))
    }
    return { data: updatedItem, error: null }
  }

  const deleteCandidate = async (id) => {
    const { error } = await db.from('candidates').delete().eq('id', id)
    if (!error) setCandidates(prev => prev.filter(c => c.id !== id))
    return { error }
  }

  return { candidates, loading, addCandidate, updateCandidate, deleteCandidate, refetch: fetch }
}
