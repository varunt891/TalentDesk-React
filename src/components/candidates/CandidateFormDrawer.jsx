import { useState, useRef, useEffect } from 'react'
import { db, apiRequest, apiUpload } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import CollisionWarning from './CollisionWarning'
import { findLocalCollisionMatches } from '../../lib/collisions'
import { fallbackExtractSkills } from '../../lib/skillExtraction'
import { runAiAction } from '../../lib/ai/aiClient'
import {
  Button, Input, Textarea, FormField, Select, Combobox, Badge, Card, Icon,
  useToast, Drawer, MarkdownEditor,
} from '../ui'
import { ensureArray } from '../../lib/candidateHealth'

const STATUSES = ['Pending', 'Submitted', 'Shortlisted', 'Interview Scheduled', 'Interview Done', 'Offer Extended', 'Hired', 'Rejected', 'On Hold', 'Withdrew']
const FEEDBACK = ['Awaiting', 'Positive', 'Negative', 'No Response']
const WORK_AUTHS = ['US Citizen', 'Green Card', 'H1B', 'OPT/CPT', 'TN Visa', 'Other']

const emptyForm = {
  first_name: '', last_name: '', email: '', phone: '', location: '',
  work_auth: 'US Citizen', experience: '', linkedin: '',
  submission_date: new Date().toISOString().slice(0, 10),
  job_id: '', job_title: '', client: '', rate: '', relocation: 'No',
  internal_status: 'Pending', external_status: 'Pending',
  feedback_status: 'Awaiting', priority: 'Medium',
  interview_date: '', interview_type: '',
  fe_name: '', fe_extension: '', account_manager: '', recruiter_name: '',
  skills: [], notes: '', followup_date: '', resume_text: '',
  resume_file_key: '', resume_file_name: '', resume_file_size: null,
}

function FormSectionTitle({ children }) {
  return <h3 className="text-xs font-bold text-accent uppercase tracking-wide pb-2 mb-3.5 border-b border-border">{children}</h3>
}

/**
 * Shared candidate add/edit drawer, reused in Candidates.jsx and
 * CandidateDetail.jsx so editing always works from any surface.
 *
 * Props:
 *   open          – boolean, controls drawer visibility
 *   onClose       – () => void
 *   candidateData – object | null  (null = add mode, object = edit mode)
 *   candidates    – full candidate list (for collision detection & field autocomplete)
 *   onSaved       – (updatedCandidate) => void  called after a successful save
 *   showToast     – (msg, type?) => void  (optional, falls back to built-in useToast)
 */
