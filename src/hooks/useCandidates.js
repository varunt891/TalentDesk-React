import { useState, useEffect } from 'react'
import { db } from '../lib/api'
import { useAuth } from '../context/AuthContext'

export function useCandidates() {
  const { user, profile } = useAuth()
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = async () => {
    setLoading(true)
    const { data, error } = await db
      .from('candidates')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error) setCandidates(data || [])
    setLoading(false)
  }

  useEffect(() => { if (user) fetch() }, [user])

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