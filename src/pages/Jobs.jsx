import { useState, useEffect, useCallback, useMemo } from 'react'
import { db } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useCandidates } from '../hooks/useCandidates'
import SubmissionPacketModal from '../components/SubmissionPacketModal'
import AIMatchModal from '../components/AIMatchModal'
import { PageContainer } from '../components/layout/PageContainer'
import { computeJobHealth } from '../lib/jobHealth'
import {
  Button, Input, Textarea, FormField, Select, Combobox, Badge, StatusPill, Card, CardHeader,
  KPICard, PageHeader, Table, Modal, Icon, Avatar, Menu, MenuTrigger, EmptyState, Switch,
} from '../components/ui'
import { WorkspaceSearch, FilterWorkspace, EntityDrawer } from '../components/workspace'
import { Drawer } from '../components/ui/Modal'
import AIInsightCard from '../components/ai/AIInsightCard'
import { useAISetContext } from '../lib/ai/context'
import { useAIGovernance } from '../lib/ai/governance'
import { runAiAction } from '../lib/ai/aiClient'
import { logUsageEvent } from '../lib/ai/usage'
import MarkdownView from '../components/MarkdownView'

function ensureArray(val) {
  if (Array.isArray(val)) return val
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val)
      if (Array.isArray(parsed)) return parsed
    } catch {
      if (val.trim()) return val.split(',').map(s => s.trim()).filter(Boolean)
    }
  }
  return []
}

const GENERIC_SOFT_SKILLS = ['communication', 'leadership', 'teamwork', 'problem solving', 'agile', 'scrum', 'jira', 'management', 'collaboration']

export function getMatchingCandidates(job, candidates, aiScores = {}) {
  if (!job || !candidates) return []

  const origJobSkills = ensureArray(job.skills)
  const jobSkills = origJobSkills.map(s => String(s).toLowerCase().trim())
  const domainJobSkills = jobSkills.filter(s => !GENERIC_SOFT_SKILLS.includes(s))
  const jobTitle = String(job.title || '').toLowerCase()
  const jobDesc = String(job.description || '').toLowerCase()
  const reqJobId = String(job.job_id || '').toLowerCase().trim()

  return candidates.map(c => {
    const origCandSkills = ensureArray(c.skills)
    const candJobId = String(c.job_id || '').toLowerCase().trim()
    const matchByJobId = Boolean(reqJobId && candJobId && reqJobId === candJobId)

    // Overlapping skills
    const matchedSkills = origCandSkills.filter(s => {
      const lower = String(s).toLowerCase().trim()
      return jobSkills.includes(lower) || (jobTitle && jobTitle.includes(lower)) || (jobDesc && jobDesc.includes(lower))
    })

    const matchedDomainSkills = origCandSkills.filter(s => {
      const lower = String(s).toLowerCase().trim()
      return !GENERIC_SOFT_SKILLS.includes(lower) && (jobSkills.includes(lower) || (jobTitle && jobTitle.includes(lower)) || (jobDesc && jobDesc.includes(lower)))
    })

    // Calculate intelligent baseline AI match percentage
    let calculatedScore = 0
    if (domainJobSkills.length > 0) {
      const overlapCount = matchedDomainSkills.filter(s => domainJobSkills.includes(String(s).toLowerCase().trim())).length
      calculatedScore = Math.round((overlapCount / domainJobSkills.length) * 100)
    } else if (matchedDomainSkills.length > 0) {
      calculatedScore = Math.min(100, matchedDomainSkills.length * 33)
    }

    // Role & Title Alignment factor
    const candTitle = String(c.job_title || '').toLowerCase()
    let titleFactor = 1.0
    if (candTitle && jobTitle) {
      const stopWords = ['senior', 'junior', 'lead', 'staff', 'principal', 'engineer', 'developer', 'manager', 'specialist']
      const candWords = candTitle.split(/[\s,/\\_-]+/).filter(w => w.length > 2 && !stopWords.includes(w))
      const jobWords = jobTitle.split(/[\s,/\\_-]+/).filter(w => w.length > 2 && !stopWords.includes(w))

      if (candWords.length > 0 && jobWords.length > 0) {
        const titleOverlap = candWords.filter(w => jobWords.includes(w))
        if (titleOverlap.length === 0) {
          titleFactor = 0.5 // Heavy domain mismatch penalty (e.g. Dentist vs Welder)
        }
      }
    }
    calculatedScore = Math.round(calculatedScore * titleFactor)

    if (matchByJobId) {
      calculatedScore = Math.max(calculatedScore, 75)
    }

    const aiKey1 = `${c.id}_${job.id}`
    const aiKey2 = `${c.id}_${job.job_id}`
    const isAiEvaluated = Boolean(aiScores && (aiScores[aiKey1] !== undefined || aiScores[aiKey2] !== undefined))

    const skillTitleScore = calculatedScore
    const deepAiScore = isAiEvaluated ? (aiScores[aiKey1] !== undefined ? aiScores[aiKey1] : aiScores[aiKey2]) : null
    const finalScore = isAiEvaluated && deepAiScore !== null ? deepAiScore : skillTitleScore

    // Candidates submitted to this job requisition (matchByJobId) or matching skills >= 30% are shown in Pipeline
    const isMatched = matchByJobId || finalScore >= 30

    return {
      candidate: c,
      matchedSkills: matchedDomainSkills.length > 0 ? matchedDomainSkills : matchedSkills,
      matchPercentage: finalScore,
      skillTitleScore,
      deepAiScore,
      isAiEvaluated,
      isMatched,
      matchByJobId
    }
  }).filter(item => item.isMatched).sort((a, b) => b.matchPercentage - a.matchPercentage)
}

const emptyForm = {
  job_id: '', title: '', client: '', location: '', type: 'Contract',
  status: 'Open', rate: '', open_date: new Date().toISOString().slice(0, 10),
  priority: 'Medium', fe: '', skills: [], description: ''
}

