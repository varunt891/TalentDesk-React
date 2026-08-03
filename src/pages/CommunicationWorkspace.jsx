import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useCandidates } from '../hooks/useCandidates'
import { db } from '../lib/api'
import SubmissionPacketModal from '../components/SubmissionPacketModal'
import AIMatchModal from '../components/AIMatchModal'
import { PageContainer } from '../components/layout/PageContainer'
import {
  Button, Badge, StatusPill, Card, CardHeader, KPICard, PageHeader, Modal, Input, Select, TimePicker,
  SearchableSelect, Textarea, FormField, Tabs, Icon, Avatar, Menu, MenuTrigger, EmptyState, CollapsibleSection, cn, useToast,
} from '../components/ui'
import { WorkspaceSearch, FilterWorkspace, EntityDrawer } from '../components/workspace'
import { Drawer } from '../components/ui/Modal'
import { ensureArray, STATUS_TONE as CANDIDATE_STATUS_TONE, computeScore } from '../lib/candidateHealth'
import { runAiAction } from '../lib/ai/aiClient'
import { logUsageEvent } from '../lib/ai/usage'
import { useAISetContext } from '../lib/ai/context'
import { useAIGovernance } from '../lib/ai/governance'

const INTERESTS = ['Hot', 'Warm', 'Cold']
const CB_STATUSES = ['pending', 'done', 'missed']
const CB_STATUS_TONE = { pending: 'accent', done: 'green', missed: 'red' }
const FU_TYPES = ['General Check-in', 'Interview Follow-up', 'Offer Follow-up', 'Document Collection', 'Other']
const FU_STATUSES = ['pending', 'contacted', 'waiting', 'done']
const FU_STATUS_TONE = { pending: 'neutral', contacted: 'accent', waiting: 'yellow', done: 'green' }
const PRIORITIES = ['High', 'Medium', 'Low']
const RESUBMIT_STATUSES = ['Rejected', 'Withdrew', 'On Hold']

const todayStr = () => new Date().toISOString().slice(0, 10)
function isToday(d) { return Boolean(d) && String(d).slice(0, 10) === todayStr() }

const TZ_MAP = {
  EST: 'America/New_York',
  EDT: 'America/New_York',
  ET: 'America/New_York',
  CST: 'America/Chicago',
  CDT: 'America/Chicago',
  CT: 'America/Chicago',
  MST: 'America/Denver',
  MDT: 'America/Denver',
  MT: 'America/Denver',
  PST: 'America/Los_Angeles',
  PDT: 'America/Los_Angeles',
  PT: 'America/Los_Angeles',
  IST: 'Asia/Kolkata',
  UTC: 'UTC',
  GMT: 'UTC',
}

function parseTime(timeStr) {
  if (!timeStr) return { hours: 9, minutes: 0 }
  const clean = String(timeStr).trim().toUpperCase()
  const isPM = clean.includes('PM')
  const isAM = clean.includes('AM')
  const match = clean.match(/(\d{1,2}):(\d{2})/)
  if (!match) return { hours: 9, minutes: 0 }
  let hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)
  if (isPM && hours < 12) hours += 12
  if (isAM && hours === 12) hours = 0
  return { hours, minutes }
}

function getTargetUtcTimestamp(dateStr, timeStr, tzAbbr) {
  if (!dateStr) return null
  const { hours, minutes } = parseTime(timeStr)
  const parts = dateStr.slice(0, 10).split('-').map(Number)
  if (parts.length !== 3 || parts.some(isNaN)) return null
  const [y, m, d] = parts

  const tzUpper = String(tzAbbr || 'EST').trim().toUpperCase()
  const ianaName = TZ_MAP[tzUpper] || 'America/New_York'

  try {
    const testUtc = new Date(Date.UTC(y, m - 1, d, hours, minutes, 0))
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: ianaName,
      timeZoneName: 'shortOffset',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
      hour12: false
    })
    
    const formattedParts = formatter.formatToParts(testUtc)
    const tzPart = formattedParts.find(p => p.type === 'timeZoneName')?.value || ''
    
    let offsetMinutes = -240
    const offsetMatch = tzPart.match(/(GMT|UTC)?([+-])(\d{1,2})(?::(\d{2}))?/)
    if (offsetMatch) {
      const sign = offsetMatch[2] === '-' ? -1 : 1
      const offsetHours = parseInt(offsetMatch[3], 10)
      const offsetMins = parseInt(offsetMatch[4] || '0', 10)
      offsetMinutes = sign * (offsetHours * 60 + offsetMins)
    }

    return Date.UTC(y, m - 1, d, hours, minutes, 0) - offsetMinutes * 60000
  } catch {
    let offsetMins = -240
    if (['PST', 'PDT', 'PT'].includes(tzUpper)) offsetMins = -420
    else if (['CST', 'CDT', 'CT'].includes(tzUpper)) offsetMins = -300
    else if (['MST', 'MDT', 'MT'].includes(tzUpper)) offsetMins = -360
    else if (tzUpper === 'IST') offsetMins = 330
    else if (['UTC', 'GMT'].includes(tzUpper)) offsetMins = 0

    return Date.UTC(y, m - 1, d, hours, minutes, 0) - offsetMins * 60000
  }
}

function getCallbackCountdown(dateStr, timeStr, tzStr, now = new Date()) {
  if (!dateStr) return null
  const targetUtcMs = getTargetUtcTimestamp(dateStr, timeStr, tzStr)
  if (!targetUtcMs) return null

  const diffMs = targetUtcMs - now.getTime()
  const isOverdue = diffMs < 0
  const absMs = Math.abs(diffMs)

  const totalMins = Math.floor(absMs / 60000)
  const days = Math.floor(totalMins / (60 * 24))
  const hrs = Math.floor((totalMins % (60 * 24)) / 60)
  const mins = totalMins % 60
  const secs = Math.floor((absMs % 60000) / 1000)

  let text = ''
  if (days > 0) {
    text = `${days}d ${hrs}h ${mins}m`
  } else if (hrs > 0) {
    text = `${hrs}h ${mins}m ${secs}s`
  } else if (mins > 0) {
    text = `${mins}m ${secs}s`
  } else {
    text = `${secs}s`
  }

  return {
    isOverdue,
    text: isOverdue ? `${text} overdue` : `${text} left`,
    raw: text,
    days,
    hrs,
    mins,
    secs,
    diffMs,
    urgent: !isOverdue && days === 0 && hrs < 2,
  }
}
function daysDiff(dateStr) {
  if (!dateStr) return null
  return Math.round((new Date(dateStr).getTime() - new Date(todayStr()).getTime()) / 86400000)
}
function relativeDate(dateStr) {
  const d = daysDiff(dateStr)
  if (d === null) return 'No date'
  if (d === 0) return 'Today'
  if (d === 1) return 'Tomorrow'
  if (d === -1) return 'Yesterday'
  if (d < 0) return `${Math.abs(d)}d overdue`
  if (d < 7) return `In ${d}d`
  return dateStr
}
function withinDays(dateTimeStr, n) {
  if (!dateTimeStr) return false
  const diff = (new Date().getTime() - new Date(dateTimeStr).getTime()) / 86400000
  return diff >= 0 && diff <= n
}
function matchCandidateIn(map, name) { return map.get((name || '').trim().toLowerCase()) || null }
function recruiterNameIn(map, userId) { const p = map.get(userId); return p ? (p.full_name || p.email) : null }

function readSession(key, fallback) {
  try {
    const v = sessionStorage.getItem(key)
    if (!v) return fallback
    const parsed = JSON.parse(v)
    return typeof parsed === 'object' && parsed !== null ? { ...fallback, ...parsed } : fallback
  } catch {
    return fallback
  }
}
function writeSession(key, value) {
  try { sessionStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore quota errors */ }
}

const initialFilters = {
  recruiter: [], candidate: [], job: [], client: [], priority: [], status: [], createdBy: [],
  dateFrom: '', dateTo: '', completed: false, overdue: false,
}
const initialResubmitFilters = { recruiter: [], client: [], skills: [] }
const emptyCbForm = { candidate_name: '', phone: '', job: '', date: todayStr(), time: '10:00', timezone: 'EST', interest: 'Warm', notes: '', status: 'pending' }
const emptyFuForm = { candidate_name: '', date: todayStr(), type: 'General Check-in', status: 'pending', priority: 'Medium', notes: '', next_action: '' }

