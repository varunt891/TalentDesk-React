import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import * as XLSX from 'xlsx'
import { db } from '../lib/api'
import { useCandidates } from '../hooks/useCandidates'
import { useAuth } from '../context/AuthContext'
import { PageContainer } from '../components/layout/PageContainer'
import { Button, Card, CardHeader, KPICard, PageHeader, Tabs, EmptyState, SearchableSelect, Badge, cn } from '../components/ui'
import { InfoBanner, SuperadminAIUsageSection } from '../components/admin'

import { getUsageSummary, getActionUsageBreakdown, getQualitySummary } from '../lib/ai/usage'
import { CHART_COLORS } from '../lib/chartColors'

const COLORS = CHART_COLORS
const STAGES = ['Submitted', 'Shortlisted', 'Interview Scheduled', 'Interview Done', 'Offer Extended', 'Hired', 'Rejected']
const FUNNEL_STAGES = ['Submitted', 'Shortlisted', 'Interview Scheduled', 'Interview Done', 'Offer Extended', 'Hired']

const PERIODS = [
  { id: 'weekly', label: 'Weekly', days: 7, bucket: 'day' },
  { id: 'monthly', label: 'Monthly', days: 30, bucket: 'week' },
  { id: 'quarterly', label: 'Quarterly', days: 90, bucket: 'week' },
  { id: 'annual', label: 'Annual', days: 365, bucket: 'month' },
]

const REPORT_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'pipeline', label: 'Pipeline & Conversion' },
  { id: 'recruiters', label: 'Recruiters & Teams' },
  { id: 'velocity', label: 'Time & Velocity' },
  { id: 'activity', label: 'Activity & Tasks' },
  { id: 'ai', label: 'AI Usage' },
]

const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-md)' }
const tooltipLabelStyle = { color: 'var(--text)', fontWeight: 700, marginBottom: 4 }
const tooltipItemStyle = { color: 'var(--text2)' }

function dateKey(date) {
  if (!date) return ''
  const d = new Date(date)
  if (isNaN(d.getTime())) return String(date).slice(0, 10)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function monthKey(date) {
  const d = new Date(date)
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function getCandidateDateStr(candidate) {
  if (!candidate) return ''
  if (candidate.submission_date) return candidate.submission_date.slice(0, 10)
  if (candidate.created_at) return dateKey(candidate.created_at)
  return ''
}

function daysAgo(days) {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - days)
  return date
}

function isInRange(value, days) {
  if (!value) return false
  const targetDateStr = value.length >= 10 ? value.slice(0, 10) : dateKey(value)
  const minDateStr = dateKey(daysAgo(days - 1))
  return targetDateStr >= minDateStr
}

function daysBetween(startVal, endVal) {
  if (!startVal || !endVal) return null
  const start = new Date(startVal)
  const end = new Date(endVal)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null
  const diff = Math.round((end.getTime() - start.getTime()) / 86400000)
  return diff >= 0 ? diff : null
}

function average(nums) {
  const valid = nums.filter(n => typeof n === 'number' && !isNaN(n))
  if (!valid.length) return null
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length)
}

function getDescendants(userId, allUsers) {
  if (!userId || !allUsers) return []
  const direct = allUsers.filter(u => u.manager_id === userId)
  let result = [...direct]
  for (const child of direct) result = result.concat(getDescendants(child.id, allUsers))
  return result
}

function todayStr() { return new Date().toISOString().slice(0, 10) }

function taskComputedStatus(t) {
  const status = t.status || 'Pending'
  if (status !== 'Completed' && t.due_date && t.due_date < todayStr()) return 'Overdue'
  return status
}

