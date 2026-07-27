import { Fragment, useEffect, useMemo, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
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
import { useAuth } from '../context/AuthContext'
import { useCandidates } from '../hooks/useCandidates'

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

  const candidatesContext = useCandidates() || {}
  const rawCandidates = candidatesContext.candidates
  const candidates = useMemo(() => Array.isArray(rawCandidates) ? rawCandidates : [], [rawCandidates])

  const [jobs, setJobs] = useState([])
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

  // Persistent Conversation Session History in LocalStorage
  const initialWelcomeMessage = useMemo(() => ({
    sender: 'ai',
    text: "Hi Varun! I'm your TalentDesk AI Action Copilot.",
    content: {
      summary: "Hi Varun! I'm your TalentDesk AI Action Copilot. How can I assist you with candidate sourcing, pipeline analytics, or CRM operations today?",
      actions: [
        { label: "View Callbacks", action: "open_callbacks" },
        { label: "Schedule Interviews", action: "open_candidates" },
        { label: "Draft Follow-up Email", action: "generate_followup" }
      ],
      followup: "Ask me a question or try an action like 'Close job #1' or 'Log callback for Alex'."
    },
    timestamp: 'Just now'
  }), [])

  const [copilotMessages, setCopilotMessages] = useState(() => {
    const saved = localStorage.getItem('td_copilot_history')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      } catch (e) { console.error('Error parsing copilot history:', e) }
    }
    return [initialWelcomeMessage]
  })

  // Sync message changes to persistence store
  useEffect(() => {
    try {
      localStorage.setItem('td_copilot_history', JSON.stringify(copilotMessages))
    } catch (e) {
      console.error('Error saving copilot history:', e)
    }
  }, [copilotMessages])

  const handleNewChat = () => {
    setCopilotMessages([initialWelcomeMessage])
    localStorage.removeItem('td_copilot_history')
  }

  const [copilotLoading, setCopilotLoading] = useState(false)

  // AI Executive Briefing State
  const [aiBriefingText, setAiBriefingText] = useState('')
  const [briefingLoading, setBriefingLoading] = useState(false)
  const [aiBriefExpanded, setAiBriefExpanded] = useState(false)

  // Recruiter Mission Board State
  const [dailyNotes, setDailyNotes] = useState(() => {
    const saved = localStorage.getItem('td_daily_notes')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) return parsed
      } catch (e) { console.error(e) }
    }
    return [
      { id: 1, text: 'Follow up with Alex Rivera on Senior React Developer offer letter', done: false, tag: 'Offer', priority: 'High', candidate: 'Alex Rivera', job: 'Senior React Developer' },
      { id: 2, text: 'Screen 3 DevOps candidates for Acme Corp requisition', done: true, tag: 'Screening', priority: 'Medium', candidate: 'DevOps Leads', job: 'Lead DevOps Eng' },
      { id: 3, text: 'Schedule final technical interview round for candidate Sarah Jenkins', done: true, tag: 'Interview', priority: 'Urgent', candidate: 'Sarah Jenkins', job: 'Full-Stack Lead' },
      { id: 4, text: 'Perform EOD submittal audit & clean up stalled CRM leads', done: false, tag: 'EOD Review', priority: 'Normal', candidate: 'N/A', job: 'Operations' }
    ]
  })
  const [newNoteText, setNewNoteText] = useState('')
  const [noteTag, setNoteTag] = useState('Follow-up')
  const [missionTab, setMissionTab] = useState('tasks')
  const [eodSummaryText, setEodSummaryText] = useState('')
  const [eodLoading, setEodLoading] = useState(false)
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
    localStorage.setItem('td_daily_notes', JSON.stringify(updated))
    setNewNoteText('')
  }

  const handleToggleNote = (id) => {
    const updated = dailyNotes.map(n => n.id === id ? { ...n, done: !n.done } : n)
    setDailyNotes(updated)
    localStorage.setItem('td_daily_notes', JSON.stringify(updated))
  }

  const handleDeleteNote = (id) => {
    const updated = dailyNotes.filter(n => n.id !== id)
    setDailyNotes(updated)
    localStorage.setItem('td_daily_notes', JSON.stringify(updated))
    setActiveTaskMenuId(null)
  }

  const handleGenerateEODSummary = async () => {
    setEodLoading(true)
    setMissionTab('eod')
    const completed = dailyNotes.filter(n => n.done).map(n => `- [x] ${n.text} (${n.tag})`).join('\n') || 'None'
    const pending = dailyNotes.filter(n => !n.done).map(n => `- [ ] ${n.text} (${n.tag})`).join('\n') || 'None'

    const prompt = `You are a Senior Recruiting Operations Manager. Generate a concise, high-impact End of Day (EOD) Recruiter Summary & Action Plan based on the recruiter's daily notes and tasks.

RECRUITER DAILY NOTES STATUS:
COMPLETED ITEMS:
${completed}

PENDING FOLLOW-UPS:
${pending}

Format:
### 🏆 EOD Recruiter Summary & Accomplishments
- Highlighting key wins from completed notes...

### ⏳ Pending Bottlenecks & Open Tasks
- Summary of unfinished items...

### 🎯 3 Priority Actions for Tomorrow Morning
1. Action item 1...
2. Action item 2...
3. Action item 3...`

    try {
      const data = await apiRequest('/ai/generate', {
        method: 'POST',
        body: { prompt, toolId: 'copilot' }
      })
      if (data?.text) {
        setEodSummaryText(data.text)
      } else {
        setEodSummaryText('### 🏆 EOD Summary\n- All priority tasks reviewed for today.')
      }
    } catch (err) {
      console.error(err)
      setEodSummaryText('⚠️ AI service temporarily unavailable. Daily notes are saved locally.')
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
          localStorage.setItem('td_daily_notes', JSON.stringify(updated))
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
  const [scratchpad, setScratchpad] = useState(() => localStorage.getItem('td_scratchpad') || '')
  const [lastSavedTime, setLastSavedTime] = useState('Auto-saved')

  const handleScratchpadChange = (e) => {
    setScratchpad(e.target.value)
    localStorage.setItem('td_scratchpad', e.target.value)
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

  // Top Priority Job Requisitions & Health Radar — derived from real candidate/job data
  const priorityJobs = useMemo(() => {
    const now = new Date().getTime()
    return safeJobs.slice(0, 4).map(job => {
      const jobCandidates = job.job_id ? candidates.filter(c => c.job_id === job.job_id) : []
      const submittals = jobCandidates.length
      const interviews = jobCandidates.filter(c => ['Interview Scheduled', 'Interview Done'].includes(c.internal_status || c.external_status)).length
      const offers = jobCandidates.filter(c => (c.internal_status || c.external_status) === 'Offer Extended').length
      const hires = jobCandidates.filter(c => (c.internal_status || c.external_status) === 'Hired').length

      const openedAt = job.open_date || job.created_at
      const openDays = openedAt ? Math.max(0, Math.floor((now - new Date(openedAt).getTime()) / 86400000)) : 0

      // Deterministic placement-probability heuristic from this job's real funnel conversion
      const placementScore = submittals === 0
        ? 15
        : Math.min(95, Math.round(((interviews * 12 + offers * 25 + hires * 40) / submittals) + 20))

      const isStale = openDays > 14 && submittals < 3
      const priority = isStale ? 'Urgent' : (job.priority || 'Medium')

      let statusTag = 'Healthy'
      let statusTone = 'green'
      if (isStale || placementScore < 30) {
        statusTag = 'Critical'
        statusTone = 'red'
      } else if (submittals < 3 || placementScore < 55) {
        statusTag = 'At Risk'
        statusTone = 'amber'
      }

      return {
        ...job,
        priority,
        openDays,
        submittals,
        interviews,
        placementProb: `${placementScore}%`,
        statusTag,
        statusTone,
      }
    })
  }, [safeJobs, candidates])

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

  const stats = [
    { label: 'Total Candidates', value: filteredCandidates.length, helper: `+${thisWeekCount} this week`, sparkline: [12, 16, 14, 22, 28, 32, 38], tone: 'blue', trend: { dir: 'up', pct: 15 } },
    { label: 'Qualified Pipeline', value: qualifiedCount, helper: '↑12% vs last week', sparkline: [4, 6, 8, 10, 12, 15, qualifiedCount], tone: 'purple', trend: { dir: 'up', pct: 12 }, progress: { value: qualifiedCount, max: filteredCandidates.length, label: 'of total candidates qualified' } },
    { label: 'Offers Extended', value: offerCount, helper: `${conversionRate}% placement rate`, sparkline: [1, 2, 2, 3, 2, 4, offerCount], tone: 'yellow', trend: { dir: 'up', pct: 8 } },
    { label: 'Active Requisitions', value: activeJobsCount, helper: `${filteredJobs.length} total filtered`, sparkline: [8, 9, 11, 10, 12, 12, activeJobsCount], tone: 'green', trend: { dir: 'up', pct: 5 }, progress: { value: activeJobsCount, max: filteredJobs.length, label: 'of filtered requisitions open' } },
    { label: 'Rejected Candidates', value: rejectedCount, helper: 'Client declined', sparkline: [2, 4, 3, 5, 4, 6, rejectedCount], tone: 'red', trend: { dir: 'down', pct: 3 } },
    { label: 'Pending Tasks', value: pendingCallbacks.length + dueFollowups.length, helper: `${todaysCallbacks.length} calls today`, sparkline: [10, 8, 6, 7, 5, 4, pendingCallbacks.length], tone: 'orange', trend: { dir: 'down', pct: 15 } },
  ]

  const firstName = profile?.full_name?.split(' ')[0] || 'there'
  const dateStr = currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const timeStr = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const avatarInitial = (profile?.full_name || 'U').charAt(0).toUpperCase()

  // Fetch Live AI Executive Briefing from backend
  const fetchAiBriefing = async () => {
    setBriefingLoading(true)
    const prompt = `Workspace Recruitment Metrics Snapshot:
- Total Candidates: ${filteredCandidates.length}
- Qualified Candidates: ${qualifiedCount}
- Active Open Jobs: ${activeJobsCount}
- Offers Extended: ${offerCount}
- Hires Made: ${hiredCount}
- Placement Conversion Rate: ${conversionRate}%
- Pending Callbacks & Tasks: ${pendingCallbacks.length + dueFollowups.length} (${todaysCallbacks.length} scheduled today)
- Overdue Tasks: ${overdueFollowups.length}
- Top Recruiter: ${recruiterData[0]?.name || 'Team'} (${recruiterData[0]?.submissions || 0} submittals, ${recruiterData[0]?.hires || 0} hires)

Provide a 2-3 sentence strategic executive briefing for the recruitment team. Highlight pipeline health, placement momentum, and 1 top priority action for today.`

    try {
      const data = await apiRequest('/ai/generate', {
        method: 'POST',
        body: { prompt, toolId: 'dashboard' }
      })

      if (data?.text) {
        setAiBriefingText(data.text)
      }
    } catch (err) {
      console.warn('AI Briefing request failed:', err.message)
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

  return (
    <div className="dashboard-page ai-command-center-page">
      {/* 1. GLASSMORTHIC EXECUTIVE COMMAND BAR */}
      <header className="dash-executive-bar">
        <div className="dash-bar-left">
          <div className="dash-avatar-ring-glow">{avatarInitial}</div>
          <div className="dash-greeting-box">
            <div className="dash-greeting-row">
              <h1>Good Morning, {firstName} 👋</h1>
              <span className="dash-time-badge">🕒 {timeStr}</span>
            </div>
            <p className="dash-greeting-sub">
              TalentDesk AI Command Center • <span>{dateStr}</span> • <b>94/100</b> Productivity Score
            </p>
          </div>
        </div>

        <div className="dash-bar-right">
          <div className="dash-quick-kpi-pill">
            <span className="dash-kpi-chip green" onClick={() => onNavigate && onNavigate('jobs')}>
              <b>{activeJobsCount}</b> Active Jobs
            </span>
            <span className="dash-kpi-chip purple" onClick={() => onNavigate && onNavigate('candidates')}>
              <b>{qualifiedCount}</b> Qualified
            </span>
            <span className="dash-kpi-chip orange" onClick={() => onNavigate && onNavigate('callbacks')}>
              <b>{pendingCallbacks.length + dueFollowups.length}</b> Due Tasks
            </span>
          </div>

          <div className="dash-top-actions">
            <button className="dash-command-trigger" onClick={() => setCommandOpen(true)} type="button" title="Open Command Palette (Ctrl+K)">
              <span className="cmd-icon">⌘K</span>
              <span>Search...</span>
            </button>
            <button className="dash-notif-trigger" onClick={() => setShowNotifications(prev => !prev)} type="button">
              🔔 <span className="notif-badge">3</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. UNIFIED COHESIVE TOP COMMAND CENTER CARD */}
      <div className="dash-unified-command-center">
        {/* UNIFIED AI EXECUTIVE BRIEFING HERO */}
        <section className="dash-ai-executive-panel">
          <div className="ai-executive-header">
            <div className="ai-brand-group">
              <span className="ai-sparkle-animated">✨</span>
              <strong>Today's Recruiting Brief</strong>
              <span className="ai-tag-live">AI COPILOT</span>
            </div>
          </div>

          <ul className="ai-brief-list">
            <li className="ai-brief-item">
              <span className="brief-dot blue" />
              <span>{todaysFocus.title}</span>
            </li>
            <li className="ai-brief-item">
              <span className="brief-dot red" />
              <span>{atRiskCount} candidate{atRiskCount === 1 ? '' : 's'} awaiting recruiter feedback</span>
            </li>
            <li className="ai-brief-item">
              <span className="brief-dot amber" />
              <span>{recommendedJobLabel} requires additional submittals this week</span>
            </li>
            <li className="ai-brief-item">
              <span className="brief-dot green" />
              <span>Pipeline Health: <b>{pipelineHealthLabel}</b> ({pipelineHealthPct}% yield)</span>
            </li>
            <li className="ai-brief-item muted">
              <span className="brief-dot purple" />
              <span>Estimated workload: <b>{estimatedWorkloadHours}h</b> to clear today's queue</span>
            </li>
          </ul>

          <div className="ai-brief-actions">
            <button
              className="ai-brief-action-btn primary"
              type="button"
              onClick={() => onNavigate && onNavigate(todaysCallbacks.length > 0 ? 'callbacks' : 'candidates')}
            >
              Start Working
            </button>
            <button className="ai-brief-action-btn" onClick={() => setAiBriefExpanded(!aiBriefExpanded)} type="button">
              {aiBriefExpanded ? 'Collapse Brief ▲' : 'Expand Brief ▼'}
            </button>
            <button className="ai-brief-action-btn ai" onClick={fetchAiBriefing} disabled={briefingLoading} type="button">
              {briefingLoading ? '⚡ Synthesizing...' : '⚡ Generate AI Plan'}
            </button>
          </div>

          {aiBriefExpanded && (
            <div className="ai-expanded-insight-box">
              {briefingLoading ? (
                <p className="briefing-loading-text">Synthesizing live candidate pipeline health & recruiter workload...</p>
              ) : (
                <p>{aiBriefingText || `Pipeline health is operating at ${pipelineHealthPct}% yield with ${qualifiedCount} qualified candidates in stage. Priority action today: execute ${todaysCallbacks.length} scheduled recruiter calls and review ${activeJobsCount} open requisitions.`}</p>
              )}
            </div>
          )}
        </section>

        {/* SUBTLE INNER SEPARATOR DIVIDER */}
        <div className="dash-command-divider" />

        {/* HORIZONTALLY SCROLLABLE QUICK ACTION TOOLBAR — tiered by importance */}
        <section className="dash-quick-actions-bar">
          <div className="quick-actions-group primary-group">
            <button onClick={() => onNavigate && onNavigate('candidates')} className="quick-action-item primary" type="button">
              <span className="action-icon">👤</span>
              <span>New Candidate</span>
            </button>
            <button onClick={() => onNavigate && onNavigate('pipeline')} className="quick-action-item primary" type="button">
              <span className="action-icon">📤</span>
              <span>Submit Candidate</span>
            </button>
            <button onClick={() => onNavigate && onNavigate('candidates')} className="quick-action-item primary" type="button">
              <span className="action-icon">📅</span>
              <span>Schedule Interview</span>
            </button>
          </div>
          <div className="quick-actions-group secondary-group">
            <button onClick={() => onNavigate && onNavigate('jobs')} className="quick-action-item secondary" type="button">
              <span className="action-icon">💼</span>
              <span>New Job</span>
            </button>
            <button onClick={() => onNavigate && onNavigate('callbacks')} className="quick-action-item secondary" type="button">
              <span className="action-icon">📞</span>
              <span>Log Call</span>
            </button>
            <button onClick={() => handleCopilotSend('Search top React candidates submitted this week')} className="quick-action-item secondary ai" type="button">
              <span className="action-icon">⚡</span>
              <span>AI Search</span>
            </button>
            <button onClick={() => handleCopilotSend('Generate precision Boolean search string for Senior React Developer')} className="quick-action-item secondary ai" type="button">
              <span className="action-icon">🔍</span>
              <span>Generate Boolean</span>
            </button>
          </div>
        </section>

        {/* SUBTLE INNER SEPARATOR DIVIDER */}
        <div className="dash-command-divider" />

        {/* CONSOLIDATED SINGLE 1-LINE SEARCH & FILTER TOOLBAR */}
        <section className="dash-single-line-toolbar">
          <div className="dash-toolbar-left-group">
            <div className="dash-search-compact">
              <span className="search-icon">🔍</span>
              <input 
                type="text" 
                placeholder="Search candidates, jobs, clients... (Ctrl+K)" 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && <button onClick={() => setSearchQuery('')} className="clear-btn" type="button">×</button>}
            </div>

            <div className="dash-filter-dropdown-pill">
              <button
                ref={recruiterBtnRef}
                type="button"
                className="filter-trigger-btn"
                onClick={() => {
                  if (!showOwnerDropdown && recruiterBtnRef.current) {
                    const r = recruiterBtnRef.current.getBoundingClientRect()
                    setRecruiterPos({ top: r.bottom + 6, left: r.left })
                  }
                  setShowOwnerDropdown(prev => !prev)
                }}
              >
                <span>👤 {selectedOwners.length === 0 ? 'All Recruiters' : `${selectedOwners.length} Selected`}</span>
                <small>▾</small>
              </button>
            </div>

            {showOwnerDropdown && createPortal(
              <div
                onClick={e => e.stopPropagation()}
                onMouseDown={e => e.stopPropagation()}
                style={{
                  position: 'fixed',
                  top: recruiterPos.top,
                  left: recruiterPos.left,
                  width: 260,
                  zIndex: 2147483647,
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  boxShadow: '0 12px 40px rgba(15,23,42,0.22), 0 2px 8px rgba(15,23,42,0.08)',
                  padding: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  maxHeight: 300,
                  overflow: 'hidden',
                }}
              >
                <input
                  autoFocus
                  type="text"
                  placeholder="Search recruiters..."
                  value={recruiterSearch}
                  onChange={e => setRecruiterSearch(e.target.value)}
                  style={{
                    width: '100%', padding: '7px 10px',
                    border: '1px solid #cbd5e1', borderRadius: 8,
                    fontSize: 12, color: '#0f172a', background: '#f8fafc',
                    outline: 'none', boxSizing: 'border-box', flexShrink: 0
                  }}
                />
                <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <label style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 8px', borderRadius:6, cursor:'pointer', fontSize:12.5, color:'#334155' }}>
                    <input type="checkbox" checked={selectedOwners.length === 0} onChange={() => setSelectedOwners([])} style={{ accentColor:'#2563eb', width:15, height:15 }} />
                    <span>All recruiters</span>
                  </label>
                  <div style={{ height:1, background:'#e2e8f0', margin:'2px 0' }} />
                  {filteredRecruiterOptions.map(([id, name]) => {
                    const isChecked = selectedOwners.includes(id)
                    return (
                      <label key={id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 8px', borderRadius:6, cursor:'pointer', fontSize:12.5, color:'#334155', transition:'background 0.1s' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => setSelectedOwners(prev => isChecked ? prev.filter(i => i !== id) : [...prev, id])}
                          style={{ accentColor:'#2563eb', width:15, height:15 }}
                        />
                        <span>{name}</span>
                      </label>
                    )
                  })}
                </div>
              </div>,
              document.body
            )}

            <div className="dash-select-compact">
              <span>📊</span>
              <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
                <option value="All">All Stages</option>
                {stageOptions.filter(s => s !== 'All').map(stage => <option key={stage} value={stage}>{stage}</option>)}
              </select>
            </div>

            <div className="dash-select-compact">
              <span>💼</span>
              <select value={jobStatusFilter} onChange={e => setJobStatusFilter(e.target.value)}>
                <option value="All">All Statuses</option>
                {jobStatusOptions.filter(s => s !== 'All').map(status => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>

            {/* Time Range Selector */}
            <div className="dash-select-compact">
              <span>📅</span>
              <select value={timeRange} onChange={e => setTimeRange(e.target.value)}>
                <option value="all">All Time</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="90d">Last 90 Days</option>
              </select>
            </div>

            {(searchQuery || selectedOwners.length > 0 || stageFilter !== 'All' || jobStatusFilter !== 'All' || timeRange !== 'all') && (
              <button className="dash-reset-compact-btn" type="button" onClick={() => { setTimeRange('all'); setSelectedOwners([]); setStageFilter('All'); setJobStatusFilter('All'); setSearchQuery('') }}>
                ↺ Reset
              </button>
            )}
          </div>

          <div className="dash-toolbar-right-meta">
            <span><b>{filteredCandidates.length}</b> Candidates</span> • <span><b>{filteredJobs.length}</b> Jobs</span>
          </div>
        </section>
      </div>

      {/* 5. KPI STAT CARDS WITH MINI SVG SPARKLINES */}
      <section className="dash-kpi-grid">
        {stats.map(stat => (
          <article className={`dash-kpi-card ${stat.tone}`} key={stat.label}>
            <div className="kpi-top">
              <span>{stat.label}</span>
              {stat.trend && (
                <span className={`kpi-trend ${stat.trend.dir}`}>
                  {stat.trend.dir === 'up' ? '↑' : '↓'} {stat.trend.pct}%
                </span>
              )}
            </div>
            <div className="kpi-mid-row">
              <strong>{stat.value}</strong>
              <svg className="mini-sparkline" viewBox="0 0 100 30">
                <path
                  d={`M 0 ${30 - stat.sparkline[0]} Q 15 ${30 - stat.sparkline[1]}, 30 ${30 - stat.sparkline[2]} T 60 ${30 - stat.sparkline[4]} T 100 ${30 - stat.sparkline[6]}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                />
              </svg>
            </div>
            <small>{stat.helper}</small>
            {stat.progress && stat.progress.max > 0 && (
              <div className="kpi-progress-track" title={`${stat.progress.value} ${stat.progress.label || ''}`}>
                <div
                  className="kpi-progress-fill"
                  style={{ width: `${Math.min(100, Math.round((stat.progress.value / stat.progress.max) * 100))}%` }}
                />
              </div>
            )}
          </article>
        ))}
      </section>

      {/* 6. MAIN WORKFLOW 2-COLUMN GRID */}
      <section className="dash-main-columns">
        {/* Left Column: Funnel, Priority Jobs, Performance Table */}
        <div className="dash-col">
          {/* REFINED INTERACTIVE CONNECTED PIPELINE FLOW VISUALIZATION */}
          <Panel
            title="Interactive Pipeline Flow Visualization"
            subtitle="Connected candidate funnel · Click any stage to filter workspace"
            action={
              <button
                type="button"
                className="panel-ai-action-btn"
                onClick={() => handleCopilotSend('Explain the current pipeline bottlenecks and recommend actions to improve conversion')}
              >
                ✨ Explain Bottlenecks
              </button>
            }
          >
            <div className="pipeline-flow-connected-strip">
              {pipelineData.map((stg, i) => {
                const isSelected = stageFilter === stg.rawStage
                return (
                  <div key={stg.stage} className="pipeline-flow-step-wrapper">
                    <div
                      className={`pipeline-flow-chip compact ${isSelected ? 'selected' : ''}`}
                      onClick={() => {
                        setStageFilter(prev => prev === stg.rawStage ? 'All' : stg.rawStage)
                        onNavigate && onNavigate('candidates')
                      }}
                      onMouseEnter={() => setHoveredStage(stg.rawStage)}
                      onMouseLeave={() => setHoveredStage(prev => prev === stg.rawStage ? null : prev)}
                      title={`Filter candidates by ${stg.stage} • Avg Time: ${stg.avgDays} days • Drop-off: ${stg.dropOff}`}
                    >
                      <div className="chip-header">
                        <span className="dot" style={{ background: stg.color }} />
                        <span className="name">{stg.stage}</span>
                      </div>
                      <div className="chip-metrics">
                        <b className="count">{stg.count}</b>
                        <span className="pct">{stg.pct}%</span>
                      </div>
                    </div>
                    {i < pipelineData.length - 1 && (
                      <span className="pipeline-flow-arrow" title="Next funnel stage">→</span>
                    )}
                  </div>
                )
              })}
            </div>

            {/* PROGRESSIVE DISCLOSURE: stage detail rail, revealed on hover (falls back to the selected stage) */}
            {(() => {
              const focusStage = pipelineData.find(s => s.rawStage === (hoveredStage || stageFilter))
              return (
                <div className="pipeline-detail-rail">
                  {focusStage ? (
                    <>
                      <span className="pipeline-detail-stage" style={{ '--stage-hue': focusStage.color }}>{focusStage.stage}</span>
                      <span className="pipeline-detail-metric">Avg time in stage: <b>{focusStage.avgDays} days</b></span>
                      <span className="pipeline-detail-metric">Drop-off: <b>{focusStage.dropOff}</b></span>
                      <span className="pipeline-detail-metric">{focusStage.count} candidates · {focusStage.pct}% of pipeline</span>
                    </>
                  ) : (
                    <span className="pipeline-detail-hint">Hover a stage for avg time & drop-off, or click to filter</span>
                  )}
                </div>
              )
            })()}

            {/* COMPRESSED 145PX SUPPORTING BAR CHART */}
            <div className="dashboard-chart compact-chart">
              <ResponsiveContainer width="100%" height={145}>
                <BarChart data={pipelineData}>
                  <CartesianGrid stroke="rgba(226,232,240,0.6)" vertical={false} />
                  <XAxis dataKey="stage" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={{ fill: 'rgba(37,99,235,0.04)' }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={20}>
                    {pipelineData.map(item => <Cell key={item.stage} fill={item.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          {/* Top Priority Jobs & Requisition Health Cards */}
          <Panel
            title="Top Priority Requisition Health Radar"
            subtitle="Active job requirements, submittal pace & placement probability"
            action={
              <button
                type="button"
                className="panel-ai-action-btn"
                onClick={() => handleCopilotSend('Explain which requisitions are most at risk and why, based on the priority job health radar')}
              >
                ✨ Explain Risk
              </button>
            }
          >
            <div className="job-health-grid">
              {priorityJobs.map(job => (
                <div key={job.id} className={`job-health-card ${job.statusTone}`}>
                  <div className="job-health-top">
                    <span className={`priority-badge ${job.priority.toLowerCase()}`}>{job.priority} Priority</span>
                    <span className={`status-indicator-dot ${job.statusTone}`} title={`Status: ${job.statusTag}`} />
                  </div>
                  <strong className="job-title">{job.title}</strong>
                  <span className="job-client">{job.client || 'Client Account'} · {job.openDays} days open</span>
                  <div className="job-health-stats">
                    <span><b>{job.submittals}</b> Sub</span>
                    <span><b>{job.interviews}</b> Int</span>
                    <span className="green-text"><b>{job.placementProb}</b> Prob</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          {/* Action Center & Today's Tasks */}
          <Panel title="Today's Priority Action Center" subtitle="Complete pending callbacks and follow-ups inline">
            <div className="dashboard-work-list interactive-action-list">
              {[...todaysCallbacks.slice(0, 4), ...overdueFollowups.slice(0, 4)].length === 0 ? (
                <div className="dash-empty-action-center">
                  <span className="empty-celebrate-icon">🎉</span>
                  <strong>You're all caught up.</strong>
                  <p>No pending callbacks or follow-ups today.</p>
                  <div className="empty-suggested-actions">
                    <button type="button" onClick={() => onNavigate && onNavigate('candidates')}>Review Pipeline</button>
                    <button type="button" onClick={() => handleCopilotSend('Draft candidate outreach for open requisitions')}>Generate Outreach</button>
                    <button type="button" onClick={() => handleCopilotSend('Search passive candidates for our top open roles')}>Search Passive Candidates</button>
                  </div>
                </div>
              ) : (
                <>
                  {todaysCallbacks.slice(0, 4).map(item => (
                    <div className="action-task-card yellow" key={`c-${item.id}`}>
                      <div className="task-content">
                        <strong>📞 Callback: {item.candidate_name}</strong>
                        <small>{item.time || 'Schedule'} · {item.phone || 'No phone'}</small>
                      </div>
                      <div className="task-actions">
                        {item.phone && (
                          <a href={`tel:${item.phone}`} className="task-action-btn phone-btn" title="Call candidate">
                            📞
                          </a>
                        )}
                        <button onClick={() => handleCompleteCallback(item.id)} className="task-action-btn check-btn" title="Mark Done" type="button">
                          ✓
                        </button>
                      </div>
                    </div>
                  ))}
                  {overdueFollowups.slice(0, 4).map(item => (
                    <div className="action-task-card red" key={`f-${item.id}`}>
                      <div className="task-content">
                        <strong>🔔 Follow-up: {item.candidate_name}</strong>
                        <small>{item.date} · {item.priority || 'Medium'} priority</small>
                      </div>
                      <div className="task-actions">
                        <button onClick={() => handleCompleteFollowup(item.id)} className="task-action-btn check-btn" title="Mark Done" type="button">
                          ✓
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </Panel>

          {/* Recruiter Performance Table */}
          <Panel 
            title="Recruiter Performance Analytics Table" 
            subtitle="Real-time team submittals, interviews & placement conversion rankings"
            action={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {selectedOwners.length > 0 && (
                  <button
                    type="button"
                    className="dash-table-reset-btn"
                    onClick={() => setSelectedOwners([])}
                    title="Clear recruiter selection to view all recruiters"
                  >
                    ↺ Reset View ({selectedOwners.length} Selected)
                  </button>
                )}
                <button
                  type="button"
                  className="panel-ai-action-btn"
                  onClick={() => handleCopilotSend('Explain why recruiter productivity and performance changed this period')}
                >
                  ✨ Explain Productivity
                </button>
              </div>
            }
          >
            {selectedOwners.length > 0 && (
              <div className="table-active-filter-banner">
                <div className="filter-banner-info">
                  <span className="filter-badge-icon">🔍</span>
                  <span>Filtered analytics for: <strong>{selectedOwnerNamesStr}</strong></span>
                </div>
                <button 
                  type="button" 
                  className="filter-banner-clear-btn"
                  onClick={() => setSelectedOwners([])}
                >
                  ✕ Clear Filter (Show All)
                </button>
              </div>
            )}
            <div className="leaderboard-table-wrapper">
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th className="sortable-th" onClick={() => setTableSortKey(null)} title="Reset to default ranking">Rank</th>
                    <th className="sortable-th" onClick={() => handleTableSort('name')}>
                      Recruiter {tableSortKey === 'name' && (tableSortDir === 'asc' ? '▲' : '▼')}
                    </th>
                    <th className="sortable-th" onClick={() => handleTableSort('submissions')}>
                      Submittals {tableSortKey === 'submissions' && (tableSortDir === 'asc' ? '▲' : '▼')}
                    </th>
                    <th className="sortable-th" onClick={() => handleTableSort('interviews')}>
                      Interviews {tableSortKey === 'interviews' && (tableSortDir === 'asc' ? '▲' : '▼')}
                    </th>
                    <th className="sortable-th" onClick={() => handleTableSort('offers')}>
                      Offers {tableSortKey === 'offers' && (tableSortDir === 'asc' ? '▲' : '▼')}
                    </th>
                    <th className="sortable-th" onClick={() => handleTableSort('hires')}>
                      Hires {tableSortKey === 'hires' && (tableSortDir === 'asc' ? '▲' : '▼')}
                    </th>
                    <th className="sortable-th" onClick={() => handleTableSort('fillRate')}>
                      Yield % {tableSortKey === 'fillRate' && (tableSortDir === 'asc' ? '▲' : '▼')}
                    </th>
                    <th className="sortable-th" onClick={() => handleTableSort('aiScore')}>
                      AI Score {tableSortKey === 'aiScore' && (tableSortDir === 'asc' ? '▲' : '▼')}
                    </th>
                    <th className="expand-th" aria-label="Expand row" />
                  </tr>
                </thead>
                <tbody>
                  {sortedRecruiterData.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="empty-td">
                        No submittals in selected timeframe
                        {selectedOwners.length > 0 && (
                          <div style={{ marginTop: 8 }}>
                            <button
                              type="button"
                              className="dash-table-reset-btn"
                              onClick={() => setSelectedOwners([])}
                            >
                              ↺ Reset Filter
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : (
                    sortedRecruiterData.map(row => {
                      const ownerMatch = ownerOptions.find(([id, name]) => name === row.name)
                      const ownerId = ownerMatch ? ownerMatch[0] : null
                      const isSelected = ownerId && selectedOwners.includes(ownerId)
                      const isExpanded = expandedRecruiterName === row.name
                      const medal = row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : null

                      return (
                        <Fragment key={row.name}>
                          <tr
                            className={`clickable-row ${isSelected ? 'selected-row' : ''}`}
                            onClick={() => {
                              if (ownerId) {
                                setSelectedOwners(prev => prev.includes(ownerId) ? [] : [ownerId])
                              }
                            }}
                            title={isSelected ? "Click to deselect and view all recruiters" : `Click to filter analytics by ${row.name}`}
                          >
                            <td><span className={`rank-pill ${medal ? 'medal' : ''}`}>{medal || `#${row.rank}`}</span></td>
                            <td>
                              <div className="recruiter-name-cell">
                                <strong>{row.name}</strong>
                                {isSelected && <span className="selected-active-pill">Active</span>}
                              </div>
                            </td>
                            <td><b>{row.submissions}</b></td>
                            <td>{row.interviews}</td>
                            <td>{row.offers}</td>
                            <td><b className="green-text">{row.hires}</b></td>
                            <td><span className="yield-badge">{row.fillRate}%</span></td>
                            <td><span className="ai-score-pill">⚡ {row.aiScore}</span></td>
                            <td>
                              <button
                                type="button"
                                className="row-expand-btn"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setExpandedRecruiterName(prev => prev === row.name ? null : row.name)
                                }}
                                title={isExpanded ? 'Hide funnel breakdown' : 'Show funnel breakdown'}
                              >
                                {isExpanded ? '▲' : '▾'}
                              </button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="row-expand-detail">
                              <td colSpan="9">
                                <div className="recruiter-mini-trend">
                                  {[
                                    { label: 'Submittals', value: row.submissions, tone: 'blue' },
                                    { label: 'Interviews', value: row.interviews, tone: 'purple' },
                                    { label: 'Offers', value: row.offers, tone: 'yellow' },
                                    { label: 'Hires', value: row.hires, tone: 'green' },
                                  ].map(bar => (
                                    <div className="mini-trend-bar-row" key={bar.label}>
                                      <span className="mini-trend-label">{bar.label}</span>
                                      <div className="mini-trend-track">
                                        <div
                                          className={`mini-trend-fill ${bar.tone}`}
                                          style={{ width: `${Math.min(100, Math.round((bar.value / Math.max(row.submissions, 1)) * 100))}%` }}
                                        />
                                      </div>
                                      <span className="mini-trend-value">{bar.value}</span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        {/* Right Column: Mission Board, Activity Feed & Workspace */}
        <div className="dash-col">
          {/* REFINED RECRUITER MISSION BOARD */}
          <Panel title="Recruiter Mission Board" subtitle="Track daily action items & auto-generate EOD briefings">
            <div className="todo-panel-wrapper">
              {/* COMPRESSED UNIFIED ACTION BAR */}
              <div className="todo-nav-row compact-action-bar">
                <div className="todo-tabs">
                  <button type="button" className={`todo-tab-btn ${missionTab === 'tasks' ? 'active' : ''}`} onClick={() => setMissionTab('tasks')}>
                    📝 Daily Checklist ({pendingTasks.length})
                  </button>
                  <button type="button" className={`todo-tab-btn ${missionTab === 'eod' ? 'active' : ''}`} onClick={() => setMissionTab('eod')}>
                    ⚡ EOD AI Briefing
                  </button>
                </div>

                <button type="button" className="ai-eod-generate-btn compact" onClick={handleGenerateEODSummary} disabled={eodLoading}>
                  {eodLoading ? '⚡ Synthesizing...' : '✨ Generate AI EOD'}
                </button>
              </div>

              {missionTab === 'tasks' && (
                <div className="todo-content">
                  {/* WIDER INPUT FIELD WITH COMPACT ADD BUTTON */}
                  <form className="todo-add-form compact-form" onSubmit={handleAddNote}>
                    <select value={noteTag} onChange={e => setNoteTag(e.target.value)} className="todo-tag-select">
                      <option value="Follow-up">📌 Follow-up</option>
                      <option value="Call">📞 Call</option>
                      <option value="Screening">🔍 Screening</option>
                      <option value="Interview">📅 Interview</option>
                      <option value="Offer">💼 Offer</option>
                      <option value="EOD Review">📝 EOD Review</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Add recruiter action item..."
                      value={newNoteText}
                      onChange={e => setNewNoteText(e.target.value)}
                      className="todo-input-field flex-grow"
                      required
                    />
                    <button type="submit" className="todo-add-btn compact">
                      + Add
                    </button>
                  </form>

                  {/* ACTIVE PENDING TASKS WITH CLEAR HIERARCHY */}
                  <div className="todo-items-list">
                    {pendingTasks.length === 0 ? (
                      <div className="todo-empty-state">
                        <span className="celebrate-icon">🎉</span>
                        <strong>All pending tasks completed!</strong>
                        <p>Add a new task above or generate your EOD AI briefing.</p>
                      </div>
                    ) : (
                      pendingTasks.map(item => (
                        <div key={item.id} className="todo-item-card enhanced">
                          <span className="task-drag-handle" title="Drag to reorder">⋮⋮</span>
                          <label className="todo-checkbox-label">
                            <input
                              type="checkbox"
                              checked={item.done}
                              onChange={() => handleToggleNote(item.id)}
                              className="todo-checkbox"
                            />
                            <span className={`todo-tag-pill ${item.tag.toLowerCase().replace(/\s+/g, '-')}`}>
                              {item.tag}
                            </span>
                            <div className="task-text-group">
                              <span className="todo-item-text">{item.text}</span>
                              <div className="task-meta-row">
                                {item.priority && (
                                  <span className={`priority-badge ${item.priority.toLowerCase()}`}>{item.priority}</span>
                                )}
                                <span className="task-effort-chip">⏱ {TASK_EFFORT_MINUTES[item.tag] || 15} min</span>
                                <span className="task-due-chip">Due Today</span>
                                {item.candidate && (
                                  <small className="task-sub-ref">{item.candidate} · {item.job || 'Requisition'}</small>
                                )}
                              </div>
                            </div>
                          </label>

                          <div className="task-quick-actions">
                            <button type="button" onClick={() => onNavigate && onNavigate('candidates')} title="Open in workspace">
                              View
                            </button>
                            <button type="button" onClick={() => handleCopilotSend(`Draft a follow-up for: ${item.text}`)} title="AI Draft">
                              AI
                            </button>
                          </div>

                          <div className="task-context-menu-wrapper">
                            <button 
                              type="button" 
                              className="task-options-trigger-btn"
                              onClick={() => setActiveTaskMenuId(prev => prev === item.id ? null : item.id)}
                              title="Task options"
                            >
                              ⋮
                            </button>
                            {activeTaskMenuId === item.id && (
                              <div className="task-options-dropdown">
                                <button type="button" onClick={() => { handleToggleNote(item.id); setActiveTaskMenuId(null) }}>
                                  ✓ Mark Complete
                                </button>
                                <button type="button" onClick={() => handleDeleteNote(item.id)}>
                                  🗑 Delete Task
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* COLLAPSED COMPLETED TASKS SECTION */}
                  {completedTasks.length > 0 && (
                    <details className="completed-tasks-collapsible">
                      <summary className="completed-tasks-summary">
                        <span>✓ Completed Today ({completedTasks.length})</span>
                        <small>▾</small>
                      </summary>
                      <div className="completed-tasks-list">
                        {completedTasks.map(item => (
                          <div key={item.id} className="todo-item-card completed">
                            <label className="todo-checkbox-label">
                              <input
                                type="checkbox"
                                checked={item.done}
                                onChange={() => handleToggleNote(item.id)}
                                className="todo-checkbox"
                              />
                              <span className="todo-item-text">{item.text}</span>
                            </label>
                            <button type="button" className="todo-delete-btn" onClick={() => handleDeleteNote(item.id)} title="Delete Note">
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}

              {missionTab === 'eod' && (
                <div className="todo-eod-content">
                  {eodLoading && (
                    <div className="ai-loading-box">
                      <div className="loading-pulse" />
                      <p>AI is synthesizing your daily accomplishments & priority EOD plan...</p>
                    </div>
                  )}
                  {!eodLoading && !eodSummaryText && (
                    <div className="ai-placeholder-box">
                      <div className="placeholder-icon">⚡</div>
                      <h5>EOD AI Summary Ready</h5>
                      <p>Click <strong>Generate AI EOD</strong> to auto-synthesize your daily accomplishments and tomorrow's priority checklist.</p>
                    </div>
                  )}
                  {!eodLoading && eodSummaryText && (
                    <div className="ai-output-content">
                      <MarkdownView content={eodSummaryText} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </Panel>

          {/* Activity Stream Feed with Hover Quick Actions */}
          <Panel title="Real-Time Workspace Activity Feed" subtitle="Chronological submittals, callbacks & follow-ups">
            <div className="activity-feed-filters">
              {[
                { key: 'all', label: 'All' },
                { key: 'submission', label: 'Submissions' },
                { key: 'callback', label: 'Callbacks' },
                { key: 'followup', label: 'Follow-ups' },
              ].map(f => (
                <button
                  key={f.key}
                  type="button"
                  className={`activity-filter-chip ${activityFilter === f.key ? 'active' : ''}`}
                  onClick={() => setActivityFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
              <button
                type="button"
                className="activity-filter-chip ai"
                onClick={() => handleCopilotSend("Summarize today's workspace activity")}
                title="AI: Summarize today's activity"
              >
                ✨ Summarize
              </button>
            </div>

            <div className="activity-feed-list">
              {filteredActivityFeed.length === 0 ? (
                <div className="dash-empty-action-center">
                  <span className="empty-celebrate-icon">🗓️</span>
                  <strong>No activity yet</strong>
                  <p>Submittals, callbacks & follow-ups will show up here as they happen.</p>
                  <div className="empty-suggested-actions">
                    <button type="button" onClick={() => onNavigate && onNavigate('candidates')}>Review Pipeline</button>
                    <button type="button" onClick={() => handleCopilotSend('Draft outreach for passive candidates')}>Generate Outreach</button>
                  </div>
                </div>
              ) : (
                filteredActivityFeed.map((act, i) => {
                  const bucket = getActivityDateBucket(act.timestamp)
                  const showBucket = i === 0 || getActivityDateBucket(filteredActivityFeed[i - 1].timestamp) !== bucket
                  const typeIcon = act.type === 'submission' ? '📤' : act.type === 'callback' ? '📞' : '🔔'
                  return (
                    <div key={act.id}>
                      {showBucket && <div className="activity-feed-group-label">{bucket}</div>}
                      <div className="activity-feed-item interactive-feed-item">
                        <div className="feed-avatar-ring">{act.actor.charAt(0)}</div>
                        <div className="feed-details">
                          <strong>{typeIcon} {act.title}</strong>
                          <span>{act.sub}</span>
                        </div>
                        <div className="feed-hover-actions">
                          <button onClick={() => onNavigate && onNavigate('candidates')} type="button" title="View Candidate">View</button>
                          <button onClick={() => handleCopilotSend(`Summarize activity: ${act.title}`)} type="button" title="AI Summary">AI</button>
                        </div>
                        <span className="feed-time">{formatRelativeTime(act.timestamp)}</span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </Panel>

          {/* Submissions & Activity Trend Chart */}
          <Panel title={`${timeRange === '7d' ? '7-Day' : timeRange === '30d' ? '30-Day' : timeRange === '90d' ? '90-Day' : '7-Day'} Submissions Trend`} subtitle="Submissions and follow-up activities over time">
            <div className="dashboard-chart">
              <ResponsiveContainer width="100%" height="100%">
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
                  <CartesianGrid stroke="rgba(226,232,240,0.6)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} interval={timeRange === '90d' ? 14 : timeRange === '30d' ? 4 : 0} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
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
            </div>
          </Panel>

          {/* Job Donut & Smart AI Workspace Scratchpad */}
          <Panel title="Job Requisitions & Smart AI Workspace" subtitle="Job status breakdown & autosaved call notes">
            <div className="dash-split-panel">
              <div className="donut-column">
                <div className="dashboard-donut compact-donut">
                  {sourceData.length === 0 ? <EmptyLine text="No job data yet" /> : (
                    <>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={sourceData} dataKey="value" nameKey="name" innerRadius={42} outerRadius={64} paddingAngle={4}>
                            {sourceData.map((entry, index) => <Cell key={entry.name} fill={COLORS[index]} />)}
                          </Pie>
                          <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="donut-center-label">
                        <strong>{activeJobsCount}</strong>
                        <span>Active</span>
                      </div>
                    </>
                  )}
                </div>
                {sourceData.length > 0 && (
                  <div className="donut-legend">
                    {sourceData.map((entry, index) => (
                      <span className="donut-legend-item" key={entry.name}>
                        <span className="donut-legend-dot" style={{ background: COLORS[index] }} />
                        {entry.name} <b>{entry.value}</b>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="dashboard-notepad-container">
                <div className="notepad-header">
                  <span className="notepad-title">Smart AI Workspace</span>
                  <span className="notepad-status">● {lastSavedTime}</span>
                </div>
                <textarea
                  value={scratchpad}
                  onChange={handleScratchpadChange}
                  placeholder="Type quick candidate numbers, interview notes, or call snippets here..."
                  className="dashboard-scratchpad"
                />
              </div>
            </div>
          </Panel>
        </div>
      </section>

      {/* SLIDE-OUT RIGHT-SIDE AI COPILOT PANEL WITH 3 WINDOW STATES (EXPANDED, MINIMIZED, CLOSED) */}
      {copilotState === 'closed' && (
        <button className="copilot-floating-trigger-btn" onClick={() => setCopilotState('expanded')} type="button">
          <span className="sparkle">✨</span>
          <span>AI Action Copilot</span>
        </button>
      )}

      {copilotState === 'minimized' && (
        <button className="copilot-minimized-pill-btn" onClick={() => setCopilotState('expanded')} type="button">
          <span className="sparkle-pulse">✨</span>
          <strong>TalentDesk AI Copilot</strong>
          <span className="minimized-status-dot" title="Copilot Active" />
        </button>
      )}

      {(copilotState === 'expanded' || copilotState === 'maximized') && (
        <div className="copilot-slideout-overlay" onClick={() => setCopilotState('minimized')}>
          <div className={`copilot-slideout-panel ${copilotState === 'maximized' ? 'maximized' : ''}`} onClick={e => e.stopPropagation()}>
            {/* ENHANCED COPILOT HEADER WITH NEW CHAT (🧹), MINIMIZE (—), POP-OUT (□), AND CLOSE (×) */}
            <div className="copilot-window-header">
              <div className="title-group">
                <span className="sparkle">✨</span>
                <strong>TalentDesk AI Copilot</strong>
              </div>
              <div className="copilot-header-controls">
                <button 
                  className="header-ctrl-btn new-chat" 
                  onClick={handleNewChat} 
                  type="button" 
                  title="New Chat Session (🧹)"
                >
                  🧹
                </button>
                <button 
                  className="header-ctrl-btn minimize" 
                  onClick={() => setCopilotState('minimized')} 
                  type="button" 
                  title="Minimize to pill (—)"
                >
                  —
                </button>
                <button 
                  className="header-ctrl-btn popout" 
                  onClick={() => setCopilotState(prev => prev === 'maximized' ? 'expanded' : 'maximized')} 
                  type="button" 
                  title={copilotState === 'maximized' ? "Restore floating window (❐)" : "Maximize window (□)"}
                >
                  {copilotState === 'maximized' ? '❐' : '□'}
                </button>
                <button 
                  className="header-ctrl-btn close" 
                  onClick={() => setCopilotState('closed')} 
                  type="button" 
                  title="Close Copilot (×)"
                >
                  ×
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

            {/* SMART ONBOARDING WELCOME STRIP: Hide prompt chips once conversation begins */}
            {copilotMessages.length <= 1 && (
              <div className="copilot-prompts-strip">
                <button onClick={() => !copilotLoading && handleCopilotSend('Close the Senior React Developer job')} disabled={copilotLoading} type="button">
                  Close job
                </button>
                <button onClick={() => !copilotLoading && handleCopilotSend('Log a callback for Alex Rivera')} disabled={copilotLoading} type="button">
                  Log callback
                </button>
                <button onClick={() => !copilotLoading && handleCopilotSend('Create a task to review submittals tomorrow')} disabled={copilotLoading} type="button">
                  Create task
                </button>
              </div>
            )}

            <div className="copilot-input-box">
              <input 
                type="text" 
                placeholder={copilotLoading ? "Processing request..." : "Ask Copilot a question or trigger a CRM action..."} 
                value={copilotQuery} 
                disabled={copilotLoading}
                onChange={e => setCopilotQuery(e.target.value)} 
                onKeyDown={e => e.key === 'Enter' && !copilotLoading && handleCopilotSend()}
              />
              <button onClick={() => handleCopilotSend()} disabled={copilotLoading} type="button">
                {copilotLoading ? '⚡ Working...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CTRL+K COMMAND PALETTE MODAL */}
      {commandOpen && (
        <div className="dash-command-modal-overlay" onClick={() => setCommandOpen(false)}>
          <div className="dash-command-modal-content" onClick={e => e.stopPropagation()}>
            <div className="command-modal-input-row">
              <span className="cmd-icon">🔍</span>
              <input
                type="text"
                placeholder="Type a command or search candidates, jobs, clients... (e.g. 'Find React candidates')"
                value={commandQuery}
                onChange={e => setCommandQuery(e.target.value)}
                autoFocus
              />
              <span className="cmd-esc-tag">ESC</span>
            </div>

            <div className="command-modal-results">
              {commandQuery.trim() === '' ? (
                <div className="command-modal-empty">
                  {recentSearches.length > 0 ? (
                    <>
                      <div className="command-modal-section-label">Recent Searches</div>
                      <div className="command-recent-chips">
                        {recentSearches.map((term, i) => (
                          <button key={i} type="button" className="command-recent-chip" onClick={() => setCommandQuery(term)}>
                            🕐 {term}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <span>Type to search across Candidates, Jobs & Workspace Actions...</span>
                  )}
                </div>
              ) : commandResults.length === 0 ? (
                <div className="command-modal-empty">
                  <span>No matches for "{commandQuery}". Try a candidate name, job title, or action.</span>
                </div>
              ) : (
                commandResults.map((res, i) => {
                  const showLabel = i === 0 || commandResults[i - 1].type !== res.type
                  return (
                    <div key={i}>
                      {showLabel && <div className="command-modal-section-label">{commandGroupLabel[res.type]}</div>}
                      <div
                        className={`command-modal-item ${commandActiveIndex === i ? 'active' : ''}`}
                        onMouseEnter={() => setCommandActiveIndex(i)}
                        onClick={() => runCommandResult(res)}
                      >
                        <strong>{res.title}</strong>
                        <span>{res.meta}</span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* NOTIFICATIONS DRAWER */}
      {showNotifications && (
        <div className="dash-notifications-drawer">
          <div className="notif-drawer-header">
            <strong>Notifications & System Alerts</strong>
            <button onClick={() => setShowNotifications(false)} type="button">×</button>
          </div>
          <div className="notif-drawer-list">
            <div className="notif-item unread">
              <strong>🔔 Priority Focus: {todaysFocus.title}</strong>
              <span>{todaysFocus.desc}</span>
              <small>Live update</small>
            </div>
            <div className="notif-item unread">
              <strong>💼 Active Requisition: {safeJobs[0]?.title || 'Open Requisition'}</strong>
              <span>{safeJobs[0]?.client || 'Client'} • Status: {safeJobs[0]?.status || 'Open'}</span>
              <small>1h ago</small>
            </div>
            <div className="notif-item">
              <strong>✨ AI Insight Generated</strong>
              <span>Pipeline conversion score updated to 18%.</span>
              <small>3h ago</small>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Panel({ title, subtitle, action, children }) {
  return (
    <article className="dashboard-panel">
      <div className="dashboard-panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action && <div className="dashboard-panel-action">{action}</div>}
      </div>
      {children}
    </article>
  )
}

function EmptyLine({ text }) {
  return <div className="dashboard-empty-line">{text}</div>
}

function MarkdownView({ content }) {
  if (typeof content !== 'string') return null
  return <div className="markdown-rendered-view" dangerouslySetInnerHTML={{ __html: simpleMarkdownToHtml(content) }} />
}

function simpleMarkdownToHtml(text = '') {
  if (typeof text !== 'string') return ''
  return text
    .replace(/^### (.*$)/gim, '<h4>$1</h4>')
    .replace(/^## (.*$)/gim, '<h3>$1</h3>')
    .replace(/^# (.*$)/gim, '<h2>$1</h2>')
    .replace(/^\- (.*$)/gim, '<li>$1</li>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br />')
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