export default function Jobs() {
  const { user, organization, profile } = useAuth()
  const isSuperAdmin = profile?.role === 'superadmin' || profile?.role === 'SUPERADMIN'
  const [allOrgsView, setAllOrgsView] = useState(false)
  const { candidates } = useCandidates({ allOrgs: isSuperAdmin && allOrgsView })
  const orgId = organization?.id || profile?.org_id
  const userId = user?.id
  const { settings: aiSettings } = useAIGovernance(orgId)
  const aiEnabled = aiSettings.workspaces.jobs !== false
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ status: [], priority: [], type: [], recruiter: [], job: [], location: [] })
  const [selected, setSelected] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [showDetail, setShowDetail] = useState(null)
  useAISetContext(showDetail ? { currentJob: showDetail.title, jobClient: showDetail.client, jobStatus: showDetail.status } : null)
  const [previewTab, setPreviewTab] = useState('overview')
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [skillInput, setSkillInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [lastUpdatedJob, setLastUpdatedJob] = useState(null)
  const [toast, setToast] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [viewingCandidate, setViewingCandidate] = useState(null)
  const [packetModal, setPacketModal] = useState({ isOpen: false, candidate: null, job: null })
  const [aiMatchModal, setAiMatchModal] = useState({ isOpen: false, candidate: null, job: null })
  const aiScoresKey = user?.id ? `talentdesk_ai_scores_${user.id}` : 'talentdesk_ai_scores'
  const [aiScores, setAiScores] = useState(() => {
    try {
      const saved = localStorage.getItem(aiScoresKey)
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  // Re-sync AI scores when active user changes
  useEffect(() => {
    if (!user) return
    try {
      const saved = localStorage.getItem(`talentdesk_ai_scores_${user.id}`)
      setAiScores(saved ? JSON.parse(saved) : {})
    } catch {
      setAiScores({})
    }
  }, [user])

  // Explain Candidate Match — reuses the EXISTING skill/title matching
  // logic (getMatchingCandidates above) as the source of truth; the AI only
  // explains the already-computed result in prose, it never re-scores.
  const [explainOpen, setExplainOpen] = useState(false)
  const [explainResult, setExplainResult] = useState(null)
  const [explainLoading, setExplainLoading] = useState(false)
  const [explainError, setExplainError] = useState(null)

  const explainMatch = async (candidate, job, matchInfo) => {
    setExplainOpen(true)
    setExplainLoading(true)
    setExplainError(null)
    setExplainResult(null)
    const startedAt = new Date().getTime()
    const content = [
      `Candidate: ${candidate.first_name} ${candidate.last_name}`,
      `Candidate Skills: ${ensureArray(candidate.skills).join(', ') || 'None listed'}`,
      `Candidate Title: ${candidate.job_title || 'Not specified'}`,
      `Candidate Experience: ${candidate.experience ? candidate.experience + ' years' : 'Not specified'}`,
      `Job: ${job.title || 'Untitled role'} at ${job.client || 'the client'}`,
      `Job Required Skills: ${ensureArray(job.skills).join(', ') || 'None listed'}`,
      `Already-Matched Skills: ${matchInfo.matchedSkills.join(', ') || 'None'}`,
      `Skill & Title Match Score: ${matchInfo.skillTitleScore}%`,
      matchInfo.isAiEvaluated && matchInfo.deepAiScore !== null ? `Deep AI Fit Score: ${matchInfo.deepAiScore}%` : null,
    ].filter(Boolean).join('\n')
    try {
      const res = await runAiAction({
        action: 'explain',
        content,
        context: 'Explain this match: candidate strengths for this role, any missing required skills, the reasoning behind the fit, and a brief hiring recommendation. Use only the information given — never invent skills or facts.',
      })
      if (res.success === false) throw new Error(res.error || 'Explanation failed.')
      setExplainResult(res.text)
      logUsageEvent(orgId, userId, { type: 'action', action: 'explain', source: 'jobs', success: true, provider: res.provider, model: res.model, durationMs: new Date().getTime() - startedAt, preview: res.text.slice(0, 140) })
    } catch (err) {
      const message = err.message || 'Explanation failed. Please try again.'
      setExplainError(message)
      logUsageEvent(orgId, userId, { type: 'action', action: 'explain', source: 'jobs', success: false, error: message, durationMs: new Date().getTime() - startedAt })
    } finally {
      setExplainLoading(false)
    }
  }

  const openPacketModal = (candidate, job) => {
    setPacketModal({ isOpen: true, candidate, job })
  }

  const openAiMatchModal = (candidate, job) => {
    setAiMatchModal({ isOpen: true, candidate, job })
  }

  const handleMatchEvaluated = (candId, jobObjOrId, score) => {
    setAiScores(prev => {
      const jId1 = typeof jobObjOrId === 'object' ? jobObjOrId.id : jobObjOrId
      const jId2 = typeof jobObjOrId === 'object' ? (jobObjOrId.job_id || jobObjOrId.id) : jobObjOrId
      const updated = {
        ...prev,
        [`${candId}_${jId1}`]: score,
        [`${candId}_${jId2}`]: score
      }
      try {
        localStorage.setItem(aiScoresKey, JSON.stringify(updated))
      } catch (err) {
        console.warn('Could not cache AI score', err)
      }
      return updated
    })
  }

  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true)
      console.log('[Jobs] Fetching jobs for user:', user?.id)
      let query = db.from('jobs').select('*').order('created_at', { ascending: false })
      if (isSuperAdmin && allOrgsView) {
        query = query.param('all_orgs', 'true')
      }
      const { data, error } = await query
      console.log('[Jobs] Fetch response:', { data, error })
      if (error) {
        console.error('[Jobs] Fetch error:', error)
      }
      setJobs(data || [])
      console.log('[Jobs] Jobs set:', data?.length || 0, 'items')
      setLoading(false)
    } catch (err) {
      console.error('[Jobs] Exception:', err)
      setLoading(false)
    }
  }, [user, isSuperAdmin, allOrgsView])

  useEffect(() => {
    console.log('[Jobs] useEffect triggered, user:', user?.id)
    if (user) fetchJobs()
  }, [user, fetchJobs])

  // Real per-job activity timeline (Activity drawer tab): callbacks/follow-ups
  // don't have a job_id FK, only candidate_name — so we fetch both once and
  // cross-reference through this job's own job_id-matched candidates.
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

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const typeOptions = [...new Set(jobs.map(j => j.type).filter(Boolean))].sort()
  const recruiterOptions = [...new Set(jobs.map(j => j.fe).filter(Boolean))].sort()
  const locationOptions = [...new Set(jobs.map(j => j.location).filter(Boolean))].sort()
  const titleOptions = [...new Set(jobs.map(j => j.title).filter(Boolean))].sort()
  const jobIdToTitle = jobs.reduce((map, j) => {
    if (j.job_id && j.title && !map[j.job_id]) map[j.job_id] = j.title
    return map
  }, {})
  const jobOptions = [...new Set(jobs.map(j => j.job_id || j.title).filter(Boolean))].sort()
    .map(id => ({ value: id, label: jobIdToTitle[id] ? `${id} · ${jobIdToTitle[id]}` : id }))

  const filtered = jobs.filter(j => {
    const q = search.toLowerCase()
    const matchSearch = !q || `${j.title} ${j.client} ${j.job_id} ${j.location}`.toLowerCase().includes(q)
    if (!matchSearch) return false
    if (filters.status.length && !filters.status.includes(j.status)) return false
    if (filters.priority.length && !filters.priority.includes(j.priority)) return false
    if (filters.type.length && !filters.type.includes(j.type)) return false
    if (filters.recruiter.length && !filters.recruiter.includes(j.fe)) return false
    if (filters.job?.length && !filters.job.includes(j.job_id) && !filters.job.includes(j.title)) return false
    if (filters.location?.length && !filters.location.includes(j.location)) return false
    return true
  })

  const hasFilters = search || Object.values(filters).some(f => f.length > 0)
  useAISetContext({ workspace: 'Jobs', totalJobs: jobs.length, shownJobs: filtered.length, activeFilters: hasFilters ? filters : null, selectedCount: selected.length })
  const clearFilters = () => { setSearch(''); setFilters({ status: [], priority: [], type: [], recruiter: [], job: [], location: [] }) }

  const openAdd = () => { setForm(emptyForm); setEditingId(null); setSkillInput(''); setShowModal(true) }
  const openEdit = (j) => {
    setForm({ job_id: j.job_id || '', title: j.title || '', client: j.client || '', location: j.location || '', type: j.type || 'Contract', status: j.status || 'Open', rate: j.rate || '', open_date: j.open_date || new Date().toISOString().slice(0, 10), priority: j.priority || 'Medium', fe: j.fe || '', skills: j.skills || [], description: j.description || '' })
    setEditingId(j.id); setSkillInput(''); setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.title) return showToast('Job title required', 'error')
    setSaving(true)
    const nowIso = new Date().toISOString()
    const payload = { ...form, open_date: form.open_date || null, user_id: user.id, updated_at: nowIso }
    if (editingId) {
      const { error } = await db.from('jobs').update(payload).eq('id', editingId)
      if (error) showToast(error.message, 'error')
      else {
        showToast('Job updated!')
        setLastUpdatedJob({ id: editingId, title: form.title, updated_at: nowIso })
        fetchJobs()
        setShowModal(false)
      }
    } else {
      const { error } = await db.from('jobs').insert([payload])
      if (error) showToast(error.message, 'error')
      else { showToast('Job added!'); fetchJobs(); setShowModal(false) }
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    if (deleteId === 'bulk') {
      for (const id of selected) await db.from('jobs').delete().eq('id', id)
      showToast(`${selected.length} jobs deleted`, 'error')
      setSelected([])
    } else {
      await db.from('jobs').delete().eq('id', deleteId)
      showToast('Job deleted!', 'error')
    }
    fetchJobs(); setDeleteId(null)
  }

  const addSkill = (e) => {
    if (e.key === 'Enter' && skillInput.trim()) {
      e.preventDefault()
      if (!form.skills.includes(skillInput.trim())) setForm(f => ({ ...f, skills: [...f.skills, skillInput.trim()] }))
      setSkillInput('')
    }
  }

  const inp = (field) => ({ value: form[field], onChange: e => setForm(f => ({ ...f, [field]: e.target.value })) })

  // Job's own status vocabulary is small and specific — resolve StatusPill tone directly.
  const STATUS_TONE = { 'Open': 'green', 'Filled': 'accent', 'On Hold': 'yellow', 'Closed': 'red' }

  const jobsWithHealth = useMemo(() => filtered.map(j => ({ ...j, health: computeJobHealth(j, candidates) })), [filtered, candidates])

  const openJobs = jobs.filter(j => j.status === 'Open')
  const avgTimeOpen = openJobs.length ? Math.round(openJobs.reduce((sum, j) => sum + computeJobHealth(j, candidates).openDays, 0) / openJobs.length) : 0
  const urgentCount = jobs.filter(j => { const h = computeJobHealth(j, candidates); return h.statusTag === 'Critical' || h.statusTag === 'At Risk' }).length

  const jobKpis = [
    { label: 'Open Roles', value: openJobs.length, helper: `${jobs.length} total`, tone: 'green', icon: 'jobs' },
    { label: 'Filled', value: jobs.filter(j => j.status === 'Filled').length, helper: 'placements', tone: 'accent', icon: 'checkCircle' },
    { label: 'On Hold', value: jobs.filter(j => j.status === 'On Hold').length, helper: 'paused', tone: 'yellow', icon: 'clock' },
    { label: 'At Risk / Urgent', value: urgentCount, helper: 'need attention', tone: 'red', icon: 'alertCircle' },
    { label: 'Active Recruiters', value: recruiterOptions.length, helper: 'assigned', tone: 'ai', icon: 'users' },
    { label: 'Avg. Time Open', value: `${avgTimeOpen}d`, helper: 'open roles', tone: 'orange', icon: 'calendar' },
  ]

  const filterDefs = [
    { key: 'job', label: 'Job', type: 'multiselect', options: jobOptions },
    { key: 'location', label: 'Location', type: 'multiselect', options: locationOptions },
    { key: 'status', label: 'Status', type: 'multiselect', options: ['Open', 'Filled', 'On Hold', 'Closed'] },
    { key: 'priority', label: 'Priority', type: 'multiselect', options: ['High', 'Medium', 'Low'] },
    { key: 'type', label: 'Type', type: 'multiselect', options: typeOptions },
    { key: 'recruiter', label: 'Recruiter', type: 'multiselect', options: recruiterOptions },
  ]
  const filterPresets = [
    ...(profile?.full_name ? [{ label: 'My Requisitions', values: { recruiter: [profile.full_name] } }] : []),
    { label: 'Urgent', values: { priority: ['High'] } },
  ]

  // Real per-job activity: this job's job_id-matched candidates' submissions,
  // plus callbacks/follow-ups logged against those same candidates.
  const jobTimeline = useMemo(() => {
    if (!showDetail) return []
    const jobCandidates = showDetail.job_id ? candidates.filter(c => c.job_id === showDetail.job_id) : []
    const names = new Set(jobCandidates.map(c => `${c.first_name || ''} ${c.last_name || ''}`.trim().toLowerCase()))
    const events = [
      ...jobCandidates.filter(c => c.created_at).map(c => ({ id: `c-${c.id}`, type: 'Submission', title: `${c.first_name || ''} ${c.last_name || ''}`.trim(), date: (c.created_at || '').slice(0, 10), status: c.internal_status })),
      ...callbacksLog.filter(cb => names.has((cb.candidate_name || '').trim().toLowerCase())).map(cb => ({ id: `cb-${cb.id}`, type: 'Callback', title: cb.candidate_name, date: cb.date, status: cb.status })),
      ...followupsLog.filter(fu => names.has((fu.candidate_name || '').trim().toLowerCase())).map(fu => ({ id: `fu-${fu.id}`, type: 'Follow-up', title: fu.candidate_name, date: fu.date, status: fu.status })),
    ]
    return events.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
  }, [showDetail, candidates, callbacksLog, followupsLog])

  function formatRelativeTimeAgo(dateStr) {
    if (!dateStr) return null
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return null
    const now = new Date()
    const diffSecs = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diffSecs < 10) return 'just now'
    if (diffSecs < 60) return `${diffSecs} seconds ago`

    const diffMins = Math.floor(diffSecs / 60)
    if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`

    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`

    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`

    const diffMonths = Math.floor(diffDays / 30)
    return `${diffMonths} month${diffMonths === 1 ? '' : 's'} ago`
  }

  function formatLastActivity(dateStr) {
    if (!dateStr) return '—'
    const days = Math.floor((new Date().getTime() - new Date(dateStr).getTime()) / 86400000)
    if (days <= 0) return 'Today'
    if (days === 1) return 'Yesterday'
    return `${days}d ago`
  }

  const jobColumns = [
    {
      key: 'role', header: 'Role & Client', width: 220, sortable: true, sortValue: (j) => j.title || '',
      render: (j) => (
        <span className="flex flex-col gap-0.5 min-w-0">
          <strong className="text-text font-bold truncate">{j.title || 'Untitled role'}</strong>
          <span className="text-xs text-text3 truncate"><span className="font-mono text-accent">{j.job_id || 'No ID'}</span> · {j.client || 'Client n/a'}</span>
          {j.updated_at && (
            <span className="inline-flex items-center gap-1 text-[10px] text-accent font-medium mt-0.5">
              <Icon name="clock" size={10} />
              updated {formatRelativeTimeAgo(j.updated_at)}
            </span>
          )}
        </span>
      ),
    },
    ...(isSuperAdmin && allOrgsView ? [{ key: 'org_name', header: 'Organization', width: 140, sortable: true, hideable: true, render: (j) => <Badge tone="accent" size="sm">{j.org_name || organization?.name || 'TalentDesk'}</Badge> }] : []),
    { key: 'status', header: 'Status', width: 100, sortable: true, render: (j) => <StatusPill status={j.status || 'Open'} tone={STATUS_TONE[j.status] || 'neutral'} size="sm" /> },
    { key: 'type', header: 'Type', width: 110, hideable: true },
    { key: 'location', header: 'Location', width: 130, hideable: true },
    { key: 'rate', header: 'Rate', width: 110, hideable: true, className: 'text-xs font-semibold text-green' },
    { key: 'fe', header: 'Recruiter', width: 150, render: (j) => <span className="flex items-center gap-2"><Avatar name={j.fe || '?'} size="xs" />{j.fe || 'Unassigned'}</span> },
    {
      key: 'submittals',
      header: 'Submitted',
      width: 110,
      sortable: true,
      sortValue: (j) => j.health.submittals,
      render: (j) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setShowDetail(j)
            setPreviewTab('pipeline')
          }}
          title={`Click to view ${j.health.submittals} candidate submissions for ${j.title || 'this job'}`}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-xs font-bold transition-all duration-150 cursor-pointer bg-accent/12 text-accent hover:bg-accent hover:text-white hover:shadow-sm"
        >
          <Icon name="users" size={12} />
          <span>{j.health.submittals}</span>
        </button>
      ),
    },
    { key: 'interviews', header: 'Int', width: 70, hideable: true, align: 'right', sortable: true, sortValue: (j) => j.health.interviews, render: (j) => j.health.interviews },
    { key: 'hires', header: 'Placed', width: 70, hideable: true, align: 'right', sortable: true, sortValue: (j) => j.health.hires, render: (j) => j.health.hires },
    { key: 'age', header: 'Age', width: 75, hideable: true, align: 'right', sortable: true, sortValue: (j) => j.health.openDays, render: (j) => `${j.health.openDays}d` },
  ]

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Recruiting Workspace"
        title="Jobs"
        subtitle={`Track open positions, client requisitions, candidate matches, and requisition status (${jobs.length} total roles).`}
        actions={
          <>
            {isSuperAdmin && <Switch checked={allOrgsView} onChange={setAllOrgsView} label="All orgs" />}
            <Button variant="primary" leftIcon="plus" onClick={openAdd}>New Job</Button>
          </>
        }
        search={<WorkspaceSearch value={search} onChange={setSearch} storageKey="td_jobs" placeholder="Search jobs, client, owner, or ID..." />}
        filters={
          <FilterWorkspace
            filters={filterDefs}
            values={filters}
            onChange={(key, value) => setFilters(f => ({ ...f, [key]: value }))}
            onReset={clearFilters}
            presets={filterPresets}
            storageKey="jobs"
          />
        }
      />

      {lastUpdatedJob && (
        <div className="my-3 p-3 rounded-[var(--radius-md)] bg-accent/10 border border-accent/30 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center shrink-0">
              <Icon name="checkCircle" size={16} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-text truncate">Job Updated</div>
              <div className="text-xs text-text2 truncate">
                <strong className="text-text font-semibold">{lastUpdatedJob.title}</strong> — updated {formatRelativeTimeAgo(lastUpdatedJob.updated_at)}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setLastUpdatedJob(null)}
            className="text-xs font-semibold text-text3 hover:text-text px-2.5 py-1 rounded bg-surface2 border border-border shrink-0 ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 my-5">
        {jobKpis.map(stat => (
          <KPICard key={stat.label} label={stat.label} value={stat.value} helper={stat.helper} tone={stat.tone} icon={stat.icon} />
        ))}
      </div>

      <div className="flex items-center justify-between mb-2.5">
        <span className="text-xs text-text3">
          {filtered.length !== jobs.length ? `${filtered.length} / ${jobs.length} shown` : `${jobs.length} roles`}
        </span>
      </div>

      <Table
        columns={jobColumns}
        data={jobsWithHealth}
        loading={loading}
        resizable
        selectable
        selectedIds={selected}
        onSelectionChange={setSelected}
        onRowClick={(j) => { setShowDetail(j); setPreviewTab('overview') }}
        emptyState={
          <EmptyState
            icon="jobs"
            title={hasFilters ? 'No jobs match your filters' : 'No jobs yet'}
            description={!hasFilters ? "Create your first job requisition to start tracking client demand." : undefined}
            action={!hasFilters ? <Button variant="primary" leftIcon="plus" onClick={openAdd}>New Job</Button> : undefined}
          />
        }
        bulkActions={
          <>
            <Menu
              align="start"
              trigger={({ toggle }) => <Button size="sm" variant="secondary" onClick={toggle}>Change Status</Button>}
              items={['Open', 'Filled', 'On Hold', 'Closed'].map(s => ({
                label: s,
                onClick: async () => { for (const id of selected) await db.from('jobs').update({ status: s }).eq('id', id); showToast(`${selected.length} jobs updated to "${s}"`); setSelected([]); fetchJobs() },
              }))}
            />
            <Button size="sm" variant="danger" onClick={() => setDeleteId('bulk')}>Delete</Button>
          </>
        }
        rowActions={(j) => (
          <Menu
            align="end"
            trigger={(p) => <MenuTrigger {...p} />}
            items={[
              { label: 'View details', icon: 'eye', onClick: () => { setShowDetail(j); setPreviewTab('overview') } },
              { label: 'View pipeline / matches', icon: 'pipeline', onClick: () => { setShowDetail(j); setPreviewTab('pipeline') } },
              { label: 'Edit', icon: 'edit', onClick: () => openEdit(j) },
              'divider',
              { label: 'Delete', icon: 'trash', danger: true, onClick: () => setDeleteId(j.id) },
            ]}
          />
        )}
        contextMenuItems={(j) => [
          { label: 'View details', icon: 'eye', onClick: () => { setShowDetail(j); setPreviewTab('overview') } },
          { label: 'View pipeline / matches', icon: 'pipeline', onClick: () => { setShowDetail(j); setPreviewTab('pipeline') } },
          { label: 'Edit', icon: 'edit', onClick: () => openEdit(j) },
          'divider',
          { label: 'Delete', icon: 'trash', danger: true, onClick: () => setDeleteId(j.id) },
        ]}
      />

      <Drawer
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingId ? 'Edit Job' : 'Add Job'}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={handleSave}>{editingId ? 'Update Job' : 'Save Job'}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <div>
            <FormSectionTitle>Basic Information</FormSectionTitle>
            <div className="grid sm:grid-cols-2 gap-3.5">
              <FormField label="Job Title" required><Combobox value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} options={titleOptions} placeholder="Senior Developer" /></FormField>
              <FormField label="Reference ID"><Input {...inp('job_id')} placeholder="JOB-001" /></FormField>
              <FormField label="Client"><Input {...inp('client')} placeholder="Acme Corp" /></FormField>
              <FormField label="Status"><Select value={form.status} onChange={v => setForm(f => ({ ...f, status: v }))} options={['Open', 'Filled', 'On Hold', 'Closed'].map(o => ({ value: o, label: o }))} /></FormField>
              <FormField label="Priority"><Select value={form.priority} onChange={v => setForm(f => ({ ...f, priority: v }))} options={['High', 'Medium', 'Low'].map(o => ({ value: o, label: o }))} /></FormField>
              <FormField label="Employment Type"><Select value={form.type} onChange={v => setForm(f => ({ ...f, type: v }))} options={['Contract', 'Full-time', 'Contract-to-Hire', 'Part-time'].map(o => ({ value: o, label: o }))} /></FormField>
              <FormField label="Recruiter"><Combobox value={form.fe} onChange={v => setForm(f => ({ ...f, fe: v }))} options={recruiterOptions} placeholder="Sarah K." /></FormField>
            </div>
          </div>

          <div>
            <FormSectionTitle>Location</FormSectionTitle>
            <FormField label="Location"><Combobox value={form.location} onChange={v => setForm(f => ({ ...f, location: v }))} options={locationOptions} placeholder="New York, NY / Remote" /></FormField>
          </div>

          <div>
            <FormSectionTitle>Compensation</FormSectionTitle>
            <FormField label="Rate"><Input {...inp('rate')} placeholder="$80-100/hr" /></FormField>
          </div>

          <div>
            <FormSectionTitle>Timeline</FormSectionTitle>
            <FormField label="Open Date"><Input {...inp('open_date')} type="date" /></FormField>
          </div>

          <div>
            <FormSectionTitle>Description &amp; Skills</FormSectionTitle>
            <div className="flex flex-col gap-3.5">
              <FormField label="Required Skills (press Enter to add)">
                <div className="bg-surface2 border border-border rounded-[var(--radius-sm)] p-2 flex flex-wrap gap-1.5 min-h-[42px]">
                  {form.skills.map(s => (
                    <Badge key={s} tone="accent">
                      {s} <button type="button" onClick={() => setForm(f => ({ ...f, skills: f.skills.filter(x => x !== s) }))} className="ml-1 opacity-70 hover:opacity-100">×</button>
                    </Badge>
                  ))}
                  <input value={skillInput} onChange={e => setSkillInput(e.target.value)} onKeyDown={addSkill} placeholder="React, Python..." className="bg-transparent border-none outline-none text-text text-sm min-w-[120px] flex-1" />
                </div>
              </FormField>
              <FormField label="Description"><Textarea {...inp('description')} rows={4} /></FormField>
            </div>
          </div>
        </div>
      </Drawer>

      {showDetail && (() => {
        const matches = getMatchingCandidates(showDetail, candidates, aiScores)
        const health = computeJobHealth(showDetail, candidates)
        const submittedCandidates = showDetail.job_id ? candidates.filter(c => c.job_id === showDetail.job_id) : []
        return (
          <EntityDrawer
            open={!!showDetail}
            onClose={() => setShowDetail(null)}
            avatarName={showDetail.client || showDetail.title || '?'}
            eyebrow="Job Requisition"
            title={showDetail.title || 'Untitled role'}
            subtitle={<>Job ID: <span className="text-accent font-mono">{showDetail.job_id || 'n/a'}</span> · {showDetail.client || 'Client n/a'}</>}
            status={<StatusPill status={showDetail.status || 'Open'} tone={STATUS_TONE[showDetail.status] || 'neutral'} size="sm" />}
            size="lg"
            tabs={[{ id: 'overview', label: 'Overview' }, { id: 'pipeline', label: 'Pipeline', count: matches.length }, { id: 'activity', label: 'Activity', count: jobTimeline.length }, ...(aiEnabled ? [{ id: 'ai', label: 'AI' }] : [])]}
            activeTab={previewTab}
            onTabChange={setPreviewTab}
            actions={
              <>
                <Button variant="secondary" onClick={() => { const job = showDetail; setShowDetail(null); openEdit(job) }}>Edit Job</Button>
                <Button variant="danger" onClick={() => { setShowDetail(null); setDeleteId(showDetail.id) }}>Delete Job</Button>
              </>
            }
          >
            {previewTab === 'overview' && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between p-3 rounded-[var(--radius-md)] bg-surface2 border border-border">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-accent/15 text-accent flex items-center justify-center shrink-0">
                      <Icon name="clock" size={14} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-text3 uppercase tracking-wide">Last Update</div>
                      <div className="text-xs font-bold text-text truncate">
                        Updated {formatRelativeTimeAgo(showDetail.updated_at) || 'recently'}
                      </div>
                    </div>
                  </div>
                  <Badge size="sm" tone="accent">Modified</Badge>
                </div>

                <div className="grid sm:grid-cols-3 gap-3">
                  {[['Location', showDetail.location], ['Type', showDetail.type], ['Rate', showDetail.rate], ['Priority', showDetail.priority], ['Recruiter', showDetail.fe], ['Open Date', showDetail.open_date]].map(([label, value]) => (
                    <div key={label} className="bg-surface2 border border-border rounded-[var(--radius-sm)] p-3">
                      <div className="text-[11px] text-text3 uppercase tracking-wide mb-1">{label}</div>
                      <div className="text-sm text-text font-semibold">{value || '-'}</div>
                    </div>
                  ))}
                </div>

                <Card className={health.statusTag === 'Critical' ? 'border-red/30 bg-red/5' : health.statusTag === 'At Risk' ? 'border-yellow/30 bg-yellow/5' : 'border-green/30 bg-green/5'}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wide text-text2">Job Health</span>
                    <StatusPill status={health.statusTag} tone={health.statusTone === 'amber' ? 'yellow' : health.statusTone} />
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
                    {[['Submittals', health.submittals], ['Interviews', health.interviews], ['Offers', health.offers], ['Placed', health.hires], ['Age', `${health.openDays}d`]].map(([label, value]) => (
                      <div key={label} className="text-center">
                        <div className="text-lg font-extrabold text-text font-mono">{value}</div>
                        <div className="text-[10px] text-text3 uppercase tracking-wide mt-0.5">{label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-border text-xs text-text3">Placement probability: <b className="text-text2">{health.placementProb}</b> · Last activity {formatLastActivity(showDetail.updated_at)}</div>

                  {submittedCandidates.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <div className="text-[10px] font-bold text-text3 uppercase tracking-wide mb-2">Submitted Candidates ({submittedCandidates.length})</div>
                      <div className="flex flex-wrap gap-2">
                        {submittedCandidates.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setViewingCandidate(c)}
                            className="focus-ring flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-surface2 border border-border hover:border-accent/40 hover:bg-surface3 transition-colors duration-[var(--duration-fast)]"
                          >
                            <Avatar name={`${c.first_name || ''} ${c.last_name || ''}`.trim() || 'C'} size="xs" />
                            <span className="text-xs font-semibold text-text truncate max-w-[120px]">{c.first_name} {c.last_name}</span>
                            <StatusPill status={c.internal_status || 'Pending'} size="sm" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>

                {ensureArray(showDetail.skills).length > 0 && (
                  <Card>
                    <CardHeader title="Skills Required" />
                    <div className="flex flex-wrap gap-1.5">
                      {showDetail.skills.map(s => <Badge key={s} tone="accent">{s}</Badge>)}
                    </div>
                  </Card>
                )}

                {showDetail.description && (
                  <Card>
                    <CardHeader title="Description" />
                    <p className="text-sm text-text2 leading-relaxed whitespace-pre-wrap">{showDetail.description}</p>
                  </Card>
                )}
              </div>
            )}

            {previewTab === 'pipeline' && (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
                  {[['Submittals', health.submittals], ['Interviews', health.interviews], ['Offers', health.offers], ['Placed', health.hires], ['Rejected', health.rejected], ['Withdrawn', health.withdrawn]].map(([label, value]) => (
                    <div key={label} className="bg-surface2 border border-border rounded-[var(--radius-sm)] p-2.5 text-center">
                      <div className="text-base font-extrabold text-text font-mono">{value}</div>
                      <div className="text-[10px] text-text3 uppercase tracking-wide mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2 rounded-[var(--radius-md)] bg-ai-soft border border-ai/20 px-3.5 py-2.5">
                  <Icon name="sparkles" size={14} className="text-ai shrink-0" />
                  <p className="text-xs text-text2">Skill &amp; title match calculated from hard skills and target title. Use <b>Deep AI Fit Radar</b> on any candidate for in-depth AI analysis.</p>
                </div>

                {matches.length === 0 ? (
                  <EmptyState icon="users" title="No matched candidates" description="No candidate profiles currently match this job's required skills." />
                ) : (
                  <div className="flex flex-col gap-3">
                    {matches.map((matchInfo) => {
                      const { candidate, matchedSkills, skillTitleScore, deepAiScore, isAiEvaluated, matchByJobId } = matchInfo
                      return (
                        <Card key={candidate.id}>
                          <div className="flex justify-between items-start flex-wrap gap-3 mb-3">
                            <div className="flex items-center gap-3">
                              <Avatar name={`${candidate.first_name || ''} ${candidate.last_name || ''}`.trim() || 'C'} size="md" />
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <strong className="text-sm font-bold text-text">{candidate.first_name} {candidate.last_name}</strong>
                                  {matchByJobId && <Badge tone="accent" size="sm">Job ID Match</Badge>}
                                </div>
                                <div className="text-xs text-text3 mt-0.5">{candidate.email || candidate.phone || 'No contact'} · {candidate.location || 'Location n/a'} · {candidate.experience ? `${candidate.experience} yrs exp` : 'Exp n/a'}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge tone={skillTitleScore < 40 ? 'red' : skillTitleScore < 65 ? 'yellow' : 'accent'} title="Calculated from candidate hard skills and title alignment">{skillTitleScore}% Skill &amp; Title</Badge>
                              {isAiEvaluated && deepAiScore !== null && <Badge tone={deepAiScore < 40 ? 'red' : deepAiScore < 65 ? 'yellow' : 'ai'}>{deepAiScore}% Deep AI</Badge>}
                              <StatusPill status={candidate.internal_status || 'Pending'} size="sm" />
                            </div>
                          </div>

                          {matchedSkills.length > 0 && (
                            <div className="bg-surface2 border border-border rounded-[var(--radius-sm)] p-2.5 mb-3">
                              <div className="text-[10px] font-bold text-text3 uppercase tracking-wide mb-1.5">Matched Skills</div>
                              <div className="flex flex-wrap gap-1.5">{matchedSkills.map(s => <Badge key={s} tone="green" size="sm">{s}</Badge>)}</div>
                            </div>
                          )}

                          {(candidate.resume_text || candidate.notes || ensureArray(candidate.skills).length > 0) && (
                            <p className="text-xs text-text2 leading-relaxed line-clamp-2 mb-3">
                              {candidate.resume_text || candidate.notes || `Top Skills: ${ensureArray(candidate.skills).join(', ')}`}
                            </p>
                          )}

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <Button size="sm" variant="ai" leftIcon="sparkles" onClick={() => openAiMatchModal(candidate, showDetail)}>Deep AI Fit</Button>
                            {aiEnabled && <Button size="sm" variant="secondary" leftIcon="info" onClick={() => explainMatch(candidate, showDetail, matchInfo)}>Explain Match</Button>}
                            <Button size="sm" variant="secondary" onClick={() => openPacketModal(candidate, showDetail)}>1-Click Packet</Button>
                            <Button size="sm" variant="ghost" leftIcon="eye" onClick={() => setViewingCandidate(candidate)}>Profile</Button>
                          </div>
                        </Card>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {previewTab === 'activity' && (
              <div className="flex flex-col gap-2">
                {jobTimeline.length === 0 ? (
                  <EmptyState icon="calendar" title="No activity yet" description="Submissions, callbacks, and follow-ups for this job's candidates will show up here." />
                ) : (
                  jobTimeline.map(ev => (
                    <div key={ev.id} className="flex items-start gap-3 rounded-[var(--radius-md)] border border-border bg-surface2 px-3 py-2.5">
                      <span className="w-7 h-7 rounded-[var(--radius-sm)] bg-accent/10 text-accent flex items-center justify-center shrink-0">
                        <Icon name={ev.type === 'Submission' ? 'arrowUpRight' : ev.type === 'Callback' ? 'callbacks' : 'followups'} size={13} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <strong className="text-xs font-bold text-text">{ev.type}: {ev.title}</strong>
                          <span className="text-[11px] text-text3 shrink-0">{ev.date || '—'}</span>
                        </div>
                        {ev.status && <Badge size="sm" tone="neutral" className="mt-1">{ev.status}</Badge>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {previewTab === 'ai' && aiEnabled && (() => {
              const jobText = [
                `Title: ${showDetail.title || 'Untitled role'}`,
                `Client: ${showDetail.client || 'Not specified'}`,
                `Location: ${showDetail.location || 'Not specified'}`,
                `Type: ${showDetail.type || 'Not specified'}`,
                `Rate: ${showDetail.rate || 'Not specified'}`,
                `Required Skills: ${ensureArray(showDetail.skills).join(', ') || 'None listed'}`,
                showDetail.description ? `Description:\n${showDetail.description}` : null,
              ].filter(Boolean).join('\n')

              return (
                <div className="flex flex-col gap-3">
                  <AIInsightCard
                    orgId={orgId} userId={userId} source="jobs"
                    title="Job Summary" icon="sparkles" actionId="summarize"
                    content={jobText}
                    context="Summarize this requisition for a recruiter who has never seen it — role, client, must-have skills, and what makes it easy or hard to fill."
                  />
                  <AIInsightCard
                    orgId={orgId} userId={userId} source="jobs"
                    title="Improve Job Description" icon="edit" actionId="improve"
                    content={showDetail.description || ''}
                    context="Improve clarity, structure, and candidate appeal without inventing requirements that aren't already implied."
                    emptyHint="No description on file for this job yet."
                  />
                  <AIInsightCard
                    orgId={orgId} userId={userId} source="jobs"
                    title="Screening Questions" icon="checkCircle" actionId="draft"
                    content={`Screening questions for a ${showDetail.title || 'this'} role at ${showDetail.client || 'the client'}. Required skills: ${ensureArray(showDetail.skills).join(', ') || 'not listed'}.`}
                    context="Generate 5 screening questions a recruiter can ask on an initial call to quickly qualify candidates for this role."
                  />
                </div>
              )
            })()}
          </EntityDrawer>
        )
      })()}

      {/* Viewing Candidate Detail Overlay */}
      <Modal
        open={!!viewingCandidate}
        onClose={() => setViewingCandidate(null)}
        size="lg"
        title={viewingCandidate ? `${viewingCandidate.first_name} ${viewingCandidate.last_name}` : ''}
        subtitle={viewingCandidate ? `${viewingCandidate.job_title || 'Candidate Profile'} · ${viewingCandidate.job_id || 'ID n/a'}` : ''}
        footer={<Button variant="primary" onClick={() => setViewingCandidate(null)}>Close</Button>}
      >
        {viewingCandidate && (
          <div className="flex flex-col gap-4">
            <div className="grid sm:grid-cols-2 gap-3">
              {[['Email', viewingCandidate.email], ['Phone', viewingCandidate.phone], ['Location', viewingCandidate.location], ['Work Auth / Experience', `${viewingCandidate.work_auth || '-'} ${viewingCandidate.experience ? `(${viewingCandidate.experience} yrs)` : ''}`]].map(([label, value]) => (
                <div key={label} className="bg-surface2 border border-border rounded-[var(--radius-sm)] p-3">
                  <div className="text-[11px] text-text3 uppercase tracking-wide mb-1">{label}</div>
                  <div className="text-sm text-text font-semibold">{value || '-'}</div>
                </div>
              ))}
            </div>
            <Card>
              <CardHeader title="Skills" />
              <div className="flex flex-wrap gap-1.5">
                {ensureArray(viewingCandidate.skills).map(s => <Badge key={s} tone="accent">{s}</Badge>)}
                {!ensureArray(viewingCandidate.skills).length && <span className="text-text3 text-sm">No skills listed</span>}
              </div>
            </Card>
            {viewingCandidate.resume_text && (
              <Card>
                <CardHeader title="Resume Text" />
                <pre className="text-xs text-text2 leading-relaxed whitespace-pre-wrap font-sans max-h-52 overflow-y-auto">{viewingCandidate.resume_text}</pre>
              </Card>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        size="sm"
        title={deleteId === 'bulk' ? `Delete ${selected.length} jobs?` : 'Delete job?'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-text3">This cannot be undone.</p>
      </Modal>

      {/* Explain Candidate Match */}
      <Modal open={explainOpen} onClose={() => setExplainOpen(false)} size="lg" title="Explain Candidate Match">
        {explainLoading && (
          <div className="flex items-center gap-1 py-6 justify-center">
            {[0, 1, 2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-text3 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
          </div>
        )}
        {explainError && <p className="text-sm text-red">{explainError}</p>}
        {explainResult && <MarkdownView content={explainResult} />}
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
        onOpenSubmissionPacket={(cand, j) => openPacketModal(cand, j)}
        onMatchEvaluated={handleMatchEvaluated}
      />

      {toast && <div style={toastStyle(toast.type)}>{toast.msg}</div>}
    </PageContainer>
  )
}

function FormSectionTitle({ children }) {
  return <h3 className="text-xs font-bold text-accent uppercase tracking-wide pb-2 mb-3.5 border-b border-border">{children}</h3>
}

const toastStyle = (type) => ({ position: 'fixed', bottom: '24px', right: '24px', background: type === 'error' ? 'var(--red)' : 'var(--green)', color: '#fff', padding: '12px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: '600', zIndex: 9999 })