export default function Reports() {
  const { profile, organization } = useAuth()
  const role = profile?.role || 'recruiter'
  const orgId = organization?.id || profile?.org_id

  const { candidates, loading: candidatesLoading } = useCandidates()
  const [period, setPeriod] = useState('weekly')
  const [activeTab, setActiveTab] = useState('overview')
  const [callbacks, setCallbacks] = useState([])
  const [followups, setFollowups] = useState([])
  const [users, setUsers] = useState([])
  const [jobs, setJobs] = useState([])
  const [tasks, setTasks] = useState([])
  const [dataLoading, setDataLoading] = useState(true)
  const [scope, setScope] = useState({ team: 'all', user: 'all' })

  useEffect(() => {
    setDataLoading(true)
    Promise.all([
      db.from('callbacks').select('*').order('date', { ascending: false }),
      db.from('followups').select('*').order('date', { ascending: false }),
      db.from('profiles').select('*').param('full_org', 'true').order('full_name'),
      db.from('jobs').select('*').order('created_at', { ascending: false }),
      db.from('tasks').select('*').order('created_at', { ascending: false }),
    ]).then(([callbacksRes, followupsRes, usersRes, jobsRes, tasksRes]) => {
      setCallbacks(callbacksRes.data || [])
      setFollowups(followupsRes.data || [])
      setUsers(usersRes.data || [])
      setJobs(jobsRes.data || [])
      setTasks(tasksRes.data || [])
    }).finally(() => setDataLoading(false))
  }, [])

  const isSuperAdmin = ['superadmin', 'SUPERADMIN'].includes(role)
  const isAdmin = ['admin', 'owner', 'ADMIN', 'OWNER'].includes(role)
  const isRM = useMemo(() => {
    if (['recruitment_manager', 'operations_manager'].includes(role)) return true
    if (role === 'manager' && (!profile?.manager_id || users.some(u => u.manager_id === profile?.id && ['manager', 'account_manager', 'recruitment_manager'].includes(u.role)))) return true
    return false
  }, [role, profile, users])

  const isAM = useMemo(() => {
    if (role === 'account_manager') return true
    if (role === 'manager' && !isRM) return true
    return false
  }, [role, isRM])

  const canSeeFullOrg = isSuperAdmin || isAdmin
  const canSeeRM = canSeeFullOrg || isRM
  const profileTeam = profile?.team

  useEffect(() => {
    if (isAM && profileTeam && users.length > 0) {
      setScope(current => ({ ...current, team: profileTeam }))
    }
  }, [isAM, profileTeam, users.length])

  const periodDef = PERIODS.find(p => p.id === period) || PERIODS[0]
  const rangeDays = periodDef.days

  const allOrgUsers = useMemo(() => {
    const userMap = new Map()
    users.forEach(u => { if (u.id || u.full_name || u.email) userMap.set(u.id || u.full_name || u.email, u) })
    candidates.forEach(c => {
      const recName = c.recruiter_name || c.fe_name
      const recId = c.recruiter_id || c.user_id
      if (recName) {
        const existing = Array.from(userMap.values()).find(u => u.full_name === recName || u.id === recId)
        if (!existing) userMap.set(recId || recName, { id: recId || recName, full_name: recName, email: '', role: 'recruiter', team: c.team || null })
      }
    })
    return Array.from(userMap.values())
  }, [users, candidates])

  const rmTreeUsers = useMemo(() => {
    if (!isRM || !profile) return allOrgUsers
    return [profile, ...getDescendants(profile.id, allOrgUsers)]
  }, [isRM, profile, allOrgUsers])

  const scopeUsers = useMemo(() => {
    if (isAM && profile) {
      return allOrgUsers.filter(u => (profileTeam && u.team === profileTeam) || u.manager_id === profile.id || u.id === profile.id)
    }
    const baseUsers = isRM ? rmTreeUsers : allOrgUsers
    if (scope.team === 'all') return baseUsers
    return baseUsers.filter(u => u.team === scope.team)
  }, [scope.team, allOrgUsers, rmTreeUsers, isAM, isRM, profile, profileTeam])

  const teams = useMemo(() => {
    const sourceUsers = isAM ? scopeUsers : (isRM ? rmTreeUsers : allOrgUsers)
    const allTeams = [...new Set(sourceUsers.map(u => u.team).filter(Boolean))].sort()
    if (isAM && profileTeam) return [profileTeam]
    return allTeams
  }, [allOrgUsers, rmTreeUsers, scopeUsers, isAM, isRM, profileTeam])

  const selectedUserDescendants = useMemo(() => {
    if (scope.user === 'all') return null
    const selected = allOrgUsers.find(u => u.id === scope.user)
    if (!selected) return { userIds: new Set([scope.user]), userNames: new Set() }
    const descendants = getDescendants(selected.id, allOrgUsers)
    return {
      userIds: new Set([selected.id, ...descendants.map(u => u.id)]),
      userNames: new Set([selected.full_name, ...descendants.map(u => u.full_name)].filter(Boolean)),
    }
  }, [scope.user, allOrgUsers])

  const scopeUserIds = useMemo(() => new Set(scopeUsers.map(user => user.id)), [scopeUsers])
  const scopeUserNames = useMemo(() => new Set(scopeUsers.map(u => u.full_name || u.email).filter(Boolean)), [scopeUsers])

  const reportCandidates = useMemo(() => {
    return candidates.filter(candidate => {
      const dateStr = getCandidateDateStr(candidate)
      if (!isInRange(dateStr, rangeDays)) return false
      if (scope.user !== 'all' && selectedUserDescendants) {
        const { userIds, userNames } = selectedUserDescendants
        const matchesUser = userIds.has(candidate.user_id) || userIds.has(candidate.recruiter_id)
        const matchesName = userNames.has(candidate.recruiter_name) || userNames.has(candidate.fe_name)
        if (!matchesUser && !matchesName) return false
      }
      if (scope.team !== 'all') {
        return scopeUserIds.has(candidate.user_id) || scopeUserIds.has(candidate.recruiter_id) ||
          scopeUserNames.has(candidate.recruiter_name) || scopeUserNames.has(candidate.fe_name)
      }
      return true
    })
  }, [candidates, rangeDays, scope.team, scope.user, scopeUserIds, scopeUserNames, selectedUserDescendants])

  const itemInScope = useCallback((item, idField = 'user_id') => {
    const id = item[idField]
    if (scope.user !== 'all' && selectedUserDescendants) return selectedUserDescendants.userIds.has(id)
    if (scope.team !== 'all') return scopeUserIds.has(id)
    return true
  }, [scope.team, scope.user, selectedUserDescendants, scopeUserIds])

  const jobInScope = useCallback((job) => {
    if (scope.user !== 'all' && selectedUserDescendants) {
      return selectedUserDescendants.userIds.has(job.user_id) || selectedUserDescendants.userNames.has(job.fe)
    }
    if (scope.team !== 'all') return scopeUserIds.has(job.user_id) || scopeUserNames.has(job.fe)
    return true
  }, [scope.team, scope.user, selectedUserDescendants, scopeUserIds, scopeUserNames])

  const reportCallbacks = useMemo(() => callbacks.filter(cb => isInRange(cb.date, rangeDays) && itemInScope(cb)), [callbacks, itemInScope, rangeDays])
  const reportFollowups = useMemo(() => followups.filter(f => isInRange(f.date, rangeDays) && itemInScope(f)), [followups, itemInScope, rangeDays])
  const reportTasks = useMemo(() => tasks.filter(t => isInRange(t.created_at, rangeDays) && itemInScope(t, 'assigned_to')), [tasks, itemInScope, rangeDays])
  const scopedJobs = useMemo(() => jobs.filter(jobInScope), [jobs, jobInScope])

  const trendData = useMemo(() => {
    const { bucket, days } = periodDef
    if (bucket === 'day') {
      return [...Array(days)].map((_, i) => {
        const date = daysAgo(days - 1 - i)
        const key = dateKey(date)
        return {
          label: date.toLocaleDateString('en-US', { weekday: 'short' }),
          submissions: reportCandidates.filter(c => getCandidateDateStr(c) === key).length,
          callbacks: reportCallbacks.filter(cb => dateKey(cb.date || cb.created_at) === key).length,
          followups: reportFollowups.filter(f => dateKey(f.date || f.created_at) === key).length,
        }
      })
    }
    if (bucket === 'week') {
      const weeks = Math.ceil(days / 7)
      return [...Array(weeks)].map((_, i) => {
        const weeksAgo = weeks - 1 - i
        const end = dateKey(daysAgo(weeksAgo * 7))
        const start = dateKey(daysAgo(weeksAgo * 7 + 6))
        const inBucket = (k) => k && k >= start && k <= end
        return {
          label: daysAgo(weeksAgo * 7).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          submissions: reportCandidates.filter(c => inBucket(getCandidateDateStr(c))).length,
          callbacks: reportCallbacks.filter(cb => inBucket(dateKey(cb.date || cb.created_at))).length,
          followups: reportFollowups.filter(f => inBucket(dateKey(f.date || f.created_at))).length,
        }
      })
    }
    const months = 12
    return [...Array(months)].map((_, i) => {
      const d = new Date()
      d.setDate(1)
      d.setMonth(d.getMonth() - (months - 1 - i))
      const key = monthKey(d)
      return {
        label: d.toLocaleDateString('en-US', { month: 'short' }),
        submissions: reportCandidates.filter(c => monthKey(getCandidateDateStr(c)) === key).length,
        callbacks: reportCallbacks.filter(cb => monthKey(cb.date || cb.created_at) === key).length,
        followups: reportFollowups.filter(f => monthKey(f.date || f.created_at) === key).length,
      }
    })
  }, [periodDef, reportCandidates, reportCallbacks, reportFollowups])

  const pipelineData = useMemo(() => STAGES.map((stage, index) => ({
    stage: stage.replace('Interview ', ''),
    count: reportCandidates.filter(c => c.external_status === stage).length,
    color: COLORS[index % COLORS.length],
  })), [reportCandidates])

  const funnelData = useMemo(() => {
    const total = reportCandidates.length
    return FUNNEL_STAGES.map((stage, i) => {
      const atOrPast = reportCandidates.filter(c => FUNNEL_STAGES.indexOf(c.external_status) >= i).length
      return { stage: stage.replace('Interview ', ''), count: atOrPast, pct: total ? Math.round((atOrPast / total) * 100) : 0 }
    })
  }, [reportCandidates])

  const offerConversion = useMemo(() => {
    const offeredOrPast = reportCandidates.filter(c => ['Offer Extended', 'Hired'].includes(c.external_status)).length
    const hired = reportCandidates.filter(c => c.external_status === 'Hired').length
    return { offeredOrPast, hired, rate: offeredOrPast ? Math.round((hired / offeredOrPast) * 100) : null }
  }, [reportCandidates])

  const recruiterData = useMemo(() => {
    const byRecruiter = new Map()
    reportCandidates.forEach(candidate => {
      const name = candidate.recruiter_name || candidate.fe_name || 'Unassigned'
      const current = byRecruiter.get(name) || { name, submissions: 0, interviews: 0, hires: 0 }
      current.submissions += 1
      if (['Interview Scheduled', 'Interview Done'].includes(candidate.external_status)) current.interviews += 1
      if (candidate.external_status === 'Hired' || candidate.internal_status === 'Hired') current.hires += 1
      byRecruiter.set(name, current)
    })
    return [...byRecruiter.values()].sort((a, b) => b.submissions - a.submissions).slice(0, 8)
  }, [reportCandidates])

  const teamData = useMemo(() => {
    const sourceTeams = scope.team === 'all' ? teams : [scope.team]
    return sourceTeams.map(team => {
      const members = users.filter(user => user.team === team)
      const memberIds = new Set(members.map(user => user.id))
      const memberNames = new Set(members.map(user => user.full_name || user.email).filter(Boolean))
      const owned = reportCandidates.filter(c => memberIds.has(c.user_id) || memberIds.has(c.recruiter_id) || memberNames.has(c.recruiter_name) || memberNames.has(c.fe_name))
      return {
        team, members: members.length, managers: members.filter(u => u.role === 'manager').length,
        submissions: owned.length,
        interviews: owned.filter(c => ['Interview Scheduled', 'Interview Done'].includes(c.external_status)).length,
        hires: owned.filter(c => c.external_status === 'Hired' || c.internal_status === 'Hired').length,
      }
    }).filter(row => row.team)
  }, [reportCandidates, scope.team, teams, users])

  // Time & Velocity — real dates only, disclosed as estimates since there is
  // no stage-transition history; "hired"/"filled" timing is approximated
  // from the record's last-updated timestamp, same honest-proxy pattern
  // used for Pipeline's "Days in Pipeline" in an earlier phase.
  const hireVelocity = useMemo(() => {
    const hired = reportCandidates.filter(c => c.external_status === 'Hired' || c.internal_status === 'Hired')
    const days = hired.map(c => daysBetween(c.submission_date, c.updated_at)).filter(d => d != null)
    return { count: hired.length, avgDays: average(days) }
  }, [reportCandidates])

  const pipelineVelocity = useMemo(() => {
    const active = reportCandidates.filter(c => !['Hired', 'Rejected'].includes(c.external_status))
    const days = active.map(c => daysBetween(c.submission_date, new Date().toISOString())).filter(d => d != null)
    return { count: active.length, avgDays: average(days) }
  }, [reportCandidates])

  const openJobs = useMemo(() => scopedJobs.filter(j => j.status === 'Open')
    .map(j => ({ ...j, ageDays: daysBetween(j.open_date, new Date().toISOString()) }))
    .sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0)), [scopedJobs])

  const jobFillVelocity = useMemo(() => {
    const filled = scopedJobs.filter(j => j.status === 'Filled' && isInRange(j.updated_at, rangeDays))
    const days = filled.map(j => daysBetween(j.open_date, j.updated_at)).filter(d => d != null)
    return { count: filled.length, avgDays: average(days) }
  }, [scopedJobs, rangeDays])

  const callbackMetrics = useMemo(() => {
    const total = reportCallbacks.length
    const done = reportCallbacks.filter(cb => cb.status === 'done').length
    const missed = reportCallbacks.filter(cb => cb.status === 'missed').length
    const pending = reportCallbacks.filter(cb => cb.status === 'pending').length
    return { total, done, missed, pending, rate: total ? Math.round((done / total) * 100) : null }
  }, [reportCallbacks])

  const followupMetrics = useMemo(() => {
    const total = reportFollowups.length
    const resolved = reportFollowups.filter(f => ['done', 'contacted'].includes(f.status)).length
    const overdue = reportFollowups.filter(f => f.status !== 'done' && f.date && f.date < todayStr()).length
    return { total, resolved, overdue, rate: total ? Math.round((resolved / total) * 100) : null }
  }, [reportFollowups])

  const taskMetrics = useMemo(() => {
    const withStatus = reportTasks.map(t => ({ ...t, computedStatus: taskComputedStatus(t) }))
    const total = withStatus.length
    const completed = withStatus.filter(t => t.computedStatus === 'Completed').length
    const overdue = withStatus.filter(t => t.computedStatus === 'Overdue').length
    return { total, completed, overdue, rate: total ? Math.round((completed / total) * 100) : null }
  }, [reportTasks])

  const selectedUser = users.find(user => user.id === scope.user)
  const selectedTeam = scope.team === 'all' ? 'All teams' : scope.team
  const scopeLabel = scope.user !== 'all' ? (selectedUser?.full_name || selectedUser?.email || 'Selected user') : selectedTeam

  const metrics = [
    { label: 'Submissions', value: reportCandidates.length, helper: periodDef.label.toLowerCase(), tone: 'accent', icon: 'send' },
    { label: 'Interviews', value: reportCandidates.filter(c => ['Interview Scheduled', 'Interview Done'].includes(c.external_status)).length, helper: 'client movement', tone: 'ai', icon: 'users' },
    { label: 'Offers / Hires', value: reportCandidates.filter(c => ['Offer Extended', 'Hired'].includes(c.external_status)).length, helper: 'late-stage wins', tone: 'green', icon: 'checkCircle' },
    { label: 'Callbacks', value: reportCallbacks.length, helper: 'logged contacts', tone: 'orange', icon: 'callbacks' },
    { label: 'Follow-ups', value: reportFollowups.length, helper: 'scheduled actions', tone: 'yellow', icon: 'followups' },
    { label: 'Task Completion', value: taskMetrics.rate != null ? `${taskMetrics.rate}%` : '—', helper: `${taskMetrics.completed}/${taskMetrics.total} tasks`, tone: 'red', icon: 'checkCircle' },
  ]

  const loading = candidatesLoading || dataLoading

  const exportReport = () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(metrics), 'Summary')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(pipelineData), 'Pipeline')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(funnelData), 'Funnel')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(recruiterData), 'Recruiters')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(teamData), 'Teams')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(openJobs.map(j => ({ job_id: j.job_id, title: j.title, client: j.client, open_date: j.open_date, age_days: j.ageDays }))), 'Job Aging')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(reportCallbacks), 'Callbacks')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(reportFollowups), 'Followups')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(reportTasks), 'Tasks')
    XLSX.writeFile(workbook, `talentdesk_${period}_${scopeLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_report_${dateKey(new Date())}.xlsx`)
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Reports Studio"
        title={`${periodDef.label} performance report`}
        subtitle={
          canSeeFullOrg
            ? 'Org-wide hiring analytics — filter by team or individual recruiter.'
            : isAM
              ? `Showing your team: ${profile?.team || 'your team'}`
              : 'Your personal performance summary.'
        }
        actions={
          <>
            <div className="flex items-center gap-1 bg-surface2 border border-border rounded-[var(--radius-sm)] p-0.5">
              {PERIODS.map(p => (
                <button
                  key={p.id} type="button" onClick={() => setPeriod(p.id)}
                  className={cn('h-7 px-2.5 rounded-[calc(var(--radius-sm)-2px)] text-xs font-semibold transition-colors duration-[var(--duration-fast)]', period === p.id ? 'bg-accent text-white' : 'text-text3 hover:text-text')}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {canSeeRM && (
              <div className="w-44">
                <SearchableSelect options={teams} value={scope.team} onChange={t => setScope({ team: t, user: 'all' })} allLabel="All Teams" placeholder="Type team name..." fullWidth />
              </div>
            )}
            {isAM && <Badge tone="yellow" size="sm">{profile?.team || 'Your Team'}</Badge>}
            {(canSeeRM || isAM) && (
              <div className="w-48">
                <SearchableSelect options={scopeUsers} value={scope.user} onChange={u => setScope(current => ({ ...current, user: u }))} allLabel={isAM ? 'All Team Recruiters' : 'All Recruiters'} placeholder="Type recruiter name..." fullWidth />
              </div>
            )}
            <Button size="sm" variant="secondary" leftIcon="download" onClick={exportReport}>Export XLSX</Button>
          </>
        }
      />

      <div className="mt-5">
        <Tabs items={REPORT_TABS} value={activeTab} onChange={setActiveTab} />
      </div>

      <div className="pt-6 flex flex-col gap-6">
        {loading ? (
          <div className="text-sm text-text3 py-16 text-center">Loading reports...</div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {metrics.map(m => <KPICard key={m.label} label={m.label} value={m.value} helper={m.helper} tone={m.tone} icon={m.icon} />)}
            </div>

            {activeTab === 'overview' && <OverviewTab trendData={trendData} pipelineData={pipelineData} recruiterData={recruiterData} teamData={teamData} />}
            {activeTab === 'pipeline' && <PipelineTab pipelineData={pipelineData} funnelData={funnelData} offerConversion={offerConversion} />}
            {activeTab === 'recruiters' && <RecruitersTab recruiterData={recruiterData} teamData={teamData} />}
            {activeTab === 'velocity' && <VelocityTab hireVelocity={hireVelocity} pipelineVelocity={pipelineVelocity} openJobs={openJobs} jobFillVelocity={jobFillVelocity} />}
            {activeTab === 'activity' && <ActivityTab callbackMetrics={callbackMetrics} followupMetrics={followupMetrics} taskMetrics={taskMetrics} reportTasks={reportTasks} />}
            {activeTab === 'ai' && <AIUsageTab orgId={orgId} userId={profile?.id} isSuperAdmin={isSuperAdmin} />}

          </>
        )}
      </div>
    </PageContainer>
  )
}

function ReportPanel({ title, subtitle, action, children }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} action={action} />
      {children}
    </Card>
  )
}

