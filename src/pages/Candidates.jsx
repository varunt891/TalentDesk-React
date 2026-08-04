import { useState, useRef, useEffect, useMemo } from 'react'
import { useCandidates } from '../hooks/useCandidates'
import { useAuth } from '../context/AuthContext'
import { db, apiRequest, apiUpload } from '../lib/api'
import SubmissionPacketModal from '../components/SubmissionPacketModal'
import AIMatchModal from '../components/AIMatchModal'
import BulkResumeUploadModal from '../components/candidates/BulkResumeUploadModal'
import * as XLSX from 'xlsx'
import { PageContainer } from '../components/layout/PageContainer'
import {
  Button, Input, Textarea, FormField, Select, Combobox, Badge, StatusPill, Card, CardHeader,
  KPICard, PageHeader, Table, Modal, Switch, Icon, Avatar, Menu, MenuTrigger, EmptyState, useToast,
} from '../components/ui'
import { WorkspaceSearch, FilterWorkspace, EntityDrawer } from '../components/workspace'
import { Drawer } from '../components/ui/Modal'
import { ensureArray, STATUS_TONE, computeScore } from '../lib/candidateHealth'
import AIInsightCard from '../components/ai/AIInsightCard'
import { useAISetContext } from '../lib/ai/context'
import { useAIGovernance } from '../lib/ai/governance'
import { runAiAction } from '../lib/ai/aiClient'
import { logUsageEvent } from '../lib/ai/usage'
import MarkdownView from '../components/MarkdownView'

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
  resume_file_key: '', resume_file_name: '', resume_file_size: null
}

function fallbackExtractSkills(text = '') {
  if (!text) return []
  const dictionary = [
    'React', 'React Native', 'Node.js', 'Express', 'TypeScript', 'JavaScript', 'Python', 'Django', 'Flask', 'FastAPI',
    'Java', 'Spring Boot', 'C++', 'C#', '.NET', 'Go', 'Golang', 'Rust', 'PHP', 'Ruby', 'Rails', 'SQL', 'PostgreSQL',
    'MySQL', 'MongoDB', 'Redis', 'GraphQL', 'REST API', 'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'CI/CD',
    'Git', 'DevOps', 'Microservices', 'HTML5', 'CSS3', 'Tailwind CSS', 'Sass', 'Figma', 'System Design', 'Agile',
    'Scrum', 'Jira', 'Unit Testing', 'Jest', 'Cypress', 'Machine Learning', 'Data Analysis', 'Tableau', 'Power BI',
    'Communication', 'Leadership', 'Problem Solving', 'Teamwork'
  ]
  const lower = text.toLowerCase()
  const matches = dictionary.filter(skill => {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`\\b${escaped}\\b`, 'i')
    return regex.test(lower)
  })
  return matches.slice(0, 10)
}