export default function CandidateFormDrawer({
  open,
  onClose,
  candidateData = null,
  candidates = [],
  onSaved,
  showToast: showToastProp,
}) {
  const { user, profile, organization } = useAuth()
  const { toast: pushToast } = useToast()
  const showToast = showToastProp || ((msg, type = 'success') => {
    pushToast({ tone: type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'success', title: msg })
  })

  const isEdit = Boolean(candidateData)
  const editingId = candidateData?.id || null

  const [form, setForm] = useState(emptyForm)
  const [skillInput, setSkillInput] = useState('')
  const [extractingSkills, setExtractingSkills] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formErrors, setFormErrors] = useState({})

  const firstNameRef = useRef(null)
  const jobIdRef = useRef(null)

  // Build autocomplete options from provided candidates list
  const feOptions = [...new Set(candidates.map(c => c.fe_name).filter(Boolean))].sort()
  const recruiterOptions = [...new Set(candidates.map(c => c.recruiter_name).filter(Boolean))].sort()
  const locationOptions = [...new Set(candidates.map(c => c.location).filter(Boolean))].sort()
  const jobTitleOptions = [...new Set(candidates.map(c => c.job_title).filter(Boolean))].sort()

  // Collision detection
  const collisionMatches = findLocalCollisionMatches(candidates, form, editingId)

  // Populate form when candidateData changes (opening edit mode)
  useEffect(() => {
    if (open) {
      if (candidateData) {
        setForm({
          first_name: candidateData.first_name || '',
          last_name: candidateData.last_name || '',
          email: candidateData.email || '',
          phone: candidateData.phone || '',
          location: candidateData.location || '',
          work_auth: candidateData.work_auth || 'US Citizen',
          experience: candidateData.experience || '',
          linkedin: candidateData.linkedin || '',
          submission_date: candidateData.submission_date || new Date().toISOString().slice(0, 10),
          job_id: candidateData.job_id || '',
          job_title: candidateData.job_title || '',
          client: candidateData.client || '',
          rate: candidateData.rate || '',
          relocation: candidateData.relocation || 'No',
          internal_status: candidateData.internal_status || 'Pending',
          external_status: candidateData.external_status || 'Pending',
          feedback_status: candidateData.feedback_status || 'Awaiting',
          priority: candidateData.priority || 'Medium',
          interview_date: candidateData.interview_date || '',
          interview_type: candidateData.interview_type || '',
          fe_name: candidateData.fe_name || '',
          fe_extension: candidateData.fe_extension || '',
          account_manager: candidateData.account_manager || '',
          recruiter_name: candidateData.recruiter_name || '',
          skills: ensureArray(candidateData.skills),
          notes: candidateData.notes || '',
          followup_date: candidateData.followup_date || '',
          resume_text: candidateData.resume_text || '',
          resume_file_key: candidateData.resume_file_key || '',
          resume_file_name: candidateData.resume_file_name || '',
          resume_file_size: candidateData.resume_file_size || null,
        })
      } else {
        setForm(emptyForm)
      }
      setSkillInput('')
      setFormErrors({})
    }
  }, [open, candidateData?.id])

  const inp = (field) => ({
    value: form[field],
    onChange: e => {
      setForm(f => ({ ...f, [field]: e.target.value }))
      if (formErrors[field]) setFormErrors(errs => { const next = { ...errs }; delete next[field]; return next })
    },
  })

  const addSkill = (e) => {
    if (e.key === 'Enter' && skillInput.trim()) {
      e.preventDefault()
      const current = ensureArray(form.skills)
      if (!current.includes(skillInput.trim())) setForm(f => ({ ...f, skills: [...current, skillInput.trim()] }))
      setSkillInput('')
    }
  }

  // ── AI helpers ──────────────────────────────────────────────────────────────

  const handleExtractSkillsAI = async () => {
    if (!form.resume_text?.trim()) return showToast('Please paste resume text first', 'error')
    setExtractingSkills(true)
    try {
      const res = await apiRequest('/ai/generate', {
        method: 'POST',
        body: { toolId: 'resume_skills', prompt: `Extract up to 10 key technical and professional skills from this candidate resume:\n\n${form.resume_text}` }
      })
      let extracted = []
      if (res?.text) {
        try {
          const cleaned = res.text.replace(/```json/gi, '').replace(/```/g, '').trim()
          extracted = JSON.parse(cleaned)
        } catch {
          const match = res.text.match(/\[.*?\]/s)
          try { extracted = JSON.parse(match[0]) } catch { /* noop */ }
        }
      }
      if (!Array.isArray(extracted) || extracted.length === 0) extracted = fallbackExtractSkills(form.resume_text)
      if (extracted.length > 0) {
        const top10 = extracted.map(s => String(s).trim()).filter(Boolean).slice(0, 10)
        setForm(f => ({ ...f, skills: Array.from(new Set([...(f.skills || []), ...top10])) }))
        showToast(`AI extracted ${top10.length} skills!`)
      } else {
        showToast('No skills detected in resume', 'error')
      }
    } catch (err) {
      const fallback = fallbackExtractSkills(form.resume_text)
      if (fallback.length > 0) {
        setForm(f => ({ ...f, skills: Array.from(new Set([...(f.skills || []), ...fallback])) }))
        showToast(`Extracted ${fallback.length} skills (local engine)`)
      } else {
        showToast('Failed to extract skills', 'error')
      }
    } finally {
      setExtractingSkills(false)
    }
  }

  const handleAutoFillProfileAI = async () => {
    if (!form.resume_text?.trim()) return showToast('Please paste resume text or upload a resume file first', 'error')
    setExtractingSkills(true)
    try {
      const res = await apiRequest('/ai/parse-resume', { method: 'POST', body: { resumeText: form.resume_text } })
      if (res?.profile) {
        const p = res.profile
        setForm(prev => ({
          ...prev,
          first_name: p.first_name || prev.first_name,
          last_name: p.last_name || prev.last_name,
          email: p.email || prev.email,
          phone: p.phone || prev.phone,
          location: p.location || prev.location,
          experience: p.experience != null ? String(p.experience) : prev.experience,
          work_auth: p.work_auth || prev.work_auth,
          rate: p.rate || prev.rate,
          skills: Array.isArray(p.skills) && p.skills.length > 0
            ? Array.from(new Set([...(prev.skills || []), ...p.skills]))
            : prev.skills,
        }))
        showToast('⚡ AI Auto-Filled candidate name, email, location & skills!')
      } else {
        throw new Error(res?.error || 'Could not parse profile details.')
      }
    } catch (err) {
      showToast(err.message || 'Failed to auto-fill candidate profile', 'error')
    } finally {
      setExtractingSkills(false)
    }
  }

  const handleResumeFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    if (file.size > 5 * 1024 * 1024) {
      showToast(`${file.name} is over 5MB — please upload a smaller file`, 'error')
      return
    }
    setExtractingSkills(true)
    showToast(`Parsing ${file.name}... Please wait`)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await apiUpload('/upload/resume', formData)
      if (res?.success) {
        const p = res.profile || {}
        setForm(prev => ({
          ...prev,
          resume_text: res.extractedText || prev.resume_text,
          resume_file_key: res.resume_file_key || prev.resume_file_key,
          resume_file_name: res.resume_file_name || prev.resume_file_name,
          resume_file_size: res.resume_file_size || prev.resume_file_size,
          first_name: p.first_name || prev.first_name,
          last_name: p.last_name || prev.last_name,
          email: p.email || prev.email,
          phone: p.phone || prev.phone,
          location: p.location || prev.location,
          experience: p.experience != null ? String(p.experience) : prev.experience,
          work_auth: p.work_auth || prev.work_auth,
          rate: p.rate || prev.rate,
          skills: Array.isArray(p.skills) && p.skills.length > 0
            ? Array.from(new Set([...(prev.skills || []), ...p.skills]))
            : prev.skills,
        }))
        showToast(res.resume_file_key ? `⚡ Resume saved & profile auto-filled from ${file.name}!` : `⚡ Text & profile auto-filled from ${file.name}!`)
      } else {
        throw new Error(res?.error || 'Failed to parse document text.')
      }
    } catch (err) {
      showToast(err.message || 'File upload parsing failed', 'error')
    } finally {
      setExtractingSkills(false)
    }
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  const cleanDates = (data) => {
    const dateFields = ['submission_date', 'interview_date', 'followup_date']
    const cleaned = { ...data }
    dateFields.forEach(f => { if (!cleaned[f] || cleaned[f] === '') cleaned[f] = null })
    if (cleaned.experience !== undefined && cleaned.experience !== null && cleaned.experience !== '') {
      cleaned.experience = String(cleaned.experience)
    } else {
      cleaned.experience = null
    }
    return cleaned
  }

  const handleSave = async () => {
    const errors = {}
    if (!form.first_name) errors.first_name = 'First name is required'
    if (!form.job_id) errors.job_id = 'Job ID is required'
    if (Object.keys(errors).length) {
      setFormErrors(errors)
      showToast(Object.values(errors).join(' · '), 'error')
      const target = errors.first_name ? firstNameRef.current : jobIdRef.current
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setFormErrors({})
    setSaving(true)

    const payload = cleanDates(form)

    try {
      if (isEdit) {
        const { data, error } = await db.from('candidates').update(payload).eq('id', editingId).select()
        if (error) throw error
        const updated = Array.isArray(data) ? data[0] : data
        showToast('Candidate updated!')
        onSaved?.(updated)
        onClose()
      } else {
        const { data, error } = await db.from('candidates').insert([{
          ...payload,
          user_id: user.id,
          org_id: profile?.org_id,
        }]).select()
        if (error) throw error
        const created = Array.isArray(data) ? data[0] : data
        showToast('Candidate added!')
        onSaved?.(created)
        onClose()
      }
    } catch (err) {
      showToast(err.message || 'Failed to save candidate', 'error')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Candidate' : 'Add Candidate'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={handleSave}>
            {isEdit ? 'Update Candidate' : 'Save Candidate'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">

        {/* Resume & AI */}
        <div>
          <FormSectionTitle>Resume &amp; AI Profile Parser</FormSectionTitle>
          <Card className="bg-surface2 border-accent/30 shadow-xs">
            <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-accent">Candidate Resume Text or File</label>
                <div className="text-xs text-text3 mt-0.5">Paste resume text or upload a file — AI will auto-fill name, email, phone, location, title &amp; skills!</div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <label className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[var(--radius-sm)] border border-border bg-surface3 text-text text-xs font-semibold cursor-pointer hover:bg-surface transition-colors">
                  <Icon name="download" size={12} /> Upload File
                  <input type="file" accept=".txt,.pdf,.doc,.docx" onChange={handleResumeFileUpload} className="hidden" />
                </label>
                <Button type="button" size="sm" variant="secondary" onClick={handleExtractSkillsAI} disabled={extractingSkills || !form.resume_text?.trim()}>
                  Extract Skills Only
                </Button>
                <Button type="button" size="sm" variant="ai" leftIcon="sparkles" loading={extractingSkills} onClick={handleAutoFillProfileAI} disabled={!form.resume_text?.trim()}>
                  AI Auto-Fill Full Profile
                </Button>
              </div>
            </div>
            <MarkdownEditor
              {...inp('resume_text')}
              placeholder="Paste full raw candidate resume text here... Or upload a resume file above and click 'AI Auto-Fill Full Profile'!"
              rows={5}
            />
          </Card>
        </div>

        {/* Personal Info */}
        <div>
          <FormSectionTitle>Personal Info</FormSectionTitle>
          <div className="grid sm:grid-cols-2 gap-3.5">
            <FormField label="First Name" required error={formErrors.first_name}>
              <Input ref={firstNameRef} {...inp('first_name')} error={!!formErrors.first_name} placeholder="John" />
            </FormField>
            <FormField label="Last Name"><Input {...inp('last_name')} placeholder="Smith" /></FormField>
            <FormField label="Email"><Input {...inp('email')} type="email" placeholder="john@email.com" /></FormField>
            <FormField label="Phone"><Input {...inp('phone')} placeholder="+1 555 000 0000" /></FormField>
            <FormField label="Location" required>
              <Combobox value={form.location} onChange={v => setForm(f => ({ ...f, location: v }))} options={locationOptions} placeholder="City, State" />
            </FormField>
            <FormField label="Work Auth">
              <Select value={form.work_auth} onChange={v => setForm(f => ({ ...f, work_auth: v }))} options={WORK_AUTHS.map(o => ({ value: o, label: o }))} />
            </FormField>
            <FormField label="Experience (yrs)"><Input {...inp('experience')} type="number" placeholder="5" /></FormField>
            <FormField label="LinkedIn"><Input {...inp('linkedin')} placeholder="linkedin.com/in/..." /></FormField>
          </div>
        </div>

        <CollisionWarning matches={collisionMatches} />

        {/* Submission Details */}
        <div>
          <FormSectionTitle>Submission Details</FormSectionTitle>
          <div className="grid sm:grid-cols-2 gap-3.5">
            <FormField label="Submission Date" required><Input {...inp('submission_date')} type="date" /></FormField>
            <FormField label="Job ID" required error={formErrors.job_id}>
              <Input ref={jobIdRef} {...inp('job_id')} error={!!formErrors.job_id} placeholder="JOB-001" />
            </FormField>
            <FormField label="Job Title" required>
              <Combobox value={form.job_title} onChange={v => setForm(f => ({ ...f, job_title: v }))} options={jobTitleOptions} placeholder="Software Engineer" />
            </FormField>
            <FormField label="Client"><Input {...inp('client')} placeholder="Acme Corp" /></FormField>
            <FormField label="Bill Rate"><Input {...inp('rate')} placeholder="$85/hr" /></FormField>
            <FormField label="Relocation">
              <Select value={form.relocation} onChange={v => setForm(f => ({ ...f, relocation: v }))} options={['Yes', 'No', 'Negotiable'].map(o => ({ value: o, label: o }))} />
            </FormField>
          </div>
        </div>

        {/* Status Tracking */}
        <div>
          <FormSectionTitle>Status Tracking</FormSectionTitle>
          <div className="grid sm:grid-cols-2 gap-3.5">
            <FormField label="Internal Status">
              <Select value={form.internal_status} onChange={v => setForm(f => ({ ...f, internal_status: v }))} options={STATUSES.map(s => ({ value: s, label: s }))} />
            </FormField>
            <FormField label="External Status">
              <Select value={form.external_status} onChange={v => setForm(f => ({ ...f, external_status: v }))} options={STATUSES.map(s => ({ value: s, label: s }))} />
            </FormField>
            <FormField label="Feedback Status">
              <Select value={form.feedback_status} onChange={v => setForm(f => ({ ...f, feedback_status: v }))} options={FEEDBACK.map(o => ({ value: o, label: o }))} />
            </FormField>
            <FormField label="Priority">
              <Select value={form.priority} onChange={v => setForm(f => ({ ...f, priority: v }))} options={['High', 'Medium', 'Low'].map(o => ({ value: o, label: o }))} />
            </FormField>
            <FormField label="Interview Date"><Input {...inp('interview_date')} type="date" /></FormField>
            <FormField label="Interview Type">
              <Select value={form.interview_type} onChange={v => setForm(f => ({ ...f, interview_type: v }))} options={['Phone Screen', 'Video Call', 'On-site', 'Panel', 'Technical'].map(o => ({ value: o, label: o }))} placeholder="Select type..." />
            </FormField>
          </div>
        </div>

        {/* Front End / Ownership */}
        <div>
          <FormSectionTitle>Front End / Ownership</FormSectionTitle>
          <div className="grid sm:grid-cols-2 gap-3.5">
            <FormField label="FE Name" required>
              <Combobox value={form.fe_name} onChange={v => setForm(f => ({ ...f, fe_name: v }))} options={feOptions} placeholder="Sarah K." />
            </FormField>
            <FormField label="Extension"><Input {...inp('fe_extension')} placeholder="x204" /></FormField>
            <FormField label="Account Manager"><Input {...inp('account_manager')} placeholder="Mike R." /></FormField>
            <FormField label="Recruiter">
              <Combobox value={form.recruiter_name} onChange={v => setForm(f => ({ ...f, recruiter_name: v }))} options={recruiterOptions} placeholder="Your name" />
            </FormField>
          </div>
        </div>

        {/* Skills & Notes */}
        <div>
          <FormSectionTitle>Skills &amp; Notes</FormSectionTitle>
          <div className="flex flex-col gap-3.5">
            <FormField label="Skills (press Enter to add)">
              <div
                className="bg-surface2 border border-border rounded-[var(--radius-sm)] p-2 flex flex-wrap gap-1.5 min-h-[42px] cursor-text"
                onClick={() => document.getElementById('cfd-skill-inp')?.focus()}
              >
                {ensureArray(form.skills).map(s => (
                  <Badge key={s} tone="accent">
                    {s}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setForm(f => ({ ...f, skills: ensureArray(f.skills).filter(x => x !== s) })) }}
                      className="ml-1 opacity-70 hover:opacity-100"
                    >×</button>
                  </Badge>
                ))}
                <input
                  id="cfd-skill-inp"
                  value={skillInput}
                  onChange={e => setSkillInput(e.target.value)}
                  onKeyDown={addSkill}
                  placeholder={ensureArray(form.skills).length ? '' : 'Type a skill and press Enter...'}
                  className="bg-transparent border-none outline-none text-text text-sm min-w-[160px] flex-1"
                />
              </div>
            </FormField>
            <FormField label="Notes"><Textarea {...inp('notes')} placeholder="Internal notes..." rows={3} /></FormField>
            <FormField label="Follow-up Date"><Input {...inp('followup_date')} type="date" /></FormField>
          </div>
        </div>

      </div>
    </Drawer>
  )
}