// Custom ReferenceDot shape — recharts passes cx/cy directly to a function
// `shape` prop (unlike `label`, which goes through a separate context), so
// this renders both the marker and a pill callout off those coordinates.
function PeakCallout({ cx, cy, value }) {
  if (cx == null || cy == null) return null
  const text = `${value} peak`
  const width = text.length * 6.4 + 20
  return (
    <g>
      <circle cx={cx} cy={cy} r={4} fill="var(--surface)" stroke={COLORS[0]} strokeWidth={2} />
      <g transform={`translate(${cx - width / 2}, ${cy - 32})`}>
        <rect width={width} height={22} rx={11} fill={COLORS[0]} />
        <text x={width / 2} y={15} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">{text}</text>
      </g>
    </g>
  )
}

function OverviewTab({ trendData, pipelineData, recruiterData, teamData }) {
  const hasTrend = trendData.some(d => d.submissions || d.callbacks || d.followups)
  const peakPoint = useMemo(() => {
    if (!trendData.length) return null
    const peak = trendData.reduce((max, d) => (d.submissions > max.submissions ? d : max), trendData[0])
    return peak.submissions > 0 ? peak : null
  }, [trendData])
  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <ReportPanel title="Activity Trend" subtitle="Submissions, callbacks, and follow-ups over time">
        {hasTrend ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 28, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'var(--text3)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text3)', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                <Area type="monotone" dataKey="submissions" name="Submissions" stroke={COLORS[0]} fill={`color-mix(in srgb, ${COLORS[0]} 20%, transparent)`} strokeWidth={2} />
                <Area type="monotone" dataKey="callbacks" name="Callbacks" stroke={COLORS[1]} fill={`color-mix(in srgb, ${COLORS[1]} 14%, transparent)`} strokeWidth={2} />
                <Area type="monotone" dataKey="followups" name="Follow-ups" stroke={COLORS[4]} fill={`color-mix(in srgb, ${COLORS[4]} 14%, transparent)`} strokeWidth={2} />
                {peakPoint && (
                  <ReferenceDot
                    x={peakPoint.label}
                    y={peakPoint.submissions}
                    r={4}
                    ifOverflow="visible"
                    shape={(props) => <PeakCallout {...props} value={peakPoint.submissions} />}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState icon="reports" title="No activity in this period" description="Submissions, callbacks, and follow-ups will chart here once logged." />
        )}
      </ReportPanel>

      <ReportPanel title="Pipeline Snapshot" subtitle="Current external client stage distribution">
        {pipelineData.some(p => p.count > 0) ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pipelineData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="stage" interval={0} angle={-35} textAnchor="end" height={50} tick={{ fill: 'var(--text3)', fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text3)', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {pipelineData.map(item => <Cell key={item.stage} fill={item.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState icon="pipeline" title="No pipeline activity" description="Candidates submitted in this period will appear here by stage." />
        )}
      </ReportPanel>

      <ReportPanel title="Top Recruiters" subtitle="Submissions, interviews, and hires">
        {recruiterData.length === 0 ? <EmptyState title="No recruiter activity in this period" /> : (
          <div className="flex flex-col divide-y divide-border">
            {recruiterData.slice(0, 5).map(row => (
              <div key={row.name} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold text-text truncate">{row.name}</span>
                <span className="text-text3 text-xs whitespace-nowrap">{row.submissions} sub · {row.interviews} int · {row.hires} hire</span>
              </div>
            ))}
          </div>
        )}
      </ReportPanel>

      <ReportPanel title="Team Performance" subtitle="Submissions and outcomes by team">
        {teamData.length === 0 ? <EmptyState title="Assign users to teams to unlock team reporting" /> : (
          <div className="flex flex-col divide-y divide-border">
            {[...teamData].sort((a, b) => b.submissions - a.submissions).slice(0, 5).map(row => (
              <div key={row.team} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold text-text truncate">{row.team}</span>
                <span className="text-text3 text-xs whitespace-nowrap">{row.submissions} sub · {row.interviews} int · {row.hires} hire</span>
              </div>
            ))}
          </div>
        )}
      </ReportPanel>
    </div>
  )
}

