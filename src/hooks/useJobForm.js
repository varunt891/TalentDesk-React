import { useState, useEffect } from 'react'
import { db, apiRequest } from '../lib/api'
import { runAiAction } from '../lib/ai/aiClient'
import { logUsageEvent } from '../lib/ai/usage'
import { fallbackExtractSkills } from '../lib/skillExtraction'
import { canManageJobAssignment } from '../lib/roles'

export const emptyJobForm = {
  job_id: '', title: '', client: '', location: '', type: 'Contract',
  status: 'Open', rate: '', open_date: new Date().toISOString().slice(0, 10),
  priority: 'Medium', fe: '', skills: [], description: '',
  contact_name: '', optional_ref: '', bill_rate: '', pay_rate: '',
  end_date: '', submittal_due: '', workers_comp_code: '',
  openings: '', max_submittals: '', experience_level: '', work_mode: 'Onsite',
  assigned_to: [],
}

// Shared Add/Edit Job form logic — used by both Jobs.jsx (the list page) and
// JobDetail.jsx (in-place "Edit Job", no page navigation) so there's exactly
// one copy of the save/AI-generate/skill-extract logic to maintain, not two
// drawers that can drift out of sync.
export function useJobForm({ jobs = [], fetchJobs, profile, user, orgId, userId, aiEnabled, openEditJobId } = {}) {
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyJobForm)
  const [skillInput, setSkillInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [generatingDescription, setGeneratingDescription] = useState(false)
  const [extractingJobSkills, setExtractingJobSkills] = useState(false)
  const [profiles, setProfiles] = useState([])

  useEffect(() => {
    db.from('profiles').select('*').then(({ data }) => setProfiles(data || [])).catch(() => {})
  }, [])

  const canManageAssignment = canManageJobAssignment(profile?.role)

  const titleOptions = [...new Set(jobs.map(j => j.title).filter(Boolean))].sort()
  const locationOptions = [...new Set(jobs.map(j => j.location).filter(Boolean))].sort()

  const openAdd = () => { setForm(emptyJobForm); setEditingId(null); setSkillInput(''); setShowModal(true) }
  const openEdit = (j) => {
    setForm({
      job_id: j.job_id || '', title: j.title || '', client: j.client || '', location: j.location || '', type: j.type || 'Contract', status: j.status || 'Open', rate: j.rate || '', open_date: j.open_date || new Date().toISOString().slice(0, 10), priority: j.priority || 'Medium', fe: j.fe || '', skills: j.skills || [], description: j.description || '',
      contact_name: j.contact_name || '', optional_ref: j.optional_ref || '', bill_rate: j.bill_rate || '', pay_rate: j.pay_rate || '',
      end_date: j.end_date || '', submittal_due: j.submittal_due || '', workers_comp_code: j.workers_comp_code || '',
      openings: j.openings ?? '', max_submittals: j.max_submittals ?? '', experience_level: j.experience_level || '', work_mode: j.work_mode || 'Onsite',
      assigned_to: Array.isArray(j.assigned_to) ? j.assigned_to : [],
    })
    setEditingId(j.id); setSkillInput(''); setShowModal(true)
  }

  // Arriving here from JobDetail's "Edit Job" button — auto-open the edit
  // drawer for that job once the list has loaded, once per navigation.
  const [handledEditJobId, setHandledEditJobId] = useState(null)
  useEffect(() => {
    if (!openEditJobId || openEditJobId === handledEditJobId || jobs.length === 0) return
    const target = jobs.find(j => j.id === openEditJobId)
    if (target) {
      openEdit(target)
      setHandledEditJobId(openEditJobId)
    }
  }, [openEditJobId, jobs, handledEditJobId])

  const handleSave = async () => {
    if (!form.title) return { error: { message: 'Job title required' } }
    setSaving(true)
    const nowIso = new Date().toISOString()
    const payload = {
      ...form,
      open_date: form.open_date || null,
      end_date: form.end_date || null,
      submittal_due: form.submittal_due || null,
      openings: form.openings === '' ? null : Number(form.openings),
      max_submittals: form.max_submittals === '' ? null : Number(form.max_submittals),
      user_id: user.id,
      updated_at: nowIso,
    }
    if (!canManageAssignment) delete payload.assigned_to

    let result
    if (editingId) {
      const { error } = await db.from('jobs').update(payload).eq('id', editingId)
      result = { error, updated: true }
    } else {
      const { error } = await db.from('jobs').insert([payload])
      result = { error, updated: false }
    }
    if (!result.error) {
      await fetchJobs?.()
      setShowModal(false)
    }
    setSaving(false)
    return result
  }

  const addSkill = (e) => {
    if (e.key === 'Enter' && skillInput.trim()) {
      e.preventDefault()
      if (!form.skills.includes(skillInput.trim())) setForm(f => ({ ...f, skills: [...f.skills, skillInput.trim()] }))
      setSkillInput('')
    }
  }

  const handleGenerateDescriptionAI = async () => {
    if (!form.title?.trim()) return { error: { message: 'Add a job title first' } }
    setGeneratingDescription(true)
    const startedAt = new Date().getTime()
    const content = [
      `Job Title: ${form.title}`,
      form.rate ? `Rate/Salary: ${form.rate}` : null,
      form.location ? `Location: ${form.location}` : null,
      form.client ? `Client: ${form.client}` : null,
      form.type ? `Employment Type: ${form.type}` : null,
    ].filter(Boolean).join('\n')
    try {
      const res = await runAiAction({
        action: 'draft',
        content,
        context: 'Write a clear, professional job description (150-250 words) covering responsibilities and requirements for this role. Do not invent a company name, benefits, or specifics not given.',
      })
      if (res.success === false) throw new Error(res.error || 'Description generation failed.')
      setForm(f => ({ ...f, description: res.text }))
      logUsageEvent(orgId, userId, { type: 'action', action: 'draft', source: 'jobs', success: true, provider: res.provider, model: res.model, durationMs: new Date().getTime() - startedAt, preview: res.text.slice(0, 140) })
      return { error: null }
    } catch (err) {
      const message = err.message || 'Description generation failed. Please try again.'
      logUsageEvent(orgId, userId, { type: 'action', action: 'draft', source: 'jobs', success: false, error: message, durationMs: new Date().getTime() - startedAt })
      return { error: { message } }
    } finally {
      setGeneratingDescription(false)
    }
  }

  const handleExtractJobSkillsAI = async () => {
    if (!form.description?.trim()) return { error: { message: 'Add or generate a description first' } }
    setExtractingJobSkills(true)
    const startedAt = new Date().getTime()
    try {
      const res = await apiRequest('/ai/generate', {
        method: 'POST',
        body: {
          toolId: 'job_skills',
          prompt: `Extract up to 10 key required skills from this job description:\n\n${form.description}`
        }
      })
      let extracted = []
      if (res && res.text) {
        try {
          const cleaned = res.text.replace(/```json/gi, '').replace(/```/g, '').trim()
          extracted = JSON.parse(cleaned)
        } catch {
          const match = res.text.match(/\[.*?\]/s)
          try { extracted = JSON.parse(match[0]) } catch (e) {
            console.warn('Fallback JSON parse failed', e)
          }
        }
      }

      if (!Array.isArray(extracted) || extracted.length === 0) {
        extracted = fallbackExtractSkills(form.description)
      }

      if (extracted.length > 0) {
        const top10 = extracted.map(s => String(s).trim()).filter(Boolean).slice(0, 10)
        setForm(f => ({
          ...f,
          skills: Array.from(new Set([...(f.skills || []), ...top10]))
        }))
        logUsageEvent(orgId, userId, { type: 'action', action: 'extract', source: 'jobs', success: true, durationMs: new Date().getTime() - startedAt })
        return { error: null, count: top10.length }
      }
      return { error: { message: 'No skills detected in description' } }
    } catch (err) {
      console.warn('[AI Job Skill Extractor] Error, falling back to keyword matcher:', err)
      const fallback = fallbackExtractSkills(form.description)
      logUsageEvent(orgId, userId, { type: 'action', action: 'extract', source: 'jobs', success: false, error: err.message, durationMs: new Date().getTime() - startedAt })
      if (fallback.length > 0) {
        setForm(f => ({
          ...f,
          skills: Array.from(new Set([...(f.skills || []), ...fallback]))
        }))
        return { error: null, count: fallback.length, fallback: true }
      }
      return { error: { message: 'Failed to extract skills' } }
    } finally {
      setExtractingJobSkills(false)
    }
  }

  const inp = (field) => ({ value: form[field], onChange: e => setForm(f => ({ ...f, [field]: e.target.value })) })

  return {
    showModal, setShowModal, editingId, form, setForm, skillInput, setSkillInput,
    saving, generatingDescription, extractingJobSkills, profiles, canManageAssignment,
    titleOptions, locationOptions, aiEnabled,
    openAdd, openEdit, handleSave, addSkill, handleGenerateDescriptionAI, handleExtractJobSkillsAI, inp,
  }
}
