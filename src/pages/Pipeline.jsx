import { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react'
import { useCandidates } from '../hooks/useCandidates'
import { useOpenCollisionIds } from '../hooks/useOpenCollisionIds'
import { useAuth } from '../context/AuthContext'
import { db } from '../lib/api'
import {
  Button, Badge, StatusPill, Card, CardHeader, KPICard, PageHeader, Modal, Input, Select, TimePicker,
  Textarea, FormField, Icon, Avatar, Menu, MenuTrigger, EmptyState, Tooltip, cn, useToast,
} from '../components/ui'
import { WorkspaceSearch, FilterWorkspace, EntityDrawer } from '../components/workspace'
import { ensureArray, STATUS_TONE, computeScore } from '../lib/candidateHealth'
import { computeJobHealth } from '../lib/jobHealth'
import AIInsightCard from '../components/ai/AIInsightCard'
import MarkdownView from '../components/MarkdownView'
import { useAISetContext } from '../lib/ai/context'
import { useAIGovernance } from '../lib/ai/governance'

const STAGES = [
  { id: 'Submitted', label: 'Submitted', color: '#acaeb5' },
  { id: 'Shortlisted', label: 'Shortlisted', color: '#ff8c42' },
  { id: 'Interview Scheduled', label: 'Interview Scheduled', color: '#4f7cff' },
  { id: 'Interview Done', label: 'Interview Done', color: '#7c5cff' },
  { id: 'Offer Extended', label: 'Offer Extended', color: '#f5c842' },
  { id: 'Hired', label: 'Hired', color: '#2ecc8f' },
  { id: 'Rejected', label: 'Rejected', color: '#ff4d6a' },
]

const TERMINAL_STAGES = ['Hired', 'Rejected']
const QUALIFIED_STAGES = ['Interview Scheduled', 'Interview Done', 'Offer Extended', 'Hired']
const INTERNAL_STATUSES = ['Pending', 'Submitted', 'Shortlisted', 'Interview Scheduled', 'Interview Done', 'Offer Extended', 'Hired', 'Rejected', 'On Hold', 'Withdrew']
const FOLLOWUP_TYPES = ['Call', 'Email', 'Text', 'Check-in', 'Other']
const todayStr = () => new Date().toISOString().slice(0, 10)

function daysAgo(dateStr) {
  if (!dateStr) return null
  const diff = (new Date().getTime() - new Date(dateStr).getTime()) / 86400000
  return Number.isFinite(diff) ? Math.max(0, Math.floor(diff)) : null
}
function isToday(dateStr) {
  if (!dateStr) return false
  return String(dateStr).slice(0, 10) === todayStr()
}
function relativeTime(dateStr) {
  const d = daysAgo(dateStr)
  if (d === null) return '—'
  if (d === 0) return 'Today'
  if (d === 1) return 'Yesterday'
  if (d < 7) return `${d}d ago`
  if (d < 30) return `${Math.floor(d / 7)}w ago`
  return `${Math.floor(d / 30)}mo ago`
}

function readCollapsed() {
  try {
    const saved = localStorage.getItem('td_pipeline_collapsed')
    const parsed = saved ? JSON.parse(saved) : []
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function readHideKpis() {
  try { return localStorage.getItem('td_pipeline_hide_kpis') === 'true' } catch { return false }
}

function readCompactHeader() {
  try { return localStorage.getItem('td_pipeline_compact_header') === 'true' } catch { return false }
}

const initialFilters = {
  job: [], recruiter: [], client: [], priority: [], status: [], location: [], skills: [],
  submittedAfter: '', interviewToday: false, urgentOnly: false, overdueFollowup: false, stageFilter: '',
}

export default function Pipeline() {
  const { user, profile, organization } = useAuth()
  const orgId = organization?.id || profile?.org_id
  const userId = user?.id
  const { settings: aiSettings } = useAIGovernance(orgId)
  const aiEnabled = aiSettings.workspaces.pipeline !== false
  const { candidates, loading, updateCandidate } = useCandidates()
  const openCollisionIds = useOpenCollisionIds()
  const [draggingId, setDraggingId] = useState(null)
  const [overStage, setOverStage] = useState(null)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [hideKpis, setHideKpis] = useState(readHideKpis)
  const [compactHeader, setCompactHeader] = useState(readCompactHeader)
  const stageRefs = useRef(new Map())
  const lastToggledStageRef = useRef(null)

  const toggleKpis = () => {
    setHideKpis(prev => {
      const next = !prev
      try { localStorage.setItem('td_pipeline_hide_kpis', String(next)) } catch { /* quota */ }
      return next
    })
  }

  const toggleCompactHeader = () => {
    setCompactHeader(prev => {
      const next = !prev
      try { localStorage.setItem('td_pipeline_compact_header', String(next)) } catch { /* quota */ }
      return next
    })
  }

  const toggleCollapsed = (stageId) => {
    lastToggledStageRef.current = stageId
    setCollapsed(prev => {
      const next = prev.includes(stageId) ? prev.filter(s => s !== stageId) : [...prev, stageId]
      try { localStorage.setItem('td_pipeline_collapsed', JSON.stringify(next)) } catch { /* quota */ }
      return next
    })
  }

  useLayoutEffect(() => {
    const stageId = lastToggledStageRef.current
    if (!stageId) return
    const stageEl = stageRefs.current.get(stageId)
    if (!stageEl) return
    stageEl.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    lastToggledStageRef.current = null
  }, [collapsed])

  // Real supporting data — jobs (for the "weak pipeline" insight, shared jobHealth.js
  // signal) and callbacks/followups (no candidate_id FK, matched by name — same
  // cross-reference pattern as the Candidate/Job workspaces).
  const [jobs, setJobs] = useState([])
  const [callbacksLog, setCallbacksLog] = useState([])
  const [followupsLog, setFollowupsLog] = useState([])
  useEffect(() => {
    Promise.all([
      db.from('jobs').select('*'),
      db.from('callbacks').select('*'),
      db.from('followups').select('*'),
    ]).then(([jobsRes, cbRes, fuRes]) => {
      setJobs(jobsRes.data || [])
      setCallbacksLog(cbRes.data || [])
      setFollowupsLog(fuRes.data || [])
    }).catch(() => { /* supplementary; board still works without it */ })
  }, [])

  const callbacksByName = useMemo(() => {
    const map = new Map()
    callbacksLog.forEach(cb => {
      const key = (cb.candidate_name || '').trim().toLowerCase()
      if (!key) return
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(cb)
    })
    return map
  }, [callbacksLog])

  const followupsByName = useMemo(() => {
    const map = new Map()
    followupsLog.forEach(fu => {
      const key = (fu.candidate_name || '').trim().toLowerCase()
      if (!key) return
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(fu)
    })
    return map
  }, [followupsLog])

  const getSignals = (c) => {
    const key = `${c.first_name || ''} ${c.last_name || ''}`.trim().toLowerCase()
    const cbs = callbacksByName.get(key) || []
    const fus = followupsByName.get(key) || []
    const today = todayStr()
    return {
      upcomingCallback: cbs.some(cb => cb.date && cb.date >= today && cb.status !== 'Completed'),
      overdueFollowup: (fus.some(fu => fu.date && fu.date < today && fu.status !== 'Completed')) || Boolean(c.followup_date && c.followup_date < today),
      hasNotes: Boolean(c.notes && c.notes.trim()),
      hasCollision: openCollisionIds.has(c.id),
    }
  }

  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState(initialFilters)
  const [showDetail, setShowDetail] = useState(null)
  useAISetContext(showDetail ? {
    currentCandidate: `${showDetail.first_name || ''} ${showDetail.last_name || ''}`.trim(),
    currentPipelineStage: showDetail.external_status,
    candidateJobTitle: showDetail.job_title,
  } : null)
  const [previewTab, setPreviewTab] = useState('overview')
  const [spotlightIds, setSpotlightIds] = useState([])
  const { toast: pushToast } = useToast()
  // See Candidates.jsx for why this delegates to the shared toast instead of
  // a locally-rendered fixed div: a page-nested toast can get trapped behind
  // the floating Copilot launcher's stacking context; the shared one portals
  // straight to document.body and doesn't have that problem.
  const showToast = (msg, type = 'success') => pushToast({ tone: type === 'error' ? 'error' : 'success', title: msg })

  // Quick-create / quick-assign
  const [quickCallback, setQuickCallback] = useState(null)
  const [cbForm, setCbForm] = useState({ date: todayStr(), time: '', notes: '' })
  const [quickFollowup, setQuickFollowup] = useState(null)
  const [fuForm, setFuForm] = useState({ date: todayStr(), type: 'Call', notes: '' })
  const [assignRecruiterFor, setAssignRecruiterFor] = useState(null)
  const [recruiterInput, setRecruiterInput] = useState('')
  const [savingQuick, setSavingQuick] = useState(false)

  const moveCandidate = async (candidateId, externalStatus) => {
    const candidate = candidates.find(item => item.id === candidateId)
    if (!candidate || candidate.external_status === externalStatus) return
    await updateCandidate(candidateId, { external_status: externalStatus })
  }

  const handleDragStart = (event, candidateId) => {
    setDraggingId(candidateId)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', candidateId)
  }

  const handleDrop = async (event, stageId) => {
    event.preventDefault()
    const candidateId = event.dataTransfer.getData('text/plain') || draggingId
    setOverStage(null)
    setDraggingId(null)
    if (candidateId) await moveCandidate(candidateId, stageId)
  }

  // Auto-scroll near the board edges while dragging — pure frontend polish, no
  // backend/state-machine change.
  const boardRef = useRef(null)
  const scrollDirRef = useRef(0)
  useEffect(() => {
    if (!draggingId) return
    let raf
    const tick = () => {
      if (boardRef.current && scrollDirRef.current) boardRef.current.scrollLeft += scrollDirRef.current * 14
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [draggingId])
  const scrollBoardBy = (dir) => {
    boardRef.current?.scrollBy({ left: dir * 380, behavior: 'smooth' })
  }

  const handleBoardDragOver = (event) => {
    const el = boardRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const edge = 80
    if (event.clientX - rect.left < edge) scrollDirRef.current = -1
    else if (rect.right - event.clientX < edge) scrollDirRef.current = 1
    else scrollDirRef.current = 0
  }

  // Plain vertical wheel/trackpad scroll pans the board horizontally between
  // stage columns — the natural desktop affordance for a wide kanban board,
  // since a mouse wheel has no horizontal axis of its own. Scrolling while
  // hovering a column's own card list is left alone so that list still
  // scrolls vertically as expected. (Compact-header toggling has its own
  // explicit button below, so it no longer needs to also live on the wheel.)
  const handleBoardWheel = (e) => {
    if (e.target.closest?.('[data-pipeline-card-list]')) return
    const el = boardRef.current
    if (!el || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
    e.preventDefault()
    el.scrollLeft += e.deltaY
  }

  // Filter option vocab, built from live data (same pattern as Candidates/Jobs)
  const jobIdToTitle = candidates.reduce((map, c) => {
    if (c.job_id && c.job_title && !map[c.job_id]) map[c.job_id] = c.job_title
    return map
  }, {})
  const jobOptions = [...new Set(candidates.map(c => c.job_id).filter(Boolean))].sort()
    .map(id => ({ value: id, label: jobIdToTitle[id] ? `${id} · ${jobIdToTitle[id]}` : id }))
  const recruiterOptions = [...new Set(candidates.map(c => c.recruiter_name).filter(Boolean))].sort()
  const clientOptions = [...new Set(candidates.map(c => c.client).filter(Boolean))].sort()
  const locationOptions = [...new Set(candidates.map(c => c.location).filter(Boolean))].sort()
  const skillOptions = [...new Set(candidates.flatMap(c => ensureArray(c.skills)))].sort()

  const filtered = useMemo(() => candidates.filter(c => {
    const q = search.toLowerCase()
    if (q && !`${c.first_name} ${c.last_name} ${c.job_title} ${c.job_id} ${c.client} ${c.location} ${c.recruiter_name} ${ensureArray(c.skills).join(' ')}`.toLowerCase().includes(q)) return false
    if (filters.job.length && !filters.job.includes(c.job_id)) return false
    if (filters.recruiter.length && !filters.recruiter.includes(c.recruiter_name)) return false
    if (filters.client.length && !filters.client.includes(c.client)) return false
    if (filters.priority.length && !filters.priority.includes(c.priority)) return false
    if (filters.status.length && !filters.status.includes(c.internal_status)) return false
    if (filters.location.length && !filters.location.includes(c.location)) return false
    if (filters.skills.length && !filters.skills.some(s => ensureArray(c.skills).includes(s))) return false
    if (filters.submittedAfter && (!c.submission_date || c.submission_date < filters.submittedAfter)) return false
    if (filters.interviewToday && !isToday(c.interview_date)) return false
    if (filters.urgentOnly && TERMINAL_STAGES.includes(c.external_status)) return false
    if (filters.stageFilter && c.external_status !== filters.stageFilter) return false
    if (filters.overdueFollowup && !getSignals(c).overdueFollowup) return false
    return true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [candidates, search, filters, callbacksByName, followupsByName])

  const hasFilters = Boolean(search) || Object.values(filters).some(v => Array.isArray(v) ? v.length > 0 : Boolean(v))
  useAISetContext({ workspace: 'Pipeline', totalCandidates: candidates.length, shownCandidates: filtered.length, activeFilters: hasFilters ? filters : null })
  const clearFilters = () => { setSearch(''); setFilters(initialFilters) }

  const filterDefs = [
    { key: 'job', label: 'Job', type: 'multiselect', options: jobOptions },
    { key: 'recruiter', label: 'Recruiter', type: 'multiselect', options: recruiterOptions },
    { key: 'client', label: 'Client', type: 'multiselect', options: clientOptions },
    { key: 'priority', label: 'Priority', type: 'multiselect', options: ['High', 'Medium', 'Low'] },
    { key: 'status', label: 'Status', type: 'multiselect', options: INTERNAL_STATUSES },
    { key: 'location', label: 'Location', type: 'multiselect', options: locationOptions },
    { key: 'skills', label: 'Skills', type: 'multiselect', options: skillOptions },
    { key: 'submittedAfter', label: 'Submitted After', type: 'date' },
  ]
  const filterPresets = [
    ...(profile?.full_name ? [{ label: 'My Pipeline', values: { recruiter: [profile.full_name] } }] : []),
    { label: "Today's Interviews", values: { interviewToday: true } },
    { label: 'Urgent Candidates', values: { priority: ['High'], urgentOnly: true } },
    { label: 'Offers Pending', values: { stageFilter: 'Offer Extended' } },
    { label: 'Overdue Follow-up', values: { overdueFollowup: true } },
    { label: 'High Priority', values: { priority: ['High'] } },
  ]

  // KPIs — every number derived from the same `filtered` set the board renders,
  // so the header and the columns can never disagree.
  const kpis = useMemo(() => {
    const total = filtered.length
    const qualified = filtered.filter(c => QUALIFIED_STAGES.includes(c.external_status)).length
    const pipelineHealthPct = total ? Math.round((qualified / total) * 100) : 0
    const updatedToday = filtered.filter(c => isToday(c.updated_at)).length
    const inProcess = filtered.filter(c => !TERMINAL_STAGES.includes(c.external_status)).length
    const interviewsToday = filtered.filter(c => isToday(c.interview_date)).length
    const offersPending = filtered.filter(c => c.external_status === 'Offer Extended').length
    const placements = filtered.filter(c => c.external_status === 'Hired').length
    const activeDays = filtered.filter(c => !TERMINAL_STAGES.includes(c.external_status)).map(c => daysAgo(c.submission_date)).filter(d => d !== null)
    const avgDays = activeDays.length ? Math.round(activeDays.reduce((a, b) => a + b, 0) / activeDays.length) : 0
    return { pipelineHealthPct, updatedToday, inProcess, interviewsToday, offersPending, placements, avgDays }
  }, [filtered])

  // Per-stage analytics for column headers
  const stageStats = useMemo(() => {
    const total = filtered.length
    const map = {}
    STAGES.forEach(stage => {
      const cards = filtered.filter(c => c.external_status === stage.id)
      const days = cards.map(c => daysAgo(c.submission_date)).filter(d => d !== null)
      const avgDays = days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : 0
      const agingCount = days.filter(d => d > 7).length
      const agingRatio = cards.length ? agingCount / cards.length : 0
      const health = agingRatio > 0.5 ? 'red' : agingRatio > 0.2 ? 'yellow' : 'green'
      map[stage.id] = { cards, count: cards.length, avgDays, conversionPct: total ? Math.round((cards.length / total) * 100) : 0, agingCount, health }
    })
    return map
  }, [filtered])

  // Pipeline Insights — real derived callouts only, never fabricated AI.
  const insights = useMemo(() => {
    const list = []
    const aging = filtered.filter(c => !TERMINAL_STAGES.includes(c.external_status) && (daysAgo(c.submission_date) || 0) > 7)
    if (aging.length) list.push({ id: 'aging', tone: 'yellow', icon: 'clock', text: `${aging.length} candidate${aging.length === 1 ? '' : 's'} aging over 7 days in pipeline`, candidateIds: aging.map(c => c.id) })

    const weakJobs = jobs.filter(j => (j.status || 'Open') === 'Open' && computeJobHealth(j, candidates).submittals < 3)
    if (weakJobs.length) list.push({ id: 'weakJobs', tone: 'yellow', icon: 'jobs', text: `${weakJobs.length} open job${weakJobs.length === 1 ? '' : 's'} with under 3 submittals`, jobIds: weakJobs.map(j => j.job_id).filter(Boolean) })

    const recruiterCounts = {}
    filtered.filter(c => !TERMINAL_STAGES.includes(c.external_status)).forEach(c => {
      if (!c.recruiter_name) return
      recruiterCounts[c.recruiter_name] = (recruiterCounts[c.recruiter_name] || 0) + 1
    })
    const overloaded = Object.entries(recruiterCounts).filter(([, n]) => n >= 8).sort((a, b) => b[1] - a[1])
    if (overloaded.length) list.push({ id: 'overloaded', tone: 'accent', icon: 'users', text: `${overloaded[0][0]} is carrying ${overloaded[0][1]} active candidates`, recruiter: overloaded[0][0] })

    const inactive = filtered.filter(c => !TERMINAL_STAGES.includes(c.external_status) && (daysAgo(c.updated_at) || 0) > 14)
    if (inactive.length) list.push({ id: 'inactive', tone: 'red', icon: 'alertCircle', text: `${inactive.length} candidate${inactive.length === 1 ? '' : 's'} with no activity in 14+ days`, candidateIds: inactive.map(c => c.id) })

    const upcomingInterviews = filtered.filter(c => c.interview_date && c.interview_date >= todayStr())
    if (upcomingInterviews.length) list.push({ id: 'interviews', tone: 'ai', icon: 'calendar', text: `${upcomingInterviews.length} upcoming interview${upcomingInterviews.length === 1 ? '' : 's'} scheduled`, candidateIds: upcomingInterviews.map(c => c.id) })

    const offersAwaiting = filtered.filter(c => c.external_status === 'Offer Extended')
    if (offersAwaiting.length) list.push({ id: 'offers', tone: 'green', icon: 'reports', text: `${offersAwaiting.length} offer${offersAwaiting.length === 1 ? '' : 's'} awaiting response`, candidateIds: offersAwaiting.map(c => c.id) })

    const recentlyMoved = filtered.filter(c => isToday(c.updated_at))
    if (recentlyMoved.length) list.push({ id: 'moved', tone: 'neutral', icon: 'trendUp', text: `${recentlyMoved.length} candidate${recentlyMoved.length === 1 ? '' : 's'} updated today`, candidateIds: recentlyMoved.map(c => c.id) })

    return list
  }, [filtered, jobs, candidates])

  const handleInsightClick = (insight) => {
    if (insight.jobIds) { setFilters(f => ({ ...f, job: insight.jobIds })); return }
    if (insight.recruiter) { setFilters(f => ({ ...f, recruiter: [insight.recruiter] })); return }
    if (insight.candidateIds) {
      setSpotlightIds(insight.candidateIds)
      setTimeout(() => setSpotlightIds([]), 2500)
    }
  }

  // Real per-candidate timeline for the preview drawer (same cross-reference
  // technique as Candidates.jsx / Jobs.jsx).
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

  const openDrawer = (c) => { setShowDetail(c); setPreviewTab('overview') }

  const openQuickCallback = (c) => { setQuickCallback(c); setCbForm({ date: todayStr(), time: '', notes: '' }) }
  const saveQuickCallback = async () => {
    if (!quickCallback) return
    setSavingQuick(true)
    const { data, error } = await db.from('callbacks').insert([{
      candidate_name: `${quickCallback.first_name} ${quickCallback.last_name}`.trim(),
      phone: quickCallback.phone || '',
      job: quickCallback.job_title || quickCallback.job_id || '',
      date: cbForm.date || null,
      time: cbForm.time || null,
      notes: cbForm.notes || '',
      status: 'Pending',
      user_id: user?.id,
      org_id: profile?.org_id,
    }]).select()
    setSavingQuick(false)
    if (error) return showToast(error.message, 'error')
    const created = Array.isArray(data) ? data[0] : data
    if (created) setCallbacksLog(prev => [created, ...prev])
    showToast('Callback scheduled!')
    setQuickCallback(null)
  }

  const openQuickFollowup = (c) => { setQuickFollowup(c); setFuForm({ date: todayStr(), type: 'Call', notes: '' }) }
  const saveQuickFollowup = async () => {
    if (!quickFollowup) return
    setSavingQuick(true)
    const { data, error } = await db.from('followups').insert([{
      candidate_name: `${quickFollowup.first_name} ${quickFollowup.last_name}`.trim(),
      date: fuForm.date || null,
      type: fuForm.type,
      status: 'Pending',
      priority: quickFollowup.priority || 'Medium',
      notes: fuForm.notes || '',
      user_id: user?.id,
      org_id: profile?.org_id,
    }]).select()
    setSavingQuick(false)
    if (error) return showToast(error.message, 'error')
    const created = Array.isArray(data) ? data[0] : data
    if (created) setFollowupsLog(prev => [created, ...prev])
    showToast('Follow-up added!')
    setQuickFollowup(null)
  }

  const openAssignRecruiter = (c) => { setAssignRecruiterFor(c); setRecruiterInput(c.recruiter_name || '') }
  const saveAssignRecruiter = async () => {
    if (!assignRecruiterFor) return
    await updateCandidate(assignRecruiterFor.id, { recruiter_name: recruiterInput.trim() })
    showToast('Recruiter assigned!')
    setAssignRecruiterFor(null)
  }

  const emailCandidate = (c) => { if (c.email) window.location.href = `mailto:${c.email}`; else showToast('No email on file', 'error') }
  const callCandidate = (c) => { if (c.phone) window.location.href = `tel:${c.phone}`; else showToast('No phone on file', 'error') }

  // Quick actions: identical item list drives the card kebab Menu and the
  // right-click context menu, so both surfaces stay in sync.
  const actionsFor = (c) => {
    const otherStages = STAGES.filter(s => s.id !== c.external_status)
    return [
      { label: 'Open Details', icon: 'eye', onClick: () => openDrawer(c) },
      'divider',
      ...otherStages.map(s => ({ label: `Move to ${s.label}`, icon: 'move', onClick: () => moveCandidate(c.id, s.id) })),
      'divider',
      { label: 'Schedule Callback', icon: 'callbacks', onClick: () => openQuickCallback(c) },
      { label: 'Add Follow-up', icon: 'followups', onClick: () => openQuickFollowup(c) },
      { label: 'Assign Recruiter', icon: 'users', onClick: () => openAssignRecruiter(c) },
      'divider',
      { label: 'Email', icon: 'mail', onClick: () => emailCandidate(c) },
      { label: 'Call', icon: 'callbacks', onClick: () => callCandidate(c) },
    ]
  }

  // Right-click context menu (mirrors Table's implementation for a consistent feel)
  const [contextMenu, setContextMenu] = useState(null)
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    document.addEventListener('mousedown', close)
    document.addEventListener('scroll', close, true)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('scroll', close, true) }
  }, [contextMenu])
  const openContextMenu = (e, c) => { e.preventDefault(); setContextMenu({ card: c, x: e.clientX, y: e.clientY }) }

  // 2D keyboard navigation across stage columns (ArrowLeft/Right) and cards
  // within a column (ArrowUp/Down); Enter opens the drawer.
  const [focus, setFocus] = useState({ stageIdx: 0, cardIdx: -1 })
  const handleBoardKeyDown = (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter'].includes(e.key)) return
    e.preventDefault()
    setFocus(prev => {
      const stage = STAGES[prev.stageIdx]
      const stageCards = stageStats[stage.id]?.cards || []
      if (e.key === 'ArrowLeft') return { stageIdx: Math.max(0, prev.stageIdx - 1), cardIdx: 0 }
      if (e.key === 'ArrowRight') return { stageIdx: Math.min(STAGES.length - 1, prev.stageIdx + 1), cardIdx: 0 }
      if (e.key === 'ArrowDown') return { ...prev, cardIdx: Math.min(stageCards.length - 1, prev.cardIdx + 1) }
      if (e.key === 'ArrowUp') return { ...prev, cardIdx: Math.max(0, prev.cardIdx - 1) }
      if (e.key === 'Enter' && stageCards[prev.cardIdx]) openDrawer(stageCards[prev.cardIdx])
      return prev
    })
  }

  return (
    <div className="w-full mx-auto flex-1 flex flex-col min-h-full" style={{ maxWidth: 'var(--container-max)' }}>
      <div className="pipeline-header-shell shrink-0 px-4 sm:px-6 lg:px-8 mb-2">
        <PageHeader
          eyebrow={compactHeader ? undefined : "Recruiting Workspace"}
          title="Pipeline"
          subtitle={compactHeader ? undefined : "Drag candidates across stages to update their client-facing status. Internal status stays unchanged."}
          className="pipeline-page-header"
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                leftIcon={compactHeader ? 'eye' : 'eyeOff'}
                onClick={toggleCompactHeader}
              >
                {compactHeader ? 'Expand View' : 'Compact View'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={hideKpis ? 'eye' : 'eyeOff'}
                onClick={toggleKpis}
              >
                {hideKpis ? 'Show Metrics' : 'Hide Metrics'}
              </Button>
            </div>
          }
          search={<WorkspaceSearch value={search} onChange={setSearch} storageKey="td_pipeline" placeholder="Name, job, client, skill..." />}
          filters={
            <FilterWorkspace
              className="pipeline-filter-workspace"
              filters={filterDefs}
              values={filters}
              onChange={(key, value) => setFilters(f => ({ ...f, [key]: value }))}
              onReset={clearFilters}
              presets={filterPresets}
              storageKey="pipeline"
            />
          }
        />

        {!compactHeader && !hideKpis && (
          <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2 my-2">
            <KPICard label="Pipeline Health" value={`${kpis.pipelineHealthPct}%`} helper="qualified of shown" tone={kpis.pipelineHealthPct >= 70 ? 'green' : kpis.pipelineHealthPct >= 40 ? 'yellow' : 'red'} icon="checkCircle" compact />
            <KPICard label="Updated Today" value={kpis.updatedToday} helper="candidate records" tone="accent" icon="trendUp" compact />
            <KPICard label="In Process" value={kpis.inProcess} helper="active, non-terminal" tone="ai" icon="pipeline" compact />
            <KPICard label="Interviews Today" value={kpis.interviewsToday} helper="scheduled" tone="accent" icon="calendar" compact />
            <KPICard label="Offers Pending" value={kpis.offersPending} helper="awaiting response" tone="yellow" icon="reports" compact />
            <KPICard label="Placements" value={kpis.placements} helper="hired" tone="green" icon="checkCircle" compact />
            <KPICard label="Avg. Days in Pipeline" value={kpis.avgDays} helper="active candidates" tone="orange" icon="clock" compact />
          </div>
        )}

        {!compactHeader && insights.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto overflow-y-hidden pb-1 pt-1">
            {insights.map(insight => (
              <button
                key={insight.id}
                type="button"
                onClick={() => handleInsightClick(insight)}
                className={cn(
                  'inline-flex items-center gap-1.5 h-6 pl-2 pr-2.5 rounded-full text-[11px] font-semibold border transition-colors duration-[var(--duration-fast)] shrink-0 whitespace-nowrap',
                  insight.tone === 'red' ? 'bg-red/10 text-red border-red/25 hover:bg-red/15' :
                    insight.tone === 'yellow' ? 'bg-yellow/10 text-yellow border-yellow/25 hover:bg-yellow/15' :
                      insight.tone === 'green' ? 'bg-green/10 text-green border-green/25 hover:bg-green/15' :
                        insight.tone === 'ai' ? 'bg-ai-soft text-ai border-ai/25 hover:brightness-110' :
                          insight.tone === 'accent' ? 'bg-accent/10 text-accent border-accent/25 hover:bg-accent/15' :
                            'bg-surface2 text-text2 border-border hover:bg-surface3'
                )}
              >
                <Icon name={insight.icon} size={11} />
                {insight.text}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Board */}
      <div className="relative flex-1 min-h-0 flex flex-col">
        {!loading && filtered.length > 0 && (
          <>
            <button
              type="button"
              aria-label="Scroll stages left"
              onClick={() => scrollBoardBy(-1)}
              className="hidden lg:flex absolute left-5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full items-center justify-center bg-surface border border-border shadow-md text-text2 hover:text-text hover:border-border-strong"
            >
              <Icon name="chevronLeft" size={15} />
            </button>
            <button
              type="button"
              aria-label="Scroll stages right"
              onClick={() => scrollBoardBy(1)}
              className="hidden lg:flex absolute right-1 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full items-center justify-center bg-surface border border-border shadow-md text-text2 hover:text-text hover:border-border-strong"
            >
              <Icon name="chevronRight" size={15} />
            </button>
          </>
        )}
        <div
          ref={boardRef}
          onDragOver={handleBoardDragOver}
          onWheel={handleBoardWheel}
          onKeyDown={handleBoardKeyDown}
          tabIndex={0}
          className={cn(
            "pipeline-board-scroll flex-1 overflow-x-auto overflow-y-hidden snap-x snap-proximity scroll-smooth pl-7 pr-4 sm:pl-9 sm:pr-6 lg:pl-12 lg:pr-8 pb-4 outline-none flex flex-col transition-all duration-300",
            compactHeader ? "min-h-[calc(100vh-140px)]" : "min-h-[calc(100vh-90px)]"
          )}
        >
          {loading ? (
            <div className="flex items-center justify-center h-full text-text3 text-sm">Loading pipeline...</div>
          ) : filtered.length === 0 ? (
            <EmptyState icon="pipeline" title={hasFilters ? 'No candidates match your filters' : 'No candidates yet'} description={hasFilters ? 'Try widening your search or clearing filters.' : 'Candidates you submit will appear here.'} />
          ) : (
            <div className="flex gap-5 h-full min-h-[680px] min-w-max pr-4 sm:pr-6 lg:pr-8">
              {STAGES.map((stage, stageIdx) => {
                const stats = stageStats[stage.id]
                const isOver = overStage === stage.id
                const isCollapsed = collapsed.includes(stage.id)

                if (isCollapsed) {
                  return (
                    <button
                      key={stage.id}
                      ref={(node) => {
                        if (node) stageRefs.current.set(stage.id, node)
                        else stageRefs.current.delete(stage.id)
                      }}
                      type="button"
                      onClick={() => toggleCollapsed(stage.id)}
                      onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setOverStage(stage.id) }}
                      onDragLeave={() => setOverStage(null)}
                      onDrop={event => handleDrop(event, stage.id)}
                      className="relative w-14 shrink-0 snap-start h-full flex flex-col items-center rounded-[var(--radius-lg)] border shadow-xs transition-colors duration-[var(--duration-fast)] overflow-hidden"
                      style={{ background: isOver ? `${stage.color}14` : 'var(--surface)', borderColor: isOver ? stage.color : 'var(--border)' }}
                    >
                      <span aria-hidden="true" className="pointer-events-none absolute top-0 left-0 right-0 h-[3px]" style={{ background: stage.color }} />
                      <div className="flex flex-col items-center gap-3 pt-4 shrink-0">
                        <Icon name="chevronRight" size={13} className="text-text3" />
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: stage.color }} />
                      </div>
                      <div className="relative flex-1 w-full min-h-0">
                        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap text-[11px] font-bold text-text2 tracking-wide">
                          {stage.label}
                        </span>
                      </div>
                      <span className="mb-4 shrink-0 text-[10px] font-bold text-text3 font-mono px-1 py-0.5 rounded bg-surface2 border border-border/60">{stats.count}</span>
                    </button>
                  )
                }

                return (
                  <div
                    key={stage.id}
                    ref={(node) => {
                      if (node) stageRefs.current.set(stage.id, node)
                      else stageRefs.current.delete(stage.id)
                    }}
                    onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setOverStage(stage.id) }}
                    onDragLeave={() => setOverStage(null)}
                    onDrop={event => handleDrop(event, stage.id)}
                    className="relative w-[88vw] sm:w-[45vw] lg:w-[358px] shrink-0 snap-start flex flex-col h-full min-h-0 rounded-[var(--radius-lg)] border shadow-xs overflow-hidden transition-[box-shadow,border-color,background-color] duration-[var(--duration-fast)]"
                    style={{ background: isOver ? `${stage.color}10` : 'var(--surface)', borderColor: isOver ? stage.color : 'var(--border)' }}
                  >
                    <span aria-hidden="true" className="pointer-events-none absolute top-0 left-0 right-0 h-[3px] z-10" style={{ background: stage.color }} />

                    {/* Column header — not sticky: only the card list below scrolls,
                      so sticky headers collide with the page-level scroll. */}
                    <div
                      className="relative z-10 px-3.5 py-2.5 border-b shrink-0"
                      style={{ background: `color-mix(in srgb, ${stage.color} 9%, var(--surface2))`, borderColor: `${stage.color}30` }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: stage.color }} />
                        <span className="text-[13.5px] font-bold text-text tracking-tight flex-1 truncate">{stage.label}</span>
                        <Tooltip3 health={stats.health} />
                        <span className="text-[11px] font-extrabold font-mono px-1.5 py-0.5 rounded-full" style={{ background: `${stage.color}1a`, color: stage.color, boxShadow: `inset 0 0 0 1px ${stage.color}38` }}>{stats.count}</span>
                        <button type="button" onClick={() => toggleCollapsed(stage.id)} aria-label={`Collapse ${stage.label}`} className="text-text3 hover:text-text p-0.5 shrink-0 transition-colors duration-[var(--duration-fast)]">
                          <Icon name="chevronLeft" size={13} />
                        </button>
                      </div>
                      <div className="flex items-center gap-2.5 mt-1.5 text-[10.5px] text-text3 font-semibold">
                        <span>{stats.conversionPct}% of pipeline</span>
                        <span className="text-border-strong">·</span>
                        <span>{stats.avgDays}d avg</span>
                        {stats.agingCount > 0 && <><span className="text-border-strong">·</span><span className="text-yellow">{stats.agingCount} aging</span></>}
                      </div>
                    </div>

                    {/* Cards */}
                    <div
                      data-pipeline-card-list
                      className="flex-1 min-h-0 overflow-y-auto p-2.5 flex flex-col gap-2.5 bg-surface-sunken"
                    >
                      {stats.cards.length === 0 ? (
                        <div
                          className="flex flex-col items-center gap-2 text-center py-9 px-2.5 rounded-[var(--radius-md)] text-xs text-text3 border border-dashed transition-colors duration-[var(--duration-fast)]"
                          style={{ borderColor: isOver ? stage.color : 'var(--border)' }}
                        >
                          <span
                            className="w-8 h-8 rounded-full flex items-center justify-center"
                            style={{ background: `${stage.color}14`, color: stage.color }}
                          >
                            <Icon name="pipeline" size={14} />
                          </span>
                          Drop candidate here
                        </div>
                      ) : stats.cards.map((c, cardIdx) => {
                        const sc = computeScore(c)
                        const signals = getSignals(c)
                        const isFocused = focus.stageIdx === stageIdx && focus.cardIdx === cardIdx
                        const isSpotlit = spotlightIds.includes(c.id)
                        const skills = ensureArray(c.skills).slice(0, 3)
                        return (
                          <div
                            key={c.id}
                            draggable
                            tabIndex={-1}
                            onDragStart={event => handleDragStart(event, c.id)}
                            onDragEnd={() => { setDraggingId(null); setOverStage(null) }}
                            onClick={() => openDrawer(c)}
                            onContextMenu={(e) => openContextMenu(e, c)}
                            onKeyDown={(e) => { if (e.key === 'Enter') openDrawer(c) }}
                            className={cn(
                              'group relative border rounded-[var(--radius-md)] shadow-xs p-3.5 cursor-grab active:cursor-grabbing transition-all duration-[var(--duration-fast)] hover:-translate-y-0.5 hover:border-[var(--stage-color)] hover:shadow-[0_10px_24px_-12px_var(--stage-glow)] bg-surface',
                              draggingId === c.id ? 'opacity-40 scale-[0.98]' : 'opacity-100',
                              isFocused && 'ring-2 ring-accent',
                              isSpotlit && 'ring-2 ring-yellow animate-pulse'
                            )}
                            style={{
                              borderColor: `${stage.color}2a`,
                              '--stage-color': stage.color,
                              '--stage-glow': `${stage.color}55`,
                            }}
                          >
                            <span aria-hidden="true" className="absolute left-1.5 top-3 bottom-3 w-[3px] rounded-full" style={{ background: stage.color, opacity: 0.85 }} />
                            <div className="flex items-start gap-2.5">
                              <Avatar name={`${c.first_name || ''} ${c.last_name || ''}`.trim() || '?'} size="sm" />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-1.5">
                                  <strong className="text-[13px] font-bold text-text truncate">{c.first_name} {c.last_name}</strong>
                                  <Menu
                                    align="end"
                                    trigger={(p) => (
                                      <span onClick={(e) => e.stopPropagation()}>
                                        <MenuTrigger {...p} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 w-6 h-6" />
                                      </span>
                                    )}
                                    items={actionsFor(c)}
                                  />
                                </div>
                                <div className="text-[11px] text-text3 truncate">{c.job_title || 'No job title'}</div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 flex-wrap mt-2">
                              <Badge size="sm" tone={c.priority === 'High' ? 'red' : c.priority === 'Low' ? 'neutral' : 'yellow'}>{c.priority || 'Medium'}</Badge>
                              <Badge size="sm" tone={sc.total >= 80 ? 'green' : sc.total >= 60 ? 'accent' : sc.total >= 40 ? 'yellow' : 'red'}>{sc.gradeLabel}</Badge>
                              {c.recruiter_name && <span className="text-[10px] text-text3 truncate max-w-[110px]">{c.recruiter_name}</span>}
                            </div>

                            {skills.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {skills.map(s => <span key={s} className="text-[10px] font-medium text-text2 bg-surface3 rounded-full px-1.5 py-0.5">{s}</span>)}
                              </div>
                            )}

                            <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-border/70">
                              <div className="flex items-center gap-2 text-text3">
                                {c.rate && <span className="text-[10px] font-mono">{c.rate}</span>}
                                {c.location && <span className="text-[10px] truncate max-w-[90px]">{c.location}</span>}
                              </div>
                              <span className="text-[10px] text-text3">{relativeTime(c.updated_at)}</span>
                            </div>

                            <div className="flex items-center gap-2 mt-1.5">
                              {signals.hasCollision && <Icon name="alertCircle" size={11} className="text-red" aria-label="Possible duplicate submission" />}
                              {signals.hasNotes && <Icon name="edit" size={11} className="text-text3" aria-label="Has notes" />}
                              {signals.upcomingCallback && <Icon name="callbacks" size={11} className="text-accent" aria-label="Upcoming callback" />}
                              {c.interview_date && <Icon name="calendar" size={11} className="text-ai" aria-label="Interview scheduled" />}
                              {c.external_status === 'Offer Extended' && <Icon name="reports" size={11} className="text-yellow" aria-label="Offer extended" />}
                              {isToday(c.updated_at) && <Badge size="sm" tone="accent" className="ml-auto">New activity</Badge>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="fixed min-w-[190px] max-h-[min(70vh,360px)] overflow-y-auto bg-surface border border-border rounded-[var(--radius-md)] shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset,var(--shadow-lg)] p-1.5 flex flex-col gap-0.5"
          style={{ top: contextMenu.y, left: contextMenu.x, zIndex: 'var(--z-dropdown)' }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {actionsFor(contextMenu.card).map((item, i) => item === 'divider' ? (
            <div key={i} className="h-px bg-border my-1" />
          ) : (
            <button
              key={item.label}
              type="button"
              onClick={() => { item.onClick?.(); setContextMenu(null) }}
              className={cn('flex items-center gap-2 px-2.5 py-2 rounded-[var(--radius-sm)] text-sm font-medium text-left transition-colors duration-[var(--duration-fast)]', item.danger ? 'text-red hover:bg-red/10' : 'text-text hover:bg-surface2')}
            >
              {item.icon && <Icon name={item.icon} size={13} />}
              {item.label}
            </button>
          ))}
        </div>
      )}

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
            eyebrow="Pipeline Candidate"
            title={`${showDetail.first_name} ${showDetail.last_name}`}
            subtitle={<>{showDetail.job_title} · <span className="text-accent font-mono">{showDetail.job_id}</span></>}
            status={<StatusPill status={showDetail.external_status} tone={STATUS_TONE[showDetail.external_status] || 'neutral'} size="sm" />}
            size="lg"
            tabs={[{ id: 'overview', label: 'Overview' }, { id: 'timeline', label: 'Timeline', count: candidateTimeline.length }, { id: 'notes', label: 'Notes' }, ...(aiEnabled ? [{ id: 'ai', label: 'AI' }] : [])]}
            activeTab={previewTab}
            onTabChange={setPreviewTab}
            actions={
              <>
                <Menu
                  align="start"
                  trigger={({ toggle }) => <Button variant="secondary" leftIcon="move" onClick={toggle}>Move Stage</Button>}
                  items={STAGES.filter(s => s.id !== showDetail.external_status).map(s => ({ label: s.label, onClick: () => moveCandidate(showDetail.id, s.id) }))}
                />
                <Button variant="secondary" leftIcon="callbacks" onClick={() => openQuickCallback(showDetail)}>Callback</Button>
                <Button variant="secondary" leftIcon="mail" onClick={() => emailCandidate(showDetail)}>Email</Button>
              </>
            }
          >
            {previewTab === 'overview' && (
              <div className="flex flex-col gap-4">
                <Card className="bg-surface2 border-border">
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
                    <div className="flex flex-wrap gap-1.5 flex-1 min-w-[220px]">
                      {sc.insights.slice(0, 8).map((insight, i) => (
                        <Badge key={i} size="sm" tone={insight.type === 'good' ? 'green' : insight.type === 'bad' ? 'red' : 'yellow'}>{insight.text}</Badge>
                      ))}
                    </div>
                  </div>
                </Card>

                <div className="grid sm:grid-cols-2 gap-3">
                  <DetailCard title="Pipeline Stage" rows={[['External Status', showDetail.external_status], ['Internal Status', showDetail.internal_status], ['Priority', showDetail.priority], ['Days in Pipeline', daysAgo(showDetail.submission_date)], ['Last Activity', relativeTime(showDetail.updated_at)]]} />
                  <DetailCard title="Submission" rows={[['Date', showDetail.submission_date], ['Job ID', showDetail.job_id], ['Client', showDetail.client], ['Rate', showDetail.rate], ['Location', showDetail.location]]} />
                  <DetailCard title="Interview" rows={[['Date', showDetail.interview_date], ['Type', showDetail.interview_type], ['Feedback', showDetail.feedback_status]]} />
                  <DetailCard title="Ownership" rows={[['Recruiter', showDetail.recruiter_name], ['FE Name', showDetail.fe_name], ['Account Manager', showDetail.account_manager]]} />
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
                ) : candidateTimeline.map(ev => (
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
                ))}
              </div>
            )}

            {previewTab === 'notes' && (
              <div className="flex flex-col gap-4">
                <Card>
                  <CardHeader title="Notes" />
                  <p className="text-sm text-text2 leading-relaxed">{showDetail.notes || 'No notes yet.'}</p>
                  {showDetail.followup_date && <p className="text-xs text-text3 mt-2">Follow-up date: <b className="text-text2">{showDetail.followup_date}</b></p>}
                </Card>
                {showDetail.resume_text && (
                  <Card>
                    <CardHeader title="Resume Text" />
                    <div className="text-xs text-text2 leading-relaxed max-h-60 overflow-y-auto"><MarkdownView content={showDetail.resume_text} /></div>
                  </Card>
                )}
              </div>
            )}

            {previewTab === 'ai' && aiEnabled && (() => {
              const detailSignals = getSignals(showDetail)
              const situationText = [
                `Candidate: ${showDetail.first_name} ${showDetail.last_name}`,
                `Current Stage: ${showDetail.external_status}`,
                `Internal Status: ${showDetail.internal_status}`,
                `Priority: ${showDetail.priority || 'Medium'}`,
                `Days in Pipeline: ${daysAgo(showDetail.submission_date)}`,
                `Last Activity: ${relativeTime(showDetail.updated_at)}`,
                `Has Upcoming Callback: ${detailSignals.upcomingCallback ? 'Yes' : 'No'}`,
                `Overdue Follow-up: ${detailSignals.overdueFollowup ? 'Yes' : 'No'}`,
                `Interview Date: ${showDetail.interview_date || 'None scheduled'}`,
                `Health Score: ${sc.total}/100 (${sc.gradeLabel})`,
                showDetail.notes ? `Recruiter Notes: ${showDetail.notes}` : null,
              ].filter(Boolean).join('\n')

              return (
                <div className="flex flex-col gap-3">
                  <AIInsightCard
                    orgId={orgId} userId={userId} source="pipeline"
                    title="Next Best Action" icon="trendUp" actionId="recommend" cta="Suggest next action"
                    content={situationText}
                    context="Based only on this candidate's real pipeline data above, recommend the single most impactful next action the recruiter should take today, plus 1-2 alternatives if relevant. Be specific and brief."
                  />
                </div>
              )
            })()}
          </EntityDrawer>
        )
      })()}

      {/* Quick-create: Schedule Callback */}
      <Modal
        open={!!quickCallback}
        onClose={() => setQuickCallback(null)}
        size="sm"
        title={quickCallback ? `Schedule Callback — ${quickCallback.first_name} ${quickCallback.last_name}` : 'Schedule Callback'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setQuickCallback(null)}>Cancel</Button>
            <Button variant="primary" loading={savingQuick} onClick={saveQuickCallback}>Schedule</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Date"><Input type="date" value={cbForm.date} onChange={e => setCbForm(f => ({ ...f, date: e.target.value }))} /></FormField>
            <FormField label="Time"><TimePicker value={cbForm.time} onChange={v => setCbForm(f => ({ ...f, time: v }))} /></FormField>
          </div>
          <FormField label="Notes"><Textarea rows={3} value={cbForm.notes} onChange={e => setCbForm(f => ({ ...f, notes: e.target.value }))} placeholder="What to discuss..." /></FormField>
        </div>
      </Modal>

      {/* Quick-create: Add Follow-up */}
      <Modal
        open={!!quickFollowup}
        onClose={() => setQuickFollowup(null)}
        size="sm"
        title={quickFollowup ? `Add Follow-up — ${quickFollowup.first_name} ${quickFollowup.last_name}` : 'Add Follow-up'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setQuickFollowup(null)}>Cancel</Button>
            <Button variant="primary" loading={savingQuick} onClick={saveQuickFollowup}>Add Follow-up</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Date"><Input type="date" value={fuForm.date} onChange={e => setFuForm(f => ({ ...f, date: e.target.value }))} /></FormField>
            <FormField label="Type"><Select value={fuForm.type} onChange={v => setFuForm(f => ({ ...f, type: v }))} options={FOLLOWUP_TYPES.map(t => ({ value: t, label: t }))} /></FormField>
          </div>
          <FormField label="Notes"><Textarea rows={3} value={fuForm.notes} onChange={e => setFuForm(f => ({ ...f, notes: e.target.value }))} placeholder="Follow-up details..." /></FormField>
        </div>
      </Modal>

      {/* Assign recruiter */}
      <Modal
        open={!!assignRecruiterFor}
        onClose={() => setAssignRecruiterFor(null)}
        size="sm"
        title={assignRecruiterFor ? `Assign Recruiter — ${assignRecruiterFor.first_name} ${assignRecruiterFor.last_name}` : 'Assign Recruiter'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAssignRecruiterFor(null)}>Cancel</Button>
            <Button variant="primary" onClick={saveAssignRecruiter}>Assign</Button>
          </>
        }
      >
        <FormField label="Recruiter">
          <Input list="pipeline-recruiter-options" value={recruiterInput} onChange={e => setRecruiterInput(e.target.value)} placeholder="Recruiter name..." />
          <datalist id="pipeline-recruiter-options">
            {recruiterOptions.map(r => <option key={r} value={r} />)}
          </datalist>
        </FormField>
      </Modal>

    </div>
  )
}

function Tooltip3({ health }) {
  const color = health === 'red' ? 'var(--red)' : health === 'yellow' ? 'var(--yellow)' : 'var(--green)'
  const label = health === 'red' ? 'Stage health: needs attention' : health === 'yellow' ? 'Stage health: watch' : 'Stage health: good'
  return (
    <Tooltip label={label}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
    </Tooltip>
  )
}

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