function PipelineTab({ pipelineData, funnelData, offerConversion }) {
  return (
    <div className="flex flex-col gap-5">
      <InfoBanner tone="info">
        Candidate source analytics (e.g. LinkedIn, referral, job board) aren't shown because there is no source field on the candidate record yet — this will appear here once that data exists rather than being estimated.
      </InfoBanner>

      <div className="grid lg:grid-cols-2 gap-5">
        <ReportPanel title="Pipeline Movement" subtitle="External client stages for the selected period">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pipelineData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="stage" interval={0} angle={-35} textAnchor="end" height={50} tick={{ fill: 'var(--text3)', fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text3)', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {pipelineData.map(item => <Cell key={item.stage} fill={item.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ReportPanel>

        <ReportPanel title="Offer Conversion" subtitle="Hires as a share of candidates who reached offer stage">
          <div className="flex flex-col items-center justify-center h-64 gap-2">
            <div className="text-4xl font-extrabold text-text font-[var(--mono)]">{offerConversion.rate != null ? `${offerConversion.rate}%` : '—'}</div>
            <div className="text-xs text-text3">{offerConversion.hired} hired of {offerConversion.offeredOrPast} offered</div>
          </div>
        </ReportPanel>
      </div>

      <ReportPanel title="Pipeline Conversion Funnel" subtitle="Share of submitted candidates currently at or past each stage (current-state snapshot, not historical stage-transition tracking)">
        {funnelData.every(f => f.count === 0) ? <EmptyState title="No submissions in this period" /> : (
          <div className="flex flex-col gap-2.5">
            {funnelData.map(f => (
              <div key={f.stage} className="flex items-center gap-3">
                <span className="w-32 shrink-0 text-xs font-semibold text-text2 truncate">{f.stage}</span>
                <div className="flex-1 h-2 rounded-full bg-surface2 overflow-hidden">
                  <div className="h-full bg-accent" style={{ width: `${f.pct}%` }} />
                </div>
                <span className="w-20 shrink-0 text-xs text-text3 text-right">{f.count} ({f.pct}%)</span>
              </div>
            ))}
          </div>
        )}
      </ReportPanel>
    </div>
  )
}

function RecruitersTab({ recruiterData, teamData }) {
  return (
    <div className="flex flex-col gap-5">
      <ReportPanel title="Recruiter Output" subtitle="Submissions, interviews, and hires by recruiter">
        {recruiterData.length === 0 ? <EmptyState title="No recruiter activity in this period" /> : (
          <div className="flex flex-col divide-y divide-border">
            {recruiterData.map(row => (
              <div key={row.name} className="py-2.5 flex items-center justify-between gap-3 flex-wrap">
                <span className="text-sm font-semibold text-text">{row.name}</span>
                <div className="flex items-center gap-2">
                  <Badge tone="accent" size="sm">{row.submissions} submissions</Badge>
                  <Badge tone="ai" size="sm">{row.interviews} interviews</Badge>
                  <Badge tone="green" size="sm">{row.hires} hires</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </ReportPanel>

      <ReportPanel title="Team & User Breakdown" subtitle="Real-time team headcount, leadership distribution, and hiring yield">
        {teamData.length === 0 ? <EmptyState title="No team structure found yet" /> : (
          <div className="grid sm:grid-cols-2 gap-3">
            {[...teamData].sort((a, b) => b.submissions - a.submissions).map((item, index) => {
              const conversionRate = item.submissions > 0 ? Math.round((item.hires / item.submissions) * 100) : 0
              const isTopTeam = index === 0 && item.submissions > 0
              return (
                <div key={item.team} className="rounded-[var(--radius-md)] border border-border p-4 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-extrabold text-white shrink-0" style={{ background: COLORS[index % COLORS.length] }}>
                      {item.team.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-text truncate">{item.team}</span>
                        {isTopTeam && <Badge tone="yellow" size="sm">Top team</Badge>}
                      </div>
                      <div className="text-xs text-text3">{item.members} member{item.members === 1 ? '' : 's'} · {item.managers} manager{item.managers === 1 ? '' : 's'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-surface2 overflow-hidden">
                      <div className="h-full bg-green" style={{ width: `${Math.min(conversionRate, 100)}%` }} />
                    </div>
                    <span className="text-[10px] font-bold text-text3 whitespace-nowrap">{conversionRate}% hire rate</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone="accent" size="sm">{item.submissions} sub</Badge>
                    <Badge tone="ai" size="sm">{item.interviews} int</Badge>
                    <Badge tone="green" size="sm">{item.hires} hire{item.hires === 1 ? '' : 's'}</Badge>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </ReportPanel>
    </div>
  )
}

function VelocityStat({ label, value, helper }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-text3 uppercase tracking-wide">{label}</span>
      <span className="text-2xl font-extrabold text-text font-[var(--mono)]">{value}</span>
      {helper && <span className="text-xs text-text3">{helper}</span>}
    </div>
  )
}

function VelocityTab({ hireVelocity, pipelineVelocity, openJobs, jobFillVelocity }) {
  return (
    <div className="flex flex-col gap-5">
      <InfoBanner tone="info">
        Time-to-Hire and Time-to-Fill are estimated from each record's last-updated timestamp (there is no dedicated "hired at" / "filled at" field), so they approximate rather than precisely measure the moment a stage changed.
      </InfoBanner>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><VelocityStat label="Avg. Time-to-Hire" value={hireVelocity.avgDays != null ? `${hireVelocity.avgDays}d` : '—'} helper={`${hireVelocity.count} hired this period`} /></Card>
        <Card><VelocityStat label="Avg. Time-to-Fill" value={jobFillVelocity.avgDays != null ? `${jobFillVelocity.avgDays}d` : '—'} helper={`${jobFillVelocity.count} jobs filled this period`} /></Card>
        <Card><VelocityStat label="Avg. Days in Pipeline" value={pipelineVelocity.avgDays != null ? `${pipelineVelocity.avgDays}d` : '—'} helper={`${pipelineVelocity.count} active candidates`} /></Card>
        <Card><VelocityStat label="Open Jobs" value={openJobs.length} helper={openJobs.length ? `oldest: ${openJobs[0].ageDays ?? '—'}d` : 'none open'} /></Card>
      </div>

      <ReportPanel title="Job Aging" subtitle="Open requisitions sorted by days since opened">
        {openJobs.length === 0 ? <EmptyState title="No open jobs" description="Job aging will appear here once requisitions are open." /> : (
          <div className="flex flex-col divide-y divide-border">
            {openJobs.slice(0, 12).map(j => (
              <div key={j.id} className="py-2.5 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-text truncate">{j.title || j.job_id || 'Untitled role'}</div>
                  <div className="text-xs text-text3 truncate">{j.client || 'No client'}</div>
                </div>
                <Badge tone={j.ageDays != null && j.ageDays > 30 ? 'red' : j.ageDays != null && j.ageDays > 14 ? 'yellow' : 'green'} size="sm">
                  {j.ageDays != null ? `${j.ageDays}d open` : 'Unknown age'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </ReportPanel>
    </div>
  )
}

function MetricBlock({ rows }) {
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map(r => (
        <div key={r.label} className="flex items-center justify-between text-sm">
          <span className="text-text2">{r.label}</span>
          <span className="font-bold text-text">{r.value}</span>
        </div>
      ))}
    </div>
  )
}

function ActivityTab({ callbackMetrics, followupMetrics, taskMetrics, reportTasks }) {
  const tasksWithStatus = reportTasks.map(t => ({ ...t, computedStatus: taskComputedStatus(t) }))
  return (
    <div className="grid lg:grid-cols-3 gap-5">
      <ReportPanel title="Callback Metrics" subtitle="Contact completion for the selected period">
        <MetricBlock rows={[
          { label: 'Total logged', value: callbackMetrics.total },
          { label: 'Completed', value: callbackMetrics.done },
          { label: 'Missed', value: callbackMetrics.missed },
          { label: 'Pending', value: callbackMetrics.pending },
          { label: 'Completion rate', value: callbackMetrics.rate != null ? `${callbackMetrics.rate}%` : '—' },
        ]} />
      </ReportPanel>

      <ReportPanel title="Follow-up Metrics" subtitle="Candidate follow-through for the selected period">
        <MetricBlock rows={[
          { label: 'Total scheduled', value: followupMetrics.total },
          { label: 'Resolved', value: followupMetrics.resolved },
          { label: 'Overdue', value: followupMetrics.overdue },
          { label: 'Resolution rate', value: followupMetrics.rate != null ? `${followupMetrics.rate}%` : '—' },
        ]} />
      </ReportPanel>

      <ReportPanel title="Task Completion" subtitle="Recruiting tasks created in the selected period">
        <MetricBlock rows={[
          { label: 'Total tasks', value: taskMetrics.total },
          { label: 'Completed', value: taskMetrics.completed },
          { label: 'Overdue', value: taskMetrics.overdue },
          { label: 'Completion rate', value: taskMetrics.rate != null ? `${taskMetrics.rate}%` : '—' },
        ]} />
      </ReportPanel>

      <div className="lg:col-span-3">
        <ReportPanel title="Recent Tasks" subtitle="Latest tasks in scope for this period">
          {tasksWithStatus.length === 0 ? <EmptyState title="No tasks in this period" /> : (
            <div className="flex flex-col divide-y divide-border">
              {tasksWithStatus.slice(0, 10).map(t => (
                <div key={t.id} className="py-2.5 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-text truncate">{t.title}</div>
                    <div className="text-xs text-text3 truncate">{t.assigned_to_name || 'Unassigned'}</div>
                  </div>
                  <Badge tone={t.computedStatus === 'Completed' ? 'green' : t.computedStatus === 'Overdue' ? 'red' : t.computedStatus === 'In Progress' ? 'accent' : 'neutral'} size="sm">
                    {t.computedStatus}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </ReportPanel>
      </div>
    </div>
  )
}

function AIUsageTab({ orgId, userId, isSuperAdmin }) {
  const [viewMode, setViewMode] = useState(isSuperAdmin ? 'platform' : 'local')
  const summary = useMemo(() => getUsageSummary(orgId, userId), [orgId, userId])
  const quality = useMemo(() => getQualitySummary(orgId, userId), [orgId, userId])
  const actions = useMemo(() => getActionUsageBreakdown(orgId, userId), [orgId, userId])

  if (isSuperAdmin && viewMode === 'platform') {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center bg-surface2 p-3 rounded-[var(--radius-md)] border border-border">
          <div className="flex items-center gap-2">
            <Badge tone="ai" size="sm">Superadmin Mode</Badge>
            <span className="text-xs text-text2 font-semibold">Viewing Real Platform-Wide AI Analytics</span>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setViewMode('local')}
          >
            Switch to Local Device View
          </Button>
        </div>

        <SuperadminAIUsageSection />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {isSuperAdmin && (
        <div className="flex justify-between items-center bg-surface2 p-3 rounded-[var(--radius-md)] border border-border">
          <span className="text-xs text-text2">Currently viewing local browser usage.</span>
          <Button
            size="sm"
            variant="primary"
            onClick={() => setViewMode('platform')}
          >
            Switch to Platform AI Usage (Superadmin)
          </Button>
        </div>
      )}

      <InfoBanner tone="info">
        AI usage is logged locally to this browser (per user, per organization) rather than in a shared database table, so these numbers reflect your own usage on this device — not the whole organization's. For org-wide AI governance and settings, see Settings → AI; for the full analytics surface, see the AI Center's Analytics tab.
      </InfoBanner>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><VelocityStat label="Requests Today" value={summary.requestsToday} helper={`${summary.totalRequests} all-time`} /></Card>
        <Card><VelocityStat label="Requests This Week" value={summary.requestsThisWeek} /></Card>
        <Card><VelocityStat label="Success Rate" value={quality.successRate != null ? `${quality.successRate}%` : '—'} helper={`${quality.failedRequests} failed`} /></Card>
        <Card><VelocityStat label="Est. Time Saved" value={`${summary.estimatedMinutesSaved}m`} helper="heuristic, not measured" /></Card>
      </div>

      <ReportPanel title="Most Used AI Actions" subtitle="Your action usage on this device">
        {actions.length === 0 ? <EmptyState icon="sparkles" title="No AI actions logged yet" description="Use AI actions across TalentDesk to see a breakdown here." /> : (
          <div className="flex flex-col divide-y divide-border">
            {actions.slice(0, 8).map(a => (
              <div key={a.action} className="py-2 flex items-center justify-between text-sm">
                <span className="text-text2 capitalize">{a.action}</span>
                <span className="font-bold text-text">{a.count}</span>
              </div>
            ))}
          </div>
        )}
      </ReportPanel>
    </div>
  )
}

