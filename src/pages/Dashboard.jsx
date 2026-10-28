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
import { db } from '../lib/api'
import { computeJobHealth } from '../lib/jobHealth'
import { useAISetContext } from '../lib/ai/context'
import { runAiAction } from '../lib/ai/aiClient'
import { getUsageSummary, logUsageEvent } from '../lib/ai/usage'
import { isOverDailyLimit, useAIGovernance } from '../lib/ai/governance'
import { executeCrmAction } from '../lib/executeCrmAction'
import { runCopilotQuery } from '../lib/ai/copilotActions'
import { useAuth } from '../context/AuthContext'
import { hasPermission } from '../lib/admin/permissions'
import { useCandidates } from '../hooks/useCandidates'
import { normalizeAiPlainText } from '../lib/aiTextFormat'
import {
  Button, Card, CardHeader, KPICard, Badge, StatusPill, Table, Tabs,
  EmptyState, Skeleton, Avatar, Icon, Menu, MenuTrigger, Input,
} from '../components/ui'
import MarkdownView from '../components/MarkdownView'
import { CHART_COLORS } from '../lib/chartColors'

const STAGES = ['Submitted', 'Screening', 'Interview Scheduled', 'Client Review', 'Offer Extended', 'Hired', 'Rejected']
const COLORS = CHART_COLORS
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

  const [dashboardView, setDashboardView] = useState('overview')
  const [dashboardFiltersOpen, setDashboardFiltersOpen] = useState(false)
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

  // Only the greeting and date are shown; refresh them once per minute.
  const [currentTime, setCurrentTime] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000)
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
    } catch { return [] }
  })

  const commitRecentSearch = (term) => {
    const trimmed = (term || '').trim()
    if (!trimmed) return
    // Written synchronously (not inside a setState updater) so it isn't lost when
    // the same click also triggers navigation and unmounts this component.
    const next = [trimmed, ...recentSearches.filter(t => t.toLowerCase() !== trimmed.toLowerCase())].slice(0, 5)
    try { localStorage.setItem('td_recent_searches', JSON.stringify(next)) } catch { /* ignore quota errors */ }
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
  const [copilotTasks, setCopilotTasks] = useState([])
  const [executingAction, setExecutingAction] = useState(null)
  const copilotRequestRef = useRef(0)
  const copilotSendingRef = useRef(false)
  const executingActionRef = useRef(false)
  const copilotListRef = useRef(null)
  const { settings: aiSettings } = useAIGovernance(orgId)
  const canUseCopilot = hasPermission(profile?.role, 'AI', 'edit')
  const copilotChatEnabled = canUseCopilot && aiSettings.features.chat !== false
  const copilotOverLimit = isOverDailyLimit(aiSettings, getUsageSummary(orgId, userId).requestsToday)
  useEffect(() => () => { copilotRequestRef.current += 1 }, [])

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
      followup: "Ask about your records, or request a change using the candidate name or job requisition ID. You'll review each change before it is saved."
    },
    timestamp: 'Just now'
  }), [userFirstName])

  const [copilotMessages, setCopilotMessages] = useState([initialWelcomeMessage])
  const [loadedCopilotKey, setLoadedCopilotKey] = useState(null)
  useEffect(() => {
    const list = copilotListRef.current
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }, [copilotMessages, copilotState])

  // Recruiter Mission Board State
  const [dailyNotes, setDailyNotes] = useState([])

  // Re-sync copilot messages and daily notes when profile/organization switches
  useEffect(() => {
    if (!profile) return
    copilotRequestRef.current += 1
    copilotSendingRef.current = false
    setCopilotLoading(false)
    setLoadedCopilotKey(storagePrefix)

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

    // Restore the scratchpad before the checklist may return early.
    const padKey = `${storagePrefix}_scratchpad`
    const savedPad = localStorage.getItem(padKey)
    setScratchpad(savedPad || '')

    // 2. Sync Daily Notes
    const notesKey = `${storagePrefix}_daily_notes`
    const savedNotes = localStorage.getItem(notesKey)
    if (savedNotes) {
      try {
        const parsed = JSON.parse(savedNotes)
        if (Array.isArray(parsed)) {
          const userOnly = parsed.filter(t => !t.text?.includes('Alex Rivera') && !t.text?.includes('Perform EOD submittal audit') && !t.text?.includes('DevOps candidates') && !t.text?.includes('Sarah Jenkins'))
          setDailyNotes(userOnly)
          return
        }
      } catch { /* ignore */ }
    }

    setDailyNotes([])
  }, [profile, storagePrefix, initialWelcomeMessage])

  // Sync message changes to persistence store
  useEffect(() => {
    if (!profile || loadedCopilotKey !== storagePrefix) return
    try {
      localStorage.setItem(`${storagePrefix}_copilot_history`, JSON.stringify(copilotMessages))
    } catch (e) {
      console.error('Error saving copilot history:', e)
    }
  }, [copilotMessages, profile, storagePrefix, loadedCopilotKey])

  const handleNewChat = () => {
    if (executingActionRef.current) return
    copilotRequestRef.current += 1
    copilotSendingRef.current = false
    setCopilotLoading(false)
    setCopilotQuery('')
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


  const fetchDashboardData = () => {
    Promise.all([
      db.from('jobs').select('*').order('created_at', { ascending: false }),
      db.from('callbacks').select('*').order('date', { ascending: true }),
      db.from('followups').select('*').order('date', { ascending: true }),
      db.from('profiles').select('*').order('full_name'),
      db.from('tasks').select('*'),
    ]).then(([jobsRes, callbacksRes, followupsRes, profilesRes, tasksRes]) => {
      setJobs(jobsRes.data || [])
      setCallbacks(callbacksRes.data || [])
      setFollowups(followupsRes.data || [])
      setProfiles(profilesRes.data || [])
      setCopilotTasks(tasksRes.data || [])
    }).catch(err => {
      console.error('Failed to fetch dashboard data:', err)
    })
  }

  useEffect(() => {
    fetchDashboardData()
  }, [])

  // Dedicated CRM Action Executor — delegates to shared executeCrmAction
  const executeCrmOperation = async (pendingAction) => {
    return executeCrmAction(pendingAction, {
      candidates,
      jobs: safeJobs,
      callbacks: safeCallbacks,
      followups: safeFollowups,
      userId: authContext?.user?.id,
      orgId,
      profile,
      organization: authContext.organization,
      tasks: copilotTasks,
      onRefresh: () => { fetchDashboardData(); candidatesContext.refetch?.() },
    })
  }

  // Execute Action Call Handler
  const handleExecutePendingAction = async (pendingAction, messageIndex) => {
    if (!pendingAction || executingActionRef.current || aiSettings.features.actions === false || copilotMessages[messageIndex]?.actionExecuted || copilotMessages[messageIndex]?.actionCancelled) return
    executingActionRef.current = true
    setExecutingAction(messageIndex)

    const result = await executeCrmOperation(pendingAction)
    executingActionRef.current = false
    setExecutingAction(null)

    if (result.success) {
      setCopilotMessages(prev => prev.map((msg, idx) => {
        if (idx === messageIndex) {
          return {
            ...msg,
            actionExecuted: true,
            actionTitle: result.actionTitle || 'CRM Operation Executed',
            actionEntityName: result.actionEntityName || '',
            text: result.message,
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
    if (executingActionRef.current) return
    setCopilotMessages(prev => prev.map((msg, idx) => {
      if (idx === messageIndex) {
        return {
          ...msg,
          actionCancelled: true,
          text: 'Operation cancelled.',
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
    const pages = { open_candidates: 'candidates', open_jobs: 'jobs', open_pipeline: 'pipeline', open_callbacks: 'callbacks', open_followups: 'followups', open_tasks: 'tasks' }
    if (pages[actionKey]) {
      onNavigate?.(pages[actionKey])
    } else if (actionKey === 'generate_followup') {
      setCopilotQuery('Draft a follow-up email for ')
    } else {
      handleCopilotSend(label || actionKey)
    }
  }

  // Handle Floating Copilot Command Execution with Structured AI Reasoning & Action Payload Detection
  const handleCopilotSend = async (userPromptText) => {
    const q = (userPromptText || copilotQuery).trim()
    if (!q || copilotSendingRef.current || !copilotChatEnabled) return
    if (isOverDailyLimit(aiSettings, getUsageSummary(orgId, userId).requestsToday)) return
    copilotSendingRef.current = true
    setCopilotQuery('')
    setCopilotState('expanded')

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    const newMsg = { sender: 'user', text: q, timestamp: timeStr }
    setCopilotMessages(prev => [...prev, newMsg])
    setCopilotLoading(true)

    const epoch = ++copilotRequestRef.current
    const startedAt = Date.now()
    try {
      const structuredContent = await runCopilotQuery({ q, candidates, jobs: safeJobs, callbacks: safeCallbacks, followups: safeFollowups, tasks: copilotTasks, historyMessages: copilotMessages, organization: authContext.organization })
      if (epoch !== copilotRequestRef.current) return
      logUsageEvent(orgId, userId, { type: 'chat', source: 'dashboard_copilot', success: true, durationMs: Date.now() - startedAt, preview: structuredContent.summary.slice(0, 140) })
      setCopilotMessages(prev => {
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

    } catch (error) {
      if (epoch !== copilotRequestRef.current) return
      logUsageEvent(orgId, userId, { type: 'chat', source: 'dashboard_copilot', success: false, error: error.message })
      setCopilotMessages(prev => [
        ...prev,
        {
          sender: 'ai',
          text: error.message || 'Unable to process request. Please try again.',
          content: {
            summary: error.message || 'Unable to process request. Please try again.',
          },
          timestamp: timeStr
        }
      ])
    } finally {
      if (epoch === copilotRequestRef.current) {
        copilotSendingRef.current = false
        setCopilotLoading(false)
      }
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

  const qualifiedCount = filteredCandidates.filter(c => ['Interview Scheduled', 'Interview Done', 'Offer Extended', 'Hired'].includes(c.external_status || c.internal_status)).length

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
  const greeting = useMemo(() => {
    const hour = currentTime.getHours()
    if (hour >= 0 && hour < 12) return 'Good morning'
    if (hour >= 12 && hour < 17) return 'Good afternoon'
    return 'Good evening'
  }, [currentTime])

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
      { id: 'callbacks', label: 'Due Callbacks', count: todaysCallbacks.length, icon: 'callbacks', tone: 'accent', page: 'callbacks', helper: todaysCallbacks.length > 0 ? `${todaysCallbacks.length} scheduled today` : 'All caught up', badge: 'CALLBACKS' },
      { id: 'followups', label: 'Overdue Follow-ups', count: overdueFollowups.length, icon: 'followups', tone: 'red', page: 'followups', helper: overdueFollowups.length > 0 ? 'Needs immediate attention' : 'Nothing overdue', badge: 'URGENT' },
      { id: 'offers', label: 'Offers Awaiting Decision', count: offerCount, icon: 'reports', tone: 'yellow', page: 'candidates', helper: offerCount > 0 ? 'Follow up with candidates' : 'No pending offers', badge: 'PENDING' },
      { id: 'atrisk', label: 'At-Risk Requisitions', count: atRiskJobs.length, icon: 'jobs', tone: 'orange', page: 'jobs', helper: atRiskJobs.length > 0 ? 'Stale or under-submitted' : 'Pipeline healthy', badge: 'AT-RISK' },
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

  const dashboardPanels = {
    pipeline: (
      <Card className="dashboard-panel dashboard-panel-pipeline">
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
                  <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={{ fill: 'color-mix(in srgb, var(--accent) 4%, transparent)' }} />
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
    ),
    requisitions: (
      <Card className="dashboard-panel dashboard-panel-requisitions">
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
    ),
    todayActions: (
      <Card className="dashboard-panel dashboard-panel-todayActions">
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
    ),
    leaderboard: (
      <Card className="dashboard-panel dashboard-panel-leaderboard">
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
              pagination={false}
              compact
              columns={[
                {
                  key: 'rank', header: '#', width: '32px', render: row => {
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
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="font-bold text-text truncate">{row.name}</span>
                        {isSelected && <Badge tone="accent" size="sm">Active</Badge>}
                      </span>
                    )
                  }
                },
                { key: 'submissions', header: 'Sub', sortable: true, align: 'right', width: '56px' },
                { key: 'interviews', header: 'Int', sortable: true, align: 'right', width: '56px' },
                { key: 'offers', header: 'Offers', sortable: true, align: 'right', width: '60px' },
                { key: 'hires', header: 'Hires', sortable: true, align: 'right', width: '60px', render: row => <b className="text-green">{row.hires}</b> },
                { key: 'fillRate', header: 'Yield %', sortable: true, align: 'right', width: '88px', render: row => <Badge tone="green" size="sm" className="tabular-nums font-mono">{row.fillRate}%</Badge> },
                { key: 'aiScore', header: 'AI Score', sortable: true, align: 'right', width: '80px', render: row => <span className="text-ai font-bold text-xs">⚡{row.aiScore}</span> },
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
              mobileCard={row => {
                const medal = row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : `#${row.rank}`
                return (
                  <div className="flex items-center gap-2.5 px-3 py-2 border border-border rounded-[var(--radius-md)] bg-surface hover:bg-surface2 cursor-pointer transition-colors">
                    <span className="text-sm w-7 text-center shrink-0">{medal}</span>
                    <span className="font-semibold text-xs text-text flex-1 truncate">{row.name}</span>
                    <div className="flex items-center gap-3 shrink-0 text-[11px] text-text3">
                      <span title="Submissions"><span className="text-text font-bold">{row.submissions}</span> Sub</span>
                      <span title="Hires"><span className="text-green font-bold">{row.hires}</span> Hire</span>
                      <span title="Yield"><span className="text-green font-bold">{row.fillRate}%</span></span>
                      <span title="AI Score" className="text-ai font-bold">⚡{row.aiScore}</span>
                    </div>
                  </div>
                )
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
    ),
    snapshot: (
      <Card className="dashboard-panel dashboard-panel-snapshot" padding="sm">
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
    ),
    mission: (
      <Card className="dashboard-panel dashboard-panel-mission">
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

                <div className="flex flex-col gap-1.5 max-h-[320px] overflow-y-auto pr-1">
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

                  {completedTasks.length > 0 && (
                    <details className="group mt-1">
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
                            navigator.clipboard.writeText(normalizeAiPlainText(eodSummaryText))
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
    ),
    activity: (
      <Card className="dashboard-panel dashboard-panel-activity">
            <CardHeader title="Recent activity" subtitle="The latest movement in your workspace" />
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
    ),
    trend: (
      <Card className="dashboard-panel dashboard-panel-trend">
            <CardHeader title={`${timeRange === '30d' ? '30-Day' : timeRange === '90d' ? '90-Day' : '7-Day'} Submissions Trend`} subtitle="Submissions and follow-up activities over time" />
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="submissions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="followups" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--green)" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="var(--green)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: 'var(--text3)', fontSize: 10 }} axisLine={false} tickLine={false} interval={timeRange === '90d' ? 14 : timeRange === '30d' ? 4 : 0} />
                <YAxis tick={{ fill: 'var(--text3)', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                <Area type="monotone" dataKey="submissions" name="Submissions" stroke="var(--accent)" fill="url(#submissions)" strokeWidth={2} />
                <Area type="monotone" dataKey="followups" name="Follow-ups" stroke="var(--green)" fill="url(#followups)" strokeWidth={2} />
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
    ),
    workspace: (
      <Card className="dashboard-panel dashboard-panel-workspace">
            <CardHeader title="Requisitions &amp; Notes" subtitle="Job status breakdown &amp; autosaved call notes" />
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
    ),
  }
  const dashboardFilterCount = [Boolean(searchQuery), selectedOwners.length > 0, stageFilter !== 'All', jobStatusFilter !== 'All', timeRange !== 'all'].filter(Boolean).length
  const dashboardVisibleStats = dashboardView === 'insights' ? stats : ['Total Candidates', 'Qualified Pipeline', 'Active Requisitions', 'Offers Extended'].map(label => stats.find(stat => stat.label === label))

  return (
    <PageContainer className="overview-page dashboard-page">
      {/* EXECUTIVE HEADER */}
      <header className="overview-welcome dashboard-header">
        <div><span className="dashboard-eyebrow">YOUR RECRUITING WORKSPACE</span><h1>{greeting}, {firstName}</h1><p>{dateStr} <span aria-hidden="true">·</span> A clear view of what moves hiring forward.</p></div>
        <div className="dashboard-header-actions">
          <Button variant="secondary" leftIcon="jobs" onClick={() => onNavigate?.('jobs')}>New job</Button>
          <Button leftIcon="plus" onClick={() => onNavigate?.('candidates')}>New candidate</Button>
          <Menu align="end" items={[...quickActions, { label: 'Search workspace', icon: 'search', onClick: () => setCommandOpen(true) }, { label: 'Notifications', icon: 'bell', onClick: () => setShowNotifications(true) }]} trigger={({ toggle, open }) => <Button variant="ghost" iconOnly aria-label="More dashboard actions" aria-expanded={open} onClick={toggle}><Icon name="moreHorizontal" size={18} /></Button>} />
        </div>
      </header>

      <div className="dashboard-view-toolbar">
        <nav className="dashboard-view-tabs" aria-label="Dashboard views">{[['overview', 'Overview'], ['day', 'My day'], ['insights', 'Insights']].map(([id, label]) => <button type="button" key={id} aria-current={dashboardView === id ? 'page' : undefined} aria-controls="dashboard-content" onClick={() => { setDashboardView(id); setShowOwnerDropdown(false) }}>{label}</button>)}</nav>
        <div className="dashboard-filter-context"><span>{dashboardFilterCount ? `${dashboardFilterCount} filter${dashboardFilterCount === 1 ? '' : 's'} applied` : 'All recruiters · All time'}</span><Button size="sm" variant="secondary" leftIcon="filter" aria-expanded={dashboardFiltersOpen} aria-controls="dashboard-filters" onClick={() => { setDashboardFiltersOpen(previous => !previous); setShowOwnerDropdown(false) }}>Filters{dashboardFilterCount ? ` (${dashboardFilterCount})` : ''}</Button></div>
      </div>
      <div id="dashboard-filters" hidden={!dashboardFiltersOpen}><section className="dashboard-filter-panel flex flex-col sm:flex-row sm:items-center gap-2.5">
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

          <select aria-label="Candidate stage" value={stageFilter} onChange={e => setStageFilter(e.target.value)} className="h-9 px-2.5 rounded-[var(--radius-sm)] border border-border bg-surface2 text-xs font-semibold text-text2">
            <option value="All">All Stages</option>
            {stageOptions.filter(s => s !== 'All').map(stage => <option key={stage} value={stage}>{stage}</option>)}
          </select>

          <select aria-label="Job status" value={jobStatusFilter} onChange={e => setJobStatusFilter(e.target.value)} className="h-9 px-2.5 rounded-[var(--radius-sm)] border border-border bg-surface2 text-xs font-semibold text-text2">
            <option value="All">All Statuses</option>
            {jobStatusOptions.filter(s => s !== 'All').map(status => <option key={status} value={status}>{status}</option>)}
          </select>

          <select aria-label="Date range" value={timeRange} onChange={e => setTimeRange(e.target.value)} className="h-9 px-2.5 rounded-[var(--radius-sm)] border border-border bg-surface2 text-xs font-semibold text-text2">
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
      </section></div>

      {dashboardView !== 'day' && <section className="dashboard-metrics" aria-label="Hiring snapshot">
        {dashboardVisibleStats.map(stat => <KPICard key={stat.label} label={stat.label} value={stat.value} icon={stat.icon} tone="neutral" live={false} helper={stat.helper} trend={dashboardView === 'insights' ? stat.trend?.dir : undefined} trendValue={stat.trend ? stat.trend.dir === 'flat' ? 'No change' : `${stat.trend.dir === 'up' ? '+' : '-'}${stat.trend.pct}%` : undefined} />)}
      </section>}

      <div id="dashboard-content">
        {dashboardView === 'overview' && <div className="dashboard-overview-grid">
          <Card className="dashboard-panel dashboard-attention">
            <CardHeader title="Needs your attention" subtitle="Your next steps across the workspace" action={<Button variant="ghost" size="sm" rightIcon="arrowUpRight" onClick={() => onNavigate?.('tasks')}>View tasks</Button>} />
            <div className="dashboard-priority-list">{[...priorityWorkspaceItems].sort((a, b) => Number(b.count > 0) - Number(a.count > 0)).map(item => <button type="button" key={item.id} onClick={() => onNavigate?.(item.page)} className="dashboard-priority-row" data-attention={item.count > 0}><span className="dashboard-row-icon"><Icon name={item.icon} size={17} /></span><span><strong>{item.label}</strong><small>{item.helper}</small></span><b>{item.count}</b><Icon name="chevronRight" size={14} /></button>)}</div>
            {(todaysCallbacks.length > 0 || overdueFollowups.length > 0) && <details className="dashboard-inline-actions" open><summary>Complete calls &amp; follow-ups <Icon name="chevronDown" size={13} /></summary>{dashboardPanels.todayActions}</details>}
            <button type="button" className="dashboard-panel-link" onClick={() => setDashboardView('day')}>Open my daily checklist <Icon name="arrowUpRight" size={13} /></button>
          </Card>
          <Card className="dashboard-panel dashboard-progress">
            <CardHeader title="Hiring progress" subtitle="Candidates by recorded stage" action={<Button variant="ghost" size="sm" rightIcon="arrowUpRight" onClick={() => onNavigate?.('pipeline')}>Pipeline</Button>} />
            <div className="dashboard-stage-list">{pipelineData.map(stage => <button type="button" key={stage.rawStage} title={`${stage.count} candidates · ${stage.pct}% of filtered candidates`} onClick={() => { setStageFilter(previous => previous === stage.rawStage ? 'All' : stage.rawStage); onNavigate?.('candidates') }}><span>{stage.stage}</span><div aria-hidden="true"><i style={{ width: `${stage.count / Math.max(1, ...pipelineData.map(item => item.count)) * 100}%` }} /></div><strong>{stage.count}</strong></button>)}</div>
            <div className="dashboard-progress-footer"><span><i />{qualifiedCount} qualified candidates</span><span>{pipelineHealthPct}% of filtered candidates</span></div>
          </Card>
          {dashboardPanels.activity}
          <Card className="dashboard-panel dashboard-brief">
            <div className="dashboard-brief-label"><Icon name="sparkles" size={16} /><span>WORKSPACE BRIEF</span></div>
            <h2>{todaysFocus.title}</h2><p>{todaysFocus.desc}</p>
            <div className="dashboard-brief-facts"><span><b>{activeJobsCount}</b> open roles</span><span><b>{offerCount}</b> offers extended</span><span><b>{overdueFollowups.length}</b> overdue follow-ups</span></div>
            <div className="dashboard-brief-actions"><Button size="sm" variant="primary" leftIcon="sparkles" loading={briefingLoading} onClick={() => { setAiBriefExpanded(true); fetchAiBriefing() }}>Generate plan</Button><Button size="sm" variant="ghost" onClick={() => setAiBriefExpanded(previous => !previous)}>{aiBriefExpanded ? 'Hide details' : 'View details'}</Button></div>
            {aiBriefExpanded && <div className="dashboard-brief-details">{briefingLoading ? <p role="status">Reviewing your current recruiting metrics…</p> : aiBriefingText ? <MarkdownView content={aiBriefingText} /> : <><p>{recommendedJobLabel} is the first requisition in your current workspace list.</p><p>{atRiskCount} candidates in interview stages · {pipelineHealthPct}% qualified pipeline · Pipeline health: {pipelineHealthLabel.toLowerCase()}.</p><p>Estimated workload: ~{estimatedWorkloadHours}h for calls, follow-ups and your checklist.</p></>}</div>}
            <button type="button" className="dashboard-panel-link" onClick={() => onNavigate?.(todaysCallbacks.length > 0 ? 'callbacks' : 'candidates')}>Start working <Icon name="arrowUpRight" size={13} /></button>
          </Card>
        </div>}
        {dashboardView === 'day' && <div className="dashboard-day-view"><div className="dashboard-section-heading"><div><span className="dashboard-eyebrow">YOUR WORKING SPACE</span><h2>Make room for focused work.</h2><p>Your checklist, follow-ups and autosaved notes.</p><p className="dashboard-local-note">Checklist and scratchpad notes save in this browser.</p></div></div><div className="dashboard-day-grid"><div>{dashboardPanels.mission}</div><div className="dashboard-panel-stack">{dashboardPanels.todayActions}{dashboardPanels.workspace}</div></div></div>}
        {dashboardView === 'insights' && <div className="dashboard-insights-view"><div className="dashboard-section-heading"><div><span className="dashboard-eyebrow">THE BIGGER PICTURE</span><h2>Understand your hiring momentum.</h2><p>Use the shared filters to explore the pipeline and team performance.</p></div><span className="dashboard-score" title="Composite of pipeline health (40%), placement conversion (30%) and your checklist completion (30%)">Productivity <b>{productivityScore}/100</b></span></div><div className="dashboard-insights-grid">{dashboardPanels.pipeline}{dashboardPanels.requisitions}{dashboardPanels.trend}<div className="dashboard-performance-note"><h3>Submissions at a glance</h3>{dashboardPanels.snapshot}<p>Counts use recorded submission dates. Productivity combines pipeline health, placement conversion and daily checklist completion.</p></div><div className="dashboard-leaderboard">{dashboardPanels.leaderboard}</div></div></div>}
      </div>

      {/* SLIDE-OUT RIGHT-SIDE AI COPILOT PANEL WITH 3 WINDOW STATES (EXPANDED, MINIMIZED, CLOSED) */}
      {canUseCopilot && (copilotState === 'closed' || copilotState === 'minimized') && (
        <button
          type="button"
          onClick={() => setCopilotState('expanded')}
          title="TalentDesk AI Copilot"
          aria-label="TalentDesk AI Copilot"
          className="fixed bottom-5 right-5 rounded-full flex items-center justify-center text-white shadow-[var(--shadow-lg)] transition-all duration-200 hover:scale-105 group"
          style={{
            zIndex: 'var(--z-overlay)',
            background: 'linear-gradient(135deg, var(--accent), var(--ai))',
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

      {canUseCopilot && (copilotState === 'expanded' || copilotState === 'maximized') && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end justify-end p-0 sm:p-5" style={{ zIndex: 'var(--z-modal)' }} onClick={() => setCopilotState('minimized')}>
          <div
            onClick={e => e.stopPropagation()}
            role="dialog" aria-modal="true" aria-label="TalentDesk AI Copilot"
            className={`w-full flex flex-col bg-surface border border-border shadow-[var(--shadow-lg)] overflow-hidden ${copilotState === 'maximized' ? 'h-full sm:rounded-[var(--radius-lg)]' : 'h-[85vh] sm:h-[600px] sm:max-w-md sm:rounded-[var(--radius-lg)]'}`}
          >
            <div className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <Icon name="sparkles" size={15} className="text-ai" />
                <strong className="text-sm font-bold text-text">TalentDesk AI Copilot</strong>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={handleNewChat} disabled={executingAction !== null} type="button" title="New chat" className="w-7 h-7 rounded-[var(--radius-sm)] flex items-center justify-center text-text3 hover:bg-surface2 hover:text-text disabled:opacity-40">
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

            <div className="copilot-messages-box" ref={copilotListRef} role="log" aria-live="polite">
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
                        <div className="copilot-summary"><MarkdownView content={typeof summaryText === 'string' ? summaryText : 'No response text returned.'} /></div>

                        {/* 2. ACTION CONFIRMATION DIALOG FOR PENDING CRM OPERATIONS */}
                        {isPendingAction && !msg.actionExecuted && !msg.actionCancelled && (
                          <div className="copilot-action-confirm-card">
                            <div className="confirm-card-header">
                              <span className="confirm-icon">⚡</span>
                              <strong>{msg.content.pendingAction.confirmTitle || 'CRM Action Triggered'}</strong>
                            </div>
                            <p className="confirm-prompt">{msg.content.pendingAction.confirmPrompt || `Execute '${msg.content.pendingAction.type}' operation?`}</p>
                            <div className="text-xs text-text2 break-words my-2">{msg.content.pendingAction.entityName && <p>Record: {msg.content.pendingAction.entityName}</p>}{msg.content.pendingAction.entityId && <p className="font-mono">ID: {msg.content.pendingAction.entityId}</p>}</div>
                            {Object.keys(msg.content.pendingAction.params || {}).length > 0 && <details className="text-xs text-text3 mb-3"><summary className="cursor-pointer">Review fields</summary><dl className="mt-2 flex flex-col gap-2">{Object.entries(msg.content.pendingAction.params).filter(([, value]) => value !== null && value !== '').map(([key, value]) => <div key={key}><dt className="capitalize font-medium">{key.replace(/_/g, ' ')}</dt><dd className="text-text2 whitespace-pre-wrap break-words">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd></div>)}</dl></details>}
                            <div className="confirm-button-row">
                              <button
                                type="button"
                                className="copilot-confirm-btn danger"
                                disabled={executingAction !== null || aiSettings.features.actions === false}
                                onClick={() => handleExecutePendingAction(msg.content.pendingAction, i)}
                              >
                                {executingAction === i ? 'Saving…' : '✓ Confirm & Execute'}
                              </button>
                              <button
                                type="button"
                                className="copilot-confirm-btn cancel"
                                disabled={executingAction !== null}
                                onClick={() => handleCancelPendingAction(i)}
                              >
                                ✕ Cancel
                              </button>
                            </div>
                            {aiSettings.features.actions === false && <p className="text-xs text-text3">CRM actions are disabled in AI Preferences.</p>}
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
                            <small className="success-time-tag">Saved to CRM</small>
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
                  { label: 'Close job', prompt: 'Close job ' },
                  { label: 'Log callback', prompt: 'Log a callback for ' },
                  { label: 'Create task', prompt: 'Create a task to ' },
                ].map(chip => (
                  <button
                    key={chip.label}
                    onClick={() => setCopilotQuery(chip.prompt)}
                    disabled={copilotLoading || !copilotChatEnabled || copilotOverLimit}
                    type="button"
                    className="text-xs font-semibold text-text2 bg-surface2 border border-border rounded-full px-2.5 py-1 hover:text-text disabled:opacity-50"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            )}

            {(!copilotChatEnabled || copilotOverLimit) && <p className="px-4 pt-2 text-xs text-text3">{!copilotChatEnabled ? 'Copilot chat is disabled in AI Preferences.' : 'Daily AI request limit reached. Check AI Preferences or try again tomorrow.'}</p>}
            <div className="flex items-center gap-2 p-3 border-t border-border shrink-0">
              <Input
                autoFocus aria-label="Copilot message"
                placeholder={copilotLoading ? 'Processing request...' : 'Ask Copilot a question or trigger a CRM action...'}
                value={copilotQuery}
                disabled={copilotLoading || !copilotChatEnabled || copilotOverLimit}
                onChange={e => setCopilotQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !copilotLoading && handleCopilotSend()}
                className="flex-1"
              />
              <Button onClick={() => handleCopilotSend()} loading={copilotLoading} disabled={!copilotQuery.trim() || !copilotChatEnabled || copilotOverLimit} size="md">
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
