import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { db } from '../lib/api'
import { PageContainer } from '../components/layout/PageContainer'
import {
  Button, Badge, StatusPill, Card, CardHeader, KPICard, PageHeader, Modal, Input, Select,
  SearchableSelect, Textarea, FormField, Icon, Avatar, Menu, MenuTrigger, EmptyState, CollapsibleSection, cn, useToast,
} from '../components/ui'
import { WorkspaceSearch, FilterWorkspace, EntityDrawer } from '../components/workspace'
import { Drawer } from '../components/ui/Modal'
import AIInsightCard from '../components/ai/AIInsightCard'
import { useAISetContext } from '../lib/ai/context'
import { useAIGovernance } from '../lib/ai/governance'

const CATEGORIES = ['Daily Calls', 'Submissions', 'Sourcing', 'Outreach', 'Interviews', 'Offers', 'Follow-up', 'Client Meeting', 'Custom']
const PRIORITIES = ['High', 'Medium', 'Low']
const STATUSES = ['Pending', 'In Progress', 'Completed', 'Overdue']
const STATUS_TONE = { Pending: 'neutral', 'In Progress': 'accent', Completed: 'green', Overdue: 'red' }
const CATEGORY_ICON = { 'Daily Calls': 'callbacks', Submissions: 'jobs', Sourcing: 'search', Outreach: 'mail', Interviews: 'calendar', Offers: 'reports', 'Follow-up': 'followups', 'Client Meeting': 'users', Custom: 'tasks' }

const todayStr = () => new Date().toISOString().slice(0, 10)
function isToday(d) { return Boolean(d) && String(d).slice(0, 10) === todayStr() }
function daysUntil(dateStr) {
  if (!dateStr) return null
  const diff = (new Date(dateStr).getTime() - new Date(todayStr()).getTime()) / 86400000
  return Math.round(diff)
}
function relativeDue(dateStr) {
  const d = daysUntil(dateStr)
  if (d === null) return 'No due date'
  if (d === 0) return 'Due today'
  if (d === 1) return 'Due tomorrow'
  if (d < 0) return `${Math.abs(d)}d overdue`
  if (d < 7) return `Due in ${d}d`
  return `Due ${dateStr}`
}
function relativeTime(dateStr) {
  if (!dateStr) return '—'
  const diff = (new Date().getTime() - new Date(dateStr).getTime()) / 86400000
  const d = Math.max(0, Math.floor(diff))
  if (d === 0) return 'Today'
  if (d === 1) return 'Yesterday'
  if (d < 7) return `${d}d ago`
  return `${Math.floor(d / 7)}w ago`
}

const initialFilters = {
  category: [], priority: [], status: [], recruiter: [], assignedBy: [], job: [],
  dueBefore: '', dueToday: false, dueThisWeek: false, completedToday: false,
}
const emptyForm = { title: '', category: 'Daily Calls', assigned_to: '', priority: 'Medium', due_date: todayStr(), target_value: '', req_id: '', description: '' }

