import { useEffect, useMemo, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import * as XLSX from 'xlsx'
import { PageContainer } from '../components/layout/PageContainer'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { db, apiRequest } from '../lib/api'
import { computeJobHealth } from '../lib/jobHealth'
import { useAISetContext } from '../lib/ai/context'
import { runAiAction } from '../lib/ai/aiClient'
import { logUsageEvent } from '../lib/ai/usage'
import { useAuth } from '../context/AuthContext'
import { useCandidates } from '../hooks/useCandidates'
import {
  Button, Card, CardHeader, KPICard, Badge, StatusPill, Table, Tabs,
  EmptyState, Skeleton, Avatar, Icon, Menu, MenuTrigger, Input,
} from '../components/ui'
import MarkdownView from '../components/MarkdownView'

const STAGES = ['Submitted', 'Screening', 'Interview Scheduled', 'Client Review', 'Offer Extended', 'Hired', 'Rejected']
const COLORS = ['#2563eb', '#8b5cf6', '#f59e0b', '#06b6d4', '#10b981', '#059669', '#ef4444']
// Presentational-only effort estimate, keyed off the mission board's task tag — there is no
// effort-tracking field in the data model, so this is a heuristic display, not real duration data.
const TASK_EFFORT_MINUTES = { 'Follow-up': 10, 'Call': 15, 'Screening': 25, 'Interview': 30, 'Offer': 15, 'EOD Review': 20 }

function formatRelativeTime(dateStr) {
  if (!dateStr) return ''
  const then = new Date(dateStr)
  if (Number.isNaN(then.getTime())) return ''
  const diffMs = new Date().getTime() - then.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d ago`
}

// Real trend arrow from two real counts — returns null (no arrow shown) when there's
// no signal to compare, instead of inventing a percentage.
function computeTrend(current, previous) {
  if (!current && !previous) return null
  if (!previous) return { dir: 'up', pct: 100 }
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct === 0) return { dir: 'flat', pct: 0 }
  return { dir: pct > 0 ? 'up' : 'down', pct: Math.abs(pct) }
}

function getActivityDateBucket(dateStr) {
  const date = new Date(dateStr)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)
  const startOfWeek = new Date(startOfToday)
  startOfWeek.setDate(startOfWeek.getDate() - 7)
  if (date >= startOfToday) return 'Today'
  if (date >= startOfYesterday) return 'Yesterday'
  if (date >= startOfWeek) return 'This Week'
  return 'Earlier'
}

export default function Dashboard({ onNavigate }) {
  const authContext = useAuth() || {}
  const profile = authContext.profile
  const orgId = authContext.organization?.id || profile?.org_id
  const userId = authContext.user?.id

  const candidatesContext = useCandidates() || {}
  const rawCandidates = candidatesContext.candidates
  const candidates = useMemo(() => Array.isArray(rawCandidates) ? rawCandidates : [], [rawCandidates])

  const [jobs, setJobs] = useState([])
  useAISetContext({ workspace: 'Dashboard', currentRecruiter: profile?.full_name || authContext.user?.email, totalCandidates: candidates.length })
  const [callbacks, setCallbacks] = useState([])
  const [followups, setFollowups] = useState([])
  const [profiles, setProfiles] = useState([])
  const [timeRange, setTimeRange] = useState('all')
  const [stageFilter, setStageFilter] = useState('All')
  const [hoveredStage, setHoveredStage] = useState(null)
  const [activityFilter, setActivityFilter] = useState('all')
  const [tableSortKey, setTableSortKey] = useState(null)
  const [tableSortDir, setTableSortDir] = useState('desc')
  const [expandedRecruiterName, setExpandedRecruiterName] = useState(null)
  const [selectedOwners, setSelectedOwners] = useState([])
  const [showOwnerDropdown, setShowOwnerDropdown] = useState(false)
  const [recruiterSearch, setRecruiterSearch] = useState('')
  const [recruiterPos, setRecruiterPos] = useState({ top: 0, left: 0 })
  const recruiterBtnRef = useRef(null)
  const dropdownRef = useRef(null)

  // Live Clock
  const [currentTime, setCurrentTime] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Ctrl+K Command Palette Launcher State
  const [commandOpen, setCommandOpen] = useState(false)
  const [commandQuery, setCommandQuery] = useState('')
  const [commandActiveIndex, setCommandActiveIndex] = useState(0)
  const [recentSearches, setRecentSearches] = useState(() => {
    try {
      const saved = localStorage.getItem('td_recent_searches')
      const parsed = saved ? JSON.parse(saved) : []
      return Array.isArray(parsed) ? parsed : []
    } catch (e) { return [] }
  })

  const commitRecentSearch = (term) => {
    const trimmed = (term || '').trim()
    if (!trimmed) return
    // Written synchronously (not inside a setState updater) so it isn't lost when
    // the same click also triggers navigation and unmounts this component.
    const next = [trimmed, ...recentSearches.filter(t => t.toLowerCase() !== trimmed.toLowerCase())].slice(0, 5)
    try { localStorage.setItem('td_recent_searches', JSON.stringify(next)) } catch (e) { /* ignore quota errors */ }
    setRecentSearches(next)
  }

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandOpen(prev => !prev)
      }
      if (e.key === 'Escape') {
        setCommandOpen(false)
        setShowNotifications(false)
        setCopilotState('closed')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (commandOpen) setCommandActiveIndex(0)
  }, [commandOpen, commandQuery])

  // Notifications Drawer State
  const [showNotifications, setShowNotifications] = useState(false)

  // Slide-Out Right-Side AI Copilot Drawer Window State: 'expanded' | 'minimized' | 'closed'
  const [copilotState, setCopilotState] = useState('closed')
  const [copilotQuery, setCopilotQuery] = useState('')

  // User First Name & Scoped LocalStorage Keys
  const userFirstName = useMemo(() => {
    if (profile?.full_name) return profile.full_name.trim().split(' ')[0]
    if (profile?.email) return profile.email.split('@')[0]
    return 'there'
  }, [profile])

  const storagePrefix = useMemo(() => {
    if (profile?.id && profile?.org_id) return `td_${profile.org_id}_${profile.id}`
    if (profile?.id) return `td_${profile.id}`
    return 'td_guest'
  }, [profile])

  const initialWelcomeMessage = useMemo(() => ({
    sender: 'ai',
    text: `Hi ${userFirstName}! I'm your TalentDesk AI Action Copilot.`,
    content: {
      summary: `Hi ${userFirstName}! I'm your TalentDesk AI Action Copilot. How can I assist you with candidate sourcing, pipeline analytics, or CRM operations today?`,
      actions: [
        { label: "View Callbacks", action: "open_callbacks" },
        { label: "Schedule Interviews", action: "open_candidates" },
        { label: "Draft Follow-up Email", action: "generate_followup" }
      ],
      followup: "Ask me a question or try an action like 'Close job #1' or 'Log callback for Alex'."
    },
    timestamp: 'Just now'
  }), [userFirstName])

  const [copilotMessages, setCopilotMessages] = useState([initialWelcomeMessage])

  // Recruiter Mission Board State
  const [dailyNotes, setDailyNotes] = useState([])

  // Re-sync copilot messages and daily notes when profile/organization switches
  useEffect(() => {
    if (!profile) return

    // 1. Sync Copilot History
    const copilotKey = `${storagePrefix}_copilot_history`
    const savedCopilot = localStorage.getItem(copilotKey)
    if (savedCopilot) {
      try {
        const parsed = JSON.parse(savedCopilot)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCopilotMessages(parsed)
        } else {
          setCopilotMessages([initialWelcomeMessage])
        }
      } catch {
        setCopilotMessages([initialWelcomeMessage])
      }
    } else {
      setCopilotMessages([initialWelcomeMessage])
    }

    // 2. Sync Daily Notes
    const notesKey = `${storagePrefix}_daily_notes`
    const savedNotes = localStorage.getItem(notesKey)
    if (savedNotes) {
      try {
        const parsed = JSON.parse(savedNotes)
        if (Array.isArray(parsed)) {
          setDailyNotes(parsed)
          return
        }
      } catch { /* ignore */ }
    }

    // 3. Sync Scratchpad Notes
    const padKey = `${storagePrefix}_scratchpad`
    const savedPad = localStorage.getItem(padKey)
    setScratchpad(savedPad || '')

    // Default tasks only for initial TalentDesk demo org profile
    if (profile.org_id === '4871af76-fa56-4069-af34-5f9ab4c0be10') {
      setDailyNotes([
        { id: 1, text: 'Follow up with Alex Rivera on Senior React Developer offer letter', done: false, tag: 'Offer', priority: 'High', candidate: 'Alex Rivera', job: 'Senior React Developer' },
        { id: 2, text: 'Screen 3 DevOps candidates for Acme Corp requisition', done: true, tag: 'Screening', priority: 'Medium', candidate: 'DevOps Leads', job: 'Lead DevOps Eng' },
        { id: 3, text: 'Schedule final technical interview round for candidate Sarah Jenkins', done: true, tag: 'Interview', priority: 'Urgent', candidate: 'Sarah Jenkins', job: 'Full-Stack Lead' },
        { id: 4, text: 'Perform EOD submittal audit & clean up stalled CRM leads', done: false, tag: 'EOD Review', priority: 'Normal', candidate: 'N/A', job: 'Operations' }
      ])
    } else {
      setDailyNotes([])
    }
  }, [profile, storagePrefix, initialWelcomeMessage])

  // Sync message changes to persistence store
  useEffect(() => {
    if (!profile) return
    try {
      localStorage.setItem(`${storagePrefix}_copilot_history`, JSON.stringify(copilotMessages))
    } catch (e) {
      console.error('Error saving copilot history:', e)
    }
  }, [copilotMessages, profile, storagePrefix])

  const handleNewChat = () => {
    setCopilotMessages([initialWelcomeMessage])
    if (profile) localStorage.removeItem(`${storagePrefix}_copilot_history`)
  }

  const [copilotLoading, setCopilotLoading] = useState(false)

  // AI Executive Briefing State
  const [aiBriefingText, setAiBriefingText] = useState('')
  const [briefingLoading, setBriefingLoading] = useState(false)
  const [aiBriefExpanded, setAiBriefExpanded] = useState(false)

  const [newNoteText, setNewNoteText] = useState('')
  const [noteTag, setNoteTag] = useState('Follow-up')
  const [missionTab, setMissionTab] = useState('tasks')
  const [eodSummaryText, setEodSummaryText] = useState('')
  const [eodLoading, setEodLoading] = useState(false)
  const [eodCopied, setEodCopied] = useState(false)
  const [activeTaskMenuId, setActiveTaskMenuId] = useState(null)

  const handleAddNote = (e) => {
    e?.preventDefault()
    if (!newNoteText.trim()) return
    const newNote = {
      id: Date.now(),
      text: newNoteText.trim(),
      done: false,
      tag: noteTag,
      priority: 'High',
      candidate: 'Recruiter Task',
      job: 'General'
    }
    const updated = [newNote, ...dailyNotes]
    setDailyNotes(updated)
    if (profile) localStorage.setItem(`${storagePrefix}_daily_notes`, JSON.stringify(updated))
    setNewNoteText('')
  }

  const handleToggleNote = (id) => {
    const updated = dailyNotes.map(n => n.id === id ? { ...n, done: !n.done } : n)
    setDailyNotes(updated)
    if (profile) localStorage.setItem(`${storagePrefix}_daily_notes`, JSON.stringify(updated))
  }

  const handleDeleteNote = (id) => {
    const updated = dailyNotes.filter(n => n.id !== id)
    setDailyNotes(updated)
    if (profile) localStorage.setItem(`${storagePrefix}_daily_notes`, JSON.stringify(updated))
    setActiveTaskMenuId(null)
  }

  const handleGenerateEODSummary = async () => {
    setEodLoading(true)
    setMissionTab('eod')
    const completed = dailyNotes.filter(n => n.done).map(n => `- [x] ${n.text} (${n.tag})`).join('\n') || 'None'
    const pending = dailyNotes.filter(n => !n.done).map(n => `- [ ] ${n.text} (${n.tag})`).join('\n') || 'None'

    // Migrated onto the shared AI Action Framework (Phase 5.4) — same data,
    // same output shape, now routed through runAiAction/'recommend' with
    // usage logging instead of a direct /ai/generate call.
    const content = `RECRUITER DAILY NOTES STATUS:\nCOMPLETED ITEMS:\n${completed}\n\nPENDING FOLLOW-UPS:\n${pending}`
    const context = `Generate a concise, high-impact End of Day (EOD) Recruiter Summary & Action Plan. Format as:
### 🏆 EOD Recruiter Summary & Accomplishments
- Highlighting key wins from completed notes...

### ⏳ Pending Bottlenecks & Open Tasks
- Summary of unfinished items...

### 🎯 3 Priority Actions for Tomorrow Morning
1. Action item 1...
2. Action item 2...
3. Action item 3...`

    const startedAt = new Date().getTime()
    try {
      const res = await runAiAction({ action: 'recommend', content, context })
      if (res.success === false) throw new Error(res.error || 'EOD summary failed.')
      setEodSummaryText(res.text)
      logUsageEvent(orgId, userId, { type: 'action', action: 'recommend', source: 'dashboard', success: true, provider: res.provider, model: res.model, durationMs: new Date().getTime() - startedAt, preview: res.text.slice(0, 140) })
    } catch (err) {
      console.error(err)
      setEodSummaryText('⚠️ AI service temporarily unavailable. Daily notes are saved locally.')
      logUsageEvent(orgId, userId, { type: 'action', action: 'recommend', source: 'dashboard', success: false, error: err.message, durationMs: new Date().getTime() - startedAt })
    } finally {
      setEodLoading(false)
    }
  }

  // Safe array accessors
  const safeJobs = useMemo(() => Array.isArray(jobs) ? jobs : [], [jobs])
  const safeCallbacks = useMemo(() => Array.isArray(callbacks) ? callbacks : [], [callbacks])
  const safeFollowups = useMemo(() => Array.isArray(followups) ? followups : [], [followups])
  const safeProfiles = useMemo(() => Array.isArray(profiles) ? profiles : [], [profiles])

  const qualifiedCount = candidates.filter(c => ['Interview Scheduled', 'Interview Done', 'Offer Extended', 'Hired'].includes(c.external_status || c.internal_status)).length

  const fetchDashboardData = () => {
    Promise.all([
      db.from('jobs').select('*').order('created_at', { ascending: false }),
      db.from('callbacks').select('*').order('date', { ascending: true }),
      db.from('followups').select('*').order('date', { ascending: true }),
      db.from('profiles').select('*').order('full_name'),
    ]).then(([jobsRes, callbacksRes, followupsRes, profilesRes]) => {
      setJobs(jobsRes.data || [])
      setCallbacks(callbacksRes.data || [])
      setFollowups(followupsRes.data || [])
      setProfiles(profilesRes.data || [])
    }).catch(err => {
      console.error('Failed to fetch dashboard data:', err)
    })
  }

  useEffect(() => {
    fetchDashboardData()
  }, [])

  // Dedicated CRM Action Executor conforming to Prisma/REST API 4-step pattern
  const executeCrmOperation = async (pendingAction) => {
    const { type, entityId, entityName, params, successMessage } = pendingAction || {}
    const searchName = (entityName || '').toLowerCase().trim()

    try {
      if (type === 'close_job' || type === 'archive_job') {
        let targetJobs = []
        if (entityId) {
          targetJobs = safeJobs.filter(j => String(j.id) === String(entityId))
        } else if (searchName && searchName !== 'all' && searchName !== 'all open jobs' && searchName !== 'active jobs') {
          targetJobs = safeJobs.filter(j => (j.title || '').toLowerCase().includes(searchName))
        } else {
          targetJobs = safeJobs.filter(j => j.status === 'Open')
        }

        if (!targetJobs.length) {
          return { success: false, error: `The specified job requisition could not be found.` }
        }

        for (const job of targetJobs) {
          const res = await db.from('jobs').update({ status: 'Closed' }).eq('id', job.id)
          if (res.error) throw res.error
        }
        fetchDashboardData()

        return {
          success: true,
          message: successMessage || `Requisition updated to Closed.`,
          actionTitle: 'Job Requisition Closed',
          actionEntityName: targetJobs.map(j => j.title).join(', '),
          updatedEntity: targetJobs
        }

      } else if (type === 'reopen_job') {
        let targetJobs = []
        if (entityId) {
          targetJobs = safeJobs.filter(j => String(j.id) === String(entityId))
        } else if (searchName) {
          targetJobs = safeJobs.filter(j => (j.title || '').toLowerCase().includes(searchName))
        } else {
          targetJobs = safeJobs.filter(j => j.status === 'Closed' || j.status === 'On Hold')
        }

        if (!targetJobs.length) {
          return { success: false, error: `The selected closed job could not be found.` }
        }

        for (const job of targetJobs) {
          const res = await db.from('jobs').update({ status: 'Open' }).eq('id', job.id)
          if (res.error) throw res.error
        }
        fetchDashboardData()

        return {
          success: true,
          message: successMessage || `Requisition status updated to Open.`,
          actionTitle: 'Job Requisition Reopened',
          actionEntityName: targetJobs.map(j => j.title).join(', '),
          updatedEntity: targetJobs
        }

      } else if (type === 'update_candidate_stage' || type === 'schedule_interview' || type === 'archive_candidate' || type === 'assign_recruiter') {
        let targetCandidates = []
        if (entityId) {
          targetCandidates = candidates.filter(c => String(c.id) === String(entityId))
        } else if (searchName) {
          targetCandidates = candidates.filter(c =>
            `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase().includes(searchName) ||
            (c.email && c.email.toLowerCase().includes(searchName))
          )
        }

        if (!targetCandidates.length && candidates.length > 0) {
          targetCandidates = [candidates[0]]
        }

        if (!targetCandidates.length) {
          return { success: false, error: `The requested candidate record could not be found.` }
        }

        let targetStage = params?.stage
        if (!targetStage) {
          if (type === 'schedule_interview') targetStage = 'Interview Scheduled'
          else if (type === 'archive_candidate') targetStage = 'Rejected'
          else targetStage = 'Screening'
        }

        for (const candidate of targetCandidates) {
          const updateData = { internal_status: targetStage, external_status: targetStage }
          if (params?.recruiter_name) updateData.recruiter_name = params.recruiter_name
          const res = await db.from('candidates').update(updateData).eq('id', candidate.id)
          if (res.error) throw res.error
        }
        fetchDashboardData()

        return {
          success: true,
          message: successMessage || `Candidate stage updated to ${targetStage}.`,
          actionTitle: 'Candidate Stage Updated',
          actionEntityName: targetCandidates.map(c => `${c.first_name || ''} ${c.last_name || ''}`).join(', '),
          updatedEntity: targetCandidates
        }

      } else if (type === 'delete_candidate' || type === 'remove_candidate') {
        let targetCandidates = []
        if (entityId) {
          targetCandidates = candidates.filter(c => String(c.id) === String(entityId))
        } else if (searchName) {
          targetCandidates = candidates.filter(c =>
            `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase().includes(searchName) ||
            (c.email && c.email.toLowerCase().includes(searchName))
          )
        }

        if (!targetCandidates.length) {
          return { success: false, error: `The candidate record "${entityName || 'specified'}" could not be found.` }
        }

        for (const candidate of targetCandidates) {
          const res = await db.from('candidates').delete().eq('id', candidate.id)
          if (res.error) throw res.error
        }
        fetchDashboardData()

        return {
          success: true,
          message: successMessage || `Candidate record permanently removed.`,
          actionTitle: 'Candidate Removed',
          actionEntityName: targetCandidates.map(c => `${c.first_name || ''} ${c.last_name || ''}`).join(', '),
          updatedEntity: null
        }

      } else if (type === 'delete_job' || type === 'remove_job') {
        let targetJobs = []
        if (entityId) {
          targetJobs = safeJobs.filter(j => String(j.id) === String(entityId))
        } else if (searchName) {
          targetJobs = safeJobs.filter(j => (j.title || '').toLowerCase().includes(searchName))
        }

        if (!targetJobs.length) {
          return { success: false, error: `The job requisition "${entityName || 'specified'}" could not be found.` }
        }

        for (const job of targetJobs) {
          const res = await db.from('jobs').delete().eq('id', job.id)
          if (res.error) throw res.error
        }
        fetchDashboardData()

        return {
          success: true,
          message: successMessage || `Job requisition permanently deleted.`,
          actionTitle: 'Job Requisition Deleted',
          actionEntityName: targetJobs.map(j => j.title).join(', '),
          updatedEntity: null
        }

      } else if (type === 'hold_job' || type === 'fill_job') {
        const newStatus = type === 'hold_job' ? 'On Hold' : 'Filled'
        let targetJobs = safeJobs.filter(j => (j.title || '').toLowerCase().includes(searchName))
        if (!targetJobs.length && safeJobs.length > 0) targetJobs = [safeJobs[0]]

        for (const job of targetJobs) {
          const res = await db.from('jobs').update({ status: newStatus }).eq('id', job.id)
          if (res.error) throw res.error
        }
        fetchDashboardData()

        return {
          success: true,
          message: `Job requisition status updated to ${newStatus}.`,
          actionTitle: `Job Requisition Updated`,
          actionEntityName: targetJobs.map(j => j.title).join(', '),
          updatedEntity: targetJobs
        }

      } else if (type === 'add_candidate' || type === 'create_candidate') {
        const nameParts = (params?.name || entityName || 'New Candidate').split(' ')
        const firstName = nameParts[0] || 'New'
        const lastName = nameParts.slice(1).join(' ') || 'Candidate'

        const newCand = {
          first_name: firstName,
          last_name: lastName,
          email: params?.email || `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
          job_title: params?.job_title || 'Software Developer',
          client: params?.client || 'Internal Client',
          internal_status: params?.stage || 'Submitted',
          external_status: params?.stage || 'Submitted',
          submission_date: new Date().toISOString().slice(0, 10),
          recruiter_name: profile?.full_name || 'AI Copilot'
        }

        const res = await db.from('candidates').insert([newCand]).select()
        if (res.error) throw res.error
        fetchDashboardData()

        return {
          success: true,
          message: `Candidate ${firstName} ${lastName} added successfully.`,
          actionTitle: 'Candidate Added',
          actionEntityName: `${firstName} ${lastName}`,
          updatedEntity: res.data ? res.data[0] : newCand
        }

      } else if (type === 'complete_callback' || type === 'delete_callback') {
        let cb = safeCallbacks.find(c => (c.candidate_name || '').toLowerCase().includes(searchName))
        if (!cb && safeCallbacks.length > 0) cb = safeCallbacks[0]

        if (cb) {
          if (type === 'complete_callback') {
            await db.from('callbacks').update({ status: 'done' }).eq('id', cb.id)
          } else {
            await db.from('callbacks').delete().eq('id', cb.id)
          }
          fetchDashboardData()
        }

        return {
          success: true,
          message: type === 'complete_callback' ? 'Callback marked as completed.' : 'Callback removed.',
          actionTitle: 'Callback Updated',
          actionEntityName: searchName || 'Candidate Callback',
          updatedEntity: null
        }

      } else if (type === 'create_followup' || type === 'complete_followup' || type === 'delete_followup') {
        if (type === 'create_followup') {
          await db.from('followups').insert({
            title: entityName || 'Follow up with candidate',
            date: new Date().toISOString().slice(0, 10),
            status: 'pending'
          })
        } else if (type === 'complete_followup' && safeFollowups.length > 0) {
          await db.from('followups').update({ status: 'done' }).eq('id', safeFollowups[0].id)
        } else if (type === 'delete_followup' && safeFollowups.length > 0) {
          await db.from('followups').delete().eq('id', safeFollowups[0].id)
        }
        fetchDashboardData()

        return {
          success: true,
          message: 'Follow-up task updated successfully.',
          actionTitle: 'Follow-up Updated',
          actionEntityName: entityName || 'Follow-up',
          updatedEntity: null
        }

      } else if (type === 'create_task' || type === 'create_note') {
        const taskText = params?.text || entityName || 'New Recruiter Task'
        const newNote = {
          id: Date.now(),
          text: taskText,
          done: false,
          tag: params?.tag || 'Follow-up',
          priority: 'High',
          candidate: 'Recruiter Task',
          job: 'General'
        }
        setDailyNotes(prev => {
          const updated = [newNote, ...prev]
          if (profile) localStorage.setItem(`${storagePrefix}_daily_notes`, JSON.stringify(updated))
          return updated
        })

        return {
          success: true,
          message: successMessage || `New task created.`,
          actionTitle: 'Task Created Successfully',
          actionEntityName: taskText,
          updatedEntity: newNote
        }

      } else if (type === 'log_callback') {
        const candidateName = params?.candidateName || entityName || 'Candidate'
        const res = await db.from('callbacks').insert({
          candidate_name: candidateName,
          date: new Date().toISOString().slice(0, 10),
          status: 'pending'
        })
        if (res.error) throw res.error
        fetchDashboardData()

        return {
          success: true,
          message: successMessage || `Scheduled callback logged.`,
          actionTitle: 'Callback Logged Successfully',
          actionEntityName: candidateName,
          updatedEntity: { candidate_name: candidateName }
        }

      } else if (type === 'create_job' || type === 'post_job' || type === 'add_job') {
        const jobTitle = params?.title || entityName || 'New Job Requisition'
        const newJobData = {
          job_id: params?.job_id || `JOB-${Math.floor(100 + Math.random() * 900)}`,
          title: jobTitle,
          client: params?.client || 'Internal Client',
          location: params?.location || 'Remote',
          type: params?.type || 'Full-time',
          status: params?.status || 'Open',
          rate: params?.rate || 'Competitive',
          open_date: params?.open_date || new Date().toISOString().slice(0, 10),
          priority: params?.priority || 'Medium',
          fe: params?.fe || profile?.full_name || 'AI Copilot',
          description: params?.description || `Posted via AI Action Copilot`,
          user_id: authContext?.user?.id
        }

        const res = await db.from('jobs').insert([newJobData]).select()
        if (res.error) throw res.error
        fetchDashboardData()

        return {
          success: true,
          message: successMessage || `Job requisition "${jobTitle}" posted successfully.`,
          actionTitle: 'Job Requisition Posted',
          actionEntityName: jobTitle,
          updatedEntity: res.data ? res.data[0] : newJobData
        }

      } else if (type === 'delete_note') {
        let deleted = false
        if (entityId) {
          handleDeleteNote(Number(entityId))
          deleted = true
        } else if (dailyNotes.length > 0) {
          handleDeleteNote(dailyNotes[0].id)
          deleted = true
        }

        if (!deleted) {
          return { success: false, error: 'No matching tasks found to remove.' }
        }

        return {
          success: true,
          message: successMessage || 'Task removed successfully.',
          actionTitle: 'Task Removed',
          actionEntityName: 'Recruiter Mission Checklist',
          updatedEntity: null
        }
      } else {
        return { success: true, message: successMessage || 'Operation completed.', actionTitle: 'Action Executed', updatedEntity: null }
      }
    } catch (err) {
      console.error('CRM operation error:', err)
      return { success: false, error: 'Unable to complete the operation right now. Please try again in a few moments.' }
    }
  }

  // Execute Action Call Handler
  const handleExecutePendingAction = async (pendingAction, messageIndex) => {
    if (!pendingAction) return

    const result = await executeCrmOperation(pendingAction)

    if (result.success) {
      setCopilotMessages(prev => prev.map((msg, idx) => {
        if (idx === messageIndex) {
          return {
            ...msg,
            actionExecuted: true,
            actionTitle: result.actionTitle || 'CRM Operation Executed',
            actionEntityName: result.actionEntityName || '',
            content: {
              ...(typeof msg.content === 'object' ? msg.content : {}),
              summary: `✅ ${result.message}`,
              pendingAction: null,
            }
          }
        }
        return msg
      }))
    } else {
      setCopilotMessages(prev => [
        ...prev,
        {
          sender: 'ai',
          text: `❌ ${result.error}`,
          content: {
            summary: `❌ ${result.error}`,
          },
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ])
    }
  }

  const handleCancelPendingAction = (messageIndex) => {
    setCopilotMessages(prev => prev.map((msg, idx) => {
      if (idx === messageIndex) {
        return {
          ...msg,
          actionCancelled: true,
          content: {
            ...(typeof msg.content === 'object' ? msg.content : {}),
            summary: 'Operation cancelled.',
            pendingAction: null,
          }
        }
      }
      return msg
    }))
  }

  // Handle Action Button Clicks from Copilot Chat Cards
  const handleCopilotAction = (actionKey, label) => {
    if (!actionKey) return
    if (actionKey === 'open_candidates' || actionKey.includes('candidate')) {
      onNavigate && onNavigate('candidates')
    } else if (actionKey === 'open_jobs' || actionKey.includes('job')) {
      onNavigate && onNavigate('jobs')
    } else if (actionKey === 'open_pipeline' || actionKey.includes('pipeline')) {
      onNavigate && onNavigate('pipeline')
    } else if (actionKey === 'open_callbacks' || actionKey.includes('call')) {
      onNavigate && onNavigate('callbacks')
    } else if (actionKey.includes('followup') || actionKey.includes('email')) {
      handleCopilotSend(`Draft follow-up email for ${label || 'candidate'}`)
    } else {
      handleCopilotSend(label)
    }
  }

  // Handle Floating Copilot Command Execution with Structured AI Reasoning & Action Payload Detection
  const handleCopilotSend = async (userPromptText) => {
    const q = (userPromptText || copilotQuery).trim()
    if (!q || copilotLoading) return
    setCopilotQuery('')
    setCopilotState('expanded')

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    if ((authContext.organization?.subscription_plan || 'Growth') === 'Starter') {
      setCopilotMessages(prev => [
        ...prev,
        { sender: 'user', text: q, timestamp: timeStr },
        {
          sender: 'ai',
          text: '⚡ TalentDesk AI Action Copilot requires Growth or Enterprise Plan. Please upgrade under Organization Settings to unlock automated CRM actions & Copilot controls.',
          content: {
            summary: '⚡ TalentDesk AI Action Copilot requires Growth or Enterprise Plan. Please upgrade under Organization Settings to unlock automated CRM actions & Copilot controls.',
          },
          timestamp: timeStr
        }
      ])
      return
    }
    const newMsg = { sender: 'user', text: q, timestamp: timeStr }
    setCopilotMessages(prev => [...prev, newMsg])
    setCopilotLoading(true)

    const openJobsCount = safeJobs.filter(j => j.status === 'Open').length
    const candidateContextList = candidates.slice(0, 100).map(c => {
      const profileMatch = safeProfiles.find(p => p.id === c.user_id || p.id === c.recruiter_id)
      const recruiter = c.recruiter_name || c.fe_name || profileMatch?.full_name || profileMatch?.name || profileMatch?.email || 'Unassigned Recruiter'
      return {
        id: c.id,
        name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
        recruiter: recruiter,
        job: c.job_title || 'N/A',
        client: c.client || 'N/A',
        stage: c.internal_status || c.external_status || 'Submitted',
        submitted_date: c.submission_date || 'N/A'
      }
    })
    const jobContextList = safeJobs.slice(0, 100).map(j => ({
      id: j.id,
      job_id: j.job_id,
      title: j.title,
      client: j.client,
      location: j.location,
      type: j.type,
      status: j.status,
      rate: j.rate,
      owner: j.fe || 'Unassigned'
    }))

    // Build session conversation history so pronouns ("it", "reopen it", "that candidate") resolve cleanly
    const historyContext = copilotMessages
      .slice(-6)
      .map(m => `${m.sender === 'user' ? 'Recruiter' : 'Copilot'}: ${m.text || m.content?.summary || ''}`)
      .join('\n')

    const prompt = `You are the TalentDesk AI Action Copilot, an intelligent recruiting controller inspired by ChatGPT and Cursor.

RECENT CONVERSATION HISTORY (Session Context):
${historyContext}

CONVERSATIONAL & FORMATTING RULES:
1. Provide a direct, concise 1-2 sentence answer in "summary".
2. DO NOT include "snapshot", "insight", or "nextBestAction" unless the user explicitly asks an analytical/metric question (e.g., "What is our pipeline status?", "Show snapshot") or asks for recommendations. For simple questions or action triggers, omit these extra fields or set them to null.
3. Use the Recent Conversation History to resolve implicit references like "it", "reopen it", "that job", or "schedule him".
4. When asked which recruiter submitted a candidate, search the Available Candidates context array below. Every candidate has a "recruiter" field specifying who submitted them.

RULES FOR REQUEST CLASSIFICATION:

1. ACTION REQUESTS:
Detect if the user wants to perform an operation such as:
- Post / Create Job ("post job Software Developer in New York", "add job React Engineer rate $90/hr", "create job requisition for DevOps Lead")
- Close Job ("close senior react developer", "close job #1", "close it")
- Reopen Job ("reopen lead devops", "reopen it")
- Create Task / Add Note ("remind me to call Alex tomorrow", "add task review submittals")
- Log Callback ("log callback for Sarah Jenkins")
- Update Candidate Stage / Schedule Interview ("move Alex Rivera to Interview stage", "schedule interview for Sarah")
- Delete Task / Note ("delete note #1")

For Action Requests, set isAction = true and populate pendingAction:
{
  "summary": "Short explanation of the requested operation.",
  "isAction": true,
  "pendingAction": {
    "type": "create_job | close_job | reopen_job | create_task | log_callback | update_candidate_stage | delete_note",
    "entity": "job | candidate | callback | task",
    "entityId": "matched_id_string_or_null",
    "entityName": "name_or_title_or_text",
    "params": { "title": "Job Title", "client": "Client Name", "location": "City/Remote", "type": "Full-time", "status": "Open", "rate": "$ salary or rate", "priority": "High", "description": "Job details", "stage": "Interview Scheduled", "text": "description" },
    "requiresConfirmation": true,
    "confirmTitle": "Confirmation Required Title",
    "confirmPrompt": "Clear prompt asking user if they want to execute this operation.",
    "successMessage": "Action completed successfully."
  },
  "snapshot": null,
  "insight": null,
  "nextBestAction": null,
  "actions": [ { "label": "Confirm Action", "action": "confirm_action" } ],
  "followup": "Would you like me to notify team members?"
}

2. INFORMATIONAL / ANALYTICAL REQUESTS:
For questions, analytics, candidate submittal inquiries, or search queries, set isAction = false, pendingAction = null.

User Question: "${q}"
Available Candidates: ${JSON.stringify(candidateContextList)}
Available Jobs: ${JSON.stringify(jobContextList)}
Workspace Metrics: Candidates (${candidates.length}), Active Jobs (${openJobsCount}), Callbacks (${safeCallbacks.length}), Qualified (${qualifiedCount}).`

    try {
      const data = await apiRequest('/ai/generate', {
        method: 'POST',
        body: { prompt, toolId: 'copilot' }
      })

      const rawReply = data?.text || ''
      let structuredContent = null

      try {
        const cleanJsonText = rawReply.replace(/```json\s*|\s*```/g, '').trim()
        structuredContent = JSON.parse(cleanJsonText)
      } catch (parseErr) {
        const cleanText = rawReply.replace(/```|\*\*|###|---/g, '').trim()
        const lowerQ = q.toLowerCase()

        let fallbackAction = null
        if (lowerQ.includes('close job') || lowerQ.includes('archive job')) {
          const targetTitle = q.replace(/close job|archive job/gi, '').trim()
          fallbackAction = {
            type: 'close_job',
            entity: 'job',
            entityName: targetTitle || 'specified job',
            requiresConfirmation: true,
            confirmTitle: 'Confirm Closing Job Requisition',
            confirmPrompt: `Are you sure you want to change the status of "${targetTitle || 'selected job'}" to Closed?`,
            successMessage: `Requisition "${targetTitle || 'selected job'}" closed.`
          }
        } else if (lowerQ.includes('delete candidate') || lowerQ.includes('remove candidate')) {
          const candName = q.replace(/delete candidate|remove candidate/gi, '').trim()
          fallbackAction = {
            type: 'delete_candidate',
            entity: 'candidate',
            entityName: candName || 'specified candidate',
            requiresConfirmation: true,
            confirmTitle: 'Confirm Candidate Deletion',
            confirmPrompt: `Are you sure you want to permanently delete candidate record "${candName || 'selected candidate'}"?`,
            successMessage: `Candidate record for "${candName || 'selected candidate'}" permanently removed.`
          }
        } else if (lowerQ.includes('delete job') || lowerQ.includes('remove job')) {
          const targetTitle = q.replace(/delete job|remove job/gi, '').trim()
          fallbackAction = {
            type: 'delete_job',
            entity: 'job',
            entityName: targetTitle || 'specified job',
            requiresConfirmation: true,
            confirmTitle: 'Confirm Job Deletion',
            confirmPrompt: `Are you sure you want to permanently delete job requisition "${targetTitle || 'selected job'}"?`,
            successMessage: `Job requisition "${targetTitle || 'selected job'}" deleted.`
          }
        } else if (lowerQ.includes('schedule callback') || lowerQ.includes('log callback')) {
          const candName = q.replace(/schedule callback for|log callback for|schedule callback|log callback/gi, '').trim()
          fallbackAction = {
            type: 'log_callback',
            entity: 'callback',
            entityName: candName || 'Candidate',
            requiresConfirmation: false,
            successMessage: `Scheduled callback logged for ${candName || 'Candidate'}.`
          }
        } else if (lowerQ.includes('move candidate') || lowerQ.includes('to offer extended') || lowerQ.includes('to interview') || lowerQ.includes('to rejected')) {
          const candMatch = q.match(/candidate\s+([A-Za-z\s]+?)\s+to/i) || q.match(/move\s+([A-Za-z\s]+?)\s+to/i)
          const candName = candMatch ? candMatch[1].trim() : 'Candidate'
          let stage = 'Screening'
          if (lowerQ.includes('offer')) stage = 'Offer Extended'
          else if (lowerQ.includes('interview')) stage = 'Interview Scheduled'
          else if (lowerQ.includes('reject')) stage = 'Rejected'
          else if (lowerQ.includes('hired')) stage = 'Hired'

          fallbackAction = {
            type: 'update_candidate_stage',
            entity: 'candidate',
            entityName: candName,
            params: { stage },
            requiresConfirmation: true,
            confirmTitle: 'Confirm Candidate Stage Update',
            confirmPrompt: `Move candidate "${candName}" to ${stage}?`,
            successMessage: `Candidate "${candName}" moved to ${stage}.`
          }
        }

        structuredContent = {
          summary: fallbackAction ? `I have prepared your request: "${q}". Please review and confirm below.` : (cleanText || `Here is your Copilot response for "${q}".`),
          isAction: !!fallbackAction,
          pendingAction: fallbackAction,
          snapshot: null,
          insight: null,
          nextBestAction: null,
          actions: fallbackAction ? [{ label: "Confirm Action", action: "confirm_action" }] : [],
          followup: null
        }
      }

      setCopilotMessages(prev => {
        const targetIdx = prev.length
        const newAiMsg = {
          sender: 'ai',
          text: structuredContent.summary || 'Copilot response',
          content: structuredContent,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }

        // Ensure all actions require explicit user confirmation click before database execution
        if (structuredContent.isAction && structuredContent.pendingAction) {
          structuredContent.pendingAction.requiresConfirmation = true
        }

        return [...prev, newAiMsg]
      })

    } catch (err) {
      setCopilotMessages(prev => [
        ...prev,
        {
          sender: 'ai',
          text: `Unable to process request right now. Please try again in a few moments.`,
          content: {
            summary: `Unable to process request right now. Please try again in a few moments.`,
          },
          timestamp: timeStr
        }
      ])
    } finally {
      setCopilotLoading(false)
    }
  }

  useEffect(() => {
    if (!showOwnerDropdown) {
      setRecruiterSearch('')
      return
    }
    const close = (e) => {
      if (recruiterBtnRef.current && recruiterBtnRef.current.contains(e.target)) return
      setShowOwnerDropdown(false)
    }
    const t = setTimeout(() => document.addEventListener('mousedown', close), 50)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', close) }
  }, [showOwnerDropdown])

  const [jobStatusFilter, setJobStatusFilter] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [scratchpad, setScratchpad] = useState('')
  const [lastSavedTime, setLastSavedTime] = useState('Auto-saved')

  const handleScratchpadChange = (e) => {
    const val = e.target.value
    setScratchpad(val)
    if (profile) localStorage.setItem(`${storagePrefix}_scratchpad`, val)
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    setLastSavedTime(`Saved ${now}`)
  }

  const handleCompleteCallback = async (id) => {
    try {
      const { error } = await db.from('callbacks').update({ status: 'done' }).eq('id', id)
      if (!error) {
        setCallbacks(prev => (prev || []).map(c => c.id === id ? { ...c, status: 'done' } : c))
      }
    } catch (err) {
      console.error('Error completing callback:', err)
    }
  }

  const handleCompleteFollowup = async (id) => {
    try {
      const { error } = await db.from('followups').update({ status: 'done' }).eq('id', id)
      if (!error) {
        setFollowups(prev => (prev || []).map(f => f.id === id ? { ...f, status: 'done' } : f))
      }
    } catch (err) {
      console.error('Error completing followup:', err)
    }
  }

  const today = new Date().toISOString().slice(0, 10)

  // Filtered Candidate List
  const filteredCandidates = useMemo(() => {
    let list = candidates
    if (timeRange !== 'all') {
      const cutoff = new Date()
      if (timeRange === '7d') cutoff.setDate(cutoff.getDate() - 7)
      else if (timeRange === '30d') cutoff.setDate(cutoff.getDate() - 30)
      else if (timeRange === '90d') cutoff.setDate(cutoff.getDate() - 90)

      const cutoffStr = cutoff.toISOString().slice(0, 10)
      list = list.filter(c => c.submission_date && c.submission_date >= cutoffStr)
    }
    if (stageFilter !== 'All') list = list.filter(c => (c.external_status || c.internal_status || 'Unassigned') === stageFilter)
    if (selectedOwners.length > 0) {
      list = list.filter(c => {
        const key = c.recruiter_id || c.user_id || c.recruiter_name || c.fe_name || 'Unassigned'
        return selectedOwners.includes(key)
      })
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      list = list.filter(c =>
        `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase().includes(q) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.job_title && c.job_title.toLowerCase().includes(q)) ||
        (c.client && c.client.toLowerCase().includes(q)) ||
        (c.recruiter_name && c.recruiter_name.toLowerCase().includes(q)) ||
        (c.fe_name && c.fe_name.toLowerCase().includes(q))
      )
    }
    return list
  }, [candidates, selectedOwners, stageFilter, timeRange, searchQuery])

  // Dynamic Today's Focus calculation from live database state
  const todaysFocus = useMemo(() => {
    const activeCallbacks = safeCallbacks.filter(c => c.status === 'pending')
    if (activeCallbacks && activeCallbacks.length > 0) {
      const cb = activeCallbacks[0]
      return {
        title: `Follow up with ${cb.candidate_name || 'Candidate'}`,
        desc: `Scheduled callback for ${cb.date || 'today'}.`
      }
    }
    if (candidates && candidates.length > 0) {
      const c = candidates.find(item => ['Offer Extended', 'Interview Scheduled', 'Interview Done', 'Submitted', 'Screening'].includes(item.internal_status || item.external_status)) || candidates[0]
      const name = `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Candidate'
      const role = c.job_title || 'open requisition'
      const stage = c.internal_status || c.external_status || 'In Progress'
      return {
        title: `Follow up with ${name}`,
        desc: `${role} - ${stage} stage.`
      }
    }
    return {
      title: 'Review Active Requisitions',
      desc: 'All candidate callbacks and pipeline tasks are up to date.'
    }
  }, [safeCallbacks, candidates])

  const filteredJobs = useMemo(() => {
    let list = safeJobs
    if (jobStatusFilter !== 'All') list = list.filter(job => (job.status || 'Unassigned') === jobStatusFilter)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      list = list.filter(j =>
        (j.title && j.title.toLowerCase().includes(q)) ||
        (j.client && j.client.toLowerCase().includes(q)) ||
        (j.job_id && j.job_id.toLowerCase().includes(q))
      )
    }
    return list
  }, [jobStatusFilter, safeJobs, searchQuery])

  const ownerOptions = useMemo(() => {
    const owners = new Map()
    safeProfiles.forEach(user => {
      if (user) {
        const id = user.id || user.full_name || user.email
        const name = user.full_name || user.name || user.email
        if (id && name) owners.set(id, name)
      }
    })
    candidates.forEach(candidate => {
      const key = candidate.recruiter_id || candidate.user_id || candidate.recruiter_name || candidate.fe_name
      const label = candidate.recruiter_name || candidate.fe_name || (key && owners.get(key))
      if (key && label) owners.set(key, label)
    })
    if (owners.size === 0) {
      ;['Varun T.', 'Sarah K.', 'Mike R.', 'Alex M.', 'Jessica T.'].forEach(name => {
        owners.set(name, name)
      })
    }
    return [...owners.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [candidates, safeProfiles])

  const filteredRecruiterOptions = useMemo(() => {
    if (!recruiterSearch) return ownerOptions
    const q = recruiterSearch.toLowerCase()
    return ownerOptions.filter(opt => opt[1].toLowerCase().includes(q))
  }, [ownerOptions, recruiterSearch])

  const selectedOwnerNamesStr = useMemo(() => {
    if (selectedOwners.length === 0) return ''
    return selectedOwners.map(id => {
      const match = ownerOptions.find(([optId]) => optId === id)
      return match ? match[1] : id
    }).join(', ')
  }, [selectedOwners, ownerOptions])


  const stageOptions = useMemo(() => {
    const stages = new Set(['All', ...STAGES])
    candidates.forEach(candidate => {
      if (candidate.external_status) stages.add(candidate.external_status)
      else if (candidate.internal_status) stages.add(candidate.internal_status)
    })
    return [...stages]
  }, [candidates])

  const jobStatusOptions = useMemo(() => {
    const statuses = new Set(['All'])
    safeJobs.forEach(job => statuses.add(job.status || 'Unassigned'))
    return [...statuses]
  }, [safeJobs])

  const filteredFollowups = useMemo(() => {
    if (timeRange === 'all') return safeFollowups
    const cutoff = new Date()
    if (timeRange === '7d') cutoff.setDate(cutoff.getDate() - 7)
    else if (timeRange === '30d') cutoff.setDate(cutoff.getDate() - 30)
    else if (timeRange === '90d') cutoff.setDate(cutoff.getDate() - 90)

    const cutoffStr = cutoff.toISOString().slice(0, 10)
    return safeFollowups.filter(f => f.date && f.date >= cutoffStr)
  }, [safeFollowups, timeRange])

  const thisWeekCount = useMemo(() => {
    const from = new Date(); from.setDate(from.getDate() - 7)
    return candidates.filter(c => c.submission_date && c.submission_date >= from.toISOString().slice(0, 10)).length
  }, [candidates])

  // Pipeline Stage Distribution with avg days & drop-off metrics
  const pipelineData = useMemo(() => {
    const avgDaysMap = { 'Submitted': 2, 'Screening': 3, 'Interview Scheduled': 5, 'Client Review': 4, 'Offer Extended': 2, 'Hired': 14, 'Rejected': 6 }
    const dropOffMap = { 'Submitted': '8%', 'Screening': '12%', 'Interview Scheduled': '15%', 'Client Review': '10%', 'Offer Extended': '4%', 'Hired': '0%', 'Rejected': '100%' }
    return STAGES.map((stage, index) => {
      const count = filteredCandidates.filter(c => c.external_status === stage || c.internal_status === stage).length
      return {
        stage: stage.replace('Interview ', ''),
        rawStage: stage,
        count,
        color: COLORS[index],
        pct: Math.round((count / Math.max(filteredCandidates.length, 1)) * 100),
        avgDays: avgDaysMap[stage] || 3,
        dropOff: dropOffMap[stage] || '5%',
      }
    })
  }, [filteredCandidates])

  const recruiterData = useMemo(() => {
    const byName = new Map()
    filteredCandidates.forEach(candidate => {
      const name = candidate.recruiter_name || candidate.fe_name || 'Unassigned'
      const current = byName.get(name) || { name, submissions: 0, hires: 0, interviews: 0, offers: 0 }
      current.submissions += 1
      if (candidate.internal_status === 'Hired' || candidate.external_status === 'Hired') current.hires += 1
      if (['Interview Scheduled', 'Interview Done'].includes(candidate.internal_status || candidate.external_status)) current.interviews += 1
      if (candidate.internal_status === 'Offer Extended' || candidate.external_status === 'Offer Extended') current.offers += 1
      byName.set(name, current)
    })
    const sortedList = [...byName.values()].sort((a, b) => {
      if (b.hires !== a.hires) return b.hires - a.hires
      if (b.submissions !== a.submissions) return b.submissions - a.submissions
      return b.interviews - a.interviews
    }).slice(0, 6)
    const maxSubmissions = sortedList.length > 0 ? Math.max(...sortedList.map(s => s.submissions)) : 1
    return sortedList.map((item, idx) => ({
      ...item,
      rank: idx + 1,
      fillRate: Math.min(Math.round((item.hires / Math.max(item.submissions, 1)) * 100), 100),
      qualityScore: Math.min(Math.round(((item.interviews + item.hires * 2) / Math.max(item.submissions, 1)) * 100), 99),
      aiScore: Math.min(92 + (5 - idx), 99),
      percentage: Math.round((item.submissions / maxSubmissions) * 100),
    }))
  }, [filteredCandidates])

  // User-driven column sort layered on top of the default rank ordering above
  const sortedRecruiterData = useMemo(() => {
    if (!tableSortKey) return recruiterData
    const copy = [...recruiterData]
    copy.sort((a, b) => {
      const av = a[tableSortKey]
      const bv = b[tableSortKey]
      if (typeof av === 'string') return tableSortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return tableSortDir === 'asc' ? av - bv : bv - av
    })
    return copy
  }, [recruiterData, tableSortKey, tableSortDir])

  const handleTableSort = (key) => {
    if (tableSortKey === key) {
      setTableSortDir(prev => (prev === 'desc' ? 'asc' : 'desc'))
    } else {
      setTableSortKey(key)
      setTableSortDir('desc')
    }
  }

  // Same stage/owner/search filters as filteredCandidates, but not time-windowed —
  // needed to look further back for the trend chart's previous-period comparison.
  const candidatesForTrendComparison = useMemo(() => {
    let list = candidates
    if (stageFilter !== 'All') list = list.filter(c => (c.external_status || c.internal_status || 'Unassigned') === stageFilter)
    if (selectedOwners.length > 0) {
      list = list.filter(c => {
        const key = c.recruiter_id || c.user_id || c.recruiter_name || c.fe_name || 'Unassigned'
        return selectedOwners.includes(key)
      })
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      list = list.filter(c =>
        `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase().includes(q) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.job_title && c.job_title.toLowerCase().includes(q)) ||
        (c.client && c.client.toLowerCase().includes(q)) ||
        (c.recruiter_name && c.recruiter_name.toLowerCase().includes(q)) ||
        (c.fe_name && c.fe_name.toLowerCase().includes(q))
      )
    }
    return list
  }, [candidates, stageFilter, selectedOwners, searchQuery])

  const trendData = useMemo(() => {
    const rangeLength = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : timeRange === '90d' ? 90 : 7
    return [...Array(rangeLength)].map((_, index) => {
      const date = new Date()
      date.setDate(date.getDate() - (rangeLength - 1 - index))
      const key = date.toISOString().slice(0, 10)

      const prevDate = new Date(date)
      prevDate.setDate(prevDate.getDate() - rangeLength)
      const prevKey = prevDate.toISOString().slice(0, 10)

      return {
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        submissions: filteredCandidates.filter(c => c.submission_date === key).length,
        followups: filteredFollowups.filter(f => f.date === key).length,
        previousSubmissions: candidatesForTrendComparison.filter(c => c.submission_date === prevKey).length,
      }
    })
  }, [filteredCandidates, filteredFollowups, candidatesForTrendComparison, timeRange])

  const sourceData = useMemo(() => {
    return [
      { name: 'Open', value: filteredJobs.filter(j => j.status === 'Open').length },
      { name: 'On Hold', value: filteredJobs.filter(j => j.status === 'On Hold').length },
      { name: 'Filled', value: filteredJobs.filter(j => j.status === 'Filled').length },
      { name: 'Closed', value: filteredJobs.filter(j => j.status === 'Closed').length },
    ].filter(item => item.value > 0)
  }, [filteredJobs])

  const pendingCallbacks = safeCallbacks.filter(c => c.status === 'pending')
  const dueFollowups = safeFollowups.filter(f => f.status !== 'done')
  const todaysCallbacks = pendingCallbacks.filter(c => c.date === today)
  const overdueFollowups = dueFollowups.filter(f => f.date && f.date < today)

  const activeJobsCount = useMemo(() => filteredJobs.filter(j => j.status === 'Open').length, [filteredJobs])
  const offerCount = filteredCandidates.filter(c => c.external_status === 'Offer Extended' || c.internal_status === 'Offer Extended').length
  const rejectedCount = filteredCandidates.filter(c => c.external_status === 'Rejected' || c.internal_status === 'Rejected').length
  const hiredCount = filteredCandidates.filter(c => c.external_status === 'Hired' || c.internal_status === 'Hired').length
  const conversionRate = Math.round((hiredCount / Math.max(filteredCandidates.length, 1)) * 100)
  const pipelineHealthPct = Math.round((qualifiedCount / Math.max(filteredCandidates.length, 1)) * 100)

  // Top Priority Job Requisitions & Health Radar — derived from real candidate/job data.
  // Shared with the Job Workspace (src/lib/jobHealth.js) so a job's health is identical
  // wherever it's shown.
  const priorityJobs = useMemo(() => (
    safeJobs.slice(0, 4).map(job => ({ ...job, ...computeJobHealth(job, candidates) }))
  ), [safeJobs, candidates])

  // Real-time activity timeline feed — merged from real candidate/callback/followup
  // created_at timestamps (previously fabricated "Xh ago" strings), newest first.
  const activityFeed = useMemo(() => {
    const list = []
    candidates.forEach(c => {
      if (!c.created_at) return
      list.push({
        id: `c-${c.id}`,
        type: 'submission',
        title: `Submittal: ${c.first_name || 'Candidate'} ${c.last_name || ''}`.trim(),
        sub: `${c.job_title || 'Role'} · ${c.client || 'Client'}`,
        timestamp: c.created_at,
        actor: c.recruiter_name || c.fe_name || 'Recruiter',
      })
    })
    safeCallbacks.forEach(cb => {
      if (!cb.created_at) return
      list.push({
        id: `cb-${cb.id}`,
        type: 'callback',
        title: `Scheduled Call: ${cb.candidate_name || 'Candidate'}`,
        sub: `${cb.job || 'General'} · ${cb.time || 'Today'}`,
        timestamp: cb.created_at,
        actor: 'Recruiting Team',
      })
    })
    safeFollowups.forEach(f => {
      if (!f.created_at) return
      list.push({
        id: `f-${f.id}`,
        type: 'followup',
        title: `Follow-up logged: ${f.candidate_name || 'Candidate'}`,
        sub: `${f.type || 'Follow-up'} · ${f.priority || 'Normal'} priority`,
        timestamp: f.created_at,
        actor: 'Recruiting Team',
      })
    })
    return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 25)
  }, [candidates, safeCallbacks, safeFollowups])

  const filteredActivityFeed = useMemo(() => (
    activityFilter === 'all' ? activityFeed : activityFeed.filter(act => act.type === activityFilter)
  ), [activityFeed, activityFilter])

  const firstName = profile?.full_name?.split(' ')[0] || 'there'
  const dateStr = currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const timeStr = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  // Fetch Live AI Executive Briefing from backend
  // Migrated onto the shared AI Action Framework (Phase 5.4) — same
  // metrics, same output, now routed through runAiAction/'analyze' with
  // usage logging instead of a direct /ai/generate call.
  const fetchAiBriefing = async () => {
    setBriefingLoading(true)
    const content = `Workspace Recruitment Metrics Snapshot:
- Total Candidates: ${filteredCandidates.length}
- Qualified Candidates: ${qualifiedCount}
- Active Open Jobs: ${activeJobsCount}
- Offers Extended: ${offerCount}
- Hires Made: ${hiredCount}
- Placement Conversion Rate: ${conversionRate}%
- Pending Callbacks & Tasks: ${pendingCallbacks.length + dueFollowups.length} (${todaysCallbacks.length} scheduled today)
- Overdue Tasks: ${overdueFollowups.length}
- Top Recruiter: ${recruiterData[0]?.name || 'Team'} (${recruiterData[0]?.submissions || 0} submittals, ${recruiterData[0]?.hires || 0} hires)`
    const context = 'Provide a 2-3 sentence strategic executive briefing for the recruitment team. Highlight pipeline health, placement momentum, and 1 top priority action for today.'

    const startedAt = new Date().getTime()
    try {
      const res = await runAiAction({ action: 'analyze', content, context })
      if (res.success === false) throw new Error(res.error || 'Briefing failed.')
      setAiBriefingText(res.text)
      logUsageEvent(orgId, userId, { type: 'action', action: 'analyze', source: 'dashboard', success: true, provider: res.provider, model: res.model, durationMs: new Date().getTime() - startedAt, preview: res.text.slice(0, 140) })
    } catch (err) {
      console.warn('AI Briefing request failed:', err.message)
      logUsageEvent(orgId, userId, { type: 'action', action: 'analyze', source: 'dashboard', success: false, error: err.message, durationMs: new Date().getTime() - startedAt })
    } finally {
      setBriefingLoading(false)
    }
  }

  // Command Launcher quick actions — always searchable by label.
  // Not memoized: it closes over onNavigate/handleCopilotSend (recreated each
  // render like the rest of this component), and the list itself is tiny.
  const commandActionItems = [
    { type: 'action', title: 'New Candidate', meta: 'Action · Open candidates workspace', action: () => onNavigate && onNavigate('candidates') },
    { type: 'action', title: 'New Job', meta: 'Action · Open jobs workspace', action: () => onNavigate && onNavigate('jobs') },
    { type: 'action', title: 'Schedule Interview', meta: 'Action · Open candidates workspace', action: () => onNavigate && onNavigate('candidates') },
    { type: 'action', title: 'Log Callback', meta: 'Action · Open callbacks workspace', action: () => onNavigate && onNavigate('callbacks') },
    { type: 'action', title: 'AI Search Candidates', meta: 'Action · Ask AI Copilot', action: () => handleCopilotSend('Search top React candidates submitted this week') },
    { type: 'action', title: 'Generate Boolean String', meta: 'Action · Ask AI Copilot', action: () => handleCopilotSend('Generate precision Boolean search string for Senior React Developer') },
  ]

  // Filter Command Launcher Query Results — grouped by Candidates / Jobs / Actions.
  // Early-returns to [] whenever the palette is idle, so this stays cheap without useMemo.
  const commandResults = (() => {
    if (!commandQuery.trim()) return []
    const q = commandQuery.toLowerCase().trim()
    const list = []
    candidates.forEach(c => {
      if (`${c.first_name || ''} ${c.last_name || ''} ${c.email || ''} ${c.job_title || ''}`.toLowerCase().includes(q)) {
        list.push({ type: 'candidate', title: `${c.first_name} ${c.last_name}`, meta: `Candidate · ${c.job_title || 'Role'}`, action: () => onNavigate && onNavigate('candidates') })
      }
    })
    safeJobs.forEach(j => {
      if (`${j.title || ''} ${j.client || ''} ${j.job_id || ''}`.toLowerCase().includes(q)) {
        list.push({ type: 'job', title: j.title || 'Job', meta: `Job Requisition · ${j.client || 'Client'}`, action: () => onNavigate && onNavigate('jobs') })
      }
    })
    commandActionItems.forEach(item => {
      if (item.title.toLowerCase().includes(q)) list.push(item)
    })
    return list.slice(0, 8)
  })()

  const commandGroupLabel = { candidate: 'Candidates', job: 'Jobs', action: 'Actions' }

  const runCommandResult = (res) => {
    setCommandOpen(false)
    commitRecentSearch(commandQuery)
    res.action()
  }

  useEffect(() => {
    if (!commandOpen) return
    const handleNavKey = (e) => {
      if (commandResults.length === 0) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setCommandActiveIndex(prev => (prev + 1) % commandResults.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setCommandActiveIndex(prev => (prev - 1 + commandResults.length) % commandResults.length)
      } else if (e.key === 'Enter') {
        const target = commandResults[commandActiveIndex]
        if (target) {
          e.preventDefault()
          runCommandResult(target)
        }
      }
    }
    window.addEventListener('keydown', handleNavKey)
    return () => window.removeEventListener('keydown', handleNavKey)
  }, [commandOpen, commandResults, commandActiveIndex, commandQuery, runCommandResult])

  // Partition Mission Board tasks into pending & completed
  const pendingTasks = useMemo(() => dailyNotes.filter(n => !n.done), [dailyNotes])
  const completedTasks = useMemo(() => dailyNotes.filter(n => n.done), [dailyNotes])

  // Today's Recruiting Brief — derived from already-computed live metrics
  const atRiskCount = candidates.filter(c => ['Interview Scheduled', 'Interview Done'].includes(c.internal_status || c.external_status)).length
  const recommendedJob = safeJobs[0]
  const recommendedJobLabel = recommendedJob ? (recommendedJob.title || recommendedJob.job_id || 'Priority requisition') : 'Priority requisition'
  const pipelineHealthLabel = pipelineHealthPct >= 70 ? 'Healthy' : pipelineHealthPct >= 40 ? 'At Risk' : 'Critical'
  const estimatedWorkloadHours = Math.max(0.5, Math.round(((todaysCallbacks.length + overdueFollowups.length) * 0.25 + pendingTasks.length * 0.15) * 2) / 2)

  // Real period-over-period comparison (current window vs. the equivalent prior window),
  // same technique trendData already uses for the submissions chart — feeds KPI trend arrows
  // so they reflect actual data instead of hardcoded percentages.
  const periodComparison = useMemo(() => {
    const windowDays = timeRange === '30d' ? 30 : timeRange === '90d' ? 90 : 7
    const now = new Date()
    const currentStart = new Date(now); currentStart.setDate(currentStart.getDate() - windowDays)
    const currentStartStr = currentStart.toISOString().slice(0, 10)
    const prevStart = new Date(currentStart); prevStart.setDate(prevStart.getDate() - windowDays)
    const prevStartStr = prevStart.toISOString().slice(0, 10)
    const inCurrent = c => c.submission_date && c.submission_date >= currentStartStr
    const inPrevious = c => c.submission_date && c.submission_date >= prevStartStr && c.submission_date < currentStartStr
    const isQualified = c => ['Interview Scheduled', 'Interview Done', 'Offer Extended', 'Hired'].includes(c.external_status || c.internal_status)
    const isOffer = c => (c.external_status || c.internal_status) === 'Offer Extended'
    const isRejected = c => (c.external_status || c.internal_status) === 'Rejected'
    const jobDate = j => (j.open_date || j.created_at || '').slice(0, 10)

    return {
      total: { current: candidatesForTrendComparison.filter(inCurrent).length, previous: candidatesForTrendComparison.filter(inPrevious).length },
      qualified: { current: candidatesForTrendComparison.filter(c => inCurrent(c) && isQualified(c)).length, previous: candidatesForTrendComparison.filter(c => inPrevious(c) && isQualified(c)).length },
      offers: { current: candidatesForTrendComparison.filter(c => inCurrent(c) && isOffer(c)).length, previous: candidatesForTrendComparison.filter(c => inPrevious(c) && isOffer(c)).length },
      rejected: { current: candidatesForTrendComparison.filter(c => inCurrent(c) && isRejected(c)).length, previous: candidatesForTrendComparison.filter(c => inPrevious(c) && isRejected(c)).length },
      jobsOpened: {
        current: safeJobs.filter(j => jobDate(j) >= currentStartStr).length,
        previous: safeJobs.filter(j => jobDate(j) >= prevStartStr && jobDate(j) < currentStartStr).length,
      },
    }
  }, [candidatesForTrendComparison, safeJobs, timeRange])

  const stats = [
    { label: 'Total Candidates', value: filteredCandidates.length, helper: `+${thisWeekCount} this week`, icon: 'users', tone: 'accent', trend: computeTrend(periodComparison.total.current, periodComparison.total.previous) },
    { label: 'Qualified Pipeline', value: qualifiedCount, helper: `${filteredCandidates.length ? Math.round((qualifiedCount / filteredCandidates.length) * 100) : 0}% of total`, icon: 'checkCircle', tone: 'ai', trend: computeTrend(periodComparison.qualified.current, periodComparison.qualified.previous) },
    { label: 'Offers Extended', value: offerCount, helper: `${conversionRate}% placement rate`, icon: 'reports', tone: 'yellow', trend: computeTrend(periodComparison.offers.current, periodComparison.offers.previous) },
    { label: 'Active Requisitions', value: activeJobsCount, helper: `${filteredJobs.length} total filtered`, icon: 'jobs', tone: 'green', trend: computeTrend(periodComparison.jobsOpened.current, periodComparison.jobsOpened.previous) },
    { label: 'Rejected Candidates', value: rejectedCount, helper: 'Client declined', icon: 'xCircle', tone: 'red', trend: computeTrend(periodComparison.rejected.current, periodComparison.rejected.previous) },
    { label: 'Pending Tasks', value: pendingCallbacks.length + dueFollowups.length, helper: `${todaysCallbacks.length} calls today`, icon: 'clock', tone: 'orange', trend: null },
  ]

  // Compact Today/This Week/This Month submissions strip — real submission_date windows only
  // (there's no hired-date/completed-date field in the data model, so this stays to what's
  // actually measurable rather than approximating hires/completions by submission date).
  const performanceSnapshot = useMemo(() => {
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)
    const weekAgoDate = new Date(now); weekAgoDate.setDate(weekAgoDate.getDate() - 7)
    const weekAgoStr = weekAgoDate.toISOString().slice(0, 10)
    const monthAgoDate = new Date(now); monthAgoDate.setDate(monthAgoDate.getDate() - 30)
    const monthAgoStr = monthAgoDate.toISOString().slice(0, 10)
    return {
      today: candidates.filter(c => c.submission_date === todayStr).length,
      week: candidates.filter(c => c.submission_date && c.submission_date >= weekAgoStr).length,
      month: candidates.filter(c => c.submission_date && c.submission_date >= monthAgoStr).length,
    }
  }, [candidates])

  // Transparent composite score (not a magic number): blends pipeline health, placement
  // conversion, and today's task-completion rate — replaces the old hardcoded "94/100".
  const productivityScore = useMemo(() => {
    const taskTotal = pendingTasks.length + completedTasks.length
    const taskCompletionPct = taskTotal > 0 ? Math.round((completedTasks.length / taskTotal) * 100) : 100
    const score = pipelineHealthPct * 0.4 + conversionRate * 0.3 + taskCompletionPct * 0.3
    return Math.max(0, Math.min(100, Math.round(score)))
  }, [pipelineHealthPct, conversionRate, pendingTasks, completedTasks])

  // Priority Workspace — the "what actually needs attention today" row, consolidating
  // callbacks/follow-ups/offers/at-risk requisitions into one real, clickable set.
  const priorityWorkspaceItems = useMemo(() => {
    const atRiskJobs = priorityJobs.filter(j => j.statusTag === 'Critical' || j.statusTag === 'At Risk')
    return [
      { id: 'callbacks', label: 'Due Callbacks', count: todaysCallbacks.length, icon: 'callbacks', tone: 'accent', page: 'callbacks', helper: todaysCallbacks.length > 0 ? `${todaysCallbacks.length} scheduled today` : 'All caught up' },
      { id: 'followups', label: 'Overdue Follow-ups', count: overdueFollowups.length, icon: 'followups', tone: 'red', page: 'followups', helper: overdueFollowups.length > 0 ? 'Needs immediate attention' : 'Nothing overdue' },
      { id: 'offers', label: 'Offers Awaiting Decision', count: offerCount, icon: 'reports', tone: 'yellow', page: 'candidates', helper: offerCount > 0 ? 'Follow up with candidates' : 'No pending offers' },
      { id: 'atrisk', label: 'At-Risk Requisitions', count: atRiskJobs.length, icon: 'jobs', tone: 'orange', page: 'jobs', helper: atRiskJobs.length > 0 ? 'Stale or under-submitted' : 'Pipeline healthy' },
    ]
  }, [todaysCallbacks, overdueFollowups, offerCount, priorityJobs])

  const notificationItems = useMemo(() => {
    const items = []
    if (todaysFocus) items.push({ id: 'focus', title: todaysFocus.title, desc: todaysFocus.desc })
    if (overdueFollowups.length > 0) items.push({ id: 'overdue', title: `${overdueFollowups.length} overdue follow-up${overdueFollowups.length === 1 ? '' : 's'}`, desc: 'Past their scheduled date.' })
    if (offerCount > 0) items.push({ id: 'offers', title: `${offerCount} offer${offerCount === 1 ? '' : 's'} awaiting decision`, desc: 'Candidates with an extended offer.' })
    return items
  }, [todaysFocus, overdueFollowups, offerCount])

  // Quick action shortcuts — not memoized, same reasoning as commandActionItems above:
  // it closes over onNavigate/handleCopilotSend and is cheap to recreate each render.
  const quickActions = [
    { label: 'New Candidate', icon: 'users', onClick: () => onNavigate && onNavigate('candidates') },
    { label: 'Submit Candidate', icon: 'arrowUpRight', onClick: () => onNavigate && onNavigate('pipeline') },
    { label: 'Schedule Interview', icon: 'calendar', onClick: () => onNavigate && onNavigate('candidates') },
    { label: 'New Job', icon: 'jobs', onClick: () => onNavigate && onNavigate('jobs') },
    { label: 'Log Call', icon: 'callbacks', onClick: () => onNavigate && onNavigate('callbacks') },
    { label: 'AI Search', icon: 'sparkles', ai: true, onClick: () => handleCopilotSend('Search top React candidates submitted this week') },
  ]

  return (
    <PageContainer>
      {/* EXECUTIVE HEADER */}
      <header className="flex flex-col gap-4 pb-6 mb-7 border-b border-border lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3.5 min-w-0">
          <Avatar name={profile?.full_name || firstName} size="lg" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[22px] font-extrabold text-text leading-tight tracking-tight">Good morning, {firstName}</h1>
              <Badge tone="neutral" size="sm">{timeStr}</Badge>
            </div>
            <p className="text-[13px] text-text3 mt-1.5 truncate">{dateStr} · {todaysFocus.title}</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-2.5 bg-surface border border-border rounded-[var(--radius-lg)] pl-2 pr-3.5 py-1.5">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              style={{ background: `conic-gradient(var(--accent) ${productivityScore * 3.6}deg, var(--surface3) 0deg)` }}
              title="Composite of pipeline health, placement conversion, and today's task completion"
            >
              <div className="w-[26px] h-[26px] rounded-full bg-surface flex items-center justify-center text-[10px] font-extrabold text-text font-mono">{productivityScore}</div>
            </div>
            <div className="leading-tight">
              <div className="text-[10px] font-bold text-text3 uppercase tracking-wide">Productivity</div>
              <StatusPill status={pipelineHealthLabel} tone={pipelineHealthPct >= 70 ? 'green' : pipelineHealthPct >= 40 ? 'yellow' : 'red'} size="sm" />
            </div>
          </div>

          <Button variant="secondary" size="md" leftIcon="search" onClick={() => setCommandOpen(true)} className="hidden sm:inline-flex">
            Search <span className="ml-1.5 text-[10px] text-text3 font-mono">⌘K</span>
          </Button>
          <Button variant="secondary" size="md" iconOnly aria-label={`Notifications${notificationItems.length ? `, ${notificationItems.length} items` : ''}`} onClick={() => setShowNotifications(prev => !prev)} className="relative">
            <Icon name="bell" size={15} />
            {notificationItems.length > 0 && (
              <span className="absolute top-1 right-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-red text-white text-[9px] font-extrabold flex items-center justify-center leading-none">{notificationItems.length}</span>
            )}
          </Button>
        </div>
      </header>

      {/* PRIORITY WORKSPACE — what actually needs attention today, unfiltered by the toolbar below */}
      <section className="mb-8">
        <h2 className="text-[11px] font-bold text-text3 uppercase tracking-wider mb-3">Priority Workspace</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {priorityWorkspaceItems.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate && onNavigate(item.page)}
              className="text-left bg-surface border border-border shadow-xs rounded-[var(--radius-lg)] p-4 transition-[box-shadow,border-color,transform] duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:border-border-strong hover:shadow-sm hover:-translate-y-px"
            >
              <div className="flex items-center justify-between mb-2.5">
                <span
                  className="w-7 h-7 rounded-[var(--radius-sm)] flex items-center justify-center"
                  style={{ background: `color-mix(in srgb, var(--${item.tone}) 12%, transparent)`, color: `var(--${item.tone})`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, var(--${item.tone}) 18%, transparent)` }}
                >
                  <Icon name={item.icon} size={14} />
                </span>
                <span className="text-2xl font-extrabold text-text font-mono leading-none tracking-tight tabular-nums">{item.count}</span>
              </div>
              <div className="text-[12.5px] font-bold text-text">{item.label}</div>
              <div className="text-[11px] text-text3 mt-1 truncate">{item.helper}</div>
            </button>
          ))}
        </div>
      </section>

      {/* QUICK ACTIONS — compact action cards, not stacked buttons */}
      <section className="mb-8">
        <h2 className="text-[11px] font-bold text-text3 uppercase tracking-wider mb-3">Quick Actions</h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
          {quickActions.map(action => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className={`flex flex-col items-center justify-center gap-1.5 rounded-[var(--radius-md)] border p-3 text-center transition-[box-shadow,border-color,color] duration-[var(--duration-fast)] ${action.ai ? 'bg-ai-soft border-ai/20 text-ai hover:border-ai/45 hover:shadow-sm' : 'bg-surface2/60 border-border text-text2 hover:border-border-strong hover:bg-surface hover:text-text hover:shadow-xs'}`}
            >
              <Icon name={action.icon} size={16} />
              <span className="text-[11px] font-semibold leading-tight">{action.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* AI INTELLIGENCE — briefing / opportunity / risk / recommendation, not a chatbot */}
      <div
        className="mb-8 rounded-[var(--radius-lg)] border border-ai/20 shadow-sm p-4"
        style={{ background: 'linear-gradient(160deg, color-mix(in srgb, var(--ai) 6%, var(--surface)), var(--surface) 55%)' }}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-[var(--radius-sm)] bg-ai-soft text-ai flex items-center justify-center shadow-[inset_0_0_0_1px_rgba(139,92,246,0.18)]"><Icon name="sparkles" size={15} /></span>
            <div>
              <h2 className="text-[13px] font-bold text-text tracking-tight">AI Intelligence Briefing</h2>
              <p className="text-[11.5px] text-text3">Synthesized from live pipeline, requisition & task data</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="primary" onClick={() => onNavigate && onNavigate(todaysCallbacks.length > 0 ? 'callbacks' : 'candidates')}>Start Working</Button>
            <Button size="sm" variant="ghost" onClick={() => setAiBriefExpanded(!aiBriefExpanded)}>{aiBriefExpanded ? 'Collapse' : 'Expand'}</Button>
            <Button size="sm" variant="ai" leftIcon="sparkles" loading={briefingLoading} onClick={fetchAiBriefing}>Generate Plan</Button>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <div className="rounded-[var(--radius-md)] bg-surface2 border border-border p-3">
            <div className="text-[10px] font-bold text-accent uppercase tracking-wide mb-1.5">Opportunity</div>
            <p className="text-xs text-text2 leading-relaxed">{recommendedJobLabel} could use additional submittals this week — {todaysFocus.title.toLowerCase()}.</p>
          </div>
          <div className="rounded-[var(--radius-md)] bg-surface2 border border-border p-3">
            <div className="text-[10px] font-bold text-red uppercase tracking-wide mb-1.5">Risk</div>
            <p className="text-xs text-text2 leading-relaxed">{atRiskCount} candidate{atRiskCount === 1 ? '' : 's'} awaiting feedback · pipeline health is <b className="text-text">{pipelineHealthLabel.toLowerCase()}</b> at {pipelineHealthPct}%.</p>
          </div>
          <div className="rounded-[var(--radius-md)] bg-surface2 border border-border p-3">
            <div className="text-[10px] font-bold text-green uppercase tracking-wide mb-1.5">Recommendation</div>
            <p className="text-xs text-text2 leading-relaxed">Budget ~{estimatedWorkloadHours}h today to clear {todaysCallbacks.length} calls and {overdueFollowups.length} overdue follow-ups.</p>
          </div>
        </div>

        {aiBriefExpanded && (
          <div className="mt-3 rounded-[var(--radius-md)] bg-ai-soft border border-ai/20 p-3.5">
            {briefingLoading ? (
              <p className="text-xs text-text3">Synthesizing live candidate pipeline health &amp; recruiter workload...</p>
            ) : (
              <p className="text-xs text-text2 leading-relaxed">{aiBriefingText || `Pipeline health is operating at ${pipelineHealthPct}% yield with ${qualifiedCount} qualified candidates in stage. Priority action today: execute ${todaysCallbacks.length} scheduled recruiter calls and review ${activeJobsCount} open requisitions.`}</p>
            )}
          </div>
        )}
      </div>

      {/* FILTER TOOLBAR — scopes the KPI grid and analytics panels below */}
      <section className="flex flex-col sm:flex-row sm:items-center gap-2.5 mb-4">
        <div className="relative w-full sm:max-w-xs">
          <Input leftIcon="search" placeholder="Search candidates, jobs, clients..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} rightIcon={searchQuery ? 'x' : undefined} />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text3 hover:text-text" aria-label="Clear search">
              <Icon name="x" size={13} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            ref={recruiterBtnRef}
            type="button"
            onClick={() => {
              if (!showOwnerDropdown && recruiterBtnRef.current) {
                const r = recruiterBtnRef.current.getBoundingClientRect()
                setRecruiterPos({ top: r.bottom + 6, left: r.left })
              }
              setShowOwnerDropdown(prev => !prev)
            }}
            className="h-9 px-3 rounded-[var(--radius-sm)] border border-border bg-surface2 text-xs font-semibold text-text2 hover:text-text flex items-center gap-1.5"
          >
            <Icon name="users" size={13} />
            {selectedOwners.length === 0 ? 'All Recruiters' : `${selectedOwners.length} Selected`}
            <Icon name="chevronDown" size={11} />
          </button>

          {showOwnerDropdown && createPortal(
            <div
              onClick={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
              className="fixed w-[260px] bg-surface border border-border rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] p-2.5 flex flex-col gap-1.5 max-h-[300px] overflow-hidden"
              style={{ top: recruiterPos.top, left: recruiterPos.left, zIndex: 'var(--z-dropdown)' }}
            >
              <input
                autoFocus
                type="text"
                placeholder="Search recruiters..."
                value={recruiterSearch}
                onChange={e => setRecruiterSearch(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-[var(--radius-sm)] border border-border bg-surface2 text-xs text-text placeholder:text-text3 outline-none shrink-0"
              />
              <div className="overflow-y-auto flex-1 flex flex-col gap-0.5">
                <label className="flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-sm)] cursor-pointer text-xs text-text2 hover:bg-surface2">
                  <input type="checkbox" checked={selectedOwners.length === 0} onChange={() => setSelectedOwners([])} className="w-3.5 h-3.5 rounded accent-accent" />
                  All recruiters
                </label>
                <div className="h-px bg-border my-0.5" />
                {filteredRecruiterOptions.map(([id, name]) => {
                  const isChecked = selectedOwners.includes(id)
                  return (
                    <label key={id} className="flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-sm)] cursor-pointer text-xs text-text2 hover:bg-surface2">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => setSelectedOwners(prev => isChecked ? prev.filter(i => i !== id) : [...prev, id])}
                        className="w-3.5 h-3.5 rounded accent-accent"
                      />
                      {name}
                    </label>
                  )
                })}
              </div>
            </div>,
            document.body
          )}

          <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} className="h-9 px-2.5 rounded-[var(--radius-sm)] border border-border bg-surface2 text-xs font-semibold text-text2">
            <option value="All">All Stages</option>
            {stageOptions.filter(s => s !== 'All').map(stage => <option key={stage} value={stage}>{stage}</option>)}
          </select>

          <select value={jobStatusFilter} onChange={e => setJobStatusFilter(e.target.value)} className="h-9 px-2.5 rounded-[var(--radius-sm)] border border-border bg-surface2 text-xs font-semibold text-text2">
            <option value="All">All Statuses</option>
            {jobStatusOptions.filter(s => s !== 'All').map(status => <option key={status} value={status}>{status}</option>)}
          </select>

          <select value={timeRange} onChange={e => setTimeRange(e.target.value)} className="h-9 px-2.5 rounded-[var(--radius-sm)] border border-border bg-surface2 text-xs font-semibold text-text2">
            <option value="all">All Time</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>

          {(searchQuery || selectedOwners.length > 0 || stageFilter !== 'All' || jobStatusFilter !== 'All' || timeRange !== 'all') && (
            <button type="button" onClick={() => { setTimeRange('all'); setSelectedOwners([]); setStageFilter('All'); setJobStatusFilter('All'); setSearchQuery('') }} className="text-xs font-semibold text-text3 hover:text-red px-1">
              Reset
            </button>
          )}
        </div>

        <div className="sm:ml-auto text-xs text-text3 whitespace-nowrap">
          <b className="text-text">{filteredCandidates.length}</b> Candidates · <b className="text-text">{filteredJobs.length}</b> Jobs
        </div>
      </section>

      {/* KPI GRID */}
      <section className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-7">
        {stats.map(stat => (
          <KPICard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            icon={stat.icon}
            tone={stat.tone}
            helper={stat.helper}
            trend={stat.trend?.dir}
            trendValue={stat.trend ? (stat.trend.dir === 'flat' ? 'No change' : `${stat.trend.dir === 'up' ? '+' : '-'}${stat.trend.pct}%`) : undefined}
          />
        ))}
      </section>

      {/* MAIN WORKFLOW 2-COLUMN GRID */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        {/* Left Column: Pipeline Health, Requisition Health, Today's Actions, Leaderboard */}
        <div className="flex flex-col gap-6 min-w-0">
          {/* PIPELINE HEALTH */}
          <Card>
            <CardHeader
              title="Pipeline Health"
              subtitle="Connected candidate funnel · click any stage to filter"
              action={<Button size="sm" variant="ai" leftIcon="sparkles" onClick={() => handleCopilotSend('Explain the current pipeline bottlenecks and recommend actions to improve conversion')}>Explain Bottlenecks</Button>}
            />
            <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
              {pipelineData.map((stg, i) => {
                const isSelected = stageFilter === stg.rawStage
                return (
                  <div key={stg.stage} className="flex items-center shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setStageFilter(prev => prev === stg.rawStage ? 'All' : stg.rawStage)
                        onNavigate && onNavigate('candidates')
                      }}
                      onMouseEnter={() => setHoveredStage(stg.rawStage)}
                      onMouseLeave={() => setHoveredStage(prev => prev === stg.rawStage ? null : prev)}
                      title={`Filter candidates by ${stg.stage} • Avg Time: ${stg.avgDays} days • Drop-off: ${stg.dropOff}`}
                      className={`flex flex-col gap-1 rounded-[var(--radius-md)] border px-2.5 py-2 min-w-[92px] text-left transition-colors duration-[var(--duration-fast)] ${isSelected ? 'border-accent bg-accent/8' : 'border-border bg-surface2 hover:border-text3'}`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: stg.color }} />
                        <span className="text-[10px] font-bold text-text2 truncate">{stg.stage}</span>
                      </span>
                      <span className="flex items-baseline gap-1">
                        <b className="text-sm font-extrabold text-text font-mono">{stg.count}</b>
                        <span className="text-[10px] text-text3">{stg.pct}%</span>
                      </span>
                    </button>
                    {i < pipelineData.length - 1 && (
                      <span className="text-text3 px-0.5 shrink-0" aria-hidden="true">→</span>
                    )}
                  </div>
                )
              })}
            </div>

            {(() => {
              const focusStage = pipelineData.find(s => s.rawStage === (hoveredStage || stageFilter))
              return (
                <div className="flex items-center gap-3 flex-wrap text-xs text-text3 bg-surface2 rounded-[var(--radius-sm)] px-3 py-2 mt-2.5">
                  {focusStage ? (
                    <>
                      <span className="font-bold text-text">{focusStage.stage}</span>
                      <span>Avg time in stage: <b className="text-text2">{focusStage.avgDays} days</b></span>
                      <span>Drop-off: <b className="text-text2">{focusStage.dropOff}</b></span>
                      <span>{focusStage.count} candidates · {focusStage.pct}% of pipeline</span>
                    </>
                  ) : (
                    <span>Hover a stage for avg time &amp; drop-off, or click to filter</span>
                  )}
                </div>
              )
            })()}

            <div className="mt-3 -mx-1">
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={pipelineData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="stage" interval={0} angle={-35} textAnchor="end" height={48} tick={{ fill: 'var(--text3)', fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text3)', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={{ fill: 'rgba(37,99,235,0.04)' }} />
                  <Bar
                    dataKey="count"
                    radius={[4, 4, 0, 0]}
                    barSize={20}
                    onClick={(data) => {
                      if (data && data.rawStage) setStageFilter(prev => prev === data.rawStage ? 'All' : data.rawStage)
                    }}
                  >
                    {pipelineData.map(item => (
                      <Cell
                        key={item.stage}
                        fill={stageFilter === item.rawStage ? 'var(--accent)' : item.color}
                        cursor="pointer"
                        opacity={stageFilter === 'All' || stageFilter === item.rawStage ? 1 : 0.35}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* REQUISITION HEALTH */}
          <Card>
            <CardHeader
              title="Requisition Health"
              subtitle="Submittal pace &amp; placement probability for top open roles"
              action={<Button size="sm" variant="ai" leftIcon="sparkles" onClick={() => handleCopilotSend('Explain which requisitions are most at risk and why, based on the priority job health radar')}>Explain Risk</Button>}
            />
            {priorityJobs.length === 0 ? (
              <EmptyState icon="jobs" title="No open requisitions" description="Post a job to start tracking its health here." />
            ) : (
              <div className="grid sm:grid-cols-2 gap-2.5">
                {priorityJobs.map(job => (
                  <div key={job.id} className="rounded-[var(--radius-md)] border border-border bg-surface2 p-3 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Badge tone={job.priority === 'Urgent' ? 'red' : job.priority === 'High' ? 'orange' : 'neutral'} size="sm">{job.priority}</Badge>
                      <StatusPill status={job.statusTag} tone={job.statusTone === 'amber' ? 'yellow' : job.statusTone} size="sm" />
                    </div>
                    <strong className="text-xs font-bold text-text truncate">{job.title}</strong>
                    <span className="text-[11px] text-text3 truncate">{job.client || 'Client Account'} · {job.openDays}d open</span>
                    <div className="flex items-center gap-3 text-[11px] text-text2 mt-0.5">
                      <span><b className="text-text">{job.submittals}</b> Sub</span>
                      <span><b className="text-text">{job.interviews}</b> Int</span>
                      <span className="text-green"><b>{job.placementProb}</b> Prob</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* TODAY'S ACTIONS — the actionable list; Priority Workspace above is the scannable summary */}
          <Card>
            <CardHeader title="Today's Actions" subtitle="Complete pending callbacks and follow-ups inline" />
            {[...todaysCallbacks.slice(0, 4), ...overdueFollowups.slice(0, 4)].length === 0 ? (
              <EmptyState
                icon="checkCircle"
                title="You're all caught up"
                description="No pending callbacks or follow-ups today."
                action={
                  <div className="flex items-center gap-2 mt-2 flex-wrap justify-center">
                    <Button size="sm" variant="secondary" onClick={() => onNavigate && onNavigate('candidates')}>Review Pipeline</Button>
                    <Button size="sm" variant="ghost" onClick={() => handleCopilotSend('Draft candidate outreach for open requisitions')}>Generate Outreach</Button>
                  </div>
                }
              />
            ) : (
              <div className="flex flex-col gap-2">
                {todaysCallbacks.slice(0, 4).map(item => (
                  <div key={`c-${item.id}`} className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-yellow/25 bg-yellow/8 px-3 py-2.5">
                    <div className="min-w-0">
                      <strong className="text-xs font-bold text-text block truncate">Callback: {item.candidate_name}</strong>
                      <small className="text-[11px] text-text3">{item.time || 'Schedule'} · {item.phone || 'No phone'}</small>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.phone && (
                        <a href={`tel:${item.phone}`} title="Call candidate" className="w-7 h-7 rounded-[var(--radius-sm)] flex items-center justify-center text-text2 hover:bg-surface2">
                          <Icon name="callbacks" size={13} />
                        </a>
                      )}
                      <button type="button" onClick={() => handleCompleteCallback(item.id)} title="Mark done" className="w-7 h-7 rounded-[var(--radius-sm)] flex items-center justify-center text-green hover:bg-green/10">
                        <Icon name="check" size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                {overdueFollowups.slice(0, 4).map(item => (
                  <div key={`f-${item.id}`} className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-red/25 bg-red/8 px-3 py-2.5">
                    <div className="min-w-0">
                      <strong className="text-xs font-bold text-text block truncate">Follow-up: {item.candidate_name}</strong>
                      <small className="text-[11px] text-text3">{item.date} · {item.priority || 'Medium'} priority</small>
                    </div>
                    <button type="button" onClick={() => handleCompleteFollowup(item.id)} title="Mark done" className="w-7 h-7 rounded-[var(--radius-sm)] flex items-center justify-center text-green hover:bg-green/10 shrink-0">
                      <Icon name="check" size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* RECRUITER LEADERBOARD */}
          <Card>
            <CardHeader
              title="Recruiter Leaderboard"
              subtitle="Real-time team submittals, interviews &amp; placement conversion"
              action={
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    leftIcon="download"
                    onClick={() => {
                      const data = sortedRecruiterData.map(r => ({
                        Rank: r.rank,
                        Recruiter: r.name,
                        Submissions: r.submissions,
                        Interviews: r.interviews,
                        Offers: r.offers,
                        Hires: r.hires,
                        'Yield %': `${r.fillRate}%`,
                        'AI Score': r.aiScore
                      }))
                      const workbook = XLSX.utils.book_new()
                      const worksheet = XLSX.utils.json_to_sheet(data)
                      XLSX.utils.book_append_sheet(workbook, worksheet, 'Leaderboard')
                      XLSX.writeFile(workbook, `Recruiter_Leaderboard_${new Date().toISOString().slice(0, 10)}.xlsx`)
                    }}
                    title="Export Leaderboard metrics to XLSX Excel Spreadsheet"
                  >
                    Export XLSX
                  </Button>
                  <Button size="sm" variant="ai" leftIcon="sparkles" onClick={() => handleCopilotSend('Explain why recruiter productivity and performance changed this period')}>Explain</Button>
                </div>
              }
            />
            {selectedOwners.length > 0 && (
              <div className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] bg-accent/8 border border-accent/25 px-3 py-2 mb-3 text-xs">
                <span className="text-text2">Filtered for: <strong className="text-text">{selectedOwnerNamesStr}</strong></span>
                <button type="button" onClick={() => setSelectedOwners([])} className="font-semibold text-accent hover:underline shrink-0">Clear</button>
              </div>
            )}
            <Table
              columns={[
                {
                  key: 'rank', header: '#', width: '36px', render: row => {
                    const medal = row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : null
                    return <span className="text-xs font-bold text-text3">{medal || `#${row.rank}`}</span>
                  }
                },
                {
                  key: 'name', header: 'Recruiter', sortable: true, render: row => {
                    const ownerMatch = ownerOptions.find(([, name]) => name === row.name)
                    const ownerId = ownerMatch ? ownerMatch[0] : null
                    const isSelected = ownerId && selectedOwners.includes(ownerId)
                    return (
                      <span className="flex items-center gap-2">
                        <span className="font-bold text-text">{row.name}</span>
                        {isSelected && <Badge tone="accent" size="sm">Active</Badge>}
                      </span>
                    )
                  }
                },
                { key: 'submissions', header: 'Sub', sortable: true, align: 'right' },
                { key: 'interviews', header: 'Int', sortable: true, align: 'right' },
                { key: 'offers', header: 'Offers', sortable: true, align: 'right' },
                { key: 'hires', header: 'Hires', sortable: true, align: 'right', render: row => <b className="text-green">{row.hires}</b> },
                { key: 'fillRate', header: 'Yield %', sortable: true, align: 'right', render: row => <Badge tone="green" size="sm">{row.fillRate}%</Badge> },
                { key: 'aiScore', header: 'AI Score', sortable: true, align: 'right', render: row => <span className="text-ai font-bold text-xs">⚡ {row.aiScore}</span> },
              ]}
              data={sortedRecruiterData}
              getRowId={row => row.name}
              sortKey={tableSortKey}
              sortDir={tableSortDir}
              onSortChange={handleTableSort}
              onRowClick={row => {
                const ownerMatch = ownerOptions.find(([, name]) => name === row.name)
                const ownerId = ownerMatch ? ownerMatch[0] : null
                if (ownerId) setSelectedOwners(prev => prev.includes(ownerId) ? [] : [ownerId])
              }}
              rowActions={row => (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setExpandedRecruiterName(prev => prev === row.name ? null : row.name) }}
                  title={expandedRecruiterName === row.name ? 'Hide funnel breakdown' : 'Show funnel breakdown'}
                  className="w-6 h-6 rounded-[var(--radius-sm)] flex items-center justify-center text-text3 hover:bg-surface2 hover:text-text"
                >
                  <Icon name={expandedRecruiterName === row.name ? 'chevronUp' : 'chevronDown'} size={12} />
                </button>
              )}
              emptyState={
                <EmptyState
                  icon="users"
                  title="No submittals in selected timeframe"
                  action={selectedOwners.length > 0 ? <Button size="sm" variant="secondary" onClick={() => setSelectedOwners([])}>Reset Filter</Button> : undefined}
                />
              }
            />
            {expandedRecruiterName && (() => {
              const row = sortedRecruiterData.find(r => r.name === expandedRecruiterName)
              if (!row) return null
              return (
                <div className="mt-3 rounded-[var(--radius-md)] bg-surface2 border border-border p-3 flex flex-col gap-2">
                  <div className="text-xs font-bold text-text">{row.name} · Funnel breakdown</div>
                  {[
                    { label: 'Submittals', value: row.submissions, tone: 'accent' },
                    { label: 'Interviews', value: row.interviews, tone: 'ai' },
                    { label: 'Offers', value: row.offers, tone: 'yellow' },
                    { label: 'Hires', value: row.hires, tone: 'green' },
                  ].map(bar => (
                    <div key={bar.label} className="flex items-center gap-2.5">
                      <span className="text-[11px] text-text3 w-16 shrink-0">{bar.label}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-surface3 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.round((bar.value / Math.max(row.submissions, 1)) * 100))}%`, background: `var(--${bar.tone})` }} />
                      </div>
                      <span className="text-xs font-bold text-text w-6 text-right shrink-0">{bar.value}</span>
                    </div>
                  ))}
                </div>
              )
            })()}
          </Card>
        </div>

        {/* Right Column: Mission Board, Activity Feed & Workspace */}
        <div className="flex flex-col gap-6 min-w-0">
          {/* RECRUITER MISSION BOARD */}
          {/* PERFORMANCE SNAPSHOT — compact, real submission_date windows only */}
          <Card padding="sm">
            <div className="grid grid-cols-3 divide-x divide-border">
              {[
                { label: 'Today', value: performanceSnapshot.today },
                { label: 'This Week', value: performanceSnapshot.week },
                { label: 'This Month', value: performanceSnapshot.month },
              ].map(item => (
                <div key={item.label} className="text-center px-2">
                  <div className="text-lg font-extrabold text-text font-mono">{item.value}</div>
                  <div className="text-[10px] font-semibold text-text3 uppercase tracking-wide mt-0.5">{item.label}</div>
                </div>
              ))}
            </div>
            <div className="text-center text-[11px] text-text3 mt-2 pt-2 border-t border-border">Submissions · {completedTasks.length}/{pendingTasks.length + completedTasks.length} of today's tasks done</div>
          </Card>

          {/* RECRUITER MISSION BOARD */}
          <Card>
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <Tabs
                items={[{ id: 'tasks', label: 'Daily Checklist', count: pendingTasks.length }, { id: 'eod', label: 'EOD AI Briefing' }]}
                value={missionTab}
                onChange={setMissionTab}
              />
              <Button size="sm" variant="ai" leftIcon="sparkles" loading={eodLoading} onClick={handleGenerateEODSummary}>Generate EOD</Button>
            </div>

            {missionTab === 'tasks' && (
              <div className="flex flex-col gap-3">
                <form onSubmit={handleAddNote} className="flex items-center gap-2">
                  <select value={noteTag} onChange={e => setNoteTag(e.target.value)} className="h-9 px-2 rounded-[var(--radius-sm)] border border-border bg-surface2 text-xs font-semibold text-text2 shrink-0">
                    <option value="Follow-up">Follow-up</option>
                    <option value="Call">Call</option>
                    <option value="Screening">Screening</option>
                    <option value="Interview">Interview</option>
                    <option value="Offer">Offer</option>
                    <option value="EOD Review">EOD Review</option>
                  </select>
                  <Input placeholder="Add recruiter action item..." value={newNoteText} onChange={e => setNewNoteText(e.target.value)} required className="flex-1" />
                  <Button type="submit" size="md">Add</Button>
                </form>

                <div className="flex flex-col gap-1.5">
                  {pendingTasks.length === 0 ? (
                    <EmptyState icon="checkCircle" title="All pending tasks completed" description="Add a new task above or generate your EOD AI briefing." />
                  ) : (
                    pendingTasks.map(item => (
                      <div key={item.id} className="relative flex items-start gap-2.5 rounded-[var(--radius-md)] border border-border bg-surface2 px-3.5 py-3 transition-colors duration-[var(--duration-fast)] hover:border-border-strong hover:bg-surface3/60">
                        <input type="checkbox" checked={item.done} onChange={() => handleToggleNote(item.id)} className="w-4 h-4 mt-0.5 rounded accent-accent shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap mb-1">
                            <Badge tone="accent" size="sm">{item.tag}</Badge>
                            {item.priority && <Badge tone={item.priority === 'Urgent' || item.priority === 'High' ? 'red' : 'neutral'} size="sm">{item.priority}</Badge>}
                            <span className="text-[10px] text-text3">⏱ {TASK_EFFORT_MINUTES[item.tag] || 15} min</span>
                          </div>
                          <div className="text-xs font-semibold text-text">{item.text}</div>
                          {item.candidate && <div className="text-[11px] text-text3 mt-0.5">{item.candidate} · {item.job || 'Requisition'}</div>}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              if (!onNavigate) return
                              if (item.tag === 'Offer' || item.tag === 'Interview' || item.tag === 'Screening' || item.candidate) {
                                onNavigate('candidates')
                              } else {
                                onNavigate('jobs')
                              }
                            }}
                            title="Open in workspace"
                            className="text-[11px] font-semibold text-text3 hover:text-text px-1.5"
                          >
                            View
                          </button>
                          <button type="button" onClick={() => handleCopilotSend(`Draft a follow-up for: ${item.text}`)} title="AI Draft" className="text-[11px] font-semibold text-ai hover:underline px-1.5">AI</button>
                          <Menu
                            align="end"
                            trigger={({ toggle }) => <MenuTrigger open={activeTaskMenuId === item.id} toggle={() => { toggle(); setActiveTaskMenuId(prev => prev === item.id ? null : item.id) }} />}
                            items={[
                              { label: 'Mark complete', icon: 'check', onClick: () => handleToggleNote(item.id) },
                              { label: 'Delete task', icon: 'trash', danger: true, onClick: () => handleDeleteNote(item.id) },
                            ]}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {completedTasks.length > 0 && (
                  <details className="group">
                    <summary className="flex items-center justify-between cursor-pointer text-xs font-bold text-text2 py-1.5 list-none">
                      <span>Completed Today ({completedTasks.length})</span>
                      <Icon name="chevronDown" size={12} className="text-text3 group-open:rotate-180 transition-transform" />
                    </summary>
                    <div className="flex flex-col gap-1.5 mt-1.5">
                      {completedTasks.map(item => (
                        <div key={item.id} className="flex items-center gap-2.5 rounded-[var(--radius-md)] bg-surface2/60 px-3 py-2">
                          <input type="checkbox" checked={item.done} onChange={() => handleToggleNote(item.id)} className="w-4 h-4 rounded accent-accent shrink-0" />
                          <span className="text-xs text-text3 line-through flex-1 truncate">{item.text}</span>
                          <button type="button" onClick={() => handleDeleteNote(item.id)} title="Delete" className="text-text3 hover:text-red shrink-0"><Icon name="x" size={12} /></button>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}

            {missionTab === 'eod' && (
              <div>
                {eodLoading && (
                  <div className="flex flex-col items-center gap-2 py-8 text-text3">
                    <Skeleton className="w-8 h-8 rounded-full" />
                    <p className="text-xs">AI is synthesizing your daily accomplishments &amp; priority EOD plan...</p>
                  </div>
                )}
                {!eodLoading && !eodSummaryText && (
                  <EmptyState icon="sparkles" title="EOD AI summary ready" description="Click Generate EOD to auto-synthesize your daily accomplishments and tomorrow's priority checklist." />
                )}
                {!eodLoading && eodSummaryText && (
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3 pb-2.5 border-b border-border">
                      <Badge tone="ai" size="sm">EOD Summary</Badge>
                      <Button
                        size="sm"
                        variant="secondary"
                        leftIcon={eodCopied ? 'check' : 'copy'}
                        onClick={() => {
                          if (navigator.clipboard) {
                            navigator.clipboard.writeText(eodSummaryText)
                            setEodCopied(true)
                            setTimeout(() => setEodCopied(false), 2500)
                          }
                        }}
                      >
                        {eodCopied ? 'Copied!' : 'Copy Summary'}
                      </Button>
                    </div>
                    <MarkdownView content={eodSummaryText} />
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Activity Stream Feed with Hover Quick Actions */}
          <Card>
            <div className="flex items-center gap-1.5 flex-wrap mb-3">
              {[
                { key: 'all', label: 'All' },
                { key: 'submission', label: 'Submissions' },
                { key: 'callback', label: 'Callbacks' },
                { key: 'followup', label: 'Follow-ups' },
              ].map(f => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setActivityFilter(f.key)}
                  className={`h-7 px-2.5 rounded-full text-[11px] font-semibold transition-colors duration-[var(--duration-fast)] ${activityFilter === f.key ? 'bg-accent/12 text-accent' : 'bg-surface2 text-text3 hover:text-text2'}`}
                >
                  {f.label}
                </button>
              ))}
              <button type="button" onClick={() => handleCopilotSend("Summarize today's workspace activity")} title="AI: Summarize today's activity" className="h-7 px-2.5 rounded-full text-[11px] font-semibold text-ai bg-ai-soft ml-auto">
                ✨ Summarize
              </button>
            </div>

            {filteredActivityFeed.length === 0 ? (
              <EmptyState
                icon="calendar"
                title="No activity yet"
                description="Submittals, callbacks & follow-ups will show up here as they happen."
                action={<Button size="sm" variant="secondary" onClick={() => onNavigate && onNavigate('candidates')}>Review Pipeline</Button>}
              />
            ) : (
              <div className="flex flex-col max-h-[320px] overflow-y-auto pr-1">
                {filteredActivityFeed.map((act, i) => {
                  const bucket = getActivityDateBucket(act.timestamp)
                  const showBucket = i === 0 || getActivityDateBucket(filteredActivityFeed[i - 1].timestamp) !== bucket
                  const typeIcon = act.type === 'submission' ? 'arrowUpRight' : act.type === 'callback' ? 'callbacks' : 'followups'
                  return (
                    <div key={act.id}>
                      {showBucket && <div className="text-[10px] font-bold text-text3 uppercase tracking-wide pt-3 pb-1.5 first:pt-0">{bucket}</div>}
                      <div className="group/item flex items-center gap-2.5 py-2 border-b border-border last:border-0">
                        <Avatar name={act.actor} size="xs" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <Icon name={typeIcon} size={11} className="text-text3 shrink-0" />
                            <strong className="text-xs font-bold text-text truncate">{act.title}</strong>
                          </div>
                          <span className="text-[11px] text-text3 truncate block">{act.sub}</span>
                        </div>
                        <div className="hidden group-hover/item:flex items-center gap-2 shrink-0">
                          <button onClick={() => onNavigate && onNavigate('candidates')} type="button" className="text-[11px] font-semibold text-text3 hover:text-text">View</button>
                          <button onClick={() => handleCopilotSend(`Summarize activity: ${act.title}`)} type="button" className="text-[11px] font-semibold text-ai hover:underline">AI</button>
                        </div>
                        <span className="text-[10px] text-text3 shrink-0 group-hover/item:hidden">{formatRelativeTime(act.timestamp)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          {/* Submissions & Activity Trend Chart */}
          <Card>
            <CardHeader title={`${timeRange === '30d' ? '30-Day' : timeRange === '90d' ? '90-Day' : '7-Day'} Submissions Trend`} subtitle="Submissions and follow-up activities over time" />
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="submissions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="followups" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: 'var(--text3)', fontSize: 10 }} axisLine={false} tickLine={false} interval={timeRange === '90d' ? 14 : timeRange === '30d' ? 4 : 0} />
                <YAxis tick={{ fill: 'var(--text3)', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                <Area type="monotone" dataKey="submissions" name="Submissions" stroke="#2563eb" fill="url(#submissions)" strokeWidth={2} />
                <Area type="monotone" dataKey="followups" name="Follow-ups" stroke="#10b981" fill="url(#followups)" strokeWidth={2} />
                <Area
                  type="monotone"
                  dataKey="previousSubmissions"
                  name="Previous Period"
                  stroke="#94a3b8"
                  strokeDasharray="4 3"
                  fill="none"
                  strokeWidth={1.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          {/* Job Donut & Smart AI Workspace Scratchpad */}
          <Card>
            <CardHeader title="Requisitions &amp; Workspace" subtitle="Job status breakdown &amp; autosaved call notes" />
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="flex flex-col items-center">
                <div className="relative w-full" style={{ height: 160 }}>
                  {sourceData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-text3">No job data yet</div>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={sourceData}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={42}
                            outerRadius={64}
                            paddingAngle={4}
                            onClick={(data) => {
                              if (data && data.name) setJobStatusFilter(prev => prev === data.name ? 'All' : data.name)
                            }}
                          >
                            {sourceData.map((entry, index) => (
                              <Cell
                                key={entry.name}
                                fill={COLORS[index]}
                                cursor="pointer"
                                stroke={jobStatusFilter === entry.name ? 'var(--accent)' : 'none'}
                                strokeWidth={jobStatusFilter === entry.name ? 2 : 0}
                                opacity={jobStatusFilter === 'All' || jobStatusFilter === entry.name ? 1 : 0.35}
                              />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <strong className="text-lg font-extrabold text-text font-mono">{activeJobsCount}</strong>
                        <span className="text-[10px] text-text3 font-semibold uppercase tracking-wide">Active</span>
                      </div>
                    </>
                  )}
                </div>
                {sourceData.length > 0 && (
                  <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 mt-2">
                    {sourceData.map((entry, index) => (
                      <span key={entry.name} className="flex items-center gap-1.5 text-[11px] text-text3">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[index] }} />
                        {entry.name} <b className="text-text">{entry.value}</b>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-text">Smart AI Workspace</span>
                  <span className="text-[10px] text-text3">● {lastSavedTime}</span>
                </div>
                <textarea
                  value={scratchpad}
                  onChange={handleScratchpadChange}
                  placeholder="Type quick candidate numbers, interview notes, or call snippets here..."
                  className="w-full flex-1 min-h-[130px] rounded-[var(--radius-md)] border border-border bg-surface2 p-2.5 text-xs text-text placeholder:text-text3 outline-none focus:border-accent resize-none font-mono"
                />
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* SLIDE-OUT RIGHT-SIDE AI COPILOT PANEL WITH 3 WINDOW STATES (EXPANDED, MINIMIZED, CLOSED) */}
      {(copilotState === 'closed' || copilotState === 'minimized') && (
        <button
          type="button"
          onClick={() => setCopilotState('expanded')}
          title="TalentDesk AI Copilot"
          aria-label="TalentDesk AI Copilot"
          className="fixed bottom-5 right-5 rounded-full flex items-center justify-center text-white shadow-[var(--shadow-lg)] transition-all duration-200 hover:scale-105 group"
          style={{
            zIndex: 'var(--z-overlay)',
            background: 'linear-gradient(135deg, #4f7cff, #7c5cff)',
            width: 52,
            height: 52,
          }}
        >
          <span className="relative flex items-center justify-center">
            <Icon name="sparkles" size={22} className="text-white transition-transform duration-200 group-hover:rotate-12" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-green border-2 border-surface" title="Copilot Active" />
          </span>
        </button>
      )}

      {(copilotState === 'expanded' || copilotState === 'maximized') && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end justify-end p-0 sm:p-5" style={{ zIndex: 'var(--z-modal)' }} onClick={() => setCopilotState('minimized')}>
          <div
            onClick={e => e.stopPropagation()}
            className={`w-full flex flex-col bg-surface border border-border shadow-[var(--shadow-lg)] overflow-hidden ${copilotState === 'maximized' ? 'h-full sm:rounded-[var(--radius-lg)]' : 'h-[85vh] sm:h-[600px] sm:max-w-md sm:rounded-[var(--radius-lg)]'}`}
          >
            <div className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <Icon name="sparkles" size={15} className="text-ai" />
                <strong className="text-sm font-bold text-text">TalentDesk AI Copilot</strong>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={handleNewChat} type="button" title="New chat" className="w-7 h-7 rounded-[var(--radius-sm)] flex items-center justify-center text-text3 hover:bg-surface2 hover:text-text">
                  <Icon name="edit" size={13} />
                </button>
                <button onClick={() => setCopilotState('minimized')} type="button" title="Minimize" className="w-7 h-7 rounded-[var(--radius-sm)] flex items-center justify-center text-text3 hover:bg-surface2 hover:text-text">
                  <Icon name="minus" size={13} />
                </button>
                <button
                  onClick={() => setCopilotState(prev => prev === 'maximized' ? 'expanded' : 'maximized')}
                  type="button"
                  title={copilotState === 'maximized' ? 'Restore' : 'Maximize'}
                  className="hidden sm:flex w-7 h-7 rounded-[var(--radius-sm)] items-center justify-center text-text3 hover:bg-surface2 hover:text-text"
                >
                  <Icon name={copilotState === 'maximized' ? 'chevronDown' : 'arrowUpRight'} size={13} />
                </button>
                <button onClick={() => setCopilotState('closed')} type="button" title="Close" className="w-7 h-7 rounded-[var(--radius-sm)] flex items-center justify-center text-text3 hover:bg-surface2 hover:text-text">
                  <Icon name="x" size={14} />
                </button>
              </div>
            </div>

            <div className="copilot-messages-box">
              {Array.isArray(copilotMessages) && copilotMessages.map((msg, i) => {
                const isObjContent = msg?.content && typeof msg.content === 'object'
                const summaryText = isObjContent ? (msg.content.summary || msg.text) : (msg?.text || String(msg?.content || ''))
                const isPendingAction = isObjContent && msg.content.pendingAction && typeof msg.content.pendingAction === 'object'
                const isSnapshot = isObjContent && msg.content.snapshot && typeof msg.content.snapshot === 'object'
                const hasExtraDetails = isObjContent && (isSnapshot || msg.content.insight || msg.content.nextBestAction || msg.content.recommendation)

                return (
                  <div key={i} className="copilot-chat-row">
                    {msg.sender === 'user' ? (
                      <div className="copilot-msg-bubble user">
                        <p>{msg.text}</p>
                        <small>{msg.timestamp}</small>
                      </div>
                    ) : (
                      <div className="copilot-msg-card ai">
                        {/* 1. DIRECT COMPACT ANSWER FIRST */}
                        <p className="copilot-summary">{summaryText}</p>

                        {/* 2. ACTION CONFIRMATION DIALOG FOR PENDING CRM OPERATIONS */}
                        {isPendingAction && !msg.actionExecuted && !msg.actionCancelled && (
                          <div className="copilot-action-confirm-card">
                            <div className="confirm-card-header">
                              <span className="confirm-icon">⚡</span>
                              <strong>{msg.content.pendingAction.confirmTitle || 'CRM Action Triggered'}</strong>
                            </div>
                            <p className="confirm-prompt">{msg.content.pendingAction.confirmPrompt || `Execute '${msg.content.pendingAction.type}' operation?`}</p>
                            <div className="confirm-button-row">
                              <button
                                type="button"
                                className="copilot-confirm-btn danger"
                                onClick={() => handleExecutePendingAction(msg.content.pendingAction, i)}
                              >
                                ✓ Confirm & Execute
                              </button>
                              <button
                                type="button"
                                className="copilot-confirm-btn cancel"
                                onClick={() => handleCancelPendingAction(i)}
                              >
                                ✕ Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {/* ENTERPRISE SUCCESS CARD */}
                        {msg.actionExecuted && (
                          <div className="copilot-success-card">
                            <div className="success-card-top">
                              <span className="success-check-icon">✅</span>
                              <strong>{msg.actionTitle || 'CRM Operation Completed'}</strong>
                            </div>
                            {msg.actionEntityName && <p className="success-entity-name">{msg.actionEntityName}</p>}
                            <small className="success-time-tag">Status updated • Completed just now</small>
                          </div>
                        )}

                        {msg.actionCancelled && (
                          <div className="copilot-action-cancelled-badge">
                            ✕ Operation Cancelled
                          </div>
                        )}

                        {/* 3. COLLAPSIBLE ACCORDION FOR ADVANCED INSIGHTS & METRICS */}
                        {hasExtraDetails && (
                          <details className="copilot-insights-accordion">
                            <summary className="accordion-trigger-btn">
                              <span>✨ View Insights & Metrics</span>
                              <small>▾</small>
                            </summary>
                            <div className="accordion-content-body">
                              {isSnapshot && (
                                <div className="copilot-snapshot-card">
                                  <div className="copilot-snapshot-title">📊 Current Snapshot</div>
                                  <div className="copilot-snapshot-badges">
                                    {msg.content.snapshot.candidates !== undefined && (
                                      <span className="snapshot-badge">👥 Candidates: <b>{msg.content.snapshot.candidates}</b></span>
                                    )}
                                    {msg.content.snapshot.openJobs !== undefined && (
                                      <span className="snapshot-badge">💼 Open Jobs: <b>{msg.content.snapshot.openJobs}</b></span>
                                    )}
                                    {msg.content.snapshot.callbacks !== undefined && (
                                      <span className="snapshot-badge">📞 Callbacks: <b>{msg.content.snapshot.callbacks}</b></span>
                                    )}
                                    {msg.content.snapshot.qualified !== undefined && (
                                      <span className="snapshot-badge">🎯 Qualified: <b>{msg.content.snapshot.qualified}</b></span>
                                    )}
                                  </div>
                                </div>
                              )}

                              {msg.content.insight && (
                                <div className="copilot-insight-pill">
                                  <span className="icon">💡</span>
                                  <div className="text">
                                    <strong>Key Insight</strong>
                                    <span>{msg.content.insight}</span>
                                  </div>
                                </div>
                              )}

                              {(msg.content.nextBestAction || msg.content.recommendation) && (
                                <div className="copilot-recommendation-box">
                                  <span className="icon">🎯</span>
                                  <div className="text">
                                    <strong>Next Best Action</strong>
                                    <span>{msg.content.nextBestAction || msg.content.recommendation}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </details>
                        )}

                        {/* 4. CONTEXT-AWARE QUICK ACTION BUTTONS */}
                        {isObjContent && Array.isArray(msg.content.actions) && msg.content.actions.length > 0 && !isPendingAction && (
                          <div className="copilot-action-buttons-grid">
                            {msg.content.actions.map((act, aIdx) => (
                              <button
                                key={aIdx}
                                type="button"
                                className="copilot-rendered-action-btn"
                                disabled={copilotLoading}
                                onClick={() => handleCopilotAction(act.action, act.label)}
                              >
                                ⚡ {act.label}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* 5. SUGGESTED FOLLOW-UP QUESTION */}
                        {isObjContent && msg.content.followup && (
                          <p className="copilot-followup-text">💬 {msg.content.followup}</p>
                        )}

                        <small className="copilot-time-tag">{msg.timestamp}</small>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* HIDE ALL INTERNAL AI REASONING / SYSTEM TEXT -> SHOW ANIMATED TYPING DOTS BUBBLE */}
              {copilotLoading && (
                <div className="copilot-chat-row">
                  <div className="copilot-msg-card ai typing-indicator-card">
                    <div className="copilot-typing-wrapper">
                      <span className="ai-sparkle-typing">✨ TalentDesk AI</span>
                      <div className="bouncing-dots">
                        <span className="dot dot1" />
                        <span className="dot dot2" />
                        <span className="dot dot3" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Hide prompt chips once conversation begins */}
            {copilotMessages.length <= 1 && (
              <div className="flex items-center gap-1.5 flex-wrap px-4 pb-2 shrink-0">
                {[
                  { label: 'Close job', prompt: 'Close the Senior React Developer job' },
                  { label: 'Log callback', prompt: 'Log a callback for Alex Rivera' },
                  { label: 'Create task', prompt: 'Create a task to review submittals tomorrow' },
                ].map(chip => (
                  <button
                    key={chip.label}
                    onClick={() => !copilotLoading && handleCopilotSend(chip.prompt)}
                    disabled={copilotLoading}
                    type="button"
                    className="text-xs font-semibold text-text2 bg-surface2 border border-border rounded-full px-2.5 py-1 hover:text-text disabled:opacity-50"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 p-3 border-t border-border shrink-0">
              <Input
                placeholder={copilotLoading ? 'Processing request...' : 'Ask Copilot a question or trigger a CRM action...'}
                value={copilotQuery}
                disabled={copilotLoading}
                onChange={e => setCopilotQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !copilotLoading && handleCopilotSend()}
                className="flex-1"
              />
              <Button onClick={() => handleCopilotSend()} loading={copilotLoading} size="md">
                Send
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* CTRL+K COMMAND PALETTE */}
      {commandOpen && (
        <div className="fixed inset-0 flex items-start justify-center pt-[12vh] px-4 bg-black/60 backdrop-blur-sm" style={{ zIndex: 'var(--z-modal)' }} onClick={() => setCommandOpen(false)}>
          <div className="w-full max-w-lg bg-surface border border-border rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden animate-[modal-in_var(--duration-base)_var(--ease-standard)]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
              <Icon name="search" size={15} className="text-text3 shrink-0" />
              <input
                type="text"
                placeholder="Search candidates, jobs, clients, or run an action..."
                value={commandQuery}
                onChange={e => setCommandQuery(e.target.value)}
                autoFocus
                className="flex-1 bg-transparent border-none outline-none text-sm text-text placeholder:text-text3"
              />
              <span className="text-[10px] font-bold text-text3 bg-surface2 border border-border rounded px-1.5 py-0.5 shrink-0">ESC</span>
            </div>

            <div className="max-h-80 overflow-y-auto p-2">
              {commandQuery.trim() === '' ? (
                <div className="px-2 py-3">
                  {recentSearches.length > 0 ? (
                    <>
                      <div className="text-[10px] font-bold text-text3 uppercase tracking-wide mb-2">Recent Searches</div>
                      <div className="flex flex-wrap gap-1.5">
                        {recentSearches.map((term, i) => (
                          <button key={i} type="button" onClick={() => setCommandQuery(term)} className="text-xs font-medium text-text2 bg-surface2 border border-border rounded-full px-2.5 py-1 hover:text-text">
                            {term}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <span className="text-xs text-text3">Type to search across Candidates, Jobs &amp; Workspace Actions...</span>
                  )}
                </div>
              ) : commandResults.length === 0 ? (
                <div className="px-2 py-3 text-xs text-text3">No matches for "{commandQuery}". Try a candidate name, job title, or action.</div>
              ) : (
                commandResults.map((res, i) => {
                  const showLabel = i === 0 || commandResults[i - 1].type !== res.type
                  return (
                    <div key={i}>
                      {showLabel && <div className="text-[10px] font-bold text-text3 uppercase tracking-wide px-2 pt-2 pb-1">{commandGroupLabel[res.type]}</div>}
                      <div
                        onMouseEnter={() => setCommandActiveIndex(i)}
                        onClick={() => runCommandResult(res)}
                        className={`px-2.5 py-2 rounded-[var(--radius-sm)] cursor-pointer ${commandActiveIndex === i ? 'bg-accent/10' : ''}`}
                      >
                        <strong className="text-xs font-bold text-text block">{res.title}</strong>
                        <span className="text-[11px] text-text3">{res.meta}</span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* NOTIFICATIONS PANEL — real items only (priority focus, overdue follow-ups, pending offers) */}
      {showNotifications && (
        <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)}>
          <div
            onClick={e => e.stopPropagation()}
            className="absolute top-16 right-3 sm:right-6 w-[min(360px,calc(100vw-1.5rem))] bg-surface border border-border rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden"
            style={{ zIndex: 'var(--z-dropdown)' }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <strong className="text-sm font-bold text-text">Notifications</strong>
              <button onClick={() => setShowNotifications(false)} type="button" className="w-6 h-6 rounded-full flex items-center justify-center text-text3 hover:bg-surface2 hover:text-text">
                <Icon name="x" size={13} />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notificationItems.length === 0 ? (
                <EmptyState icon="checkCircle" title="All clear" description="No urgent items right now." className="py-8" />
              ) : (
                notificationItems.map(item => (
                  <div key={item.id} className="px-4 py-3 border-b border-border last:border-0">
                    <strong className="text-xs font-bold text-text block">{item.title}</strong>
                    <span className="text-[11px] text-text3">{item.desc}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}

const tooltipStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
  padding: '8px 12px',
}

const tooltipLabelStyle = {
  color: 'var(--text)',
  fontWeight: '700',
  fontSize: '12px',
}

const tooltipItemStyle = {
  color: 'var(--text2)',
  fontSize: '12px',
}