export default function Candidates() {
  const { profile, organization, user } = useAuth()
  const orgId = organization?.id || profile?.org_id
  const userId = user?.id
  const { settings: aiSettings } = useAIGovernance(orgId)
  const aiEnabled = aiSettings.workspaces.candidates !== false
  const isSuperAdmin = profile?.role === 'superadmin' || profile?.role === 'SUPERADMIN'
  const isAdmin = isSuperAdmin || profile?.role === 'admin'
  const [allOrgsView, setAllOrgsView] = useState(false)
  const { candidates, loading, addCandidate, addCandidates, updateCandidate, deleteCandidate } = useCandidates({ allOrgs: isSuperAdmin && allOrgsView })

  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ status: [], fe: [], job: [], location: [], feedback: [], org: [], recruiter: [], priority: [] })
  const [showModal, setShowModal] = useState(false)
  const [showBulkUpload, setShowBulkUpload] = useState(false)
  const [showDetail, setShowDetail] = useState(null)
  useAISetContext(showDetail ? {
    currentCandidate: `${showDetail.first_name || ''} ${showDetail.last_name || ''}`.trim(),
    candidateStatus: showDetail.internal_status,
    candidateJobTitle: showDetail.job_title,
  } : null)
  const [packetModal, setPacketModal] = useState({ isOpen: false, candidate: null, job: null })
  const [aiMatchModal, setAiMatchModal] = useState({ isOpen: false, candidate: null, job: null })
  const [editingId, setEditingId] = useState(null)

  const { toast: pushToast } = useToast()
  // Thin adapter over the shared, portal-rendered toast (renders straight
  // into document.body, so it can't get trapped behind another page
  // element's stacking context — see the local hand-rolled toast this
  // replaced, which rendered nested inside the page content and ended up
  // stuck behind the floating Copilot launcher button on every page that
  // still had its own copy).
  const showToast = (msg, type = 'success') => {
    pushToast({ tone: type === 'error' ? 'error' : 'success', title: msg })
  }

  const openPacketForCandidate = (cand) => {
    if ((organization?.subscription_plan || 'Growth') === 'Starter') {
      return showToast('⚡ 1-Click Client Submission Packets require Growth Plan. Please upgrade under Organization Settings.', 'error')
    }
    const jobMock = {
      id: cand.job_id || 'JOB-REQ',
      job_id: cand.job_id || 'JOB-REQ',
      title: cand.job_title || 'Target Requisition',
      client: cand.client || 'Client Account',
      location: cand.location || '',
      rate: cand.rate || '',
      skills: cand.skills || [],
      description: cand.notes || ''
    }
    setPacketModal({ isOpen: true, candidate: cand, job: jobMock })
  }

  const openAiMatchForCandidate = (cand) => {
    if ((organization?.subscription_plan || 'Growth') === 'Starter') {
      return showToast('🎯 Deep AI Candidate Fit Radar requires Growth Plan. Please upgrade under Organization Settings.', 'error')
    }
    const jobMock = {
      id: cand.job_id || 'JOB-REQ',
      job_id: cand.job_id || 'JOB-REQ',
      title: cand.job_title || 'Target Requisition',
      client: cand.client || 'Client Account',
      location: cand.location || '',
      rate: cand.rate || '',
      skills: cand.skills || [],
      description: cand.notes || ''
    }
    setAiMatchModal({ isOpen: true, candidate: cand, job: jobMock })
  }
  const [form, setForm] = useState(emptyForm)
  const [skillInput, setSkillInput] = useState('')
  const [extractingSkills, setExtractingSkills] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formErrors, setFormErrors] = useState({})
  const firstNameRef = useRef(null)
  const jobIdRef = useRef(null)
  const [deleteId, setDeleteId] = useState(null)
  const [selected, setSelected] = useState([])
  const pageRef = useRef(null)

  // Real per-candidate timeline (Overview drawer tab): callbacks/follow-ups
  // don't have a candidate_id FK, only a candidate_name field, so we fetch
  // both once and cross-reference by name — no fabricated activity data.
  const [callbacksLog, setCallbacksLog] = useState([])
  const [followupsLog, setFollowupsLog] = useState([])
  useEffect(() => {
    Promise.all([
      db.from('callbacks').select('*'),
      db.from('followups').select('*'),
    ]).then(([cbRes, fuRes]) => {
      setCallbacksLog(cbRes.data || [])
      setFollowupsLog(fuRes.data || [])
    }).catch(() => { /* timeline is supplementary; ignore failures */ })
  }, [])

  const candidateTimeline = useMemo(() => {
    if (!showDetail) return []
    const fullName = `${showDetail.first_name || ''} ${showDetail.last_name || ''}`.trim().toLowerCase()
    if (!fullName) return []
    const matches = (name) => (name || '').trim().toLowerCase() === fullName
    const events = [
      ...callbacksLog.filter(cb => matches(cb.candidate_name)).map(cb => ({ id: `cb-${cb.id}`, type: 'Callback', title: cb.job || 'Callback', date: cb.date, status: cb.status, sub: cb.notes })),
      ...followupsLog.filter(fu => matches(fu.candidate_name)).map(fu => ({ id: `fu-${fu.id}`, type: 'Follow-up', title: fu.type || 'Follow-up', date: fu.date, status: fu.status, sub: fu.notes })),
    ]
    return events.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
  }, [showDetail, callbacksLog, followupsLog])

  const [previewTab, setPreviewTab] = useState('overview')

  // Build filter options from live data
  const feOptions = [...new Set(candidates.map(c => c.fe_name).filter(Boolean))].sort()
  const jobIdToTitle = candidates.reduce((map, c) => {
    if (c.job_id && c.job_title && !map[c.job_id]) map[c.job_id] = c.job_title
    return map
  }, {})
  const jobOptions = [...new Set(candidates.map(c => c.job_id).filter(Boolean))].sort()
    .map(id => ({ value: id, label: jobIdToTitle[id] ? `${id} · ${jobIdToTitle[id]}` : id }))
  const locationOptions = [...new Set(candidates.map(c => c.location).filter(Boolean))].sort()
  const orgOptions = [...new Set(candidates.map(c => c.org_name || organization?.name || 'TalentDesk').filter(Boolean))].sort()
  const recruiterOptions = [...new Set(candidates.map(c => c.recruiter_name).filter(Boolean))].sort()
  const jobTitleOptions = [...new Set(candidates.map(c => c.job_title).filter(Boolean))].sort()

  const filtered = candidates.filter(c => {
    const q = search.toLowerCase()
    const cOrg = c.org_name || organization?.name || 'TalentDesk'
    if (q && !`${c.first_name} ${c.last_name} ${c.email} ${c.job_title} ${c.job_id} ${c.client} ${c.location} ${cOrg} ${ensureArray(c.skills).join(' ')}`.toLowerCase().includes(q)) return false
    if (filters.status.length && !filters.status.includes(c.internal_status)) return false
    if (filters.fe.length && !filters.fe.includes(c.fe_name)) return false
    if (filters.job.length && !filters.job.includes(c.job_id)) return false
    if (filters.location.length && !filters.location.includes(c.location)) return false
    if (filters.feedback.length && !filters.feedback.includes(c.feedback_status)) return false
    if (filters.org?.length && !filters.org.includes(cOrg)) return false
    if (filters.recruiter?.length && !filters.recruiter.includes(c.recruiter_name)) return false
    if (filters.priority?.length && !filters.priority.includes(c.priority)) return false
    return true
  })

  const hasFilters = search || Object.values(filters).some(f => f.length > 0)
  useAISetContext({
    workspace: 'Candidates', totalCandidates: candidates.length, shownCandidates: filtered.length,
    activeFilters: hasFilters ? filters : null, selectedCount: selected.length,
  })

  const clearFilters = () => {
    setSearch('')
    setFilters({ status: [], fe: [], job: [], location: [], feedback: [], org: [], recruiter: [], priority: [] })
  }

  // Selection (plain array — matches Table's selectedIds/onSelectionChange API directly)
  const clearSelection = () => setSelected([])

  // Bulk actions
  const bulkSetStatus = async (status) => {
    for (const id of selected) await updateCandidate(id, { internal_status: status })
    showToast(`${selected.length} candidates updated to "${status}"`)
    clearSelection()
  }

  // AI Candidate Comparison — reuses the shared 'compare' action; content is
  // built entirely from the selected candidates' real fields, never invented.
  const [compareOpen, setCompareOpen] = useState(false)
  const [compareResult, setCompareResult] = useState(null)
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareError, setCompareError] = useState(null)
  const [expandedFieldModal, setExpandedFieldModal] = useState(null)

  const runComparison = async () => {
    const picked = candidates.filter(c => selected.includes(c.id))
    if (picked.length < 2) return
    setCompareOpen(true)
    setCompareLoading(true)
    setCompareError(null)
    setCompareResult(null)
    const startedAt = new Date().getTime()
    const content = picked.map((c, i) => [
      `Candidate ${i + 1}: ${c.first_name} ${c.last_name}`,
      `Target Role: ${c.job_title || 'Not specified'}`,
      `Experience: ${c.experience ? c.experience + ' years' : 'Not specified'}`,
      `Skills: ${ensureArray(c.skills).join(', ') || 'None listed'}`,
      `Status: ${c.internal_status || 'Pending'}`,
      `Rate: ${c.rate || 'Not specified'}`,
      c.notes ? `Notes: ${c.notes}` : null,
    ].filter(Boolean).join('\n')).join('\n\n')
    try {
      const res = await runAiAction({ action: 'compare', content, context: 'Compare these candidates across skills, experience, and overall fit. Recommend which is strongest and why, using only the information provided — never invent facts not listed.' })
      if (res.success === false) throw new Error(res.error || 'Comparison failed.')
      setCompareResult(res.text)
      logUsageEvent(orgId, userId, { type: 'action', action: 'compare', source: 'candidates', success: true, provider: res.provider, model: res.model, durationMs: new Date().getTime() - startedAt, preview: res.text.slice(0, 140) })
    } catch (err) {
      const message = err.message || 'Comparison failed. Please try again.'
      setCompareError(message)
      logUsageEvent(orgId, userId, { type: 'action', action: 'compare', source: 'candidates', success: false, error: message, durationMs: new Date().getTime() - startedAt })
    } finally {
      setCompareLoading(false)
    }
  }

  const bulkExport = () => {
    const sel = candidates.filter(c => selected.includes(c.id))
    const headers = ['First Name', 'Last Name', 'Email', 'Phone', 'Location', 'Work Auth', 'Experience', 'Submission Date', 'Job ID', 'Job Title', 'Client', 'Rate', 'Internal Status', 'External Status', 'Feedback', 'Priority', 'Interview Date', 'FE Name', 'Extension', 'Skills', 'Notes']
    const rows = sel.map(c => [c.first_name, c.last_name, c.email, c.phone, c.location, c.work_auth, c.experience, c.submission_date, c.job_id, c.job_title, c.client, c.rate, c.internal_status, c.external_status, c.feedback_status, c.priority, c.interview_date, c.fe_name, c.fe_extension, ensureArray(c.skills).join(';'), c.notes])
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Candidates')
    XLSX.writeFile(wb, `candidates_${new Date().toISOString().slice(0, 10)}.xlsx`)
    showToast(`Exported ${sel.length} candidates!`)
  }

  const exportAll = () => {
    const headers = ['First Name', 'Last Name', 'Email', 'Phone', 'Location', 'Work Auth', 'Experience', 'Submission Date', 'Job ID', 'Job Title', 'Client', 'Rate', 'Internal Status', 'External Status', 'Feedback', 'Priority', 'Interview Date', 'FE Name', 'Extension', 'Skills', 'Notes']
    const rows = filtered.map(c => [c.first_name, c.last_name, c.email, c.phone, c.location, c.work_auth, c.experience, c.submission_date, c.job_id, c.job_title, c.client, c.rate, c.internal_status, c.external_status, c.feedback_status, c.priority, c.interview_date, c.fe_name, c.fe_extension, ensureArray(c.skills).join(';'), c.notes])
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Candidates')
    XLSX.writeFile(wb, `candidates_export_${new Date().toISOString().slice(0, 10)}.xlsx`)
    showToast('Excel exported!')
  }

  const bulkDelete = async () => {
    for (const id of selected) await deleteCandidate(id)
    showToast(`${selected.length} candidates deleted`, 'error')
    clearSelection()
    setDeleteId(null)
  }

  // Form
  const openAdd = () => { setForm(emptyForm); setEditingId(null); setSkillInput(''); setFormErrors({}); setShowModal(true) }
  const openEdit = (c) => {
    setForm({
      first_name: c.first_name || '', last_name: c.last_name || '', email: c.email || '',
      phone: c.phone || '', location: c.location || '', work_auth: c.work_auth || 'US Citizen',
      experience: c.experience || '', linkedin: c.linkedin || '',
      submission_date: c.submission_date || new Date().toISOString().slice(0, 10),
      job_id: c.job_id || '', job_title: c.job_title || '', client: c.client || '',
      rate: c.rate || '', relocation: c.relocation || 'No',
      internal_status: c.internal_status || 'Pending', external_status: c.external_status || 'Pending',
      feedback_status: c.feedback_status || 'Awaiting', priority: c.priority || 'Medium',
      interview_date: c.interview_date || '', interview_type: c.interview_type || '',
      fe_name: c.fe_name || '', fe_extension: c.fe_extension || '',
      account_manager: c.account_manager || '', recruiter_name: c.recruiter_name || '',
      skills: ensureArray(c.skills), notes: c.notes || '', followup_date: c.followup_date || '',
      resume_text: c.resume_text || ''
    })
    setEditingId(c.id); setSkillInput(''); setFormErrors({}); setShowModal(true)
  }

  const handleExtractSkillsAI = async () => {
    if (!form.resume_text || !form.resume_text.trim()) {
      return showToast('Please paste resume text first', 'error')
    }
    setExtractingSkills(true)
    try {
      const res = await apiRequest('/ai/generate', {
        method: 'POST',
        body: {
          toolId: 'resume_skills',
          prompt: `Extract up to 10 key technical and professional skills from this candidate resume:\n\n${form.resume_text}`
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
        extracted = fallbackExtractSkills(form.resume_text)
      }

      if (extracted.length > 0) {
        const top10 = extracted.map(s => String(s).trim()).filter(Boolean).slice(0, 10)
        setForm(f => ({
          ...f,
          skills: Array.from(new Set([...(f.skills || []), ...top10]))
        }))
        showToast(`AI extracted ${top10.length} skills!`, 'success')
      } else {
        showToast('No skills detected in resume', 'error')
      }
    } catch (err) {
      console.warn('[AI Skill Extractor] Error, falling back to keyword matcher:', err)
      const fallback = fallbackExtractSkills(form.resume_text)
      if (fallback.length > 0) {
        setForm(f => ({
          ...f,
          skills: Array.from(new Set([...(f.skills || []), ...fallback]))
        }))
        showToast(`Extracted ${fallback.length} skills (local engine)`, 'success')
      } else {
        showToast('Failed to extract skills', 'error')
      }
    } finally {
      setExtractingSkills(false)
    }
  }

  const handleAutoFillProfileAI = async () => {
    if (!form.resume_text || !form.resume_text.trim()) {
      return showToast('Please paste resume text or upload a resume file first', 'error')
    }
    setExtractingSkills(true)
    try {
      const res = await apiRequest('/ai/parse-resume', {
        method: 'POST',
        body: { resumeText: form.resume_text }
      })
      if (res && res.profile) {
        const p = res.profile
        setForm(prev => ({
          ...prev,
          first_name: p.first_name || prev.first_name,
          last_name: p.last_name || prev.last_name,
          email: p.email || prev.email,
          phone: p.phone || prev.phone,
          location: p.location || prev.location,
          job_title: p.job_title || prev.job_title,
          experience: p.experience !== undefined && p.experience !== null ? String(p.experience) : prev.experience,
          work_auth: p.work_auth || prev.work_auth,
          rate: p.rate || prev.rate,
          skills: Array.isArray(p.skills) && p.skills.length > 0 ? Array.from(new Set([...(prev.skills || []), ...p.skills])) : prev.skills
        }))
        showToast('⚡ AI Auto-Filled candidate name, email, location, title & skills!')
      } else {
        throw new Error(res.error || 'Could not parse profile details.')
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
      if (res && res.success) {
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
          job_title: p.job_title || prev.job_title,
          experience: p.experience !== undefined && p.experience !== null ? String(p.experience) : prev.experience,
          work_auth: p.work_auth || prev.work_auth,
          rate: p.rate || prev.rate,
          skills: Array.isArray(p.skills) && p.skills.length > 0 ? Array.from(new Set([...(prev.skills || []), ...p.skills])) : prev.skills
        }))
        showToast(res.resume_file_key ? `⚡ Resume saved & profile auto-filled from ${file.name}!` : `⚡ Text & profile auto-filled from ${file.name}!`)
      } else {
        throw new Error(res.error || 'Failed to parse document text.')
      }
    } catch (err) {
      showToast(err.message || 'File upload parsing failed', 'error')
    } finally {
      setExtractingSkills(false)
    }
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
    if (editingId) {
      const { error } = await updateCandidate(editingId, form)
      if (error) showToast(error.message, 'error')
      else { showToast('Candidate updated!'); setShowModal(false) }
    } else {
      const { error } = await addCandidate(form)
      if (error) showToast(error.message, 'error')
      else { showToast('Candidate added!'); setShowModal(false) }
    }
    setSaving(false)
  }

  const [downloadingResume, setDownloadingResume] = useState(false)
  const handleDownloadResume = async (candidateId) => {
    setDownloadingResume(true)
    try {
      const res = await apiRequest(`/upload/resume-url/${candidateId}`)
      if (res?.success && res.url) {
        window.open(res.url, '_blank', 'noopener')
      } else {
        throw new Error(res?.error || 'Could not generate a download link.')
      }
    } catch (err) {
      showToast(err.message || 'Failed to download resume', 'error')
    } finally {
      setDownloadingResume(false)
    }
  }

  const addSkill = (e) => {
    if (e.key === 'Enter' && skillInput.trim()) {
      e.preventDefault()
      const current = ensureArray(form.skills)
      if (!current.includes(skillInput.trim())) setForm(f => ({ ...f, skills: [...current, skillInput.trim()] }))
      setSkillInput('')
    }
  }

  const inp = (field) => ({
    value: form[field],
    onChange: e => {
      setForm(f => ({ ...f, [field]: e.target.value }))
      if (formErrors[field]) setFormErrors(errs => { const next = { ...errs }; delete next[field]; return next })
    },
  })

  const candidateStats = [
    { label: 'Total Candidates', value: candidates.length, helper: `${filtered.length} shown`, tone: 'accent', icon: 'users' },
    { label: 'Client Pipeline', value: candidates.filter(c => ['Submitted', 'Shortlisted', 'Interview Scheduled', 'Interview Done', 'Offer Extended'].includes(c.external_status)).length, helper: 'external active', tone: 'green', icon: 'arrowUpRight' },
    { label: 'Interviews', value: candidates.filter(c => ['Interview Scheduled', 'Interview Done'].includes(c.external_status)).length, helper: 'client stage', tone: 'ai', icon: 'calendar' },
    { label: 'Positive Feedback', value: candidates.filter(c => c.feedback_status === 'Positive').length, helper: 'good signal', tone: 'yellow', icon: 'checkCircle' },
    { label: 'High Priority', value: candidates.filter(c => c.priority === 'High').length, helper: 'needs attention', tone: 'red', icon: 'alertCircle' },
    { label: 'Rejected', value: candidates.filter(c => c.external_status === 'Rejected').length, helper: 'client declined', tone: 'orange', icon: 'xCircle' },
  ]

  const columns = [
    {
      key: 'name', header: 'Candidate', sortable: true, sortValue: (c) => `${c.last_name || ''} ${c.first_name || ''}`,
      render: (c) => (
        <span className="flex items-center gap-2 min-w-0">
          <Avatar name={`${c.first_name || ''} ${c.last_name || ''}`.trim() || '?'} size="xs" />
          <span className="min-w-0">
            <span className="flex items-center gap-1">
              <strong className="text-[12.5px] text-text font-semibold truncate">{c.first_name} {c.last_name}</strong>
              {c.resume_text && <Icon name="edit" size={10} className="text-text3/60 shrink-0" aria-label="Resume text on file" />}
              {c.resume_file_name && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDownloadResume(c.id) }}
                  className="text-text3/60 hover:text-accent shrink-0 focus-ring rounded-sm"
                  title={`Download ${c.resume_file_name}`}
                  aria-label={`Download resume file for ${c.first_name}`}
                >
                  <Icon name="download" size={10} />
                </button>
              )}
            </span>
            <small className="block text-[11px] text-text3 truncate leading-tight">{c.work_auth || c.email || 'n/a'}</small>
          </span>
        </span>
      ),
    },
    {
      key: 'role', header: 'Role', sortable: true, sortValue: (c) => c.job_title || '',
      render: (c) => (
        <span className="flex flex-col gap-px min-w-0">
          <strong className="text-[12.5px] text-text font-semibold truncate leading-tight">{c.job_title || 'Role n/a'}</strong>
          <span className="text-[11px] text-text3 truncate leading-tight"><span className="font-mono text-accent text-[10.5px]">{c.job_id || 'No ID'}</span>{c.client ? ` · ${c.client}` : ''}</span>
        </span>
      ),
    },
    { key: 'submission_date', header: 'Date', sortable: true, hideable: true, className: 'text-[11px] text-text3 font-medium tabular-nums' },
    { key: 'location', header: 'Location', sortable: true, hideable: true, className: 'text-[12px] text-text2' },
    ...(isSuperAdmin && allOrgsView ? [{ key: 'org_name', header: 'Organization', sortable: true, hideable: true, render: (c) => <Badge tone="accent" size="sm">{c.org_name || organization?.name || 'TalentDesk'}</Badge> }] : []),
    { key: 'internal_status', header: 'Int. Status', sortable: true, render: (c) => <StatusPill status={c.internal_status} tone={STATUS_TONE[c.internal_status] || 'neutral'} size="sm" /> },
    { key: 'external_status', header: 'Ext. Status', sortable: true, render: (c) => <StatusPill status={c.external_status} tone={STATUS_TONE[c.external_status] || 'neutral'} size="sm" /> },
    { key: 'health', header: 'Health', hideable: true, render: (c) => { const sc = computeScore(c); return <StatusPill status={sc.gradeLabel} tone={sc.total >= 80 ? 'green' : sc.total >= 60 ? 'accent' : sc.total >= 40 ? 'yellow' : 'red'} size="sm" /> } },
    { key: 'fe_name', header: 'Front End', hideable: true, className: 'text-[12px] text-text2' },
    ...(isAdmin ? [{ key: 'recruiter_name', header: 'Recruiter', sortable: true, hideable: true, className: 'text-[12px] text-text2' }] : []),
  ]

  const filterDefs = [
    ...(isSuperAdmin && allOrgsView ? [{ key: 'org', label: 'Organization', type: 'multiselect', options: orgOptions }] : []),
    { key: 'status', label: 'Status', type: 'multiselect', options: STATUSES },
    { key: 'fe', label: 'Front End', type: 'multiselect', options: feOptions },
    { key: 'job', label: 'Job', type: 'multiselect', options: jobOptions },
    { key: 'location', label: 'Location', type: 'multiselect', options: locationOptions },
    { key: 'feedback', label: 'Feedback', type: 'multiselect', options: FEEDBACK },
    { key: 'recruiter', label: 'Recruiter', type: 'multiselect', options: recruiterOptions },
    { key: 'priority', label: 'Priority', type: 'multiselect', options: ['High', 'Medium', 'Low'] },
  ]
  const filterPresets = [
    ...(profile?.full_name ? [{ label: 'My Candidates', values: { recruiter: [profile.full_name] } }] : []),
    { label: 'High Priority', values: { priority: ['High'] } },
  ]

  return (
    <PageContainer ref={pageRef}>
      <PageHeader
        eyebrow="Recruiting Workspace"
        title="Candidates"
        subtitle="Track submissions, client movement, feedback, ownership, and follow-ups."
        actions={
          <>
            {isSuperAdmin && <Switch checked={allOrgsView} onChange={setAllOrgsView} label="All orgs" />}
            <Button variant="secondary" leftIcon="download" onClick={exportAll}>Export XLSX</Button>
            <Button variant="secondary" leftIcon="inbox" onClick={() => setShowBulkUpload(true)}>Bulk Upload</Button>
            <Button variant="primary" leftIcon="plus" onClick={openAdd}>Add Candidate</Button>
          </>
        }
        search={<WorkspaceSearch value={search} onChange={setSearch} storageKey="td_candidates" placeholder="Name, job, client, skill..." />}
        filters={
          <FilterWorkspace
            filters={filterDefs}
            values={filters}
            onChange={(key, value) => setFilters(f => ({ ...f, [key]: value }))}
            onReset={clearFilters}
            presets={filterPresets}
            storageKey="candidates"
          />
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 my-4">
        {candidateStats.map((stat) => (
          <KPICard key={stat.label} compact {...stat} />
        ))}
      </div>

      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-text3">
          {filtered.length !== candidates.length ? `${filtered.length} / ${candidates.length} shown` : `${candidates.length} records`}
        </span>
      </div>

      <Table
        columns={columns}
        data={filtered}
        loading={loading}
        resizable
        selectable
        selectedIds={selected}
        onSelectionChange={setSelected}
        onRowClick={(c) => { setShowDetail(c); setPreviewTab('overview') }}
        emptyState={
          <EmptyState
            icon="users"
            title={hasFilters ? 'No candidates match your filters' : 'No candidates yet'}
            action={!hasFilters ? <Button variant="primary" leftIcon="plus" onClick={openAdd}>Add Candidate</Button> : undefined}
          />
        }
        bulkActions={
          <>
            <Menu
              align="start"
              trigger={({ toggle }) => <Button size="sm" variant="secondary" onClick={toggle}>Change Status</Button>}
              items={STATUSES.map(s => ({ label: s, onClick: () => bulkSetStatus(s) }))}
            />
            <Button size="sm" variant="secondary" onClick={bulkExport}>Export</Button>
            {aiEnabled && selected.length >= 2 && selected.length <= 5 && (
              <Button size="sm" variant="ai" leftIcon="compare" onClick={runComparison}>AI Compare</Button>
            )}
            <Button size="sm" variant="danger" onClick={() => setDeleteId('bulk')}>Delete</Button>
          </>
        }
        rowActions={(c) => (
          <Menu
            align="end"
            trigger={(p) => <MenuTrigger {...p} />}
            items={[
              { label: 'View details', icon: 'eye', onClick: () => { setShowDetail(c); setPreviewTab('overview') } },
              { label: 'Edit', icon: 'edit', onClick: () => openEdit(c) },
              { label: 'Deep AI Fit', icon: 'sparkles', onClick: () => openAiMatchForCandidate(c) },
              { label: '1-Click Packet', icon: 'arrowUpRight', onClick: () => openPacketForCandidate(c) },
              'divider',
              { label: 'Delete', icon: 'trash', danger: true, onClick: () => setDeleteId(c.id) },
            ]}
          />
        )}
        contextMenuItems={(c) => [
          { label: 'View details', icon: 'eye', onClick: () => { setShowDetail(c); setPreviewTab('overview') } },
          { label: 'Edit', icon: 'edit', onClick: () => openEdit(c) },
          { label: 'Deep AI Fit', icon: 'sparkles', onClick: () => openAiMatchForCandidate(c) },
          { label: '1-Click Packet', icon: 'arrowUpRight', onClick: () => openPacketForCandidate(c) },
          'divider',
          { label: 'Delete', icon: 'trash', danger: true, onClick: () => setDeleteId(c.id) },
        ]}
      />

      {/* Preview drawer */}
      {showDetail && (() => {
        const sc = computeScore(showDetail)
        const circumference = 2 * Math.PI * 40
        const offset = circumference - (sc.total / 100) * circumference
        return (
          <EntityDrawer
            open={!!showDetail}
            onClose={() => setShowDetail(null)}
            avatarName={`${showDetail.first_name || ''} ${showDetail.last_name || ''}`.trim()}
            eyebrow="Candidate"
            title={`${showDetail.first_name} ${showDetail.last_name}`}
            subtitle={<>{showDetail.job_title} · <span className="text-accent font-mono">{showDetail.job_id}</span></>}
            status={<StatusPill status={showDetail.internal_status} tone={STATUS_TONE[showDetail.internal_status] || 'neutral'} size="sm" />}
            size="lg"
            tabs={[{ id: 'overview', label: 'Overview' }, { id: 'timeline', label: 'Timeline', count: candidateTimeline.length }, { id: 'notes', label: 'Notes' }, ...(aiEnabled ? [{ id: 'ai', label: 'AI' }] : [])]}
            activeTab={previewTab}
            onTabChange={setPreviewTab}
            actions={
              <>
                <Button variant="secondary" leftIcon="sparkles" onClick={() => openAiMatchForCandidate(showDetail)}>Deep AI Fit</Button>
                <Button variant="ai" leftIcon="arrowUpRight" onClick={() => openPacketForCandidate(showDetail)}>1-Click Packet</Button>
                <Button variant="primary" onClick={() => { setShowDetail(null); openEdit(showDetail) }}>Edit</Button>
              </>
            }
          >
            {previewTab === 'overview' && (
              <div className="flex flex-col gap-4">
                <Card className="bg-gradient-to-br from-accent/8 to-ai/8 border-accent/25">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-bold text-accent uppercase tracking-wide">Candidate Score</span>
                    <Badge tone={sc.total >= 80 ? 'green' : sc.total >= 60 ? 'accent' : sc.total >= 40 ? 'yellow' : 'red'}>{sc.gradeLabel}</Badge>
                  </div>
                  <div className="flex items-center gap-5 flex-wrap">
                    <div className="relative shrink-0">
                      <svg width="88" height="88" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                        <circle cx="50" cy="50" r="40" fill="none" stroke="var(--surface3)" strokeWidth="8" />
                        <circle cx="50" cy="50" r="40" fill="none" stroke={sc.gradeColor} strokeWidth="8" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 1s ease' }} />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <div className="text-xl font-extrabold font-mono leading-none" style={{ color: sc.gradeColor }}>{sc.total}</div>
                        <div className="text-[9px] text-text3 uppercase tracking-wide">/ 100</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 flex-1 min-w-[220px]">
                      {[['Profile', sc.completeness, 25], ['Skills', sc.skillScore, 25], ['Pipeline', sc.statusScore, 30], ['Recency', sc.recencyScore, 20]].map(([label, score, max]) => (
                        <div key={label} className="bg-surface border border-border rounded-[var(--radius-sm)] px-2.5 py-2">
                          <div className="text-[10px] text-text3 uppercase tracking-wide mb-1">{label}</div>
                          <div className="h-1 bg-surface3 rounded-full overflow-hidden mb-1">
                            <div className="h-full rounded-full" style={{ width: `${Math.round(score / max * 100)}%`, background: sc.gradeColor }} />
                          </div>
                          <div className="text-xs font-bold font-mono" style={{ color: sc.gradeColor }}>{score}<span className="text-text3 text-[10px]">/{max}</span></div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-3.5">
                    {sc.insights.slice(0, 8).map((insight, i) => (
                      <Badge key={i} size="sm" tone={insight.type === 'good' ? 'green' : insight.type === 'bad' ? 'red' : 'yellow'}>{insight.text}</Badge>
                    ))}
                  </div>
                </Card>

                <div className="grid sm:grid-cols-2 gap-3">
                  <DetailCard title="Personal Info" rows={[['Full Name', `${showDetail.first_name} ${showDetail.last_name}`], ['Email', showDetail.email], ['Phone', showDetail.phone], ['Location', showDetail.location], ['Work Auth', showDetail.work_auth], ['Experience', showDetail.experience ? showDetail.experience + ' yrs' : '-'], ['LinkedIn', showDetail.linkedin], ['Relocation', showDetail.relocation]]} />
                  <DetailCard title="Submission" rows={[['Date', showDetail.submission_date], ['Job ID', showDetail.job_id], ['Job Title', showDetail.job_title], ['Client', showDetail.client], ['Rate', showDetail.rate]]} />
                  <DetailCard title="Status" rows={[['Internal', showDetail.internal_status], ['External', showDetail.external_status], ['Feedback', showDetail.feedback_status], ['Priority', showDetail.priority], ['Interview Date', showDetail.interview_date], ['Interview Type', showDetail.interview_type], ['Follow-up', showDetail.followup_date]]} />
                  <DetailCard title="Front End" rows={[['FE Name', showDetail.fe_name], ['Extension', showDetail.fe_extension], ['Acct Manager', showDetail.account_manager], ['Recruiter', showDetail.recruiter_name]]} />
                </div>

                <Card>
                  <CardHeader title="Skills" />
                  <div className="flex flex-wrap gap-1.5">
                    {ensureArray(showDetail.skills).map(s => <Badge key={s} tone="accent">{s}</Badge>)}
                    {!ensureArray(showDetail.skills).length && <span className="text-text3 text-sm">No skills listed</span>}
                  </div>
                </Card>
              </div>
            )}

            {previewTab === 'timeline' && (
              <div className="flex flex-col gap-2">
                {candidateTimeline.length === 0 ? (
                  <EmptyState icon="calendar" title="No timeline activity" description="Callbacks and follow-ups logged for this candidate will show up here." />
                ) : (
                  candidateTimeline.map(ev => (
                    <div key={ev.id} className="flex items-start gap-3 rounded-[var(--radius-md)] border border-border bg-surface2 px-3 py-2.5">
                      <span className="w-7 h-7 rounded-[var(--radius-sm)] bg-accent/10 text-accent flex items-center justify-center shrink-0">
                        <Icon name={ev.type === 'Callback' ? 'callbacks' : 'followups'} size={13} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <strong className="text-xs font-bold text-text">{ev.type}: {ev.title}</strong>
                          <span className="text-[11px] text-text3 shrink-0">{ev.date || '—'}</span>
                        </div>
                        {ev.sub && <p className="text-xs text-text3 mt-0.5">{ev.sub}</p>}
                        {ev.status && <Badge size="sm" tone="neutral" className="mt-1">{ev.status}</Badge>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {previewTab === 'notes' && (
              <div className="flex flex-col gap-4">
                <Card>
                  <CardHeader
                    title="Notes"
                    action={
                      showDetail.notes && (
                        <Button
                          size="xs"
                          variant="secondary"
                          leftIcon="expand"
                          onClick={() => setExpandedFieldModal({
                            title: `Candidate Notes — ${showDetail.first_name} ${showDetail.last_name}`,
                            subtitle: `${showDetail.job_title || ''} · ${showDetail.job_id || ''}`,
                            content: showDetail.notes
                          })}
                        >
                          View in full
                        </Button>
                      )
                    }
                  />
                  <p className="text-sm text-text2 leading-relaxed">{showDetail.notes || 'No notes yet.'}</p>
                  {showDetail.followup_date && <p className="text-xs text-text3 mt-2">Follow-up date: <b className="text-text2">{showDetail.followup_date}</b></p>}
                </Card>
                {showDetail.resume_file_name && (
                  <Card>
                    <CardHeader
                      title="Resume File"
                      action={
                        <Button
                          size="xs"
                          variant="secondary"
                          leftIcon="download"
                          loading={downloadingResume}
                          onClick={() => handleDownloadResume(showDetail.id)}
                        >
                          Download
                        </Button>
                      }
                    />
                    <p className="text-sm text-text2 truncate">{showDetail.resume_file_name}</p>
                  </Card>
                )}
                {showDetail.resume_text && (
                  <Card>
                    <CardHeader
                      title="Resume Text"
                      action={
                        <Button
                          size="xs"
                          variant="secondary"
                          leftIcon="expand"
                          onClick={() => setExpandedFieldModal({
                            title: `Resume Text — ${showDetail.first_name} ${showDetail.last_name}`,
                            subtitle: `${showDetail.email || ''} · ${showDetail.phone || ''}`,
                            content: showDetail.resume_text
                          })}
                        >
                          View in full
                        </Button>
                      }
                    />
                    <pre className="text-xs text-text2 leading-relaxed whitespace-pre-wrap font-sans max-h-60 overflow-y-auto">{showDetail.resume_text}</pre>
                  </Card>
                )}
              </div>
            )}

            {previewTab === 'ai' && aiEnabled && (() => {
              const profileText = [
                `Name: ${showDetail.first_name} ${showDetail.last_name}`,
                `Target Role: ${showDetail.job_title || 'Not specified'}`,
                `Experience: ${showDetail.experience ? showDetail.experience + ' years' : 'Not specified'}`,
                `Location: ${showDetail.location || 'Not specified'}`,
                `Work Authorization: ${showDetail.work_auth || 'Not specified'}`,
                `Skills: ${ensureArray(showDetail.skills).join(', ') || 'None listed'}`,
                `Status: ${showDetail.internal_status || 'Pending'}`,
                showDetail.notes ? `Recruiter Notes: ${showDetail.notes}` : null,
                showDetail.resume_text ? `Resume:\n${showDetail.resume_text}` : null,
              ].filter(Boolean).join('\n')

              return (
                <div className="flex flex-col gap-3">
                  <AIInsightCard
                    orgId={orgId} userId={userId} source="candidates"
                    title="Candidate Snapshot" icon="sparkles" actionId="analyze"
                    content={profileText}
                    context="Surface this candidate's key strengths, potential concerns, and overall recruiting fit in a few concise bullet points."
                  />
                  <AIInsightCard
                    orgId={orgId} userId={userId} source="candidates"
                    title="Interview Questions" icon="checkCircle" actionId="draft"
                    content={`Interview questions for a candidate targeting a ${showDetail.job_title || 'this'} role. Skills: ${ensureArray(showDetail.skills).join(', ') || 'not listed'}. Experience: ${showDetail.experience || 'not specified'} years.`}
                    context="Generate 5 targeted interview questions covering technical depth and past project experience."
                  />
                  <AIInsightCard
                    orgId={orgId} userId={userId} source="candidates"
                    title="Resume Rewrite Suggestions" icon="edit" actionId="improve"
                    content={showDetail.resume_text || ''}
                    context="Suggest specific improvements to strengthen this resume for client submissions — focus on clarity, impact, and quantifiable achievements."
                    emptyHint="No resume text on file for this candidate."
                  />
                </div>
              )
            })()}
          </EntityDrawer>
        )
      })()}

      {/* Add/edit drawer */}
      <Drawer
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingId ? 'Edit Candidate' : 'Add Candidate'}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={handleSave}>{editingId ? 'Update Candidate' : 'Save Candidate'}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
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
              <Textarea
                {...inp('resume_text')}
                placeholder="Paste full raw candidate resume text here (e.g. summary, contact, skills, experience)... Or upload a resume file above and click 'AI Auto-Fill Full Profile'!"
                rows={5}
                className="font-mono text-xs"
              />
            </Card>
          </div>

          <div>
            <FormSectionTitle>Personal Info</FormSectionTitle>
            <div className="grid sm:grid-cols-2 gap-3.5">
              <FormField label="First Name" required error={formErrors.first_name}><Input ref={firstNameRef} {...inp('first_name')} error={!!formErrors.first_name} placeholder="John" /></FormField>
              <FormField label="Last Name"><Input {...inp('last_name')} placeholder="Smith" /></FormField>
              <FormField label="Email"><Input {...inp('email')} type="email" placeholder="john@email.com" /></FormField>
              <FormField label="Phone"><Input {...inp('phone')} placeholder="+1 555 000 0000" /></FormField>
              <FormField label="Location" required><Combobox value={form.location} onChange={v => setForm(f => ({ ...f, location: v }))} options={locationOptions} placeholder="City, State" /></FormField>
              <FormField label="Work Auth"><Select value={form.work_auth} onChange={v => setForm(f => ({ ...f, work_auth: v }))} options={WORK_AUTHS.map(o => ({ value: o, label: o }))} /></FormField>
              <FormField label="Experience (yrs)"><Input {...inp('experience')} type="number" placeholder="5" /></FormField>
              <FormField label="LinkedIn"><Input {...inp('linkedin')} placeholder="linkedin.com/in/..." /></FormField>
            </div>
          </div>

          <div>
            <FormSectionTitle>Submission Details</FormSectionTitle>
            <div className="grid sm:grid-cols-2 gap-3.5">
              <FormField label="Submission Date" required><Input {...inp('submission_date')} type="date" /></FormField>
              <FormField label="Job ID" required error={formErrors.job_id}><Input ref={jobIdRef} {...inp('job_id')} error={!!formErrors.job_id} placeholder="JOB-001" /></FormField>
              <FormField label="Job Title" required><Combobox value={form.job_title} onChange={v => setForm(f => ({ ...f, job_title: v }))} options={jobTitleOptions} placeholder="Software Engineer" /></FormField>
              <FormField label="Client"><Input {...inp('client')} placeholder="Acme Corp" /></FormField>
              <FormField label="Bill Rate"><Input {...inp('rate')} placeholder="$85/hr" /></FormField>
              <FormField label="Relocation"><Select value={form.relocation} onChange={v => setForm(f => ({ ...f, relocation: v }))} options={['Yes', 'No', 'Negotiable'].map(o => ({ value: o, label: o }))} /></FormField>
            </div>
          </div>

          <div>
            <FormSectionTitle>Status Tracking</FormSectionTitle>
            <div className="grid sm:grid-cols-2 gap-3.5">
              <FormField label="Internal Status"><Select value={form.internal_status} onChange={v => setForm(f => ({ ...f, internal_status: v }))} options={STATUSES.map(s => ({ value: s, label: s }))} /></FormField>
              <FormField label="External Status"><Select value={form.external_status} onChange={v => setForm(f => ({ ...f, external_status: v }))} options={STATUSES.map(s => ({ value: s, label: s }))} /></FormField>
              <FormField label="Feedback Status"><Select value={form.feedback_status} onChange={v => setForm(f => ({ ...f, feedback_status: v }))} options={FEEDBACK.map(o => ({ value: o, label: o }))} /></FormField>
              <FormField label="Priority"><Select value={form.priority} onChange={v => setForm(f => ({ ...f, priority: v }))} options={['High', 'Medium', 'Low'].map(o => ({ value: o, label: o }))} /></FormField>
              <FormField label="Interview Date"><Input {...inp('interview_date')} type="date" /></FormField>
              <FormField label="Interview Type"><Select value={form.interview_type} onChange={v => setForm(f => ({ ...f, interview_type: v }))} options={['Phone Screen', 'Video Call', 'On-site', 'Panel', 'Technical'].map(o => ({ value: o, label: o }))} placeholder="Select type..." /></FormField>
            </div>
          </div>

          <div>
            <FormSectionTitle>Front End / Ownership</FormSectionTitle>
            <div className="grid sm:grid-cols-2 gap-3.5">
              <FormField label="FE Name" required><Combobox value={form.fe_name} onChange={v => setForm(f => ({ ...f, fe_name: v }))} options={feOptions} placeholder="Sarah K." /></FormField>
              <FormField label="Extension"><Input {...inp('fe_extension')} placeholder="x204" /></FormField>
              <FormField label="Account Manager"><Input {...inp('account_manager')} placeholder="Mike R." /></FormField>
              <FormField label="Recruiter"><Combobox value={form.recruiter_name} onChange={v => setForm(f => ({ ...f, recruiter_name: v }))} options={recruiterOptions} placeholder="Your name" /></FormField>
            </div>
          </div>

          <div>
            <FormSectionTitle>Skills &amp; Notes</FormSectionTitle>
            <div className="flex flex-col gap-3.5">
              <FormField label="Skills (press Enter to add)">
                <div className="bg-surface2 border border-border rounded-[var(--radius-sm)] p-2 flex flex-wrap gap-1.5 min-h-[42px] cursor-text" onClick={() => document.getElementById('skill-inp')?.focus()}>
                  {ensureArray(form.skills).map(s => (
                    <Badge key={s} tone="accent">
                      {s} <button type="button" onClick={(e) => { e.stopPropagation(); setForm(f => ({ ...f, skills: ensureArray(f.skills).filter(x => x !== s) })) }} className="ml-1 opacity-70 hover:opacity-100">×</button>
                    </Badge>
                  ))}
                  <input id="skill-inp" value={skillInput} onChange={e => setSkillInput(e.target.value)} onKeyDown={addSkill} placeholder={ensureArray(form.skills).length ? '' : 'Type a skill and press Enter...'} className="bg-transparent border-none outline-none text-text text-sm min-w-[160px] flex-1" />
                </div>
              </FormField>
              <FormField label="Notes"><Textarea {...inp('notes')} placeholder="Internal notes..." rows={3} /></FormField>
              <FormField label="Follow-up Date"><Input {...inp('followup_date')} type="date" /></FormField>
            </div>
          </div>
        </div>
      </Drawer>

      {/* Delete confirm */}
      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        size="sm"
        title={deleteId === 'bulk' ? `Delete ${selected.length} candidates?` : 'Delete candidate?'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={deleteId === 'bulk' ? bulkDelete : async () => { await deleteCandidate(deleteId); showToast('Deleted!', 'error'); setDeleteId(null) }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-text3">This cannot be undone.</p>
      </Modal>

      {/* AI Candidate Comparison */}
      <Modal open={compareOpen} onClose={() => setCompareOpen(false)} size="lg" title="AI Candidate Comparison">
        {compareLoading && (
          <div className="flex items-center gap-1 py-6 justify-center">
            {[0, 1, 2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-text3 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
          </div>
        )}
        {compareError && <p className="text-sm text-red">{compareError} <button type="button" onClick={runComparison} className="underline font-semibold">Retry</button></p>}
        {compareResult && <MarkdownView content={compareResult} />}
      </Modal>

      {/* Submission Packet Modal */}
      <SubmissionPacketModal
        isOpen={packetModal.isOpen}
        onClose={() => setPacketModal({ isOpen: false, candidate: null, job: null })}
        candidate={packetModal.candidate}
        job={packetModal.job}
      />

      {/* AI Match Modal */}
      <AIMatchModal
        isOpen={aiMatchModal.isOpen}
        onClose={() => setAiMatchModal({ isOpen: false, candidate: null, job: null })}
        candidate={aiMatchModal.candidate}
        job={aiMatchModal.job}
        onOpenSubmissionPacket={(cand, job) => openPacketForCandidate(cand, job)}
      />

      {/* Bulk Resume Upload Modal */}
      <BulkResumeUploadModal
        isOpen={showBulkUpload}
        onClose={() => setShowBulkUpload(false)}
        addCandidates={addCandidates}
        showToast={showToast}
      />

      {/* Field Full View Overlay Modal */}
      <Modal
        open={!!expandedFieldModal}
        onClose={() => setExpandedFieldModal(null)}
        title={expandedFieldModal?.title || 'Full Field View'}
        subtitle={expandedFieldModal?.subtitle}
        size="xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <Button
              variant="secondary"
              size="sm"
              leftIcon="copy"
              onClick={() => {
                if (expandedFieldModal?.content) {
                  navigator.clipboard.writeText(expandedFieldModal.content)
                  showToast('Copied to clipboard!')
                }
              }}
            >
              Copy Text
            </Button>
            <Button size="sm" onClick={() => setExpandedFieldModal(null)}>Close</Button>
          </div>
        }
      >
        {expandedFieldModal && (
          <div className="p-4 rounded-xl bg-surface2 border border-border">
            <pre className="text-sm text-text font-sans leading-relaxed whitespace-pre-wrap select-text">
              {expandedFieldModal.content}
            </pre>
          </div>
        )}
      </Modal>
    </PageContainer>
  )
}

// Helpers
function DetailCard({ title, rows }) {
  return (
    <Card padding="sm" className="overflow-hidden min-w-0">
      <div className="text-xs font-bold text-accent uppercase tracking-wide mb-2.5 truncate">{title}</div>
      <div className="flex flex-col">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between items-start gap-2 py-1.5 border-b border-border last:border-0 min-w-0">
            <span className="text-xs text-text3 shrink-0 max-w-[40%] font-medium">{k}</span>
            <span className="text-xs sm:text-sm text-text font-medium text-right break-all min-w-0 flex-1 leading-snug">{v || '-'}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function FormSectionTitle({ children }) {
  return <h3 className="text-xs font-bold text-accent uppercase tracking-wide pb-2 mb-3.5 border-b border-border">{children}</h3>
}