export default function TasksPage({ onNavigate }) {
  const { user, profile, organization } = useAuth()
  const orgId = organization?.id || profile?.org_id
  const userId = user?.id
  const { settings: aiSettings } = useAIGovernance(orgId)
  const aiEnabled = aiSettings.workspaces.tasks !== false
  const isManager = ['admin', 'superadmin', 'manager'].includes(profile?.role)

  const [tasks, setTasks] = useState([])
  const [profiles, setProfiles] = useState([])
  const [jobs, setJobs] = useState([])
  const [commentsMap, setCommentsMap] = useState({})
  const [loading, setLoading] = useState(true)

  // Real supporting data so the header/insights can reflect the whole daily
  // workload, not just Task rows — same cross-page pattern as Pipeline.
  const [candidates, setCandidates] = useState([])
  const [callbacks, setCallbacks] = useState([])
  const [followups, setFollowups] = useState([])

  const fetchAll = () => {
    setLoading(true)
    Promise.all([
      db.from('tasks').select('*').order('created_at', { ascending: false }),
      db.from('profiles').select('*').order('full_name'),
      db.from('jobs').select('*'),
      db.from('task_comments').select('*').order('created_at', { ascending: true }),
      db.from('candidates').select('*'),
      db.from('callbacks').select('*'),
      db.from('followups').select('*'),
    ]).then(([tasksRes, profilesRes, jobsRes, commentsRes, candRes, cbRes, fuRes]) => {
      setTasks(tasksRes.data || [])
      setProfiles(profilesRes.data || [])
      setJobs(jobsRes.data || [])
      const map = {}
      ;(commentsRes.data || []).forEach(c => {
        if (!map[c.task_id]) map[c.task_id] = []
        map[c.task_id].push(c)
      })
      setCommentsMap(map)
      setCandidates(candRes.data || [])
      setCallbacks(cbRes.data || [])
      setFollowups(fuRes.data || [])
    }).catch(err => console.error('[TasksPage] load error', err))
      .finally(() => setLoading(false))
  }
  useEffect(() => { fetchAll() }, [])

  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState(initialFilters)
  const [showDetailId, setShowDetailId] = useState(null)
  const [previewTab, setPreviewTab] = useState('overview')
  const { toast: pushToast } = useToast()
  // See Candidates.jsx for why this delegates to the shared toast instead of
  // a locally-rendered fixed div: a page-nested toast can get trapped behind
  // the floating Copilot launcher's stacking context; the shared one portals
  // straight to document.body and doesn't have that problem.
  const showToast = (msg, type = 'success') => pushToast({ tone: type === 'error' ? 'error' : 'success', title: msg })

  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState('')
  const [formErrors, setFormErrors] = useState({})
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState(null)
  const [reassignFor, setReassignFor] = useState(null)
  const [reassignTo, setReassignTo] = useState('')
  const [newCommentText, setNewCommentText] = useState('')
  const [commentSubmitting, setCommentSubmitting] = useState(false)

  // Preserve the exact computed-status / target-progress logic from the
  // previous Tasks page — only the presentation layer changes this phase.
  const processedTasks = useMemo(() => tasks.map(t => {
    let computedStatus = t.status || 'Pending'
    if (computedStatus !== 'Completed' && t.due_date && t.due_date < todayStr()) computedStatus = 'Overdue'
    const isTarget = t.target_value !== null && t.target_value !== undefined && t.target_value > 0
    const progressPct = isTarget
      ? Math.min(100, Math.round(((t.current_progress || 0) / t.target_value) * 100))
      : (computedStatus === 'Completed' ? 100 : computedStatus === 'In Progress' ? 50 : 0)
    return { ...t, computedStatus, isTarget, progressPct }
  }), [tasks])

  const teamProfileIds = useMemo(() => new Set(profiles.map(p => p.id)), [profiles])
  const scopedTasks = useMemo(() => processedTasks.filter(t => {
    if (profile?.role === 'manager') return teamProfileIds.has(t.assigned_to) || teamProfileIds.has(t.assigned_by)
    if (!isManager) return t.assigned_to === user?.id || t.assigned_by === user?.id
    return true
  }), [processedTasks, profile, isManager, user, teamProfileIds])

  const categoryOptions = useMemo(() => { const v = [...new Set(tasks.map(t => t.category).filter(Boolean))].sort(); return v.length ? v : CATEGORIES }, [tasks])
  const assignedByOptions = useMemo(() => [...new Set(tasks.map(t => t.assigned_by_name).filter(Boolean))].sort(), [tasks])
  const recruiterFilterOptions = useMemo(() => profiles.map(p => ({ value: p.id, label: p.full_name || p.email })), [profiles])
  const jobFilterOptions = useMemo(() => jobs.map(j => ({ value: j.id, label: j.title || j.job_id || 'Untitled' })), [jobs])

  const filtered = useMemo(() => scopedTasks.filter(t => {
    const q = search.toLowerCase()
    if (q && !`${t.title} ${t.description || ''} ${t.assigned_to_name || ''} ${t.category}`.toLowerCase().includes(q)) return false
    if (filters.category.length && !filters.category.includes(t.category)) return false
    if (filters.priority.length && !filters.priority.includes(t.priority)) return false
    if (filters.status.length && !filters.status.includes(t.computedStatus)) return false
    if (filters.recruiter.length && !filters.recruiter.includes(t.assigned_to)) return false
    if (filters.assignedBy.length && !filters.assignedBy.includes(t.assigned_by_name)) return false
    if (filters.job.length && !filters.job.includes(t.req_id)) return false
    if (filters.dueBefore && (!t.due_date || t.due_date > filters.dueBefore)) return false
    if (filters.dueToday && !isToday(t.due_date)) return false
    if (filters.dueThisWeek) {
      const d = daysUntil(t.due_date)
      if (d === null || d < 0 || d > 7) return false
    }
    if (filters.completedToday && !(t.computedStatus === 'Completed' && isToday(t.updated_at))) return false
    return true
  }), [scopedTasks, search, filters])

  const hasFilters = Boolean(search) || Object.values(filters).some(v => Array.isArray(v) ? v.length > 0 : Boolean(v))
  const clearFilters = () => { setSearch(''); setFilters(initialFilters) }

  const filterDefs = [
    { key: 'category', label: 'Task Type', type: 'multiselect', options: categoryOptions },
    { key: 'priority', label: 'Priority', type: 'multiselect', options: PRIORITIES },
    { key: 'status', label: 'Status', type: 'multiselect', options: STATUSES },
    ...(isManager ? [{ key: 'recruiter', label: 'Recruiter', type: 'multiselect', options: recruiterFilterOptions }] : []),
    { key: 'job', label: 'Job', type: 'multiselect', options: jobFilterOptions },
    ...(isManager ? [{ key: 'assignedBy', label: 'Created By', type: 'multiselect', options: assignedByOptions }] : []),
    { key: 'dueBefore', label: 'Due Before', type: 'date' },
  ]
  const filterPresets = [
    { label: "Today's Work", values: { dueToday: true } },
    { label: 'Overdue', values: { status: ['Overdue'] } },
    { label: 'High Priority', values: { priority: ['High'] } },
    { label: 'Interview Tasks', values: { category: ['Interviews'] } },
    { label: 'Follow-ups', values: { category: ['Follow-up'] } },
    { label: 'Callbacks', values: { category: ['Daily Calls'] } },
    { label: 'Completed Today', values: { completedToday: true } },
    { label: 'This Week', values: { dueThisWeek: true } },
  ]

  // Section splits — filters/search narrow within each, the sections
  // themselves are the "what needs attention" structure.
  const todayFocus = filtered.filter(t => t.computedStatus !== 'Completed' && t.computedStatus !== 'Overdue' && isToday(t.due_date))
  const overdueList = filtered.filter(t => t.computedStatus === 'Overdue')
  const upcomingList = filtered.filter(t => t.computedStatus !== 'Completed' && t.computedStatus !== 'Overdue' && t.due_date && t.due_date > todayStr())
  const unscheduledList = filtered.filter(t => t.computedStatus !== 'Completed' && !t.due_date)
  const completedTodayList = filtered.filter(t => t.computedStatus === 'Completed' && isToday(t.updated_at))

  const myTargetTasks = useMemo(() => processedTasks
    .filter(t => t.isTarget && t.assigned_to === user?.id && t.computedStatus !== 'Completed')
    .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999')), [processedTasks, user])

  // Header KPIs — every number derived from real Task/Candidate/Callback/
  // Followup rows. No "Emails Sent" card: there is no email-log table to
  // derive it from, so it is intentionally omitted rather than fabricated.
  const kpis = useMemo(() => {
    const dueToday = scopedTasks.filter(t => t.computedStatus !== 'Completed' && isToday(t.due_date)).length
    const completedToday = scopedTasks.filter(t => t.computedStatus === 'Completed' && isToday(t.updated_at)).length
    const overdue = scopedTasks.filter(t => t.computedStatus === 'Overdue').length
    const total = scopedTasks.length
    const completedTotal = scopedTasks.filter(t => t.computedStatus === 'Completed').length
    const taskCompletionPct = total ? Math.round((completedTotal / total) * 100) : 100

    const myCandidates = isManager ? candidates : candidates.filter(c => c.user_id === user?.id)
    const upcomingInterviews = myCandidates.filter(c => c.interview_date && c.interview_date >= todayStr()).length

    const myFollowups = isManager ? followups : followups.filter(f => f.user_id === user?.id)
    const pendingFollowups = myFollowups.filter(f => f.status !== 'Completed' && f.date && f.date <= todayStr()).length

    const myCallbacks = isManager ? callbacks : callbacks.filter(cb => cb.user_id === user?.id)
    const callsCompletedToday = myCallbacks.filter(cb => cb.status === 'Completed' && isToday(cb.date)).length

    const submissionsToday = myCandidates.filter(c => isToday(c.submission_date)).length
    const submissionTarget = processedTasks.find(t => t.isTarget && t.assigned_to === user?.id && t.category === 'Submissions' && t.computedStatus !== 'Completed')

    const targetTasks = processedTasks.filter(t => t.isTarget && (isManager || t.assigned_to === user?.id) && t.computedStatus !== 'Completed')
    const avgTargetPct = targetTasks.length ? Math.round(targetTasks.reduce((s, t) => s + t.progressPct, 0) / targetTasks.length) : null
    const productivityPct = avgTargetPct !== null ? Math.round(taskCompletionPct * 0.5 + avgTargetPct * 0.5) : taskCompletionPct

    return { dueToday, completedToday, overdue, upcomingInterviews, pendingFollowups, submissionsToday, submissionTarget, callsCompletedToday, productivityPct }
  }, [scopedTasks, candidates, followups, callbacks, isManager, user, processedTasks])

  useAISetContext({ workspace: 'Tasks & Targets', tasksDueToday: kpis.dueToday, tasksOverdue: kpis.overdue, currentRecruiter: profile?.full_name || user?.email })

  // Productivity Insights — real derived callouts only, clickable to filter
  // or jump to the relevant workspace. Never fabricated.
  const insights = useMemo(() => {
    const list = []
    const staleOverdue = scopedTasks.filter(t => t.computedStatus === 'Overdue' && Math.abs(daysUntil(t.due_date) || 0) > 3)
    if (staleOverdue.length) list.push({ id: 'stale', tone: 'red', icon: 'alertCircle', text: `${staleOverdue.length} task${staleOverdue.length === 1 ? '' : 's'} overdue more than 3 days`, setStatus: ['Overdue'] })

    const awaitingCallback = candidates.filter(c => c.followup_date && c.followup_date <= todayStr() && !['Hired', 'Rejected'].includes(c.external_status))
    if (awaitingCallback.length) list.push({ id: 'awaiting', tone: 'yellow', icon: 'callbacks', text: `${awaitingCallback.length} candidate${awaitingCallback.length === 1 ? '' : 's'} awaiting callback`, navigate: 'callbacks' })

    const interviewsToday = candidates.filter(c => isToday(c.interview_date))
    if (interviewsToday.length) list.push({ id: 'interviewsToday', tone: 'ai', icon: 'calendar', text: `${interviewsToday.length} interview${interviewsToday.length === 1 ? '' : 's'} scheduled today`, navigate: 'pipeline' })

    const pendingSubmissions = scopedTasks.filter(t => t.category === 'Submissions' && t.computedStatus !== 'Completed')
    if (pendingSubmissions.length) list.push({ id: 'subs', tone: 'accent', icon: 'jobs', text: `${pendingSubmissions.length} submission task${pendingSubmissions.length === 1 ? '' : 's'} pending`, setCategory: ['Submissions'] })

    const inactiveJobs = jobs.filter(j => (j.status || 'Open') === 'Open' && !candidates.some(c => c.job_id === j.job_id))
    if (inactiveJobs.length) list.push({ id: 'inactiveJobs', tone: 'yellow', icon: 'jobs', text: `${inactiveJobs.length} open job${inactiveJobs.length === 1 ? '' : 's'} with no candidate activity`, navigate: 'jobs' })

    if (isManager) {
      const byRecruiter = {}
      scopedTasks.filter(t => t.computedStatus === 'Overdue' && t.assigned_to).forEach(t => {
        if (!byRecruiter[t.assigned_to]) byRecruiter[t.assigned_to] = { name: t.assigned_to_name || 'Recruiter', count: 0 }
        byRecruiter[t.assigned_to].count++
      })
      const behind = Object.entries(byRecruiter).filter(([, v]) => v.count >= 3).sort((a, b) => b[1].count - a[1].count)
      if (behind.length) list.push({ id: 'behind', tone: 'red', icon: 'users', text: `${behind[0][1].name} has ${behind[0][1].count} overdue tasks`, recruiterId: behind[0][0] })
    }

    return list
  }, [scopedTasks, candidates, jobs, isManager])

  const handleInsightClick = (insight) => {
    if (insight.recruiterId) return setFilters(f => ({ ...f, recruiter: [insight.recruiterId] }))
    if (insight.setStatus) return setFilters(f => ({ ...f, status: insight.setStatus }))
    if (insight.setCategory) return setFilters(f => ({ ...f, category: insight.setCategory }))
    if (insight.navigate) return onNavigate?.(insight.navigate)
  }

  const recentActivity = useMemo(() => {
    const items = []
    scopedTasks.filter(t => t.computedStatus === 'Completed').forEach(t => items.push({ id: `t-${t.id}`, icon: 'checkCircle', tone: 'green', date: t.updated_at, text: `Completed "${t.title}"`, by: t.assigned_to_name }))
    Object.values(commentsMap).flat().forEach(c => {
      const task = tasks.find(t => t.id === c.task_id)
      if (task) items.push({ id: `c-${c.id}`, icon: 'edit', tone: 'accent', date: c.created_at, text: `${c.user_name || 'Someone'} noted on "${task.title}"`, by: c.user_name })
    })
    return items.filter(i => i.date).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8)
  }, [scopedTasks, commentsMap, tasks])

  // Track only the id — deriving the task object from processedTasks below
  // keeps the open drawer live as tasks state changes (progress, status).
  const showDetail = useMemo(() => showDetailId ? (processedTasks.find(t => String(t.id) === String(showDetailId)) || null) : null, [showDetailId, processedTasks])
  const openDrawer = (t, tab = 'overview') => { setShowDetailId(t.id); setPreviewTab(tab) }

  const openCreate = () => {
    setForm({ ...emptyForm, assigned_to: !isManager ? (user?.id || '') : '' })
    setEditingId(null)
    setFormError('')
    setFormErrors({})
    setShowForm(true)
  }
  const openEdit = (t) => {
    setForm({
      title: t.title || '', category: t.category || 'Custom', assigned_to: t.assigned_to || '',
      priority: t.priority || 'Medium', due_date: t.due_date || todayStr(),
      target_value: t.target_value != null ? String(t.target_value) : '', req_id: t.req_id || '', description: t.description || '',
    })
    setEditingId(t.id)
    setFormError('')
    setFormErrors({})
    setShowForm(true)
    setShowDetailId(null)
  }

  const handleSaveTask = async () => {
    const errs = {}
    if (!form.title.trim()) errs.title = 'Task title is required'
    if (!form.assigned_to) errs.assigned_to = 'Please assign this task to a recruiter'
    if (Object.keys(errs).length > 0) {
      setFormErrors(errs)
      setFormError(errs.title || errs.assigned_to)
      showToast(errs.title || errs.assigned_to, 'error')
      return
    }
    setFormError('')
    setFormErrors({})
    setSaving(true)

    const assignedProfile = profiles.find(p => p.id === form.assigned_to)
    const payload = {
      ...form,
      title: form.title.trim(),
      target_value: form.target_value ? parseInt(form.target_value, 10) : null,
      assigned_to_name: assignedProfile ? (assignedProfile.full_name || assignedProfile.email) : 'Recruiter',
      assigned_by: user?.id || null,
      assigned_by_name: profile?.full_name || profile?.email || 'Manager',
    }

    if (editingId) {
      const { error } = await db.from('tasks').update(payload).eq('id', editingId)
      setSaving(false)
      if (error) {
        setFormError(error.message)
        return showToast(error.message, 'error')
      }
      setTasks(prev => prev.map(t => String(t.id) === String(editingId) ? { ...t, ...payload } : t))
      if (payload.assigned_to && payload.assigned_to !== user?.id) {
        db.from('notifications').insert({ user_id: payload.assigned_to, title: '📝 Task Updated', message: `${payload.assigned_by_name} updated task: "${payload.title}"`, link: '/tasks' }).catch(() => {})
      }
      showToast('Task updated!')
    } else {
      const fullPayload = { ...payload, status: 'Pending', current_progress: 0 }
      const { data, error } = await db.from('tasks').insert(fullPayload)
      setSaving(false)
      if (error) {
        setFormError(error.message)
        return showToast(error.message, 'error')
      }
      const created = Array.isArray(data) ? data[0] : (data && data.id ? data : { ...fullPayload, id: Date.now() })
      if (created) setTasks(prev => [created, ...prev])
      if (fullPayload.assigned_to && fullPayload.assigned_to !== user?.id) {
        db.from('notifications').insert({ user_id: fullPayload.assigned_to, title: '🎯 New Task Assigned', message: `${fullPayload.assigned_by_name} assigned you a new task: "${fullPayload.title}"`, link: '/tasks' }).catch(() => {})
      }
      showToast('✓ Task created successfully!')
    }
    setShowForm(false)
  }

  const handleStatusChange = async (taskId, newStatus) => {
    const target = tasks.find(t => String(t.id) === String(taskId))
    if (!target) return
    const targetVal = target.target_value ? parseInt(target.target_value, 10) : null
    const updates = {
      status: newStatus,
      current_progress: newStatus === 'Completed' && targetVal ? targetVal : (target.current_progress || 0)
    }
    setTasks(prev => prev.map(t => String(t.id) === String(taskId) ? { ...t, ...updates } : t))
    await db.from('tasks').update(updates).eq('id', taskId)
    showToast(`Status updated to "${newStatus}"!`)
    if (newStatus === 'Completed' && target.assigned_by && target.assigned_by !== user?.id) {
      db.from('notifications').insert({ user_id: target.assigned_by, title: '✅ Task Completed', message: `${target.assigned_to_name || 'A recruiter'} completed task: "${target.title}"`, link: '/tasks' }).catch(() => {})
    }
  }
  const toggleComplete = (t) => handleStatusChange(t.id, t.computedStatus === 'Completed' ? 'Pending' : 'Completed')

  const handleIncrementProgress = async (taskId, delta) => {
    const target = tasks.find(t => String(t.id) === String(taskId))
    if (!target) return
    const targetVal = target.target_value ? parseInt(target.target_value, 10) : 0
    const rawProgress = (parseInt(target.current_progress, 10) || 0) + delta
    const newProgress = targetVal > 0 ? Math.min(targetVal, Math.max(0, rawProgress)) : Math.max(0, rawProgress)
    if (targetVal > 0 && (target.current_progress || 0) >= targetVal && delta > 0) {
      return showToast('Target goal already reached!')
    }
    const isCompleted = targetVal > 0 && newProgress >= targetVal
    const newStatus = isCompleted ? 'Completed' : (newProgress > 0 ? 'In Progress' : (target.status || 'Pending'))
    const updates = { current_progress: newProgress, status: newStatus }
    setTasks(prev => prev.map(t => String(t.id) === String(taskId) ? { ...t, ...updates } : t))
    await db.from('tasks').update(updates).eq('id', taskId)
    showToast(`Progress: ${newProgress}${targetVal ? ` / ${targetVal}` : ''}`)
  }

  const setPriority = async (t, priority) => {
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, priority } : x))
    await db.from('tasks').update({ priority }).eq('id', t.id)
  }

  const openReassign = (t) => { setReassignFor(t); setReassignTo(t.assigned_to || '') }
  const saveReassign = async () => {
    if (!reassignFor) return
    const p = profiles.find(pr => pr.id === reassignTo)
    const updates = { assigned_to: reassignTo, assigned_to_name: p ? (p.full_name || p.email) : 'Recruiter' }
    setTasks(prev => prev.map(t => t.id === reassignFor.id ? { ...t, ...updates } : t))
    await db.from('tasks').update(updates).eq('id', reassignFor.id)
    showToast('Recruiter reassigned!')
    setReassignFor(null)
  }

  const confirmDelete = async () => {
    await db.from('tasks').delete().eq('id', deleteId)
    setTasks(prev => prev.filter(t => t.id !== deleteId))
    showToast('Task deleted', 'error')
    setDeleteId(null)
    setShowDetailId(null)
  }

  const handleAddComment = async (e) => {
    e.preventDefault()
    if (!showDetail || !newCommentText.trim()) return
    setCommentSubmitting(true)
    const payload = { task_id: showDetail.id, user_id: user?.id || null, user_name: profile?.full_name || profile?.email || 'User', comment: newCommentText.trim() }
    try {
      const res = await db.from('task_comments').insert(payload)
      const created = Array.isArray(res.data) ? res.data[0] : res.data
      setCommentsMap(prev => ({ ...prev, [showDetail.id]: [...(prev[showDetail.id] || []), created || payload] }))
      setNewCommentText('')
    } catch (err) {
      console.error(err)
    } finally {
      setCommentSubmitting(false)
    }
  }

  // Kebab menu + right-click context menu share one item list, same pattern
  // established in the Pipeline workspace.
  const actionsFor = (t) => {
    const job = t.req_id ? jobs.find(j => j.id === t.req_id) : null
    return [
      { label: 'Open Details', icon: 'eye', onClick: () => openDrawer(t) },
      { label: t.computedStatus === 'Completed' ? 'Reopen' : 'Mark Complete', icon: 'checkCircle', onClick: () => toggleComplete(t) },
      'divider',
      { label: 'Set Priority: High', icon: 'alertCircle', onClick: () => setPriority(t, 'High') },
      { label: 'Set Priority: Medium', icon: 'alertCircle', onClick: () => setPriority(t, 'Medium') },
      { label: 'Set Priority: Low', icon: 'alertCircle', onClick: () => setPriority(t, 'Low') },
      'divider',
      { label: 'Add Note', icon: 'edit', onClick: () => openDrawer(t, 'notes') },
      { label: 'Edit', icon: 'edit', onClick: () => openEdit(t) },
      ...(isManager ? [{ label: 'Reassign', icon: 'users', onClick: () => openReassign(t) }] : []),
      ...(job ? [{ label: 'Open Job', icon: 'jobs', onClick: () => onNavigate?.('jobs') }] : []),
      ...(isManager ? ['divider', { label: 'Delete', icon: 'trash', danger: true, onClick: () => setDeleteId(t.id) }] : []),
    ]
  }

  const [contextMenu, setContextMenu] = useState(null)
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    document.addEventListener('mousedown', close)
    document.addEventListener('scroll', close, true)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('scroll', close, true) }
  }, [contextMenu])
  const openContextMenu = (e, t) => { e.preventDefault(); setContextMenu({ task: t, x: e.clientX, y: e.clientY }) }

  const detailComments = showDetail ? (commentsMap[showDetail.id] || []) : []
  const inp = (field) => ({ value: form[field], onChange: e => setForm(f => ({ ...f, [field]: e.target.value })) })

  const briefingContent = [
    `Tasks due today: ${todayFocus.length}`,
    ...todayFocus.slice(0, 8).map(t => `- [${t.priority}] ${t.title} (${t.category})`),
    `Overdue tasks: ${overdueList.length}`,
    ...overdueList.slice(0, 8).map(t => `- [${t.priority}] ${t.title} (${t.category}, ${relativeDue(t.due_date)})`),
    `Upcoming interviews: ${kpis.upcomingInterviews}`,
    `Pending follow-ups: ${kpis.pendingFollowups}`,
    myTargetTasks.length ? `Active targets: ${myTargetTasks.map(t => `${t.category} ${t.current_progress || 0}/${t.target_value}`).join(', ')}` : 'No active targets assigned.',
  ].join('\n')

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Recruiting Workspace"
        title="Tasks & Targets"
        subtitle="Your daily command center — what's due, what's overdue, and whether you're on pace."
        actions={<Button variant="primary" leftIcon="plus" onClick={openCreate}>New Task</Button>}
        search={<WorkspaceSearch value={search} onChange={setSearch} storageKey="td_tasks" placeholder="Title, description, recruiter..." />}
        filters={
          <FilterWorkspace filters={filterDefs} values={filters} onChange={(key, value) => setFilters(f => ({ ...f, [key]: value }))} onReset={clearFilters} presets={filterPresets} storageKey="tasks" />
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 my-5">
        <KPICard label="Due Today" value={kpis.dueToday} helper="active tasks" tone="accent" icon="calendar" />
        <KPICard label="Completed Today" value={kpis.completedToday} helper="nice work" tone="green" icon="checkCircle" />
        <KPICard label="Overdue" value={kpis.overdue} helper="needs attention" tone="red" icon="alertCircle" />
        <KPICard label="Upcoming Interviews" value={kpis.upcomingInterviews} helper="scheduled" tone="ai" icon="calendar" />
        <KPICard label="Pending Follow-ups" value={kpis.pendingFollowups} helper="due or overdue" tone="yellow" icon="followups" />
        <KPICard label="Submissions Today" value={kpis.submissionsToday} helper={kpis.submissionTarget ? `of ${kpis.submissionTarget.target_value} target` : 'no target set'} tone="accent" icon="jobs" />
        <KPICard label="Calls Completed" value={kpis.callsCompletedToday} helper="today" tone="accent" icon="callbacks" />
        <KPICard label="Productivity" value={`${kpis.productivityPct}%`} helper="tasks + targets blend" tone={kpis.productivityPct >= 70 ? 'green' : kpis.productivityPct >= 40 ? 'yellow' : 'red'} icon="trendUp" />
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

      {aiEnabled && !hasFilters && (todayFocus.length > 0 || overdueList.length > 0) && (
        <div className="mb-4">
          <AIInsightCard
            orgId={orgId} userId={userId} source="tasks"
            title="AI Daily Briefing" icon="sparkles" actionId="recommend" cta="Generate today's briefing"
            content={briefingContent}
            context="Give a 3-4 sentence daily briefing: what to prioritize first, what's at risk, and a realistic order of attack for today's work. Be direct and specific to the tasks listed."
          />
        </div>
      )}

      {hasFilters && (
        <div className="flex items-center justify-between mb-3 -mt-1">
          <span className="text-xs text-text3">{filtered.length} of {scopedTasks.length} tasks match your search/filters</span>
          <button type="button" onClick={clearFilters} className="text-xs font-semibold text-text3 hover:text-red">Clear all</button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        {/* Main productivity column */}
        <div className="xl:col-span-2 flex flex-col gap-4 min-w-0">
          <CollapsibleSection title="Today's Focus" subtitle="Due today, not yet done" count={todayFocus.length} tone="accent" loading={loading}>
            {todayFocus.length === 0 ? <EmptyState icon="checkCircle" title="Nothing due today" description="You're clear — check Upcoming for what's next." /> : (
              <div className="flex flex-col gap-2">{todayFocus.map(t => <TaskCard key={t.id} t={t} onOpen={() => openDrawer(t)} onToggleComplete={() => toggleComplete(t)} onContextMenu={(e) => openContextMenu(e, t)} actionsFor={actionsFor} jobs={jobs} onIncrementProgress={(delta) => handleIncrementProgress(t.id, delta)} />)}</div>
            )}
          </CollapsibleSection>

          <CollapsibleSection title="Overdue" subtitle="Past due date" count={overdueList.length} tone="red" loading={loading}>
            {overdueList.length === 0 ? <EmptyState icon="checkCircle" title="No overdue tasks" description="Great pace — nothing has slipped." /> : (
              <div className="flex flex-col gap-2">{overdueList.map(t => <TaskCard key={t.id} t={t} onOpen={() => openDrawer(t)} onToggleComplete={() => toggleComplete(t)} onContextMenu={(e) => openContextMenu(e, t)} actionsFor={actionsFor} jobs={jobs} onIncrementProgress={(delta) => handleIncrementProgress(t.id, delta)} />)}</div>
            )}
          </CollapsibleSection>

          <CollapsibleSection title="Upcoming" subtitle="Due after today" count={upcomingList.length + unscheduledList.length} tone="neutral" loading={loading} defaultOpen={false}>
            {upcomingList.length === 0 && unscheduledList.length === 0 ? <EmptyState icon="calendar" title="Nothing scheduled ahead" /> : (
              <div className="flex flex-col gap-2">
                {upcomingList.map(t => <TaskCard key={t.id} t={t} onOpen={() => openDrawer(t)} onToggleComplete={() => toggleComplete(t)} onContextMenu={(e) => openContextMenu(e, t)} actionsFor={actionsFor} jobs={jobs} onIncrementProgress={(delta) => handleIncrementProgress(t.id, delta)} />)}
                {unscheduledList.map(t => <TaskCard key={t.id} t={t} onOpen={() => openDrawer(t)} onToggleComplete={() => toggleComplete(t)} onContextMenu={(e) => openContextMenu(e, t)} actionsFor={actionsFor} jobs={jobs} onIncrementProgress={(delta) => handleIncrementProgress(t.id, delta)} />)}
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection title="Completed Today" subtitle="Recent wins" count={completedTodayList.length} tone="green" loading={loading} defaultOpen={false}>
            {completedTodayList.length === 0 ? <EmptyState icon="checkCircle" title="Nothing completed yet today" /> : (
              <div className="flex flex-col gap-2">{completedTodayList.map(t => <TaskCard key={t.id} t={t} onOpen={() => openDrawer(t)} onToggleComplete={() => toggleComplete(t)} onContextMenu={(e) => openContextMenu(e, t)} actionsFor={actionsFor} jobs={jobs} onIncrementProgress={(delta) => handleIncrementProgress(t.id, delta)} />)}</div>
            )}
          </CollapsibleSection>
        </div>

        {/* Right rail: targets + activity */}
        <div className="flex flex-col gap-4 min-w-0">
          <Card>
            <CardHeader title="My Targets" subtitle="Live progress toward assigned goals" />
            {myTargetTasks.length === 0 ? (
              <EmptyState icon="reports" title="No active targets" description="Ask your manager to assign one, or create your own." />
            ) : (
              <div className="flex flex-col gap-3.5">
                {myTargetTasks.map(t => (
                  <div key={t.id} className="rounded-[var(--radius-md)] bg-surface2 border border-border p-3">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-xs font-bold text-text truncate">{t.title}</span>
                      <Badge size="sm" tone="accent">{t.category}</Badge>
                    </div>
                    <div className="h-1.5 bg-surface3 rounded-full overflow-hidden mb-1.5">
                      <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${t.progressPct}%` }} />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-text3">
                      <span>{t.current_progress || 0} / {t.target_value} ({t.progressPct}%)</span>
                      <span>{relativeDue(t.due_date)}</span>
                    </div>
                    <div className="flex gap-1.5 mt-2">
                      <Button size="sm" variant="secondary" disabled={Boolean(t.target_value && (t.current_progress || 0) >= t.target_value)} onClick={() => handleIncrementProgress(t.id, 1)}>+1</Button>
                      <Button size="sm" variant="secondary" disabled={Boolean(t.target_value && (t.current_progress || 0) >= t.target_value)} onClick={() => handleIncrementProgress(t.id, 5)}>+5</Button>
                      <Button size="sm" variant="ghost" className="ml-auto" onClick={() => openDrawer(t)}>Details</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Recent Activity" subtitle="Completions and notes" />
            {recentActivity.length === 0 ? (
              <EmptyState icon="clock" title="No recent activity" />
            ) : (
              <div className="flex flex-col gap-2.5">
                {recentActivity.map(item => (
                  <div key={item.id} className="flex items-start gap-2.5">
                    <span className={cn('w-6 h-6 rounded-full flex items-center justify-center shrink-0', item.tone === 'green' ? 'bg-green/10 text-green' : 'bg-accent/10 text-accent')}>
                      <Icon name={item.icon} size={12} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-text2 leading-snug truncate">{item.text}</p>
                      <span className="text-[10px] text-text3">{item.by} · {relativeTime(item.date)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="fixed min-w-[190px] max-h-[min(70vh,360px)] overflow-y-auto bg-surface border border-border rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] p-1.5 flex flex-col gap-0.5"
          style={{ top: contextMenu.y, left: contextMenu.x, zIndex: 'var(--z-dropdown)' }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {actionsFor(contextMenu.task).map((item, i) => item === 'divider' ? (
            <div key={i} className="h-px bg-border my-1" />
          ) : (
            <button key={item.label} type="button" onClick={() => { item.onClick?.(); setContextMenu(null) }} className={cn('flex items-center gap-2 px-2.5 py-2 rounded-[var(--radius-sm)] text-sm font-medium text-left transition-colors duration-[var(--duration-fast)]', item.danger ? 'text-red hover:bg-red/10' : 'text-text hover:bg-surface2')}>
              {item.icon && <Icon name={item.icon} size={13} />}
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* Task preview drawer */}
      {showDetail && (
        <EntityDrawer
          open={!!showDetail}
          onClose={() => setShowDetailId(null)}
          eyebrow={showDetail.category}
          title={showDetail.title}
          subtitle={showDetail.assigned_to_name ? `Assigned to ${showDetail.assigned_to_name}` : undefined}
          status={<StatusPill status={showDetail.computedStatus} tone={STATUS_TONE[showDetail.computedStatus] || 'neutral'} size="sm" />}
          size="lg"
          tabs={[{ id: 'overview', label: 'Overview' }, { id: 'notes', label: 'Notes', count: detailComments.length }]}
          activeTab={previewTab}
          onTabChange={setPreviewTab}
          actions={
            <div className="flex items-center gap-2">
              <Menu
                align="end"
                trigger={({ toggle }) => (
                  <Button variant="secondary" leftIcon="checkCircle" onClick={(e) => { e.stopPropagation(); toggle() }}>
                    Status: {showDetail.computedStatus}
                  </Button>
                )}
                items={STATUSES.filter(s => s !== 'Overdue').map(s => ({
                  label: s,
                  onClick: () => handleStatusChange(showDetail.id, s)
                }))}
              />
              <Button variant="secondary" leftIcon="edit" onClick={() => openEdit(showDetail)}>Edit</Button>
            </div>
          }
        >
          {previewTab === 'overview' && (
            <div className="flex flex-col gap-4">
              {showDetail.isTarget && (
                <Card className="bg-surface2 border-border">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-accent uppercase tracking-wide">Target Progress</span>
                    <Badge tone="accent">{showDetail.progressPct}%</Badge>
                  </div>
                  <div className="h-2 bg-surface3 rounded-full overflow-hidden mb-2">
                    <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${showDetail.progressPct}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-xs text-text3 mb-3">
                    <span>{showDetail.current_progress || 0} / {showDetail.target_value}</span>
                    <span>{relativeDue(showDetail.due_date)}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" disabled={Boolean(showDetail.target_value && (showDetail.current_progress || 0) >= showDetail.target_value)} onClick={() => handleIncrementProgress(showDetail.id, 1)}>+1</Button>
                    <Button size="sm" variant="secondary" disabled={Boolean(showDetail.target_value && (showDetail.current_progress || 0) >= showDetail.target_value)} onClick={() => handleIncrementProgress(showDetail.id, 5)}>+5</Button>
                  </div>
                </Card>
              )}

              <div className="grid sm:grid-cols-2 gap-3">
                <DetailCard title="Task" rows={[['Type', showDetail.category], ['Priority', showDetail.priority], ['Status', showDetail.computedStatus], ['Due', showDetail.due_date || 'No due date']]} />
                <DetailCard title="Ownership" rows={[['Assigned To', showDetail.assigned_to_name], ['Assigned By', showDetail.assigned_by_name], ['Related Job', jobs.find(j => j.id === showDetail.req_id)?.title]]} />
              </div>

              <Card>
                <CardHeader title="Description" />
                <p className="text-sm text-text2 leading-relaxed">{showDetail.description || 'No description provided.'}</p>
              </Card>
            </div>
          )}

          {previewTab === 'notes' && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                {detailComments.length === 0 ? (
                  <EmptyState icon="edit" title="No notes yet" description="Log progress updates or context for this task." />
                ) : detailComments.map(c => (
                  <div key={c.id} className="rounded-[var(--radius-md)] border border-border bg-surface2 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-xs font-bold text-text">{c.user_name || 'Recruiter'}</strong>
                      <span className="text-[11px] text-text3 shrink-0">{new Date(c.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-xs text-text2 mt-1">{c.comment}</p>
                  </div>
                ))}
              </div>
              <form onSubmit={handleAddComment} className="flex gap-2">
                <Input value={newCommentText} onChange={e => setNewCommentText(e.target.value)} placeholder="Add a note..." className="flex-1" />
                <Button type="submit" variant="primary" loading={commentSubmitting} disabled={!newCommentText.trim()}>Post</Button>
              </form>
            </div>
          )}
        </EntityDrawer>
      )}

      {/* Create / edit task */}
      <Drawer
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editingId ? 'Edit Task' : 'New Task / Target'}
        size="lg"
        footer={
          <div className="flex items-center justify-between w-full">
            {formError ? (
              <span className="text-xs font-semibold text-red flex items-center gap-1.5 animate-in fade-in duration-200">
                <Icon name="alertCircle" size={14} className="shrink-0" />
                {formError}
              </span>
            ) : <span />}
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button variant="primary" loading={saving} onClick={handleSaveTask}>
                {editingId ? 'Save Changes' : 'Create Task'}
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-3.5">
          {formError && (
            <div className="p-3 rounded-[var(--radius-md)] bg-red/10 border border-red/30 text-red text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200">
              <Icon name="alertCircle" size={14} className="shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <FormField label="Task Title" required error={formErrors.title}>
            <Input
              value={form.title}
              onChange={e => {
                setForm(f => ({ ...f, title: e.target.value }))
                if (formErrors.title) {
                  setFormErrors(prev => ({ ...prev, title: '' }))
                  if (!formErrors.assigned_to) setFormError('')
                }
              }}
              placeholder="e.g. Complete 15 phone screens for Senior DevOps req"
              className={formErrors.title ? 'border-red/60 focus:border-red ring-1 ring-red/30' : ''}
            />
          </FormField>
          <div className="grid sm:grid-cols-2 gap-3.5">
            <FormField label="Task Type"><Select value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))} options={CATEGORIES.map(c => ({ value: c, label: c }))} /></FormField>
            <FormField label="Priority"><Select value={form.priority} onChange={v => setForm(f => ({ ...f, priority: v }))} options={PRIORITIES.map(p => ({ value: p, label: p }))} /></FormField>
            <FormField label="Assign To" required error={formErrors.assigned_to}>
              <SearchableSelect
                options={profiles.map(p => ({ id: p.id, name: p.full_name || p.email, role: p.role, email: p.email }))}
                value={form.assigned_to || 'all'}
                onChange={v => {
                  const val = v === 'all' ? '' : v
                  setForm(f => ({ ...f, assigned_to: val }))
                  if (formErrors.assigned_to) {
                    setFormErrors(prev => ({ ...prev, assigned_to: '' }))
                    if (!formErrors.title) setFormError('')
                  }
                }}
                allLabel="-- Select recruiter --"
              />
            </FormField>
            <FormField label="Due Date"><Input {...inp('due_date')} type="date" /></FormField>
            <FormField label="Target Value (optional)"><Input {...inp('target_value')} type="number" min="1" placeholder="e.g. 10 calls/submissions" /></FormField>
            <FormField label="Related Job (optional)">
              <SearchableSelect options={jobs.map(j => ({ id: j.id, name: j.title || j.job_id || 'Untitled', role: j.client }))} value={form.req_id || 'all'} onChange={v => setForm(f => ({ ...f, req_id: v === 'all' ? '' : v }))} allLabel="-- None / general task --" />
            </FormField>
          </div>
          <FormField label="Description"><Textarea {...inp('description')} rows={4} placeholder="Context, candidate requirements, expectations..." /></FormField>
        </div>
      </Drawer>

      {/* Reassign */}
      <Modal
        open={!!reassignFor}
        onClose={() => setReassignFor(null)}
        size="sm"
        title={reassignFor ? `Reassign — ${reassignFor.title}` : 'Reassign'}
        footer={<><Button variant="ghost" onClick={() => setReassignFor(null)}>Cancel</Button><Button variant="primary" onClick={saveReassign}>Reassign</Button></>}
      >
        <FormField label="Recruiter">
          <SearchableSelect options={profiles.map(p => ({ id: p.id, name: p.full_name || p.email, role: p.role, email: p.email }))} value={reassignTo || 'all'} onChange={v => setReassignTo(v === 'all' ? '' : v)} allLabel="-- Select recruiter --" />
        </FormField>
      </Modal>

      {/* Delete confirm */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} size="sm" title="Delete task?" footer={<><Button variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button><Button variant="danger" onClick={confirmDelete}>Delete</Button></>}>
        <p className="text-sm text-text3">This cannot be undone.</p>
      </Modal>

    </PageContainer>
  )
}


function TaskCard({ t, onOpen, onToggleComplete, onContextMenu, actionsFor, jobs, onIncrementProgress }) {
  const job = t.req_id ? jobs.find(j => j.id === t.req_id) : null
  const isOverdue = t.computedStatus === 'Overdue'
  return (
    <div
      tabIndex={0}
      onClick={onOpen}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); if (e.key.toLowerCase() === 'c') { e.stopPropagation(); onToggleComplete() } }}
      className="group relative flex items-start gap-3 rounded-[var(--radius-md)] border border-border bg-surface2 px-3 py-2.5 cursor-pointer transition-all duration-[var(--duration-fast)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] hover:border-accent/40 outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleComplete() }}
        aria-label={t.computedStatus === 'Completed' ? 'Reopen task' : 'Mark complete'}
        className={cn('mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors duration-[var(--duration-fast)]', t.computedStatus === 'Completed' ? 'bg-green border-green text-white' : 'border-text3/50 hover:border-accent')}
      >
        {t.computedStatus === 'Completed' && <Icon name="check" size={11} />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap mb-1">
          <Badge size="sm" tone="ai"><Icon name={CATEGORY_ICON[t.category] || 'tasks'} size={9} />{t.category}</Badge>
          <Badge size="sm" tone={t.priority === 'High' ? 'red' : t.priority === 'Low' ? 'neutral' : 'yellow'}>{t.priority}</Badge>
          {t.computedStatus !== 'Pending' && <StatusPill status={t.computedStatus} tone={STATUS_TONE[t.computedStatus] || 'neutral'} size="sm" />}
        </div>
        <strong className={cn('text-[13px] font-bold text-text block truncate', t.computedStatus === 'Completed' && 'line-through text-text3')}>{t.title}</strong>
        {t.description && <p className="text-[11px] text-text3 mt-0.5 line-clamp-2">{t.description}</p>}

        {t.isTarget && (
          <div className="mt-2.5 p-2 rounded-[var(--radius-sm)] bg-surface3/40 border border-border/50 max-w-sm">
            <div className="flex items-center justify-between text-[11px] font-semibold text-text2 mb-1">
              <span>Target Progress: <strong className="text-text">{t.current_progress || 0} / {t.target_value}</strong></span>
              <span className="text-accent font-bold">{t.progressPct}%</span>
            </div>
            <div className="h-1.5 bg-surface3 rounded-full overflow-hidden mb-2">
              <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${t.progressPct}%` }} />
            </div>
            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <Button size="xs" variant="secondary" disabled={Boolean(t.target_value && (t.current_progress || 0) >= t.target_value)} onClick={(e) => { e.stopPropagation(); onIncrementProgress?.(1) }}>+1 Progress</Button>
              <Button size="xs" variant="secondary" disabled={Boolean(t.target_value && (t.current_progress || 0) >= t.target_value)} onClick={(e) => { e.stopPropagation(); onIncrementProgress?.(5) }}>+5 Progress</Button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2.5 flex-wrap mt-2 text-[10.5px] text-text3">
          {t.assigned_to_name && <span className="inline-flex items-center gap-1"><Avatar name={t.assigned_to_name} size="xs" />{t.assigned_to_name}</span>}
          <span className={isOverdue ? 'text-red font-semibold' : ''}>{relativeDue(t.due_date)}</span>
          {job && <span className="truncate max-w-[140px]"><Icon name="jobs" size={10} className="inline mr-0.5 -mt-0.5" />{job.title}</span>}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Menu align="end" trigger={(p) => <span onClick={(e) => e.stopPropagation()}><MenuTrigger {...p} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" /></span>} items={actionsFor(t)} />
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