export default function CommunicationWorkspace({ defaultView = 'callbacks', onNavigate }) {
  const { user, profile, organization } = useAuth()
  const orgId = organization?.id || profile?.org_id
  const userId = user?.id
  const { settings: aiSettings } = useAIGovernance(orgId)
  const aiEnabled = aiSettings.workspaces.communication !== false
  const { candidates } = useCandidates()
  const [activeView, setActiveView] = useState(defaultView)
  const [callbacks, setCallbacks] = useState([])
  const [followups, setFollowups] = useState([])
  const [jobs, setJobs] = useState([])
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchAll = () => {
    setLoading(true)
    Promise.all([
      db.from('callbacks').select('*').order('date', { ascending: true }),
      db.from('followups').select('*').order('date', { ascending: true }),
      db.from('jobs').select('*'),
      db.from('profiles').select('*'),
    ]).then(([cbRes, fuRes, jobsRes, profRes]) => {
      setCallbacks(cbRes.data || [])
      setFollowups(fuRes.data || [])
      setJobs(jobsRes.data || [])
      setProfiles(profRes.data || [])
    }).catch(err => console.error('[CommunicationWorkspace] load error', err))
      .finally(() => setLoading(false))
  }
  useEffect(() => { fetchAll() }, [])

  // Filters persist across the three sidebar entries (Callbacks/Follow-ups/
  // Re-submit Finder route to the same component but each is its own
  // top-level page, so React remounts on nav — sessionStorage is what makes
  // "preserve filters whenever possible" real without touching routing.
  const [search, setSearch] = useState(() => readSession('td_comm_search', ''))
  const [filters, setFilters] = useState(() => readSession('td_comm_filters', initialFilters))
  const [resubmitFilters, setResubmitFilters] = useState(() => readSession('td_comm_resubmit_filters', initialResubmitFilters))
  useEffect(() => writeSession('td_comm_search', search), [search])
  useEffect(() => writeSession('td_comm_filters', filters), [filters])
  useEffect(() => writeSession('td_comm_resubmit_filters', resubmitFilters), [resubmitFilters])

  const switchView = (view) => {
    setActiveView(view)
    setFilters(f => ({ ...f, priority: [], status: [] })) // vocab differs per view; universal filters (recruiter/job/client/date/createdBy) persist
  }

  const [showDetail, setShowDetail] = useState(null) // { item, kind }
  useAISetContext(showDetail ? { currentCandidate: showDetail.item?.candidate_name, communicationType: showDetail.kind } : null)
  useAISetContext({ workspace: 'Communication', activeView })
  const [showCandidateDetail, setShowCandidateDetail] = useState(null)
  const [candidatePreviewTab, setCandidatePreviewTab] = useState('overview')
  const { toast: pushToast } = useToast()
  // See Candidates.jsx for why this delegates to the shared toast instead of
  // a locally-rendered fixed div: a page-nested toast can get trapped behind
  // the floating Copilot launcher's stacking context; the shared one portals
  // straight to document.body and doesn't have that problem.
  const showToast = (msg, type = 'success') => pushToast({ tone: type === 'error' ? 'error' : 'success', title: msg })

  const [formKind, setFormKind] = useState('callback')
  const [cbForm, setCbForm] = useState(emptyCbForm)
  const [fuForm, setFuForm] = useState(emptyFuForm)
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)

  const [packetModal, setPacketModal] = useState({ isOpen: false, candidate: null, job: null })
  const [aiMatchModal, setAiMatchModal] = useState({ isOpen: false, candidate: null, job: null })

  const [activeAlert, setActiveAlert] = useState(null)
  const dismissedAlertsRef = useRef(new Set())

  const playAlertChime = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(587.33, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15)
      gain.gain.setValueAtTime(0.2, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.6)
    } catch {
      // Audio fallback
    }
  }

  useEffect(() => {
    const checkDueCallbacks = () => {
      const now = new Date()
      const dueCb = callbacks.find(cb => {
        if ((cb.status || '').toLowerCase() === 'done') return false
        if (dismissedAlertsRef.current.has(cb.id)) return false
        const targetUtc = getTargetUtcTimestamp(cb.date, cb.time, cb.timezone)
        if (!targetUtc) return false
        const diffMs = targetUtc - now.getTime()
        return diffMs <= 0
      })

      if (dueCb && (!activeAlert || activeAlert.id !== dueCb.id)) {
        setActiveAlert(dueCb)
        playAlertChime()
      }
    }

    checkDueCallbacks()
    const interval = setInterval(checkDueCallbacks, 4000)
    return () => clearInterval(interval)
  }, [callbacks, activeAlert])

  const dismissAlert = () => {
    if (activeAlert) {
      dismissedAlertsRef.current.add(activeAlert.id)
    }
    setActiveAlert(null)
  }

  const completeAlertCb = async () => {
    if (!activeAlert) return
    const id = activeAlert.id
    dismissedAlertsRef.current.add(id)
    setActiveAlert(null)
    setCallbacks(prev => prev.map(c => c.id === id ? { ...c, status: 'done' } : c))
    await db.from('callbacks').update({ status: 'done' }).eq('id', id)
    showToast('Callback marked complete!')
  }

  const snoozeAlertCb = (mins = 10) => {
    if (!activeAlert) return
    const id = activeAlert.id
    dismissedAlertsRef.current.add(id)
    setActiveAlert(null)
    showToast(`Snoozed for ${mins} minutes`)
    setTimeout(() => {
      dismissedAlertsRef.current.delete(id)
    }, mins * 60 * 1000)
  }

  // Real cross-reference: Callback/Followup rows have no candidate FK, only a
  // free-text candidate_name — same name-matching technique used across the
  // Candidate/Pipeline/Tasks workspaces.
  const candidateByName = useMemo(() => {
    const map = new Map()
    candidates.forEach(c => {
      const key = `${c.first_name || ''} ${c.last_name || ''}`.trim().toLowerCase()
      if (key) map.set(key, c)
    })
    return map
  }, [candidates])
  const profileById = useMemo(() => { const m = new Map(); profiles.forEach(p => m.set(p.id, p)); return m }, [profiles])

  const enrichedCallbacks = useMemo(() => callbacks.map(item => {
    const cand = matchCandidateIn(candidateByName, item.candidate_name)
    return {
      ...item, _candidate: cand,
      _jobTitle: cand?.job_title || item.job || null,
      _jobId: cand?.job_id || null,
      _client: cand?.client || null,
      _recruiter: cand?.recruiter_name || recruiterNameIn(profileById, item.user_id) || null,
      _createdBy: recruiterNameIn(profileById, item.user_id),
    }
  }), [callbacks, candidateByName, profileById])

  const enrichedFollowups = useMemo(() => followups.map(item => {
    const cand = matchCandidateIn(candidateByName, item.candidate_name)
    return {
      ...item, _candidate: cand,
      _jobTitle: cand?.job_title || null,
      _jobId: cand?.job_id || null,
      _client: cand?.client || null,
      _recruiter: cand?.recruiter_name || recruiterNameIn(profileById, item.user_id) || null,
      _createdBy: recruiterNameIn(profileById, item.user_id),
    }
  }), [followups, candidateByName, profileById])

  // Re-submit Finder — identical eligibility + matching rules as the
  // previous page, just restyled. Never invents a score: it's a real
  // skill-overlap % against each candidate's own skills list.
  const eligible = useMemo(() => candidates.filter(c => RESUBMIT_STATUSES.includes(c.internal_status)), [candidates])
  const openJobs = useMemo(() => jobs.filter(j => (j.status || 'Open') === 'Open'), [jobs])
  const getMatches = (candidate) => {
    const cSkills = ensureArray(candidate.skills).map(s => s.toLowerCase())
    return openJobs.filter(job => {
      const jSkills = ensureArray(job.skills).map(s => s.toLowerCase())
      const overlap = cSkills.filter(s => jSkills.includes(s))
      return overlap.length > 0 && job.job_id !== candidate.job_id
    }).map(job => {
      const jSkills2 = ensureArray(job.skills).map(s => s.toLowerCase())
      const overlap = cSkills.filter(s => jSkills2.includes(s))
      return { ...job, overlap, score: Math.round((overlap.length / Math.max(jSkills2.length, 1)) * 100) }
    }).sort((a, b) => b.score - a.score).filter(job => job.score >= 30).slice(0, 3)
  }

  // Header KPIs — every number derived from real Callback/Followup/Candidate
  // rows. "Communication Health" mirrors the same on-time-completion ratio
  // pattern already used for Pipeline Health / Job Health.
  const kpis = useMemo(() => {
    const callbacksToday = callbacks.filter(cb => isToday(cb.date) && cb.status === 'pending').length
    const followupsToday = followups.filter(f => isToday(f.date) && f.status !== 'done').length
    const overdueFollowups = followups.filter(f => f.date && f.date < todayStr() && f.status !== 'done').length
    const upcomingCallbacks = callbacks.filter(cb => cb.date && cb.date > todayStr() && cb.status === 'pending').length
    const awaitingContact = candidates.filter(c => c.followup_date && c.followup_date <= todayStr() && !['Hired', 'Rejected'].includes(c.external_status)).length
    const successfulContacts = callbacks.filter(cb => cb.status === 'done' && isToday(cb.updated_at)).length + followups.filter(f => ['done', 'contacted'].includes(f.status) && isToday(f.updated_at)).length
    const due = [...callbacks, ...followups].filter(x => x.date && x.date <= todayStr())
    const completedOfDue = due.filter(x => x.status === 'done' || x.status === 'contacted').length
    const healthPct = due.length ? Math.round((completedOfDue / due.length) * 100) : 100
    return { callbacksToday, followupsToday, overdueFollowups, upcomingCallbacks, awaitingContact, successfulContacts, resubmitOpportunities: eligible.length, healthPct }
  }, [callbacks, followups, candidates, eligible])

  // Communication Insights — real derived callouts only.
  const insights = useMemo(() => {
    const list = []
    const overdueContact = candidates.filter(c => c.followup_date && c.followup_date <= todayStr() && !['Hired', 'Rejected'].includes(c.external_status))
    if (overdueContact.length) list.push({ id: 'overdueContact', tone: 'yellow', icon: 'alertCircle', text: `${overdueContact.length} candidate${overdueContact.length === 1 ? '' : 's'} overdue for contact`, navigate: 'candidates' })

    const missed = callbacks.filter(cb => cb.status === 'missed' || (cb.status === 'pending' && cb.date && cb.date < todayStr()))
    if (missed.length) list.push({ id: 'missed', tone: 'red', icon: 'callbacks', text: `${missed.length} missed or overdue callback${missed.length === 1 ? '' : 's'}`, setView: 'callbacks' })

    const staleFollowups = followups.filter(f => f.status !== 'done' && (daysDiff(f.date) || 0) < -3)
    if (staleFollowups.length) list.push({ id: 'stale', tone: 'red', icon: 'followups', text: `${staleFollowups.length} follow-up${staleFollowups.length === 1 ? '' : 's'} overdue more than 3 days`, setView: 'followups' })

    const queueCounts = {}
    ;[...enrichedCallbacks, ...enrichedFollowups].filter(x => x.status !== 'done').forEach(x => {
      if (!x._recruiter) return
      queueCounts[x._recruiter] = (queueCounts[x._recruiter] || 0) + 1
    })
    const heavy = Object.entries(queueCounts).filter(([, n]) => n >= 8).sort((a, b) => b[1] - a[1])
    if (heavy.length) list.push({ id: 'heavy', tone: 'accent', icon: 'users', text: `${heavy[0][0]} has ${heavy[0][1]} open communication items` })

    const quiet = openJobs.filter(j => !enrichedCallbacks.some(cb => cb._jobId === j.job_id) && !enrichedFollowups.some(f => f._jobId === j.job_id))
    if (quiet.length) list.push({ id: 'quiet', tone: 'yellow', icon: 'jobs', text: `${quiet.length} open job${quiet.length === 1 ? '' : 's'} with no recent communication`, navigate: 'jobs' })

    const recent = [...callbacks, ...followups].filter(x => ['done', 'contacted'].includes(x.status) && withinDays(x.updated_at, 2))
    if (recent.length) list.push({ id: 'recent', tone: 'green', icon: 'checkCircle', text: `${recent.length} candidate${recent.length === 1 ? '' : 's'} contacted in the last 2 days` })

    return list
  }, [callbacks, followups, candidates, enrichedCallbacks, enrichedFollowups, openJobs])

  const handleInsightClick = (insight) => {
    if (insight.setView) return switchView(insight.setView)
    if (insight.navigate) return onNavigate?.(insight.navigate)
  }

  // Filter vocab per view
  const commCandidateOptions = useMemo(() => [...new Set([...callbacks, ...followups].map(x => x.candidate_name).filter(Boolean))].sort(), [callbacks, followups])
  const commRecruiterOptions = useMemo(() => [...new Set([...enrichedCallbacks, ...enrichedFollowups].map(x => x._recruiter).filter(Boolean))].sort(), [enrichedCallbacks, enrichedFollowups])
  const commJobOptions = useMemo(() => [...new Set([...enrichedCallbacks, ...enrichedFollowups].map(x => x._jobTitle).filter(Boolean))].sort(), [enrichedCallbacks, enrichedFollowups])
  const commClientOptions = useMemo(() => [...new Set([...enrichedCallbacks, ...enrichedFollowups].map(x => x._client).filter(Boolean))].sort(), [enrichedCallbacks, enrichedFollowups])
  const commCreatedByOptions = useMemo(() => [...new Set([...enrichedCallbacks, ...enrichedFollowups].map(x => x._createdBy).filter(Boolean))].sort(), [enrichedCallbacks, enrichedFollowups])
  const resubmitRecruiterOptions = useMemo(() => [...new Set(eligible.map(c => c.recruiter_name).filter(Boolean))].sort(), [eligible])
  const resubmitClientOptions = useMemo(() => [...new Set(eligible.map(c => c.client).filter(Boolean))].sort(), [eligible])
  const resubmitSkillOptions = useMemo(() => [...new Set(eligible.flatMap(c => ensureArray(c.skills)))].sort(), [eligible])

  const filterDefs = activeView === 'resubmit' ? [
    { key: 'recruiter', label: 'Recruiter', type: 'multiselect', options: resubmitRecruiterOptions },
    { key: 'client', label: 'Client', type: 'multiselect', options: resubmitClientOptions },
    { key: 'skills', label: 'Skills', type: 'multiselect', options: resubmitSkillOptions },
  ] : [
    { key: 'recruiter', label: 'Recruiter', type: 'multiselect', options: commRecruiterOptions },
    { key: 'candidate', label: 'Candidate', type: 'multiselect', options: commCandidateOptions },
    { key: 'job', label: 'Job', type: 'multiselect', options: commJobOptions },
    { key: 'client', label: 'Client', type: 'multiselect', options: commClientOptions },
    { key: 'priority', label: activeView === 'callbacks' ? 'Interest' : 'Priority', type: 'multiselect', options: activeView === 'callbacks' ? INTERESTS : PRIORITIES },
    { key: 'status', label: 'Status', type: 'multiselect', options: activeView === 'callbacks' ? CB_STATUSES : FU_STATUSES },
    { key: 'createdBy', label: 'Created By', type: 'multiselect', options: commCreatedByOptions },
    { key: 'dateFrom', label: 'Date From', type: 'date' },
    { key: 'dateTo', label: 'Date To', type: 'date' },
  ]
  const filterPresets = activeView === 'callbacks' ? [
    { label: "Today's Callbacks", values: { dateFrom: todayStr(), dateTo: todayStr() } },
    { label: 'Overdue', values: { overdue: true } },
    { label: 'Upcoming', values: { dateFrom: todayStr() } },
    { label: 'Completed Today', values: { completed: true } },
    { label: 'High Priority', values: { priority: ['Hot'] } },
  ] : activeView === 'followups' ? [
    { label: "Today's Follow-ups", values: { dateFrom: todayStr(), dateTo: todayStr() } },
    { label: 'Overdue', values: { overdue: true } },
    { label: 'Completed Today', values: { completed: true } },
    { label: 'High Priority', values: { priority: ['High'] } },
  ] : []

  const activeFilters = activeView === 'resubmit' ? resubmitFilters : filters
  const setActiveFilter = (key, value) => activeView === 'resubmit' ? setResubmitFilters(f => ({ ...f, [key]: value })) : setFilters(f => ({ ...f, [key]: value }))
  const hasFilters = activeView === 'resubmit'
    ? Boolean(search) || Object.values(resubmitFilters).some(v => v.length > 0)
    : Boolean(search) || Object.values(filters).some(v => Array.isArray(v) ? v.length > 0 : Boolean(v))
  const clearFilters = () => { setSearch(''); if (activeView === 'resubmit') setResubmitFilters(initialResubmitFilters); else setFilters(initialFilters) }

  const filteredCallbacks = useMemo(() => enrichedCallbacks.filter(item => {
    const q = (search || '').toLowerCase()
    if (q && !`${item.candidate_name} ${item._jobTitle || ''} ${item._client || ''} ${item.notes || ''}`.toLowerCase().includes(q)) return false
    const recruiters = Array.isArray(filters?.recruiter) ? filters.recruiter : []
    if (recruiters.length && !recruiters.includes(item._recruiter)) return false
    const candidatesSel = Array.isArray(filters?.candidate) ? filters.candidate : []
    if (candidatesSel.length && !candidatesSel.includes(item.candidate_name)) return false
    const jobsSel = Array.isArray(filters?.job) ? filters.job : []
    if (jobsSel.length && !jobsSel.includes(item._jobTitle)) return false
    const clientsSel = Array.isArray(filters?.client) ? filters.client : []
    if (clientsSel.length && !clientsSel.includes(item._client)) return false
    const createdBySel = Array.isArray(filters?.createdBy) ? filters.createdBy : []
    if (createdBySel.length && !createdBySel.includes(item._createdBy)) return false
    const prioritySel = Array.isArray(filters?.priority) ? filters.priority : []
    if (prioritySel.length && !prioritySel.includes(item.interest)) return false
    const statusSel = Array.isArray(filters?.status) ? filters.status : []
    if (statusSel.length && !statusSel.includes(item.status)) return false
    if (filters?.dateFrom && (!item.date || item.date < filters.dateFrom)) return false
    if (filters?.dateTo && (!item.date || item.date > filters.dateTo)) return false
    if (filters?.completed && item.status !== 'done') return false
    if (filters?.overdue && !(item.date && item.date < todayStr() && item.status !== 'done')) return false
    return true
  }), [enrichedCallbacks, search, filters])

  const filteredFollowups = useMemo(() => enrichedFollowups.filter(item => {
    const q = (search || '').toLowerCase()
    if (q && !`${item.candidate_name} ${item._jobTitle || ''} ${item._client || ''} ${item.notes || ''}`.toLowerCase().includes(q)) return false
    const recruiters = Array.isArray(filters?.recruiter) ? filters.recruiter : []
    if (recruiters.length && !recruiters.includes(item._recruiter)) return false
    const candidatesSel = Array.isArray(filters?.candidate) ? filters.candidate : []
    if (candidatesSel.length && !candidatesSel.includes(item.candidate_name)) return false
    const jobsSel = Array.isArray(filters?.job) ? filters.job : []
    if (jobsSel.length && !jobsSel.includes(item._jobTitle)) return false
    const clientsSel = Array.isArray(filters?.client) ? filters.client : []
    if (clientsSel.length && !clientsSel.includes(item._client)) return false
    const createdBySel = Array.isArray(filters?.createdBy) ? filters.createdBy : []
    if (createdBySel.length && !createdBySel.includes(item._createdBy)) return false
    const prioritySel = Array.isArray(filters?.priority) ? filters.priority : []
    if (prioritySel.length && !prioritySel.includes(item.priority)) return false
    const statusSel = Array.isArray(filters?.status) ? filters.status : []
    if (statusSel.length && !statusSel.includes(item.status)) return false
    if (filters?.dateFrom && (!item.date || item.date < filters.dateFrom)) return false
    if (filters?.dateTo && (!item.date || item.date > filters.dateTo)) return false
    if (filters?.completed && item.status !== 'done') return false
    if (filters?.overdue && !(item.date && item.date < todayStr() && item.status !== 'done')) return false
    return true
  }), [enrichedFollowups, search, filters])

  const filteredEligible = useMemo(() => eligible.filter(c => {
    const q = (search || '').toLowerCase()
    if (q && !`${c.first_name} ${c.last_name} ${c.job_title} ${c.client} ${ensureArray(c.skills).join(' ')}`.toLowerCase().includes(q)) return false
    const recruiters = Array.isArray(resubmitFilters?.recruiter) ? resubmitFilters.recruiter : []
    if (recruiters.length && !recruiters.includes(c.recruiter_name)) return false
    const clientsSel = Array.isArray(resubmitFilters?.client) ? resubmitFilters.client : []
    if (clientsSel.length && !clientsSel.includes(c.client)) return false
    const skillsSel = Array.isArray(resubmitFilters?.skills) ? resubmitFilters.skills : []
    if (skillsSel.length && !skillsSel.some(s => ensureArray(c.skills).includes(s))) return false
    return true
  }), [eligible, search, resubmitFilters])

  const splitByDate = (items) => {
    const today = [], overdue = [], upcoming = [], completed = []
    const nowMs = Date.now()
    items.forEach(item => {
      if (item.status === 'done') { completed.push(item); return }
      if (!item.date) { upcoming.push(item); return }
      const targetUtc = getTargetUtcTimestamp(item.date, item.time, item.timezone)
      const isTimeOverdue = targetUtc ? targetUtc < nowMs : false
      if (item.date < todayStr() || (item.date === todayStr() && isTimeOverdue)) {
        overdue.push(item)
      } else if (item.date === todayStr()) {
        today.push(item)
      } else {
        upcoming.push(item)
      }
    })
    return { today, overdue, upcoming, completed }
  }
  const cbSections = useMemo(() => splitByDate(filteredCallbacks), [filteredCallbacks])
  const fuSections = useMemo(() => splitByDate(filteredFollowups), [filteredFollowups])

  const openDrawer = (item, kind) => setShowDetail({ item, kind })
  const openCandidateDrawer = (candidate) => { setShowCandidateDetail(candidate); setCandidatePreviewTab('overview') }

  const openCreateCb = (prefill = {}) => { setCbForm({ ...emptyCbForm, ...prefill }); setEditingId(null); setFormKind('callback'); setShowForm(true) }
  const openCreateFu = (prefill = {}) => { setFuForm({ ...emptyFuForm, ...prefill }); setEditingId(null); setFormKind('followup'); setShowForm(true) }
  const openEditItem = (item, kind) => {
    if (kind === 'callback') setCbForm({ candidate_name: item.candidate_name || '', phone: item.phone || '', job: item.job || '', date: item.date || todayStr(), time: item.time || '10:00', timezone: item.timezone || 'EST', interest: item.interest || 'Warm', notes: item.notes || '', status: 'pending' })
    else setFuForm({ candidate_name: item.candidate_name || '', date: item.date || todayStr(), type: item.type || 'General Check-in', status: 'pending', priority: item.priority || 'Medium', notes: item.notes || '', next_action: item.next_action || '' })
    setEditingId(item.id)
    setFormKind(kind)
    setShowForm(true)
    setShowDetail(null)
  }

  const handleSaveForm = async () => {
    const currentOrgId = organization?.id || profile?.org_id
    if (formKind === 'callback') {
      if (!cbForm.candidate_name) return showToast('Candidate name required', 'error')
      if (!cbForm.date || !cbForm.time) return showToast('Date and time required', 'error')
      setSaving(true)
      const payload = { ...cbForm, status: 'pending', date: cbForm.date || null, user_id: user?.id, org_id: currentOrgId }
      if (editingId) {
        const { error } = await db.from('callbacks').update(payload).eq('id', editingId)
        setSaving(false)
        if (error) return showToast(error.message, 'error')
        setCallbacks(prev => prev.map(c => c.id === editingId ? { ...c, ...payload } : c))
        window.dispatchEvent(new CustomEvent('callback-updated'))
        showToast('Callback updated!')
      } else {
        const { data, error } = await db.from('callbacks').insert([payload])
        setSaving(false)
        if (error) return showToast(error.message, 'error')
        const created = Array.isArray(data) ? data[0] : data
        if (created) setCallbacks(prev => [created, ...prev])
        window.dispatchEvent(new CustomEvent('callback-updated'))
        showToast('Callback scheduled!')
      }
    } else {
      if (!fuForm.candidate_name) return showToast('Candidate name required', 'error')
      setSaving(true)
      const payload = { ...fuForm, status: 'pending', date: fuForm.date || null, user_id: user?.id, org_id: currentOrgId }
      if (editingId) {
        const { error } = await db.from('followups').update(payload).eq('id', editingId)
        setSaving(false)
        if (error) return showToast(error.message, 'error')
        setFollowups(prev => prev.map(f => f.id === editingId ? { ...f, ...payload } : f))
        showToast('Follow-up updated!')
      } else {
        const { data, error } = await db.from('followups').insert([payload])
        setSaving(false)
        if (error) return showToast(error.message, 'error')
        const created = Array.isArray(data) ? data[0] : data
        if (created) setFollowups(prev => [created, ...prev])
        showToast('Follow-up added!')
      }
    }
    setShowForm(false)
  }

  // AI Draft — fills the Notes field from real form context (candidate,
  // job, interest/type) via the shared Action Framework. Never invents a
  // candidate or job that isn't already in the form.
  const [draftingNote, setDraftingNote] = useState(false)
  const draftNote = async () => {
    const isCallback = formKind === 'callback'
    const name = isCallback ? cbForm.candidate_name : fuForm.candidate_name
    if (!name.trim()) return showToast('Add a candidate name first', 'error')
    setDraftingNote(true)
    const startedAt = new Date().getTime()
    try {
      const content = isCallback
        ? `Brief call talking points for calling ${name} about the ${cbForm.job || 'role'} position. Interest level: ${cbForm.interest}.`
        : `Follow-up note for ${name}, follow-up type: ${fuForm.type}.`
      const res = await runAiAction({
        action: 'draft',
        content,
        context: 'Keep it to 2-3 short, specific sentences a recruiter can use as-is or as a call script.',
      })
      if (res.success === false) throw new Error(res.error || 'AI draft failed.')
      if (isCallback) setCbForm(f => ({ ...f, notes: res.text }))
      else setFuForm(f => ({ ...f, notes: res.text }))
      logUsageEvent(orgId, userId, { type: 'action', action: 'draft', source: 'communication', success: true, provider: res.provider, model: res.model, durationMs: new Date().getTime() - startedAt, preview: res.text.slice(0, 140) })
    } catch (err) {
      const message = err.message || 'AI draft failed. Please try again.'
      showToast(message, 'error')
      logUsageEvent(orgId, userId, { type: 'action', action: 'draft', source: 'communication', success: false, error: message, durationMs: new Date().getTime() - startedAt })
    } finally {
      setDraftingNote(false)
    }
  }

  const toggleDone = async (item, kind) => {
    const newStatus = item.status === 'done' ? 'pending' : 'done'
    const table = kind === 'callback' ? 'callbacks' : 'followups'
    if (kind === 'callback') setCallbacks(prev => prev.map(c => c.id === item.id ? { ...c, status: newStatus } : c))
    else setFollowups(prev => prev.map(f => f.id === item.id ? { ...f, status: newStatus } : f))
    await db.from(table).update({ status: newStatus }).eq('id', item.id)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    const { id, kind } = deleteTarget
    const table = kind === 'callback' ? 'callbacks' : 'followups'
    await db.from(table).delete().eq('id', id)
    if (kind === 'callback') setCallbacks(prev => prev.filter(c => c.id !== id))
    else setFollowups(prev => prev.filter(f => f.id !== id))
    showToast('Deleted', 'error')
    setDeleteTarget(null)
    setShowDetail(null)
  }

  const candidatePhoneFor = (item) => item.phone || item._candidate?.phone || null
  const candidateEmailFor = (item) => item._candidate?.email || null

  const actionsFor = (item, kind) => {
    const isDone = item.status === 'done'
    const phone = candidatePhoneFor(item)
    const email = candidateEmailFor(item)
    return [
      { label: 'Open Details', icon: 'eye', onClick: () => openDrawer(item, kind) },
      { label: isDone ? 'Reopen' : 'Mark Complete', icon: 'checkCircle', onClick: () => toggleDone(item, kind) },
      { label: 'Reschedule', icon: 'calendar', onClick: () => openEditItem(item, kind) },
      'divider',
      kind === 'callback'
        ? { label: 'Create Follow-up', icon: 'followups', onClick: () => openCreateFu({ candidate_name: item.candidate_name }) }
        : { label: 'Schedule Callback', icon: 'callbacks', onClick: () => openCreateCb({ candidate_name: item.candidate_name, phone: item._candidate?.phone || '', job: item._jobTitle || '' }) },
      ...(item._candidate ? [{ label: 'Open Candidate', icon: 'users', onClick: () => (onNavigate ? onNavigate('candidates') : openCandidateDrawer(item._candidate)) }] : []),
      ...(item._jobId ? [{ label: 'Open Job', icon: 'jobs', onClick: () => onNavigate?.('jobs') }] : []),
      ...(phone ? [{ label: 'Call', icon: 'callbacks', onClick: () => { window.location.href = `tel:${phone}` } }] : []),
      ...(email ? [{ label: 'Email', icon: 'mail', onClick: () => { window.location.href = `mailto:${email}` } }] : []),
      'divider',
      { label: 'Edit', icon: 'edit', onClick: () => openEditItem(item, kind) },
      { label: 'Delete', icon: 'trash', danger: true, onClick: () => setDeleteTarget({ id: item.id, kind }) },
    ]
  }

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    document.addEventListener('mousedown', close)
    document.addEventListener('scroll', close, true)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('scroll', close, true) }
  }, [contextMenu])
  const openContextMenu = (e, item, kind) => { e.preventDefault(); setContextMenu({ item, kind, x: e.clientX, y: e.clientY }) }

  const openPacketForCandidate = (candidate, job) => setPacketModal({ isOpen: true, candidate, job })

  // Candidate preview drawer (Resubmit view) — same Overview/Timeline/Notes
  // shape as Candidates/Pipeline, so a candidate looks the same everywhere.
  const candidateTimeline = useMemo(() => {
    if (!showCandidateDetail) return []
    const fullName = `${showCandidateDetail.first_name || ''} ${showCandidateDetail.last_name || ''}`.trim().toLowerCase()
    if (!fullName) return []
    const matches = (name) => (name || '').trim().toLowerCase() === fullName
    const events = [
      ...callbacks.filter(cb => matches(cb.candidate_name)).map(cb => ({ id: `cb-${cb.id}`, type: 'Callback', title: cb.job || 'Callback', date: cb.date, status: cb.status, sub: cb.notes })),
      ...followups.filter(fu => matches(fu.candidate_name)).map(fu => ({ id: `fu-${fu.id}`, type: 'Follow-up', title: fu.type || 'Follow-up', date: fu.date, status: fu.status, sub: fu.notes })),
    ]
    return events.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
  }, [showCandidateDetail, callbacks, followups])

  const viewTabs = [
    { id: 'callbacks', label: 'Callbacks', count: callbacks.filter(c => c.status === 'pending').length },
    { id: 'followups', label: 'Follow-ups', count: followups.filter(f => f.status !== 'done').length },
    { id: 'resubmit', label: 'Re-submit Finder', count: eligible.length },
  ]

  const detailItem = showDetail?.item
  const detailKind = showDetail?.kind
  const detailStatusTone = detailKind === 'callback' ? CB_STATUS_TONE : FU_STATUS_TONE

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Recruiting Workspace"
        title="Communication"
        subtitle="Callbacks, follow-ups, and re-submit opportunities — your daily contact queue in one place."
        actions={
          <Menu
            align="start"
            trigger={({ toggle }) => <Button variant="primary" leftIcon="plus" onClick={toggle}>New</Button>}
            items={[
              { label: 'Schedule Callback', icon: 'callbacks', onClick: () => openCreateCb() },
              { label: 'Add Follow-up', icon: 'followups', onClick: () => openCreateFu() },
            ]}
          />
        }
        search={<WorkspaceSearch value={search} onChange={setSearch} storageKey="td_comm" placeholder="Candidate, job, client, notes..." />}
        filters={
          <FilterWorkspace filters={filterDefs} values={activeFilters} onChange={setActiveFilter} onReset={clearFilters} presets={filterPresets} storageKey={`comm_${activeView}`} />
        }
      />

      <div className="my-4">
        <Tabs items={viewTabs} value={activeView} onChange={switchView} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KPICard label="Callbacks Today" value={kpis.callbacksToday} helper="scheduled" tone="accent" icon="callbacks" />
        <KPICard label="Follow-ups Today" value={kpis.followupsToday} helper="due" tone="accent" icon="followups" />
        <KPICard label="Overdue Follow-ups" value={kpis.overdueFollowups} helper="needs attention" tone="red" icon="alertCircle" />
        <KPICard label="Upcoming Callbacks" value={kpis.upcomingCallbacks} helper="scheduled ahead" tone="ai" icon="calendar" />
        <KPICard label="Awaiting Contact" value={kpis.awaitingContact} helper="candidates" tone="yellow" icon="users" />
        <KPICard label="Successful Contacts" value={kpis.successfulContacts} helper="today" tone="green" icon="checkCircle" />
        <KPICard label="Re-submit Opportunities" value={kpis.resubmitOpportunities} helper="eligible candidates" tone="accent" icon="resubmit" />
        <KPICard label="Communication Health" value={`${kpis.healthPct}%`} helper="on-time contact rate" tone={kpis.healthPct >= 70 ? 'green' : kpis.healthPct >= 40 ? 'yellow' : 'red'} icon="trendUp" />
      </div>

      {insights.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap pb-4">
          {insights.map(insight => (
            <button
              key={insight.id}
              type="button"
              onClick={() => handleInsightClick(insight)}
              className={cn(
                'inline-flex items-center gap-1.5 h-7 pl-2 pr-2.5 rounded-full text-[11px] font-semibold border transition-colors duration-[var(--duration-fast)]',
                insight.tone === 'red' ? 'bg-red/10 text-red border-red/25 hover:bg-red/15' :
                insight.tone === 'yellow' ? 'bg-yellow/10 text-yellow border-yellow/25 hover:bg-yellow/15' :
                insight.tone === 'green' ? 'bg-green/10 text-green border-green/25 hover:bg-green/15' :
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

      {hasFilters && (
        <div className="flex items-center justify-between mb-3 -mt-1">
          <span className="text-xs text-text3">Filters active for this view</span>
          <button type="button" onClick={clearFilters} className="text-xs font-semibold text-text3 hover:text-red">Clear all</button>
        </div>
      )}

      {activeView === 'callbacks' && (
        <div className="flex flex-col gap-4">
          <CollapsibleSection title="Today" count={cbSections.today.length} tone="accent" loading={loading}>
            {cbSections.today.length === 0 ? <EmptyState icon="callbacks" title="No callbacks today" /> : cbSections.today.map(c => <CommCard key={c.id} item={c} kind="callback" onOpen={() => openDrawer(c, 'callback')} onToggleDone={() => toggleDone(c, 'callback')} onContextMenu={(e) => openContextMenu(e, c, 'callback')} actionsFor={actionsFor} />)}
          </CollapsibleSection>
          <CollapsibleSection title="Overdue" count={cbSections.overdue.length} tone="red" loading={loading}>
            {cbSections.overdue.length === 0 ? <EmptyState icon="checkCircle" title="No overdue callbacks" /> : cbSections.overdue.map(c => <CommCard key={c.id} item={c} kind="callback" onOpen={() => openDrawer(c, 'callback')} onToggleDone={() => toggleDone(c, 'callback')} onContextMenu={(e) => openContextMenu(e, c, 'callback')} actionsFor={actionsFor} />)}
          </CollapsibleSection>
          <CollapsibleSection title="Upcoming" count={cbSections.upcoming.length} tone="neutral" loading={loading} defaultOpen={false}>
            {cbSections.upcoming.length === 0 ? <EmptyState icon="calendar" title="Nothing scheduled ahead" /> : cbSections.upcoming.map(c => <CommCard key={c.id} item={c} kind="callback" onOpen={() => openDrawer(c, 'callback')} onToggleDone={() => toggleDone(c, 'callback')} onContextMenu={(e) => openContextMenu(e, c, 'callback')} actionsFor={actionsFor} />)}
          </CollapsibleSection>
          <CollapsibleSection title="Completed" count={cbSections.completed.length} tone="green" loading={loading} defaultOpen={false}>
            {cbSections.completed.length === 0 ? <EmptyState icon="checkCircle" title="Nothing completed yet" /> : cbSections.completed.map(c => <CommCard key={c.id} item={c} kind="callback" onOpen={() => openDrawer(c, 'callback')} onToggleDone={() => toggleDone(c, 'callback')} onContextMenu={(e) => openContextMenu(e, c, 'callback')} actionsFor={actionsFor} />)}
          </CollapsibleSection>
        </div>
      )}

      {activeView === 'followups' && (
        <div className="flex flex-col gap-4">
          <CollapsibleSection title="Today" count={fuSections.today.length} tone="accent" loading={loading}>
            {fuSections.today.length === 0 ? <EmptyState icon="followups" title="No follow-ups today" /> : fuSections.today.map(f => <CommCard key={f.id} item={f} kind="followup" onOpen={() => openDrawer(f, 'followup')} onToggleDone={() => toggleDone(f, 'followup')} onContextMenu={(e) => openContextMenu(e, f, 'followup')} actionsFor={actionsFor} />)}
          </CollapsibleSection>
          <CollapsibleSection title="Overdue" count={fuSections.overdue.length} tone="red" loading={loading}>
            {fuSections.overdue.length === 0 ? <EmptyState icon="checkCircle" title="No overdue follow-ups" /> : fuSections.overdue.map(f => <CommCard key={f.id} item={f} kind="followup" onOpen={() => openDrawer(f, 'followup')} onToggleDone={() => toggleDone(f, 'followup')} onContextMenu={(e) => openContextMenu(e, f, 'followup')} actionsFor={actionsFor} />)}
          </CollapsibleSection>
          <CollapsibleSection title="Upcoming" count={fuSections.upcoming.length} tone="neutral" loading={loading} defaultOpen={false}>
            {fuSections.upcoming.length === 0 ? <EmptyState icon="calendar" title="Nothing scheduled ahead" /> : fuSections.upcoming.map(f => <CommCard key={f.id} item={f} kind="followup" onOpen={() => openDrawer(f, 'followup')} onToggleDone={() => toggleDone(f, 'followup')} onContextMenu={(e) => openContextMenu(e, f, 'followup')} actionsFor={actionsFor} />)}
          </CollapsibleSection>
          <CollapsibleSection title="Completed" count={fuSections.completed.length} tone="green" loading={loading} defaultOpen={false}>
            {fuSections.completed.length === 0 ? <EmptyState icon="checkCircle" title="Nothing completed yet" /> : fuSections.completed.map(f => <CommCard key={f.id} item={f} kind="followup" onOpen={() => openDrawer(f, 'followup')} onToggleDone={() => toggleDone(f, 'followup')} onContextMenu={(e) => openContextMenu(e, f, 'followup')} actionsFor={actionsFor} />)}
          </CollapsibleSection>
        </div>
      )}

      {activeView === 'resubmit' && (
        <div className="flex flex-col gap-4">
          {loading ? (
            <div className="text-xs text-text3 py-10 text-center">Loading...</div>
          ) : filteredEligible.length === 0 ? (
            <EmptyState icon="resubmit" title="No eligible candidates" description="Candidates with Rejected, Withdrew, or On Hold status will appear here." />
          ) : filteredEligible.map(c => {
            const matches = getMatches(c)
            const sc = computeScore(c)
            return (
              <Card key={c.id}>
                <div className="flex items-start gap-3 flex-wrap mb-3.5">
                  <button type="button" onClick={() => openCandidateDrawer(c)} className="flex items-center gap-3 min-w-[220px] text-left">
                    <Avatar name={`${c.first_name || ''} ${c.last_name || ''}`.trim() || '?'} />
                    <div>
                      <div className="text-sm font-bold text-text">{c.first_name} {c.last_name}</div>
                      <div className="text-xs text-text3">Previously: {c.job_title} · <span className="text-red font-semibold">{c.internal_status}</span></div>
                    </div>
                  </button>
                  <Badge tone={sc.total >= 80 ? 'green' : sc.total >= 60 ? 'accent' : sc.total >= 40 ? 'yellow' : 'red'}>{sc.gradeLabel}</Badge>
                  <div className="ml-auto flex flex-wrap gap-1.5 max-w-full">
                    {ensureArray(c.skills).slice(0, 5).map(s => <span key={s} className="text-[11px] text-text3 bg-surface2 border border-border rounded px-1.5 py-0.5">{s}</span>)}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button size="sm" variant="secondary" leftIcon="callbacks" onClick={() => openCreateCb({ candidate_name: `${c.first_name} ${c.last_name}`.trim(), phone: c.phone || '', job: c.job_title || '' })}>Callback</Button>
                    <Button size="sm" variant="secondary" leftIcon="followups" onClick={() => openCreateFu({ candidate_name: `${c.first_name} ${c.last_name}`.trim() })}>Follow-up</Button>
                    <Menu align="end" trigger={(p) => <MenuTrigger {...p} />} items={[
                      { label: 'View Candidate', icon: 'eye', onClick: () => openCandidateDrawer(c) },
                      { label: 'Deep AI Fit', icon: 'sparkles', onClick: () => matches[0] && setAiMatchModal({ isOpen: true, candidate: c, job: matches[0] }) },
                    ]} />
                  </div>
                </div>

                {matches.length === 0 ? (
                  <p className="text-xs text-text3 italic">No matching open jobs found</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="text-[10px] font-bold text-text3 uppercase tracking-wide">Matching Open Jobs</div>
                    {matches.map(job => (
                      <div key={job.id} className="flex items-center gap-3 flex-wrap rounded-[var(--radius-md)] bg-surface2 border border-border px-3.5 py-3">
                        <div className="flex-1 min-w-[220px]">
                          <div className="text-sm font-bold text-text">{job.title} <span className="text-accent font-mono text-xs">{job.job_id}</span></div>
                          <div className="text-xs text-text3">{job.client} · {job.location}</div>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {job.overlap.map(s => <Badge key={s} size="sm" tone="green">{s}</Badge>)}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-center">
                            <div className="text-xl font-extrabold font-mono" style={{ color: job.score >= 60 ? 'var(--ai)' : job.score >= 30 ? 'var(--yellow)' : 'var(--red)' }}>{job.score}%</div>
                            <div className="text-[9px] font-bold text-ai">MATCH</div>
                          </div>
                          <Button size="sm" variant="secondary" leftIcon="sparkles" onClick={() => setAiMatchModal({ isOpen: true, candidate: c, job })}>Deep AI Fit</Button>
                          <Button size="sm" variant="primary" leftIcon="arrowUpRight" onClick={() => openPacketForCandidate(c, job)}>1-Click Packet</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="fixed min-w-[190px] max-h-[min(70vh,360px)] overflow-y-auto bg-surface border border-border rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] p-1.5 flex flex-col gap-0.5"
          style={{ top: contextMenu.y, left: contextMenu.x, zIndex: 'var(--z-dropdown)' }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {actionsFor(contextMenu.item, contextMenu.kind).map((item, i) => item === 'divider' ? (
            <div key={i} className="h-px bg-border my-1" />
          ) : (
            <button key={item.label} type="button" onClick={() => { item.onClick?.(); setContextMenu(null) }} className={cn('flex items-center gap-2 px-2.5 py-2 rounded-[var(--radius-sm)] text-sm font-medium text-left transition-colors duration-[var(--duration-fast)]', item.danger ? 'text-red hover:bg-red/10' : 'text-text hover:bg-surface2')}>
              {item.icon && <Icon name={item.icon} size={13} />}
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* Callback / Follow-up preview drawer */}
      {detailItem && (
        <EntityDrawer
          open={!!detailItem}
          onClose={() => setShowDetail(null)}
          eyebrow={detailKind === 'callback' ? 'Callback' : 'Follow-up'}
          title={detailItem.candidate_name}
          subtitle={detailItem._jobTitle || detailItem.job || undefined}
          status={<StatusPill status={detailItem.status} tone={detailStatusTone[detailItem.status] || 'neutral'} size="sm" />}
          size="md"
          actions={
            <>
              <Button variant="secondary" leftIcon="checkCircle" onClick={() => toggleDone(detailItem, detailKind)}>{detailItem.status === 'done' ? 'Reopen' : 'Complete'}</Button>
              <Button variant="secondary" leftIcon="edit" onClick={() => openEditItem(detailItem, detailKind)}>Edit</Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            {detailKind === 'callback' && detailItem.status !== 'done' && (() => {
              const timer = getCallbackCountdown(detailItem.date, detailItem.time, detailItem.timezone)
              if (!timer) return null
              return (
                <div
                  className={cn(
                    'flex items-center justify-between gap-3 p-3.5 rounded-[var(--radius-md)] border shadow-xs',
                    timer.isOverdue
                      ? 'bg-red/10 border-red/30 text-red'
                      : timer.urgent
                      ? 'bg-orange/10 border-orange/30 text-orange'
                      : 'bg-accent/10 border-accent/30 text-accent'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className={cn('w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0', timer.isOverdue ? 'bg-red/20 text-red' : 'bg-accent/20 text-accent')}>
                      <Icon name="clock" size={16} />
                    </span>
                    <div>
                      <div className="text-[10.5px] font-extrabold uppercase tracking-wider opacity-80">
                        {timer.isOverdue ? 'Callback Overdue' : 'Countdown to Call'}
                      </div>
                      <div className="text-base font-extrabold font-mono tracking-tight leading-tight mt-0.5">
                        {timer.text}
                      </div>
                    </div>
                  </div>
                  <span className={cn('w-2.5 h-2.5 rounded-full shrink-0 animate-ping', timer.isOverdue ? 'bg-red' : 'bg-accent')} />
                </div>
              )
            })()}
            <DetailCard
              title={detailKind === 'callback' ? 'Callback' : 'Follow-up'}
              rows={detailKind === 'callback'
                ? [['Date', detailItem.date], ['Time', `${detailItem.time || ''} ${detailItem.timezone || ''}`.trim()], ['Interest', detailItem.interest], ['Status', detailItem.status], ['Phone', detailItem.phone]]
                : [['Date', detailItem.date], ['Type', detailItem.type], ['Priority', detailItem.priority], ['Status', detailItem.status], ['Next Action', detailItem.next_action]]}
            />
            {(detailItem._jobTitle || detailItem._client || detailItem._recruiter) && (
              <DetailCard title="Context" rows={[['Job', detailItem._jobTitle], ['Client', detailItem._client], ['Recruiter', detailItem._recruiter], ['Created By', detailItem._createdBy]]} />
            )}
            <Card>
              <CardHeader title="Notes" />
              <p className="text-sm text-text2 leading-relaxed">{detailItem.notes || 'No notes yet.'}</p>
            </Card>
            <Card className="bg-surface2">
              <CardHeader title="Linked Candidate" action={detailItem._candidate && <Button size="sm" variant="ghost" onClick={() => { setShowDetail(null); openCandidateDrawer(detailItem._candidate) }}>View</Button>} />
              {detailItem._candidate ? (() => {
                const sc = computeScore(detailItem._candidate)
                return (
                  <div className="flex items-center gap-3">
                    <Avatar name={`${detailItem._candidate.first_name || ''} ${detailItem._candidate.last_name || ''}`.trim()} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-text truncate">{detailItem._candidate.first_name} {detailItem._candidate.last_name}</div>
                      <div className="text-xs text-text3 truncate">{detailItem._candidate.job_title}</div>
                    </div>
                    <Badge tone={sc.total >= 80 ? 'green' : sc.total >= 60 ? 'accent' : sc.total >= 40 ? 'yellow' : 'red'}>{sc.gradeLabel}</Badge>
                  </div>
                )
              })() : <p className="text-xs text-text3">No matching candidate record found for this name.</p>}
            </Card>
          </div>
        </EntityDrawer>
      )}

      {/* Candidate preview drawer (from Re-submit Finder) */}
      {showCandidateDetail && (() => {
        const sc = computeScore(showCandidateDetail)
        const circumference = 2 * Math.PI * 40
        const offset = circumference - (sc.total / 100) * circumference
        return (
          <EntityDrawer
            open={!!showCandidateDetail}
            onClose={() => setShowCandidateDetail(null)}
            avatarName={`${showCandidateDetail.first_name || ''} ${showCandidateDetail.last_name || ''}`.trim()}
            eyebrow="Candidate"
            title={`${showCandidateDetail.first_name} ${showCandidateDetail.last_name}`}
            subtitle={<>{showCandidateDetail.job_title} · <span className="text-accent font-mono">{showCandidateDetail.job_id}</span></>}
            status={<StatusPill status={showCandidateDetail.internal_status} tone={CANDIDATE_STATUS_TONE[showCandidateDetail.internal_status] || 'neutral'} size="sm" />}
            size="lg"
            tabs={[{ id: 'overview', label: 'Overview' }, { id: 'timeline', label: 'Timeline', count: candidateTimeline.length }, { id: 'notes', label: 'Notes' }]}
            activeTab={candidatePreviewTab}
            onTabChange={setCandidatePreviewTab}
            actions={
              <>
                <Button variant="secondary" leftIcon="callbacks" onClick={() => openCreateCb({ candidate_name: `${showCandidateDetail.first_name} ${showCandidateDetail.last_name}`.trim(), phone: showCandidateDetail.phone || '', job: showCandidateDetail.job_title || '' })}>Callback</Button>
                <Button variant="secondary" leftIcon="followups" onClick={() => openCreateFu({ candidate_name: `${showCandidateDetail.first_name} ${showCandidateDetail.last_name}`.trim() })}>Follow-up</Button>
              </>
            }
          >
            {candidatePreviewTab === 'overview' && (
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
                    <div className="flex flex-wrap gap-1.5 flex-1 min-w-[220px]">
                      {sc.insights.slice(0, 8).map((insight, i) => <Badge key={i} size="sm" tone={insight.type === 'good' ? 'green' : insight.type === 'bad' ? 'red' : 'yellow'}>{insight.text}</Badge>)}
                    </div>
                  </div>
                </Card>
                <div className="grid sm:grid-cols-2 gap-3">
                  <DetailCard title="Previous Submission" rows={[['Job Title', showCandidateDetail.job_title], ['Job ID', showCandidateDetail.job_id], ['Client', showCandidateDetail.client], ['Submitted', showCandidateDetail.submission_date]]} />
                  <DetailCard title="Status" rows={[['Internal', showCandidateDetail.internal_status], ['Priority', showCandidateDetail.priority], ['Recruiter', showCandidateDetail.recruiter_name], ['Location', showCandidateDetail.location]]} />
                </div>
                <Card>
                  <CardHeader title="Skills" />
                  <div className="flex flex-wrap gap-1.5">
                    {ensureArray(showCandidateDetail.skills).map(s => <Badge key={s} tone="accent">{s}</Badge>)}
                    {!ensureArray(showCandidateDetail.skills).length && <span className="text-text3 text-sm">No skills listed</span>}
                  </div>
                </Card>
              </div>
            )}
            {candidatePreviewTab === 'timeline' && (
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
            {candidatePreviewTab === 'notes' && (
              <Card>
                <CardHeader title="Notes" />
                <p className="text-sm text-text2 leading-relaxed">{showCandidateDetail.notes || 'No notes yet.'}</p>
              </Card>
            )}
          </EntityDrawer>
        )
      })()}

      {/* Create / edit callback or follow-up */}
      <Drawer
        open={showForm}
        onClose={() => setShowForm(false)}
        title={formKind === 'callback' ? (editingId ? 'Edit Callback' : 'Schedule Callback') : (editingId ? 'Edit Follow-up' : 'Add Follow-up')}
        size="md"
        footer={<><Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button><Button variant="primary" loading={saving} onClick={handleSaveForm}>{editingId ? 'Save Changes' : 'Save'}</Button></>}
      >
        {formKind === 'callback' ? (
          <div className="flex flex-col gap-3.5">
            <FormField label="Candidate Name" required>
              <div className="flex gap-2">
                <Input value={cbForm.candidate_name} onChange={e => setCbForm(f => ({ ...f, candidate_name: e.target.value }))} placeholder="Type name..." className="flex-1" />
                <div className="w-36 shrink-0">
                  <SearchableSelect
                    options={candidates.map(c => ({ id: c.id, name: `${c.first_name || ''} ${c.last_name || ''}`.trim(), role: c.job_title }))}
                    value="all"
                    allLabel="Pick..."
                    onChange={id => {
                      const c = candidates.find(x => x.id === id)
                      if (!c) return
                      setCbForm(f => ({ ...f, candidate_name: `${c.first_name || ''} ${c.last_name || ''}`.trim(), phone: c.phone || f.phone, job: c.job_title || f.job }))
                    }}
                  />
                </div>
              </div>
            </FormField>
            <div className="grid sm:grid-cols-2 gap-3.5">
              <FormField label="Phone"><Input value={cbForm.phone} onChange={e => setCbForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 555 000 0000" /></FormField>
              <FormField label="Job Title"><Input value={cbForm.job} onChange={e => setCbForm(f => ({ ...f, job: e.target.value }))} placeholder="Java Developer" /></FormField>
              <FormField label="Interest"><Select value={cbForm.interest} onChange={v => setCbForm(f => ({ ...f, interest: v }))} options={INTERESTS.map(o => ({ value: o, label: o }))} /></FormField>
              <FormField label="Status"><Select value={cbForm.status} onChange={v => setCbForm(f => ({ ...f, status: v }))} options={CB_STATUSES.map(o => ({ value: o, label: o }))} /></FormField>
              <FormField label="Date" required><Input type="date" value={cbForm.date} onChange={e => setCbForm(f => ({ ...f, date: e.target.value }))} /></FormField>
              <FormField label="Time" required><TimePicker value={cbForm.time} onChange={v => setCbForm(f => ({ ...f, time: v }))} /></FormField>
              <FormField label="Timezone"><Select value={cbForm.timezone} onChange={v => setCbForm(f => ({ ...f, timezone: v }))} options={['EST', 'CST', 'MST', 'PST', 'IST'].map(o => ({ value: o, label: o }))} /></FormField>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-text2 tracking-wide">Notes</span>
                {aiEnabled && (
                  <button type="button" onClick={draftNote} disabled={draftingNote} className="text-[11px] font-semibold text-accent hover:text-accent/80 flex items-center gap-1 disabled:opacity-50">
                    <Icon name="sparkles" size={10} /> {draftingNote ? 'Drafting...' : 'AI Draft'}
                  </button>
                )}
              </div>
              <Textarea value={cbForm.notes} onChange={e => setCbForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Any notes..." />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            <FormField label="Candidate Name" required>
              <div className="flex gap-2">
                <Input value={fuForm.candidate_name} onChange={e => setFuForm(f => ({ ...f, candidate_name: e.target.value }))} placeholder="Type name..." className="flex-1" />
                <div className="w-36 shrink-0">
                  <SearchableSelect
                    options={candidates.map(c => ({ id: c.id, name: `${c.first_name || ''} ${c.last_name || ''}`.trim(), role: c.job_title }))}
                    value="all"
                    allLabel="Pick..."
                    onChange={id => {
                      const c = candidates.find(x => x.id === id)
                      if (!c) return
                      setFuForm(f => ({ ...f, candidate_name: `${c.first_name || ''} ${c.last_name || ''}`.trim() }))
                    }}
                  />
                </div>
              </div>
            </FormField>
            <div className="grid sm:grid-cols-2 gap-3.5">
              <FormField label="Date"><Input type="date" value={fuForm.date} onChange={e => setFuForm(f => ({ ...f, date: e.target.value }))} /></FormField>
              <FormField label="Type"><Select value={fuForm.type} onChange={v => setFuForm(f => ({ ...f, type: v }))} options={FU_TYPES.map(o => ({ value: o, label: o }))} /></FormField>
              <FormField label="Status"><Select value={fuForm.status} onChange={v => setFuForm(f => ({ ...f, status: v }))} options={FU_STATUSES.map(o => ({ value: o, label: o }))} /></FormField>
              <FormField label="Priority"><Select value={fuForm.priority} onChange={v => setFuForm(f => ({ ...f, priority: v }))} options={PRIORITIES.map(o => ({ value: o, label: o }))} /></FormField>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-text2 tracking-wide">Notes</span>
                {aiEnabled && (
                  <button type="button" onClick={draftNote} disabled={draftingNote} className="text-[11px] font-semibold text-accent hover:text-accent/80 flex items-center gap-1 disabled:opacity-50">
                    <Icon name="sparkles" size={10} /> {draftingNote ? 'Drafting...' : 'AI Draft'}
                  </button>
                )}
              </div>
              <Textarea value={fuForm.notes} onChange={e => setFuForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
            </div>
            <FormField label="Next Action"><Input value={fuForm.next_action} onChange={e => setFuForm(f => ({ ...f, next_action: e.target.value }))} placeholder="What's the next step?" /></FormField>
          </div>
        )}
      </Drawer>

      {/* Delete confirm */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} size="sm" title="Delete this item?" footer={<><Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button><Button variant="danger" onClick={confirmDelete}>Delete</Button></>}>
        <p className="text-sm text-text3">This cannot be undone.</p>
      </Modal>

      <SubmissionPacketModal isOpen={packetModal.isOpen} onClose={() => setPacketModal({ isOpen: false, candidate: null, job: null })} candidate={packetModal.candidate} job={packetModal.job} />
      <AIMatchModal isOpen={aiMatchModal.isOpen} onClose={() => setAiMatchModal({ isOpen: false, candidate: null, job: null })} candidate={aiMatchModal.candidate} job={aiMatchModal.job} onOpenSubmissionPacket={(cand, j) => openPacketForCandidate(cand, j)} />

    </PageContainer>
  )
}



function CommCard({ item, kind, onOpen, onToggleDone, onContextMenu, actionsFor }) {
  const isCallback = kind === 'callback'
  const isDone = item.status === 'done'
  const isOverdue = item.date && item.date < todayStr() && !isDone
  const priorityValue = isCallback ? item.interest : item.priority
  const priorityTone = isCallback
    ? (priorityValue === 'Hot' ? 'red' : priorityValue === 'Warm' ? 'yellow' : 'accent')
    : (priorityValue === 'High' ? 'red' : priorityValue === 'Low' ? 'neutral' : 'yellow')

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!isCallback || isDone) return
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [isCallback, isDone])

  const timer = isCallback && !isDone ? getCallbackCountdown(item.date, item.time, item.timezone, now) : null

  return (
    <div
      tabIndex={0}
      onClick={onOpen}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); if (e.key.toLowerCase() === 'c') { e.stopPropagation(); onToggleDone() } }}
      className="group relative flex items-start gap-3 rounded-[var(--radius-md)] border border-border bg-surface2 px-3 py-2.5 cursor-pointer transition-all duration-[var(--duration-fast)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] hover:border-accent/40 outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleDone() }}
        aria-label={isDone ? 'Reopen' : 'Mark complete'}
        className={cn('mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors duration-[var(--duration-fast)]', isDone ? 'bg-green border-green text-white' : 'border-text3/50 hover:border-accent')}
      >
        {isDone && <Icon name="check" size={11} />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap mb-1">
          <Badge size="sm" tone={priorityTone}>{priorityValue || (isCallback ? 'Warm' : 'Medium')}</Badge>
          {item.status !== 'pending' && <StatusPill status={item.status} tone={(isCallback ? CB_STATUS_TONE : FU_STATUS_TONE)[item.status] || 'neutral'} size="sm" />}
          
          {timer && (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-extrabold font-mono tracking-tight shadow-xs transition-all duration-200',
                timer.isOverdue
                  ? 'bg-red/15 text-red border border-red/30 animate-pulse'
                  : timer.urgent
                  ? 'bg-orange/15 text-orange border border-orange/30 animate-pulse'
                  : 'bg-accent/12 text-accent border border-accent/25'
              )}
              title={timer.isOverdue ? `Call overdue by ${timer.raw}` : `Call due in ${timer.raw}`}
            >
              <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', timer.isOverdue ? 'bg-red animate-ping' : timer.urgent ? 'bg-orange animate-ping' : 'bg-accent animate-pulse')} />
              <Icon name="clock" size={10} className="shrink-0" />
              <span>{timer.text}</span>
            </span>
          )}

          {!timer && isOverdue && <Badge size="sm" tone="red">Overdue</Badge>}
        </div>
        <strong className={cn('text-[13px] font-bold text-text block truncate', isDone && 'line-through text-text3')}>{item.candidate_name}</strong>
        <div className="flex items-center gap-2.5 flex-wrap mt-1 text-[10.5px] text-text3">
          <span>{isCallback ? `${relativeDate(item.date)}${item.time ? ` · ${item.time} ${item.timezone || ''}` : ''}` : `${relativeDate(item.date)}${item.type ? ` · ${item.type}` : ''}`}</span>
          {item._jobTitle && <span className="truncate max-w-[140px]"><Icon name="jobs" size={10} className="inline mr-0.5 -mt-0.5" />{item._jobTitle}</span>}
          {item._recruiter && <span className="inline-flex items-center gap-1"><Avatar name={item._recruiter} size="xs" />{item._recruiter}</span>}
        </div>
        {item.notes && <p className="text-[11px] text-text3 mt-1 italic line-clamp-2">{item.notes}</p>}
        {!isCallback && item.next_action && <p className="text-[11px] text-accent mt-1">→ {item.next_action}</p>}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Menu align="end" trigger={(p) => <span onClick={(e) => e.stopPropagation()}><MenuTrigger {...p} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" /></span>} items={actionsFor(item, kind)} />
      </div>
    </div>
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
